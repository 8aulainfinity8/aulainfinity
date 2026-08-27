import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { 
  doc, 
  collection, 
  updateDoc, 
  deleteDoc, 
  onSnapshot, 
  query, 
  orderBy, 
  limitToLast, 
  serverTimestamp, 
  increment, 
  setDoc, 
  getDoc 
} from 'firebase/firestore';
import { db, auth } from '../services/firebase';
import { useAuth } from '../contexts/AuthContext';
import { listenerTracker } from '../services/listenerTracker';
import * as api from '../services/api';
import * as dbMock from '../services/mockDatabase';
import {
  inferParticipantsFromChatId,
  parseDirectChatId,
  parseSupportChatId,
  getDirectChatId,
  getDirectChatParticipants,
  resolveUserUid,
  resolveConversationMetadata
} from '../utils/chatUtils';

export {
  inferParticipantsFromChatId,
  parseDirectChatId,
  parseSupportChatId,
  getDirectChatId,
  getDirectChatParticipants,
  resolveUserUid,
  resolveConversationMetadata
};

export interface ChatMessage {
  id: string;
  senderId: string;
  senderRole?: string;
  text: string;
  timestamp: any;
  type?: 'text' | 'voice_note';
  attachments?: any[];
  participants?: string[];
}

export interface ChatMetadata {
  chatId: string;
  type: 'direct' | 'peer' | 'group';
  participants: string[];
  studentId?: string;
  teacherId?: string;
  createdBy?: string;
  createdAt?: any;
  status?: 'open' | 'pending' | 'resolved' | 'closed';
  subjectId?: string;
  lastMessage?: string;
  lastMessageTimestamp?: any;
  unreadCount?: Record<string, number>;
  isMuted?: boolean;
}

export interface UseChatOptions {
  studentId?: string;
  teacherId?: string;
  participants?: string[];
}

export function useChat(
  chatId: string | null, 
  currentUserId: string | null,
  options?: UseChatOptions
) {
  let queryClient: any = null;
  try {
    queryClient = useQueryClient();
  } catch {
    // Outside QueryClientProvider (e.g. isolated unit tests)
    queryClient = null;
  }
  const { isFirebaseAuthReady, firebaseUser, firebaseEmailVerified, firebaseRole, firebaseUid } = useAuth();
  const currentUser = auth?.currentUser || firebaseUser;
  const resolvedUserId = (currentUser?.uid || firebaseUid) ? (currentUser?.uid || firebaseUid!) : currentUserId;

  const uid = currentUser?.uid || firebaseUid;
  const emailVerified = Boolean(currentUser?.emailVerified || firebaseEmailVerified);
  const effectiveChatId = chatId;

  const getCachedMessages = (id: string | null): ChatMessage[] => {
    if (!id) return [];
    try {
      const cached = localStorage.getItem(`chat_messages_${id}`);
      if (cached) {
        const parsed: ChatMessage[] = JSON.parse(cached);
        // Filtrar para asegurar que los mensajes pertenezcan únicamente al chatId solicitado
        return parsed.filter(m => !m.participants || m.participants.length === 0 || id.includes(m.senderId));
      }
    } catch (e) {}
    return [];
  };

  const initialCached = getCachedMessages(chatId);
  const [messages, setMessages] = useState<ChatMessage[]>(initialCached);
  const [chatMeta, setChatMeta] = useState<ChatMetadata | null>(null);
  const [loading, setLoading] = useState<boolean>(initialCached.length === 0 && Boolean(chatId));
  const [error, setError] = useState<string | null>(null);
  const [listenerReady, setListenerReady] = useState<boolean>(false);

  // Canonical reset when chatId changes to avoid leaking stale loading=false or prior messages
  const [prevChatId, setPrevChatId] = useState<string | null>(chatId);
  if (chatId !== prevChatId) {
    setPrevChatId(chatId);
    const cached = getCachedMessages(chatId);
    setLoading(cached.length === 0 && Boolean(chatId));
    setListenerReady(false);
    setMessages(cached);
    setChatMeta(null);
  }

  const optStudentId = options?.studentId;
  const optTeacherId = options?.teacherId;
  const optParticipantsKey = options?.participants ? options.participants.join(',') : '';

  // Escuchar metadatos del chat y mensajes en tiempo real sincronizado con Firebase Auth
  useEffect(() => {
    if (!effectiveChatId) {
      setMessages([]);
      setChatMeta(null);
      setLoading(false);
      setListenerReady(false);
      return;
    }

    // 1. Esperar a que Firebase Auth esté listo
    if (!isFirebaseAuthReady) {
      setLoading(true);
      setListenerReady(false);
      return;
    }

    // 2. Comprobar sesión real de Firebase Auth y verificación de email
    const isVerified = Boolean(currentUser && (currentUser.emailVerified || emailVerified || firebaseRole === 'admin' || firebaseRole === 'teacher'));

    if (!currentUser || !isVerified) {
      setChatMeta(null);
      setLoading(false);
      setListenerReady(false);
      return;
    }

    setError(null);

    let unsubChat: (() => void) | null = null;
    let unsubMessages: (() => void) | null = null;

    let trackerMetaId: string | null = null;
    let trackerMsgId: string | null = null;
    let fallbackTimeoutId: ReturnType<typeof setTimeout> | null = null;

    try {
      // Safety timeout to prevent indefinite spinners
      fallbackTimeoutId = setTimeout(() => {
        console.warn(`[useChat] Firestore timeout for ${effectiveChatId}, clearing loading state.`);
        setLoading(false);
        setListenerReady(true);
      }, 500);

      // Documento de metadatos del chat
      trackerMetaId = listenerTracker.register('useChat (meta)', `chats/${effectiveChatId}`, 'doc');
      const chatRef = doc(db, 'chats', effectiveChatId);

      unsubChat = onSnapshot(
        chatRef, 
        (snapshot) => {
          if (fallbackTimeoutId) clearTimeout(fallbackTimeoutId);
          if (snapshot.exists()) {
            setChatMeta({ chatId: snapshot.id, ...snapshot.data() } as ChatMetadata);
          } else {
            setChatMeta(null);
          }
          // Note: we don't setLoading(false) here exclusively because we want the messages query to resolve too if possible, but for UX it's fine.
          setLoading(false);
          setListenerReady(true);
        }, 
        (err) => {
          if (fallbackTimeoutId) clearTimeout(fallbackTimeoutId);
          console.warn('[Firestore] Error al obtener metadatos del chat:', err.message);
          setError('No se pudieron cargar los metadatos de la conversación.');
          setLoading(false);
          setListenerReady(false);
        }
      );

      // Subcolección de mensajes ordenada cronológicamente (limitada a los últimos 100)
      trackerMsgId = listenerTracker.register('useChat (messages)', `chats/${effectiveChatId}/messages`, 'query');
      const messagesQuery = query(
        collection(db, 'chats', effectiveChatId, 'messages'),
        orderBy('timestamp', 'asc'),
        limitToLast(100)
      );

      unsubMessages = onSnapshot(
        messagesQuery, 
        { includeMetadataChanges: true },
        (snapshot) => {
          const msgs: ChatMessage[] = snapshot.docs.map(docSnap => ({
            id: docSnap.id,
            ...docSnap.data()
          } as ChatMessage));
          setMessages(msgs);
          try {
            localStorage.setItem(`chat_messages_${effectiveChatId}`, JSON.stringify(msgs));
          } catch (e) {}

          if (fallbackTimeoutId) clearTimeout(fallbackTimeoutId);
          setLoading(false);
          setListenerReady(true);
        }, 
        (err) => {
          if (fallbackTimeoutId) clearTimeout(fallbackTimeoutId);
          console.warn('[Firestore] Error al escuchar mensajes:', err.message);
          setError('Error en la conexión en tiempo real con los mensajes.');
          setLoading(false);
          setListenerReady(false);
        }
      );
    } catch (e) {
      console.warn('[Firestore] Excepción al configurar listeners:', e);
      setLoading(false);
      setListenerReady(false);
    }

    return () => {
      if (fallbackTimeoutId) clearTimeout(fallbackTimeoutId);
      if (trackerMetaId) listenerTracker.cleanup(trackerMetaId);
      if (trackerMsgId) listenerTracker.cleanup(trackerMsgId);
      if (unsubChat) unsubChat();
      if (unsubMessages) unsubMessages();
    };
  }, [chatId, isFirebaseAuthReady, firebaseUid, firebaseEmailVerified, firebaseRole]);

  // Marcar como leído los mensajes de la conversación actual
  const markAsRead = useCallback(async () => {
    if (!chatId || !resolvedUserId) return;
    if (!auth?.currentUser || !auth.currentUser.emailVerified) return;

    try {
      // 1. ACTUALIZACIÓN OPTIMISTA DE CACHÉ (inmediata)
      if (queryClient) {
        queryClient.setQueryData(['conversations', resolvedUserId], (oldData: any[] | undefined) => {
          if (!oldData) return oldData;
          return oldData.map(c => {
            if (c.id === chatId) {
              const updated = {
                ...c,
                [`unreadCount.${resolvedUserId}`]: 0,
                [`unreadByStudentId.${resolvedUserId}`]: false,
              };
              if (firebaseRole === 'admin') {
                updated.unreadByAdmin = false;
              } else if (firebaseRole === 'teacher') {
                updated.unreadByTeacher = false;
              } else if (firebaseRole === 'student') {
                updated.unreadByStudent = false;
              }
              return updated;
            }
            return c;
          });
        });
      }

      // 2. ACTUALIZACIÓN EN FIRESTORE
      const chatRef = doc(db, 'chats', chatId);
      const updatePayload: Record<string, any> = {
        [`unreadCount.${resolvedUserId}`]: 0,
        [`unreadByStudentId.${resolvedUserId}`]: false
      };

      const role = firebaseRole;
      if (role === 'admin') {
        updatePayload.unreadByAdmin = false;
      } else if (role === 'teacher') {
        updatePayload.unreadByTeacher = false;
      } else if (role === 'student') {
        updatePayload.unreadByStudent = false;
      }

      await updateDoc(chatRef, updatePayload).catch(() => {});
    } catch (err) {
      console.warn('[useChat] Error al marcar mensajes como leídos:', err);
    }
  }, [chatId, resolvedUserId, firebaseRole, queryClient]);

  const isSendingRef = useRef(false);

  // Enviar mensaje e inicializar correctamente metadatos e unreadCount
  const sendMessage = async (
    text: string, 
    type: 'text' | 'voice_note' = 'text',
    customParticipants?: string[],
    attachments?: any[],
    senderRole?: string
  ) => {
    if (!chatId || !resolvedUserId || (!text.trim() && (!attachments || attachments.length === 0))) return;
    if (isSendingRef.current) {
      console.warn('[useChat] Message send already in flight, ignoring duplicate call');
      return;
    }

    isSendingRef.current = true;
    try {
      // Verificar coincidencia de identidad entre resolvedUserId y auth.currentUser.uid
      const currentUser = auth?.currentUser || firebaseUser;
      const isPrivileged = firebaseRole === 'admin' || firebaseRole === 'teacher';
      if (currentUser && resolvedUserId && currentUser.uid !== resolvedUserId && !isPrivileged) {
        console.warn('[Security Warning] resolvedUserId does not match auth.currentUser.uid in sendMessage:', {
          resolvedUserId,
          authUid: currentUser.uid
        });
      }

      const effectiveSenderId = currentUser ? currentUser.uid : resolvedUserId;
      console.log(`[SEND_TRACE] [SEND_START] chatId=${chatId}, timestamp=${Date.now()}`);
      
      const isFirebaseAuthed = Boolean(currentUser && (currentUser.emailVerified || firebaseEmailVerified || firebaseRole === 'admin' || firebaseRole === 'teacher'));

      if (!isFirebaseAuthed) {
        console.warn('[useChat] Skipped Firestore write: Firebase Auth session not present or not verified.');
        // Sincronizar únicamente con el API local si es sesión mock/local sin disparar error a Firestore
        try {
          await api.sendMessage({
            conversationId: chatId,
            senderId: effectiveSenderId,
            senderRole: (senderRole || 'student') as any,
            text,
            attachments
          });
        } catch (apiErr) {
          console.warn('Could not sync message to mock API backend:', apiErr);
        }
        return;
      }

      const chatRef = doc(db, 'chats', chatId);
      const messagesRef = collection(db, 'chats', chatId, 'messages');

      let chatExists = false;
      let participantsList: string[] = customParticipants || [];

      // Try to get document from server or cache
      // 1. Usar estado local en memoria (Instantáneo 0ms)
      if (chatMeta) {
        chatExists = true;
        if (participantsList.length === 0 && chatMeta.participants?.length) {
          participantsList = chatMeta.participants;
        }
      }

      // 2. Intentar derivar participantes desde opciones y resolver canónico antes de tocar la red
      if (participantsList.length === 0) {
        if (options?.participants && options.participants.length > 0) {
          participantsList = [...options.participants];
        } else if (options?.studentId && options?.teacherId) {
          participantsList = getDirectChatParticipants(options.studentId, options.teacherId);
        } else {
          const resolvedMeta = resolveConversationMetadata(chatId, {
            cachedData: chatMeta,
            studentId: options?.studentId,
            teacherId: options?.teacherId,
            participants: options?.participants,
            currentUserId: effectiveSenderId
          });
          if (resolvedMeta.participants.length > 0) {
            participantsList = [...resolvedMeta.participants];
          } else {
            participantsList = inferParticipantsFromChatId(chatId, effectiveSenderId);
          }
        }
      }

      // 3. Fallback a red sólo si seguimos sin participantes locales (Extremo edge-case)
      if (!chatExists && participantsList.length === 0) {
        const getDocStart = Date.now();
        console.log(`[SEND_TRACE] [SEND_CHAT_GETDOC_START] chatId=${chatId}, timestamp=${getDocStart}, currentUser=${currentUser?.uid}, path=chats/${chatId}`);
        try {
          const chatSnap = await Promise.race([
            getDoc(chatRef),
            new Promise<any>((_, reject) => setTimeout(() => reject(new Error('getDoc timeout')), 2000))
          ]);
          console.log(`[SEND_TRACE] [SEND_CHAT_GETDOC_SUCCESS] chatId=${chatId}, elapsedMs=${Date.now() - getDocStart}`);
          chatExists = chatSnap.exists();
          const data = chatExists ? chatSnap.data() : null;
          if (participantsList.length === 0 && data?.participants?.length) {
            participantsList = data.participants;
          }
        } catch (getDocErr: any) {
          if (getDocErr?.message === 'getDoc timeout') {
            console.log(`[SEND_TRACE] [SEND_CHAT_GETDOC_TIMEOUT] chatId=${chatId}, elapsedMs=${Date.now() - getDocStart}`);
          } else {
            console.warn(`[SEND_TRACE] [SEND_CHAT_GETDOC_ERROR] chatId=${chatId}, elapsedMs=${Date.now() - getDocStart}, error=${getDocErr}`);
            console.warn('[useChat] getDoc failed (possibly offline), falling back to local state:', getDocErr);
          }
        }
      }

      // Validar que en chats direct/peer no se permita enviar si el usuario no pertenece a la conversación
      const isDirectOrPeer = chatId.startsWith('direct_') || chatId.startsWith('peer_');
      if (isDirectOrPeer && !participantsList.includes(effectiveSenderId) && firebaseRole !== 'admin') {
        console.error('[Security Error] Usuario intentó enviar un mensaje a una conversación donde no es participante:', {
          chatId,
          effectiveSenderId,
          participantsList
        });
        setError('Error de seguridad: No tienes permisos para participar en este chat.');
        return;
      }

      if (!participantsList.includes(effectiveSenderId)) {
        participantsList.push(effectiveSenderId);
      }

      // Contador inicial de no leídos
      const initialUnread: Record<string, number> = {};
      participantsList.forEach(pId => {
        initialUnread[pId] = pId === effectiveSenderId ? 0 : 1;
      });

      // Si la conversación no existe en Firestore, crearla
      if (!chatExists) {
        const resolvedMeta = resolveConversationMetadata(chatId, {
          cachedData: chatMeta,
          studentId: options?.studentId,
          teacherId: options?.teacherId,
          participants: participantsList,
          currentUserId: effectiveSenderId
        });

        const finalStudentId = options?.studentId || resolvedMeta.studentId || undefined;
        const finalTeacherId = options?.teacherId || resolvedMeta.teacherId || undefined;

        const currentSenderRole = senderRole || firebaseRole;
        const isSenderStudent = currentSenderRole === 'student' || (!isPrivileged && effectiveSenderId !== 'admin');

        const chatPayload: any = {
          chatId,
          type: resolvedMeta.type !== 'unknown' ? resolvedMeta.type : (chatId.startsWith('direct_') ? 'direct' : chatId.startsWith('peer_') ? 'peer' : chatId.startsWith('support_') ? 'support' : 'group'),
          participants: participantsList,
          lastMessage: text,
          lastMessageTimestamp: serverTimestamp(),
          unreadCount: initialUnread,
          unreadByAdmin: isSenderStudent,
          unreadByTeacher: isSenderStudent,
          unreadByStudent: !isSenderStudent
        };

        if (finalStudentId) {
          chatPayload.studentId = finalStudentId;
        }
        if (finalTeacherId) {
          chatPayload.teacherId = finalTeacherId;
        }
        if (resolvedMeta.courseId) {
          chatPayload.courseId = resolvedMeta.courseId;
        }

        console.log(`[SEND_TRACE] [SEND_CHAT_WRITE_START] chatId=${chatId}, timestamp=${Date.now()}`);
        setDoc(chatRef, chatPayload, { merge: true }).then(() => {
          console.log(`[SEND_TRACE] [SEND_CHAT_WRITE_SUCCESS] chatId=${chatId}, timestamp=${Date.now()}`);
        }).catch((err) => {
          console.warn('[useChat] Error creating chat (possibly queued offline):', err);
        });
      }

      // Insertar el nuevo mensaje de forma idempotente con setDoc y merge
      const messageDocRef = doc(messagesRef);
      const messagePayload: any = {
        id: messageDocRef.id,
        senderId: effectiveSenderId,
        text,
        type,
        timestamp: serverTimestamp(),
        participants: participantsList
      };
      if (senderRole) {
        messagePayload.senderRole = senderRole;
      }
      if (attachments && attachments.length > 0) {
        messagePayload.attachments = attachments;
      }
      
      console.log(`[SEND_TRACE] [SEND_MESSAGE_WRITE_START] chatId=${chatId}, timestamp=${Date.now()}`);
      setDoc(messageDocRef, messagePayload, { merge: true }).then(() => {
        console.log(`[SEND_TRACE] [SEND_MESSAGE_WRITE_SUCCESS] chatId=${chatId}, timestamp=${Date.now()}`);
        
        // Sincronizar con la caché de React Query (P5.3)
        const newMsg: ChatMessage = {
            ...messagePayload,
            timestamp: new Date().toISOString() // Fallback timestamp para la UI instantánea
        };
        
        const updateCache = (key: string) => {
            if (!queryClient) return;
            queryClient.setQueryData([key, chatId], (old: any[] | undefined) => {
                if (!old) return [newMsg];
                if (old.some(m => m.id === newMsg.id)) return old;
                return [...old, newMsg];
            });
        };

        updateCache('messages');
        updateCache('peerMessages');
        updateCache('teacherMessages');
        updateCache('groupMessages');

      }).catch(err => {
        console.error('[useChat] Error al escribir mensaje (possibly queued):', err);
      });

      // Incrementar contador de no leídos para los otros participantes y resetear para el remitente
      const resolvedMetaForUpdate = resolveConversationMetadata(chatId, {
        cachedData: chatMeta,
        studentId: options?.studentId,
        teacherId: options?.teacherId,
        participants: participantsList,
        currentUserId: effectiveSenderId
      });
      const finalStudentIdForUpdate = options?.studentId || resolvedMetaForUpdate.studentId || undefined;
      const finalTeacherIdForUpdate = options?.teacherId || resolvedMetaForUpdate.teacherId || undefined;
      const chatTypeForUpdate = resolvedMetaForUpdate.type !== 'unknown' 
        ? resolvedMetaForUpdate.type 
        : (chatId.startsWith('direct_') ? 'direct' : chatId.startsWith('peer_') ? 'peer' : chatId.startsWith('support_') ? 'support' : 'group');

      const updateData: Record<string, any> = {
        chatId,
        type: chatTypeForUpdate,
        participants: participantsList,
        lastMessage: text,
        lastMessageTimestamp: serverTimestamp(),
        [`unreadCount.${effectiveSenderId}`]: 0,
        [`unreadByStudentId.${effectiveSenderId}`]: false
      };

      if (finalStudentIdForUpdate) {
        updateData.studentId = finalStudentIdForUpdate;
      }
      if (finalTeacherIdForUpdate) {
        updateData.teacherId = finalTeacherIdForUpdate;
      }
      if (resolvedMetaForUpdate.courseId) {
        updateData.courseId = resolvedMetaForUpdate.courseId;
      }

      const currentSenderRole = senderRole || firebaseRole;
      if (currentSenderRole === 'admin') {
        updateData.unreadByAdmin = false;
        updateData.unreadByStudent = true;
        updateData.unreadByTeacher = true;
      } else if (currentSenderRole === 'teacher') {
        updateData.unreadByTeacher = false;
        updateData.unreadByStudent = true;
      } else if (currentSenderRole === 'student') {
        updateData.unreadByStudent = false;
        updateData.unreadByAdmin = true;
        updateData.unreadByTeacher = true;
      } else {
        if (effectiveSenderId === 'admin' || effectiveSenderId.startsWith('admin')) {
          updateData.unreadByAdmin = false;
          updateData.unreadByStudent = true;
        } else {
          updateData.unreadByStudent = false;
          updateData.unreadByAdmin = true;
        }
      }

      participantsList.forEach(pId => {
        if (pId !== effectiveSenderId) {
          updateData[`unreadCount.${pId}`] = increment(1);
          updateData[`unreadByStudentId.${pId}`] = true;
        }
      });

      console.log(`[SEND_TRACE] [SEND_METADATA_WRITE_START] chatId=${chatId}, timestamp=${Date.now()}`);
      setDoc(chatRef, updateData, { merge: true }).then(() => {
        console.log(`[SEND_TRACE] [SEND_METADATA_WRITE_SUCCESS] chatId=${chatId}, timestamp=${Date.now()}`);
      }).catch((err) => {
        console.warn('[useChat] Chat update error (possibly offline/queued):', err);
      });
      
      console.log(`[SEND_TRACE] [SEND_COMPLETE] chatId=${chatId}, timestamp=${Date.now()}`);
    } catch (err) {
      console.error('Error al enviar mensaje:', err);
      console.log(`[SEND_TRACE] [SEND_ERROR] chatId=${chatId}, error=${err}, timestamp=${Date.now()}`);
      setError('No se pudo enviar el mensaje. Verifica tu conexión.');
      throw err;
    } finally {
      console.log(`[SEND_TRACE] [SEND_FINALLY] chatId=${chatId}, timestamp=${Date.now()}`);
      isSendingRef.current = false;
    }
  };

  




  const editMessage = async (messageId: string, newText: string) => {
    if (!chatId || !messageId) return;
    try {
      const messageRef = doc(db, 'chats', chatId, 'messages', messageId);
      await updateDoc(messageRef, { text: newText });
      
      // Sincronizar caché (P5.3)
      const updateCache = (key: string) => {
          if (!queryClient) return;
          queryClient.setQueryData([key, chatId], (old: any[] | undefined) => {
              if (!old) return old;
              return old.map(m => m.id === messageId ? { ...m, text: newText, updatedAt: new Date().toISOString() } : m);
          });
      };
      updateCache('messages');
      updateCache('peerMessages');
      updateCache('teacherMessages');
      updateCache('groupMessages');

    } catch (err) {
      console.error('Error al editar mensaje:', err);
      throw err;
    }
  };

  const deleteMessage = async (messageId: string) => {
    if (!chatId || !messageId) return;
    try {
      const messageRef = doc(db, 'chats', chatId, 'messages', messageId);
      await deleteDoc(messageRef);

      // Sincronizar caché (P5.3)
      const updateCache = (key: string) => {
          if (!queryClient) return;
          queryClient.setQueryData([key, chatId], (old: any[] | undefined) => {
              if (!old) return old;
              return old.filter(m => m.id !== messageId);
          });
      };
      updateCache('messages');
      updateCache('peerMessages');
      updateCache('teacherMessages');
      updateCache('groupMessages');

    } catch (err) {
      console.error('Error al borrar mensaje:', err);
      throw err;
    }
  };

  return useMemo(() => ({
    editMessage,
    deleteMessage,
    messages,
    chatMeta,
    loading,
    error,
    sendMessage,
    markAsRead,
    listenerReady
  }), [
    editMessage,
    deleteMessage,
    messages,
    chatMeta,
    loading,
    error,
    sendMessage,
    markAsRead,
    listenerReady
  ]);
}
