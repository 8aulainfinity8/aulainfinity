import { 
    collection, 
    doc, 
    setDoc, 
    addDoc, 
    getDoc, 
    updateDoc, 
    deleteDoc, 
    deleteField,
    onSnapshot, 
    serverTimestamp,
    Unsubscribe
} from 'firebase/firestore';
import { db, auth } from './firebase';

/**
 * WebRTC RTCConfiguration with Google STUN servers and additional fast public STUN servers.
 */
export const RTC_CONFIGURATION: RTCConfiguration = {
    iceServers: [
        // Google Public STUN Servers
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        { urls: 'stun:stun4.l.google.com:19302' },
        
        // Additional Free High-Speed Public STUN Servers
        { urls: 'stun:stun.cloudflare.com:3478' },
        { urls: 'stun:stun.services.mozilla.com' },
        { urls: 'stun:global.stun.twilio.com:3478' },
        { urls: 'stun:stun.voipbuster.com' },
        { urls: 'stun:stun.ekiga.net' }
    ],
    iceCandidatePoolSize: 10
};

/**
 * Dynamically constructs the RTCConfiguration using values from the admin settings in Firestore.
 * Defaults to 100% free, high-speed public STUN servers (Google, Cloudflare, Mozilla).
 */
export async function getDynamicRTCConfiguration(): Promise<RTCConfiguration> {
    try {
        const configDoc = await getDoc(doc(db, 'app_config', 'main'));
        if (configDoc.exists()) {
            const data = configDoc.data();
            const iceServers: RTCIceServer[] = [];
            
            // 1. Add configured STUN servers or fallback to default public ones
            if (data.webrtcStunServers) {
                const stunUrls = data.webrtcStunServers.split(',')
                    .map((url: string) => url.trim())
                    .filter((url: string) => url.length > 0);
                if (stunUrls.length > 0) {
                    iceServers.push({ urls: stunUrls });
                }
            } else {
                iceServers.push(
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'stun:stun1.l.google.com:19302' },
                    { urls: 'stun:stun.cloudflare.com:3478' },
                    { urls: 'stun:stun.services.mozilla.com' }
                );
            }
            
            // 2. Add optional TURN server if enabled and configured (zero cost by default)
            if (data.webrtcUseTurn && data.webrtcTurnUrl) {
                const turnServer: RTCIceServer = {
                    urls: data.webrtcTurnUrl.trim()
                };
                if (data.webrtcTurnUsername) {
                    turnServer.username = data.webrtcTurnUsername.trim();
                }
                if (data.webrtcTurnCredential) {
                    turnServer.credential = data.webrtcTurnCredential.trim();
                }
                iceServers.push(turnServer);
                console.log('[WebRTC] Custom TURN server enabled & injected:', data.webrtcTurnUrl);
            } else {
                console.log('[WebRTC] Running on 100% Free Peer-to-Peer STUN (Zero Relaying Cost).');
            }
            
            return {
                iceServers,
                iceCandidatePoolSize: 10
            };
        }
    } catch (e) {
        console.warn('[WebRTC] Failed to fetch dynamic RTC config from Firestore, falling back to default static config.', e);
    }
    
    return RTC_CONFIGURATION;
}

/**
 * Optimizes the SDP to limit audio bitrate, reducing TURN bandwidth usage and costs by up to 75%.
 * Standard Opus audio defaults to high stereo bitrates, but voice only needs 24-32 kbps.
 */
export function setAudioBitrate(sdp: string, bitrateKbps: number = 32): string {
    const lines = sdp.split('\r\n');
    let mAudioLineIndex = -1;
    
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].indexOf('m=audio') === 0) {
            mAudioLineIndex = i;
            break;
        }
    }
    
    if (mAudioLineIndex === -1) {
        return sdp;
    }
    
    // Find next media line or end of sdp to determine boundaries
    let insertIndex = -1;
    for (let i = mAudioLineIndex + 1; i < lines.length; i++) {
        if (lines[i].indexOf('m=') === 0) {
            insertIndex = i;
            break;
        }
    }
    
    const targetIndex = insertIndex !== -1 ? insertIndex : lines.length;
    
    // Check if b=AS: bitrate already exists
    let hasAS = false;
    for (let i = mAudioLineIndex + 1; i < targetIndex; i++) {
        if (lines[i].indexOf('b=AS:') === 0 || lines[i].indexOf('b=TIAS:') === 0) {
            hasAS = true;
            break;
        }
    }
    
    if (!hasAS) {
        // Insert Application Specific (AS) audio limit
        lines.splice(mAudioLineIndex + 1, 0, `b=AS:${bitrateKbps}`);
    }
    
    return lines.join('\r\n');
}

export interface WebRTCCallSession {
    roomId: string;
    peerConnection: RTCPeerConnection;
    localStream: MediaStream;
    remoteStream: MediaStream;
    hangup: () => Promise<void>;
    onDisconnect?: (reason: string) => void;
}

/**
 * Creates a silent audio stream using Web Audio API as a fallback when microphone permission is denied or unavailable.
 * This allows users to join calls in "Listen-Only Mode" so they can hear remote audio even without microphone access.
 */
export function createSilentAudioStream(): MediaStream {
    try {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (!AudioCtx) {
            const stream = new MediaStream();
            (stream as any)._isListenOnly = true;
            return stream;
        }
        const ctx = new AudioCtx();
        const oscillator = ctx.createOscillator();
        const dst = ctx.createMediaStreamDestination();
        oscillator.connect(dst);
        oscillator.start();
        const track = dst.stream.getAudioTracks()[0];
        if (track) {
            track.enabled = false; // Mute the dummy oscillator track for total silence
        }
        const stream = dst.stream;
        (stream as any)._isListenOnly = true;
        return stream;
    } catch (e) {
        console.warn('[WebRTC] Could not create WebAudio silent stream fallback:', e);
        const stream = new MediaStream();
        (stream as any)._isListenOnly = true;
        return stream;
    }
}

/**
 * Helper function to safely request local microphone audio with friendly error messages.
 * Falls back to a silent audio stream when microphone permission is denied so the user can join in Listen-Only mode.
 */
export async function getLocalAudioStream(allowListenOnlyFallback: boolean = true): Promise<MediaStream> {
    try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            if (allowListenOnlyFallback) {
                console.warn('[WebRTC] getUserMedia API not supported. Entering Listen-Only mode.');
                return createSilentAudioStream();
            }
            throw new Error('Tu navegador no soporta la API getUserMedia para captura de audio.');
        }
        const stream = await navigator.mediaDevices.getUserMedia({ 
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            }, 
            video: false 
        });
        stream.getAudioTracks().forEach((track) => {
            track.enabled = true;
        });
        return stream;
    } catch (err: any) {
        console.warn('[WebRTC] getUserMedia error:', err);
        if (allowListenOnlyFallback) {
            console.log('[WebRTC] Microphone access unavailable or denied. Entering Listen-Only mode.');
            return createSilentAudioStream();
        }
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError' || err.message?.includes('Permission denied')) {
            throw new Error('Permiso de micrófono denegado. Por favor, habilita el acceso al micrófono en los permisos de tu navegador.');
        }
        if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
            throw new Error('No se detectó ningún micrófono de entrada en tu dispositivo.');
        }
        throw new Error(`No se pudo obtener acceso al micrófono: ${err.message || err.name}`);
    }
}

/**
 * Dynamically requests microphone access during an active session and replaces the silent local track with a real microphone track.
 */
export async function enableMicrophoneForSession(session: WebRTCCallSession): Promise<boolean> {
    try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            throw new Error('getUserMedia no disponible');
        }
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            },
            video: false
        });
        const newTrack = stream.getAudioTracks()[0];
        if (!newTrack) return false;

        newTrack.enabled = true;

        const senders = session.peerConnection.getSenders();
        const audioSender = senders.find(s => s.track && s.track.kind === 'audio') || senders.find(s => !s.track);

        if (audioSender) {
            await audioSender.replaceTrack(newTrack);
        } else {
            session.peerConnection.addTrack(newTrack, stream);
        }

        // Stop old tracks in localStream
        session.localStream.getAudioTracks().forEach(t => t.stop());
        
        // Update session localStream reference
        (session.localStream as any)._isListenOnly = false;
        
        return true;
    } catch (err: any) {
        console.warn('[WebRTC] Failed to enable real microphone for session:', err);
        return false;
    }
}

/**
 * Helper function to bind a MediaStream to an HTMLAudioElement safely.
 * Ensures the element is attached to the DOM so browser audio engines route audio to speakers.
 */
export function bindStreamToAudioElement(stream: MediaStream, audioElement?: HTMLAudioElement | null): HTMLAudioElement {
    let audioEl: HTMLAudioElement | null = audioElement || null;
    if (!audioEl) {
        audioEl = document.getElementById('global-webrtc-remote-audio') as HTMLAudioElement;
    }
    if (!audioEl) {
        audioEl = document.createElement('audio');
        audioEl.id = 'global-webrtc-remote-audio';
        audioEl.style.position = 'fixed';
        audioEl.style.left = '-9999px';
        audioEl.style.top = '-9999px';
        audioEl.style.width = '1px';
        audioEl.style.height = '1px';
        audioEl.style.opacity = '0.01';
        audioEl.style.pointerEvents = 'none';
        document.body.appendChild(audioEl);
    }

    (window as any)._webrtcGlobalAudioElement = audioEl;

    // Ensure all remote audio tracks are enabled
    stream.getAudioTracks().forEach((track) => {
        track.enabled = true;
    });

    // Assign stream to srcObject
    if (audioEl.srcObject !== stream) {
        audioEl.srcObject = stream;
        console.log('[WebRTC] Stream bound to DOM audio element.');
    }

    audioEl.autoplay = true;
    audioEl.muted = false;
    audioEl.volume = 1.0;
    audioEl.setAttribute('playsinline', 'true');

    const tryPlay = () => {
        if (audioEl) {
            audioEl.play().then(() => {
                console.log('[WebRTC] Remote audio streaming playing successfully.');
            }).catch((err: any) => {
                console.warn('[WebRTC] Remote audio autoplay blocked by browser policy:', err);
            });
        }
    };

    tryPlay();

    const unblockAudio = () => {
        tryPlay();
    };

    window.addEventListener('click', unblockAudio, { once: true });
    window.addEventListener('touchstart', unblockAudio, { once: true });

    return audioEl;
}

async function ensureWebRTCAuth(): Promise<void> {
    if (auth?.currentUser) {
        try {
            await auth.currentUser.getIdToken(true);
        } catch (e) {
            console.warn('[WebRTC Auth] Token refresh note:', e);
        }
        return;
    }
    
    if (auth) {
        await new Promise<void>((resolve) => {
            const unsub = auth.onAuthStateChanged((u) => {
                if (u) {
                    unsub();
                    resolve();
                }
            });
            setTimeout(() => {
                unsub();
                resolve();
            }, 1000);
        });

        if (!auth.currentUser) {
            try {
                const { signInAnonymously } = await import('firebase/auth');
                await signInAnonymously(auth);
                console.log('[WebRTC Auth] Fallback anonymous sign-in completed');
            } catch (e) {
                console.warn('[WebRTC Auth] Anonymous fallback sign-in note:', e);
            }
        }
    }
}

/**
 * 1. createCall(roomId, remoteAudioElement): Initiates a WebRTC voice call as the Caller.
 */
export async function createCall(
    roomId: string, 
    remoteAudioElement?: HTMLAudioElement | null,
    onDisconnectCallback?: (reason: string) => void
): Promise<WebRTCCallSession> {
    await ensureWebRTCAuth();

    let currentUser = auth?.currentUser;
    let callerUid = currentUser ? currentUser.uid : `anon_${Math.random().toString(36).substring(2, 7)}`;
    let callerEmail = currentUser?.email || 'Profesor / Usuario';

    // 1. Get local mic media stream
    const localStream = await getLocalAudioStream();

    // 2. Initialize RTCPeerConnection with dynamic configuration
    const dynamicConfig = await getDynamicRTCConfiguration();
    const peerConnection = new RTCPeerConnection(dynamicConfig);
    const remoteStream = new MediaStream();

    // Queue for ICE candidates that arrive before Remote Description is set
    const candidateQueue: any[] = [];

    const safeAddIceCandidate = async (candidateData: any) => {
        if (peerConnection.remoteDescription && peerConnection.remoteDescription.type) {
            try {
                await peerConnection.addIceCandidate(new RTCIceCandidate(candidateData));
            } catch (err) {
                console.error('Error adding ICE candidate:', err);
            }
        } else {
            candidateQueue.push(candidateData);
        }
    };

    const flushCandidateQueue = async () => {
        while (candidateQueue.length > 0) {
            const candidateData = candidateQueue.shift();
            try {
                await peerConnection.addIceCandidate(new RTCIceCandidate(candidateData));
            } catch (err) {
                console.error('Error flushing queued candidate:', err);
            }
        }
    };

    // Attach local audio tracks to PeerConnection
    localStream.getTracks().forEach((track) => {
        track.enabled = true;
        peerConnection.addTrack(track, localStream);
    });

    // Handle incoming remote stream tracks
    peerConnection.ontrack = (event) => {
        console.log('[WebRTC Caller] Track received:', event.track.kind, event.track.id);
        if (event.track) {
            event.track.enabled = true;
            event.track.onunmute = () => {
                console.log('[WebRTC Caller] Track unmuted, re-triggering audio playback.');
                bindStreamToAudioElement(remoteStream, remoteAudioElement);
            };
        }

        if (event.streams && event.streams[0]) {
            event.streams[0].getTracks().forEach((track) => {
                track.enabled = true;
                if (!remoteStream.getTracks().some(t => t.id === track.id)) {
                    remoteStream.addTrack(track);
                    console.log('[WebRTC Caller] Added track from stream group:', track.id);
                }
            });
        } else if (event.track) {
            if (!remoteStream.getTracks().some(t => t.id === event.track.id)) {
                remoteStream.addTrack(event.track);
                console.log('[WebRTC Caller] Added track directly (fallback):', event.track.id);
            }
        }
        bindStreamToAudioElement(remoteStream, remoteAudioElement);
    };

    // Firestore references
    const roomRef = doc(db, 'rooms', roomId);
    const callerCandidatesCol = collection(roomRef, 'callerCandidates');
    const calleeCandidatesCol = collection(roomRef, 'calleeCandidates');

    // Clear old candidates from previous calls
    try {
        const { getDocs } = await import('firebase/firestore');
        const oldCaller = await getDocs(callerCandidatesCol);
        oldCaller.forEach(d => deleteDoc(d.ref).catch(() => {}));
        const oldCallee = await getDocs(calleeCandidatesCol);
        oldCallee.forEach(d => deleteDoc(d.ref).catch(() => {}));
    } catch (e) {
        console.warn('Could not clear old candidates', e);
    }

    const unsubscribers: Unsubscribe[] = [];

    // 3. Collect local ICE candidates and save to /rooms/{roomId}/callerCandidates
    peerConnection.onicecandidate = async (event) => {
        if (event.candidate) {
            try {
                await addDoc(callerCandidatesCol, event.candidate.toJSON());
            } catch (err) {
                console.error('Error saving caller ICE candidate to Firestore:', err);
            }
        }
    };

    // 4. Create WebRTC SDP Offer
    let offerDescription = await peerConnection.createOffer();
    offerDescription = new RTCSessionDescription({
        type: offerDescription.type,
        sdp: setAudioBitrate(offerDescription.sdp || '', 32)
    });
    await peerConnection.setLocalDescription(offerDescription);

    const roomWithOffer = {
        offer: {
            type: offerDescription.type,
            sdp: offerDescription.sdp,
        },
        callerUid,
        callerEmail,
        status: 'calling',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        answer: deleteField()
    };

    try {
        await setDoc(roomRef, roomWithOffer, { merge: true });
    } catch (writeErr: any) {
        console.warn('[WebRTC Caller] Initial setDoc failed, attempting auth refresh and retry:', writeErr?.message);
        await ensureWebRTCAuth();
        if (auth?.currentUser) {
            currentUser = auth.currentUser;
            callerUid = currentUser.uid;
            callerEmail = currentUser.email || callerEmail;
            roomWithOffer.callerUid = callerUid;
            roomWithOffer.callerEmail = callerEmail;
        }
        await setDoc(roomRef, roomWithOffer, { merge: true });
    }

    // 5. Listen for Callee's SDP Answer on /rooms/{roomId}
    const unsubRoom = onSnapshot(roomRef, async (snapshot) => {
        if (!snapshot.exists()) {
            handleRemoteDisconnect('Room document deleted in Firestore');
            return;
        }

        const data = snapshot.data();

        // Check if room state indicates disconnection or end
        if (data?.status === 'ended') {
            handleRemoteDisconnect('Call ended by remote participant');
            return;
        }

        if (data?.answer && peerConnection.signalingState === 'have-local-offer') {
            try {
                const answerDescription = new RTCSessionDescription(data.answer);
                await peerConnection.setRemoteDescription(answerDescription);
                await flushCandidateQueue();
                await updateDoc(roomRef, { status: 'connected', updatedAt: serverTimestamp() }).catch(() => {});
            } catch (err) {
                console.warn('[WebRTC] Ignored setRemoteDescription error:', err);
            }
        }
    });
    unsubscribers.push(unsubRoom);

    // 6. Listen for Callee's ICE candidates on /rooms/{roomId}/calleeCandidates
    const unsubCalleeCandidates = onSnapshot(calleeCandidatesCol, (snapshot) => {
        snapshot.docChanges().forEach(async (change) => {
            if (change.type === 'added') {
                await safeAddIceCandidate(change.doc.data());
            }
        });
    });
    unsubscribers.push(unsubCalleeCandidates);

    // 7. Sudden disconnection monitoring (ICE & Connection state)
    let isCleanedUp = false;

    const handleRemoteDisconnect = (reason: string) => {
        if (isCleanedUp) return;
        console.warn(`[WebRTC Caller] Disconnected: ${reason}`);
        if (onDisconnectCallback) {
            onDisconnectCallback(reason);
        }
        cleanupCallSession();
    };

    peerConnection.oniceconnectionstatechange = () => {
        const state = peerConnection.iceConnectionState;
        console.log(`[WebRTC Caller] ICE Connection State: ${state}`);
        if (state === 'disconnected' || state === 'failed' || state === 'closed') {
            handleRemoteDisconnect(`ICE Connection State reached '${state}'`);
        }
    };

    peerConnection.onconnectionstatechange = () => {
        const state = peerConnection.connectionState;
        console.log(`[WebRTC Caller] Connection State: ${state}`);
        if (state === 'disconnected' || state === 'failed' || state === 'closed') {
            handleRemoteDisconnect(`Connection State reached '${state}'`);
        }
    };

    // Master cleanup function
    const cleanupCallSession = async () => {
        if (isCleanedUp) return;
        isCleanedUp = true;

        // Unsubscribe all Firestore snapshot listeners
        unsubscribers.forEach((unsub) => unsub());

        // Stop local microphone tracks
        localStream.getTracks().forEach((track) => track.stop());

        // Close peer connection
        if (peerConnection.signalingState !== 'closed') {
            peerConnection.close();
        }

        // Mark room as ended in Firestore if caller initiated cleanup
        try {
            const snap = await getDoc(roomRef);
            if (snap.exists() && snap.data().status !== 'ended') {
                await updateDoc(roomRef, {
                    status: 'ended',
                    offer: deleteField(),
                    answer: deleteField(),
                    endedBy: callerUid,
                    endedAt: serverTimestamp()
                });
            }
        } catch (e) {
            console.warn('Firestore room status update failed during cleanup:', e);
        }
    };

    return {
        roomId,
        peerConnection,
        localStream,
        remoteStream,
        hangup: cleanupCallSession,
        onDisconnect: onDisconnectCallback
    };
}

/**
 * 2. joinCall(roomId, remoteAudioElement): Joins an existing WebRTC voice call as the Callee.
 * 
 * - Reads offer from /rooms/{roomId} Firestore document.
 * - Obtains local microphone audio via getUserMedia.
 * - Sets remote description (Offer) and generates local SDP Answer.
 * - Stores SDP Answer in /rooms/{roomId} Firestore document.
 * - Listens for local ICE candidates and writes them to /rooms/{roomId}/calleeCandidates subcollection.
 * - Listens for caller ICE candidates in /rooms/{roomId}/callerCandidates.
 * - Integrates with Firebase Auth and handles sudden user disconnections.
 */
export async function joinCall(
    roomId: string, 
    remoteAudioElement?: HTMLAudioElement | null,
    onDisconnectCallback?: (reason: string) => void
): Promise<WebRTCCallSession> {
    await ensureWebRTCAuth();

    const currentUser = auth.currentUser;
    const calleeUid = currentUser ? currentUser.uid : `anon_${Math.random().toString(36).substring(2, 7)}`;
    const calleeEmail = currentUser?.email || 'Alumno / Participante';

    const roomRef = doc(db, 'rooms', roomId);
    const roomSnapshot = await getDoc(roomRef);

    if (!roomSnapshot.exists()) {
        throw new Error(`La sala de llamada '${roomId}' no existe.`);
    }

    const roomData = roomSnapshot.data();
    if (!roomData?.offer) {
        throw new Error(`La sala '${roomId}' no contiene una oferta WebRTC activa.`);
    }

    // 1. Get local mic media stream
    const localStream = await getLocalAudioStream();

    // 2. Initialize RTCPeerConnection with dynamic configuration
    const dynamicConfig = await getDynamicRTCConfiguration();
    const peerConnection = new RTCPeerConnection(dynamicConfig);
    const remoteStream = new MediaStream();

    // Queue for ICE candidates that arrive before Remote Description is set
    const candidateQueue: any[] = [];

    const safeAddIceCandidate = async (candidateData: any) => {
        if (peerConnection.remoteDescription && peerConnection.remoteDescription.type) {
            try {
                await peerConnection.addIceCandidate(new RTCIceCandidate(candidateData));
            } catch (err) {
                console.error('Error adding ICE candidate:', err);
            }
        } else {
            candidateQueue.push(candidateData);
        }
    };

    const flushCandidateQueue = async () => {
        while (candidateQueue.length > 0) {
            const candidateData = candidateQueue.shift();
            try {
                await peerConnection.addIceCandidate(new RTCIceCandidate(candidateData));
            } catch (err) {
                console.error('Error flushing queued candidate:', err);
            }
        }
    };

    // Attach local audio tracks to PeerConnection
    localStream.getTracks().forEach((track) => {
        track.enabled = true;
        peerConnection.addTrack(track, localStream);
    });

    // Handle incoming remote stream tracks
    peerConnection.ontrack = (event) => {
        console.log('[WebRTC Callee] Track received:', event.track.kind, event.track.id);
        if (event.track) {
            event.track.enabled = true;
            event.track.onunmute = () => {
                console.log('[WebRTC Callee] Track unmuted, re-triggering audio playback.');
                bindStreamToAudioElement(remoteStream, remoteAudioElement);
            };
        }

        if (event.streams && event.streams[0]) {
            event.streams[0].getTracks().forEach((track) => {
                track.enabled = true;
                if (!remoteStream.getTracks().some(t => t.id === track.id)) {
                    remoteStream.addTrack(track);
                    console.log('[WebRTC Callee] Added track from stream group:', track.id);
                }
            });
        } else if (event.track) {
            if (!remoteStream.getTracks().some(t => t.id === event.track.id)) {
                remoteStream.addTrack(event.track);
                console.log('[WebRTC Callee] Added track directly (fallback):', event.track.id);
            }
        }
        bindStreamToAudioElement(remoteStream, remoteAudioElement);
    };

    // Firestore subcollection references
    const callerCandidatesCol = collection(roomRef, 'callerCandidates');
    const calleeCandidatesCol = collection(roomRef, 'calleeCandidates');

    const unsubscribers: Unsubscribe[] = [];

    // 3. Collect local ICE candidates and save to /rooms/{roomId}/calleeCandidates
    peerConnection.onicecandidate = async (event) => {
        if (event.candidate) {
            try {
                await addDoc(calleeCandidatesCol, event.candidate.toJSON());
            } catch (err) {
                console.error('Error saving callee ICE candidate to Firestore:', err);
            }
        }
    };

    // 4. Set Remote Description from Caller's Offer
    if (peerConnection.signalingState === 'stable') {
        try {
            const offerDescription = new RTCSessionDescription(roomData.offer);
            await peerConnection.setRemoteDescription(offerDescription);
            await flushCandidateQueue();
        } catch (err) {
            console.warn('[WebRTC Callee] Ignored setRemoteDescription offer error:', err);
        }
    }

    // 5. Create WebRTC SDP Answer
    let answerDescription = await peerConnection.createAnswer();
    answerDescription = new RTCSessionDescription({
        type: answerDescription.type,
        sdp: setAudioBitrate(answerDescription.sdp || '', 32)
    });
    await peerConnection.setLocalDescription(answerDescription);

    const roomAnswer = {
        answer: {
            type: answerDescription.type,
            sdp: answerDescription.sdp,
        },
        calleeUid,
        calleeEmail,
        status: 'connected',
        updatedAt: serverTimestamp()
    };

    try {
        await updateDoc(roomRef, roomAnswer);
    } catch (writeErr: any) {
        console.warn('[WebRTC Callee] Initial updateDoc failed, attempting auth refresh and retry:', writeErr?.message);
        await ensureWebRTCAuth();
        await updateDoc(roomRef, roomAnswer);
    }

    // 6. Listen for Caller's ICE candidates on /rooms/{roomId}/callerCandidates
    const unsubCallerCandidates = onSnapshot(callerCandidatesCol, (snapshot) => {
        snapshot.docChanges().forEach(async (change) => {
            if (change.type === 'added') {
                await safeAddIceCandidate(change.doc.data());
            }
        });
    });
    unsubscribers.push(unsubCallerCandidates);

    // 7. Listen for room status updates (e.g., if caller ends the call or deletes room)
    const unsubRoom = onSnapshot(roomRef, (snapshot) => {
        if (!snapshot.exists()) {
            handleRemoteDisconnect('Room document deleted in Firestore');
            return;
        }
        const data = snapshot.data();
        if (data?.status === 'ended') {
            handleRemoteDisconnect('Call ended by caller');
        }
    });
    unsubscribers.push(unsubRoom);

    // 8. Sudden disconnection monitoring
    let isCleanedUp = false;

    const handleRemoteDisconnect = (reason: string) => {
        if (isCleanedUp) return;
        console.warn(`[WebRTC Callee] Disconnected: ${reason}`);
        if (onDisconnectCallback) {
            onDisconnectCallback(reason);
        }
        cleanupCallSession();
    };

    peerConnection.oniceconnectionstatechange = () => {
        const state = peerConnection.iceConnectionState;
        console.log(`[WebRTC Callee] ICE Connection State: ${state}`);
        if (state === 'disconnected' || state === 'failed' || state === 'closed') {
            handleRemoteDisconnect(`ICE Connection State reached '${state}'`);
        }
    };

    peerConnection.onconnectionstatechange = () => {
        const state = peerConnection.connectionState;
        console.log(`[WebRTC Callee] Connection State: ${state}`);
        if (state === 'disconnected' || state === 'failed' || state === 'closed') {
            handleRemoteDisconnect(`Connection State reached '${state}'`);
        }
    };

    // Master cleanup function
    const cleanupCallSession = async () => {
        if (isCleanedUp) return;
        isCleanedUp = true;

        // Unsubscribe all Firestore snapshot listeners
        unsubscribers.forEach((unsub) => unsub());

        // Stop local microphone tracks
        localStream.getTracks().forEach((track) => track.stop());

        // Close peer connection
        if (peerConnection.signalingState !== 'closed') {
            peerConnection.close();
        }

        // Mark room as ended in Firestore if callee initiated cleanup
        try {
            const snap = await getDoc(roomRef);
            if (snap.exists() && snap.data().status !== 'ended') {
                await updateDoc(roomRef, {
                    status: 'ended',
                    offer: deleteField(),
                    answer: deleteField(),
                    endedBy: calleeUid,
                    endedAt: serverTimestamp()
                });
            }
        } catch (e) {
            console.warn('Firestore room status update failed during cleanup:', e);
        }
    };

    return {
        roomId,
        peerConnection,
        localStream,
        remoteStream,
        hangup: cleanupCallSession,
        onDisconnect: onDisconnectCallback
    };
}
