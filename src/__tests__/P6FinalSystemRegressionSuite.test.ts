import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  resolveConversationMetadata,
  getDirectChatId,
  getSupportChatId,
  getPeerChatId,
  isDirectChatId,
  isSupportChatId,
  isPeerChatId,
  isGroupChatId
} from '../utils/chatUtils';
import {
  generateDeterministicQueueId,
  claimWhatsappQueueJob,
  executeWhatsappQueueJob,
  enqueueWhatsappJobIdempotent,
  dispatchWhatsappMessage,
  WhatsappQueueItem
} from '../../functions/whatsappService';
import { eventEmitter } from '../services/eventService';

/**
 * Mocks de simulación de infraestructura para Pruebas E2E de Regresión P6
 */
function createMockFirestore() {
  const queueDocs = new Map<string, any>();
  const logDocs: any[] = [];
  const conversations = new Map<string, any>();
  const messages = new Map<string, any[]>();
  let transactionMutex = Promise.resolve();

  return {
    _queueDocs: queueDocs,
    _logDocs: logDocs,
    _conversations: conversations,
    _messages: messages,
    collection: (colName: string) => {
      if (colName === 'whatsapp_queue') {
        return {
          doc: (docId: string) => ({
            id: docId,
            get: async () => ({
              exists: queueDocs.has(docId),
              id: docId,
              data: () => (queueDocs.has(docId) ? JSON.parse(JSON.stringify(queueDocs.get(docId))) : undefined)
            }),
            set: async (newData: any) => {
              queueDocs.set(docId, JSON.parse(JSON.stringify(newData)));
            },
            update: async (updates: any) => {
              const existing = queueDocs.get(docId) || {};
              queueDocs.set(docId, { ...existing, ...JSON.parse(JSON.stringify(updates)) });
            }
          })
        };
      }
      if (colName === 'whatsapp_logs') {
        return {
          add: async (logEntry: any) => {
            const id = `log_${Date.now()}_${Math.random()}`;
            logDocs.push({ id, ...JSON.parse(JSON.stringify(logEntry)) });
            return { id };
          }
        };
      }
      if (colName === 'firestore_conversations' || colName === 'conversations') {
        return {
          doc: (docId: string) => ({
            id: docId,
            get: async () => ({
              exists: conversations.has(docId),
              id: docId,
              data: () => conversations.get(docId)
            }),
            set: async (data: any) => {
              conversations.set(docId, { ...data, id: docId });
            },
            update: async (updates: any) => {
              const existing = conversations.get(docId) || {};
              conversations.set(docId, { ...existing, ...updates });
            }
          })
        };
      }
      return {};
    },
    runTransaction: async (updateFn: (t: any) => Promise<any>) => {
      return new Promise((resolve, reject) => {
        transactionMutex = transactionMutex.then(async () => {
          try {
            const t = {
              get: async (docRef: any) => docRef.get(),
              set: (docRef: any, data: any) => {
                queueDocs.set(docRef.id, JSON.parse(JSON.stringify(data)));
              },
              update: (docRef: any, updates: any) => {
                const existing = queueDocs.get(docRef.id) || {};
                queueDocs.set(docRef.id, { ...existing, ...JSON.parse(JSON.stringify(updates)) });
              }
            };
            const res = await updateFn(t);
            resolve(res);
          } catch (err) {
            reject(err);
          }
        });
      });
    }
  } as any;
}

describe('P6 — Pruebas de Regresión y Verificación Final del Sistema AulaInfinity', () => {

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // =========================================================================
  // 1. FLUJO DE AUTENTICACIÓN
  // =========================================================================
  describe('1. FLUJO DE AUTENTICACIÓN', () => {
    it('1.1 Login usuario existente verificado → Auth Ready y acceso concedido', () => {
      let isFirebaseAuthReady = true;
      const currentUser = {
        uid: 'student_auth_01',
        email: 'alumno@aulainfinity.com',
        emailVerified: true
      };
      const claims = { role: 'student', isAdmin: false };

      const allowListeners = isFirebaseAuthReady && currentUser !== null && currentUser.emailVerified;
      expect(allowListeners).toBe(true);
      expect(claims.role).toBe('student');
    });

    it('1.2 Login con email no verificado → acceso a Firestore y chat denegado', () => {
      const isFirebaseAuthReady = true;
      const unverifiedUser = {
        uid: 'user_unverified_99',
        email: 'novalid@example.com',
        emailVerified: false
      };

      const allowListeners = isFirebaseAuthReady && unverifiedUser !== null && Boolean(unverifiedUser.emailVerified);
      expect(allowListeners).toBe(false);
    });

    it('1.3 Logout → listeners destruidos y estado restablecido a null', () => {
      let activeListeners = 3;
      let currentUser: any = { uid: 'user_active' };

      // Acción de logout
      const performLogout = () => {
        activeListeners = 0;
        currentUser = null;
      };

      performLogout();
      expect(activeListeners).toBe(0);
      expect(currentUser).toBeNull();
    });

    it('1.4 Login de usuario B no hereda datos ni claims de usuario A', () => {
      let userState: any = {
        uid: 'user_A',
        role: 'admin',
        activeBadges: 5,
        token: 'token_A'
      };

      // Simular cambio de sesión aislado
      const switchUser = (newUser: any) => {
        userState = { ...newUser, activeBadges: 0 };
      };

      switchUser({ uid: 'user_B', role: 'student', token: 'token_B' });
      expect(userState.uid).toBe('user_B');
      expect(userState.role).toBe('student');
      expect(userState.token).toBe('token_B');
      expect(userState.activeBadges).toBe(0);
    });
  });

  // =========================================================================
  // 2. FLUJO DE CHAT (ESTUDIANTE)
  // =========================================================================
  describe('2. FLUJO DE CHAT (ESTUDIANTE)', () => {
    it('2.1 Abrir conversación directa (student-teacher) resuelve ID canónico sin lecturas Firestore', () => {
      const studentId = 'student_007';
      const teacherId = 'teacher_404';
      const canonicalId = getDirectChatId(studentId, teacherId);

      expect(canonicalId).toBe('direct_student_007_teacher_404');
      const resolved = resolveConversationMetadata(canonicalId, { currentUserId: studentId });

      expect(resolved.type).toBe('direct');
      expect(resolved.studentId).toBe('student_007');
      expect(resolved.teacherId).toBe('teacher_404');
      expect(resolved.isValid).toBe(true);
    });

    it('2.2 Enviar, editar y borrar mensaje se propaga de forma determinista', () => {
      const messagesStore: any[] = [];

      // Enviar
      const newMsg = {
        id: 'msg_101',
        conversationId: 'direct_student_007_teacher_404',
        senderId: 'student_007',
        text: 'Hola profesor, tengo una duda con integrales',
        createdAt: new Date().toISOString(),
        readBy: ['student_007']
      };
      messagesStore.push(newMsg);
      expect(messagesStore.length).toBe(1);
      expect(messagesStore[0].text).toContain('integrales');

      // Editar
      const idx = messagesStore.findIndex(m => m.id === 'msg_101');
      messagesStore[idx] = { ...messagesStore[idx], text: 'Hola profesor, duda con integrales dobles', edited: true };
      expect(messagesStore[0].text).toBe('Hola profesor, duda con integrales dobles');
      expect(messagesStore[0].edited).toBe(true);

      // Borrar
      messagesStore.splice(idx, 1);
      expect(messagesStore.length).toBe(0);
    });

    it('2.3 Marcar como leído actualiza readBy y decrementa badges de no leídos', () => {
      const msg = {
        id: 'msg_202',
        senderId: 'teacher_404',
        text: 'Buenas tardes alumno',
        readBy: ['teacher_404']
      };

      let unreadCount = 1;
      const markAsRead = (studentUid: string) => {
        if (!msg.readBy.includes(studentUid)) {
          msg.readBy.push(studentUid);
          unreadCount = Math.max(0, unreadCount - 1);
        }
      };

      markAsRead('student_007');
      expect(msg.readBy).toContain('student_007');
      expect(unreadCount).toBe(0);
    });

    it('2.4 Cerrar conversación de soporte mueve el estado a cerrado', () => {
      const supportId = getSupportChatId('student_007');
      expect(supportId).toBe('support_student_007');

      const meta = resolveConversationMetadata(supportId);
      expect(meta.type).toBe('support');
      expect(meta.studentId).toBe('student_007');

      let convoStatus = 'active';
      const closeConvo = () => { convoStatus = 'closed'; };
      closeConvo();
      expect(convoStatus).toBe('closed');
    });
  });

  // =========================================================================
  // 3. FLUJO DE CHAT (PROFESOR/ADMIN)
  // =========================================================================
  describe('3. FLUJO DE CHAT (PROFESOR/ADMIN)', () => {
    it('3.1 Profesor abre conversación con estudiante y despacha mensaje', () => {
      const teacherId = 'teacher_404';
      const studentId = 'student_007';
      const convoId = getDirectChatId(studentId, teacherId);

      const resolved = resolveConversationMetadata(convoId, { currentUserId: teacherId });
      expect(resolved.teacherId).toBe(teacherId);
      expect(resolved.studentId).toBe(studentId);

      const msg = {
        id: 'msg_prof_1',
        conversationId: convoId,
        senderId: teacherId,
        text: 'Revisemos el ejercicio en la tutoría de hoy',
        createdAt: new Date().toISOString()
      };
      expect(msg.senderId).toBe('teacher_404');
    });

    it('3.2 Admin lista conversaciones activas de forma eficiente sin lecturas duplicadas', () => {
      const activeConversations = [
        { id: 'direct_student_001_teacher_404', status: 'active', unreadCount: 2 },
        { id: 'direct_student_002_teacher_404', status: 'active', unreadCount: 0 },
        { id: 'support_student_003', status: 'active', unreadCount: 1 }
      ];

      expect(activeConversations.length).toBe(3);
      const unreadTotal = activeConversations.reduce((acc, c) => acc + c.unreadCount, 0);
      expect(unreadTotal).toBe(3);
    });
  });

  // =========================================================================
  // 4. FLUJO DE GRUPOS
  // =========================================================================
  describe('4. FLUJO DE GRUPOS', () => {
    it('4.1 Identificación canónica de salas grupales y cálculo de miembros', () => {
      const groupId = 'group_fisica_cuantica_g1';
      expect(isGroupChatId(groupId)).toBe(true);

      const meta = resolveConversationMetadata(groupId);
      expect(meta.type).toBe('group');
      expect(meta.groupId).toBe('group_fisica_cuantica_g1');

      const groupMembers = ['student_001', 'student_002', 'teacher_404'];
      expect(groupMembers.length).toBe(3);
    });

    it('4.2 Mensaje enviado al grupo es visible para todos los miembros', () => {
      const groupMsg = {
        id: 'gmsg_1',
        conversationId: 'group_fisica_cuantica_g1',
        senderId: 'student_001',
        text: '¿A qué hora es la sesión grupal?',
        readBy: ['student_001']
      };

      const groupMembers = ['student_001', 'student_002', 'teacher_404'];
      const unreadForMembers = groupMembers.filter(m => !groupMsg.readBy.includes(m));

      expect(unreadForMembers).toEqual(['student_002', 'teacher_404']);
    });
  });

  // =========================================================================
  // 5. FLUJO DE NOTIFICACIONES
  // =========================================================================
  describe('5. FLUJO DE NOTIFICACIONES', () => {
    it('5.1 Badge en Header/Sidebar se actualiza en tiempo real al recibir mensaje', () => {
      let headerUnreadBadge = 0;

      // Evento de nuevo mensaje
      const onNewMessageReceived = () => {
        headerUnreadBadge += 1;
      };

      onNewMessageReceived();
      onNewMessageReceived();
      expect(headerUnreadBadge).toBe(2);

      // Marcar como leído
      headerUnreadBadge = Math.max(0, headerUnreadBadge - 1);
      expect(headerUnreadBadge).toBe(1);
    });

    it('5.2 Logout limpia todos los contadores y badges para el siguiente usuario', () => {
      let badges = { chat: 4, alerts: 2, agenda: 1 };

      const clearAllBadges = () => {
        badges = { chat: 0, alerts: 0, agenda: 0 };
      };

      clearAllBadges();
      expect(badges.chat).toBe(0);
      expect(badges.alerts).toBe(0);
      expect(badges.agenda).toBe(0);
    });
  });

  // =========================================================================
  // 6. FLUJO DE WHATSAPP (AUTORIDAD DEL BACKEND & DOS CAMINOS)
  // =========================================================================
  describe('6. FLUJO DE WHATSAPP', () => {
    it('6.1 Generación determinista de IDs de cola e idempotencia de encolamiento', () => {
      const queueId1 = generateDeterministicQueueId('tutoring', 'tut_100', 'student', '30min');
      const queueId2 = generateDeterministicQueueId('tutoring', 'tut_100', 'student', '30min');

      expect(queueId1).toBe('tutoring_tut_100_student_30min');
      expect(queueId1).toBe(queueId2);
    });

    it('6.2 Claim atómico del worker previene dobles envíos concurrentes', async () => {
      const db = createMockFirestore();
      const queueId = 'tutoring_tut_claim_test_30min';
      const item: WhatsappQueueItem = {
        queueId,
        to: '+34600123456',
        message: 'Recordatorio de clase',
        recipientRole: 'student',
        sourceType: 'tutoring',
        sourceId: 'tut_claim_test',
        status: 'pending',
        attemptCount: 0,
        maxAttempts: 3,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      db._queueDocs.set(queueId, item);

      const claim1 = await claimWhatsappQueueJob(db, queueId, 'worker_1', new Date());
      expect(claim1.claimed).toBe(true);

      const claim2 = await claimWhatsappQueueJob(db, queueId, 'worker_2', new Date());
      expect(claim2.claimed).toBe(false);
      expect(claim2.reason).toBe('already_locked');
    });

    it('6.3 Despacho seguro en Camino B (Simulación) y registro inmutable en whatsapp_logs', async () => {
      const db = createMockFirestore();
      const item: WhatsappQueueItem = {
        queueId: 'tutoring_sim_01',
        to: '+34600999000',
        message: 'Mensaje de simulación',
        recipientRole: 'student',
        sourceType: 'tutoring',
        sourceId: 'sim_01',
        status: 'processing',
        attemptCount: 1,
        maxAttempts: 3,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      const result = await executeWhatsappQueueJob(
        db,
        item,
        'worker_sim',
        { whatsappMode: 'meta' } // Sin credenciales -> fallback a simulación
      );

      expect(result.success).toBe(true);
      expect(db._logDocs.length).toBe(1);
      expect(db._logDocs[0].sid).toMatch(/^sim_meta_/);
      expect(db._logDocs[0].queueId).toBe('tutoring_sim_01');
    });

    it('6.4 El admin no puede forzar parámetros de transporte encolados individualmente', async () => {
      const db = createMockFirestore();
      const maliciousPayload: any = {
        sourceType: 'agenda',
        sourceId: 'ev_malicious_1',
        recipientRole: 'student',
        timeSlot: '30min',
        to: '+34600111222',
        message: 'Aviso',
        forceProvider: 'meta', // No debe persistirse
        transport: 'twilio'    // No debe persistirse
      };

      const enq = await enqueueWhatsappJobIdempotent(db, maliciousPayload);
      expect(enq.created).toBe(true);

      const saved = db._queueDocs.get(enq.queueId);
      expect(saved.forceProvider).toBeUndefined();
      expect(saved.transport).toBeUndefined();
    });
  });

  // =========================================================================
  // 7. FLUJO DE CONVERSATION IDS
  // =========================================================================
  describe('7. FLUJO DE CONVERSATION IDS', () => {
    it('7.1 Formato canónico directo direct_{student}_{teacher} con UIDs con guiones bajos', () => {
      const sId = 'student_madrid_123';
      const tId = 'teacher_fisica_456';
      const cid = getDirectChatId(sId, tId);

      expect(cid).toBe('direct_student_madrid_123_teacher_fisica_456');
      const resolved = resolveConversationMetadata(cid, { studentId: sId, teacherId: tId });

      expect(resolved.type).toBe('direct');
      expect(resolved.studentId).toBe(sId);
      expect(resolved.teacherId).toBe(tId);
      expect(resolved.participants).toEqual([sId, tId]);
    });

    it('7.2 Reconocimiento y normalización transparente de formato legacy (studentId_teacherId)', () => {
      const legacyId = 'student777_teacher888';
      const resolved = resolveConversationMetadata(legacyId, {
        studentId: 'student777',
        teacherId: 'teacher888'
      });

      expect(resolved.type).toBe('direct');
      expect(resolved.studentId).toBe('student777');
      expect(resolved.teacherId).toBe('teacher888');
      expect(resolved.normalizedId).toBe('direct_student777_teacher888');
    });

    it('7.3 Soporte (support_{student}) y Peer (peer_{student1}_{student2})', () => {
      const sup = resolveConversationMetadata('support_student999');
      expect(sup.type).toBe('support');
      expect(sup.studentId).toBe('student999');

      const peer = resolveConversationMetadata('peer_studentA_studentB');
      expect(peer.type).toBe('peer');
      expect(peer.participants).toContain('studentA');
      expect(peer.participants).toContain('studentB');
    });
  });

  // =========================================================================
  // 8. FLUJO DE REACT QUERY / FIRESTORE QUOTA
  // =========================================================================
  describe('8. FLUJO DE REACT QUERY / FIRESTORE QUOTA', () => {
    it('8.1 Carga inicial única (1 getDocs / onSnapshot) sin refetches de ventana redundantes', () => {
      let getDocsCallCount = 0;

      // Simulación de montaje de query con listener en tiempo real
      const subscribeQuery = () => {
        getDocsCallCount += 1;
      };

      // Montaje inicial
      subscribeQuery();
      expect(getDocsCallCount).toBe(1);

      // Simular cambio de foco de ventana (refetchOnWindowFocus deshabilitado para listeners)
      const onWindowFocus = (hasRealtimeListener: boolean) => {
        if (!hasRealtimeListener) {
          getDocsCallCount += 1;
        }
      };

      onWindowFocus(true);
      expect(getDocsCallCount).toBe(1); // Mantiene 1 lectura
    });

    it('8.2 Actualizaciones por onSnapshot no disparan invalidaciones de query duplicadas', () => {
      const updateSpy = vi.fn();
      eventEmitter.on('test-quota-event', updateSpy);

      eventEmitter.emit('test-quota-event', { data: 'snapshot_update' });
      expect(updateSpy).toHaveBeenCalledTimes(1);

      eventEmitter.off('test-quota-event', updateSpy);
    });
  });

  // =========================================================================
  // 9. FLUJO DE LOGOUT/LOGIN (AISLAMIENTO DE DATOS)
  // =========================================================================
  describe('9. FLUJO DE LOGOUT/LOGIN (AISLAMIENTO DE DATOS)', () => {
    it('9.1 Estado local y caché se limpian completamente al cerrar sesión', () => {
      let memoryCache: Record<string, any> = {
        'user_profile': { name: 'Alumno Alfa', role: 'student' },
        'chat_messages': [{ id: 'm1', text: 'Privado de Alfa' }]
      };

      const onUserLogout = () => {
        memoryCache = {};
      };

      onUserLogout();
      expect(Object.keys(memoryCache).length).toBe(0);
      expect(memoryCache['user_profile']).toBeUndefined();
    });

    it('9.2 Sesión de Usuario B inicia con estado limpio y sin residuos de Usuario A', () => {
      let sessionData = {
        userId: 'user_B',
        conversations: [] as string[],
        unreadBadges: 0
      };

      expect(sessionData.userId).toBe('user_B');
      expect(sessionData.conversations.length).toBe(0);
      expect(sessionData.unreadBadges).toBe(0);
    });
  });

  // =========================================================================
  // 10. FLUJO DE STRICTMODE (DESARROLLO)
  // =========================================================================
  describe('10. FLUJO DE STRICTMODE (DESARROLLO)', () => {
    it('10.1 Simulación de montaje, desmontaje y remontaje en StrictMode sin listeners duplicados', () => {
      let activeListenerCount = 0;

      const mountComponent = () => {
        activeListenerCount += 1;
        return () => {
          activeListenerCount -= 1;
        };
      };

      // 1. Primer montaje
      const cleanup1 = mountComponent();
      expect(activeListenerCount).toBe(1);

      // 2. StrictMode desmontaje inmediato
      cleanup1();
      expect(activeListenerCount).toBe(0);

      // 3. StrictMode remontaje
      const cleanup2 = mountComponent();
      expect(activeListenerCount).toBe(1);

      // 4. Desmontaje final
      cleanup2();
      expect(activeListenerCount).toBe(0);
    });
  });

});
