import React, { useState, useEffect, useRef, useContext, Fragment, useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useVirtualizer } from '@tanstack/react-virtual';
import { motion, AnimatePresence } from 'motion/react';
import { useNavigate, useLocation } from 'react-router-dom';
import { 
    MessageSquare, 
    UserPlus, 
    Search, 
    Send, 
    Phone, 
    Mail, 
    ArrowLeft, 
    User, 
    X, 
    Check, 
    CheckCheck,
    Users, 
    Smile,
    Plus,
    Compass,
    BookOpen,
    ShieldAlert,
    Paperclip,
    Camera,
    PenTool,
    Video,
    HelpCircle,
    ChevronDown
} from 'lucide-react';
import { ROUTES } from '../constants/routes';
import { normalizeMessageTimestamp, formatMessageTime } from '../utils/chatUtils';
import { AuthContext } from '../contexts/AuthContext';
import { useChat } from '../hooks/useChat';
import { ClassReplayModal } from './ClassReplayModal';
import { NotificationContext } from '../contexts/NotificationContext';
import * as api from '../services/api';
import { SubscriptionGate } from './SubscriptionGate';
import { Spinner } from './ui/Spinner';
import { useBackNavigation } from '../hooks/useBackNavigation';
import { useI18n } from '../hooks/useI18n';
import { eventEmitter } from '../services/eventService';
import type { StudentPeerConversation, StudentPeerMessage, StudentFriend, CourseGroupMessage, CourseGroupConversation, Attachment } from '../types';
import { CameraModal } from './CameraModal';
import { VoiceGroupCall } from './VoiceGroupCall';
import { Whiteboard } from './Whiteboard';
import { db } from '../services/firebase';
import { doc, onSnapshot, collection } from 'firebase/firestore';

// Helper to check if two dates are on the same day
const isSameDay = (d1: Date, d2: Date) => {
    return d1.getFullYear() === d2.getFullYear() &&
           d1.getMonth() === d2.getMonth() &&
           d1.getDate() === d2.getDate();
};

// Formatter for date separations
const formatDateSeparator = (date: Date) => {
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);

    if (isSameDay(date, today)) return 'Hoy';
    if (isSameDay(date, yesterday)) return 'Ayer';
    
    return date.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
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
                        <div key={idx} className="relative group max-w-xs rounded-lg overflow-hidden border dark:border-slate-650 bg-black/5 mt-1.5 font-sans shadow-sm">
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
                            <p className="text-xs font-semibold truncate pr-2 text-left" title={att.name}>{att.name}</p>
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

// --- PEER MESSAGE BUBBLE ---
const PeerMessageBubble: React.FC<{ 
    message: any; 
    currentStudentId: string;
}> = React.memo(({ message, currentStudentId }) => {
    const isMe = message.senderId === currentStudentId;
    
    return (
        <motion.div 
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className={`flex gap-2.5 items-start w-full ${isMe ? 'justify-end' : 'justify-start'}`}
        >
            {!isMe && (
                <img
                    loading="lazy"
                    width="36"
                    height="36"
                    className="w-8 h-8 sm:w-9 sm:h-9 rounded-full object-cover bg-indigo-50 border border-slate-200 flex-shrink-0"
                    src={`https://api.dicebear.com/8.x/initials/svg?seed=${message.senderName}`}
                    alt={`Avatar de ${message.senderName}`}
                />
            )}
            <div className="flex flex-col max-w-[85%] sm:max-w-[75%] min-w-0">
                {!isMe && (
                    <span className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 ml-2 mb-0.5">
                        {message.senderName}
                    </span>
                )}
                <div className={`mobile-responsive-bubble shadow-sm relative min-w-0 ${
                    isMe 
                    ? 'bg-gradient-to-r from-indigo-600 to-indigo-700 text-white rounded-tr-none' 
                    : 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 rounded-tl-none border border-slate-150 dark:border-slate-600'
                }`}>
                    {message.text && <p className="whitespace-pre-wrap text-sm break-words [word-break:break-word] font-sans">{message.text}</p>}
                    <RenderAttachments attachments={message.attachments} />
                    <div className="flex items-center justify-end gap-1 mt-1 font-sans">
                        <span className={`text-[9px] font-semibold leading-none ${isMe ? 'text-indigo-200/80' : 'text-slate-400 dark:text-slate-400'}`}>
                            {formatMessageTime(message.timestamp)}
                        </span>
                        {isMe && (
                            <span 
                                className="self-end leading-none ml-0.5 cursor-help"
                                title={message?.conversationId ? (message.isRead ? "Visto" : "Entregado") : "Enviado al grupo"}
                            >
                                {message?.conversationId ? (
                                    message.isRead ? (
                                        <CheckCheck className="w-3.5 h-3.5 text-emerald-300 dark:text-emerald-400 drop-shadow-sm inline-block" />
                                    ) : (
                                        <CheckCheck className="w-3.5 h-3.5 text-indigo-300/60 dark:text-slate-400/50 drop-shadow-sm inline-block" />
                                    )
                                ) : (
                                    <Check className="w-3.5 h-3.5 text-indigo-300/60 dark:text-slate-400/50 drop-shadow-sm inline-block" />
                                )}
                            </span>
                        )}
                    </div>
                </div>
            </div>
            {isMe && (
                <img
                    loading="lazy"
                    width="36"
                    height="36"
                    className="w-8 h-8 sm:w-9 sm:h-9 rounded-full object-cover bg-emerald-50 border border-slate-200 flex-shrink-0"
                    src={`https://api.dicebear.com/8.x/initials/svg?seed=${message.senderName}`}
                    alt="Tu avatar"
                />
            )}
        </motion.div>
    );
});

// --- MAIN COMPONENT ---
export interface StudentChatPageProps {
    initialTab?: 'private' | 'group';
}

export const StudentChatPage: React.FC<StudentChatPageProps> = ({ initialTab }) => {
    useEffect(() => {
        console.log(`[F110.30] [STUDENT_CHAT_MOUNT] | timestamp: ${performance.now()}`);
    }, []);

    const { t } = useI18n();
    const { user } = useContext(AuthContext);
    const { addToast } = useContext(NotificationContext);
    const queryClient = useQueryClient();
    const handleBack = useBackNavigation();
    const navigate = useNavigate();
    
    const location = useLocation();
    const [searchQuery, setSearchQuery] = useState('');
    const [activeConvoId, setActiveConvoId] = useState<string | null>(location.state?.activeConvoId || null);
    const [activeChatType, setActiveChatType] = useState<'private' | 'group'>(initialTab || location.state?.activeChatType || 'private');
    const [activeTab, setActiveTab] = useState<'private' | 'group'>(initialTab || location.state?.activeChatType || 'private');

    const [showVoiceCall, setShowVoiceCall] = useState(false);
    const [isVoiceCallActive, setIsVoiceCallActive] = useState(false);
    const [showWhiteboard, setShowWhiteboard] = useState(false);
    const [isWhiteboardActive, setIsWhiteboardActive] = useState(false);
    const [isReplayModalOpen, setIsReplayModalOpen] = useState(false);
    const [activeWhiteboards, setActiveWhiteboards] = useState<Record<string, { active: boolean; updatedBy?: string; updatedAt?: string }>>({});
    const [globalToastNotice, setGlobalToastNotice] = useState<{ id: string; title: string; convoId: string } | null>(null);
    const autoOpenedBoardRef = useRef<Record<string, boolean>>({});

    // Manage body attribute to hide mobile bottom navbar when inside active chat thread
    useEffect(() => {
        if (activeConvoId) {
            document.body.setAttribute('data-active-chat-thread', 'true');
        } else {
            document.body.removeAttribute('data-active-chat-thread');
        }
        return () => {
            document.body.removeAttribute('data-active-chat-thread');
        };
    }, [activeConvoId]);

    // Auto-listen to whiteboard and voice call rooms for active chat
    useEffect(() => {
        if (activeConvoId) {
            const boardMetaRef = doc(db, 'whiteboards', activeConvoId);
            const unsubBoard = onSnapshot(boardMetaRef, (snapshot) => {
                const isActive = snapshot.exists() && snapshot.data()?.active === true;
                setIsWhiteboardActive(isActive);
                if (isActive && !autoOpenedBoardRef.current[activeConvoId]) {
                    autoOpenedBoardRef.current[activeConvoId] = true;
                    setShowWhiteboard(true);
                } else if (!isActive) {
                    autoOpenedBoardRef.current[activeConvoId] = false;
                }
            });

            let unsubVoice = () => {};
            if (activeConvoId.includes(studentId)) {
                const voiceRef = doc(db, 'voice_group_calls', activeConvoId);
                unsubVoice = onSnapshot(voiceRef, (snapshot) => {
                    const data = snapshot.exists() ? snapshot.data() : null;
                    const participants = data?.participants || [];
                    const isActive = data?.active === true && Array.isArray(participants) && participants.length > 0;
                    setIsVoiceCallActive(isActive);
                }, () => {});
            }

            return () => {
                unsubBoard();
                unsubVoice();
            };
        } else {
            setIsWhiteboardActive(false);
            setIsVoiceCallActive(false);
        }
    }, [activeConvoId]);

    // Close voice and whiteboard if activeConvoId or chat type changes
    useEffect(() => {
        let applied = false;
        if (location.state?.activeConvoId) {
            console.log(`[F110.30] [STUDENT_CHAT_CLICK] | timestamp: ${performance.now()}`);
                                                setActiveConvoId(location.state.activeConvoId);
            applied = true;
        }
        if (location.state?.activeChatType) {
            setActiveChatType(location.state.activeChatType);
            setActiveTab(location.state.activeChatType);
            applied = true;
        }
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
    const [inputMessage, setInputMessage] = useState('');
    
    // Add friend Modal / Collapse State
    const [isAddFriendOpen, setIsAddFriendOpen] = useState(false);
    const [contactInput, setContactInput] = useState('');
    const [addFriendError, setAddFriendError] = useState('');
    const [isAddingFriend, setIsAddingFriend] = useState(false);
    
    // Live Search student state
    const [searchResults, setSearchResults] = useState<(StudentFriend & { isConnected: boolean })[]>([]);
    const [isSearching, setIsSearching] = useState(false);

    const scrollRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const [showNewMessageIndicator, setShowNewMessageIndicator] = useState(false);
    const prevConvoIdRef = useRef<string | null>(null);
    const prevItemsLengthRef = useRef<number>(0);

    const checkIsNearBottom = useCallback(() => {
        if (!scrollRef.current) return true;
        const { scrollHeight, scrollTop, clientHeight } = scrollRef.current;
        return scrollHeight - scrollTop - clientHeight < 150;
    }, []);

    const handleScroll = useCallback(() => {
        if (showNewMessageIndicator && checkIsNearBottom()) {
            setShowNewMessageIndicator(false);
        }
    }, [showNewMessageIndicator, checkIsNearBottom]);

    const studentId = user?.role === 'student' ? user.id : '';
    const studentName = user?.role === 'student' ? user.name : '';

    // Trigger live student search
    useEffect(() => {
        if (!contactInput.trim() || !studentId) {
            setSearchResults([]);
            return;
        }

        const delayDebounce = setTimeout(async () => {
            setIsSearching(true);
            setAddFriendError('');
            try {
                const results = await api.searchStudents(studentId, contactInput.trim());
                setSearchResults(results);
            } catch (err) {
                console.error(err);
            } finally {
                setIsSearching(false);
            }
        }, 200);

        return () => clearTimeout(delayDebounce);
    }, [contactInput, studentId]);

    // --- QUERIES ---
    // Fetch friends
    const { data: friends = [], isLoading: loadingFriends } = useQuery<StudentFriend[]>({
        queryKey: ['peer-friends', studentId],
        queryFn: () => api.fetchStudentFriends(studentId),
        enabled: !!studentId,
    });

    console.log(`[F110.30] [USECHAT_CALL] | timestamp: ${performance.now()} | activeConvoId: ${activeConvoId}`);
    const { messages: unifiedMessages, loading: loadingUnifiedMessages, sendMessage, markAsRead } = useChat(activeConvoId, studentId);

    useEffect(() => {
        if (!loadingUnifiedMessages && activeConvoId) {
            console.log(`[F110.30] [CHAT_READY] | timestamp: ${performance.now()} | activeConvoId: ${activeConvoId}`);
        }
    }, [loadingUnifiedMessages, activeConvoId]);

    // Replace old message arrays with unified messages if conversation is active
    const messages = activeChatType === 'private' ? unifiedMessages : [];
    const loadingMessages = activeChatType === 'private' ? loadingUnifiedMessages : false;
    const groupMessages = activeChatType === 'group' ? unifiedMessages : [];
    const loadingGroupMessages = activeChatType === 'group' ? loadingUnifiedMessages : false;

    // Fetch conversations
    const { data: conversations = [], isLoading: loadingConversations } = useQuery<StudentPeerConversation[]>({
        queryKey: ['peer-conversations', studentId],
        queryFn: () => api.fetchPeerConversations(studentId),
        enabled: !!studentId,
        staleTime: 30000,
    });

    // Fetch course group conversations (channels the student is enrolled in)
    const { data: groupConversations = [], isLoading: loadingGroupConversations } = useQuery<CourseGroupConversation[]>({
        queryKey: ['group-conversations', studentId],
        queryFn: () => api.fetchCourseGroupConversations(studentId),
        enabled: !!studentId,
        staleTime: 30000,
    });

    // Fetch classmates of same academic level
    const { data: classmatesOfSameLevel = [], isLoading: loadingClassmates } = useQuery({
        queryKey: ['classmates-same-level', studentId],
        queryFn: () => api.fetchClassmatesOfSameLevel(studentId),
        enabled: !!studentId,
    });

    // Helper to verify if a conversation or board ID belongs to current student
    const isConvoForUser = useCallback((convoId: string) => {
        if (!studentId || !user) return false;
        // 1. Group / course enrollment match
        const isGroupEnrolled = (groupConversations || []).some(g => g.id === convoId) || 
            ((user as any)?.enrolledCourseIds || []).includes(convoId);
        if (isGroupEnrolled) return true;

        // 2. Private conversation match
        const isPrivateConvo = (conversations || []).some(c => c.id === convoId || c.participantIds?.includes(studentId));
        if (isPrivateConvo) return true;

        // 3. Direct ID match (e.g. peer_studentId_... or tutoring_studentId or studentId)
        if (convoId.includes(studentId) || convoId === studentId) return true;

        return false;
    }, [studentId, user, groupConversations, conversations]);

    // Listen for active whiteboards for the specific courses the student is enrolled in
    useEffect(() => {
        if (!user || user.role !== 'student' || !(user as any).enrolledCourseIds) return;

        let unsubs: (() => void)[] = [];
        let map: Record<string, { active: boolean; updatedBy?: string; updatedAt?: string }> = {};
        
        (user as any).enrolledCourseIds.forEach((courseId: string) => {
            const docRef = doc(db, 'whiteboards', courseId);
            const unsub = onSnapshot(docRef, (docSnap) => {
                if (docSnap.exists()) {
                    const data = docSnap.data();
                    if (data.active === true) {
                        map[docSnap.id] = {
                            active: true,
                            updatedBy: data.updatedBy,
                            updatedAt: data.updatedAt
                        };
                        
                        // Show toast notice if it's new
                        if (isConvoForUser(docSnap.id)) {
                            // In a real app we'd track if we already showed it, but this is simplified
                            // We can rely on RealtimeAlertsBanner to show the actual toast, 
                            // this map is mostly for the UI badges
                        }
                    } else {
                        delete map[docSnap.id];
                    }
                } else {
                    delete map[docSnap.id];
                }
                setActiveWhiteboards({ ...map });
            }, (err) => {
                console.warn("Error subscribing to specific whiteboard:", err.message);
            });
            unsubs.push(unsub);
        });
        
        // Admins use a separate global listener in AdminChatPage, no need here since this is StudentChatPage

        return () => {
            unsubs.forEach(u => u());
        };
    }, [user, isConvoForUser]);

    // --- MUTATIONS ---
    // Add friend
    const addFriendMutation = useMutation({
        mutationFn: (contact: string) => api.addFriendByContact(studentId, contact),
        onMutate: () => {
            setIsAddingFriend(true);
            setAddFriendError('');
        },
        onSuccess: (newFriend) => {
            setIsAddingFriend(false);
            setContactInput('');
            setIsAddFriendOpen(false);
            setSearchResults([]);
            addToast(`¡Has añadido a ${newFriend.name} a tus compañeros de chat!`, 'success');
            
            // Invalidate queries
            queryClient.invalidateQueries({ queryKey: ['peer-friends', studentId] });
            queryClient.invalidateQueries({ queryKey: ['peer-conversations', studentId] });
            queryClient.invalidateQueries({ queryKey: ['classmates-same-level', studentId] });

            // Automatically open this new chat
            const derivedConvoId = `peer_${[studentId, newFriend.id].sort().join('_')}`;
            console.log(`[F110.30] [STUDENT_CHAT_CLICK] | timestamp: ${performance.now()}`);
                                                setActiveConvoId(derivedConvoId); setShowVoiceCall(false); setShowWhiteboard(false);
            setActiveChatType('private');
            setActiveTab('private');
        },
        onError: (error: any) => {
            setIsAddingFriend(false);
            setAddFriendError(error.message || 'Error al añadir al compañero.');
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

    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (isSending) return;
        if ((!inputMessage.trim() && attachments.length === 0) || !activeConvoId) return;

        setIsSending(true);
        try {
            await sendMessage(inputMessage.trim(), 'text', undefined, attachments, 'student');
            setInputMessage('');
            setAttachments([]);
            if (textareaRef.current) {
                textareaRef.current.style.height = 'auto';
            }
            if (activeChatType === 'group') {
                queryClient.invalidateQueries({ queryKey: ['group-conversations', studentId] });
            } else {
                queryClient.invalidateQueries({ queryKey: ['peer-conversations', studentId] });
            }
        } catch (error) {
            addToast('Error al enviar el mensaje. Inténtalo más tarde.', 'error');
        } finally {
            setIsSending(false);
        }
    };

    // Mark as read immediately when active chat changes or receiving messages
    useEffect(() => {
        if (activeConvoId && studentId) {
            if (activeChatType === 'private') {
                markAsRead();
                queryClient.invalidateQueries({ queryKey: ['peer-conversations', studentId] });
            } else if (activeChatType === 'group') {
                api.markCourseGroupAsRead(activeConvoId, studentId);
                queryClient.invalidateQueries({ queryKey: ['group-conversations', studentId] });
            }
        }
    }, [activeConvoId, activeChatType, studentId, messages?.length, queryClient, markAsRead]);

    // Real-time peer and group synchronization listening to mock push updates
    useEffect(() => {
        const handlePeerMessage = (msg: any) => {
            if (activeChatType === 'private' && msg?.conversationId === activeConvoId) {
                queryClient.invalidateQueries({ queryKey: ['peer-messages', activeConvoId] });
            }
            queryClient.invalidateQueries({ queryKey: ['peer-conversations', studentId] });
        };
        const handleGroupMessage = (msg: any) => {
            if (activeChatType === 'group' && msg?.courseId === activeConvoId) {
                queryClient.invalidateQueries({ queryKey: ['group-messages', activeConvoId] });
            }
            queryClient.invalidateQueries({ queryKey: ['group-conversations', studentId] });
        };

        eventEmitter.on('peer-message-update', handlePeerMessage);
        eventEmitter.on('group-message-update', handleGroupMessage);
        eventEmitter.on('course-group-message-update', handleGroupMessage);

        return () => {
            eventEmitter.off('peer-message-update', handlePeerMessage);
            eventEmitter.off('group-message-update', handleGroupMessage);
            eventEmitter.off('course-group-message-update', handleGroupMessage);
        };
    }, [activeConvoId, activeChatType, studentId, queryClient]);

    const handleInviteSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!contactInput.trim()) return;
        addFriendMutation.mutate(contactInput.trim());
    };

    const handleTextareaInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setInputMessage(e.target.value);
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            textareaRef.current.style.height = `${e.target.scrollHeight}px`;
        }
    };

    // Calculate active chat participant or group details
    const activeConversationDetails = useMemo(() => {
        if (!activeConvoId) return null;
        
        if (activeChatType === 'group') {
            const group = groupConversations.find(g => g.id === activeConvoId);
            return {
                id: activeConvoId,
                name: group?.name || 'Grupo de Curso',
                email: 'Canal de colaboración grupal',
                phone: `${group?.enrolledStudentsCount || 0} alumnos activos`,
                avatar: `https://api.dicebear.com/8.x/identicon/svg?seed=${activeConvoId}`,
                isGroup: true
            };
        } else {
            const convo = conversations.find(c => c.id === activeConvoId);
            let destinationStudentId = '';
            if (convo) {
                destinationStudentId = convo.participantIds.find(id => id !== studentId) || '';
            } else if (activeConvoId.startsWith('peer_')) {
                const parts = activeConvoId.replace('peer_', '').split('_');
                destinationStudentId = parts.find(p => p !== studentId) || parts[0] || '';
            }

            if (!destinationStudentId) return null;

            const friendDetails = friends.find(f => f.id === destinationStudentId) || 
                searchResults.find(s => s.id === destinationStudentId) ||
                classmatesOfSameLevel.find(c => c.id === destinationStudentId);

            return {
                id: destinationStudentId,
                name: friendDetails?.name || `Compañero (${destinationStudentId})`,
                email: friendDetails?.email || '',
                phone: friendDetails?.phone || '',
                avatar: friendDetails?.avatar || `https://api.dicebear.com/8.x/initials/svg?seed=${destinationStudentId}`,
                isGroup: false
            };
        }
    }, [activeConvoId, activeChatType, conversations, friends, groupConversations, studentId, searchResults, classmatesOfSameLevel]);

    // Flatten active messages with date separators for dynamic virtualization
    const flattenedItems = useMemo(() => {
        const rawMessages = activeChatType === 'group' ? groupMessages : messages;
        if (!rawMessages || rawMessages.length === 0) return [];
        
        const items: (
            | { type: 'date'; date: string; id: string }
            | { type: 'message'; message: any; id: string }
        )[] = [];
        
        let lastDateStr = '';
        rawMessages.forEach((msg: any) => {
            const msgDate = normalizeMessageTimestamp(msg.timestamp);
            const formattedDate = formatDateSeparator(msgDate);
            if (formattedDate !== lastDateStr) {
                items.push({
                    type: 'date',
                    date: formattedDate,
                    id: `date-${formattedDate}-${msg.id}`
                });
                lastDateStr = formattedDate;
            }
            items.push({
                type: 'message',
                message: msg,
                id: msg.id
            });
        });
        return items;
    }, [activeChatType, messages, groupMessages]);

    const rowVirtualizer = useVirtualizer({
        count: flattenedItems.length,
        getScrollElement: () => scrollRef.current,
        estimateSize: (index) => {
            const item = flattenedItems[index];
            if (!item) return 80;
            if (item.type === 'date') return 52;
            const text = item.message?.text || '';
            const isMe = item.message?.senderId === studentId;
            const baseHeight = isMe ? 60 : 76;
            const charsPerLine = 45;
            const lineCount = Math.max(1, Math.ceil(text.length / charsPerLine));
            return baseHeight + lineCount * 22;
        },
        overscan: 15,
    });

    const scrollToBottom = useCallback((smooth = true) => {
        setShowNewMessageIndicator(false);
        if (flattenedItems.length > 0) {
            rowVirtualizer.scrollToIndex(flattenedItems.length - 1, {
                align: 'end',
                behavior: smooth ? 'smooth' : 'auto'
            });
        }
    }, [flattenedItems.length, rowVirtualizer]);

    // Scroll chat stream to bottom or show indicator depending on scroll position and message origin
    useEffect(() => {
        if (flattenedItems.length === 0) return;

        const isNewConvo = activeConvoId !== prevConvoIdRef.current;
        const isNewMessage = flattenedItems.length > prevItemsLengthRef.current;

        prevConvoIdRef.current = activeConvoId;
        prevItemsLengthRef.current = flattenedItems.length;

        if (isNewConvo) {
            setShowNewMessageIndicator(false);
            scrollToBottom(false);
            return;
        }

        if (isNewMessage) {
            const lastItem = flattenedItems[flattenedItems.length - 1];
            const isMyMessage = lastItem?.type === 'message' && lastItem.message?.senderId === studentId;
            const isNearBottom = checkIsNearBottom();

            if (isMyMessage || isNearBottom) {
                setShowNewMessageIndicator(false);
                requestAnimationFrame(() => {
                    scrollToBottom(true);
                });
            } else {
                setShowNewMessageIndicator(true);
            }
        }
    }, [flattenedItems, activeConvoId, studentId, checkIsNearBottom, scrollToBottom]);

    // Filter conversations list based on query search
    const filteredConversationsList = useMemo(() => {
        return conversations.map(convo => {
            const otherParticipantId = convo.participantIds.find(id => id !== studentId) || '';
            const friend = friends.find(f => f.id === otherParticipantId) ||
                classmatesOfSameLevel.find(c => c.id === otherParticipantId) ||
                searchResults.find(s => s.id === otherParticipantId);
            return {
                ...convo,
                friendName: friend?.name || `Compañero (${otherParticipantId})`,
                friendAvatar: friend?.avatar || `https://api.dicebear.com/8.x/initials/svg?seed=${otherParticipantId}`,
                friendPhone: friend?.phone || '',
                friendEmail: friend?.email || ''
            };
        }).filter(convo => {
            const query = searchQuery.toLowerCase();
            return convo.friendName.toLowerCase().includes(query) ||
                   convo.friendPhone.includes(query) ||
                   convo.friendEmail.toLowerCase().includes(query);
        }).sort((a, b) => new Date(b.lastMessageTimestamp).getTime() - new Date(a.lastMessageTimestamp).getTime());
    }, [conversations, friends, classmatesOfSameLevel, searchResults, studentId, searchQuery]);

    // Filter course group conversations based on query search
    const filteredGroupConversationsList = useMemo(() => {
        return groupConversations.filter(g => {
            const query = searchQuery.trim().toLowerCase();
            if (!query) return true;
            return g.name.toLowerCase().includes(query) || g.lastMessageText.toLowerCase().includes(query);
        });
    }, [groupConversations, searchQuery]);

    return (
        <SubscriptionGate>
            <div className="flex bg-white dark:bg-slate-800 md:rounded-2xl md:shadow-xl md:border border-slate-200 dark:border-slate-700 h-full w-full max-w-full min-w-0 min-h-0 overflow-hidden animate-slide-in-up">
                
                {/* --- SIDEBAR LIST — HIDDEN ON MOBILE CHAT ACTIVE --- */}
                <div className={`w-full md:w-80 lg:w-96 flex flex-col border-r border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 flex-shrink-0 ${activeConvoId ? 'hidden md:flex' : 'flex'}`}>
                    
                    {/* Header Sidebar */}
                    <div className="p-4 border-b border-rose-50/50 dark:border-slate-700/80 bg-gradient-to-r from-slate-50 to-indigo-50/20 dark:from-slate-800/10 dark:to-slate-850/50">
                        <div className="flex items-center justify-between mb-3.5">
                            <div className="flex items-center gap-2">
                                <div className="p-2 bg-indigo-600 rounded-xl text-white shadow-sm shadow-indigo-500/10">
                                    <Users className="w-5 h-5" />
                                </div>
                                <div>
                                    <h1 className="text-xl font-bold text-slate-900 dark:text-slate-50">{t('studentChat.title')}</h1>
                                    <p className="text-[10px] sm:text-xs text-slate-500 font-medium">{t('studentChat.subtitle')}</p>
                                </div>
                            </div>
                            
                            {/* Invite button */}
                            <button
                                aria-label="Añadir compañero"
                                onClick={() => setIsAddFriendOpen(!isAddFriendOpen)}
                                className="p-2 bg-indigo-50 dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 rounded-xl hover:bg-indigo-100 dark:hover:bg-slate-650 hover:scale-105 active:scale-95 transition-all cursor-pointer border border-indigo-100/50 dark:border-slate-600/30 font-medium text-xs flex items-center gap-1"
                            >
                                <UserPlus className="w-4 h-4" />
                                <span className="hidden sm:inline">Añadir</span>
                            </button>
                        </div>

                        {/* Search Bar */}
                        <div className="relative">
                            <input
                                type="text"
                                aria-label="Buscar chat o grupo"
                                placeholder={activeTab === 'private' ? "Buscar chat, compañero o tlf..." : "Buscar grupo de curso..."}
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full pl-9 pr-4 py-2 bg-slate-100 dark:bg-slate-750 border-0 rounded-xl text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-900 dark:text-slate-50"
                            />
                            <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                            {searchQuery && (
                                <button 
                                    onClick={() => setSearchQuery('')} 
                                    className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600"
                                    aria-label="Limpiar búsqueda de chats"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            )}
                        </div>

                        {/* Tab Selector */}
                        <div className="flex gap-1.5 mt-3 p-1 bg-slate-100/80 dark:bg-slate-750/50 rounded-xl">
                            <button
                                onClick={() => {
                                    setActiveTab('private');
                                    setSearchQuery('');
                                }}
                                className={`flex-1 py-1.5 px-2 text-[11px] sm:text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1 cursor-pointer ${
                                    activeTab === 'private'
                                        ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm'
                                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
                                }`}
                            >
                                <MessageSquare className="w-3.5 h-3.5" />
                                <span>Privados</span>
                            </button>
                            <button
                                onClick={() => {
                                    setActiveTab('group');
                                    setSearchQuery('');
                                }}
                                className={`flex-1 py-1.5 px-2 text-[11px] sm:text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1 cursor-pointer ${
                                    activeTab === 'group'
                                        ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm'
                                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
                                }`}
                            >
                                <Users className="w-3.5 h-3.5" />
                                <span>Grupos ({groupConversations.length})</span>
                            </button>
                            <button
                                onClick={() => {
                                    navigate(ROUTES.CHAT);
                                }}
                                className="flex-1 py-1.5 px-2 text-[11px] sm:text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1 cursor-pointer text-emerald-600 dark:text-emerald-400 bg-emerald-50/80 dark:bg-emerald-950/40 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 border border-emerald-200/50 dark:border-emerald-800/40"
                                title="Ir al Chat de Dudas con Profesores"
                            >
                                <HelpCircle className="w-3.5 h-3.5" />
                                <span>Dudas</span>
                            </button>
                        </div>
                    </div>

                    {/* Collapsible Form to Add Friend */}
                    <AnimatePresence>
                        {isAddFriendOpen && (
                            <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                                className="border-b border-indigo-100 dark:border-slate-700 bg-indigo-50/40 dark:bg-slate-800/80 overflow-hidden"
                            >
                                <form onSubmit={handleInviteSubmit} className="p-4 space-y-3">
                                    <div className="flex items-center justify-between">
                                        <h3 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">Buscar y Añadir Alumno</h3>
                                        <button 
                                            type="button" 
                                            onClick={() => setIsAddFriendOpen(false)} 
                                            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                                            aria-label="Cerrar formulario de añadir amigo"
                                        >
                                            <X className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                    <div className="flex gap-2">
                                        <input
                                            type="text"
                                            required
                                            aria-label="Correo electrónico o teléfono del compañero de clase"
                                            placeholder="Escribe email o teléfono..."
                                            value={contactInput}
                                            onChange={(e) => {
                                                setContactInput(e.target.value);
                                                if (addFriendError) setAddFriendError('');
                                            }}
                                            className="flex-1 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 text-sm text-slate-900 dark:text-slate-50 placeholder-slate-400 focus:ring-2 focus:ring-indigo-500 outline-none"
                                        />
                                        <button
                                            type="submit"
                                            disabled={isAddingFriend || !contactInput.trim()}
                                            className="px-4 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors flex items-center justify-center min-w-[5rem]"
                                            aria-label="Enviar búsqueda o solicitud de conexión"
                                        >
                                            {isAddingFriend ? <Spinner /> : 'Buscar'}
                                        </button>
                                    </div>

                                    {/* Live Student Search Results */}
                                    {isSearching && (
                                        <div className="flex items-center gap-2 pt-1 text-xs text-indigo-500 font-medium">
                                            <Spinner />
                                            <span>Buscando alumnos...</span>
                                        </div>
                                    )}

                                    {!isSearching && contactInput.trim() !== '' && searchResults.length === 0 && (
                                        <div className="p-2.5 rounded-xl bg-amber-50/50 dark:bg-amber-950/10 border border-amber-100/30 text-[11px] text-amber-700 dark:text-amber-400">
                                            🔍 No se encontraron coincidencias exactas con "{contactInput}". Revisa si el email o teléfono es correcto.
                                        </div>
                                    )}

                                    {!isSearching && searchResults.length > 0 && (
                                        <div className="space-y-2 mt-2 max-h-48 overflow-y-auto pr-1">
                                            <p className="text-[10px] font-bold text-indigo-500/80 uppercase tracking-wider">Alumnos encontrados:</p>
                                            {searchResults.map((stu) => (
                                                <div key={stu.id} className="flex items-center justify-between gap-3 p-2 rounded-xl bg-white dark:bg-slate-750 border border-slate-100 dark:border-slate-700 shadow-sm hover:border-indigo-100 dark:hover:border-indigo-900/40 transition-colors">
                                                    <div className="flex items-center gap-2.5 min-w-0">
                                                        <img 
                                                            src={stu.avatar} 
                                                            alt={stu.name} 
                                                            className="w-8 h-8 rounded-full border border-slate-150 dark:border-slate-600 bg-slate-50 flex-shrink-0"
                                                        />
                                                        <div className="min-w-0">
                                                            <p className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">{stu.name}</p>
                                                            <p className="text-[10px] text-slate-400 dark:text-slate-400 truncate flex items-center gap-1">
                                                                <Mail className="w-2.5 h-2.5" /> {stu.email}
                                                            </p>
                                                            <p className="text-[10px] text-slate-400 dark:text-slate-400 truncate flex items-center gap-1">
                                                                <Phone className="w-2.5 h-2.5" /> {stu.phone}
                                                            </p>
                                                        </div>
                                                    </div>
                                                    
                                                    {stu.isConnected ? (
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                const derivedConvoId = `peer_${[studentId, stu.id].sort().join('_')}`;
                                                                console.log(`[F110.30] [STUDENT_CHAT_CLICK] | timestamp: ${performance.now()}`);
                                                setActiveConvoId(derivedConvoId); setShowVoiceCall(false); setShowWhiteboard(false);
                                                                setActiveChatType('private');
                                                                setActiveTab('private');
                                                                setContactInput('');
                                                                setIsAddFriendOpen(false);
                                                                setSearchResults([]);
                                                                addFriendMutation.mutate(stu.email);
                                                            }}
                                                            className="p-1 px-2.5 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 rounded-lg text-[10.5px] font-bold hover:bg-emerald-100 dark:hover:bg-emerald-900/30 flex items-center gap-0.5"
                                                        >
                                                            <Check className="w-3 h-3 text-emerald-500" />
                                                            <span>Chatear</span>
                                                        </button>
                                                    ) : (
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                addFriendMutation.mutate(stu.email);
                                                            }}
                                                            disabled={isAddingFriend}
                                                            className="p-1 px-2.5 bg-indigo-600 text-white hover:bg-indigo-700 rounded-lg text-[10.5px] font-bold transition-all hover:scale-102 flex items-center gap-0.5"
                                                        >
                                                            {isAddingFriend ? <Spinner /> : (
                                                                <>
                                                                    <Plus className="w-3 h-3" />
                                                                    <span>Añadir</span>
                                                                </>
                                                            )}
                                                        </button>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {/* Classmates of the same Academic Level */}
                                    {!isSearching && contactInput.trim() === '' && classmatesOfSameLevel.length > 0 && (
                                        <div className="space-y-2 mt-2 max-h-56 overflow-y-auto pr-1">
                                            <p className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider flex items-center gap-1">
                                                <span>👥 Compañeros de tu nivel</span>
                                                <span className="text-[9px] bg-indigo-100 dark:bg-slate-700 text-indigo-600 dark:text-indigo-300 font-extrabold px-1.5 py-0.5 rounded-md flex-shrink-0 tracking-wider">RECOMENDADO</span>
                                            </p>
                                            <div className="space-y-1.5">
                                                {classmatesOfSameLevel.map((classmate) => (
                                                    <div 
                                                        key={classmate.id} 
                                                        className="flex items-center justify-between gap-3 p-2 rounded-xl bg-white dark:bg-slate-755 border border-slate-100 dark:border-slate-700 shadow-sm hover:border-indigo-150 dark:hover:border-indigo-900/40 transition-colors"
                                                    >
                                                        <div className="flex items-center gap-2.5 min-w-0">
                                                            <div className="relative">
                                                                <img 
                                                                    src={classmate.avatar} 
                                                                    alt={classmate.name} 
                                                                    className="w-8 h-8 rounded-full border border-slate-150 dark:border-slate-600 bg-slate-50 flex-shrink-0"
                                                                />
                                                                <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-500 border-2 border-white dark:border-slate-750 rounded-full"></span>
                                                            </div>
                                                            <div className="min-w-0">
                                                                <p className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate" title={classmate.name}>{classmate.name}</p>
                                                                <p className="text-[9px] text-slate-400 dark:text-slate-550 font-semibold truncate leading-none mt-0.5" title={classmate.courseNames.join(', ')}>
                                                                    {classmate.courseNames.join(', ')}
                                                                </p>
                                                            </div>
                                                        </div>
                                                        
                                                        {classmate.isConnected ? (
                                                            <button
                                                                type="button"
                                                                onClick={() => {
                                                                    const derivedConvoId = `peer_${[studentId, classmate.id].sort().join('_')}`;
                                                                    console.log(`[F110.30] [STUDENT_CHAT_CLICK] | timestamp: ${performance.now()}`);
                                                setActiveConvoId(derivedConvoId); setShowVoiceCall(false); setShowWhiteboard(false);
                                                                    setActiveChatType('private');
                                                                    setActiveTab('private');
                                                                    setIsAddFriendOpen(false);
                                                                    addFriendMutation.mutate(classmate.email);
                                                                }}
                                                                className="p-1.5 px-3 bg-indigo-50 hover:bg-indigo-100/80 dark:bg-slate-705 text-indigo-600 dark:text-indigo-400 rounded-lg text-[10.5px] font-bold transition-all active:scale-95 cursor-pointer"
                                                            >
                                                                <span>Chatear</span>
                                                            </button>
                                                        ) : (
                                                            <button
                                                                type="button"
                                                                onClick={() => {
                                                                    addFriendMutation.mutate(classmate.email);
                                                                }}
                                                                disabled={isAddingFriend}
                                                                className="p-1.5 px-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-[10.5px] font-bold transition-all active:scale-95 cursor-pointer flex items-center justify-center min-w-[5rem]"
                                                            >
                                                                {isAddingFriend ? <Spinner /> : 'Conectar'}
                                                            </button>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {addFriendError && (
                                        <p className="text-xs text-red-500 font-medium bg-red-50 dark:bg-red-950/20 p-2 rounded-lg border border-red-100 dark:border-red-900/30">
                                            ⚠️ {addFriendError}
                                        </p>
                                    )}
                                    <p className="text-[10px] text-slate-500 dark:text-slate-400">
                                        Introduce el teléfono o correo con el que tu compañero se registró en la plataforma para chatear en tiempo real.
                                    </p>
                                </form>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Chats List Stream */}
                    <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-750">
                        {activeTab === 'private' ? (
                            loadingConversations || loadingFriends ? (
                                <div className="p-8 flex justify-center"><Spinner /></div>
                            ) : filteredConversationsList.length > 0 ? (
                                filteredConversationsList.map((convo) => {
                                    const isSelected = convo.id === activeConvoId && activeChatType === 'private';
                                    const isUnread = convo.unreadByStudentId?.[studentId];
                                    
                                    return (
                                        <div
                                            key={convo.id}
                                            role="button"
                                            tabIndex={0}
                                            aria-label={`Conversación con ${convo.friendName}`}
                                            onClick={() => {
                                                console.log(`[F110.30] [STUDENT_CHAT_CLICK] | timestamp: ${performance.now()}`);
                                                setActiveConvoId(convo.id); setShowVoiceCall(false); setShowWhiteboard(false);
                                                setActiveChatType('private');
                                                if (studentId) {
                                                    api.markPeerConversationAsRead(convo.id, studentId);
                                                    queryClient.invalidateQueries({ queryKey: ['peer-conversations', studentId] });
                                                }
                                            }}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter' || e.key === ' ') {
                                                    e.preventDefault();
                                                    console.log(`[F110.30] [STUDENT_CHAT_CLICK] | timestamp: ${performance.now()}`);
                                                setActiveConvoId(convo.id); setShowVoiceCall(false); setShowWhiteboard(false);
                                                    setActiveChatType('private');
                                                    if (studentId) {
                                                        api.markPeerConversationAsRead(convo.id, studentId);
                                                        queryClient.invalidateQueries({ queryKey: ['peer-conversations', studentId] });
                                                    }
                                                }
                                            }}
                                            className={`flex items-start gap-4 p-4 cursor-pointer hover:bg-indigo-50/30 dark:hover:bg-slate-700/30 transition-colors select-none focus:outline-none focus:bg-indigo-50/20 dark:focus:bg-slate-700/20 ${
                                                isSelected ? 'bg-indigo-50/50 dark:bg-slate-700/50 border-l-4 border-indigo-600' : 'border-l-4 border-transparent'
                                            }`}
                                        >
                                            <div className="relative flex-shrink-0">
                                                <img
                                                    src={convo.friendAvatar}
                                                    alt={convo.friendName}
                                                    className="w-12 h-12 rounded-full border border-slate-200 dark:border-slate-650 object-cover bg-slate-100"
                                                    referrerPolicy="no-referrer"
                                                />
                                                {activeWhiteboards[convo.id]?.active && (
                                                    <span className="absolute -bottom-1 -right-1 flex h-4 w-4">
                                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                                                        <span className="relative inline-flex rounded-full h-4 w-4 bg-rose-600 border-2 border-white dark:border-slate-800"></span>
                                                    </span>
                                                )}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex justify-between items-baseline mb-1">
                                                    <h3 className={`text-sm font-bold truncate flex items-center gap-1.5 ${isUnread ? 'text-indigo-900 dark:text-indigo-200' : 'text-slate-800 dark:text-slate-200'}`} title={convo.friendName}>
                                                        <span className="truncate">{convo.friendName}</span>
                                                        {activeWhiteboards[convo.id]?.active && (
                                                            <span className="text-[9px] bg-rose-600 text-white font-black px-1.5 py-0.5 rounded-md animate-pulse flex-shrink-0">
                                                                PIZARRA VIVA
                                                            </span>
                                                        )}
                                                    </h3>
                                                    <span className="text-[10px] text-slate-400 flex-shrink-0">
                                                        {new Date(convo.lastMessageTimestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                    </span>
                                                </div>
                                                <p className={`text-xs truncate ${isUnread ? 'text-slate-800 dark:text-slate-200 font-semibold' : 'text-slate-500 dark:text-slate-400'}`} title={convo.lastMessageText}>
                                                    {convo.lastMessageText}
                                                </p>
                                            </div>
                                            
                                            {/* Unread dot indicator (WhatsApp shape) */}
                                            {isUnread && (
                                                <div className="w-5 h-5 bg-indigo-600 rounded-full flex items-center justify-center flex-shrink-0 text-[10px] font-bold text-white shadow-sm mt-1 animate-pulse">
                                                    1
                                                </div>
                                            )}
                                        </div>
                                    );
                                })
                            ) : (
                                <div className="p-8 text-center text-slate-500">
                                    <MessageSquare className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
                                    <p className="text-sm font-bold text-slate-600 dark:text-slate-400 mb-1">No hay chats abiertos</p>
                                    <p className="text-xs text-slate-400">Pulsa en "Añadir" para conectar con un amigo mediante su email o teléfono.</p>
                                    
                                    <div className="mt-6 p-4 rounded-xl border border-dashed border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-left">
                                        <h4 className="text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wide mb-1 flex items-center gap-1">
                                            💡 Truco de prueba
                                        </h4>
                                        <p className="text-[10px] text-slate-500 leading-relaxed">
                                            Puedes conectar con los alumnos ficticios usando sus datos de prueba:
                                        </p>
                                        <ul className="text-[10.5px] font-mono text-slate-500 dark:text-slate-400 mt-2 space-y-1 list-disc list-inside">
                                            <li>Carlos M.: <span className="font-bold underline">carlos@example.com</span> o 600222333</li>
                                            <li>Sofía R.: <span className="font-bold underline">sofia@example.com</span> o 600333444</li>
                                            <li>Lucía G.: <span className="font-bold underline">lucia@example.com</span> o 600111222</li>
                                        </ul>
                                    </div>
                                </div>
                            )
                        ) : (
                            // RENDERING FOR COURSE GROUP CHATS
                            loadingGroupConversations ? (
                                <div className="p-8 flex justify-center"><Spinner /></div>
                            ) : filteredGroupConversationsList.length > 0 ? (
                                filteredGroupConversationsList.map((gconvo) => {
                                    const isSelected = gconvo.id === activeConvoId && activeChatType === 'group';
                                    
                                    return (
                                        <div
                                            key={gconvo.id}
                                            role="button"
                                            tabIndex={0}
                                            aria-label={`Grupo de ${gconvo.name}`}
                                            onClick={() => {
                                                console.log(`[F110.30] [STUDENT_CHAT_CLICK] | timestamp: ${performance.now()}`);
                                                setActiveConvoId(gconvo.id); setShowVoiceCall(false); setShowWhiteboard(false);
                                                setActiveChatType('group');
                                            }}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter' || e.key === ' ') {
                                                    e.preventDefault();
                                                    console.log(`[F110.30] [STUDENT_CHAT_CLICK] | timestamp: ${performance.now()}`);
                                                setActiveConvoId(gconvo.id); setShowVoiceCall(false); setShowWhiteboard(false);
                                                    setActiveChatType('group');
                                                }
                                            }}
                                            className={`flex items-start gap-4 p-4 cursor-pointer hover:bg-indigo-50/30 dark:hover:bg-slate-700/30 transition-colors select-none focus:outline-none focus:bg-indigo-50/20 dark:focus:bg-slate-700/20 ${
                                                isSelected ? 'bg-indigo-50/50 dark:bg-slate-700/50 border-l-4 border-indigo-600' : 'border-l-4 border-transparent'
                                            }`}
                                        >
                                            <div className="w-12 h-12 rounded-full border border-slate-200 dark:border-slate-650 flex items-center justify-center bg-indigo-150 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 flex-shrink-0 font-bold text-lg select-none">
                                                <Users className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex justify-between items-baseline mb-1">
                                                    <h3 className="text-sm font-bold truncate text-slate-800 dark:text-slate-200 flex items-center gap-1.5 min-w-0">
                                                        <span className="truncate" title={gconvo.name}>{gconvo.name}</span>
                                                        <span className="text-[9px] bg-indigo-100 hover:bg-indigo-200 dark:bg-slate-700 text-indigo-700 dark:text-indigo-300 font-extrabold px-1.5 py-0.5 rounded-md flex-shrink-0 tracking-wider">GRUPO</span>
                                                    </h3>
                                                    <span className="text-[10px] text-slate-400 flex-shrink-0">
                                                        {new Date(gconvo.lastMessageTimestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                    </span>
                                                </div>
                                                <p className="text-xs truncate text-slate-500 dark:text-slate-450 italic" title={gconvo.lastMessageText}>
                                                    {gconvo.lastMessageText}
                                                </p>
                                                <div className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 flex items-center gap-1 mt-1">
                                                    <Users className="w-3 h-3 text-slate-400" />
                                                    <span>{gconvo.enrolledStudentsCount} alumnos inscritos</span>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })
                            ) : (
                                <div className="p-8 text-center text-slate-500">
                                    <Users className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
                                    <p className="text-sm font-bold text-slate-600 dark:text-slate-400 mb-1">No hay grupos activos</p>
                                    <p className="text-xs text-slate-450 leading-relaxed max-w-[200px] mx-auto">
                                        No estás matriculado en ninguna asignatura con chat activo, o el filtro eliminó las coincidencias.
                                    </p>
                                </div>
                            )
                        )}
                    </div>
                </div>

                {/* --- CHAT VIEW CONTAINER --- */}
                <div className={`flex-1 min-w-0 min-h-0 w-full max-w-full md:w-auto flex flex-col bg-slate-50 dark:bg-slate-900 overflow-hidden ${!activeConvoId ? 'hidden md:flex' : 'flex h-full'}`}>
                    {activeConvoId && activeConversationDetails ? (
                        <>
                            {/* Header Panel */}
                            <div className="p-4 border-b border-slate-200 dark:border-slate-750 bg-white dark:bg-slate-800 flex items-center justify-between shadow-sm z-10 flex-shrink-0 gap-4">
                                <div className="flex items-center gap-3 min-w-0">
                                    {/* Mobile Back Button */}
                                    <button
                                        onClick={() => { console.log(`[F110.30] [STUDENT_CHAT_CLICK] | timestamp: ${performance.now()}`);
                                                setActiveConvoId(null); setShowVoiceCall(false); setShowWhiteboard(false); }}
                                        className="p-1 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg md:hidden flex-shrink-0"
                                        aria-label="Volver a chats"
                                    >
                                        <ArrowLeft className="w-6 h-6" />
                                    </button>
                                    
                                    <img
                                        src={activeConversationDetails.avatar}
                                        alt={activeConversationDetails.name}
                                        className="w-10 h-10 rounded-full border border-slate-250 dark:border-slate-650 bg-slate-100 object-cover flex-shrink-0"
                                        referrerPolicy="no-referrer"
                                    />
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-2">
                                            <h2 className="text-base font-bold text-slate-900 dark:text-slate-50 leading-tight truncate" title={activeConversationDetails.name}>
                                                {activeConversationDetails.name}
                                            </h2>
                                            {isWhiteboardActive && (
                                                <span 
                                                    onClick={() => setShowWhiteboard(true)}
                                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-extrabold bg-rose-500 text-white animate-pulse shadow-sm border border-rose-400/25 select-none flex-shrink-0 cursor-pointer hover:bg-rose-600 transition-colors"
                                                    title="Pizarra activa. Haz clic para abrirla."
                                                >
                                                    <span className="w-1.5 h-1.5 bg-white rounded-full"></span>
                                                    <span>PIZARRA VIVA</span>
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5 text-slate-500 dark:text-slate-400 text-[10.5px] font-medium min-w-0">
                                            {activeConversationDetails.email && (
                                                <span className="flex items-center gap-0.5 truncate max-w-[140px] sm:max-w-none" title={activeConversationDetails.email}>
                                                    <Mail className="w-3 h-3 text-slate-400 flex-shrink-0" />
                                                    <span className="truncate">{activeConversationDetails.email}</span>
                                                </span>
                                            )}
                                            {activeConversationDetails.phone && (
                                                <span className="flex items-center gap-0.5 truncate flex-shrink-0">
                                                    <Phone className="w-3 h-3 text-slate-400 flex-shrink-0" />
                                                    <span>{activeConversationDetails.phone}</span>
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* Voice call / Digital board buttons for all active chats */}
                                <div className="flex items-center gap-2 flex-shrink-0">
                                    <button
                                        onClick={() => setShowVoiceCall(v => !v)}
                                        className={`p-2 rounded-xl transition-all border flex items-center gap-1.5 text-xs font-bold shadow-sm relative ${
                                            showVoiceCall 
                                            ? 'bg-indigo-50 border-indigo-200 text-indigo-600 dark:bg-indigo-950/30 dark:border-indigo-900/40 dark:text-indigo-400 hover:bg-indigo-100' 
                                            : isVoiceCallActive
                                            ? 'bg-green-50/80 border-green-200 text-green-700 dark:bg-green-950/30 dark:border-green-900/40 dark:text-green-400 hover:bg-green-100 animate-pulse'
                                            : 'bg-white border-slate-200 text-slate-700 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'
                                        }`}
                                        title="Llamada de voz"
                                    >
                                        <Phone className="w-4 h-4" />
                                        <span className="hidden sm:inline">Llamada de Voz</span>
                                        {isVoiceCallActive && !showVoiceCall && (
                                            <span className="absolute -top-1 -right-1 flex h-2 w-2">
                                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                                                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                                            </span>
                                        )}
                                    </button>
                                    
                                    <button
                                        onClick={() => {
                                            if (!showWhiteboard && !isWhiteboardActive && !(user as any)?.canInitiateWhiteboard) {
                                                addToast('🔒 La pizarra está inactiva. Podrás unirte cuando un profesor o tutor la inicie.', 'info');
                                                return;
                                            }
                                            setShowWhiteboard(v => !v);
                                        }}
                                        className={`p-2 rounded-xl transition-all border flex items-center gap-1.5 text-xs font-bold shadow-sm relative ${
                                            showWhiteboard 
                                            ? 'bg-indigo-50 border-indigo-200 text-indigo-600 dark:bg-indigo-950/30 dark:border-indigo-900/40 dark:text-indigo-400 hover:bg-indigo-100' 
                                            : isWhiteboardActive
                                            ? 'bg-amber-50/80 border-amber-200 text-amber-700 dark:bg-amber-950/30 dark:border-amber-900/40 dark:text-amber-400 hover:bg-amber-100 animate-pulse'
                                            : 'bg-white border-slate-200 text-slate-700 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'
                                        }`}
                                        title="Pizarra colaborativa"
                                    >
                                        <PenTool className="w-4 h-4" />
                                        <span className="hidden sm:inline">Pizarra Digital</span>
                                        {isWhiteboardActive && !showWhiteboard && (
                                            <span className="absolute -top-1 -right-1 flex h-2 w-2">
                                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                                                <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                                            </span>
                                        )}
                                    </button>

                                    {activeChatType === 'group' && (
                                        <button
                                            onClick={() => setIsReplayModalOpen(true)}
                                            className="p-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white transition-all flex items-center gap-1.5 text-xs font-bold shadow-sm cursor-pointer hover:shadow px-3"
                                            title="Ver grabaciones anteriores de la clase"
                                        >
                                            <Video className="w-4 h-4" />
                                            <span className="hidden sm:inline">Grabaciones</span>
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* voice call active warning banner */}
                            {isVoiceCallActive && !showVoiceCall && (
                                <div className="bg-green-50/95 dark:bg-green-950/30 border-b border-green-100 dark:border-green-900/40 p-3 px-4 flex items-center justify-between gap-3 animate-fade-in text-xs font-semibold text-green-800 dark:text-green-400 z-10 flex-shrink-0 backdrop-blur-sm shadow-sm">
                                    <div className="flex items-center gap-2">
                                        <span className="flex h-2.5 w-2.5 relative">
                                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                                            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500"></span>
                                        </span>
                                        <span>
                                            Hay una <strong>Llamada de Voz en directo</strong> activa en esta conversación.
                                        </span>
                                    </div>
                                    <button
                                        onClick={() => setShowVoiceCall(true)}
                                        className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white rounded-lg font-bold text-[11px] shadow-sm transition-all whitespace-nowrap cursor-pointer hover:shadow"
                                    >
                                        Unirse a la Llamada 📞
                                    </button>
                                </div>
                            )}

                            {/* whiteboard active warning banner */}
                            {isWhiteboardActive && !showWhiteboard && (
                                <div className="bg-amber-50/95 dark:bg-amber-950/30 border-b border-amber-100 dark:border-amber-900/40 p-3 px-4 flex items-center justify-between gap-3 animate-fade-in text-xs font-semibold text-amber-800 dark:text-amber-400 z-10 flex-shrink-0 backdrop-blur-sm shadow-sm">
                                    <div className="flex items-center gap-2">
                                        <span className="flex h-2.5 w-2.5 relative">
                                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                                            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500"></span>
                                        </span>
                                        <span>
                                            El profesor está compartiendo la <strong>Pizarra Digital</strong> en este momento.
                                        </span>
                                    </div>
                                    <button
                                        onClick={() => setShowWhiteboard(true)}
                                        className="px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-bold text-[11px] shadow-sm transition-all whitespace-nowrap cursor-pointer hover:shadow"
                                    >
                                        Ver Pizarra ✏️
                                    </button>
                                </div>
                            )}

                            {/* voice dynamic panel */}
                            {showVoiceCall && activeConvoId && (
                                <div className="p-4 bg-slate-50/50 dark:bg-slate-900/45 border-b dark:border-slate-800 z-10 flex-shrink-0">
                                    <VoiceGroupCall courseId={activeConvoId} onClose={() => setShowVoiceCall(false)} />
                                </div>
                            )}

                            {/* whiteboard drawing board panel (Full Screen Modal) */}
                            {showWhiteboard && activeConvoId && (
                                <div className="fixed inset-0 z-[100] bg-slate-950/95 backdrop-blur-md flex flex-col p-0 sm:p-4 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] animate-fade-in w-full h-full">
                                    <div className="flex-1 bg-white dark:bg-slate-900 rounded-none sm:rounded-2xl overflow-hidden shadow-2xl flex flex-col border border-slate-800 w-full h-full">
                                        <Whiteboard courseId={activeConvoId} isTeacher={false} onClose={() => setShowWhiteboard(false)} />
                                    </div>
                                </div>
                            )}

                            {/* Messages Stream Container */}
                            <div className="relative flex-1 flex flex-col min-h-0">
                                <div 
                                    ref={scrollRef}
                                    onScroll={handleScroll}
                                    className="flex-1 overflow-y-auto overflow-x-hidden px-3.5 sm:px-4 md:px-6 py-6 min-h-0"
                                >
                                    {(activeChatType === 'group' ? loadingGroupMessages : loadingMessages) ? (
                                        <div className="h-full flex justify-center items-center"><Spinner /></div>
                                    ) : flattenedItems.length > 0 ? (
                                        <div 
                                            className="w-full relative"
                                            style={{ height: `${rowVirtualizer.getTotalSize()}px` }}
                                        >
                                            {rowVirtualizer.getVirtualItems().map(virtualRow => {
                                                const item = flattenedItems[virtualRow.index];
                                                if (!item) return null;
                                                return (
                                                    <div
                                                        key={item.id}
                                                        ref={rowVirtualizer.measureElement}
                                                        data-index={virtualRow.index}
                                                        style={{
                                                            position: 'absolute',
                                                            top: 0,
                                                            left: 0,
                                                            width: '100%',
                                                            transform: `translateY(${virtualRow.start}px)`,
                                                        }}
                                                        className="py-1"
                                                    >
                                                        {item.type === 'date' ? (
                                                            /* Date Separator */
                                                            <div className="text-center my-3">
                                                                <span className="px-3 py-1 bg-slate-200/80 dark:bg-slate-800 text-slate-600 dark:text-slate-350 text-[11px] font-bold rounded-full border border-slate-300/30">
                                                                    {item.date}
                                                                </span>
                                                            </div>
                                                        ) : (
                                                            <PeerMessageBubble 
                                                                message={item.message} 
                                                                currentStudentId={studentId} 
                                                            />
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    ) : (
                                        <div className="h-full flex flex-col justify-center items-center text-center text-slate-400">
                                            <Smile className="w-16 h-16 text-indigo-300 dark:text-indigo-900/40 mb-3" />
                                            <p className="text-sm font-bold text-slate-600 dark:text-slate-400">
                                                {activeChatType === 'group' ? '¡Bienvenido al canal del curso!' : '¡Conexión establecida con éxito!'}
                                            </p>
                                            <p className="text-xs text-slate-400 max-w-xs mt-1">
                                                {activeChatType === 'group' 
                                                    ? 'Colabora, pregunta dudas y comparte material de estudio con tus compañeros en tiempo real.' 
                                                    : 'Escribe un mensaje de bienvenida a continuación para iniciar la conversación de estudio.'}
                                            </p>
                                        </div>
                                    )}
                                </div>
                                {showNewMessageIndicator && (
                                    <button
                                        type="button"
                                        onClick={() => scrollToBottom(true)}
                                        className="absolute bottom-4 right-6 z-20 flex items-center gap-1.5 px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-full shadow-lg transition-all animate-bounce cursor-pointer border border-white/20"
                                    >
                                        <ChevronDown className="w-4 h-4" />
                                        <span>Nuevos mensajes</span>
                                    </button>
                                )}
                            </div>

                            {/* Footer Input panel */}
                            <form 
                                onSubmit={handleSendMessage} 
                                className="p-2.5 sm:p-3.5 md:p-4 bg-white dark:bg-slate-800 border-t border-slate-100 dark:border-slate-750 flex-shrink-0 w-full max-w-full overflow-hidden"
                            >
                                {/* Plantillas de estudio rápidas (WhatsApp style) */}
                                <div className="w-full overflow-x-auto pb-1.5 mb-1.5 select-none no-scrollbar scrollbar-none touch-pan-x" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                                    <div className="flex gap-1.5 sm:gap-2 flex-nowrap min-w-max pr-4">
                                        {[
                                            '📅 ¿Quedamos hoy para estudiar?',
                                            '📝 ¿Cómo llevas el último quiz?',
                                            '💡 ¿Me pasas tus apuntes porfa?',
                                            '🔥 ¡Mucho ánimo con el estudio!',
                                            '🧩 ¿Me ayudas con una duda?',
                                            '🧠 ¿Repasamos juntos?'
                                        ].map((template, idx) => (
                                            <button
                                                key={idx}
                                                type="button"
                                                onClick={() => {
                                                    setInputMessage(template);
                                                    if (textareaRef.current) {
                                                        textareaRef.current.focus();
                                                    }
                                                }}
                                                className="whitespace-nowrap flex-shrink-0 text-[11px] sm:text-xs px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100/80 dark:bg-slate-700/60 dark:hover:bg-slate-700 text-indigo-700 dark:text-indigo-300 rounded-full font-semibold transition-all active:scale-95 border border-indigo-100/50 dark:border-slate-600/30 cursor-pointer"
                                            >
                                                {template}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {attachments.length > 0 && (
                                    <div className="flex flex-wrap gap-2 mb-2 p-2 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-150 dark:border-slate-750">
                                        {attachments.map((att, index) => (
                                            <div key={index} className="relative flex items-center gap-2 p-1.5 pr-8 bg-white dark:bg-slate-800 rounded-lg border border-slate-150 dark:border-slate-700 shadow-sm max-w-[180px]">
                                                {att.type.startsWith('image/') ? (
                                                    <img src={att.url} alt="Previsualizar" className="w-8 h-8 rounded object-cover" />
                                                ) : (
                                                    <div className="w-8 h-8 rounded bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center flex-shrink-0">
                                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" className="w-4 h-4">
                                                          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                                                        </svg>
                                                    </div>
                                                )}
                                                <span className="text-[10px] font-semibold truncate text-slate-700 dark:text-slate-300" title={att.name}>{att.name}</span>
                                                <button
                                                    type="button"
                                                    onClick={() => removeAttachment(index)}
                                                    className="absolute top-1 right-1 p-0.5 text-slate-400 hover:text-red-500 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                                                >
                                                    <X className="w-3 h-3" />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                <div className="flex items-end gap-1.5 sm:gap-2.5 p-1.5 sm:p-2 border border-slate-200 dark:border-slate-700 rounded-2xl bg-slate-50 dark:bg-slate-900 focus-within:ring-2 focus-within:ring-indigo-600 transition-shadow w-full min-w-0 box-border">
                                    <button
                                        type="button"
                                        onClick={() => fileInputRef.current?.click()}
                                        className="p-1.5 sm:p-2 text-slate-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-white rounded-xl hover:bg-slate-200/50 dark:hover:bg-slate-800 transition-colors flex-shrink-0 cursor-pointer"
                                        title="Adjuntar imágenes o archivos"
                                    >
                                        <Paperclip className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setIsCameraOpen(true)}
                                        className="p-1.5 sm:p-2 text-slate-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-white rounded-xl hover:bg-slate-200/50 dark:hover:bg-slate-800 transition-colors flex-shrink-0 cursor-pointer"
                                        title="Hacer foto directamente"
                                    >
                                        <Camera className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
                                    </button>
                                    <input 
                                        type="file"
                                        ref={fileInputRef}
                                        onChange={handleFileChange}
                                        multiple
                                        className="hidden"
                                    />
                                    <textarea
                                        ref={textareaRef}
                                        rows={1}
                                        value={inputMessage}
                                        onChange={handleTextareaInput}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' && !e.shiftKey) {
                                                e.preventDefault();
                                                handleSendMessage(e);
                                            }
                                        }}
                                        placeholder="Escribe un mensaje..."
                                        className="flex-1 bg-transparent border-none focus:ring-0 focus:outline-none text-base sm:text-sm p-1 text-slate-900 dark:text-slate-100 placeholder-slate-400 max-h-32 resize-none h-8 font-sans outline-none min-w-0"
                                        disabled={isSending}
                                    />
                                    <button
                                        type="submit"
                                        disabled={(!inputMessage.trim() && attachments.length === 0) || isSending}
                                        className="p-2 sm:p-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer flex-shrink-0"
                                        aria-label="Enviar mensaje"
                                    >
                                        <Send className="w-4 h-4" />
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
                                courseId={activeConvoId || ''}
                            />
                        </>
                    ) : (
                        // Empty Chat state
                        <div className="flex-grow flex flex-col items-center justify-center p-8 text-center text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-900/50">
                            <Compass className="w-16 h-16 text-indigo-400 dark:text-indigo-900/40 mb-4 animate-spin-slow" />
                            <h2 className="text-lg font-bold text-slate-800 dark:text-slate-200 mb-1">Tu Espacio de Estudio en Comunidad</h2>
                            <p className="text-sm text-slate-400 max-w-md">
                                Selecciona alguno de tus chats de la barra lateral para compartir apuntes, dudas y resolver ejercicios de clase con tus compañeros.
                            </p>
                        </div>
                    )}
                </div>
            </div>

            {/* Live Whiteboard Global Notification Toast for Students */}
            {globalToastNotice && isConvoForUser(globalToastNotice.convoId) && (
                <div className="fixed top-5 right-5 z-50 max-w-sm w-full bg-slate-900/95 dark:bg-slate-800/95 text-white p-4 rounded-2xl shadow-2xl border border-rose-500/40 backdrop-blur-md animate-bounce flex flex-col gap-2.5">
                    <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 font-black text-xs uppercase tracking-wider text-rose-400">
                            <span className="flex h-2.5 w-2.5 relative">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-rose-500"></span>
                            </span>
                            <span>Emisión en Vivo de Pizarra</span>
                        </div>
                        <button 
                            onClick={() => setGlobalToastNotice(null)}
                            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 dark:hover:bg-slate-700 transition-colors"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                    <p className="text-xs text-slate-200 font-semibold leading-relaxed">
                        El profesor ha iniciado una clase en directo en la <strong>Pizarra Digital</strong>. Toca para unirte en tiempo real.
                    </p>
                    <button
                        onClick={() => {
                            console.log(`[F110.30] [STUDENT_CHAT_CLICK] | timestamp: ${performance.now()}`);
                                                setActiveConvoId(globalToastNotice.convoId);
                            setShowWhiteboard(true);
                            setGlobalToastNotice(null);
                        }}
                        className="w-full py-2 px-3 bg-rose-600 hover:bg-rose-700 text-white font-black text-xs rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-95"
                    >
                        <PenTool className="w-4 h-4" />
                        <span>Unirme a la Pizarra ✏️</span>
                    </button>
                </div>
            )}
        </SubscriptionGate>
    );
};
