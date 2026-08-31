import React, { useState, useEffect, useRef, useContext } from 'react';
import {
    Phone,
    PhoneOff,
    Mic,
    MicOff,
    Volume2,
    VolumeX,
    Users,
    Activity,
    AlertCircle,
    Loader2,
    Copy,
    Check
} from 'lucide-react';
import { db } from '../services/firebase';
import { doc, setDoc, onSnapshot, getDoc, runTransaction } from 'firebase/firestore';
import { AuthContext } from '../contexts/AuthContext';
import { createCall, joinCall, enableMicrophoneForSession, WebRTCCallSession } from '../services/webrtcSignaling';

interface Participant {
    id: string;
    name: string;
    role: string;
    micMuted: boolean;
    isSpeaking: boolean;
    joinedAt: string;
}

interface VoiceGroupCallProps {
    courseId: string;
    onClose?: () => void;
}

export const VoiceGroupCall: React.FC<VoiceGroupCallProps> = ({ courseId, onClose }) => {
    const { user, isFirebaseAuthReady } = useContext(AuthContext);
    const [inCall, setInCall] = useState(false);
    const [callRole, setCallRole] = useState<'caller' | 'callee' | null>(null);
    const [isConnecting, setIsConnecting] = useState(false);
    const [statusMessage, setStatusMessage] = useState<string>('');
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [copiedRoomId, setCopiedRoomId] = useState(false);

    const [hasActiveOffer, setHasActiveOffer] = useState<boolean>(false);
    const [micMuted, setMicMuted] = useState(false);
    const [isListenOnly, setIsListenOnly] = useState(false);
    const [speakerMuted, setSpeakerMuted] = useState(false);
    const [participants, setParticipants] = useState<Participant[]>([]);
    const [localSpeechLevel, setLocalSpeechLevel] = useState(0);

    const audioRef = useRef<HTMLAudioElement | null>(null);
    const callSessionRef = useRef<WebRTCCallSession | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const animationFrameRef = useRef<number | null>(null);

    const userId = user?.id || `anon_${Math.random().toString(36).substr(2, 5)}`;
    const userName = user?.name || 'Invitado';
    const userRole = user?.role || 'student';

    const rawCourseId = (courseId || '').trim();
    const roomId = rawCourseId.startsWith('room_') ? rawCourseId : `room_${rawCourseId}`;

    // Listen to signaling room doc for active call offer state from another user
    useEffect(() => {
        if (!isFirebaseAuthReady || !courseId) return;

        const signalingRoomRef = doc(db, 'rooms', roomId);
        const unsubscribeSignaling = onSnapshot(
            signalingRoomRef, 
            (snapshot) => {
                if (snapshot.exists()) {
                    const data = snapshot.data();
                    const hasValidOfferFromOther = Boolean(
                        data?.offer && 
                        data?.status !== 'ended' && 
                        data?.callerUid !== userId
                    );
                    setHasActiveOffer(hasValidOfferFromOther);
                } else {
                    setHasActiveOffer(false);
                }
            },
            (err) => {
                console.warn('[VoiceGroupCall] Signaling room listener error:', err.message);
            }
        );

        return () => unsubscribeSignaling();
    }, [roomId, userId, isFirebaseAuthReady, courseId]);

    // Auto connect on mount
    const hasAttemptedAutoConnect = useRef(false);

    useEffect(() => {
        if (!isFirebaseAuthReady || !courseId) return;
        if (!inCall && !isConnecting && !hasAttemptedAutoConnect.current) {
            hasAttemptedAutoConnect.current = true;
            // Delay slightly to ensure Firestore & auth state settle
            setTimeout(() => {
                handleSmartConnect();
            }, 300);
        }
    }, [inCall, isConnecting, isFirebaseAuthReady, courseId]);

    useEffect(() => {
        if (!isFirebaseAuthReady || !courseId) return;

        const roomRef = doc(db, 'voice_group_calls', courseId);
        const unsubscribe = onSnapshot(
            roomRef, 
            (snapshot) => {
                if (snapshot.exists()) {
                    const data = snapshot.data();
                    setParticipants(data.participants || []);
                } else {
                    setParticipants([]);
                }
            },
            (err) => {
                console.warn('[VoiceGroupCall] Voice group call participants listener error:', err.message);
            }
        );

        const handleBeforeUnload = () => {
            if (callSessionRef.current) {
                callSessionRef.current.hangup();
            }
            leaveRoomFirestore();
        };

        window.addEventListener('beforeunload', handleBeforeUnload);

        return () => {
            unsubscribe();
            window.removeEventListener('beforeunload', handleBeforeUnload);
            if (callSessionRef.current) {
                callSessionRef.current.hangup();
            }
            leaveRoomFirestore();
        };
    }, [courseId, isFirebaseAuthReady]);

    // Bind remote audio stream whenever session or audio element changes
    useEffect(() => {
        const bindAudio = () => {
            const audioEl = audioRef.current;
            const remoteStream = callSessionRef.current?.remoteStream;
            if (audioEl && remoteStream) {
                // Ensure tracks are enabled
                remoteStream.getAudioTracks().forEach(t => {
                    t.enabled = true;
                });

                if (remoteStream.getAudioTracks().length > 0) {
                    if (audioEl.srcObject !== remoteStream) {
                        audioEl.srcObject = remoteStream;
                        console.log('[VoiceGroupCall] Assigned remote stream with tracks to audio element.');
                    }
                    if (audioEl.paused) {
                        audioEl.play().then(() => {
                            console.log('[VoiceGroupCall] Remote audio playing successfully');
                        }).catch((err) => {
                            console.warn('[VoiceGroupCall] Autoplay audio warning:', err);
                        });
                    }
                }
            }
        };

        bindAudio();
        const interval = setInterval(bindAudio, 1000);
        return () => clearInterval(interval);
    }, [inCall]);

    // Audio level meter analysis for local microphone
    const startAudioMeter = (stream: MediaStream) => {
        try {
            const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
            const audioContext = new AudioCtx();
            if (audioContext.state === 'suspended') {
                audioContext.resume().catch(() => {});
            }
            audioContextRef.current = audioContext;

            const source = audioContext.createMediaStreamSource(stream);
            const analyser = audioContext.createAnalyser();
            analyser.fftSize = 64;
            source.connect(analyser);

            const bufferLength = analyser.frequencyBinCount;
            const dataArray = new Uint8Array(bufferLength);

            const checkVolume = () => {
                if (!audioContextRef.current || audioContextRef.current.state === 'closed') return;
                analyser.getByteFrequencyData(dataArray);
                let sum = 0;
                for (let i = 0; i < bufferLength; i++) {
                    sum += dataArray[i];
                }
                const average = sum / bufferLength;
                setLocalSpeechLevel(Math.min(100, Math.floor(average * 1.8)));
                animationFrameRef.current = requestAnimationFrame(checkVolume);
            };

            checkVolume();
        } catch (err) {
            console.warn('Microphone audio context setup failed:', err);
        }
    };

    const stopAudioMeter = () => {
        if (animationFrameRef.current) {
            cancelAnimationFrame(animationFrameRef.current);
            animationFrameRef.current = null;
        }
        if (audioContextRef.current) {
            audioContextRef.current.close().catch(() => {});
            audioContextRef.current = null;
        }
        setLocalSpeechLevel(0);
    };


    // Initiate call (createCall - Caller)
    const handleStartCall = async () => {
        if (userRole === 'student' && !(user as any)?.canInitiateCalls) {
            setIsConnecting(false);
            setErrorMessage('🔒 Inicio de llamadas desactivado por el administrador. Solo puedes recibir o unirte a llamadas cuando un profesor o tutor las inicie.');
            setStatusMessage('Esperando a que el profesor o tutor inicie la llamada...');
            return;
        }

        setIsConnecting(true);
        setErrorMessage(null);
        setStatusMessage('Iniciando llamada y creando oferta WebRTC en Firestore...');

        try {
            const session = await createCall(roomId, audioRef.current, (reason) => {
                setStatusMessage(`Desconectado: ${reason}`);
                handleEndCall();
            });

            callSessionRef.current = session;
            setCallRole('caller');
            setInCall(true);
            setIsConnecting(false);

            const isSilent = (session.localStream as any)?._isListenOnly;
            setIsListenOnly(Boolean(isSilent));

            if (isSilent) {
                setStatusMessage('🔊 Conectado en Modo Solo Escucha (micrófono desactivado o sin permisos).');
            } else {
                setStatusMessage('Llamada activa. Esperando respuesta o conectando con participante...');
                startAudioMeter(session.localStream);
            }
            await joinRoomFirestore();
        } catch (err: any) {
            console.error('Failed to create WebRTC call:', err);
            setErrorMessage(err.message || 'Error al iniciar la llamada');
            setIsConnecting(false);
        }
    };

    // Join existing call (joinCall - Callee)
    const handleJoinCall = async () => {
        setIsConnecting(true);
        setErrorMessage(null);
        setStatusMessage('Buscando oferta de llamada en Firestore y creando respuesta...');

        try {
            const session = await joinCall(roomId, audioRef.current, (reason) => {
                setStatusMessage(`Desconectado: ${reason}`);
                handleEndCall();
            });

            callSessionRef.current = session;
            setCallRole('callee');
            setInCall(true);
            setIsConnecting(false);

            const isSilent = (session.localStream as any)?._isListenOnly;
            setIsListenOnly(Boolean(isSilent));

            if (isSilent) {
                setStatusMessage('🔊 Conectado en Modo Solo Escucha (micrófono desactivado o sin permisos).');
            } else {
                setStatusMessage('Conectado a la llamada WebRTC nativa.');
                startAudioMeter(session.localStream);
            }
            await joinRoomFirestore();
        } catch (err: any) {
            console.error('Failed to join WebRTC call:', err);
            if (err.message?.includes('no existe')) {
                setErrorMessage(`La sala '${roomId}' aún no ha sido iniciada por el creador de la llamada. Haz clic en "Crear Llamada" para iniciarla tú.`);
            } else {
                setErrorMessage(err.message || 'No se pudo unirse a la llamada.');
            }
            setIsConnecting(false);
        }
    };

    const handleRetryMicrophone = async () => {
        if (!callSessionRef.current) return;
        setStatusMessage('Solicitando acceso al micrófono...');
        const success = await enableMicrophoneForSession(callSessionRef.current);
        if (success) {
            setIsListenOnly(false);
            setErrorMessage(null);
            setStatusMessage('🎙️ Micrófono activado con éxito.');
            startAudioMeter(callSessionRef.current.localStream);
        } else {
            setErrorMessage('Permiso de micrófono denegado. Para hablar, habilita el acceso al micrófono en la barra de tu navegador (icono de candado o cámara).');
        }
    };

    // Smart auto-connect handler: Direct query to Firestore to decide whether to create or join call atomically
    const handleSmartConnect = async () => {
        if (inCall || isConnecting) return;
        setIsConnecting(true);
        setStatusMessage('Comprobando sala de llamada en tiempo real...');
        setErrorMessage(null);

        try {
            const signalingRoomRef = doc(db, 'rooms', roomId);
            const snap = await getDoc(signalingRoomRef);
            const data = snap.exists() ? snap.data() : null;

            const isOfferFromOtherUser = Boolean(
                data && 
                data.offer && 
                data.status !== 'ended' && 
                data.callerUid !== userId
            );

            if (isOfferFromOtherUser) {
                console.log('[VoiceGroupCall] Active offer from another user found. Joining call as Callee...');
                await handleJoinCall();
            } else {
                if (userRole === 'student' && !(user as any)?.canInitiateCalls) {
                    setIsConnecting(false);
                    setErrorMessage('🔒 El administrador ha configurado tu usuario para recibir llamadas. Solo los profesores o tutores pueden iniciar la llamada.');
                    setStatusMessage('Esperando a que el profesor inicie la llamada de voz...');
                    return;
                }
                console.log('[VoiceGroupCall] No active offer from another user. Creating call as Caller...');
                await handleStartCall();
            }
        } catch (err: any) {
            console.error('[VoiceGroupCall] Error during smart connect:', err);
            if (userRole === 'student' && !(user as any)?.canInitiateCalls) {
                setIsConnecting(false);
                setErrorMessage('🔒 El administrador ha configurado tu usuario para recibir llamadas. No hay una llamada activa iniciada por un profesor.');
                setStatusMessage('Esperando llamada del profesor...');
            } else {
                await handleStartCall();
            }
        }
    };

    // End call
    const handleEndCall = async () => {
        stopAudioMeter();
        if (callSessionRef.current) {
            await callSessionRef.current.hangup();
            callSessionRef.current = null;
        }
        const shouldForceEnd = userRole === 'teacher' || userRole === 'admin';
        await leaveRoomFirestore(shouldForceEnd);
        setInCall(false);
        setCallRole(null);
        setIsConnecting(false);
        setStatusMessage('Llamada finalizada');
        if (onClose) {
            onClose();
        }
    };

    // Mute / Unmute local track
    const handleToggleMute = () => {
        if (callSessionRef.current) {
            const audioTracks = callSessionRef.current.localStream.getAudioTracks();
            audioTracks.forEach((track) => {
                track.enabled = micMuted;
            });
            setMicMuted(!micMuted);
        }
    };

    const joinRoomFirestore = async () => {
        const roomRef = doc(db, 'voice_group_calls', courseId);
        try {
            const roomSnap = await getDoc(roomRef);
            const participantObj = {
                id: userId,
                name: userName,
                role: userRole,
                micMuted: micMuted,
                isSpeaking: false,
                joinedAt: new Date().toISOString()
            };

            if (!roomSnap.exists()) {
                await setDoc(roomRef, {
                    courseId,
                    active: true,
                    participants: [participantObj],
                    participantIds: [userId],
                    updatedAt: new Date().toISOString(),
                    createdAt: new Date().toISOString()
                }, { merge: true });
            } else {
                const currentParticipants = roomSnap.data().participants || [];
                const currentParticipantIds = roomSnap.data().participantIds || [];
                const withoutMe = currentParticipants.filter((p: any) => p.id !== userId);
                const withoutMeIds = currentParticipantIds.filter((id: string) => id !== userId);
                await setDoc(roomRef, {
                    active: true,
                    updatedAt: new Date().toISOString(),
                    participants: [...withoutMe, participantObj],
                    participantIds: [...withoutMeIds, userId]
                }, { merge: true });
            }
        } catch (err: any) {
            setParticipants([{
                id: userId,
                name: userName,
                role: userRole,
                micMuted: micMuted,
                isSpeaking: false,
                joinedAt: new Date().toISOString()
            }]);
        }
    };

    const leaveRoomFirestore = async (forceEnd = false) => {
        const roomRef = doc(db, 'voice_group_calls', courseId);
        const signalingRoomRef = doc(db, 'rooms', `room_${courseId}`);
        const { deleteField } = await import('firebase/firestore');
        try {
            const roomSnap = await getDoc(roomRef);
            if (roomSnap.exists()) {
                const currentParticipants = roomSnap.data().participants || [];
                const withoutMe = currentParticipants.filter((p: any) => p.id !== userId);
                if (forceEnd || withoutMe.length === 0) {
                    await setDoc(roomRef, {
                        active: false,
                        participants: [],
                        participantIds: [],
                        updatedAt: new Date().toISOString()
                    }, { merge: true });
                    await setDoc(signalingRoomRef, {
                        status: 'ended',
                        offer: deleteField(),
                        answer: deleteField(),
                        endedAt: new Date().toISOString()
                    }, { merge: true });
                } else {
                    const currentParticipantIds = roomSnap.data().participantIds || [];
                    const withoutMeIds = currentParticipantIds.filter((id: string) => id !== userId);
                    await setDoc(roomRef, {
                        participants: withoutMe,
                        participantIds: withoutMeIds,
                        updatedAt: new Date().toISOString()
                    }, { merge: true });
                }
            } else if (forceEnd) {
                await setDoc(roomRef, {
                    active: false,
                    participants: [],
                    participantIds: [],
                    updatedAt: new Date().toISOString()
                }, { merge: true });
            }
        } catch (err: any) {
            console.warn('leaveRoomFirestore error:', err);
            setParticipants([]);
        }
    };

    const copyRoomId = () => {
        navigator.clipboard.writeText(roomId);
        setCopiedRoomId(true);
        setTimeout(() => setCopiedRoomId(false), 2000);
    };

    return (
        <div id="voice-group-container" className="bg-slate-50 dark:bg-slate-800 border dark:border-slate-700/80 rounded-2xl p-4 shadow-sm relative overflow-hidden transition-all">
            {/* Elemento de Audio Oculto pero Activo en Layout para Reproducción Remota sin bloquear en móviles */}
            <audio 
                ref={audioRef} 
                autoPlay 
                playsInline 
                style={{ display: 'block', position: 'absolute', left: '-9999px', width: '1px', height: '1px', opacity: 0.01, pointerEvents: 'none' }} 
            />

            {/* Banner Superior */}
            <div className="flex items-center justify-between border-b border-gray-100 dark:border-slate-700 pb-3 mb-4">
                <div className="flex items-center gap-2">
                    <span className="flex h-3 w-3 relative">
                        <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${inCall ? 'bg-green-400' : 'bg-slate-400'}`}></span>
                        <span className={`relative inline-flex rounded-full h-3 w-3 ${inCall ? 'bg-green-500' : 'bg-slate-400'}`}></span>
                    </span>
                    <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">Llamada de Voz</h3>
                </div>

                <div className="flex items-center gap-2">
                    {onClose && (
                        <button onClick={onClose} className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                            ✕
                        </button>
                    )}
                </div>
            </div>

            {/* Error Message */}
            {errorMessage && (
                <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-xl flex items-center gap-2 text-xs text-red-600 dark:text-red-400">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{errorMessage}</span>
                </div>
            )}

            {/* Status Info */}
            {statusMessage && (
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-3 italic">
                    {statusMessage}
                </p>
            )}

            {/* Controls & Connection */}
            {!inCall ? (
                <div className="flex flex-col items-center py-6 text-center space-y-4">
                    {hasActiveOffer ? (
                        <div className="px-3 py-1.5 bg-green-100 dark:bg-green-900/40 border border-green-300 dark:border-green-700 text-green-700 dark:text-green-300 rounded-full text-xs font-semibold flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                            Hay una llamada entrante disponible.
                        </div>
                    ) : (
                        <p className="text-xs text-slate-600 dark:text-slate-300 max-w-sm">
                            Puedes iniciar o unirte a una llamada de audio en tiempo real con este chat.
                        </p>
                    )}

                    <div className="flex flex-col items-center gap-3 w-full max-w-sm">
                        {hasActiveOffer ? (
                            <button
                                onClick={handleJoinCall}
                                disabled={isConnecting}
                                className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-md transition-colors flex items-center justify-center gap-2 cursor-pointer"
                            >
                                {isConnecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Phone className="w-4 h-4" />}
                                Aceptar llamada
                            </button>
                        ) : (
                            <button
                                onClick={handleStartCall}
                                disabled={isConnecting}
                                className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-md transition-colors flex items-center justify-center gap-2 cursor-pointer"
                            >
                                {isConnecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Phone className="w-4 h-4" />}
                                Crear llamada
                            </button>
                        )}
                    </div>
                </div>
            ) : (
                <div className="space-y-4">
                    {/* Listen-Only Mode Banner */}
                    {isListenOnly && (
                        <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-xl flex items-center justify-between gap-2 text-xs text-amber-800 dark:text-amber-200">
                            <div className="flex items-center gap-2">
                                <MicOff className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
                                <span><strong>Modo Solo Escucha:</strong> Micrófono no otorgado o sin permiso. Puedes escuchar la llamada normalmente.</span>
                            </div>
                            <button
                                onClick={handleRetryMicrophone}
                                className="py-1.5 px-3 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-lg shrink-0 text-[11px] shadow transition-colors cursor-pointer"
                            >
                                Activar Micrófono
                            </button>
                        </div>
                    )}

                    {/* Audio Level Indicator */}
                    <div className="flex items-center gap-3 bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200 dark:border-slate-700">
                        <Activity className="w-4 h-4 text-indigo-500 animate-pulse" />
                        <span className="text-xs text-slate-600 dark:text-slate-300">Nivel de voz local:</span>
                        <div className="flex-1 bg-slate-200 dark:bg-slate-700 h-2 rounded-full overflow-hidden">
                            <div 
                                className="bg-indigo-500 h-full transition-all duration-75"
                                style={{ width: `${localSpeechLevel}%` }}
                            />
                        </div>
                    </div>

                    {/* Participant Grid */}
                    <div className="grid grid-cols-2 xs:grid-cols-3 sm:grid-cols-4 gap-3 max-h-48 overflow-y-auto p-1">
                        {participants.map((p) => {
                            const isMe = p.id === userId;
                            return (
                                <div key={p.id} className="relative flex flex-col items-center p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm">
                                    <img
                                        src={`https://api.dicebear.com/8.x/initials/svg?seed=${encodeURIComponent(p.name)}`}
                                        alt={p.name}
                                        className={`w-11 h-11 rounded-full object-cover relative transition-all border-2 ${
                                            localSpeechLevel > 15 && isMe ? 'border-green-500' : 'border-slate-200 dark:border-slate-700'
                                        }`}
                                    />
                                    <p className="text-[11.5px] font-bold text-slate-800 dark:text-slate-100 truncate w-full text-center mt-1">
                                        {p.name} {isMe && '(Tú)'}
                                    </p>
                                </div>
                            );
                        })}
                    </div>

                    {/* Active Action Controls */}
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-2 bg-slate-100 dark:bg-slate-900/60 p-3 rounded-2xl border border-slate-200/50 dark:border-slate-700 w-full">
                        <div className="grid grid-cols-2 gap-2 w-full sm:flex sm:w-auto">
                            <button 
                                onClick={isListenOnly ? handleRetryMicrophone : handleToggleMute} 
                                className={`py-3 px-3 rounded-xl border transition-colors flex items-center justify-center gap-2 text-xs font-semibold ${
                                    isListenOnly
                                        ? 'bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-950/40 dark:border-amber-800'
                                        : micMuted 
                                            ? 'bg-red-50 text-red-600 border-red-200 dark:bg-red-950/40 dark:border-red-800' 
                                            : 'bg-white text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700'
                                }`}
                            >
                                {isListenOnly ? (
                                    <MicOff className="w-4 h-4 text-amber-600 shrink-0" />
                                ) : micMuted ? (
                                    <MicOff className="w-4 h-4 text-red-500 shrink-0" />
                                ) : (
                                    <Mic className="w-4 h-4 text-indigo-500 shrink-0" />
                                )}
                                <span className="truncate">
                                    {isListenOnly ? 'Activar Mic' : micMuted ? 'Silenciado' : 'Micrófono'}
                                </span>
                            </button>

                            <button
                                onClick={() => {
                                    if (audioRef.current) {
                                        audioRef.current.play().then(() => {
                                            setStatusMessage('🔊 Altavoz activo y reproduciendo.');
                                        }).catch(() => {
                                            setStatusMessage('⚠️ Haz clic en la pantalla para activar audio.');
                                        });
                                    }
                                }}
                                className="py-3 px-3 bg-white text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700 rounded-xl border transition-colors flex items-center justify-center gap-2 text-xs font-semibold"
                                title="Activar Altavoz"
                            >
                                <Volume2 className="w-4 h-4 text-emerald-500 shrink-0" />
                                <span className="truncate">Altavoz</span>
                            </button>
                        </div>

                        <button 
                            onClick={handleEndCall} 
                            className="w-full sm:w-auto py-3 px-4 bg-rose-500 hover:bg-rose-600 text-white rounded-xl text-xs font-semibold shadow transition-colors flex items-center justify-center gap-2 cursor-pointer"
                        >
                            <PhoneOff className="w-4 h-4 shrink-0" />
                            <span>Colgar</span>
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};
