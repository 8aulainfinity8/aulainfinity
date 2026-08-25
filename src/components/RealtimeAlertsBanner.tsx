import React, { useState, useEffect, useContext, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { AuthContext } from '../contexts/AuthContext';
import { eventEmitter } from '../services/eventService';
import { CloseIcon } from './icons';
import { collection, onSnapshot, doc } from 'firebase/firestore';
import { db, auth } from '../services/firebase';
import { listenerTracker } from '../services/listenerTracker';
import { useAuthorization } from '../hooks/useAuthorization';
import { getTeacherAssignedLevels } from '../utils/teacherPermissions';
import * as dbMock from '../services/mockDatabase';

interface RealtimeAlert {
    id: string;
    type: 'message' | 'call' | 'whiteboard';
    subType?: 'peer' | 'direct' | 'teacher' | 'course';
    title: string;
    body: string;
    senderId?: string;
    senderName?: string;
    conversationId?: string;
    courseId?: string;
    timestamp: number;
}

interface ActiveVoiceRoom {
    id: string;
    courseId: string;
    active: boolean;
    participants: Array<{
        id: string;
        name: string;
        role?: string;
        photoUrl?: string;
        joinedAt?: string;
    }>;
    updatedAt?: any;
}

export const RealtimeAlertsBanner: React.FC = () => {
    const { user } = useContext(AuthContext);
    const { isApprovedTeacher } = useAuthorization();
    const navigate = useNavigate();
    const location = useLocation();
    const [currentAlert, setCurrentAlert] = useState<RealtimeAlert | null>(null);
    const [activeVoiceRooms, setActiveVoiceRooms] = useState<ActiveVoiceRoom[]>([]);
    const [dismissedCallIds, setDismissedCallIds] = useState<Set<string>>(() => {
        try {
            const stored = sessionStorage.getItem('dismissed_voice_calls');
            return stored ? new Set(JSON.parse(stored)) : new Set();
        } catch {
            return new Set();
        }
    });
    const [hasFirebaseClaims, setHasFirebaseClaims] = useState<boolean | null>(null);
    const [isAdminClaim, setIsAdminClaim] = useState<boolean>(false);
    const [isApprovedTeacherClaim, setIsApprovedTeacherClaim] = useState<boolean>(false);

    const dismissCall = useCallback((roomId: string) => {
        setDismissedCallIds(prev => {
            const next = new Set(prev).add(roomId);
            try {
                sessionStorage.setItem('dismissed_voice_calls', JSON.stringify(Array.from(next)));
            } catch {}
            return next;
        });
    }, []);

    // Verificación asíncrona de las Custom Claims del token real de Firebase
    useEffect(() => {
        let isMounted = true;
        const checkClaims = async () => {
            try {
                const currentUser = auth.currentUser;
                if (!currentUser) {
                    if (isMounted) {
                        setIsAdminClaim(false);
                        setIsApprovedTeacherClaim(false);
                        setHasFirebaseClaims(false);
                    }
                    return;
                }
                const tokenResult = await currentUser.getIdTokenResult();
                const claims = tokenResult.claims;
                const actualIsAdmin = claims.role === 'admin';
                const actualIsApprovedTeacher = claims.role === 'teacher' && claims.isApprovedForTutoring === true && currentUser.emailVerified === true;
                const actualIsApproved = (actualIsAdmin || actualIsApprovedTeacher) && currentUser.emailVerified === true;
                if (isMounted) {
                    setIsAdminClaim(actualIsAdmin);
                    setIsApprovedTeacherClaim(actualIsApprovedTeacher);
                    setHasFirebaseClaims(actualIsApproved);
                }
            } catch (e) {
                console.warn('[RealtimeAlertsBanner] Failed to verify custom claims:', e);
                if (isMounted) {
                    setIsAdminClaim(false);
                    setIsApprovedTeacherClaim(false);
                    setHasFirebaseClaims(false);
                }
            }
        };

        const unsubscribe = auth.onAuthStateChanged(() => {
            checkClaims();
        });

        return () => {
            isMounted = false;
            unsubscribe();
        };
    }, [user]);
    
    // Almacenar IDs de eventos procesados para evitar alertas duplicadas
    const processedIdsRef = useRef<Set<string>>(new Set());
    const initTimeRef = useRef<number>(Date.now());
    const timerRef = useRef<NodeJS.Timeout | null>(null);
    const knownRoomParticipantsRef = useRef<Map<string, Set<string>>>(new Map());

    const myUserIds = [
        user?.id,
        (user as any)?.firebaseUid,
        (user as any)?.uid,
        user?.email
    ].filter(Boolean) as string[];

    // Helper to check if a room or conversation belongs to current user
    const isRoomForUser = useCallback((roomId?: string) => {
        if (!user || !roomId) return false;

        // 1. If it's a private student-to-student peer chat or student study group:
        if (roomId.startsWith('peer_') || roomId.startsWith('studygroup_')) {
            // A user (student, teacher, or admin) is ONLY part of it if their user.id is in the roomId
            return roomId.includes(user.id);
        }

        // 2. For teachers/admins:
        if (user.role === 'admin' || user.role === 'teacher') {
            // They can see all other rooms (like course rooms or tutoring rooms)
            return true;
        }

        const studentId = user.id;

        // 3. For students:
        // Direct ID match or user ID inside room ID (e.g., tutoring_studentId, or studentId)
        if (roomId.includes(studentId) || roomId === studentId) return true;

        // Check enrolled courses for group rooms
        const enrolledCourseIds = (user as any).enrolledCourseIds || [];
        if (Array.isArray(enrolledCourseIds)) {
            if (enrolledCourseIds.includes(roomId) || enrolledCourseIds.some((cId: string) => roomId.includes(cId))) {
                return true;
            }
        }

        return false;
    }, [user]);

    // Soft chime notification tone generator
    const playNotificationChime = useCallback(() => {
        try {
            const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
            if (!AudioCtx) return;
            const ctx = new AudioCtx();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(587.33, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.12);
            gain.gain.setValueAtTime(0.12, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start();
            osc.stop(ctx.currentTime + 0.3);
        } catch (e) {
            // Audio context policy catch
        }
    }, []);

    const triggerIncomingCallToast = useCallback((data: {
        roomId: string;
        courseId?: string;
        participant: { id: string; name: string; role?: string };
        participants: any[];
        timestamp?: string;
    }) => {
        if (!data.participant) return;

        // Reject incoming call toasts for old timestamps (older than 30s)
        const callTime = data.timestamp ? new Date(data.timestamp).getTime() : Date.now();
        if (Date.now() - callTime > 30000) return;

        // Do not notify if the current user is the one who joined/triggered the call
        if (myUserIds.includes(data.participant.id)) return;

        const callRoomId = data.courseId || data.roomId;
        if (!isRoomForUser(callRoomId)) return;

        // Check if current user is ALREADY inside this voice room
        const eventParticipants = data.participants || [];
        if (eventParticipants.some((p: any) => myUserIds.includes(p.id))) {
            return;
        }

        const callId = `call_${data.roomId}_${data.participant.id}_${Math.floor(Date.now() / 120000)}`;
        if (processedIdsRef.current.has(callId)) return;
        processedIdsRef.current.add(callId);

        playNotificationChime();

        const newAlert: RealtimeAlert = {
            id: callId,
            type: 'call',
            title: `📞 Llamada de voz iniciada por ${data.participant.name || 'un usuario'}`,
            body: `Sala activa de voz en directo. ¡Únete directamente con un clic!`,
            courseId: callRoomId,
            conversationId: callRoomId,
            timestamp: Date.now()
        };

        setCurrentAlert(newAlert);
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => setCurrentAlert(null), 10000);
    }, [myUserIds, isRoomForUser, playNotificationChime]);

    // Escuchar salas de voz activas en tiempo real desde Firebase Firestore con autorización granular
    useEffect(() => {
        if (!user) return;

        let unsubs: (() => void)[] = [];
        knownRoomParticipantsRef.current.clear();

        const handleVoiceDocSnapshot = (docSnap: any, isInitialSnapshot: boolean): ActiveVoiceRoom | null => {
            if (!docSnap.exists()) {
                knownRoomParticipantsRef.current.delete(docSnap.id);
                return null;
            }
            const data = docSnap.data() as any;
            if (!data) {
                knownRoomParticipantsRef.current.delete(docSnap.id);
                return null;
            }
            const participants: any[] = data.participants || [];
            const now = Date.now();
            
            let isStale = false;
            if (data.updatedAt) {
                const updatedMs = typeof data.updatedAt?.toMillis === 'function' ? data.updatedAt.toMillis() : new Date(data.updatedAt).getTime();
                if (!isNaN(updatedMs) && (now - updatedMs > 5 * 60 * 1000)) {
                    isStale = true;
                }
            }
            const isActive = data.active === true && Array.isArray(participants) && participants.length > 0 && !isStale;

            const roomId = docSnap.id;
            if (!isActive) {
                knownRoomParticipantsRef.current.delete(roomId);
                return null;
            }

            const prevSet = knownRoomParticipantsRef.current.get(roomId);
            const currentIds = new Set<string>(participants.map((p: any) => p.id));

            let newParticipant: any = null;
            if (!prevSet) {
                newParticipant = participants[participants.length - 1];
            } else {
                newParticipant = participants.find((p: any) => !prevSet.has(p.id));
            }

            knownRoomParticipantsRef.current.set(roomId, currentIds);

            if (!isInitialSnapshot && newParticipant) {
                triggerIncomingCallToast({
                    roomId,
                    courseId: data.courseId || roomId,
                    participant: newParticipant,
                    participants,
                    timestamp: new Date().toISOString()
                });
            }

            return {
                id: docSnap.id,
                courseId: data.courseId || docSnap.id,
                active: true,
                participants,
                updatedAt: data.updatedAt
            };
        };

        const actualIsAdmin = isAdminClaim || (user.role === 'admin' && hasFirebaseClaims === true);
        const actualIsApprovedTeacher = (isApprovedTeacherClaim || (user.role === 'teacher' && isApprovedTeacher)) && user.role === 'teacher';

        if (actualIsAdmin) {
            // Admin: supervisión global legítima de todas las salas de voz
            const voice_group_callsRef = collection(db, 'voice_group_calls');
            let isInitialCollection = true;
            const unsub = onSnapshot(voice_group_callsRef, (snapshot) => {
                const isInitial = isInitialCollection;
                isInitialCollection = false;
                const activeRooms: ActiveVoiceRoom[] = [];
                snapshot.forEach((docSnap) => {
                    const room = handleVoiceDocSnapshot(docSnap, isInitial);
                    if (room) activeRooms.push(room);
                });
                setActiveVoiceRooms(activeRooms);
                
                setCurrentAlert(prev => {
                    if (prev?.type === 'call') {
                        const isStillActive = activeRooms.some(r => (r.courseId || r.id) === prev.courseId);
                        if (!isStillActive) return null;
                    }
                    return prev;
                });
            }, (err) => console.warn('Firestore active voice rooms listener (admin):', err.message));
            unsubs.push(unsub);
        } else if (actualIsApprovedTeacher) {
            // Approved Teacher: listeners individuales por cada curso asignado
            const taughtCourseIds = getTeacherAssignedLevels(user as any);
            if (taughtCourseIds.length > 0) {
                const activeRoomsMap = new Map<string, ActiveVoiceRoom>();
                taughtCourseIds.forEach((courseId: string) => {
                    const docRef = doc(db, 'voice_group_calls', courseId);
                    let isInitialDoc = true;
                    const unsub = onSnapshot(docRef, (docSnap) => {
                        const isInitial = isInitialDoc;
                        isInitialDoc = false;
                        const room = handleVoiceDocSnapshot(docSnap, isInitial);
                        if (room) {
                            activeRoomsMap.set(docSnap.id, room);
                        } else {
                            activeRoomsMap.delete(docSnap.id);
                        }
                        
                        const activeRooms = Array.from(activeRoomsMap.values());
                        setActiveVoiceRooms(activeRooms);
                        
                        setCurrentAlert(prev => {
                            if (prev?.type === 'call') {
                                const isStillActive = activeRooms.some(r => (r.courseId || r.id) === prev.courseId);
                                if (!isStillActive) return null;
                            }
                            return prev;
                        });
                    }, (_err) => {
                        // Ignorar errores de permisos para documentos no creados o inaccesibles
                    });
                    unsubs.push(unsub);
                });
            }
        } else if (user.role === 'student') {
            // Students: listeners individuales por cada curso en el que está matriculado
            const enrolledCourseIds = Array.isArray((user as any).enrolledCourseIds) ? (user as any).enrolledCourseIds : [];
            if (enrolledCourseIds.length > 0) {
                const activeRoomsMap = new Map<string, ActiveVoiceRoom>();
                enrolledCourseIds.forEach((courseId: string) => {
                    const docRef = doc(db, 'voice_group_calls', courseId);
                    let isInitialDoc = true;
                    const unsub = onSnapshot(docRef, (docSnap) => {
                        const isInitial = isInitialDoc;
                        isInitialDoc = false;
                        const room = handleVoiceDocSnapshot(docSnap, isInitial);
                        if (room) {
                            activeRoomsMap.set(docSnap.id, room);
                        } else {
                            activeRoomsMap.delete(docSnap.id);
                        }
                        
                        const activeRooms = Array.from(activeRoomsMap.values());
                        setActiveVoiceRooms(activeRooms);
                        
                        setCurrentAlert(prev => {
                            if (prev?.type === 'call') {
                                const isStillActive = activeRooms.some(r => (r.courseId || r.id) === prev.courseId);
                                if (!isStillActive) return null;
                            }
                            return prev;
                        });
                    }, (_err) => {
                        // Ignorar errores de permisos para documentos individuales
                    });
                    unsubs.push(unsub);
                });
            }
        }
        // Regular Teacher (user.role === 'teacher' && !isApprovedTeacher): 0 listeners globales creados

        return () => {
            unsubs.forEach(u => u());
        };
    }, [isAdminClaim, isApprovedTeacherClaim, hasFirebaseClaims, user, isApprovedTeacher, triggerIncomingCallToast]);

    // Escuchar pizarras digitales activas en tiempo real desde Firebase Firestore
    useEffect(() => {
        if (!hasFirebaseClaims || !isAdminClaim) return;

        const boardMetaRef = collection(db, 'whiteboards');
        let initialLoadDone = false;

        const unsub = onSnapshot(boardMetaRef, (snapshot) => {
            if (!initialLoadDone) {
                initialLoadDone = true;
                return;
            }

            snapshot.docChanges().forEach((change) => {
                if (change.type === 'added' || change.type === 'modified') {
                    const data = change.doc.data();
                    if (data.active === true) {
                        const boardId = change.doc.id;
                        if (isRoomForUser(boardId)) {
                            // Don't notify the teacher who opened it
                            if (data.updatedBy && user?.name && data.updatedBy.includes(user.name)) {
                                return;
                            }
                            const teacherName = data.updatedBy || 'Profesor';
                            const newAlert: RealtimeAlert = {
                                id: `board_${boardId}_${Date.now()}`,
                                type: 'whiteboard',
                                title: `🎨 ¡El profesor ${teacherName} ha abierto la Pizarra Digital!`,
                                body: `El profesor ha activado la Pizarra Digital en directo. Toca para unirte y ver el contenido.`,
                                courseId: boardId,
                                conversationId: boardId,
                                timestamp: Date.now()
                            };

                            playNotificationChime();
                            setCurrentAlert(newAlert);
                            if (timerRef.current) clearTimeout(timerRef.current);
                            timerRef.current = setTimeout(() => setCurrentAlert(null), 12000);
                        }
                    }
                }
            });
        }, (err) => console.warn('Firestore whiteboardMeta listener:', err.message));

        return () => unsub();
    }, [hasFirebaseClaims, isAdminClaim, user, isRoomForUser, playNotificationChime]);

    // Función para cerrar la alerta toast actual
    const handleClose = useCallback(() => {
        if (timerRef.current) clearTimeout(timerRef.current);
        setCurrentAlert(null);
    }, []);

    // Navegación hacia una llamada de voz activa
    const handleJoinCall = useCallback((roomId: string) => {
        if (!user || !roomId) return;

        // Dismiss this call locally so the floating balloon vanishes instantly
        dismissCall(roomId);

        if (user.role === 'student') {
            if (roomId.startsWith('studygroup_')) {
                const groupId = roomId.replace('studygroup_', '');
                navigate('/app/groups', { state: { openGroupId: groupId, openVoiceCall: true } });
            } else if (roomId.startsWith('peer_')) {
                navigate('/app/student-chat', {
                    state: {
                        activeConvoId: roomId,
                        activeChatType: 'private',
                        openVoiceCall: true
                    }
                });
            } else {
                // Soporte / chat de dudas alumno-profesor
                navigate('/app/chat', {
                    state: {
                        activeConvoId: roomId,
                        openVoiceCall: true
                    }
                });
            }
        } else if (user.role === 'teacher') {
            // Profesor -> Navegar siempre a /app/chat (NO /admin/chat) para evitar bloqueos de permisos
            navigate('/app/chat', {
                state: {
                    activeConvoId: roomId,
                    openVoiceCall: true
                }
            });
        } else {
            // Admin únicamente
            navigate('/admin/chat', {
                state: {
                    activeConvoId: roomId,
                    openVoiceCall: true
                }
            });
        }
    }, [user, navigate, dismissCall]);

    // Acción al pulsar la alerta toast
    const handleAction = useCallback(() => {
        if (!currentAlert || !user) return;
        const alert = currentAlert;
        handleClose();

        if (alert.type === 'call') {
            const rId = alert.courseId || alert.conversationId || '';
            handleJoinCall(rId);
        } else if (alert.type === 'message') {
            if (user.role === 'student') {
                if (alert.subType === 'direct') {
                    navigate('/app/chat', {
                        state: {
                            activeConvoId: alert.conversationId
                        }
                    });
                } else {
                    navigate('/app/student-chat', {
                        state: {
                            activeConvoId: alert.conversationId,
                            activeChatType: alert.subType === 'peer' ? 'private' : 'group'
                        }
                    });
                }
            } else if (user.role === 'teacher') {
                navigate('/app/chat', {
                    state: {
                        activeConvoId: alert.conversationId,
                        activeChatType: alert.subType === 'peer' ? 'private' : alert.subType === 'course' ? 'group' : 'direct'
                    }
                });
            } else {
                navigate('/admin/chat', {
                    state: {
                        activeConvoId: alert.conversationId,
                        activeChatType: alert.subType === 'peer' ? 'private' : alert.subType === 'course' ? 'group' : 'direct'
                    }
                });
            }
        } else if (alert.type === 'whiteboard') {
            const rId = alert.conversationId || alert.courseId || '';
            if (user.role === 'student') {
                if (rId.startsWith('peer_')) {
                    navigate('/app/student-chat', {
                        state: {
                            activeConvoId: rId,
                            activeChatType: 'private',
                            openWhiteboard: true
                        }
                    });
                } else if (rId.startsWith('studygroup_') || rId.startsWith('course_')) {
                    navigate('/app/student-chat', {
                        state: {
                            activeConvoId: rId,
                            activeChatType: 'group',
                            openWhiteboard: true
                        }
                    });
                } else {
                    navigate('/app/chat', {
                        state: {
                            activeConvoId: rId,
                            openWhiteboard: true
                        }
                    });
                }
            } else if (user.role === 'teacher') {
                navigate('/app/chat', {
                    state: {
                        activeConvoId: rId,
                        openWhiteboard: true
                    }
                });
            } else {
                navigate('/admin/chat', {
                    state: {
                        selectedConversationId: rId,
                        openWhiteboard: true
                    }
                });
            }
        }
    }, [currentAlert, user, handleClose, handleJoinCall, navigate]);

    useEffect(() => {
        if (!user) return;

        const myUserIds = [
            user.id,
            (user as any).firebaseUid,
            (user as any).uid,
            user.email
        ].filter(Boolean);

        const handleIncomingMessage = (data: any) => {
            if (myUserIds.includes(data.senderId)) return;
            
            const msgId = data.id || `${data.conversationId}_${Date.now()}`;
            if (processedIdsRef.current.has(msgId)) return;
            processedIdsRef.current.add(msgId);

            const msgTime = data.timestamp ? new Date(data.timestamp).getTime() : Date.now();
            if (initTimeRef.current - msgTime > 30000) return;

            const title = `💬 Nuevo mensaje de ${data.senderName || 'Usuario'}`;
            const body = data.text ? (data.text.length > 75 ? `${data.text.substring(0, 75)}...` : data.text) : 'Te ha enviado un archivo multimedia.';

            const newAlert: RealtimeAlert = {
                id: msgId,
                type: 'message',
                subType: data.type || 'direct',
                title,
                body,
                senderId: data.senderId,
                senderName: data.senderName,
                conversationId: data.conversationId,
                timestamp: Date.now()
            };

            playNotificationChime();
            setCurrentAlert(newAlert);
            if (timerRef.current) clearTimeout(timerRef.current);
            timerRef.current = setTimeout(() => setCurrentAlert(null), 8000);
        };

        eventEmitter.on('realtime-incoming-message', handleIncomingMessage);

        return () => {
            eventEmitter.off('realtime-incoming-message', handleIncomingMessage);
            if (timerRef.current) clearTimeout(timerRef.current);
        };
    }, [user, isRoomForUser, activeVoiceRooms, playNotificationChime]);

    // Filtrar salas de voz donde hay participantes pero el usuario actual AÚN NO HA ENTRADO y PERTENECE A ELLA
    const userIds = [
        user?.id,
        (user as any)?.firebaseUid,
        (user as any)?.uid,
        user?.email
    ].filter(Boolean);

    const unjoinedCalls = activeVoiceRooms.filter(room => {
        if (dismissedCallIds.has(room.id)) return false;

        // Verify if current user is ALREADY in the room
        const isUserInCall = room.participants.some(p => userIds.includes(p.id));
        if (isUserInCall) return false;

        const rId = room.courseId || room.id;
        return isRoomForUser(rId);
    }).slice(0, 1); // Cap at 1 to prevent multiple jumping globos

    const isCallToast = currentAlert?.type === 'call';
    const isWhiteboardToast = currentAlert?.type === 'whiteboard';

    return (
        <>
            {/* 1. Toast de alerta temporal superior */}
            {currentAlert && (
                <div 
                    className="fixed top-4 left-3 right-3 sm:left-auto sm:right-6 sm:w-96 z-[250] animate-fade-in transition-all duration-300"
                    role="alert"
                    aria-live="assertive"
                >
                    <div className={`p-4 rounded-2xl shadow-2xl border backdrop-blur-md transition-colors ${
                        isCallToast 
                            ? 'bg-emerald-900/95 text-white border-emerald-500/50 shadow-emerald-950/40' 
                            : isWhiteboardToast
                            ? 'bg-amber-950/95 text-white border-amber-500/50 shadow-amber-950/40'
                            : 'bg-slate-900/95 text-white border-indigo-500/50 shadow-slate-950/50'
                    }`}>
                        <div className="flex items-start justify-between gap-3">
                            <div className="flex items-start gap-3 flex-1 min-w-0">
                                <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 font-bold ${
                                    isCallToast ? 'bg-emerald-500/20 text-emerald-300' : isWhiteboardToast ? 'bg-amber-500/20 text-amber-300' : 'bg-indigo-500/20 text-indigo-300'
                                }`}>
                                    {isCallToast ? (
                                        <span className="relative flex h-6 w-6 items-center justify-center">
                                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6 text-emerald-300">
                                                <path fillRule="evenodd" d="M1.5 4.5a3 3 0 0 1 3-3h1.372c.86 0 1.61.586 1.819 1.42l1.105 4.423a1.875 1.875 0 0 1-.694 1.955l-1.293.97c-.135.101-.164.249-.126.352a11.285 11.285 0 0 0 6.697 6.697c.103.038.25-.009.352-.126l.97-1.293a1.875 1.875 0 0 1 1.955-.694l4.423 1.105c.834.209 1.42.959 1.42 1.82V19.5a3 3 0 0 1-3 3h-2.25C8.552 22.5 1.5 15.448 1.5 6.75V4.5Z" clipRule="evenodd" />
                                            </svg>
                                        </span>
                                    ) : isWhiteboardToast ? (
                                        <span className="relative flex h-6 w-6 items-center justify-center">
                                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                                            <span className="relative text-lg">🎨</span>
                                        </span>
                                    ) : (
                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6 text-indigo-300">
                                            <path fillRule="evenodd" d="M4.804 21.644A6.707 6.707 0 0 0 6 21.75a6.721 6.721 0 0 0 3.583-1.029c.774.182 1.584.279 2.417.279 5.322 0 9.75-3.97 9.75-9 0-5.03-4.428-9-9.75-9s-9.75 3.97-9.75 9c0 2.409 1.025 4.587 2.674 6.192.232.226.277.428.254.543a3.73 3.73 0 0 1-.814 1.686.75.75 0 0 0 .44 1.223ZM8.25 10.875a1.125 1.125 0 1 0 0 2.25 1.125 1.125 0 0 0 0-2.25ZM10.875 12a1.125 1.125 0 1 1 2.25 0 1.125 1.125 0 0 1-2.25 0Zm4.875-1.125a1.125 1.125 0 1 0 0 2.25 1.125 1.125 0 0 0 0-2.25Z" clipRule="evenodd" />
                                        </svg>
                                    )}
                                </div>

                                <div className="flex-1 min-w-0">
                                    <h4 className="text-sm font-bold truncate tracking-wide flex items-center gap-1.5 text-white">
                                        <span>{currentAlert.title}</span>
                                    </h4>
                                    <p className="text-xs text-slate-300 mt-1 line-clamp-2 leading-relaxed">
                                        {currentAlert.body}
                                    </p>
                                </div>
                            </div>

                            <button 
                                onClick={handleClose}
                                className="text-slate-400 hover:text-white p-1 rounded-lg transition-colors flex-shrink-0"
                                title="Cerrar alerta"
                            >
                                <CloseIcon className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="mt-3.5 pt-3 border-t border-white/10 flex items-center justify-between gap-3">
                            <span className="text-[11px] font-medium text-slate-400 flex items-center gap-1">
                                <span className={`inline-block w-2 h-2 rounded-full animate-pulse ${isWhiteboardToast ? 'bg-amber-400' : 'bg-emerald-400'}`}></span>
                                <span>Sincronizado con Firebase</span>
                            </span>
                            <button
                                onClick={handleAction}
                                className={`px-4 py-1.5 rounded-xl text-xs font-bold transition-all shadow-md flex items-center gap-1.5 ${
                                    isCallToast
                                        ? 'bg-emerald-500 hover:bg-emerald-400 text-white shadow-emerald-600/30'
                                        : isWhiteboardToast
                                        ? 'bg-amber-600 hover:bg-amber-500 text-white shadow-amber-600/30'
                                        : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-600/30'
                                }`}
                            >
                                <span>{isCallToast ? '📞 Unirse Ahora' : isWhiteboardToast ? '🎨 Abrir Pizarra' : '🚀 Responder / Abrir'}</span>
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                    <path fillRule="evenodd" d="M3 10a.75.75 0 0 1 .75-.75h10.638L10.23 5.29a.75.75 0 1 1 1.04-1.08l5.5 5.25a.75.75 0 0 1 0 1.08l-5.5 5.25a.75.75 0 0 1 0 1.08l-5.5 5.25a.75.75 0 1 1-1.04-1.08l4.158-3.96H3.75A.75.75 0 0 1 3 10Z" clipRule="evenodd" />
                                </svg>
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* 2. GLOBO FLOTANTE PERSISTENTE DE LLAMADA DE VOZ ACTIVA */}
            {unjoinedCalls.map((room) => {
                const hostName = room.participants[0]?.name || 'Un compañero/profesor';
                const participantCount = room.participants.length;

                return (
                    <div 
                        key={room.id}
                        className="fixed bottom-20 right-4 sm:bottom-6 sm:right-6 z-[200] max-w-sm animate-bounce-short transition-all duration-300"
                    >
                        <div className="bg-gradient-to-r from-emerald-600 to-teal-700 text-white p-3.5 sm:p-4 rounded-2xl shadow-2xl border border-emerald-400/40 backdrop-blur-md flex items-center gap-3.5 relative overflow-hidden">
                            {/* Decorative background glow */}
                            <div className="absolute -right-4 -bottom-4 w-20 h-20 bg-emerald-400/20 rounded-full blur-xl pointer-events-none"></div>

                            {/* Animated ringing icon */}
                            <div className="relative flex-shrink-0">
                                <span className="absolute -inset-1 rounded-full bg-emerald-400 opacity-75 animate-ping"></span>
                                <div className="relative w-11 h-11 bg-white/20 backdrop-blur-sm rounded-2xl flex items-center justify-center text-white font-bold border border-white/30 shadow-inner">
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6 text-white animate-pulse">
                                        <path fillRule="evenodd" d="M1.5 4.5a3 3 0 0 1 3-3h1.372c.86 0 1.61.586 1.819 1.42l1.105 4.423a1.875 1.875 0 0 1-.694 1.955l-1.293.97c-.135.101-.164.249-.126.352a11.285 11.285 0 0 0 6.697 6.697c.103.038.25-.009.352-.126l.97-1.293a1.875 1.875 0 0 1 1.955-.694l4.423 1.105c.834.209 1.42.959 1.42 1.82V19.5a3 3 0 0 1-3 3h-2.25C8.552 22.5 1.5 15.448 1.5 6.75V4.5Z" clipRule="evenodd" />
                                    </svg>
                                </div>
                            </div>

                            <div className="flex-1 min-w-0 pr-6">
                                <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-200 uppercase tracking-wider">
                                    <span className="w-2 h-2 rounded-full bg-emerald-300 animate-pulse"></span>
                                    <span>Llamada de voz en vivo</span>
                                </div>
                                <h4 className="text-sm font-bold text-white truncate mt-0.5">
                                    {hostName}
                                </h4>
                                <p className="text-[11px] text-emerald-100/90 truncate">
                                    {participantCount === 1 ? '1 participante en la sala' : `${participantCount} participantes activos`}
                                </p>
                            </div>

                            <div className="flex items-center gap-2 flex-shrink-0">
                                <button
                                    onClick={() => handleJoinCall(room.id)}
                                    className="px-3.5 py-2 bg-white text-emerald-800 hover:bg-emerald-50 rounded-xl text-xs font-extrabold shadow-lg transition-transform active:scale-95 flex items-center gap-1.5"
                                >
                                    <span>Unirse 🎧</span>
                                </button>
                                <button
                                    onClick={() => setDismissedCallIds(prev => new Set(prev).add(room.id))}
                                    className="text-emerald-200/80 hover:text-white p-1 rounded-lg transition-colors"
                                    title="Ocultar globo"
                                >
                                    <CloseIcon className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    </div>
                );
            })}
        </>
    );
};
