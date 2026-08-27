import React, { useState, useEffect, useContext, useMemo } from 'react';
import { X } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useChat } from '../hooks/useChat';
import { AuthContext } from '../contexts/AuthContext';
import { NotificationContext } from '../contexts/NotificationContext';
import * as api from '../services/api';
import type { Conversation, Attachment } from '../types';
import { CameraModal } from './CameraModal';
import { eventEmitter } from '../services/eventService';
import { AdminChatPage } from './admin/AdminChatPage';
import { useBackNavigation } from '../hooks/useBackNavigation';
import { SubscriptionGate } from './SubscriptionGate';
import { VoiceGroupCall } from './VoiceGroupCall';
import { Whiteboard } from './Whiteboard';
import { db, auth } from '../services/firebase';
import { Spinner } from './ui/Spinner';
import { doc, onSnapshot } from 'firebase/firestore';
import { getDirectChatId, resolveUserUid, resolveConversationMetadata } from '../utils/chatUtils';

// Subcomponents
import { ChatList, ActiveChannel } from './chat/ChatList';
import { ChatRoom } from './chat/ChatRoom';
import { ChatHeader } from './chat/ChatHeader';
import { IncomingCallModal } from './chat/IncomingCallModal';

export const ChatPage: React.FC = () => {
    const { user } = useContext(AuthContext);
    const { addToast } = useContext(NotificationContext);

    // If the logged-in user is a teacher, show the teacher-adapted chat interface of AdminChatPage
    if (user?.role === 'teacher') {
        return <AdminChatPage />;
    }

    const queryClient = useQueryClient();
    const handleBack = useBackNavigation();
    
    const [input, setInput] = useState('');
    const [attachments, setAttachments] = useState<Attachment[]>([]);
    const [isCameraOpen, setIsCameraOpen] = useState(false);
    
    const studentId = (user?.role as string) === 'teacher' ? '' : (user?.id || (user as any)?.uid || '');
    const studentName = user?.name || '';
    
    // Channel selection state
    const [activeChannel, setActiveChannel] = useState<ActiveChannel>({ type: 'teacher' });
    const [showChannelsMobile, setShowChannelsMobile] = useState(true);

    const { data: teachers, isLoading: isTeachersLoading } = useQuery({
        queryKey: ['teachers'],
        queryFn: api.fetchTeachers,
        enabled: !!user && !!user.id && !!auth.currentUser,
    });

    const { data: conversations = [] } = useQuery<Conversation[]>({
        queryKey: ['conversations', studentId],
        queryFn: () => api.fetchUserChatsFromFirestore(studentId),
        enabled: !!user && !!user.id && !!auth.currentUser && !!studentId,
        staleTime: 30000,
    });

    const activeTeacherUid = activeChannel.type === 'teacher' && activeChannel.teacher ? resolveUserUid(activeChannel.teacher) : '';

    const conversationId = useMemo(() => {
        if (!studentId) return null;
        if (activeChannel.convoId) {
            return activeChannel.convoId;
        }
        if (activeChannel.type === 'teacher') {
            if (!activeTeacherUid) return null;
            return getDirectChatId(studentId, activeTeacherUid);
        } else if (activeChannel.type === 'support') {
            return `support_${studentId}`;
        }
        return null;
    }, [studentId, activeChannel, activeTeacherUid]);

    const location = useLocation();
    const [showVoiceCall, setShowVoiceCall] = useState(false);
    const [isVoiceCallActive, setIsVoiceCallActive] = useState(false);
    
    const [showWhiteboard, setShowWhiteboard] = useState(false);
    const [isWhiteboardActive, setIsWhiteboardActive] = useState(false);
    
    const [showResolveConfirmModal, setShowResolveConfirmModal] = useState(false);
    const [isClosingDuda, setIsClosingDuda] = useState(false);

    const { messages, loading: isLoading, sendMessage, markAsRead } = useChat(
        conversationId, 
        studentId,
        {
            studentId,
            teacherId: activeTeacherUid || undefined,
            participants: activeTeacherUid ? [studentId, activeTeacherUid] : undefined
        }
    );
    
    const [isSending, setIsSending] = useState(false);

    const handleConfirmResolveDuda = async () => {
        if (!conversationId) return;
        try {
            setIsClosingDuda(true);
            const isStudentRole = (user?.role as string) !== 'teacher' && (user?.role as string) !== 'admin';
            const sId = studentId || user?.id || conversationId;

            // Optimistic update to immediately clear the conversation from the client cache so it disappears instantly
            const removeConvoFromCache = (cacheKey: any[]) => {
                queryClient.setQueryData<any[]>(cacheKey, (old) => {
                    if (!old || !Array.isArray(old)) return old;
                    return old.filter((c) => c.id !== conversationId && c.id !== sId && c.id !== `support_${sId}`);
                });
            };

            removeConvoFromCache(['conversations']);
            if (user?.id) removeConvoFromCache(['conversations', user.id]);
            if (sId) removeConvoFromCache(['conversations', sId]);

            // Clear localStorage chat messages cache for all permutations of this student's chat to prevent it from reappearing on selection
            const cleanConvoId = (conversationId || '').replace(/^direct_/, '').replace(/^support_/, '').replace(/^peer_/, '');
            const cleanSId = (sId || '').replace(/^direct_/, '').replace(/^support_/, '').replace(/^peer_/, '') || cleanConvoId.split('_')[0];
            const teacherUid = user?.id || '';
            const permutations = [
                conversationId,
                cleanConvoId,
                `direct_${cleanConvoId}`,
                `support_${cleanConvoId}`,
                `peer_${cleanConvoId}`,
                `support_${cleanSId}`,
                `direct_${cleanSId}`,
                cleanSId
            ];
            if (teacherUid && cleanSId) {
                permutations.push(`direct_${cleanSId}_${teacherUid}`);
                permutations.push(`direct_${teacherUid}_${cleanSId}`);
                permutations.push(`${cleanSId}_${teacherUid}`);
                permutations.push(`${teacherUid}_${cleanSId}`);
            }
            permutations.forEach(p => {
                if (p) {
                    localStorage.removeItem(`chat_messages_${p}`);
                    localStorage.removeItem(`chat_messages_direct_${p}`);
                }
            });

            // Execute deletion completely in the background to ensure no visual blocking
            api.closeSupportConversation(conversationId, sId, isStudentRole ? 'student' : ((user?.role as string) || 'teacher'))
                .then(() => {
                    queryClient.invalidateQueries({ queryKey: ['conversations'] });
                    queryClient.invalidateQueries({ queryKey: ['messages'] });
                })
                .catch((err) => {
                    console.error('Background close support conversation error:', err);
                });

            // Instantly dismiss modal and clean loader status
            setActiveChannel({ type: 'support' });
            setShowResolveConfirmModal(false);
            setIsClosingDuda(false);
        } catch (err) {
            console.error('Error in resolve duda flow:', err);
            setActiveChannel({ type: 'support' });
            setShowResolveConfirmModal(false);
            setIsClosingDuda(false);
        }
    };

    useEffect(() => {
        let applied = false;
        if (location.state?.openVoiceCall) {
            setShowVoiceCall(true);
            applied = true;
        }
        if (location.state?.openWhiteboard) {
            setShowWhiteboard(true);
            applied = true;
        }
        if (applied) {
            window.history.replaceState({}, document.title);
        }
    }, [location.state]);

    useEffect(() => {
        if (!location.state?.activeConvoId || !teachers) return;
        const convoId = location.state.activeConvoId;
        const resolved = resolveConversationMetadata(convoId);
        if (resolved.type === 'direct' && resolved.teacherId) {
            const teacherId = resolved.teacherId;
            const foundTeacher = teachers.find((t: any) => resolveUserUid(t) === teacherId || t.id === teacherId);
            if (foundTeacher) {
                setActiveChannel({ type: 'teacher', teacher: foundTeacher, convoId });
                setShowChannelsMobile(false);
            } else {
                setActiveChannel({ type: 'teacher', teacher: { id: teacherId, name: 'Profesor / Admin' }, convoId });
                setShowChannelsMobile(false);
            }
        } else if (resolved.type === 'support') {
            setActiveChannel({ type: 'support', convoId });
            setShowChannelsMobile(false);
        } else {
            setActiveChannel({ type: 'support', convoId });
            setShowChannelsMobile(false);
        }
    }, [location.state?.activeConvoId, teachers]);

    useEffect(() => {
        if (!conversationId) return;
        const baseId = studentId || '';
        
        const roomIdsToCheck = Array.from(new Set([
            conversationId,
            baseId,
            `direct_${baseId}`,
            activeTeacherUid ? getDirectChatId(baseId, activeTeacherUid) : null
        ].filter(Boolean))) as string[];

        const activeVoiceMap: Record<string, boolean> = {};
        const activeBoardMap: Record<string, boolean> = {};
        const unsubs: (() => void)[] = [];

        roomIdsToCheck.forEach(rId => {
            const voiceRef = doc(db, 'voice_group_calls', rId);
            const voiceUnsub = onSnapshot(voiceRef, (snap) => {
                const data = snap.exists() ? snap.data() : null;
                const participants = data?.participants || [];
                activeVoiceMap[rId] = data?.active === true && Array.isArray(participants) && participants.length > 0;
                setIsVoiceCallActive(Object.values(activeVoiceMap).some(Boolean));
            });

            const boardRef = doc(db, 'whiteboards', rId);
            const boardUnsub = onSnapshot(boardRef, (snap) => {
                activeBoardMap[rId] = snap.exists() && snap.data()?.active === true;
                setIsWhiteboardActive(Object.values(activeBoardMap).some(Boolean));
            }, () => {});

            unsubs.push(voiceUnsub, boardUnsub);
        });

        return () => {
            unsubs.forEach(u => u());
        };
    }, [conversationId, studentId, activeChannel, activeTeacherUid]);

    // Auto select teacher if activeChannel is teacher and teacher object is not yet populated
    useEffect(() => {
        if (activeChannel.type === 'teacher' && teachers && teachers.length > 0) {
            if (!activeChannel.teacher) {
                const assigned = (user as any)?.assignedTeacherId 
                    ? teachers.find((t: any) => t.id === (user as any).assignedTeacherId) 
                    : null;
                setActiveChannel({ type: 'teacher', teacher: assigned || teachers[0] });
            } else {
                const exists = teachers.some((t: any) => t.id === activeChannel.teacher?.id);
                if (!exists) {
                    setActiveChannel({ type: 'teacher', teacher: teachers[0] });
                }
            }
        }
    }, [teachers, activeChannel, user]);

    useEffect(() => {
        if (conversationId && user?.role === 'student') {
            markAsRead();
        }
    }, [conversationId, user?.role, markAsRead]);

    useEffect(() => {
        const handleUpdate = (payload: any) => {
            // NOTA P5.3: Eliminamos invalidateQueries redundante para messages.
            // Los mensajes se sincronizan vía useChat (onSnapshot) o setQueryData en el provider.
            const convoId = payload?.conversationId || payload?.courseId;
            if (convoId) {
                if (user?.id) queryClient.invalidateQueries({ queryKey: ['conversations', user.id] });
            }
            queryClient.invalidateQueries({ queryKey: ['teachers'] });
        };
        eventEmitter.on('message-update', handleUpdate);
        eventEmitter.on('direct-message-update', handleUpdate);
        eventEmitter.on('user-update', handleUpdate);

        return () => {
            eventEmitter.off('message-update', handleUpdate);
            eventEmitter.off('direct-message-update', handleUpdate);
            eventEmitter.off('user-update', handleUpdate);
        };
    }, [queryClient, user?.id]);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);
        files.forEach(file => {
            const reader = new FileReader();
            reader.onloadend = () => {
                setAttachments(prev => [...prev, {
                    name: file.name,
                    type: file.type,
                    url: reader.result as string,
                    size: file.size
                }]);
            };
            reader.readAsDataURL(file);
        });
        if (e.target.value) {
            e.target.value = '';
        }
    };

    const handleCapturePhoto = (dataUri: string) => {
        setAttachments(prev => [...prev, {
            name: `foto-${Date.now()}.jpg`,
            type: 'image/jpeg',
            url: dataUri,
            size: Math.round((dataUri.length - 'data:image/jpeg;base64,'.length) * 3 / 4)
        }]);
    };

    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if ((!input.trim() && attachments.length === 0) || !conversationId) return;
        
        setIsSending(true);
        try {
            await sendMessage(
                input.trim(), 
                'text', 
                activeTeacherUid ? [studentId, activeTeacherUid] : undefined, 
                attachments, 
                'student'
            );
            if (user?.id) queryClient.invalidateQueries({ queryKey: ['conversations', user.id] }); // Invalidate admin/teacher conversations
            setInput('');
            setAttachments([]);
            if (conversationId) {
                try {
                    localStorage.removeItem(`aula_chat_draft_${conversationId}`);
                } catch (e) {
                    console.error('Error removing chat draft from localStorage:', e);
                }
            }
        } catch (error) {
            console.error("Failed to send message", error);
        } finally {
            setIsSending(false);
        }
    };

    return (
        <SubscriptionGate>
            <div className="flex h-full max-h-full flex-1 min-h-0 bg-white dark:bg-slate-900 w-full rounded-2xl overflow-hidden shadow-sm border border-slate-200 dark:border-slate-800 relative z-0">
                {isVoiceCallActive && !showVoiceCall && (
                    <IncomingCallModal 
                        isOpen={true} 
                        callerName={activeChannel.type === 'teacher' ? activeChannel.teacher?.name : 'Soporte'}
                        onAccept={() => setShowVoiceCall(true)}
                        onDecline={() => setIsVoiceCallActive(false)}
                    />
                )}
                
                
                {showWhiteboard && conversationId && (
                    <div className="fixed inset-0 z-[100] bg-slate-950/95 backdrop-blur-md flex flex-col p-0 sm:p-4 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] animate-fade-in w-full h-full">
                        <div className="flex-1 bg-white dark:bg-slate-900 rounded-none sm:rounded-2xl overflow-hidden shadow-2xl flex flex-col border border-slate-800 w-full h-full">
                            <Whiteboard
                                courseId={conversationId}
                                isTeacher={(user as any)?.role === 'teacher' || (user as any)?.role === 'admin'}
                                onClose={() => setShowWhiteboard(false)}
                            />
                        </div>
                    </div>
                )}

                {showResolveConfirmModal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                        <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 max-w-sm w-full shadow-xl">
                            <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-2">¿Resolver duda?</h3>
                            <p className="text-slate-600 dark:text-slate-300 mb-6 text-sm leading-relaxed">
                                Se notificará a los profesores que tu duda ha sido resuelta.
                            </p>
                            <div className="flex justify-end gap-3">
                                <button
                                    onClick={() => setShowResolveConfirmModal(false)}
                                    className="px-4 py-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={handleConfirmResolveDuda}
                                    disabled={isClosingDuda}
                                    className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors flex items-center justify-center min-w-[100px]"
                                >
                                    {isClosingDuda ? <Spinner className="w-5 h-5 text-white" /> : 'Confirmar'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                <ChatList 
                    conversations={conversations} 
                    teachers={teachers || []} 
                    activeChannel={activeChannel} 
                    onSelectChannel={(ch) => {
                        setActiveChannel(ch);
                        setShowChannelsMobile(false);
                        setShowVoiceCall(false);
                        setShowWhiteboard(false);
                    }}
                    showOnMobile={showChannelsMobile}
                    studentId={studentId}
                />
                
                <div className={`flex-1 flex-col h-full bg-white dark:bg-slate-900 border-l dark:border-slate-800 relative z-0 w-full min-w-0 max-w-full overflow-hidden ${showChannelsMobile ? 'hidden md:flex' : 'flex'}`}>
                    <ChatHeader 
                        activeChannel={activeChannel}
                        onBack={() => setShowChannelsMobile(true)}
                        showChannelsMobile={showChannelsMobile}
                        setShowChannelsMobile={setShowChannelsMobile}
                        onStartVoiceCall={() => setShowVoiceCall(true)}
                        onStartWhiteboard={() => {
                            const isTeacher = (user as any)?.role === 'teacher' || (user as any)?.role === 'admin';
                            const canInitiate = isTeacher || (user as any)?.canInitiateWhiteboard === true;
                            if (!showWhiteboard && !isWhiteboardActive && !canInitiate) {
                                addToast('🔒 La pizarra está inactiva. Podrás unirte cuando un profesor o tutor la inicie.', 'info');
                                return;
                            }
                            setShowWhiteboard(true);
                        }}
                        onResolveConversation={() => setShowResolveConfirmModal(true)}
                    />

                    {showVoiceCall && conversationId && (
                        <div className="p-4 bg-slate-50/50 dark:bg-slate-900/45 border-b dark:border-slate-800 z-10 flex-shrink-0">
                            <VoiceGroupCall 
                                courseId={conversationId} 
                                onClose={() => setShowVoiceCall(false)}
                            />
                        </div>
                    )}

                    <ChatRoom 
                        messages={messages || []}
                        isLoading={isLoading}
                        activeChannel={activeChannel}
                        studentName={studentName}
                        input={input}
                        setInput={setInput}
                        attachments={attachments}
                        setAttachments={setAttachments}
                        onSendMessage={handleSendMessage}
                        onCapturePhoto={() => setIsCameraOpen(true)}
                        onFileChange={handleFileChange}
                        isSending={isSending}
                    />

                    <CameraModal 
                        isOpen={isCameraOpen} 
                        onClose={() => setIsCameraOpen(false)} 
                        onCapture={handleCapturePhoto} 
                    />
                </div>
            </div>
        </SubscriptionGate>
    );
};
