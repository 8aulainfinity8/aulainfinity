import React, { useState, useEffect, useRef, useContext, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams, useLocation } from 'react-router-dom';
import { useVirtualizer } from '@tanstack/react-virtual';
import { AuthContext } from '../../contexts/AuthContext';
import { AdminNotificationContext } from '../../contexts/AdminNotificationContext';
import { useChat } from '../../hooks/useChat';
import * as api from '../../services/api';
import type { Conversation, DirectMessage, Attachment, CourseGroupMessage, StudentUser } from '../../types';
import { PaperAirplaneIcon, ChatBubbleLeftRightIcon, UserCircleIcon, PencilIcon, TrashIcon, PaperclipIcon, CloseIcon, CameraIcon } from '../icons';
import { Spinner } from '../ui/Spinner';
import { EmptyState } from '../ui/EmptyState';
import { CameraModal } from '../CameraModal';
import { Phone, PenTool, Users, ArrowLeft, Video, X, CheckCircle } from 'lucide-react';
import { VoiceGroupCall } from '../VoiceGroupCall';
import { Whiteboard } from '../Whiteboard';
import { ClassReplayModal } from '../ClassReplayModal';
import { ManageStudentsModal } from './ManageStudentsModal';
import { db, auth } from '../../services/firebase';
import { doc, onSnapshot, collection, updateDoc, setDoc, getDocs, writeBatch, deleteDoc } from 'firebase/firestore';
import { eventEmitter } from '../../services/eventService';
import { getDirectChatId, resolveUserUid, parseDirectChatId, parseSupportChatId } from '../../utils/chatUtils';

// --- SUB-COMPONENTS ---

const ConversationItem: React.FC<{
    conversation: Conversation;
    isSelected: boolean;
    onSelect: () => void;
}> = ({ conversation, isSelected, onSelect }) => {
    const { user } = useContext(AuthContext);
    const isTeacher = user?.role === 'teacher';
    const isUnread = isTeacher ? conversation.unreadByTeacher : conversation.unreadByAdmin;

    const badge = useMemo(() => {
        if (!conversation.teacherId) {
            return (
                <span className="text-[10px] uppercase font-bold tracking-wider bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-400 px-1.5 py-0.5 rounded">
                    Sin tutor
                </span>
            );
        }
        if (isTeacher && conversation.teacherId === user?.id) {
            return (
                <span className="text-[10px] uppercase font-bold tracking-wider bg-green-100 text-green-800 dark:bg-green-950/40 dark:text-green-400 px-1.5 py-0.5 rounded">
                    Mi alumno
                </span>
            );
        }
        return (
            <span className="text-[10px] uppercase font-bold tracking-wider bg-indigo-50 text-indigo-700 dark:bg-indigo-950/35 dark:text-indigo-400 px-1.5 py-0.5 rounded truncate max-w-[120px]">
                {conversation.teacherName}
            </span>
        );
    }, [conversation.teacherId, conversation.teacherName, isTeacher, user?.id]);

    const channelBadge = useMemo(() => {
        if (conversation.id.includes('_')) {
            return (
                <span className="text-[10px] uppercase font-bold tracking-wider bg-purple-100 text-purple-800 dark:bg-purple-950/40 dark:text-purple-400 px-1.5 py-0.5 rounded">
                    Tutoría Directa
                </span>
            );
        }
        return (
            <span className="text-[10px] uppercase font-bold tracking-wider bg-sky-100 text-sky-800 dark:bg-sky-950/40 dark:text-sky-400 px-1.5 py-0.5 rounded">
                Soporte Gral.
            </span>
        );
    }, [conversation.id]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onSelect();
        }
    };

    return (
        <div
            onClick={onSelect}
            onKeyDown={handleKeyDown}
            role="button"
            tabIndex={0}
            className={`p-3 flex items-start gap-3 rounded-lg cursor-pointer transition-all border outline-none ${
                isSelected 
                ? 'bg-indigo-50/70 border-indigo-200 dark:bg-indigo-950/25 dark:border-indigo-900/60' 
                : 'bg-transparent border-transparent hover:bg-gray-100 dark:hover:bg-slate-700'
            }`}
        >
            <div className="relative flex-shrink-0">
                 <img
                    loading="lazy"
                    width="40"
                    height="40"
                    className="h-10 w-10 rounded-full object-cover bg-gray-200"
                    src={`https://api.dicebear.com/8.x/initials/svg?seed=${encodeURIComponent(conversation.studentName)}`}
                    alt={`Avatar de ${conversation.studentName}`}
                />
                {isUnread && (
                    <span className="absolute top-0 right-0 block h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white dark:ring-slate-800"></span>
                )}
            </div>
            <div className="flex-1 overflow-hidden">
                <div className="flex justify-between items-baseline gap-1">
                    <p className="font-bold text-slate-900 dark:text-slate-100 truncate text-sm">{conversation.studentName}</p>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 flex-shrink-0">
                        {new Date(conversation.lastMessageTimestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-400 truncate mt-0.5">{conversation.lastMessageText}</p>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    {channelBadge}
                    {badge}
                </div>
            </div>
        </div>
    );
};

// --- HELPER COMPONENTS ---

const RenderAttachments: React.FC<{ attachments?: Attachment[] }> = ({ attachments }) => {
    if (!attachments || attachments.length === 0) return null;
    return (
        <div className="mt-2 space-y-2">
            {attachments.map((att, idx) => {
                const isImage = att.type.startsWith('image/');
                if (isImage) {
                    return (
                        <div key={idx} className="relative group max-w-xs rounded-lg overflow-hidden border dark:border-slate-600 bg-black/5 mt-1.5 font-sans shadow-sm">
                            <img src={att.url} alt={att.name} referrerPolicy="no-referrer" className="max-h-48 object-contain w-full" />
                            <a 
                                href={att.url} 
                                download={att.name} 
                                className="absolute bottom-2 right-2 bg-black/60 hover:bg-black/80 text-white p-1.5 rounded-full backdrop-blur-sm transition-opacity opacity-0 group-hover:opacity-100 flex items-center justify-center shadow-md border border-white/20"
                                title="Descargar"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="w-4 h-4">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
                                </svg>
                            </a>
                        </div>
                    );
                }
                
                const sizeStr = att.size 
                    ? att.size > 1024 * 1024 
                        ? `${(att.size / (1024 * 1024)).toFixed(1)} MB`
                        : `${(att.size / 1024).toFixed(0)} KB`
                    : '';
                
                return (
                    <div key={idx} className="flex items-center gap-3 p-2 rounded-lg bg-slate-100/95 dark:bg-slate-800 border border-slate-200/50 dark:border-slate-700 max-w-sm mt-1.5 shadow-sm text-slate-800 dark:text-slate-200">
                        <div className="w-10 h-10 rounded-lg bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 flex items-center justify-center flex-shrink-0">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" className="w-5 h-5">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                            </svg>
                        </div>
                        <div className="flex-1 min-w-0 font-sans">
                            <p className="text-xs font-semibold truncate pr-2 text-left">{att.name}</p>
                            {sizeStr && <p className="text-[10px] text-slate-500 dark:text-slate-400 text-left">{sizeStr}</p>}
                        </div>
                        <a 
                            href={att.url} 
                            download={att.name}
                            className="p-2 text-slate-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-400 hover:bg-slate-200 dark:hover:bg-slate-750 rounded-lg transition-colors flex items-center justify-center flex-shrink-0"
                            title="Descargar"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="w-4 h-4">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
                            </svg>
                        </a>
                    </div>
                );
            })}
        </div>
    );
};

const MessageBubble: React.FC<{
    message: DirectMessage;
    canManage: boolean;
    onEdit: (messageId: string, text: string) => Promise<void> | void;
    onDelete: (messageId: string) => Promise<void> | void;
}> = ({ message, canManage, onEdit, onDelete }) => {
    const isOutgoing = message.senderRole === 'admin' || message.senderRole === 'teacher';
    const [isEditing, setIsEditing] = useState(false);
    const [editText, setEditText] = useState(message.text);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);

    const handleSave = async () => {
        if (editText.trim() && editText.trim() !== message.text) {
            setIsProcessing(true);
            try {
                await onEdit(message.id, editText.trim());
                setIsEditing(false);
            } catch (err) {
                console.error('Error al guardar edición:', err);
            } finally {
                setIsProcessing(false);
            }
        } else {
            setIsEditing(false);
        }
    };

    const handleDelete = async () => {
        setIsProcessing(true);
        try {
            await onDelete(message.id);
            setShowDeleteConfirm(false);
        } catch (err) {
            console.error('Error al borrar mensaje:', err);
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <div className={`flex gap-3 items-start group ${isOutgoing ? 'justify-end' : 'justify-start'}`}>
            {!isOutgoing && (
                <div className="w-10 h-10 bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-400 rounded-full flex items-center justify-center flex-shrink-0 font-bold border border-slate-200 dark:border-slate-800">
                    <UserCircleIcon className="w-8 h-8" />
                </div>
            )}
            <div className="flex flex-col max-w-[85%] sm:max-w-[75%] min-w-0">
                {isOutgoing && message.senderName && (
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold mb-0.5 mr-2 self-end italic">
                        {message.senderName}
                    </span>
                )}
                <div className={`mobile-responsive-bubble shadow-sm relative ${
                    isOutgoing
                    ? 'bg-primary text-white rounded-br-none'
                    : 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 rounded-bl-none border dark:border-slate-600'
                }`}>
                    {isEditing ? (
                        <div className="flex flex-col gap-2 min-w-[200px]">
                            <textarea
                                value={editText}
                                onChange={(e) => setEditText(e.target.value)}
                                className="w-full text-sm p-1.5 rounded border border-indigo-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-none"
                                rows={2}
                                disabled={isProcessing}
                            />
                            <div className="flex justify-end gap-2 text-xs">
                                <button disabled={isProcessing} onClick={() => { setIsEditing(false); setEditText(message.text); }} className={`px-2 py-1 ${isOutgoing ? 'text-indigo-100' : 'text-slate-550'} disabled:opacity-50`}>Cancelar</button>
                                <button disabled={isProcessing} onClick={handleSave} className="px-2 py-1 bg-white hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-indigo-700 dark:text-indigo-400 font-bold rounded shadow-sm disabled:opacity-50">{isProcessing ? 'Guardando...' : 'Guardar'}</button>
                            </div>
                        </div>
                    ) : showDeleteConfirm ? (
                        <div className="flex flex-col gap-2 min-w-[220px] text-xs">
                            <p className={`font-bold ${isOutgoing ? 'text-white' : 'text-red-550 dark:text-red-400'}`}>¿Eliminar este mensaje permanentemente?</p>
                            <div className="flex justify-end gap-2">
                                <button disabled={isProcessing} onClick={() => setShowDeleteConfirm(false)} className={`px-2 py-1 hover:underline ${isOutgoing ? 'text-indigo-100' : 'text-slate-550'} disabled:opacity-50`}>No, cancelar</button>
                                <button disabled={isProcessing} onClick={handleDelete} className="px-2.5 py-1 bg-red-600 text-white font-bold rounded shadow-sm hover:bg-red-700 disabled:opacity-50">{isProcessing ? 'Borrando...' : 'Sí, eliminar'}</button>
                            </div>
                        </div>
                    ) : (
                        <>
                            {message.text && <p className="whitespace-pre-wrap text-sm leading-relaxed">{message.text}</p>}
                            <RenderAttachments attachments={message.attachments} />
                            <div className="flex items-center justify-between gap-4 mt-1">
                                {canManage && (
                                    <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1.5 transition-opacity duration-150">
                                        <button 
                                            type="button"
                                            onClick={() => setIsEditing(true)} 
                                            className={`p-1 rounded hover:bg-black/10 transition ${isOutgoing ? 'text-blue-100' : 'text-slate-400 hover:text-indigo-600'}`} 
                                            title="Editar mensaje"
                                            disabled={isProcessing}
                                        >
                                            <PencilIcon className="w-3.5 h-3.5" />
                                        </button>
                                        <button 
                                            type="button"
                                            onClick={() => setShowDeleteConfirm(true)} 
                                            className={`p-1 rounded hover:bg-black/10 transition ${isOutgoing ? 'text-red-200' : 'text-slate-400 hover:text-red-600'}`} 
                                            title="Eliminar mensaje"
                                            disabled={isProcessing}
                                        >
                                            <TrashIcon className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                )}
                                <p className={`text-[9px] ${isOutgoing ? 'text-blue-100/90' : 'text-slate-400'} ml-auto`}>
                                    {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </p>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

// --- MAIN COMPONENT ---

export const AdminChatPage: React.FC = () => {
    const { user } = useContext(AuthContext);
    const isTeacher = user?.role === 'teacher';
    const isApprovedTeacher = isTeacher ? (user as any).isApprovedForTutoring !== false : true;
    const queryClient = useQueryClient();
    const { conversations, isConversationsLoading } = useContext(AdminNotificationContext);

    const location = useLocation();
    const [searchParams, setSearchParams] = useSearchParams();
    const studentQueryId = searchParams.get('studentId');
    const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);

    const [activeTab, setActiveTab] = useState<'group' | 'peer' | 'teacher' | 'whiteboard'>((location.state?.activeChatType as any) || 'peer');
    const [showVoiceCall, setShowVoiceCall] = useState(false);
    const [showWhiteboard, setShowWhiteboard] = useState(false);
    const [showResolveConfirmModal, setShowResolveConfirmModal] = useState(false);
    const [isClosingDuda, setIsClosingDuda] = useState(false);
    const [showClearChatModal, setShowClearChatModal] = useState(false);
    const [isClearingChat, setIsClearingChat] = useState(false);

    const handleClearChat = async () => {
        if (!selectedConversationId) return;
        setIsClearingChat(true);
        try {
            await api.clearChatMessages(selectedConversationId);
            queryClient.invalidateQueries({ queryKey: ['messages', selectedConversationId] });
            queryClient.invalidateQueries({ queryKey: ['groupMessages', selectedConversationId] });
            queryClient.invalidateQueries({ queryKey: ['peerMessages', selectedConversationId] });
            queryClient.invalidateQueries({ queryKey: ['teacherMessages', selectedConversationId] });
            queryClient.invalidateQueries({ queryKey: ['conversations'] });
            queryClient.invalidateQueries({ queryKey: ['groupConversations'] });
            setShowClearChatModal(false);
        } catch (err) {
            console.error('Error clearing chat:', err);
        } finally {
            setIsClearingChat(false);
        }
    };

    const handleConfirmResolveDuda = async () => {
        if (!selectedConversationId) return;
        try {
            setIsClosingDuda(true);
            const isStudentRole = user?.role === 'student';
            const studentIdToClose = activeConversation?.studentId || selectedConversationId.replace('direct_', '').split('_')[0];
            await api.closeSupportConversation(selectedConversationId, studentIdToClose, isStudentRole ? 'student' : (user?.role || 'teacher'));
            await queryClient.invalidateQueries({ queryKey: ['conversations'] });
            await queryClient.invalidateQueries({ queryKey: ['messages'] });
            setSelectedConversationId(null);
            setShowResolveConfirmModal(false);
        } catch (err) {
            console.error('Error closing support conversation:', err);
        } finally {
            setIsClosingDuda(false);
        }
    };

    useEffect(() => {
        if (location.state) {
            const state = location.state as any;
            let applied = false;
            if (state.activeConvoId) {
                setSelectedConversationId(state.activeConvoId);
                applied = true;
            }
            if (state.activeChatType) {
                setActiveTab(state.activeChatType);
                applied = true;
            }
            if (state.openVoiceCall) {
                setShowVoiceCall(true);
                applied = true;
            }
            if (state.openWhiteboard) {
                setShowWhiteboard(true);
                applied = true;
            }
            
            // Clear the state so we don't re-apply it unnecessarily
            if (applied) {
                window.history.replaceState({}, document.title);
            }
        }
    }, [location.state]);
    const [isReplayModalOpen, setIsReplayModalOpen] = useState(false);
    const [isManageStudentsModalOpen, setIsManageStudentsModalOpen] = useState(false);

    // --- NEW ADMIN MODERATION & LIVE TRACKING STATES ---
    const [activeBoards, setActiveBoards] = useState<{ id: string; active: boolean; updatedBy?: string; updatedAt?: string }[]>([]);

    // Real-time listener for active whiteboard sessions (Admin only with verified Custom Claim)
    useEffect(() => {
        let isMounted = true;
        let unsubscribe: (() => void) | null = null;

        const setupListener = async () => {
            if (!user || user.role !== 'admin') return;

            const currentUser = auth.currentUser;
            if (!currentUser || !currentUser.emailVerified) return;

            try {
                const tokenResult = await currentUser.getIdTokenResult();
                if (!isMounted) return;

                if (tokenResult.claims.role === 'admin') {
                    const q = collection(db, 'whiteboards');
                    unsubscribe = onSnapshot(q, (snapshot) => {
                        if (!isMounted) return;
                        const list: any[] = [];
                        snapshot.forEach((docSnap) => {
                            const data = docSnap.data();
                            if (data.active === true) {
                                list.push({
                                    id: docSnap.id,
                                    ...data
                                });
                            }
                        });
                        setActiveBoards(list);
                    }, (err) => {
                        if (err?.code !== 'permission-denied') {
                            console.error("Error fetching whiteboards snapshot:", err);
                        }
                    });
                }
            } catch (err) {
                console.warn("Failed to verify admin claim for whiteboards:", err);
            }
        };

        setupListener();

        return () => {
            isMounted = false;
            if (unsubscribe) {
                unsubscribe();
            }
        };
    }, [user]);

    // Resolve user names
    const { data: allUsers } = useQuery({
        queryKey: ['users-list'],
        queryFn: api.fetchUsers
    });

    const getUserName = (userId: string) => {
        const found = allUsers?.find(u => u.id === userId);
        return found ? found.name : `Usuario #${userId}`;
    };

    // Fetch peer student conversations
    const { data: peerConversations } = useQuery({
        queryKey: ['peerConversations'],
        queryFn: api.fetchAllPeerConversations,
        enabled: activeTab === 'peer',
        refetchInterval: 5000
    });

    // Fetch peer messages for selected peer conversation
    const { data: peerMessages, isLoading: isPeerMessagesLoading } = useQuery({
        queryKey: ['peerMessages', selectedConversationId],
        queryFn: () => api.fetchPeerMessages(selectedConversationId!),
        enabled: activeTab === 'peer' && !!selectedConversationId,
        refetchInterval: 3000
    });

    // Fetch teacher coordination messages
    const { data: teacherMessages, isLoading: isTeacherMessagesLoading } = useQuery({
        queryKey: ['teacherMessages', selectedConversationId],
        queryFn: () => api.fetchTeacherMessages(selectedConversationId || 'sala_profesores_coordinacion'),
        enabled: activeTab === 'teacher',
        refetchInterval: 3000
    });

    const { data: allTeacherMessages } = useQuery({
        queryKey: ['teacherMessages', 'ALL'],
        queryFn: () => api.fetchTeacherMessages('ALL'),
        enabled: activeTab === 'teacher',
        refetchInterval: 3000
    });

    // Real-time Firestore event listeners to update UI immediately
    useEffect(() => {
        const handleUpdate = () => {
            queryClient.invalidateQueries({ queryKey: ['messages'] });
            queryClient.invalidateQueries({ queryKey: ['groupMessages'] });
            queryClient.invalidateQueries({ queryKey: ['peerMessages'] });
            queryClient.invalidateQueries({ queryKey: ['teacherMessages'] });
            queryClient.invalidateQueries({ queryKey: ['conversations'] });
            queryClient.invalidateQueries({ queryKey: ['groupConversations'] });
            queryClient.invalidateQueries({ queryKey: ['peerConversations'] });
            queryClient.invalidateQueries({ queryKey: ['users'] });
            queryClient.invalidateQueries({ queryKey: ['teachers'] });
        };

        eventEmitter.on('message-update', handleUpdate);
        eventEmitter.on('direct-message-update', handleUpdate);
        eventEmitter.on('teacher-message-update', handleUpdate);
        eventEmitter.on('teacher-message-deleted', handleUpdate);
        eventEmitter.on('peer-message-update', handleUpdate);
        eventEmitter.on('group-message-update', handleUpdate);
        eventEmitter.on('course-group-message-update', handleUpdate);
        eventEmitter.on('user-update', handleUpdate);

        return () => {
            eventEmitter.off('message-update', handleUpdate);
            eventEmitter.off('direct-message-update', handleUpdate);
            eventEmitter.off('teacher-message-update', handleUpdate);
            eventEmitter.off('teacher-message-deleted', handleUpdate);
            eventEmitter.off('peer-message-update', handleUpdate);
            eventEmitter.off('group-message-update', handleUpdate);
            eventEmitter.off('course-group-message-update', handleUpdate);
            eventEmitter.off('user-update', handleUpdate);
        };
    }, [queryClient]);

    // Resolve whiteboard name/labels
    const getBoardLabel = (boardId: string) => {
        const course = courses?.find(c => c.id === boardId);
        if (course) return `Clase Grupal: Grupo ${course.name}`;

        const convo = conversations?.find(c => c.id === boardId);
        if (convo) return `Tutoría Privada: ${convo.studentName}`;

        if (boardId.startsWith('peer_')) {
            const parts = boardId.replace('peer_', '').split('_');
            const student1 = getUserName(parts[0]);
            const student2 = getUserName(parts[1] || '');
            return `Chat Alumnos: ${student1} ↔ ${student2}`;
        }

        return `Pizarra del Aula (${boardId})`;
    };

    // Remotely deactivate a whiteboard session and clear contents
    const deactivateBoard = async (boardId: string) => {
        try {
            if (db && boardId) {
                const docRef = doc(db, 'whiteboards', boardId);
                await updateDoc(docRef, { active: false, updatedBy: `${user?.name} (Admin)`, updatedAt: new Date().toISOString() });

                // Clean up strokes and documents in subcollections
                const strokesSnap = await getDocs(collection(db, 'whiteboards', boardId, 'strokes')).catch(() => null);
                const docsSnap = await getDocs(collection(db, 'whiteboards', boardId, 'documents')).catch(() => null);

                const batch = writeBatch(db);
                let count = 0;
                if (strokesSnap && !strokesSnap.empty) {
                    strokesSnap.forEach(d => { batch.delete(d.ref); count++; });
                }
                if (docsSnap && !docsSnap.empty) {
                    docsSnap.forEach(d => { batch.delete(d.ref); count++; });
                }
                batch.delete(doc(db, 'whiteboardStrokes', boardId));
                batch.delete(doc(db, 'whiteboardDocs', boardId));

                if (count > 0) {
                    await batch.commit().catch(async () => {
                        const promises: Promise<any>[] = [];
                        if (strokesSnap) strokesSnap.forEach(d => promises.push(deleteDoc(d.ref)));
                        if (docsSnap) docsSnap.forEach(d => promises.push(deleteDoc(d.ref)));
                        await Promise.all(promises).catch(() => {});
                    });
                }
            }
        } catch (err) {
            console.error("Error deactivating board:", err);
            alert("No se pudo desactivar la pizarra");
        }
    };

    useEffect(() => {
        setSelectedConversationId(null);
        setShowVoiceCall(false);
        setShowWhiteboard(false);
    }, [activeTab]);

    useEffect(() => {
        setShowVoiceCall(false);
        setShowWhiteboard(false);
    }, [selectedConversationId]);

    const { data: courses } = useQuery({
        queryKey: ['courses'],
        queryFn: api.fetchCourses,
        enabled: activeTab === 'group' || activeTab === 'whiteboard'
    });

    const groupConversations = useMemo(() => {
        if (!courses) return [];
        return courses.map(course => ({
            id: course.id,
            studentName: `Grupo ${course.name}`,
            studentEmail: 'Canal de colaboración grupal del aula',
            lastMessageText: 'Canal de comunicación del curso',
            lastMessageTimestamp: new Date().toISOString(),
            unreadByTeacher: false,
            unreadByAdmin: false
        })) as unknown as Conversation[];
    }, [courses]);

    const [input, setInput] = useState('');
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const conversationListRef = useRef<HTMLDivElement>(null);

    // Fetch teachers list for routing assignments
    const { data: teachers } = useQuery({
        queryKey: ['teachers'],
        queryFn: api.fetchTeachers
    });

    // Filter conversations for teachers: show conversations of students assigned to this teacher or unassigned
    const filteredConversations = useMemo(() => {
        const result: Conversation[] = [];

        if (conversations) {
            let list = conversations.filter(c => {
                if (!c || !c.id) return false;
                // Exclude special tabs channels from Dudas
                if (c.id.startsWith('peer_') || c.id.startsWith('teacher_') || c.id.startsWith('whiteboard_') || c.id === 'sala_profesores_coordinacion') {
                    return false;
                }
                return true;
            });

            if (isTeacher && user?.id) {
                list = list.filter(c => {
                    if (!c || !c.id) return false;
                    const { teacherId: parsedTeacherId, studentId: parsedStudentId } = api.parseConversationParticipants(c.id);
                    const effectiveTeacherId = c.teacherId || parsedTeacherId;
                    const sId = c.studentId || parsedStudentId || '';
                    const student = allUsers?.find(u => u && u.id && (u.id === sId || u.id === c.id.replace('direct_', '')));

                    // 1. Explicitly targeted to this teacher
                    if (
                        effectiveTeacherId === user.id || 
                        (c.id && c.id.includes(user.id)) ||
                        (c.teacherId && (c.teacherId === user.id || c.teacherId === (user as any).uid)) ||
                        (c.teacherName && user.name && c.teacherName.toLowerCase() === user.name.toLowerCase())
                    ) return true;

                    // 2. Explicitly targeted to ANOTHER teacher -> do NOT show in this teacher's Dudas
                    if (effectiveTeacherId && effectiveTeacherId !== user.id) return false;

                    // 3. General support / duda conversation without specific teacher target:
                    if (student) {
                        if (student.assignedTeacherId === user.id) return true;
                        if (student.assignedTeacherName && user.name && student.assignedTeacherName.toLowerCase() === user.name.toLowerCase()) return true;
                        if (student.assignedTeacherId) return false; // Assigned to another teacher
                    }

                    // Unassigned student or no specific teacher target -> show in general doubts so any teacher can respond
                    return true;
                });
            }

            list.forEach(c => {
                if (c && c.id) result.push(c);
            });
        }



        return result;
    }, [conversations, isTeacher, user?.id, user?.name, allUsers]);

    const conversationsToDisplay = activeTab === 'group' ? groupConversations : filteredConversations;

    const sortedConversations = useMemo(() => {
        if (activeTab === 'peer') {
            const studentUsers = (allUsers || []).filter(u => u && (u.role === 'student' || !(u as any).role)) as StudentUser[];
            
            let assignedStudents = studentUsers;
            const teacherUid = isTeacher && user?.id ? resolveUserUid(user) : '';
            if (isTeacher && teacherUid) {
                assignedStudents = studentUsers.filter(s => {
                    if (!s || !s.id) return false;
                    const studentUid = resolveUserUid(s);
                    if (s.assignedTeacherId === teacherUid || s.assignedTeacherId === user?.id) return true;
                    if (s.assignedTeacherName && user?.name && s.assignedTeacherName.toLowerCase() === user.name.toLowerCase()) return true;
                    const directConvoId = getDirectChatId(studentUid, teacherUid);
                    const hasTeacherConvo = (conversations || []).some(c => {
                        if (!c || !c.id) return false;
                        return (
                            c.id === directConvoId ||
                            c.id === `${studentUid}_${teacherUid}` ||
                            (c.studentId === studentUid && (c.teacherId === teacherUid || c.id.includes(teacherUid)))
                        );
                    });
                    return hasTeacherConvo;
                });
            }

            return assignedStudents.map(student => {
                const studentUid = resolveUserUid(student);
                const defaultConvoId = isTeacher && teacherUid ? getDirectChatId(studentUid, teacherUid) : studentUid;
                const canonicalId = isTeacher && teacherUid ? getDirectChatId(studentUid, teacherUid) : studentUid;
                const legacyId = isTeacher && teacherUid ? `${studentUid}_${teacherUid}` : studentUid;

                const existingConvo = (conversations || []).find(c => {
                    if (!c || !c.id) return false;
                    if (isTeacher && teacherUid) {
                        return (
                            c.id === canonicalId ||
                            c.id === legacyId ||
                            (c.studentId === studentUid && (c.teacherId === teacherUid || c.id.includes(teacherUid)))
                        );
                    } else {
                        const cleanCId = c.id.replace(/^direct_/, '');
                        return (
                            cleanCId === studentUid ||
                            c.studentId === studentUid ||
                            cleanCId.startsWith(`${studentUid}_`)
                        );
                    }
                });

                const finalConvoId = canonicalId;

                return {
                    id: finalConvoId,
                    studentId: studentUid,
                    studentName: student.name,
                    studentEmail: student.email + (student.assignedTeacherName ? ` • Tutor: ${student.assignedTeacherName}` : ' • Alumno 1a1'),
                    lastMessageText: existingConvo ? existingConvo.lastMessageText : 'Canal por Alumnos • Sin mensajes aún',
                    lastMessageTimestamp: existingConvo ? existingConvo.lastMessageTimestamp : (student.registrationDate || new Date().toISOString()),
                    teacherId: existingConvo?.teacherId || student.assignedTeacherId || (isTeacher ? teacherUid : undefined),
                    teacherName: existingConvo?.teacherName || student.assignedTeacherName || (isTeacher ? user?.name : undefined),
                    unreadByTeacher: existingConvo?.unreadByTeacher || false,
                    unreadByAdmin: existingConvo?.unreadByAdmin || false
                } as unknown as Conversation;
            }).sort((a, b) => new Date(b.lastMessageTimestamp || 0).getTime() - new Date(a.lastMessageTimestamp || 0).getTime());
        }
        if (activeTab === 'teacher') {
            const coordMsgs = (allTeacherMessages || teacherMessages || []).filter(m => !m.conversationId || m.conversationId === 'sala_profesores_coordinacion');
            const lastCoordMsg = coordMsgs.length > 0 ? coordMsgs[coordMsgs.length - 1] : null;
            const coordRoom = {
                id: 'sala_profesores_coordinacion',
                studentName: 'Sala de Coordinación (General)',
                studentEmail: 'Canal de comunicación grupal entre docentes y administración',
                lastMessageText: lastCoordMsg ? lastCoordMsg.text : 'Canal activo',
                lastMessageTimestamp: lastCoordMsg ? lastCoordMsg.timestamp : new Date().toISOString(),
                unreadByTeacher: false,
                unreadByAdmin: false
            };
            const teacherItems = (teachers || []).map(t => {
                const tMsgs = (allTeacherMessages || []).filter(m => m.conversationId === `teacher_${t.id}`);
                const lastMsg = tMsgs.length > 0 ? tMsgs[tMsgs.length - 1] : null;
                return {
                    id: `teacher_${t.id}`,
                    studentName: `Docente: ${t.name}`,
                    studentEmail: `${t.email} (${t.category})`,
                    lastMessageText: lastMsg ? `${lastMsg.senderName}: ${lastMsg.text}` : 'Chat directo de coordinación docente',
                    lastMessageTimestamp: lastMsg ? lastMsg.timestamp : ((t as any).registrationDate || new Date().toISOString()),
                    unreadByTeacher: false,
                    unreadByAdmin: false
                };
            });
            return [coordRoom, ...teacherItems] as unknown as Conversation[];
        }
        if (activeTab === 'whiteboard') {
            return activeBoards.map(board => ({
                id: board.id,
                studentName: getBoardLabel(board.id),
                studentEmail: `Último cambio por ${board.updatedBy || 'Usuario'}`,
                lastMessageText: `Pizarra activa desde: ${new Date(board.updatedAt || '').toLocaleTimeString('es-ES')}`,
                lastMessageTimestamp: board.updatedAt || new Date().toISOString(),
                unreadByTeacher: false,
                unreadByAdmin: false
            })) as unknown as Conversation[];
        }
        if (!conversationsToDisplay) return [];
        return [...conversationsToDisplay].sort((a, b) => new Date(b.lastMessageTimestamp).getTime() - new Date(a.lastMessageTimestamp).getTime());
    }, [activeTab, peerConversations, teacherMessages, allTeacherMessages, activeBoards, conversationsToDisplay, allUsers, teachers, conversations, isTeacher, user]);

    useEffect(() => {
        if (studentQueryId) {
            if (location.state?.activeChatType) {
                setActiveTab(location.state.activeChatType);
            }
            if (isTeacher && user?.id) {
                const teacherUid = resolveUserUid(user);
                const studentUid = resolveUserUid(studentQueryId);
                const canonicalId = getDirectChatId(studentUid, teacherUid);
                setSelectedConversationId(canonicalId);
            } else {
                const targetConvo = sortedConversations.find(c => c.studentId === studentQueryId || c.id === studentQueryId || c.id.includes(studentQueryId));
                if (targetConvo) {
                    setSelectedConversationId(targetConvo.id);
                } else {
                    setSelectedConversationId(studentQueryId);
                }
            }
            setSearchParams({}, { replace: true });
        }
    }, [studentQueryId, setSearchParams, sortedConversations, location.state, isTeacher, user]);

    const activeConversation = useMemo(() => {
        if (activeTab === 'group') return groupConversations?.find(c => c.id === selectedConversationId) || null;
        if (activeTab === 'peer') {
            const foundInSorted = sortedConversations?.find(c => c.id === selectedConversationId);
            if (foundInSorted) return foundInSorted;

            const convo = conversations?.find(c => c.id === selectedConversationId);
            if (convo) return convo;

            const student = (allUsers || []).find(u => u.id === selectedConversationId || selectedConversationId?.includes(u.id));
            if (student) {
                return {
                    id: selectedConversationId || student.id,
                    studentId: student.id,
                    studentName: student.name,
                    studentEmail: student.email + (student.assignedTeacherName ? ` • Tutor: ${student.assignedTeacherName}` : ''),
                    lastMessageText: 'Canal directo con alumno asignado',
                    lastMessageTimestamp: new Date().toISOString(),
                    unreadByTeacher: false,
                    unreadByAdmin: false
                } as unknown as Conversation;
            }
            return null;
        }
        if (activeTab === 'teacher') {
            if (selectedConversationId && selectedConversationId !== 'sala_profesores_coordinacion' && selectedConversationId.startsWith('teacher_')) {
                const techId = selectedConversationId.replace('teacher_', '');
                const tech = (teachers || []).find(t => t.id === techId);
                return {
                    id: selectedConversationId,
                    studentName: tech ? `Docente: ${tech.name}` : 'Docente',
                    studentEmail: tech ? `${tech.email} (${tech.category})` : 'Canal docente',
                    lastMessageText: '',
                    lastMessageTimestamp: '',
                    unreadByTeacher: false,
                    unreadByAdmin: false
                } as unknown as Conversation;
            }
            return {
                id: 'sala_profesores_coordinacion',
                studentName: 'Sala de Coordinación',
                studentEmail: 'Canal de comunicación docente',
                lastMessageText: '',
                lastMessageTimestamp: '',
                unreadByTeacher: false,
                unreadByAdmin: false
            } as unknown as Conversation;
        }
        if (activeTab === 'whiteboard') {
            return {
                id: selectedConversationId || '',
                studentName: getBoardLabel(selectedConversationId || ''),
                studentEmail: 'Supervisión en vivo',
                lastMessageText: '',
                lastMessageTimestamp: '',
                unreadByTeacher: false,
                unreadByAdmin: false
            } as unknown as Conversation;
        }
        return conversations?.find(c => c.id === selectedConversationId) || null;
    }, [conversations, groupConversations, peerConversations, selectedConversationId, activeTab, allUsers, teachers, sortedConversations]);

    const rawEffectiveConvoId = activeConversation?.id || selectedConversationId;
    const effectiveConvoId = rawEffectiveConvoId && !rawEffectiveConvoId.includes('_') && !rawEffectiveConvoId.startsWith('support_') && !rawEffectiveConvoId.startsWith('group_') && !rawEffectiveConvoId.startsWith('sala_') && !rawEffectiveConvoId.startsWith('teacher_') && !rawEffectiveConvoId.startsWith('peer_') ? `support_${rawEffectiveConvoId}` : rawEffectiveConvoId;
    
    const parsedFromId = effectiveConvoId && effectiveConvoId.startsWith('direct_') ? parseDirectChatId(effectiveConvoId) : null;
    const parsedSupport = effectiveConvoId && effectiveConvoId.startsWith('support_') ? parseSupportChatId(effectiveConvoId) : null;
    const targetStudentId = activeConversation?.studentId || parsedFromId?.studentId || parsedSupport?.studentId || (effectiveConvoId && !effectiveConvoId.startsWith('support_') && !effectiveConvoId.startsWith('group_') && !effectiveConvoId.startsWith('sala_') && !effectiveConvoId.startsWith('teacher_') && !effectiveConvoId.includes('_') ? effectiveConvoId : undefined);
    const targetTeacherId = isTeacher && user?.id ? resolveUserUid(user) : (activeConversation?.teacherId || parsedFromId?.teacherId || undefined);
    const directParticipants = targetStudentId && targetTeacherId ? [targetStudentId, targetTeacherId] : undefined;
    const supportParticipants = targetStudentId ? [targetStudentId] : undefined;
    const chatParticipants = effectiveConvoId?.startsWith('support_') ? supportParticipants : directParticipants;

    const { messages: unifiedMessages, loading: loadingUnifiedMessages, sendMessage, markAsRead, editMessage, deleteMessage } = useChat(
        effectiveConvoId, 
        user?.id || null,
        {
            studentId: targetStudentId || undefined,
            teacherId: targetTeacherId || undefined,
            participants: chatParticipants
        }
    );

    const activeMessages = useMemo(() => {
        if (!unifiedMessages) return [];
        return unifiedMessages.map(m => ({
            ...m,
            senderRole: m.senderRole || (m.senderId === user?.id ? (isTeacher ? 'teacher' : 'admin') : 'student'),
            timestamp: m.timestamp?.toMillis ? m.timestamp.toMillis() : (m.timestamp || Date.now())
        })) as DirectMessage[];
    }, [unifiedMessages, isTeacher, user?.id]);

    const isChatLoading = loadingUnifiedMessages;

    // --- MUTACIONES PARA CHATS ---
    const editMessageMutation = useMutation({
        mutationFn: ({ messageId, text }: { messageId: string, text: string }) => api.editMessage(messageId, text),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['messages', selectedConversationId] });
            queryClient.invalidateQueries({ queryKey: ['conversations'] });
        }
    });

    const deleteMessageMutation = useMutation({
        mutationFn: (messageId: string) => api.deleteMessage(messageId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['messages', selectedConversationId] });
            queryClient.invalidateQueries({ queryKey: ['conversations'] });
        }
    });

    const editPeerMessageMutation = useMutation({
        mutationFn: ({ messageId, text }: { messageId: string, text: string }) => api.editPeerMessage(messageId, text),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['peerMessages', selectedConversationId] });
            queryClient.invalidateQueries({ queryKey: ['peerConversations'] });
        }
    });

    const deletePeerMessageMutation = useMutation({
        mutationFn: (messageId: string) => api.deletePeerMessage(messageId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['peerMessages', selectedConversationId] });
            queryClient.invalidateQueries({ queryKey: ['peerConversations'] });
        }
    });

    const editTeacherMessageMutation = useMutation({
        mutationFn: ({ messageId, text }: { messageId: string, text: string }) => api.editTeacherMessage(messageId, text),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['teacherMessages'] });
        }
    });

    const deleteTeacherMessageMutation = useMutation({
        mutationFn: (messageId: string) => api.deleteTeacherMessage(messageId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['teacherMessages'] });
        }
    });

    const assignMutation = useMutation({
        mutationFn: ({ tId }: { tId: string | null }) => 
            api.assignConversationTeacher(selectedConversationId!, tId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['conversations'] });
            queryClient.invalidateQueries({ queryKey: ['messages', selectedConversationId] });
        }
    });
    
    const markAsReadMutation = useMutation({
        mutationFn: (conversationId: string) => api.markConversationAsRead(conversationId, isTeacher ? 'teacher' : 'admin'),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['conversations'] });
        }
    });



    const [attachments, setAttachments] = useState<Attachment[]>([]);
    const [isCameraOpen, setIsCameraOpen] = useState(false);
    const [isSending, setIsSending] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleCapturePhoto = (base64Image: string, fileName: string) => {
        setAttachments(prev => [...prev, {
            name: fileName,
            type: 'image/jpeg',
            url: base64Image,
        }]);
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files) return;
        const files = Array.from(e.target.files);
        files.forEach(file => {
            const reader = new FileReader();
            reader.onload = () => {
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

    const removeAttachment = (indexToRemove: number) => {
        setAttachments(prev => prev.filter((_, idx) => idx !== indexToRemove));
    };

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [activeMessages]);

    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (isSending) return;
        if ((!input.trim() && attachments.length === 0) || !selectedConversationId) return;
        if (!isApprovedTeacher) {
            alert('No tienes luz verde de administración para enviar mensajes.');
            return;
        }

        setIsSending(true);
        try {
            await sendMessage(
                input.trim(), 
                'text', 
                directParticipants, 
                attachments, 
                isTeacher ? 'teacher' : 'admin'
            );
            setInput('');
            setAttachments([]);
            if (textareaRef.current) {
                textareaRef.current.style.height = 'auto';
            }
            queryClient.invalidateQueries({ queryKey: ['conversations'] });
        } catch (error) {
            console.error("Failed to send message", error);
        } finally {
            setIsSending(false);
        }
    };

    useEffect(() => {
        if (selectedConversationId && activeMessages.length > 0) {
            markAsRead();
            queryClient.invalidateQueries({ queryKey: ['conversations'] });
        }
    }, [selectedConversationId, activeMessages.length, markAsRead, queryClient]);

    const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setInput(e.target.value);
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            textareaRef.current.style.height = `${e.target.scrollHeight}px`;
        }
    };

    const rowVirtualizer = useVirtualizer({
        count: sortedConversations.length,
        getScrollElement: () => conversationListRef.current,
        estimateSize: () => 90,
        overscan: 5,
    });

    const tabDetails = {
        group: {
            title: "Chats de Grupos",
            subtitle: "Canales grupales por curso y nivel"
        },
        peer: {
            title: "Alumnos 1a1",
            subtitle: isTeacher 
                ? "Chats individuales con tus alumnos asignados" 
                : "Todos los chats 1a1 de alumnos"
        },
        teacher: {
            title: "Sala de Profesores",
            subtitle: "Coordinación docente y mensajes directos"
        },
        whiteboard: {
            title: "Pizarras Activas",
            subtitle: "Supervisión en vivo de pizarras colaborativas"
        }
    };

    return (
        <div className="flex h-full w-full bg-white dark:bg-slate-800 md:rounded-xl md:shadow-2xl md:border dark:border-slate-700 overflow-hidden relative min-h-0">
            {/* Conversation List Panel */}
            <div className={`w-full md:w-1/3 border-r dark:border-slate-700 flex flex-col min-h-0 h-full ${selectedConversationId ? 'hidden md:flex' : 'flex'}`}>
                <div className="p-4 pl-6 md:pl-5 border-b dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50">
                    <h1 className="text-lg md:text-xl font-black text-slate-900 dark:text-slate-100 flex items-center gap-2">
                        <ChatBubbleLeftRightIcon className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                        <span>{tabDetails[activeTab]?.title || "Chats"}</span>
                    </h1>
                    <p className="text-xs text-slate-500 mt-1">{tabDetails[activeTab]?.subtitle || "Preguntas de todos los alumnos de la plataforma"}</p>
 
                    <div className="flex bg-slate-100 dark:bg-slate-950 p-1 rounded-xl mt-3 border dark:border-slate-850 overflow-x-auto scrollbar-none gap-1">
                        <button
                            onClick={() => { setActiveTab('group'); setSelectedConversationId(null); }}
                            className={`px-2.5 py-1.5 text-[10px] md:text-xs font-bold rounded-lg transition-all cursor-pointer whitespace-nowrap flex-shrink-0 ${
                                activeTab === 'group'
                                ? 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 shadow-sm'
                                : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                            }`}
                        >
                            Grupos
                        </button>
                        <button
                            onClick={() => { setActiveTab('peer'); setSelectedConversationId(null); }}
                            className={`px-2.5 py-1.5 text-[10px] md:text-xs font-bold rounded-lg transition-all cursor-pointer whitespace-nowrap flex-shrink-0 ${
                                activeTab === 'peer'
                                ? 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 shadow-sm'
                                : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                            }`}
                        >
                            Alumnos 1a1
                        </button>
                        <button
                            onClick={() => { setActiveTab('teacher'); setSelectedConversationId(null); }}
                            className={`px-2.5 py-1.5 text-[10px] md:text-xs font-bold rounded-lg transition-all cursor-pointer whitespace-nowrap flex-shrink-0 ${
                                activeTab === 'teacher'
                                ? 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 shadow-sm'
                                : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                            }`}
                        >
                            Profesores
                        </button>
                        <button
                            onClick={() => { setActiveTab('whiteboard'); setSelectedConversationId(null); }}
                            className={`px-2.5 py-1.5 text-[10px] md:text-xs font-bold rounded-lg transition-all cursor-pointer whitespace-nowrap flex-shrink-0 flex items-center gap-1 ${
                                activeTab === 'whiteboard'
                                ? 'bg-rose-500 text-white shadow-sm font-extrabold'
                                : 'text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/20'
                            }`}
                        >
                            <span className="relative flex h-2 w-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span>
                            </span>
                            <span>Pizarras</span>
                        </button>
                    </div>
                </div>
                <div ref={conversationListRef} className="flex-1 overflow-y-auto p-2">
                    {isConversationsLoading ? (
                        <div className="flex justify-center items-center h-full"><Spinner /></div>
                    ) : sortedConversations.length > 0 ? (
                         <div
                            className="w-full relative"
                            style={{ height: `${rowVirtualizer.getTotalSize()}px` }}
                         >
                            {rowVirtualizer.getVirtualItems().map(virtualRow => {
                                const convo = sortedConversations[virtualRow.index];
                                return (
                                    <div
                                        key={convo.id}
                                        style={{
                                            position: 'absolute',
                                            top: 0,
                                            left: 0,
                                            width: '105%',
                                            height: `${virtualRow.size}px`,
                                            transform: `translateY(${virtualRow.start}px)`,
                                        }}
                                        className="p-1"
                                    >
                                        <ConversationItem
                                            conversation={convo}
                                            isSelected={selectedConversationId === convo.id}
                                            onSelect={() => setSelectedConversationId(convo.id)}
                                        />
                                    </div>
                                )
                            })}
                        </div>
                    ) : (
                        <EmptyState
                            icon={<ChatBubbleLeftRightIcon />}
                            title="Bandeja de entrada vacía"
                            description="Cuando algún estudiante inicie una conversación, aparecerá aquí."
                        />
                    )}
                </div>
            </div>

            {/* Chat Window Panel */}
            <div className={`w-full md:w-2/3 flex flex-col bg-slate-50 dark:bg-slate-900 min-h-0 h-full ${selectedConversationId ? 'flex' : 'hidden md:flex'}`}>
                {selectedConversationId ? (
                    activeTab === 'whiteboard' ? (
                        <div className="flex-1 flex flex-col bg-white dark:bg-slate-900 p-4 relative h-full">
                            <div className="flex items-center justify-between p-3 border-b dark:border-slate-800 mb-2 gap-4">
                                <div className="flex items-center gap-3">
                                    <button
                                        onClick={() => setSelectedConversationId(null)}
                                        className="md:hidden p-2 -ml-2 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 active:bg-slate-200 dark:active:bg-slate-600 transition-colors"
                                        aria-label="Volver a la lista"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
                                        </svg>
                                    </button>
                                    <div>
                                        <h3 className="font-black text-slate-900 dark:text-slate-100 text-sm md:text-base flex items-center gap-2">
                                            <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse"></span>
                                            Supervisando: {getBoardLabel(selectedConversationId)}
                                        </h3>
                                        <p className="text-[10px] text-slate-500">Acceso administrativo y de control en tiempo real</p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => deactivateBoard(selectedConversationId)}
                                    className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-black shadow transition whitespace-nowrap cursor-pointer animate-pulse"
                                >
                                    Cerrar Pizarra Remotamente
                                </button>
                            </div>
                            <div className="flex-1 overflow-hidden border dark:border-slate-800 rounded-2xl shadow-inner bg-slate-50 dark:bg-slate-950 relative min-h-[450px]">
                                <Whiteboard courseId={selectedConversationId} isTeacher={true} />
                            </div>
                        </div>
                    ) : (
                        <>
                            {/* Selected Chat Header */}
                            <div className="p-4 bg-white dark:bg-slate-800 border-b dark:border-slate-700 flex flex-wrap items-center justify-between gap-4">
                                <div className="flex items-center gap-3">
                                    <button
                                        onClick={() => setSelectedConversationId(null)}
                                        className="md:hidden p-2 -ml-2 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 active:bg-slate-200 dark:active:bg-slate-600 transition-colors"
                                        aria-label="Volver a la lista de estudiantes"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
                                        </svg>
                                    </button>
                                    <div>
                                        <h2 className="text-base md:text-lg font-black text-slate-900 dark:text-slate-100 flex items-center gap-2">
                                            <span>{activeConversation?.studentName}</span>
                                        </h2>
                                        <p className="text-xs text-slate-550 dark:text-slate-400">
                                            {activeTab === 'group' 
                                                ? 'Canal de colaboración y tutorías del aula'
                                                : activeTab === 'peer'
                                                    ? 'Alumnos asignados al profesor para tutoría y canal de dudas'
                                                    : activeTab === 'teacher'
                                                        ? 'Canal de coordinación de profesores y administradores'
                                                        : activeConversation?.teacherId 
                                                            ? `Tutor asignado: ${activeConversation.teacherName}` 
                                                            : 'Sin tutor asignado'
                                            }
                                        </p>
                                    </div>
                                </div>

                            {/* Controls depending on tab */}
                            <div className="flex items-center flex-wrap gap-1.5 sm:gap-2">
                                <button
                                    onClick={() => {
                                        if (!isApprovedTeacher) {
                                            alert('No tienes luz verde de administración para usar la llamada de voz.');
                                            return;
                                        }
                                        setShowVoiceCall(v => !v);
                                    }}
                                    disabled={!isApprovedTeacher}
                                    className={`px-2.5 py-1.5 sm:px-3 sm:py-1.5 rounded-xl transition-all border flex items-center gap-1.5 text-xs font-bold shadow-sm disabled:opacity-50 disabled:cursor-not-allowed ${
                                        showVoiceCall 
                                        ? 'bg-indigo-50 border-indigo-250 text-indigo-700 dark:bg-indigo-950/35 dark:border-indigo-900 dark:text-indigo-400' 
                                        : 'bg-white border-slate-205 text-slate-705 dark:bg-slate-750 dark:border-slate-650 dark:text-slate-300 hover:bg-slate-50 cursor-pointer'
                                    }`}
                                    title={isApprovedTeacher ? "Llamada de voz" : "Requiere aprobación (luz verde)"}
                                >
                                    <Phone className="w-4 h-4" />
                                    <span className="hidden sm:inline">Voz</span>
                                </button>
                                
                                <button
                                    onClick={() => {
                                        if (!isApprovedTeacher) {
                                            alert('No tienes luz verde de administración para usar la pizarra.');
                                            return;
                                        }
                                        const nextVal = !showWhiteboard;
                                        setShowWhiteboard(nextVal);
                                        if (selectedConversationId) {
                                            const docRef = doc(db, 'whiteboards', selectedConversationId);
                                            setDoc(docRef, {
                                                active: nextVal,
                                                updatedBy: user?.name || 'Profesor',
                                                updatedAt: new Date().toISOString()
                                            }, { merge: true }).catch(console.error);
                                        }
                                    }}
                                    disabled={!isApprovedTeacher}
                                    className={`px-2.5 py-1.5 sm:px-3 sm:py-1.5 rounded-xl transition-all border flex items-center gap-1.5 text-xs font-bold shadow-sm disabled:opacity-50 disabled:cursor-not-allowed ${
                                        showWhiteboard 
                                        ? 'bg-indigo-50 border-indigo-255 text-indigo-700 dark:bg-indigo-950/35 dark:border-indigo-900 dark:text-indigo-400' 
                                        : 'bg-white border-slate-205 text-slate-755 dark:bg-slate-750 dark:border-slate-650 dark:text-slate-300 hover:bg-slate-50 cursor-pointer'
                                    }`}
                                    title={isApprovedTeacher ? "Activar pizarra escolar" : "Requiere aprobación (luz verde)"}
                                >
                                    <PenTool className="w-4 h-4" />
                                    <span className="hidden sm:inline">Pizarra</span>
                                </button>

                                <button
                                    onClick={() => setIsReplayModalOpen(true)}
                                    className="px-2.5 py-1.5 sm:px-3 sm:py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl transition-all flex items-center gap-1.5 text-xs font-bold shadow-sm cursor-pointer hover:shadow"
                                    title="Ver grabaciones anteriores"
                                >
                                    <Video className="w-4 h-4" />
                                    <span className="hidden sm:inline">Replay</span>
                                </button>

                                {activeTab === 'group' && (
                                    <button
                                        onClick={() => {
                                            if (!isApprovedTeacher) {
                                                alert('No tienes luz verde de administración para gestionar alumnos del grupo.');
                                                return;
                                            }
                                            setIsManageStudentsModalOpen(true);
                                        }}
                                        disabled={!isApprovedTeacher}
                                        className="px-2.5 py-1.5 sm:px-3 sm:py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl transition-all flex items-center gap-1.5 text-xs font-bold shadow-sm disabled:opacity-50 disabled:cursor-not-allowed hover:shadow"
                                        title={isApprovedTeacher ? "Administrar alumnos del grupo" : "Requiere aprobación (luz verde)"}
                                    >
                                        <Users className="w-4 h-4" />
                                        <span className="hidden sm:inline">Alumnos</span>
                                    </button>
                                )}

                                {activeTab !== 'group' && selectedConversationId && (
                                    <div className="flex items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={() => setShowResolveConfirmModal(true)}
                                            className="px-2.5 py-1.5 sm:px-3 sm:py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition flex items-center gap-1 shadow-sm cursor-pointer"
                                            title="Dar por resuelta esta duda y cerrar el chat"
                                        >
                                            <CheckCircle className="w-3.5 h-3.5" />
                                            <span className="hidden sm:inline">Duda resuelta</span>
                                            <span className="sm:hidden">Resuelta</span>
                                        </button>

                                        {isTeacher ? (
                                            activeConversation?.teacherId === user?.id ? (
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        if (!isApprovedTeacher) return;
                                                        assignMutation.mutate({ tId: null });
                                                    }}
                                                    disabled={assignMutation.isPending || !isApprovedTeacher}
                                                    className="px-2.5 py-1.5 sm:px-3 sm:py-1.5 bg-red-50 hover:bg-red-100 dark:bg-red-950/20 dark:hover:bg-red-950/45 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-900/40 rounded-lg text-xs font-bold transition flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                                                    title="Liberar duda para que la atienda otro profesor"
                                                >
                                                    <span className="hidden sm:inline">Liberar ❌</span>
                                                    <span className="sm:hidden">Liberar</span>
                                                </button>
                                            ) : (
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        if (!isApprovedTeacher) return;
                                                        assignMutation.mutate({ tId: user?.id || null });
                                                    }}
                                                    disabled={assignMutation.isPending || !isApprovedTeacher}
                                                    className="px-2.5 py-1.5 sm:px-3 sm:py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition flex items-center gap-1 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                                                >
                                                    <span className="hidden sm:inline">Elegir 👋</span>
                                                    <span className="sm:hidden">Elegir</span>
                                                </button>
                                            )
                                        ) : (
                                            <div className="flex items-center gap-2 border border-slate-200 dark:border-slate-700 rounded-xl p-1.5 bg-slate-50 dark:bg-slate-800 shrink-0">
                                                <span className="text-[10px] text-slate-550 dark:text-slate-400 font-extrabold uppercase tracking-wide px-1.5 whitespace-nowrap hidden sm:block">Tutor:</span>
                                                <select
                                                    disabled={assignMutation.isPending}
                                                    value={activeConversation?.teacherId || ''}
                                                    onChange={(e) => assignMutation.mutate({ tId: e.target.value || null })}
                                                    className="bg-white dark:bg-slate-700 border-none rounded-lg text-xs py-1.5 px-2.5 font-bold text-slate-800 dark:text-slate-150 focus:ring-1 focus:ring-primary outline-none cursor-pointer max-w-[120px]"
                                                >
                                                    <option value="">Soporte</option>
                                                    {teachers?.map(t => (
                                                        <option key={t.id} value={t.id}>{t.name}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        )}
                                    </div>
                                )}


                            </div>
                        </div>

                        {showResolveConfirmModal && (
                            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm animate-fadeIn">
                                <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 max-w-md w-full shadow-2xl border border-slate-100 dark:border-slate-700 space-y-4">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold text-lg">
                                            ✓
                                        </div>
                                        <div>
                                            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                                                Finalizar duda
                                            </h3>
                                            <p className="text-xs text-slate-500 dark:text-slate-400">
                                                Confirmación de resolución
                                            </p>
                                        </div>
                                    </div>
                                    <p className="text-sm text-slate-600 dark:text-slate-300">
                                        {user?.role === 'student'
                                            ? '¿Deseas marcar esta duda como resuelta? Se borrará todo el historial del chat.'
                                            : '¿Deseas dar por finalizada esta duda y cerrar el chat con el alumno? Se borrará todo el historial del chat y se eliminará al alumno del canal de dudas.'}
                                    </p>
                                    <div className="flex items-center justify-end gap-3 pt-2">
                                        <button
                                            type="button"
                                            disabled={isClosingDuda}
                                            onClick={() => setShowResolveConfirmModal(false)}
                                            className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-700 transition"
                                        >
                                            Cancelar
                                        </button>
                                        <button
                                            type="button"
                                            disabled={isClosingDuda}
                                            onClick={handleConfirmResolveDuda}
                                            className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-md transition flex items-center gap-2 disabled:opacity-50 cursor-pointer"
                                        >
                                            {isClosingDuda ? 'Finalizando...' : 'Sí, duda resuelta'}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Collapsible Classroom Services */}
                        {showVoiceCall && (
                            <div className="p-4 bg-slate-100/50 dark:bg-slate-900/45 border-b dark:border-slate-800">
                                <VoiceGroupCall courseId={selectedConversationId || ''} onClose={() => setShowVoiceCall(false)} />
                            </div>
                        )}

                        {showWhiteboard && (
                            <div className="fixed inset-0 z-[100] bg-slate-950/95 backdrop-blur-md flex flex-col p-0 sm:p-4 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] animate-fade-in w-full h-full">
                                <div className="flex-1 bg-white dark:bg-slate-900 rounded-none sm:rounded-2xl overflow-hidden shadow-2xl flex flex-col border border-slate-800 w-full h-full">
                                    <Whiteboard 
                                        courseId={selectedConversationId || ''} 
                                        isTeacher={true} 
                                        onClose={() => setShowWhiteboard(false)} 
                                    />
                                </div>
                            </div>
                        )}

                        {/* Messages Panel */}
                        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4 min-h-0">
                            {isChatLoading ? (
                                <div className="flex justify-center items-center h-full"><Spinner /></div>
                            ) : (
                                activeMessages?.map(msg => (
                                    <MessageBubble 
                                        key={msg.id} 
                                        message={msg} 
                                        canManage={
                                            user?.role === 'admin' || 
                                            (activeTab === 'group' 
                                                ? msg.senderId === user?.id 
                                                : activeTab === 'peer' 
                                                    ? true 
                                                    : activeTab === 'teacher' 
                                                        ? msg.senderId === user?.id 
                                                        : (!isTeacher || msg.senderRole === 'teacher' || (isTeacher && activeConversation?.teacherId === user?.id))
                                            )
                                        }
                                        onEdit={async (messageId, text) => {
                                            await editMessage(messageId, text);
                                        }}
                                        onDelete={async (messageId) => {
                                            await deleteMessage(messageId);
                                        }}
                                    />
                                ))
                            )}
                            <div ref={messagesEndRef} />
                        </div>

                        {/* Send Form */}
                        <form onSubmit={handleSendMessage} className="p-3 md:p-4 bg-white dark:bg-slate-800 border-t dark:border-slate-700 w-full max-w-full box-border overflow-hidden">
                            {attachments.length > 0 && (
                                <div className="flex flex-wrap gap-2 mb-2 p-2 bg-gray-50 dark:bg-slate-900 rounded-lg border dark:border-slate-705">
                                    {attachments.map((att, index) => (
                                        <div key={index} className="relative flex items-center gap-2 p-1.5 pr-8 bg-white dark:bg-slate-800 rounded-md border dark:border-slate-750 shadow-sm max-w-[200px]">
                                            {att.type.startsWith('image/') ? (
                                                <img src={att.url} alt="Previsualizar" className="w-8 h-8 rounded object-cover" />
                                            ) : (
                                                <div className="w-8 h-8 rounded bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center flex-shrink-0">
                                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" className="w-4 h-4">
                                                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                                                    </svg>
                                                </div>
                                            )}
                                            <span className="text-[10px] font-semibold truncate text-slate-700 dark:text-slate-300">{att.name}</span>
                                            <button
                                                type="button"
                                                onClick={() => removeAttachment(index)}
                                                className="absolute top-1 right-1 p-0.5 text-slate-400 hover:text-red-500 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                                            >
                                                <CloseIcon className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                            <div className="flex items-end gap-2 p-2 border rounded-xl bg-gray-50 dark:bg-slate-700 focus-within:ring-2 focus-within:ring-indigo-600 transition-shadow dark:border-slate-600 w-full min-w-0 box-border">
                                <button
                                    type="button"
                                    onClick={() => fileInputRef.current?.click()}
                                    disabled={!isApprovedTeacher}
                                    className="p-2 text-slate-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-white rounded-lg hover:bg-gray-200/50 dark:hover:bg-slate-600 transition-colors flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
                                    title={isApprovedTeacher ? "Adjuntar imágenes o archivos" : "Requiere aprobación (luz verde)"}
                                >
                                    <PaperclipIcon className="w-5 h-5" />
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setIsCameraOpen(true)}
                                    disabled={!isApprovedTeacher}
                                    className="p-2 text-slate-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-white rounded-lg hover:bg-gray-200/50 dark:hover:bg-slate-600 transition-colors flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
                                    title={isApprovedTeacher ? "Hacer foto directamente" : "Requiere aprobación (luz verde)"}
                                >
                                    <CameraIcon className="w-5 h-5" />
                                </button>
                                <input 
                                    type="file"
                                    ref={fileInputRef}
                                    onChange={handleFileChange}
                                    multiple
                                    className="hidden"
                                    disabled={!isApprovedTeacher}
                                />
                                <textarea
                                    ref={textareaRef} 
                                    value={input}
                                    onChange={handleInput}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' && !e.shiftKey) {
                                            e.preventDefault();
                                            handleSendMessage(e);
                                        }
                                    }}
                                    placeholder={isApprovedTeacher ? "Escribe tu respuesta..." : "No tienes luz verde de administración para enviar mensajes."}
                                    rows={1}
                                    className="flex-1 bg-transparent border-none focus:ring-0 resize-none p-1 text-slate-900 dark:text-slate-100 placeholder-gray-500 dark:placeholder-slate-400 max-h-40 outline-none text-sm disabled:cursor-not-allowed"
                                    autoFocus
                                    disabled={!isApprovedTeacher || isSending}
                                />
                                <button 
                                    type="submit" 
                                    disabled={(!input.trim() && attachments.length === 0) || isSending || !isApprovedTeacher}
                                    className="p-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:bg-slate-300 dark:disabled:bg-slate-700 disabled:cursor-not-allowed transition-colors flex-shrink-0"
                                    aria-label="Enviar mensaje"
                                >
                                    {isSending ? <Spinner /> : <PaperAirplaneIcon className="w-5 h-5" />}
                                </button>
                             </div>
                        </form>
                        <CameraModal 
                            isOpen={isCameraOpen} 
                            onClose={() => setIsCameraOpen(false)} 
                            onCapture={handleCapturePhoto} 
                        />
                        <ClassReplayModal 
                            isOpen={isReplayModalOpen}
                            onClose={() => setIsReplayModalOpen(false)}
                            courseId={selectedConversationId || ''}
                        />
                        {selectedConversationId && activeTab === 'group' && (
                            <ManageStudentsModal 
                                isOpen={isManageStudentsModalOpen} 
                                onClose={() => setIsManageStudentsModalOpen(false)} 
                                courseId={selectedConversationId}
                            />
                        )}
                        {showClearChatModal && (
                            <div className="fixed inset-0 z-[110] bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
                                <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl p-6 max-w-md w-full border border-slate-200 dark:border-slate-700 space-y-4">
                                    <h3 className="text-lg font-black text-slate-900 dark:text-slate-100 flex items-center gap-2">
                                        <ShieldAlert className="w-5 h-5 text-red-600" />
                                        <span>¿Limpiar historial de chat?</span>
                                    </h3>
                                    <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                                        Esta acción eliminará permanentemente <strong>todos los mensajes</strong> de este canal/conversación. No se puede deshacer. ¿Deseas continuar?
                                    </p>
                                    <div className="flex justify-end gap-3 pt-2">
                                        <button
                                            type="button"
                                            onClick={() => setShowClearChatModal(false)}
                                            disabled={isClearingChat}
                                            className="px-4 py-2 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold hover:bg-slate-300 transition cursor-pointer"
                                        >
                                            Cancelar
                                        </button>
                                        <button
                                            type="button"
                                            onClick={handleClearChat}
                                            disabled={isClearingChat}
                                            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold shadow transition flex items-center gap-2 cursor-pointer disabled:opacity-50"
                                        >
                                            {isClearingChat ? <Spinner /> : null}
                                            <span>Sí, limpiar chat</span>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </>
                )) : (
                    <div className="flex flex-col justify-center items-center h-full text-center text-slate-500 dark:text-slate-400 p-8">
                        <ChatBubbleLeftRightIcon className="w-20 h-20 text-indigo-300 dark:text-slate-700 animate-pulse" />
                        <h2 className="mt-4 text-lg font-black text-slate-900 dark:text-slate-100">Bandeja de Entrada</h2>
                        <p className="text-xs text-slate-500 mt-1 max-w-sm">Elige una duda de estudiante desde la barra lateral izquierda para responder o gestionar su tutoría.</p>
                    </div>
                )}
            </div>
        </div>
    );
};
