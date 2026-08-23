import { useState, useEffect, useCallback, useRef } from 'react';
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
import * as api from '../services/api';
import {
  inferParticipantsFromChatId,
  parseDirectChatId,
  parseSupportChatId,
  getDirectChatId,
  getDirectChatParticipants,
  resolveUserUid
} from '../utils/chatUtils';

export {
  inferParticipantsFromChatId,
  parseDirectChatId,
  parseSupportChatId,
  getDirectChatId,
  getDirectChatParticipants,
  resolveUserUid
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
  const { isFirebaseAuthReady, firebaseUser, firebaseEmailVerified, firebaseRole } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatMeta, setChatMeta] = useState<ChatMetadata | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Escuchar metadatos del chat y mensajes en tiempo real sincronizado con Firebase Auth
  useEffect(() => {
    if (!chatId) {
      setMessages([]);
      setChatMeta(null);
      setLoading(false);
      return;
    }

    // 1. Esperar a que Firebase Auth esté listo
    if (!isFirebaseAuthReady) {
      console.log('[Firestore] Chat listeners waiting for Firebase Auth READY');
      setLoading(true);
      return;
    }

    // 2. Comprobar sesión real de Firebase Auth y verificación de email
    const currentUser = auth?.currentUser || firebaseUser;
    const isVerified = Boolean(currentUser && (currentUser.emailVerified || firebaseEmailVerified));

    if (!currentUser || !isVerified) {
      console.log('[Firestore] Chat listeners waiting for Firebase Auth or unauthenticated/unverified session');
      setMessages([]);
      setChatMeta(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    let unsubChat: (() => void) | null = null;
    let unsubMessages: (() => void) | null = null;

    const parsedSupport = chatId.startsWith('support_') ? parseSupportChatId(chatId) : { studentId: null };
    const initialParticipants = options?.participants || 
      (options?.studentId && options?.teacherId ? [options.studentId, options.teacherId] : 
       (parsedSupport.studentId ? [parsedSupport.studentId] : inferParticipantsFromChatId(chatId, currentUser.uid)));

    console.log(`[Firestore] Chat listeners initialized for chat: ${chatId} | user: ${currentUser.uid} | role: ${firebaseRole || 'none'} | participants: [${initialParticipants.join(', ')}]`);

    try {
      // Documento de metadatos del chat
      const chatRef = doc(db, 'chats', chatId);
      unsubChat = onSnapshot(
        chatRef, 
        (snapshot) => {
          if (snapshot.exists()) {
            setChatMeta({ chatId: snapshot.id, ...snapshot.data() } as ChatMetadata);
          } else {
            setChatMeta(null);
          }
        }, 
        (err) => {
          console.warn('[Firestore] Error al obtener metadatos del chat:', err.message);
          setError('No se pudieron cargar los metadatos de la conversación.');
        }
      );

      // Subcolección de mensajes ordenada cronológicamente (limitada a los últimos 100)
      const messagesQuery = query(
        collection(db, 'chats', chatId, 'messages'),
        orderBy('timestamp', 'asc'),
        limitToLast(100)
      );

      unsubMessages = onSnapshot(
        messagesQuery, 
        (snapshot) => {
          const msgs: ChatMessage[] = snapshot.docs.map(docSnap => ({
            id: docSnap.id,
            ...docSnap.data()
          } as ChatMessage));
          setMessages(msgs);
          setLoading(false);
        }, 
        (err) => {
          console.warn('[Firestore] Error al escuchar mensajes:', err.message);
          setError('Error en la conexión en tiempo real con los mensajes.');
          setLoading(false);
        }
      );
    } catch (e) {
      console.warn('[Firestore] Excepción al configurar listeners:', e);
      setLoading(false);
    }

    return () => {
      if (unsubChat) unsubChat();
      if (unsubMessages) unsubMessages();
    };
  }, [chatId, isFirebaseAuthReady, firebaseUser, firebaseEmailVerified, firebaseRole, options?.studentId, options?.teacherId]);

  // Marcar como leído los mensajes de la conversación actual
  const markAsRead = useCallback(async () => {
    if (!chatId || !currentUserId) return;
    if (!auth?.currentUser || !auth.currentUser.emailVerified) return;

    try {
      const chatRef = doc(db, 'chats', chatId);
      await updateDoc(chatRef, {
        [`unreadCount.${currentUserId}`]: 0
      }).catch(() => {});
    } catch (err) {
      console.warn('[useChat] Error al marcar mensajes como leídos:', err);
    }
  }, [chatId, currentUserId]);

  const isSendingRef = useRef(false);

  // Enviar mensaje e inicializar correctamente metadatos e unreadCount
  const sendMessage = async (
    text: string, 
    type: 'text' | 'voice_note' = 'text',
    customParticipants?: string[],
    attachments?: any[],
    senderRole?: string
  ) => {
    if (!chatId || !currentUserId || (!text.trim() && (!attachments || attachments.length === 0))) return;
    if (isSendingRef.current) {
      console.warn('[useChat] Message send already in flight, ignoring duplicate call');
      return;
    }

    isSendingRef.current = true;
    try {
      // Verificar coincidencia de identidad entre currentUserId y auth.currentUser.uid
      const currentUser = auth?.currentUser || firebaseUser;
      if (currentUser && currentUserId && currentUser.uid !== currentUserId) {
        console.error('[Security Error] currentUserId does not match auth.currentUser.uid:', {
          currentUserId,
          authUid: currentUser.uid
        });
        setError('Error de seguridad: Inconsistencia en la identidad del usuario.');
        return;
      }

      const effectiveSenderId = currentUser ? currentUser.uid : currentUserId;
      const isFirebaseAuthed = Boolean(currentUser && (currentUser.emailVerified || firebaseEmailVerified));

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
      try {
        const chatSnap = await getDoc(chatRef);
        chatExists = chatSnap.exists();
        const data = chatExists ? chatSnap.data() : null;
        if (participantsList.length === 0 && data?.participants?.length) {
          participantsList = data.participants;
        }
      } catch (getDocErr) {
        console.warn('[useChat] getDoc failed (possibly offline), falling back to local state:', getDocErr);
        if (chatMeta) {
          chatExists = true;
          if (participantsList.length === 0 && chatMeta.participants?.length) {
            participantsList = chatMeta.participants;
          }
        }
      }

      if (participantsList.length === 0) {
        if (options?.participants && options.participants.length > 0) {
          participantsList = [...options.participants];
        } else if (options?.studentId && options?.teacherId) {
          participantsList = getDirectChatParticipants(options.studentId, options.teacherId);
        } else {
          participantsList = inferParticipantsFromChatId(chatId, effectiveSenderId);
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

      if (!chatId.startsWith('support_') && !participantsList.includes(effectiveSenderId)) {
        participantsList.push(effectiveSenderId);
      }

      // Contador inicial de no leídos
      const initialUnread: Record<string, number> = {};
      participantsList.forEach(pId => {
        initialUnread[pId] = pId === effectiveSenderId ? 0 : 1;
      });

      // Si la conversación no existe en Firestore, crearla
      if (!chatExists) {
        const isDirect = chatId.startsWith('direct_');
        const isPeer = chatId.startsWith('peer_');
        const isSupport = chatId.startsWith('support_');
        const parsedDirect = isDirect ? parseDirectChatId(chatId) : { studentId: null, teacherId: null };
        const parsedSupport = isSupport ? parseSupportChatId(chatId) : { studentId: null };
        const finalStudentId = options?.studentId || parsedDirect.studentId || parsedSupport.studentId || undefined;
        const finalTeacherId = options?.teacherId || parsedDirect.teacherId || undefined;

        const chatPayload: any = {
          chatId,
          type: isDirect ? 'direct' : isPeer ? 'peer' : isSupport ? 'support' : 'group',
          participants: participantsList,
          lastMessage: text,
          lastMessageTimestamp: serverTimestamp(),
          unreadCount: initialUnread,
          createdBy: effectiveSenderId,
          createdAt: serverTimestamp()
        };

        if (finalStudentId) {
          chatPayload.studentId = finalStudentId;
        }
        if (finalTeacherId) {
          chatPayload.teacherId = finalTeacherId;
        }

        await setDoc(chatRef, chatPayload, { merge: true }).catch((err) => {
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
      await setDoc(messageDocRef, messagePayload, { merge: true });

      // Incrementar contador de no leídos para los otros participantes
      const updateData: Record<string, any> = {
        lastMessage: text,
        lastMessageTimestamp: serverTimestamp(),
      };

      participantsList.forEach(pId => {
        if (pId !== effectiveSenderId) {
          updateData[`unreadCount.${pId}`] = increment(1);
        }
      });

      await setDoc(chatRef, updateData, { merge: true }).catch((err) => {
        console.warn('[useChat] Chat update error (possibly offline/queued):', err);
      });

    } catch (err) {
      console.error('Error al enviar mensaje:', err);
      setError('No se pudo enviar el mensaje. Verifica tu conexión.');
      throw err;
    } finally {
      isSendingRef.current = false;
    }
  };

  
  const editMessage = async (messageId: string, newText: string) => {
    if (!chatId || !currentUserId || !messageId) return;
    try {
      const currentUser = auth?.currentUser || firebaseUser;
      if (currentUser && currentUserId && currentUser.uid !== currentUserId) {
        console.error('[Security Error] currentUserId does not match auth.currentUser.uid in editMessage:', {
          currentUserId,
          authUid: currentUser.uid
        });
        throw new Error('Error de seguridad: Inconsistencia en la identidad del usuario.');
      }
      const isFirebaseAuthed = Boolean(currentUser && (currentUser.emailVerified || firebaseEmailVerified));
      if (!isFirebaseAuthed) {
        if (chatId.startsWith('peer_')) {
            await api.editPeerMessage(messageId, newText);
        } else if (chatId.startsWith('teacher_')) {
            await api.editTeacherMessage(messageId, newText);
        } else {
            await api.editMessage(messageId, newText);
        }
        return;
      }
      const messageRef = doc(db, 'chats', chatId, 'messages', messageId);
      await updateDoc(messageRef, { text: newText });
    } catch (err) {
      console.error('Error al editar mensaje:', err);
      throw err;
    }
  };

  const deleteMessage = async (messageId: string) => {
    if (!chatId || !currentUserId || !messageId) return;
    try {
      const currentUser = auth?.currentUser || firebaseUser;
      if (currentUser && currentUserId && currentUser.uid !== currentUserId) {
        console.error('[Security Error] currentUserId does not match auth.currentUser.uid in deleteMessage:', {
          currentUserId,
          authUid: currentUser.uid
        });
        throw new Error('Error de seguridad: Inconsistencia en la identidad del usuario.');
      }
      const isFirebaseAuthed = Boolean(currentUser && (currentUser.emailVerified || firebaseEmailVerified));
      if (!isFirebaseAuthed) {
        if (chatId.startsWith('peer_')) {
            await api.deletePeerMessage(messageId);
        } else if (chatId.startsWith('teacher_')) {
            await api.deleteTeacherMessage(messageId);
        } else {
            await api.deleteMessage(messageId);
        }
        return;
      }
      const messageRef = doc(db, 'chats', chatId, 'messages', messageId);
      await deleteDoc(messageRef);
    } catch (err) {
      console.error('Error al borrar mensaje:', err);
      throw err;
    }
  };

  return {
    editMessage,
    deleteMessage,
    messages,
    chatMeta,
    loading,
    error,
    sendMessage,
    markAsRead
  };
}
