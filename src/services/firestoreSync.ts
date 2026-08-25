import { db, auth, handleFirestoreError, OperationType } from './firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { 
    collection, 
    doc, 
    setDoc, 
    addDoc, 
    onSnapshot as originalOnSnapshot, 
    query, 
    orderBy, 
    limit, 
    serverTimestamp,
    deleteDoc,
    where,
    getDocs,
    getDoc
} from 'firebase/firestore';
import { eventEmitter } from './eventService';
import * as dbMock from './mockDatabase';
import * as api from './api';
import { listenerTracker } from './listenerTracker';
import { DirectMessage, StudentPeerMessage, CourseGroupMessage, Attachment } from '../types';

let isInitialized = false;
let currentInitializedUid: string | null = null;
let activeUnsubscribes: (() => void)[] = [];

export const resetFirestoreSync = () => {
    isInitialized = false;
    currentInitializedUid = null;
    activeUnsubscribes.forEach(unsub => {
        try { unsub(); } catch (e) { console.warn('Unsubscribe warning:', e); }
    });
    activeUnsubscribes = [];
};

const isCurrentUserAdmin = async (): Promise<boolean> => {
    try {
        const currentUser = auth.currentUser;
        if (!currentUser || !currentUser.emailVerified) return false;
        const tokenResult = await currentUser.getIdTokenResult();
        const role = tokenResult.claims.role;
        const isAdmin = role === 'admin' || Boolean(tokenResult.claims.isAdmin);
        return isAdmin;
    } catch {
        return false;
    }
};

export const recordDeletedItemInFirestore = async (idVal: string, type: string) => {
    try {
        if (!idVal) return;
        const isAdmin = await isCurrentUserAdmin();
        if (!isAdmin) return;

        const cleanId = String(idVal).replace(/[^a-zA-Z0-9_-]/g, '_');
        const docId = `${type}_${cleanId}`;
        await safeSetDoc(doc(db, 'firestore_deleted_items', docId), {
            id: idVal,
            type,
            deletedAt: serverTimestamp()
        });
    } catch (e: any) {
        if (e?.code !== 'permission-denied') {
            console.warn(`[FirestoreSync] Failed to record deleted item ${idVal} (${type}):`, e);
        }
    }
};

const handleSyncError = (label: string, err: any) => {
    if (err?.code === 'permission-denied' || err?.message?.includes('insufficient permissions')) {
        console.debug(`[FirestoreSync] ${label} restricted for current user role.`);
    } else {
        console.warn(`[FirestoreSync] ${label}:`, err?.message || err);
    }
};

export const initAppConfigSync = () => {
    try {
        const appConfigRef = doc(db, 'app_config', 'main');
        originalOnSnapshot(appConfigRef, (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                Object.assign(dbMock.appConfigData, data);
                eventEmitter.emit('app-config-updated', dbMock.appConfigData);
            } else if (dbMock.appConfigData) {
                syncAppConfigToFirestore(dbMock.appConfigData);
            }
        }, (err: any) => handleSyncError('Firestore app config sync:', err));
    } catch (e) {
        console.warn('Failed to initialize app config sync:', e);
    }
};

export const initFirestoreSync = () => {
    const currentUser = auth.currentUser;
    if (!currentUser) {
        console.log('[FirestoreSync] Delaying initialization until user is authenticated.');
        return;
    }
    
    // Evitar duplicaciones de escuchadores para el mismo usuario
    if (isInitialized && currentInitializedUid === currentUser.uid) {
        return;
    }

    // Si ya estaba inicializado para otro usuario, reiniciar primero
    if (isInitialized) {
        resetFirestoreSync();
    }

    console.log(`[F110.30] [FSYNC_READY] | timestamp: ${performance.now()}`);
    isInitialized = true;
    currentInitializedUid = currentUser.uid;
    console.log(`[FirestoreSync] Initializing real-time Firestore listeners for user ${currentUser.uid}`);

    try {
        const currentAuth = auth.currentUser;
        const currentUserObj = currentAuth ? dbMock.dbFindUserAnywhere(currentAuth.uid) : null;
        const isEmailVerified = currentAuth?.emailVerified === true;
        const isStudentRole = isEmailVerified && currentAuth && (!currentUserObj || currentUserObj.role === 'student');
        const isTeacherRole = isEmailVerified && currentAuth && currentUserObj?.role === 'teacher';

        const onSnapshot: typeof originalOnSnapshot = (refOrQuery: any, ...args: any[]): any => {
            const rawPath = refOrQuery?._query?.path?.canonicalString?.() || refOrQuery?.path || refOrQuery?._path?.canonicalString?.() || 'firestore_query';
            const listenerId = listenerTracker.register('firestoreSync', String(rawPath), 'query');
            const originalUnsub = (originalOnSnapshot as any)(refOrQuery, ...args);
            const wrappedUnsub = () => {
                listenerTracker.cleanup(listenerId);
                if (typeof originalUnsub === 'function') originalUnsub();
            };
            activeUnsubscribes.push(wrappedUnsub);
            return wrappedUnsub;
        };

        // 0. Sync deleted items blacklist across browser reloads
        if (isEmailVerified && currentUserObj?.role === 'admin') {
            const deletedRef = collection(db, 'firestore_deleted_items');
            getDocs(deletedRef).then((snapshot: any) => {
                snapshot.docs.forEach((docSnap: any) => {
                    const data = docSnap.data();
                    const idVal = data.id || docSnap.id;
                    const type = data.type || 'user';
                    if (idVal) {
                        dbMock.markItemAsDeleted(idVal, type);
                    }
                });
            }).catch(err => console.warn('[FirestoreSync] Initial deleted_items fetch warning:', err.message));

            onSnapshot(deletedRef, (snapshot: any) => {
                snapshot.docs.forEach((docSnap: any) => {
                    const data = docSnap.data();
                    const idVal = data.id || docSnap.id;
                    const type = data.type || 'user';
                    if (idVal) {
                        dbMock.markItemAsDeleted(idVal, type);
                    }
                });
            }, (err) => console.warn('[FirestoreSync] deleted_items listener warning:', err.message));
        }
        // Nota: No llamamos a syncAllUsersToFirestore() automáticamente al arrancar para evitar exceder la cuota de escrituras de Firestore.
        // La sincronización inicial se puede activar de forma manual desde el panel de pruebas si es necesario.

        // 1. Peer Messages real-time sync
        if (currentUserObj?.role === 'admin') {
            const peerMsgsRef = collection(db, 'firestore_peer_messages');
        const qPeer = query(peerMsgsRef, orderBy('createdAt', 'asc'), limit(500));
        let isInitialPeer = true;
        onSnapshot(qPeer, (snapshot: any) => {
            const isInitial = isInitialPeer;
            isInitialPeer = false;
            snapshot.docChanges().forEach((change: any) => {
                const data = change.doc.data() || {};
                const msgId = data.id || change.doc.id;
                if (change.type === 'added') {
                    const exists = (dbMock.studentPeerMessagesData || []).some(m => m.id === msgId);
                    if (!exists) {
                        const newMsg: StudentPeerMessage = {
                            id: msgId,
                            conversationId: data.conversationId,
                            senderId: data.senderId,
                            senderName: data.senderName,
                            text: data.text,
                            timestamp: data.timestamp || new Date().toISOString(),
                            isRead: false,
                            attachments: data.attachments
                        };
                        if (dbMock.studentPeerMessagesData) {
                            dbMock.studentPeerMessagesData.push(newMsg);
                        }

                        // Update conversation last message
                        const convo = (dbMock.studentPeerConversationsData || []).find(c => c && c.id === data.conversationId);
                        if (convo) {
                            convo.lastMessageText = data.text;
                            convo.lastMessageTimestamp = newMsg.timestamp;
                        } else if (data.conversationId) {
                            const parts = data.conversationId.replace('peer_', '').split('_');
                            dbMock.studentPeerConversationsData.push({
                                id: data.conversationId,
                                participantIds: parts,
                                lastMessageText: data.text,
                                lastMessageTimestamp: newMsg.timestamp,
                                unreadByStudentId: {}
                            });
                        }
                        eventEmitter.emit('peer-message-update', newMsg);
                        if (!isInitial) {
                            eventEmitter.emit('realtime-incoming-message', {
                                id: msgId,
                                text: data.text,
                                senderId: data.senderId,
                                senderName: data.senderName || 'Estudiante',
                                conversationId: data.conversationId,
                                type: 'peer'
                            });
                        }
                    }
                } else if (change.type === 'modified') {
                    const idx = (dbMock.studentPeerMessagesData || []).findIndex(m => m.id === msgId);
                    if (idx > -1) {
                        dbMock.studentPeerMessagesData[idx] = { ...dbMock.studentPeerMessagesData[idx], ...data };
                        eventEmitter.emit('peer-message-update', dbMock.studentPeerMessagesData[idx]);
                    }
                } else if (change.type === 'removed') {
                    const idx = (dbMock.studentPeerMessagesData || []).findIndex(m => m.id === msgId);
                    if (idx > -1) {
                        const [removed] = dbMock.studentPeerMessagesData.splice(idx, 1);
                        eventEmitter.emit('peer-message-update', { ...removed, deleted: true } as any);
                    }
                }
            });
        }, (err: any) => handleSyncError('Firestore peer chat sync:', err));
        }

        // 2. Direct Messages (Student - Teacher / Admin)
        if (currentUserObj?.role === 'admin') {
            const directMsgsRef = collection(db, 'firestore_direct_messages');
        const qDirect = query(directMsgsRef, orderBy('createdAt', 'asc'), limit(500));
        let isInitialDirect = true;
        onSnapshot(qDirect, (snapshot: any) => {
            const isInitial = isInitialDirect;
            isInitialDirect = false;
            snapshot.docChanges().forEach((change: any) => {
                const data = change.doc.data() || {};
                const msgId = data.id || change.doc.id;
                if (change.type === 'added') {
                    const exists = (dbMock.directMessagesData || []).some(m => m.id === msgId);
                    if (!exists) {
                        const newMsg: DirectMessage = {
                            id: msgId,
                            conversationId: data.conversationId,
                            senderId: data.senderId,
                            senderName: data.senderName,
                            senderRole: data.senderRole,
                            text: data.text,
                            timestamp: data.timestamp || new Date().toISOString(),
                            attachments: data.attachments
                        };
                        if (dbMock.directMessagesData) {
                            dbMock.directMessagesData.push(newMsg);
                        }

                        const convo = (dbMock.conversationsData || []).find(c => c && c.id === data.conversationId);
                        if (convo) {
                            convo.lastMessageText = data.text;
                            convo.lastMessageTimestamp = newMsg.timestamp;
                        }
                        eventEmitter.emit('direct-message-update', newMsg);
                        eventEmitter.emit('message-update', newMsg);
                        if (!isInitial) {
                            eventEmitter.emit('realtime-incoming-message', {
                                id: msgId,
                                text: data.text,
                                senderId: data.senderId,
                                senderName: data.senderName || (data.senderRole === 'teacher' ? 'Profesor' : data.senderRole === 'admin' ? 'Coordinación' : 'Estudiante'),
                                senderRole: data.senderRole,
                                conversationId: data.conversationId,
                                type: 'direct'
                            });
                        }
                    }
                } else if (change.type === 'modified') {
                    const idx = (dbMock.directMessagesData || []).findIndex(m => m.id === msgId);
                    if (idx > -1) {
                        dbMock.directMessagesData[idx] = { ...dbMock.directMessagesData[idx], ...data };
                        eventEmitter.emit('direct-message-update', dbMock.directMessagesData[idx]);
                        eventEmitter.emit('message-update', dbMock.directMessagesData[idx]);
                    }
                } else if (change.type === 'removed') {
                    const idx = (dbMock.directMessagesData || []).findIndex(m => m.id === msgId);
                    if (idx > -1) {
                        const [removed] = dbMock.directMessagesData.splice(idx, 1);
                        eventEmitter.emit('direct-message-update', { ...removed, deleted: true } as any);
                        eventEmitter.emit('message-update', { ...removed, deleted: true } as any);
                    }
                }
            });
        }, (err: any) => handleSyncError('Firestore direct chat sync:', err));
        }

        // 3. Teacher Group Messages
        if (currentUserObj?.role === 'admin' || isTeacherRole) {
            const teacherMsgsRef = collection(db, 'firestore_teacher_messages');
        const qTeacher = query(teacherMsgsRef, orderBy('createdAt', 'asc'), limit(500));
        let isInitialTeacher = true;
        onSnapshot(qTeacher, (snapshot: any) => {
            const isInitial = isInitialTeacher;
            isInitialTeacher = false;
            snapshot.docChanges().forEach((change: any) => {
                const data = change.doc.data() || {};
                const msgId = data.id || change.doc.id;
                if (change.type === 'added') {
                    const exists = (dbMock.teacherMessagesData || []).some(m => m.id === msgId);
                    if (!exists) {
                        const newMsg = {
                            id: msgId,
                            conversationId: data.conversationId || 'sala_profesores_coordinacion',
                            senderId: data.senderId,
                            senderName: data.senderName,
                            text: data.text,
                            timestamp: data.timestamp || new Date().toISOString(),
                            attachments: data.attachments
                        };
                        if (dbMock.teacherMessagesData) {
                            dbMock.teacherMessagesData.push(newMsg);
                        }
                        eventEmitter.emit('teacher-message-update', newMsg);
                        if (!isInitial) {
                            eventEmitter.emit('realtime-incoming-message', {
                                id: msgId,
                                text: data.text,
                                senderId: data.senderId,
                                senderName: data.senderName || 'Profesor / Admin',
                                conversationId: data.conversationId || 'sala_profesores_coordinacion',
                                type: 'teacher'
                            });
                        }
                    }
                } else if (change.type === 'modified') {
                    const idx = (dbMock.teacherMessagesData || []).findIndex(m => m.id === msgId);
                    if (idx > -1) {
                        dbMock.teacherMessagesData[idx] = { ...dbMock.teacherMessagesData[idx], ...data };
                        eventEmitter.emit('teacher-message-update', dbMock.teacherMessagesData[idx]);
                    }
                } else if (change.type === 'removed') {
                    const idx = (dbMock.teacherMessagesData || []).findIndex(m => m.id === msgId);
                    if (idx > -1) {
                        const [removed] = dbMock.teacherMessagesData.splice(idx, 1);
                        eventEmitter.emit('teacher-message-update', { ...removed, deleted: true } as any);
                        eventEmitter.emit('teacher-message-deleted', removed);
                    }
                }
            });
        }, (err: any) => handleSyncError('Firestore teacher chat sync:', err));
        }

        // 4. Course Group Messages
        if (currentUserObj?.role === 'admin') {
            const courseMsgsRef = collection(db, 'firestore_course_messages');
        const qCourse = query(courseMsgsRef, orderBy('createdAt', 'asc'), limit(500));
        let isInitialCourse = true;
        onSnapshot(qCourse, (snapshot: any) => {
            const isInitial = isInitialCourse;
            isInitialCourse = false;
            snapshot.docChanges().forEach((change: any) => {
                const data = change.doc.data() || {};
                const msgId = data.id || change.doc.id;
                if (change.type === 'added') {
                    const exists = (dbMock.courseGroupMessagesData || []).some(m => m.id === msgId);
                    if (!exists) {
                        const newMsg: CourseGroupMessage = {
                            id: msgId,
                            courseId: data.courseId,
                            senderId: data.senderId,
                            senderName: data.senderName,
                            text: data.text,
                            timestamp: data.timestamp || new Date().toISOString(),
                            attachments: data.attachments
                        };
                        if (dbMock.courseGroupMessagesData) {
                            dbMock.courseGroupMessagesData.push(newMsg);
                        }
                        eventEmitter.emit('course-group-message-update', newMsg);
                        eventEmitter.emit('group-message-update', newMsg);
                        if (!isInitial) {
                            eventEmitter.emit('realtime-incoming-message', {
                                id: msgId,
                                text: data.text,
                                senderId: data.senderId,
                                senderName: data.senderName || 'Compañero / Profesor',
                                conversationId: data.courseId,
                                type: 'course'
                            });
                        }
                    }
                } else if (change.type === 'modified') {
                    const idx = (dbMock.courseGroupMessagesData || []).findIndex(m => m.id === msgId);
                    if (idx > -1) {
                        dbMock.courseGroupMessagesData[idx] = { ...dbMock.courseGroupMessagesData[idx], ...data };
                        eventEmitter.emit('course-group-message-update', dbMock.courseGroupMessagesData[idx]);
                        eventEmitter.emit('group-message-update', dbMock.courseGroupMessagesData[idx]);
                    }
                } else if (change.type === 'removed') {
                    const idx = (dbMock.courseGroupMessagesData || []).findIndex(m => m.id === msgId);
                    if (idx > -1) {
                        const [removed] = dbMock.courseGroupMessagesData.splice(idx, 1);
                        eventEmitter.emit('course-group-message-update', { ...removed, deleted: true } as any);
                        eventEmitter.emit('group-message-update', { ...removed, deleted: true } as any);
                    }
                }
            });
        }, (err: any) => handleSyncError('Firestore course chat sync:', err));
        }

        // 4.5. Voice / Video Rooms real-time sync is handled with granular authorization in RealtimeAlertsBanner

        // 4.6. Direct Conversations Metadata & Unread Badges ("Globos") Sync
        const conversationsRef = collection(db, 'firestore_conversations');
        let conversationsQuery = conversationsRef as any;
        if (isStudentRole && currentAuth) conversationsQuery = query(conversationsRef, where('studentId', '==', currentAuth.uid));
        else if (isTeacherRole && currentAuth) conversationsQuery = query(conversationsRef, where('teacherId', '==', currentAuth.uid));
        onSnapshot(conversationsQuery, (snapshot: any) => {
            snapshot.docChanges().forEach((change: any) => {
                const data = change.doc.data() || {};
                const rawConvoId = data.id || change.doc.id;
                const { studentId: parsedStudentId, teacherId: parsedTeacherId } = api.parseConversationParticipants(rawConvoId);
                const studentId = (data.studentId && data.studentId !== 'direct' ? data.studentId : parsedStudentId) || parsedStudentId;
                const teacherId = data.teacherId || parsedTeacherId;
                const convoId = rawConvoId.replace(/^direct_/, '');

                if (!studentId || studentId === 'direct') return;

                if (dbMock.isConversationClosed(convoId, studentId) || dbMock.isConversationClosed(rawConvoId, studentId)) {
                    if (dbMock.conversationsData) {
                        for (let i = dbMock.conversationsData.length - 1; i >= 0; i--) {
                            const c = dbMock.conversationsData[i];
                            if (c && c.id && (c.id === convoId || c.id === rawConvoId || c.id.replace(/^direct_/, '') === convoId)) {
                                dbMock.conversationsData.splice(i, 1);
                            }
                        }
                    }
                    eventEmitter.emit('message-update', { conversationId: convoId, closed: true });
                    eventEmitter.emit('direct-message-update', { conversationId: convoId, closed: true });
                    return;
                }
                if (change.type === 'added' || change.type === 'modified') {
                    const idx = (dbMock.conversationsData || []).findIndex(c => c && c.id && (c.id === convoId || c.id === rawConvoId || c.id.replace(/^direct_/, '') === convoId));
                    if (idx === -1) {
                        dbMock.conversationsData.push({
                            id: convoId,
                            studentId: studentId,
                            studentName: data.studentName || 'Estudiante',
                            teacherId: teacherId || null,
                            lastMessageText: data.lastMessageText || '',
                            lastMessageTimestamp: data.lastMessageTimestamp || new Date().toISOString(),
                            unreadByAdmin: data.unreadByAdmin ?? false,
                            unreadByTeacher: data.unreadByTeacher ?? false,
                            unreadByStudent: data.unreadByStudent ?? false,
                        } as any);
                    } else {
                        const existing = dbMock.conversationsData[idx];
                        dbMock.conversationsData[idx] = {
                            ...existing,
                            ...data,
                            id: convoId,
                            studentId: studentId,
                            unreadByAdmin: data.unreadByAdmin ?? existing.unreadByAdmin,
                            unreadByTeacher: data.unreadByTeacher ?? existing.unreadByTeacher,
                            unreadByStudent: data.unreadByStudent ?? existing.unreadByStudent,
                        };
                    }
                    eventEmitter.emit('message-update', { conversationId: convoId });
                    eventEmitter.emit('direct-message-update', { conversationId: convoId });
                } else if (change.type === 'removed') {
                    if (dbMock.conversationsData) {
                        for (let i = dbMock.conversationsData.length - 1; i >= 0; i--) {
                            const c = dbMock.conversationsData[i];
                            if (c && c.id && (c.id === convoId || c.id === rawConvoId || c.id.replace(/^direct_/, '') === convoId)) {
                                dbMock.conversationsData.splice(i, 1);
                            }
                        }
                    }
                    eventEmitter.emit('message-update', { conversationId: convoId, closed: true });
                    eventEmitter.emit('direct-message-update', { conversationId: convoId, closed: true });
                }
            });
        }, (err: any) => handleSyncError('Firestore conversations sync:', err));

        // 4.6b. Closed Support Conversations Real-time Sync
        if (currentUserObj?.role === 'admin') {
            const closedConvosRef = collection(db, 'firestore_closed_conversations');
            onSnapshot(closedConvosRef, (snapshot: any) => {
            snapshot.docChanges().forEach((change: any) => {
                const id = change.doc.id;
                if (change.type === 'added' || change.type === 'modified') {
                    dbMock.closedSupportConversationIds.add(id);
                    if (dbMock.conversationsData) {
                        for (let i = dbMock.conversationsData.length - 1; i >= 0; i--) {
                            const c = dbMock.conversationsData[i];
                            if (c && c.id && dbMock.isConversationClosed(c.id, c.studentId)) {
                                dbMock.conversationsData.splice(i, 1);
                                eventEmitter.emit('message-update', { conversationId: c.id, closed: true });
                                eventEmitter.emit('direct-message-update', { conversationId: c.id, closed: true });
                            }
                        }
                    }
                } else if (change.type === 'removed') {
                    dbMock.closedSupportConversationIds.delete(id);
                }
            });
        }, (err: any) => handleSyncError('Firestore closed convos sync:', err));
        }

        // 4.7. Peer Conversations Metadata & Unread Badges ("Globos") Sync
        const peerConvosRef = collection(db, 'firestore_peer_conversations');
        let peerConvosQuery = peerConvosRef as any;
        const actualIsApprovedTeacherPeer = isEmailVerified && (currentUserObj?.role === 'admin' || (currentUserObj?.role === 'teacher' && (currentUserObj as any).isApprovedForTutoring === true));
        if (!actualIsApprovedTeacherPeer && currentAuth) {
            peerConvosQuery = query(peerConvosRef, where('participantIds', 'array-contains', currentAuth.uid));
        }
        onSnapshot(peerConvosQuery, (snapshot: any) => {
            snapshot.docChanges().forEach((change: any) => {
                const data = change.doc.data() || {};
                const convoId = data.id || change.doc.id;
                if (change.type === 'added' || change.type === 'modified') {
                    const idx = (dbMock.studentPeerConversationsData || []).findIndex(c => c && c.id === convoId);
                    if (idx === -1) {
                        dbMock.studentPeerConversationsData.push({
                            id: convoId,
                            participantIds: data.participantIds || [],
                            lastMessageText: data.lastMessageText || '',
                            lastMessageTimestamp: data.lastMessageTimestamp || new Date().toISOString(),
                            unreadByStudentId: data.unreadByStudentId || {}
                        });
                    } else {
                        const existing = dbMock.studentPeerConversationsData[idx];
                        dbMock.studentPeerConversationsData[idx] = {
                            ...existing,
                            ...data,
                            unreadByStudentId: {
                                ...(existing.unreadByStudentId || {}),
                                ...(data.unreadByStudentId || {})
                            }
                        };
                    }
                    eventEmitter.emit('peer-message-update', { conversationId: convoId });
                }
            });
        }, (err: any) => handleSyncError('Firestore peer conversations sync:', err));

        // 5. Tutoring Requests sync
        if (currentAuth) {
            const tutoringRef = collection(db, 'firestore_tutoring_requests');
            const tutoringQuery = isStudentRole 
                ? query(tutoringRef, where('studentId', '==', currentAuth.uid)) 
                : tutoringRef;
            
            // Only admins or approved teachers (or the student himself) should ideally sync.
            // The Firestore Rules will ultimately enforce this, but we filter here to avoid noise/errors.
            if (currentUserObj?.role === 'admin' || isStudentRole || (currentUserObj?.role === 'teacher' && (currentUserObj as any).isApprovedForTutoring)) {
                onSnapshot(tutoringQuery, (snapshot: any) => {
                    snapshot.docChanges().forEach((change: any) => {
                        const data = change.doc.data() || {};
                        const reqId = data.id || change.doc.id;
                        if (dbMock.deletedTutoringRequestIds.has(reqId)) return;
                        const idx = dbMock.tutoringRequestsData.findIndex(r => r.id === reqId);
                        if (change.type === 'added' && idx === -1) {
                            dbMock.tutoringRequestsData.unshift({
                                id: reqId,
                                ...data
                            } as any);
                            eventEmitter.emit('tutoring-requests-updated', reqId);
                        } else if (change.type === 'modified' && idx > -1) {
                            dbMock.tutoringRequestsData[idx] = { ...dbMock.tutoringRequestsData[idx], ...data } as any;
                            eventEmitter.emit('tutoring-requests-updated', reqId);
                        } else if (change.type === 'removed' && idx > -1) {
                            dbMock.tutoringRequestsData.splice(idx, 1);
                            eventEmitter.emit('tutoring-requests-updated', reqId);
                        }
                    });
                }, (err: any) => handleSyncError('Firestore tutoring sync:', err));
            }
        }

        // 5b. Student Course Progress sync
        if (currentUserObj?.role === 'admin') {
            const progressRef = collection(db, 'student_course_progress');
            onSnapshot(progressRef, (snapshot: any) => {
                snapshot.docChanges().forEach((change: any) => {
                    const data = change.doc.data() || {};
                    eventEmitter.emit('student-progress-updated', data);
                });
            }, (err: any) => handleSyncError('Firestore student progress sync:', err));
        }

        // 6. Agenda Events sync (firestore_agenda_events)
        if (currentUserObj?.role === 'admin') {
            const agendaRef = collection(db, 'firestore_agenda_events');
            onSnapshot(agendaRef, (snapshot: any) => {
            snapshot.docChanges().forEach((change: any) => {
                const data = change.doc.data() || {};
                const eventId = data.id || change.doc.id;
                if (dbMock.deletedAgendaIds.has(eventId)) return;
                const idx = (dbMock.agendaData || []).findIndex(e => e.id === eventId);
                if (change.type === 'added' || change.type === 'modified') {
                    const eventObj = {
                        ...data,
                        id: eventId,
                        time: data.time || '10:00',
                        type: data.type || 'exam'
                    };
                    if (idx === -1) {
                        dbMock.agendaData.push(eventObj as any);
                    } else {
                        dbMock.agendaData[idx] = eventObj as any;
                    }
                    eventEmitter.emit('agenda-updated', eventId);
                } else if (change.type === 'removed') {
                    if (idx > -1) {
                        dbMock.agendaData.splice(idx, 1);
                    }
                    eventEmitter.emit('agenda-updated', eventId);
                }
            });
        }, (err: any) => handleSyncError('Firestore agenda sync:', err));
        }

        // 7. Comments sync (firestore_comments)
        if (currentUserObj?.role === 'admin') {
            const commentsRef = collection(db, 'firestore_comments');
            onSnapshot(commentsRef, (snapshot: any) => {
            snapshot.docChanges().forEach((change: any) => {
                const data = change.doc.data() || {};
                const commentId = data.id || change.doc.id;
                if (dbMock.deletedCommentIds.has(commentId)) return;
                const idx = (dbMock.commentsData || []).findIndex(c => c.id === commentId);
                if (change.type === 'added' || change.type === 'modified') {
                    const commentObj = {
                        id: commentId,
                        videoId: data.videoId,
                        author: data.author,
                        text: data.text,
                        timestamp: data.timestamp || new Date().toISOString(),
                        replies: data.replies || [],
                        isRead: data.isRead === true
                    };
                    if (idx === -1) {
                        dbMock.commentsData.push(commentObj);
                    } else {
                        dbMock.commentsData[idx] = commentObj;
                    }
                    eventEmitter.emit('comment-update', commentObj);
                } else if (change.type === 'removed') {
                    if (idx > -1) {
                        const [deleted] = dbMock.commentsData.splice(idx, 1);
                        eventEmitter.emit('comment-deleted', deleted);
                    }
                }
            });
        }, (err: any) => handleSyncError('Firestore comments sync:', err));
        }

        // 8. Topic Requests sync (firestore_topic_requests)
        if (currentAuth) {
            const topicRequestsRef = collection(db, 'firestore_topic_requests');
            let topicRequestsQuery: any = null;

            if (isEmailVerified && (currentUserObj?.role === 'admin' || (currentUserObj?.role === 'teacher' && (currentUserObj as any).isApprovedForTutoring))) {
                topicRequestsQuery = topicRequestsRef;
            } else if (isStudentRole) {
                topicRequestsQuery = query(topicRequestsRef, where('studentId', '==', currentAuth.uid));
            }

            if (topicRequestsQuery) {
                onSnapshot(topicRequestsQuery, (snapshot: any) => {
                    snapshot.docChanges().forEach((change: any) => {
                        const data = change.doc.data() || {};
                        const reqId = data.id || change.doc.id;
                        if (dbMock.deletedTopicRequestIds.has(reqId)) return;
                        const idx = (dbMock.topicRequestsData || []).findIndex(r => r.id === reqId);
                        if (change.type === 'added' || change.type === 'modified') {
                            const reqObj = {
                                id: reqId,
                                studentId: data.studentId,
                                studentName: data.studentName,
                                courseName: data.courseName,
                                topic: data.topic,
                                description: data.description,
                                status: data.status || 'pending',
                                timestamp: data.timestamp || new Date().toISOString(),
                                seenByAdmin: data.seenByAdmin,
                                seenByTeacher: data.seenByTeacher
                            };
                            if (idx === -1) {
                                dbMock.topicRequestsData.push(reqObj as any);
                            } else {
                                dbMock.topicRequestsData[idx] = reqObj as any;
                            }
                            eventEmitter.emit('request-update', reqObj);
                        } else if (change.type === 'removed') {
                            if (idx > -1) {
                                const [deleted] = dbMock.topicRequestsData.splice(idx, 1);
                                eventEmitter.emit('request-deleted', deleted);
                            }
                        }
                    });
                }, (err: any) => handleSyncError('Firestore topic requests sync:', err));
            }
        }

        // 9. Student Answers sync (quiz_answers)
        let answersQuery: any = null;
        if (isStudentRole && currentAuth) {
            answersQuery = query(collection(db, 'quiz_answers'), where('studentId', '==', currentAuth.uid));
        } else if (currentUserObj?.role === 'admin' || isTeacherRole) {
            answersQuery = collection(db, 'quiz_answers');
        }
        if (answersQuery) {
            onSnapshot(answersQuery, (snapshot: any) => {
            snapshot.docChanges().forEach((change: any) => {
                const data = change.doc.data() || {};
                const ansId = data.id || change.doc.id;
                const idx = (dbMock.studentAnswersData || []).findIndex(a => (a as any).id === ansId || (a.studentId === data.studentId && a.videoId === data.videoId && a.timestamp === data.timestamp));
                if (change.type === 'added' || change.type === 'modified') {
                    const ansObj = {
                        id: ansId,
                        studentId: data.studentId,
                        videoId: data.videoId,
                        score: data.score,
                        totalQuestions: data.totalQuestions,
                        answers: data.answers || {},
                        timestamp: data.timestamp || new Date().toISOString()
                    };
                    if (idx === -1) {
                        dbMock.studentAnswersData.push(ansObj as any);
                    } else {
                        dbMock.studentAnswersData[idx] = ansObj as any;
                    }
                    eventEmitter.emit('student-answers-updated', ansObj);
                }
            });
        }, (err: any) => handleSyncError('Firestore student answers sync:', err));
        }

        // 10. Infinity Transactions sync (infinity_transactions)
        if (currentUserObj?.role === 'admin') {
            const txRef = collection(db, 'infinity_transactions');
            onSnapshot(txRef, (snapshot: any) => {
            snapshot.docChanges().forEach((change: any) => {
                const data = change.doc.data() || {};
                const txId = data.id || change.doc.id;
                const idx = (dbMock.infinityTransactionsData || []).findIndex(t => t.id === txId);
                if (change.type === 'added' || change.type === 'modified') {
                    const txObj = {
                        id: txId,
                        studentId: data.studentId,
                        amount: data.amount,
                        type: data.type,
                        description: data.description,
                        timestamp: data.timestamp || new Date().toISOString()
                    };
                    if (idx === -1) {
                        dbMock.infinityTransactionsData.push(txObj);
                    } else {
                        dbMock.infinityTransactionsData[idx] = txObj;
                    }
                    eventEmitter.emit('infinity-transactions-updated', txObj);
                }
            });
        }, (err: any) => handleSyncError('Firestore infinity transactions sync:', err));
        }

        // 11. Courses sync (courses collection)
        let isFirstCoursesSnapshot = true;
        const coursesRef = collection(db, 'courses');
        onSnapshot(coursesRef, (snapshot: any) => {
            let hasChanges = false;
            const isFirst = isFirstCoursesSnapshot;
            if (isFirstCoursesSnapshot) {
                if (dbMock.coursesData) {
                    dbMock.coursesData.length = 0; // Clear mock data
                }
                isFirstCoursesSnapshot = false;
                hasChanges = true;
            }
            snapshot.docChanges().forEach((change: any) => {
                hasChanges = true;
                const data = change.doc.data() || {};
                const courseId = data.id || change.doc.id;
                const idx = (dbMock.coursesData || []).findIndex(c => c.id === courseId);
                if (change.type === 'added' || change.type === 'modified') {
                    const existing = idx > -1 ? dbMock.coursesData[idx] : {};
                    const courseObj = {
                        ...existing,
                        ...data,
                        id: courseId,
                        name: data.name || data.title || (existing as any).name || (existing as any).title || 'Curso',
                        title: data.title || data.name || (existing as any).title || (existing as any).name || 'Curso',
                        description: data.description || (existing as any).description || '',
                        icon: data.icon || (existing as any).icon || 'BookOpenIcon',
                        color: data.color || (existing as any).color || 'from-blue-500 to-cyan-500',
                        subjects: data.subjects || (existing as any).subjects || [],
                        blocks: data.blocks || (existing as any).blocks || [],
                        videos: data.videos || (existing as any).videos || [],
                        createdAt: data.createdAt || (existing as any).createdAt || new Date().toISOString()
                    };
                    if (idx === -1) {
                        dbMock.coursesData.push(courseObj as any);
                    } else {
                        dbMock.coursesData[idx] = courseObj as any;
                    }
                } else if (change.type === 'removed') {
                    if (idx > -1) {
                        dbMock.coursesData.splice(idx, 1);
                    }
                }
            });
            if (hasChanges && !isFirst) {
                eventEmitter.emit('courses-updated', dbMock.coursesData);
            }
        }, (err: any) => handleSyncError('Firestore courses sync:', err));

        // 12. Users sync (users & firestore_users collection)
        const handleUserChange = (change: any) => {
            const data = change.doc.data() || {};
            const userId = data.id || data.uid || change.doc.id;
            if (change.type === 'added' || change.type === 'modified') {
                if ((dbMock as any).restoreUserFromDeleted) {
                    (dbMock as any).restoreUserFromDeleted(userId, data.email);
                }
                const roleLower = (data.role || '').toLowerCase();
                const matchFn = (u: any) => u && (u.id === userId || u.uid === userId || u.firebaseUid === userId || (u.email && data.email && u.email.toLowerCase() === data.email.toLowerCase()));

                if (roleLower === 'teacher') {
                    const normalizedData = dbMock.normalizeAnyUser({ id: userId, role: 'teacher', ...data } as any) || ({ id: userId, role: 'teacher', ...data } as any);
                    const idx = (dbMock.teachersData || []).findIndex(matchFn);
                    if (idx === -1) {
                        dbMock.teachersData.push(normalizedData);
                    } else {
                        dbMock.teachersData[idx] = dbMock.normalizeAnyUser({ ...dbMock.teachersData[idx], ...normalizedData } as any) || normalizedData;
                    }
                    if (dbMock.studentsData) {
                        let sIdx;
                        while ((sIdx = dbMock.studentsData.findIndex(matchFn)) !== -1) dbMock.studentsData.splice(sIdx, 1);
                    }
                    if (dbMock.adminsData) {
                        let aIdx;
                        while ((aIdx = dbMock.adminsData.findIndex(matchFn)) !== -1) dbMock.adminsData.splice(aIdx, 1);
                    }
                    eventEmitter.emit('user-updated', userId);
                    eventEmitter.emit('user-update', normalizedData);
                } else if (roleLower === 'admin') {
                    const normalizedData = dbMock.normalizeAnyUser({ id: userId, role: 'admin', ...data } as any) || ({ id: userId, role: 'admin', ...data } as any);
                    const idx = (dbMock.adminsData || []).findIndex(matchFn);
                    if (idx === -1) {
                        dbMock.adminsData.push(normalizedData);
                    } else {
                        dbMock.adminsData[idx] = dbMock.normalizeAnyUser({ ...dbMock.adminsData[idx], ...normalizedData } as any) || normalizedData;
                    }
                    if (dbMock.studentsData) {
                        let sIdx;
                        while ((sIdx = dbMock.studentsData.findIndex(matchFn)) !== -1) dbMock.studentsData.splice(sIdx, 1);
                    }
                    if (dbMock.teachersData) {
                        let tIdx;
                        while ((tIdx = dbMock.teachersData.findIndex(matchFn)) !== -1) dbMock.teachersData.splice(tIdx, 1);
                    }
                    eventEmitter.emit('user-updated', userId);
                    eventEmitter.emit('user-update', normalizedData);
                } else {
                    const normalizedData = dbMock.normalizeAnyUser({ id: userId, role: 'student', ...data } as any) || ({ id: userId, role: 'student', ...data } as any);
                    const idx = (dbMock.studentsData || []).findIndex(matchFn);
                    if (idx === -1) {
                        dbMock.studentsData.push(normalizedData);
                    } else {
                        dbMock.studentsData[idx] = dbMock.normalizeAnyUser({ ...dbMock.studentsData[idx], ...normalizedData } as any) || normalizedData;
                    }
                    if (dbMock.teachersData) {
                        let tIdx;
                        while ((tIdx = dbMock.teachersData.findIndex(matchFn)) !== -1) dbMock.teachersData.splice(tIdx, 1);
                    }
                    if (dbMock.adminsData) {
                        let aIdx;
                        while ((aIdx = dbMock.adminsData.findIndex(matchFn)) !== -1) dbMock.adminsData.splice(aIdx, 1);
                    }
                    eventEmitter.emit('user-updated', userId);
                    eventEmitter.emit('user-update', normalizedData);
                }
                eventEmitter.emit('message-update', { id: userId, ...data });
            } else if (change.type === 'removed') {
                dbMock.dbPurgeUserFromMemory(userId);
                if (data.email) dbMock.dbPurgeUserFromMemory(data.email);
                eventEmitter.emit('user-deleted', userId);
            }
        };

        // Target single currentUser document instead of full collection read
        const currentUserDocRef = doc(db, 'firestore_users', currentUser.uid);
        onSnapshot(currentUserDocRef, (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data() || {};
                const userId = data.id || data.uid || docSnap.id;
                const normalizedData = dbMock.normalizeAnyUser({ id: userId, ...data } as any) || ({ id: userId, ...data } as any);
                eventEmitter.emit('user-updated', userId);
                eventEmitter.emit('user-update', normalizedData);
            }
        }, (err: any) => handleSyncError('Firestore user doc sync:', err));

        // 12b. Students sync (students collection)
        let isFirstStudentsSnapshot = true;
        const studentsRef = collection(db, 'students');
        onSnapshot(studentsRef, (snapshot: any) => {
            const isFirst = isFirstStudentsSnapshot;
            isFirstStudentsSnapshot = false;
            snapshot.docChanges().forEach((change: any) => {
                const data = change.doc.data() || {};
                const userId = data.id || data.uid || change.doc.id;
                if (change.type === 'added' || change.type === 'modified') {
                    if ((dbMock as any).restoreUserFromDeleted) {
                        (dbMock as any).restoreUserFromDeleted(userId, data.email);
                    }
                    const normalizedData = dbMock.normalizeAnyUser({ id: userId, role: 'student', ...data } as any) || ({ id: userId, role: 'student', ...data } as any);
                    const idx = (dbMock.studentsData || []).findIndex(s => s.id === userId || (s as any).uid === userId || (s as any).firebaseUid === userId || (s.email && data.email && s.email.toLowerCase() === data.email.toLowerCase()));
                    if (idx === -1) {
                        dbMock.studentsData.push(normalizedData);
                    } else {
                        dbMock.studentsData[idx] = dbMock.normalizeAnyUser({ ...dbMock.studentsData[idx], ...normalizedData } as any) || normalizedData;
                    }
                    eventEmitter.emit('user-updated', userId);
                    if (!isFirst) {
                        eventEmitter.emit('user-update', normalizedData);
                    }
                } else if (change.type === 'removed') {
                    dbMock.dbPurgeUserFromMemory(userId);
                    if (data.email) dbMock.dbPurgeUserFromMemory(data.email);
                    eventEmitter.emit('user-deleted', userId);
                }
            });
        }, (err: any) => handleSyncError('Firestore students collection sync:', err));

        // 12c. Teachers sync (teachers collection)
        let isFirstTeachersSnapshot = true;
        const teachersRef = collection(db, 'teachers');
        onSnapshot(teachersRef, (snapshot: any) => {
            const isFirst = isFirstTeachersSnapshot;
            isFirstTeachersSnapshot = false;
            snapshot.docChanges().forEach((change: any) => {
                const data = change.doc.data() || {};
                const userId = data.id || data.uid || change.doc.id;
                if (change.type === 'added' || change.type === 'modified') {
                    if ((dbMock as any).restoreUserFromDeleted) {
                        (dbMock as any).restoreUserFromDeleted(userId, data.email);
                    }
                    const normalizedData = dbMock.normalizeAnyUser({ id: userId, role: 'teacher', ...data } as any) || ({ id: userId, role: 'teacher', ...data } as any);
                    const idx = (dbMock.teachersData || []).findIndex(t => t.id === userId || (t as any).uid === userId || (t as any).firebaseUid === userId || (t.email && data.email && t.email.toLowerCase() === data.email.toLowerCase()));
                    if (idx === -1) {
                        dbMock.teachersData.push(normalizedData);
                    } else {
                        dbMock.teachersData[idx] = dbMock.normalizeAnyUser({ ...dbMock.teachersData[idx], ...normalizedData } as any) || normalizedData;
                    }
                    eventEmitter.emit('user-updated', userId);
                    if (!isFirst) {
                        eventEmitter.emit('user-update', normalizedData);
                    }
                } else if (change.type === 'removed') {
                    dbMock.dbPurgeUserFromMemory(userId);
                    if (data.email) dbMock.dbPurgeUserFromMemory(data.email);
                    eventEmitter.emit('user-deleted', userId);
                }
            });
        }, (err: any) => handleSyncError('Firestore teachers collection sync:', err));

        // 12d. Admins sync (admins collection)
        let isFirstAdminsSnapshot = true;
        if (currentUserObj?.role === 'admin') {
            const adminsRef = collection(db, 'admins');
            onSnapshot(adminsRef, (snapshot: any) => {
                const isFirst = isFirstAdminsSnapshot;
                isFirstAdminsSnapshot = false;
                snapshot.docChanges().forEach((change: any) => {
                    const data = change.doc.data() || {};
                    const userId = data.id || data.uid || change.doc.id;
                    if (change.type === 'added' || change.type === 'modified') {
                        if ((dbMock as any).restoreUserFromDeleted) {
                            (dbMock as any).restoreUserFromDeleted(userId, data.email);
                        }
                        const normalizedData = dbMock.normalizeAnyUser({ id: userId, role: 'admin', ...data } as any) || ({ id: userId, role: 'admin', ...data } as any);
                        const idx = (dbMock.adminsData || []).findIndex(a => a.id === userId || (a as any).uid === userId || (a as any).firebaseUid === userId || (a.email && data.email && a.email.toLowerCase() === data.email.toLowerCase()));
                        if (idx === -1) {
                            dbMock.adminsData.push(normalizedData);
                        } else {
                            dbMock.adminsData[idx] = dbMock.normalizeAnyUser({ ...dbMock.adminsData[idx], ...normalizedData } as any) || normalizedData;
                        }
                        eventEmitter.emit('user-updated', userId);
                        if (!isFirst) {
                            eventEmitter.emit('user-update', normalizedData);
                        }
                    } else if (change.type === 'removed') {
                        dbMock.dbPurgeUserFromMemory(userId);
                        if (data.email) dbMock.dbPurgeUserFromMemory(data.email);
                        eventEmitter.emit('user-deleted', userId);
                    }
                });
            }, (err: any) => handleSyncError('Firestore admins collection sync:', err));
        }

        // 13. Student Payments sync
        let studentPaymentsQuery: any = null;
        if (currentUserObj?.role === 'admin') {
            studentPaymentsQuery = collection(db, 'student_payments');
        }
        if (studentPaymentsQuery) {
            onSnapshot(studentPaymentsQuery, (snapshot: any) => {
            snapshot.docChanges().forEach((change: any) => {
                const data = change.doc.data() || {};
                const payId = data.id || change.doc.id;
                const idx = (dbMock.studentPaymentsData || []).findIndex(p => p.id === payId);
                if (change.type === 'added' || change.type === 'modified') {
                    if (idx === -1) dbMock.studentPaymentsData.push({ id: payId, ...data } as any);
                    else dbMock.studentPaymentsData[idx] = { ...dbMock.studentPaymentsData[idx], ...data } as any;
                    eventEmitter.emit('student-payments-updated');
                } else if (change.type === 'removed' && idx > -1) {
                    dbMock.studentPaymentsData.splice(idx, 1);
                    eventEmitter.emit('student-payments-updated');
                }
            });
        }, (err: any) => handleSyncError('Firestore student payments sync:', err));
        }

        // 14. Student Expenses sync
        let studentExpensesQuery: any = null;
        if (currentUserObj?.role === 'admin') {
            studentExpensesQuery = collection(db, 'student_expenses');
        }
        if (studentExpensesQuery) {
            onSnapshot(studentExpensesQuery, (snapshot: any) => {
            snapshot.docChanges().forEach((change: any) => {
                const data = change.doc.data() || {};
                const expId = data.id || change.doc.id;
                const idx = (dbMock.studentExpensesData || []).findIndex(e => e.id === expId);
                if (change.type === 'added' || change.type === 'modified') {
                    if (idx === -1) dbMock.studentExpensesData.push({ id: expId, ...data } as any);
                    else dbMock.studentExpensesData[idx] = { ...dbMock.studentExpensesData[idx], ...data } as any;
                    eventEmitter.emit('student-expenses-updated');
                } else if (change.type === 'removed' && idx > -1) {
                    dbMock.studentExpensesData.splice(idx, 1);
                    eventEmitter.emit('student-expenses-updated');
                }
            });
        }, (err: any) => handleSyncError('Firestore student expenses sync:', err));
        }

        // 15. Teacher Payments sync
        let teacherPaymentsQuery: any = null;
        if (isTeacherRole && currentAuth) {
            teacherPaymentsQuery = query(collection(db, 'teacher_payments'), where('teacherId', '==', currentAuth.uid));
        } else if (currentUserObj?.role === 'admin') {
            teacherPaymentsQuery = collection(db, 'teacher_payments');
        }
        if (teacherPaymentsQuery) {
            onSnapshot(teacherPaymentsQuery, (snapshot: any) => {
            snapshot.docChanges().forEach((change: any) => {
                const data = change.doc.data() || {};
                const payId = data.id || change.doc.id;
                const idx = (dbMock.teacherPaymentsData || []).findIndex(p => p.id === payId);
                if (change.type === 'added' || change.type === 'modified') {
                    if (idx === -1) dbMock.teacherPaymentsData.push({ id: payId, ...data } as any);
                    else dbMock.teacherPaymentsData[idx] = { ...dbMock.teacherPaymentsData[idx], ...data } as any;
                    eventEmitter.emit('teacher-payments-updated');
                } else if (change.type === 'removed' && idx > -1) {
                    dbMock.teacherPaymentsData.splice(idx, 1);
                    eventEmitter.emit('teacher-payments-updated');
                }
            });
        }, (err: any) => handleSyncError('Firestore teacher payments sync:', err));
        }

        // 16. Quizzes sync
        if (currentUserObj?.role === 'admin') {
            const quizzesRef = collection(db, 'firestore_quizzes');
            onSnapshot(quizzesRef, (snapshot: any) => {
            snapshot.docChanges().forEach((change: any) => {
                const data = change.doc.data() || {};
                const quizId = data.id || change.doc.id;
                const idx = (dbMock.quizzesData || []).findIndex(q => q.id === quizId || q.videoId === data.videoId);
                if (change.type === 'added' || change.type === 'modified') {
                    if (idx === -1) dbMock.quizzesData.push({ id: quizId, ...data } as any);
                    else dbMock.quizzesData[idx] = { ...dbMock.quizzesData[idx], ...data } as any;
                    eventEmitter.emit('quizzes-updated');
                } else if (change.type === 'removed' && idx > -1) {
                    dbMock.quizzesData.splice(idx, 1);
                    eventEmitter.emit('quizzes-updated');
                }
            });
        }, (err: any) => handleSyncError('Firestore quizzes sync:', err));
        }

        // 17. App Config sync
        const appConfigRef = doc(db, 'app_config', 'main');
        onSnapshot(appConfigRef, (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                Object.assign(dbMock.appConfigData, data);
                eventEmitter.emit('app-config-updated', dbMock.appConfigData);
            } else if (dbMock.appConfigData) {
                syncAppConfigToFirestore(dbMock.appConfigData);
            }
        }, (err: any) => handleSyncError('Firestore app config sync:', err));

        // 18. Student Friends sync
        if (currentUserObj?.role === 'admin') {
            const friendsRef = collection(db, 'student_friends');
            const friendsQuery = isStudentRole && currentAuth
                ? query(friendsRef, where('studentId', '==', currentAuth.uid))
                : friendsRef;
            onSnapshot(friendsQuery, (snapshot: any) => {
            snapshot.docChanges().forEach((change: any) => {
                const data = change.doc.data() || {};
                if (!data.studentId || !data.friendId) return;
                const idx = (dbMock.studentFriendsData || []).findIndex(f => f.studentId === data.studentId && f.friendId === data.friendId);
                if (change.type === 'added' || change.type === 'modified') {
                    if (idx === -1) dbMock.studentFriendsData.push({ studentId: data.studentId, friendId: data.friendId });
                    eventEmitter.emit('student-friends-updated');
                } else if (change.type === 'removed' && idx > -1) {
                    dbMock.studentFriendsData.splice(idx, 1);
                    eventEmitter.emit('student-friends-updated');
                }
            });
        }, (err: any) => handleSyncError('Firestore student friends sync:', err));
        }

        // 19. AI Query Logs sync
        if (currentUserObj?.role === 'admin') {
            const aiLogsRef = collection(db, 'ai_query_logs');
            const aiLogsQuery = currentAuth && (!currentUserObj || currentUserObj.role !== 'admin')
                ? query(aiLogsRef, where('userId', '==', currentAuth.uid))
                : aiLogsRef;
            onSnapshot(aiLogsQuery, (snapshot: any) => {
            snapshot.docChanges().forEach((change: any) => {
                const data = change.doc.data() || {};
                const logId = data.id || change.doc.id;
                const idx = (dbMock.aiQueryLogsData || []).findIndex(l => l.id === logId);
                if (change.type === 'added' || change.type === 'modified') {
                    if (idx === -1) dbMock.aiQueryLogsData.push({ id: logId, ...data } as any);
                    else dbMock.aiQueryLogsData[idx] = { ...dbMock.aiQueryLogsData[idx], ...data } as any;
                    eventEmitter.emit('ai-logs-updated');
                } else if (change.type === 'removed' && idx > -1) {
                    dbMock.aiQueryLogsData.splice(idx, 1);
                    eventEmitter.emit('ai-logs-updated');
                }
            });
        }, (err: any) => handleSyncError('Firestore ai logs sync:', err));
        }

        // 20. User Seen States sync
        if (currentAuth?.uid && currentAuth.emailVerified) {
            const userSeenStatesRef = doc(db, 'firestore_user_seen_states', currentAuth.uid);
            onSnapshot(userSeenStatesRef, (docSnap) => {
                if (docSnap.exists()) {
                    const data = docSnap.data();
                    Object.assign(dbMock.userSeenStates, data);
                    eventEmitter.emit('user-seen-states-updated', dbMock.userSeenStates);
                }
            }, (err: any) => {
                if (err?.code !== 'permission-denied') {
                    handleSyncError('Firestore user seen states sync:', err);
                }
            });
        }

    } catch (error) {
        console.error('Error initializing Firestore Sync:', error);
    }
};

// Sync outgoing message send functions
export const syncSendPeerMessageToFirestore = async (msg: StudentPeerMessage) => {
    try {
        if (!msg) return;
        await addDoc(collection(db, 'firestore_peer_messages'), {
            ...msg,
            createdAt: serverTimestamp()
        });

        // Also sync peer conversation document and unread status
        if (msg.conversationId) {
            const parts = msg.conversationId.replace('peer_', '').split('_');
            const unreadByMap: Record<string, boolean> = {};
            parts.forEach(pId => {
                unreadByMap[pId] = pId !== msg.senderId;
            });
            await safeSetDoc(doc(db, 'firestore_peer_conversations', msg.conversationId), {
                id: msg.conversationId,
                participantIds: parts,
                lastMessageText: msg.text,
                lastMessageTimestamp: msg.timestamp || new Date().toISOString(),
                unreadByStudentId: unreadByMap,
                updatedAt: serverTimestamp()
            }, { merge: true });
        }
    } catch (e) {
        console.warn('Failed to push peer message to Firestore:', e);
    }
};

export const syncRemoveClosedSupportConversationInFirestore = async (conversationId: string, studentId?: string) => {
    try {
        const cleanConvoId = (conversationId || '').replace(/^direct_/, '');
        const cleanStudentId = (studentId || '').replace(/^direct_/, '') || cleanConvoId.split('_')[0];
        const targetIds = Array.from(new Set([
            conversationId,
            studentId,
            cleanConvoId,
            cleanStudentId,
            `direct_${cleanConvoId}`,
            `direct_${cleanStudentId}`
        ].filter(Boolean)));
        await Promise.all(targetIds.map(id => deleteDoc(doc(db, 'firestore_closed_conversations', id as string)).catch(() => {})));
    } catch (e) {
        console.warn('Failed to remove closed support conversation in Firestore:', e);
    }
};

export const syncSendDirectMessageToFirestore = async (msg: DirectMessage) => {
    try {
        if (!msg) return;
        await addDoc(collection(db, 'firestore_direct_messages'), {
            ...msg,
            createdAt: serverTimestamp()
        });

        // Reopen closed conversation if a new message is sent
        await syncRemoveClosedSupportConversationInFirestore(msg.conversationId, msg.senderId);

        // Also sync direct conversation document and unread status
        if (msg.conversationId) {
            const isStudent = msg.senderRole === 'student';
            const { studentId, teacherId: idTeacherId } = api.parseConversationParticipants(msg.conversationId);
            const isTeacherConvo = !!idTeacherId;
            
            const conversationUpdate: any = {
                id: msg.conversationId,
                studentId: studentId || (isStudent ? msg.senderId : undefined),
                lastMessageText: msg.text,
                lastMessageTimestamp: msg.timestamp || new Date().toISOString(),
                unreadByAdmin: isStudent && !isTeacherConvo,
                unreadByTeacher: isStudent, // Mark as unread for Teacher if one is assigned (preserved by merge)
                unreadByStudent: !isStudent,
                updatedAt: serverTimestamp()
            };

            // Only overwrite teacherId if it's explicitly part of the direct chat ID format (e.g. student_teacher)
            if (isTeacherConvo) {
                conversationUpdate.teacherId = idTeacherId;
            }

            await safeSetDoc(doc(db, 'firestore_conversations', msg.conversationId), conversationUpdate, { merge: true });
        }
    } catch (e) {
        console.warn('Failed to push direct message to Firestore:', e);
    }
};

export const syncMarkConversationAsReadInFirestore = async (conversationId: string, role?: string) => {
    try {
        if (!conversationId) return;
        const updateData: Record<string, any> = { updatedAt: serverTimestamp() };
        if (role === 'teacher') {
            updateData.unreadByTeacher = false;
        } else if (role === 'student') {
            updateData.unreadByStudent = false;
        } else {
            updateData.unreadByAdmin = false;
        }
        await safeSetDoc(doc(db, 'firestore_conversations', conversationId), updateData, { merge: true });
    } catch (e) {
        console.warn('Failed to mark conversation as read in Firestore:', e);
    }
};

export const syncConversationTeacherInFirestore = async (studentIdOrConvoId: string, teacherId: string | null, teacherName?: string | null) => {
    try {
        if (!studentIdOrConvoId) return;
        const cleanId = studentIdOrConvoId.replace(/^direct_/, '');
        const payload = {
            teacherId: teacherId || null,
            teacherName: teacherName || null,
            updatedAt: serverTimestamp()
        };
        await Promise.all([
            safeSetDoc(doc(db, 'firestore_conversations', cleanId), payload, { merge: true }),
            safeSetDoc(doc(db, 'firestore_conversations', `direct_${cleanId}`), payload, { merge: true })
        ]);
    } catch (e) {
        console.warn('Failed to sync conversation teacher in Firestore:', e);
    }
};

export const syncCloseSupportConversationInFirestore = async (conversationId: string, studentId: string, closedBy: string = 'teacher') => {
    try {
        const cleanConvoId = (conversationId || '').replace(/^direct_/, '');
        const cleanStudentId = (studentId || '').replace(/^direct_/, '') || cleanConvoId.split('_')[0];

        const targetIds = Array.from(new Set([
            conversationId,
            studentId,
            cleanConvoId,
            cleanStudentId,
            `direct_${cleanConvoId}`,
            `direct_${cleanStudentId}`
        ].filter(Boolean)));

        // 1. Delete conversations documents in Firestore
        const convoDeletePromises: Promise<void>[] = targetIds.map(id => 
            deleteDoc(doc(db, 'firestore_conversations', id)).catch(() => {})
        );

        const convosRef = collection(db, 'firestore_conversations');
        if (cleanStudentId) {
            const qConvos = query(convosRef, where('studentId', '==', cleanStudentId));
            const convosSnap = await getDocs(qConvos).catch(() => null);
            if (convosSnap) {
                convosSnap.forEach(d => {
                    convoDeletePromises.push(deleteDoc(doc(db, 'firestore_conversations', d.id)).catch(() => {}));
                });
            }
        }
        await Promise.all(convoDeletePromises);

        // 2. Delete direct messages documents from Firestore
        const msgsRef = collection(db, 'firestore_direct_messages');
        const msgDeletePromises: Promise<void>[] = [];

        for (const tid of targetIds) {
            const q = query(msgsRef, where('conversationId', '==', tid));
            const snap = await getDocs(q).catch(() => null);
            if (snap) {
                snap.forEach(d => {
                    msgDeletePromises.push(deleteDoc(doc(db, 'firestore_direct_messages', d.id)).catch(() => {}));
                });
            }
        }

        if (cleanStudentId) {
            const qSender = query(msgsRef, where('senderId', '==', cleanStudentId));
            const snapSender = await getDocs(qSender).catch(() => null);
            if (snapSender) {
                snapSender.forEach(d => {
                    msgDeletePromises.push(deleteDoc(doc(db, 'firestore_direct_messages', d.id)).catch(() => {}));
                });
            }
        }

        await Promise.all(msgDeletePromises);

        // 3. Delete tutoring requests from Firestore
        const tutoringRef = collection(db, 'firestore_tutoring_requests');
        const tutoringDeletePromises: Promise<void>[] = targetIds.map(id =>
            deleteDoc(doc(db, 'firestore_tutoring_requests', id)).catch(() => {})
        );
        if (cleanStudentId) {
            const qTutoring = query(tutoringRef, where('studentId', '==', cleanStudentId));
            const snapTutoring = await getDocs(qTutoring).catch(() => null);
            if (snapTutoring) {
                snapTutoring.forEach(d => {
                    tutoringDeletePromises.push(deleteDoc(doc(db, 'firestore_tutoring_requests', d.id)).catch(() => {}));
                });
            }
        }
        await Promise.all(tutoringDeletePromises);

        // 4. Delete documents in chats collection if present
        const chatDeletePromises: Promise<void>[] = targetIds.map(async (id) => {
            try {
                const subMsgsSnap = await getDocs(collection(db, 'chats', id, 'messages')).catch(() => null);
                if (subMsgsSnap) {
                    await Promise.all(subMsgsSnap.docs.map(d => deleteDoc(d.ref).catch(() => {})));
                }
                await deleteDoc(doc(db, 'chats', id)).catch(() => {});
            } catch (err) {}
        });
        await Promise.all(chatDeletePromises);

        // 5. Save closed status in firestore_closed_conversations collection so it persists across sessions
        const closedColRef = collection(db, 'firestore_closed_conversations');
        const closedPromises: Promise<void>[] = targetIds.map(id =>
            safeSetDoc(doc(closedColRef, id), {
                closed: true,
                closedBy,
                closedAt: serverTimestamp()
            }, { merge: true }).catch(() => {})
        );
        
        // 6. Deactivate any active voice call rooms, whiteboard sessions, and WebRTC signaling rooms
        const voicePromises: Promise<void>[] = targetIds.map(id =>
            safeSetDoc(doc(db, 'voice_group_calls', id), {
                active: false,
                participants: [],
                updatedAt: serverTimestamp()
            }, { merge: true }).catch(() => {})
        );
        const whiteboardPromises: Promise<void>[] = targetIds.map(id =>
            safeSetDoc(doc(db, 'whiteboards', id), {
                active: false,
                updatedAt: serverTimestamp()
            }, { merge: true }).catch(() => {})
        );
        const signalingPromises: Promise<void>[] = targetIds.map(id =>
            safeSetDoc(doc(db, 'rooms', `room_${id}`), {
                status: 'ended',
                endedAt: serverTimestamp()
            }, { merge: true }).catch(() => {})
        );

        await Promise.all([...closedPromises, ...voicePromises, ...whiteboardPromises, ...signalingPromises]);
    } catch (e) {
        console.warn('Failed to close support conversation in Firestore:', e);
    }
};

export const syncMarkPeerConversationAsReadInFirestore = async (conversationId: string, studentId: string) => {
    try {
        if (!conversationId || !studentId) return;
        await safeSetDoc(doc(db, 'firestore_peer_conversations', conversationId), {
            unreadByStudentId: {
                [studentId]: false
            },
            updatedAt: serverTimestamp()
        }, { merge: true });
    } catch (e) {
        console.warn('Failed to mark peer conversation as read in Firestore:', e);
    }
};

export const syncSendTeacherMessageToFirestore = async (msg: any) => {
    try {
        await addDoc(collection(db, 'firestore_teacher_messages'), {
            ...msg,
            createdAt: serverTimestamp()
        });
    } catch (e) {
        console.warn('Failed to push teacher message to Firestore:', e);
    }
};

export const syncSendCourseGroupMessageToFirestore = async (msg: CourseGroupMessage) => {
    try {
        await addDoc(collection(db, 'firestore_course_messages'), {
            ...msg,
            createdAt: serverTimestamp()
        });
    } catch (e) {
        console.warn('Failed to push course group message to Firestore:', e);
    }
};

export const syncSubmitTutoringRequestToFirestore = async (req: any) => {
    try {
        if (!req || !req.id) return;
        const cleanedReq = JSON.parse(JSON.stringify(req, (_key, value) => value === undefined ? null : value));
        await safeSetDoc(doc(db, 'firestore_tutoring_requests', req.id), {
            ...cleanedReq,
            subjectName: req.subject || req.subjectName || '',
            updatedAt: serverTimestamp()
        }, { merge: true });
    } catch (e) {
        console.warn('Failed to push tutoring request to Firestore:', e);
    }
};

// Agenda Events Sync
export const syncAddAgendaEventToFirestore = async (event: any) => {
    try {
        await safeSetDoc(doc(db, 'firestore_agenda_events', event.id), {
            ...event,
            updatedAt: serverTimestamp()
        });
    } catch (e) {
        console.warn('Failed to push agenda event to Firestore:', e);
    }
};

export const syncUpdateAgendaEventToFirestore = async (eventId: string, eventData: any) => {
    try {
        await safeSetDoc(doc(db, 'firestore_agenda_events', eventId), {
            ...eventData,
            updatedAt: serverTimestamp()
        }, { merge: true });
    } catch (e) {
        console.warn('Failed to update agenda event in Firestore:', e);
    }
};

export const syncDeleteAgendaEventFromFirestore = async (eventId: string) => {
    await deleteFromCollectionRobust('firestore_agenda_events', eventId);
    await recordDeletedItemInFirestore(eventId, 'agenda');
};

// Comments Sync
export const syncPostCommentToFirestore = async (comment: any) => {
    try {
        await safeSetDoc(doc(db, 'firestore_comments', comment.id), {
            ...comment,
            updatedAt: serverTimestamp()
        });
    } catch (e) {
        console.warn('Failed to push comment to Firestore:', e);
    }
};

export const syncUpdateCommentInFirestore = async (commentId: string, text: string) => {
    try {
        await safeSetDoc(doc(db, 'firestore_comments', commentId), {
            text,
            updatedAt: serverTimestamp()
        }, { merge: true });
    } catch (e) {
        console.warn('Failed to update comment in Firestore:', e);
    }
};

export const syncMarkCommentAsReadInFirestore = async (commentId: string) => {
    try {
        await safeSetDoc(doc(db, 'firestore_comments', commentId), {
            isRead: true,
            updatedAt: serverTimestamp()
        }, { merge: true });
    } catch (e) {
        console.warn('Failed to mark comment as read in Firestore:', e);
    }
};

export const syncDeleteCommentFromFirestore = async (commentId: string) => {
    await deleteFromCollectionRobust('firestore_comments', commentId);
    await recordDeletedItemInFirestore(commentId, 'comment');
};

// Topic Requests Sync
export const syncSubmitTopicRequestToFirestore = async (req: any) => {
    try {
        await safeSetDoc(doc(db, 'firestore_topic_requests', req.id), {
            ...req,
            updatedAt: serverTimestamp()
        });
    } catch (e) {
        console.warn('Failed to push topic request to Firestore:', e);
    }
};

export const syncUpdateTopicRequestStatusInFirestore = async (requestId: string, status: string) => {
    try {
        await safeSetDoc(doc(db, 'firestore_topic_requests', requestId), {
            status,
            updatedAt: serverTimestamp()
        }, { merge: true });
    } catch (e) {
        console.warn('Failed to update topic request in Firestore:', e);
    }
};

export const syncDeleteTopicRequestFromFirestore = async (requestId: string) => {
    await deleteFromCollectionRobust('firestore_topic_requests', requestId);
    await recordDeletedItemInFirestore(requestId, 'topic_request');
};

// Student Answers Sync
export const syncSubmitStudentAnswerToFirestore = async (answer: any) => {
    try {
        const id = answer.id || `${answer.studentId}_${answer.videoId}_${Date.now()}`;
        await safeSetDoc(doc(db, 'quiz_answers', id), {
            ...answer,
            id,
            updatedAt: serverTimestamp()
        });
    } catch (e) {
        console.warn('Failed to push student answer to Firestore:', e);
    }
};

// Infinity Transactions Sync
export const syncAddInfinityTransactionToFirestore = async (tx: any) => {
    try {
        await safeSetDoc(doc(db, 'infinity_transactions', tx.id), {
            ...tx,
            updatedAt: serverTimestamp()
        });
    } catch (e) {
        console.warn('Failed to push infinity transaction to Firestore:', e);
    }
};

import { initializeAndSyncUserDataInFirestore } from './userService';
export const syncUserToFirestore = initializeAndSyncUserDataInFirestore;

export const syncCoursesToFirestore = async () => {
    try {
        const courses = dbMock.coursesData || [];
        const promises: Promise<any>[] = [];
        for (const c of courses) {
            promises.push(safeSetDoc(doc(db, 'courses', c.id), {
                ...c,
                updatedAt: serverTimestamp()
            }, { merge: true }));

            // Sincronizar también todos los vídeos en la colección 'videos' de Firestore
            for (const s of (c.subjects || [])) {
                const catName = `${c.name} - ${s.name}`;
                const syncVidDoc = async (v: any, blockId?: string, blockName?: string) => {
                    const storageLink = v.youtubeLinks?.find((l: any) => l.videoUrl);
                    const mainVideoUrl = storageLink?.videoUrl || v.videoUrl || '';
                    const mainFileName = storageLink?.videoFileName || v.videoFileName || '';

                    return safeSetDoc(doc(db, 'videos', v.id), {
                        id: v.id,
                        title: v.title || mainFileName || 'Vídeo sin título',
                        category: blockName ? `${catName} (${blockName})` : catName,
                        url: mainVideoUrl,
                        videoUrl: mainVideoUrl,
                        videoFileName: mainFileName,
                        topic: v.topic || s.name || 'General',
                        levelId: c.id,
                        subjectId: s.id,
                        blockId: blockId || '',
                        youtubeLinks: v.youtubeLinks || [],
                        resources: v.resources || [],
                        description: v.description || '',
                        uploadDate: v.createdAt || new Date().toISOString(),
                        createdAt: v.createdAt || new Date().toISOString(),
                        updatedAt: serverTimestamp()
                    }, { merge: true });
                };

                for (const v of (s.videos || [])) {
                    promises.push(syncVidDoc(v));
                }
                for (const b of (s.blocks || [])) {
                    for (const v of (b.videos || [])) {
                        promises.push(syncVidDoc(v, b.id, b.name));
                    }
                }
            }
        }
        await Promise.all(promises);
        console.log('[FirestoreSync] Cursos y colección "videos" sincronizados en Firestore');
    } catch (e) {
        console.warn('Failed to sync courses and videos to Firestore:', e);
    }
};

export const deleteVideoFromFirestore = async (videoId: string) => {
    try {
        await deleteFromCollectionRobust('videos', videoId);
        console.log(`[FirestoreSync] Vídeo ${videoId} eliminado de la colección "videos" en Firestore`);
    } catch (e) {
        console.warn('Error borrando vídeo de Firestore:', e);
    }
};

export const syncTutoringRequestsToFirestore = async () => {
    try {
        const requests = dbMock.tutoringRequestsData || [];
        for (const req of requests) {
            await safeSetDoc(doc(db, 'firestore_tutoring_requests', req.id), {
                ...req,
                createdAt: serverTimestamp()
            }, { merge: true });
        }
        console.log('[FirestoreSync] Tutoring requests sincronizados en Firestore');
    } catch (e) {
        console.warn('Failed to sync tutoring requests to Firestore:', e);
    }
};

export const syncStudentCourseProgressToFirestore = async () => {
    try {
        const students = dbMock.studentsData || [];
        for (const s of students) {
            if (s.enrolledCourseIds) {
                for (const courseId of s.enrolledCourseIds) {
                    const docId = `${s.id}_${courseId}`;
                    await safeSetDoc(doc(db, 'student_course_progress', docId), {
                        studentId: s.id,
                        courseId: courseId,
                        percentage: Math.floor(Math.random() * 60) + 40,
                        completedLessonIds: ['lesson-1', 'lesson-2'],
                        updatedAt: serverTimestamp()
                    }, { merge: true });
                }
            }
        }
        console.log('[FirestoreSync] Progreso de estudiantes sincronizado en Firestore');
    } catch (e) {
        console.warn('Failed to sync student course progress to Firestore:', e);
    }
};

export const syncMessagesToFirestore = async () => {
    try {
        // Sync Peer messages
        const peerMsgs = dbMock.studentPeerMessagesData || [];
        for (const msg of peerMsgs) {
            await safeSetDoc(doc(db, 'firestore_peer_messages', msg.id), {
                ...msg,
                createdAt: serverTimestamp()
            }, { merge: true });
        }

        // Sync Direct messages
        const directMsgs = dbMock.directMessagesData || [];
        for (const msg of directMsgs) {
            await safeSetDoc(doc(db, 'firestore_direct_messages', msg.id), {
                ...msg,
                createdAt: serverTimestamp()
            }, { merge: true });
        }

        // Sync Teacher messages
        const teacherMsgs = dbMock.teacherMessagesData || [];
        for (const msg of teacherMsgs) {
            await safeSetDoc(doc(db, 'firestore_teacher_messages', msg.id), {
                ...msg,
                createdAt: serverTimestamp()
            }, { merge: true });
        }

        // Sync Course Group messages
        const courseMsgs = dbMock.courseGroupMessagesData || [];
        for (const msg of courseMsgs) {
            await safeSetDoc(doc(db, 'firestore_course_messages', msg.id), {
                ...msg,
                createdAt: serverTimestamp()
            }, { merge: true });
        }
        console.log('[FirestoreSync] Todos los canales de mensajes sincronizados en Firestore');
    } catch (e) {
        console.warn('Failed to sync messages to Firestore:', e);
    }
};

export const syncAgendaEventsToFirestore = async () => {
    try {
        const items = dbMock.agendaData || [];
        for (const item of items) {
            await safeSetDoc(doc(db, 'firestore_agenda_events', item.id), {
                ...item,
                updatedAt: serverTimestamp()
            }, { merge: true });
        }
    } catch (e) {
        console.warn('Failed to sync agenda events to Firestore:', e);
    }
};

export const syncCommentsToFirestore = async () => {
    try {
        const items = dbMock.commentsData || [];
        for (const item of items) {
            await safeSetDoc(doc(db, 'firestore_comments', item.id), {
                ...item,
                updatedAt: serverTimestamp()
            }, { merge: true });
        }
    } catch (e) {
        console.warn('Failed to sync comments to Firestore:', e);
    }
};

export const syncTopicRequestsToFirestore = async () => {
    try {
        const items = dbMock.topicRequestsData || [];
        for (const item of items) {
            await safeSetDoc(doc(db, 'firestore_topic_requests', item.id), {
                ...item,
                updatedAt: serverTimestamp()
            }, { merge: true });
        }
    } catch (e) {
        console.warn('Failed to sync topic requests to Firestore:', e);
    }
};

export const syncStudentAnswersToFirestore = async () => {
    try {
        const items = dbMock.studentAnswersData || [];
        for (const item of items) {
            const id = (item as any).id || `${item.studentId}_${item.videoId}_${Date.now()}`;
            await safeSetDoc(doc(db, 'quiz_answers', id), {
                ...item,
                id,
                updatedAt: serverTimestamp()
            }, { merge: true });
        }
    } catch (e) {
        console.warn('Failed to sync student answers to Firestore:', e);
    }
};

export const syncInfinityTransactionsToFirestore = async () => {
    try {
        const items = dbMock.infinityTransactionsData || [];
        for (const item of items) {
            await safeSetDoc(doc(db, 'infinity_transactions', item.id), {
                ...item,
                updatedAt: serverTimestamp()
            }, { merge: true });
        }
    } catch (e) {
        console.warn('Failed to sync infinity transactions to Firestore:', e);
    }
};

async function deleteFromCollectionRobust(colName: string, idVal: string, extraEmailsOrIds: string[] = []) {
    try {
        const allIds = Array.from(new Set([idVal, ...extraEmailsOrIds].filter(Boolean)));
        if (allIds.length === 0) return;

        console.log(`[ChatDelete] collection: ${colName}, ids:`, allIds);

        // Direct doc deletes in parallel with diagnostics
        const directDeletePromises = allIds.map(async (val) => {
            try {
                console.log(`[ChatDelete] documentPath: ${colName}/${val}`);
                await deleteDoc(doc(db, colName, val));
                console.log(`[ChatDelete] SUCCESS`);
            } catch (err: any) {
                console.error(`[ChatDelete] ERROR\ncode: ${err?.code}\nmessage: ${err?.message}\ndocumentPath: ${colName}/${val}`);
                throw err;
            }
        });

        const isUserOrMessageCollection = [
            'users', 'students', 'teachers', 'admins', 'firestore_users',
            'firestore_conversations', 'firestore_direct_messages',
            'firestore_peer_conversations', 'firestore_peer_messages',
            'firestore_teacher_messages', 'firestore_tutoring_requests',
            'student_course_progress'
        ].includes(colName);

        if (!isUserOrMessageCollection) {
            await Promise.all(directDeletePromises);
            return;
        }

        const colRef = collection(db, colName);
        const queryPromises: Promise<any>[] = [];
        const fields = ['id', 'uid', 'firebaseUid', 'email', 'studentId', 'teacherId', 'senderId', 'conversationId'];

        for (const val of allIds) {
            for (const field of fields) {
                queryPromises.push(getDocs(query(colRef, where(field, '==', val))).catch((e) => {
                    console.warn(`[ChatDelete] Query warning on ${colName} field ${field}:`, e?.message);
                    return null;
                }));
            }
            if (val.includes('@')) {
                queryPromises.push(getDocs(query(colRef, where('email', '==', val.toLowerCase()))).catch(() => null));
            }
        }

        const [_, queryResults] = await Promise.all([
            Promise.all(directDeletePromises),
            Promise.allSettled(queryPromises)
        ]);

        const matchingDocIds = new Set<string>();
        queryResults.forEach((res) => {
            if (res.status === 'fulfilled' && res.value && !res.value.empty) {
                res.value.forEach((d: any) => matchingDocIds.add(d.id));
            }
        });

        if (matchingDocIds.size > 0) {
            const queryDeletePromises = Array.from(matchingDocIds).map(async (docId) => {
                try {
                    console.log(`[ChatDelete] queryDocPath: ${colName}/${docId}`);
                    await deleteDoc(doc(db, colName, docId));
                    console.log(`[ChatDelete] Query delete success: ${colName}/${docId}`);
                } catch (err: any) {
                    console.error(`[ChatDelete] ERROR:`, err);
                    console.error(`code:`, err?.code);
                    console.error(`message:`, err?.message);
                }
            });
            await Promise.allSettled(queryDeletePromises);
        }

        console.log(`[FirestoreSync] Deleted robustly from ${colName}: ${allIds.join(', ')}`);
    } catch (e: any) {
        console.error(`[ChatDelete] ERROR in deleteFromCollectionRobust for ${colName}:`, e);
        console.error(`code:`, e?.code);
        console.error(`message:`, e?.message);
        throw e;
    }
}

export const deleteUserFromFirestore = async (userId: string, knownUserObj?: any) => {
    try {
        const userObj = knownUserObj
            || (dbMock.studentsData || []).find(s => s.id === userId || (s as any).uid === userId || (s as any).firebaseUid === userId || s.email === userId)
            || (dbMock.teachersData || []).find(t => t.id === userId || (t as any).uid === userId || (t as any).firebaseUid === userId || t.email === userId)
            || (dbMock.adminsData || []).find(a => a.id === userId || (a as any).uid === userId || (a as any).firebaseUid === userId || a.email === userId);
        
        const extra = userObj ? [userObj.id, (userObj as any).uid, (userObj as any).firebaseUid, userObj.email].filter(Boolean) : [];
        
        if ((dbMock as any).markUserAsDeleted) {
            (dbMock as any).markUserAsDeleted(userId, userObj?.email);
            extra.forEach(ex => (dbMock as any).markUserAsDeleted(ex));
        }
        dbMock.dbPurgeUserFromMemory(userId);
        if (userObj?.email) dbMock.dbPurgeUserFromMemory(userObj.email);

        await recordDeletedItemInFirestore(userId, 'user');
        if (userObj?.email) await recordDeletedItemInFirestore(userObj.email, 'user');

        const collectionsToDeleteFrom = [
            'users',
            'students',
            'teachers',
            'admins',
            'firestore_users',
            'firestore_conversations',
            'firestore_direct_messages',
            'firestore_peer_conversations',
            'firestore_peer_messages',
            'firestore_teacher_messages',
            'firestore_tutoring_requests',
            'student_course_progress'
        ];

        // Execute deletions across all collections concurrently
        await Promise.allSettled(
            collectionsToDeleteFrom.map(col => deleteFromCollectionRobust(col, userId, extra))
        );

        console.log(`[FirestoreSync] Deleted user ${userId} and associated records from Firestore robustly`);
    } catch (e) {
        console.warn('Failed to delete user from Firestore:', e);
    }
};

export const deleteCourseFromFirestore = async (courseId: string) => {
    await deleteFromCollectionRobust('courses', courseId);
    await recordDeletedItemInFirestore(courseId, 'course');
    console.log(`[FirestoreSync] Deleted course ${courseId} from Firestore`);
};

export const syncDeleteTutoringRequestFromFirestore = async (requestId: string) => {
    try {
        await deleteFromCollectionRobust('firestore_tutoring_requests', requestId);
        await recordDeletedItemInFirestore(requestId, 'tutoring');
        console.log(`[FirestoreSync] Deleted tutoring request ${requestId} from Firestore`);
    } catch (e: any) {
        console.warn(`Failed syncDeleteTutoringRequestFromFirestore for ${requestId}:`, e?.message || e);
        throw e;
    }
};

export const syncAllUsersToFirestore = async () => {
    try {
        const students = dbMock.studentsData || [];
        for (const s of students) {
            await syncUserToFirestore(s, 'student');
        }
        const teachers = dbMock.teachersData || [];
        for (const t of teachers) {
            await syncUserToFirestore(t, 'teacher');
        }
        const admins = dbMock.adminsData || [];
        for (const a of admins) {
            await syncUserToFirestore(a, 'admin');
        }
        await syncCoursesToFirestore();
        await syncTutoringRequestsToFirestore();
        await syncStudentCourseProgressToFirestore();
        await syncMessagesToFirestore();
        await syncAgendaEventsToFirestore();
        await syncCommentsToFirestore();
        await syncTopicRequestsToFirestore();
        await syncStudentAnswersToFirestore();
        await syncInfinityTransactionsToFirestore();
        if (dbMock.appConfigData) await syncAppConfigToFirestore(dbMock.appConfigData);
        for (const q of (dbMock.quizzesData || [])) await syncSaveQuizToFirestore(q);
        for (const p of (dbMock.studentPaymentsData || [])) await syncStudentPaymentToFirestore(p);
        for (const e of (dbMock.studentExpensesData || [])) await syncStudentExpenseToFirestore(e);
        for (const p of (dbMock.teacherPaymentsData || [])) await syncTeacherPaymentToFirestore(p);
        for (const l of (dbMock.aiQueryLogsData || [])) await syncAIQueryLogToFirestore(l);
        for (const f of (dbMock.studentFriendsData || [])) await syncAddStudentFriendToFirestore(f.studentId, f.friendId);
        console.log('[FirestoreSync] Todos los datos e infraestructuras de Firestore han sido sincronizados correctamente.');
    } catch (e) {
        console.warn('Failed to sync all users and data to Firestore:', e);
    }
};

const cleanUndefined = (obj: any): any => {
    if (obj === null || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) {
        return obj.map(cleanUndefined);
    }
    const cleaned: Record<string, any> = {};
    for (const key of Object.keys(obj)) {
        if (obj[key] !== undefined) {
            cleaned[key] = cleanUndefined(obj[key]);
        }
    }
    return cleaned;
};

const safeSetDoc = async (docRef: any, data: any, options?: any) => {
    return await setDoc(docRef, cleanUndefined(data), options);
};

// Quizzes Sync
export const syncSaveQuizToFirestore = async (quiz: any) => {
    const docId = quiz.id || quiz.videoId;
    const path = `firestore_quizzes/${docId}`;
    try {
        await safeSetDoc(doc(db, 'firestore_quizzes', docId), cleanUndefined({
            ...quiz,
            updatedAt: serverTimestamp()
        }), { merge: true });
    } catch (e) {
        handleFirestoreError(e, OperationType.WRITE, path);
    }
};

// Payments & Expenses Sync
export const syncStudentPaymentToFirestore = async (payment: any) => {
    const docId = payment.id || payment.invoiceNumber;
    const path = `student_payments/${docId}`;
    try {
        await safeSetDoc(doc(db, 'student_payments', docId), cleanUndefined({
            ...payment,
            updatedAt: serverTimestamp()
        }), { merge: true });
    } catch (e) {
        handleFirestoreError(e, OperationType.WRITE, path);
    }
};

export const syncStudentExpenseToFirestore = async (expense: any) => {
    const path = `student_expenses/${expense.id}`;
    try {
        await safeSetDoc(doc(db, 'student_expenses', expense.id), cleanUndefined({
            ...expense,
            updatedAt: serverTimestamp()
        }), { merge: true });
    } catch (e) {
        handleFirestoreError(e, OperationType.WRITE, path);
    }
};

export const syncTeacherPaymentToFirestore = async (payment: any) => {
    const docId = payment.id || payment.invoiceNumber;
    const path = `teacher_payments/${docId}`;
    try {
        await safeSetDoc(doc(db, 'teacher_payments', docId), cleanUndefined({
            ...payment,
            updatedAt: serverTimestamp()
        }), { merge: true });
    } catch (e) {
        handleFirestoreError(e, OperationType.WRITE, path);
    }
};

export const syncResetFinancialDataFromFirestore = async (resetBalances: boolean = true) => {
    if (!db) return;
    const collectionsToClear = [
        'student_payments',
        'firestore_student_payments',
        'student_expenses',
        'firestore_student_expenses',
        'teacher_payments',
        'firestore_teacher_payments',
        'infinity_transactions',
        'firestore_infinity_transactions'
    ];
    for (const colName of collectionsToClear) {
        try {
            const colRef = collection(db, colName);
            const snap = await getDocs(colRef);
            await Promise.all(snap.docs.map(d => deleteDoc(d.ref).catch(() => {})));
        } catch (e) {
            console.warn(`Error clearing Firestore collection ${colName}:`, e);
        }
    }
    if (resetBalances) {
        try {
            const usersSnap = await getDocs(collection(db, 'users'));
            await Promise.all(usersSnap.docs.map(d => {
                const data = d.data();
                if (data.role === 'student' && data.creditsBalance !== 0) {
                    return safeSetDoc(d.ref, { creditsBalance: 0, updatedAt: serverTimestamp() }, { merge: true }).catch(() => {});
                }
                return Promise.resolve();
            }));
        } catch (e) {
            console.warn('Error resetting student credit balances in Firestore:', e);
        }
    }
};

// Message edits & deletions
export const syncDeleteDirectMessageFromFirestore = async (messageId: string) => {
    await deleteFromCollectionRobust('firestore_direct_messages', messageId);
};
export const syncUpdateDirectMessageInFirestore = async (messageId: string, text: string) => {
    console.log(`[ChatEdit] START chatId: unknown, messageId: ${messageId}`);
    try {
        const colRef = collection(db, 'firestore_direct_messages');
        const q = query(colRef, where('id', '==', messageId));
        const snap = await getDocs(q);
        
        let targetDocId = messageId;
        if (!snap.empty) {
            targetDocId = snap.docs[0].id;
        }
        
        console.log(`[ChatEdit] documentPath: firestore_direct_messages/${targetDocId}`);
        await safeSetDoc(doc(db, 'firestore_direct_messages', targetDocId), { text, updatedAt: serverTimestamp() }, { merge: true });
        console.log(`[ChatEdit] SUCCESS`);
    } catch (e: any) {
        console.error(`[ChatEdit] ERROR code: ${e?.code} message: ${e?.message}`);
        throw e;
    }
};

export const syncDeletePeerMessageFromFirestore = async (messageId: string) => {
    await deleteFromCollectionRobust('firestore_peer_messages', messageId);
};
export const syncUpdatePeerMessageInFirestore = async (messageId: string, text: string) => {
    console.log(`[ChatEdit] START peer messageId: ${messageId}`);
    try {
        const colRef = collection(db, 'firestore_peer_messages');
        const q = query(colRef, where('id', '==', messageId));
        const snap = await getDocs(q);
        
        let targetDocId = messageId;
        if (!snap.empty) {
            targetDocId = snap.docs[0].id;
        }
        
        console.log(`[ChatEdit] documentPath: firestore_peer_messages/${targetDocId}`);
        await safeSetDoc(doc(db, 'firestore_peer_messages', targetDocId), { text, updatedAt: serverTimestamp() }, { merge: true });
        console.log(`[ChatEdit] SUCCESS`);
    } catch (e: any) {
        console.error(`[ChatEdit] ERROR code: ${e?.code} message: ${e?.message}`);
        throw e;
    }
};

export const syncDeleteTeacherMessageFromFirestore = async (messageId: string) => {
    await deleteFromCollectionRobust('firestore_teacher_messages', messageId);
};
export const syncUpdateTeacherMessageInFirestore = async (messageId: string, text: string) => {
    console.log(`[ChatEdit] START teacher messageId: ${messageId}`);
    try {
        const colRef = collection(db, 'firestore_teacher_messages');
        const q = query(colRef, where('id', '==', messageId));
        const snap = await getDocs(q);
        
        let targetDocId = messageId;
        if (!snap.empty) {
            targetDocId = snap.docs[0].id;
        }
        
        console.log(`[ChatEdit] documentPath: firestore_teacher_messages/${targetDocId}`);
        await safeSetDoc(doc(db, 'firestore_teacher_messages', targetDocId), { text, updatedAt: serverTimestamp() }, { merge: true });
        console.log(`[ChatEdit] SUCCESS`);
    } catch (e: any) {
        console.error(`[ChatEdit] ERROR code: ${e?.code} message: ${e?.message}`);
        throw e;
    }
};

export const syncAppConfigToFirestore = async (config: any) => {
    try {
        await safeSetDoc(doc(db, 'app_config', 'main'), {
            ...config,
            updatedAt: serverTimestamp()
        }, { merge: true });
    } catch (e) {
        console.warn('Failed to save app config to Firestore:', e);
    }
};

export const syncAddStudentFriendToFirestore = async (studentId: string, friendId: string) => {
    try {
        const id1 = `${studentId}_${friendId}`;
        const id2 = `${friendId}_${studentId}`;
        await safeSetDoc(doc(db, 'student_friends', id1), { studentId, friendId, updatedAt: serverTimestamp() });
        await safeSetDoc(doc(db, 'student_friends', id2), { studentId: friendId, friendId: studentId, updatedAt: serverTimestamp() });
    } catch (e) {
        console.warn('Failed to save student friend to Firestore:', e);
    }
};

export const syncAIQueryLogToFirestore = async (log: any) => {
    try {
        await safeSetDoc(doc(db, 'ai_query_logs', log.id || `log_${Date.now()}`), {
            ...log,
            updatedAt: serverTimestamp()
        }, { merge: true });
    } catch (e) {
        console.warn('Failed to save ai query log to Firestore:', e);
    }
};

export const syncUserSeenStatesToFirestore = async (stateData: any) => {
    try {
        const currentUser = auth.currentUser;
        if (!currentUser || !currentUser.uid || !currentUser.emailVerified) return;
        await safeSetDoc(doc(db, 'firestore_user_seen_states', currentUser.uid), {
            ...stateData,
            updatedAt: serverTimestamp()
        }, { merge: true });
    } catch (e: any) {
        if (e?.code === 'permission-denied') {
            return;
        }
        console.warn('Failed to save user seen states to Firestore:', e);
    }
};

export const syncUpdateStudentNotesToFirestore = async (studentId: string, notes: string) => {
    const docRef = doc(db, 'students', studentId);
    await safeSetDoc(docRef, {
        adminNotes: notes,
        updatedAt: serverTimestamp()
    }, { merge: true });
};

export const syncAssignStudentTeacherInFirestore = async (studentId: string, teacherId: string | null, teacherName?: string | null) => {
    const docRef = doc(db, 'students', studentId);
    await safeSetDoc(docRef, {
        assignedTeacherId: teacherId || null,
        assignedTeacherName: teacherName || null,
        updatedAt: serverTimestamp()
    }, { merge: true });
    await syncConversationTeacherInFirestore(studentId, teacherId, teacherName || null);
};

import { httpsCallable } from 'firebase/functions';

export const syncClearChatMessagesInFirestore = async (conversationId: string): Promise<void> => {
    try {
        const { functions } = await import('./firebase');
        const adminClearChatMessages = httpsCallable(functions, 'adminClearChatMessages');
        await adminClearChatMessages({ conversationId });
    } catch (e) {
        console.warn('Failed to clear chat messages via Callable Function:', e);
    }
};

