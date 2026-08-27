import { describe, it, expect, vi } from 'vitest';
import {
  generateDeterministicQueueId,
  classifyError,
  claimWhatsappQueueJob,
  executeWhatsappQueueJob,
  enqueueWhatsappJobIdempotent,
  WhatsappQueueItem
} from '../../functions/whatsappService';

/**
 * Mocking In-Memory Firestore Engine para simulación precisa de transacciones, locks y documentos
 */
function createMockFirestore(initialQueueDocs: Record<string, any> = {}) {
  const queueDocs = new Map<string, any>(Object.entries(initialQueueDocs));
  const logDocs: any[] = [];
  let transactionMutex = Promise.resolve();

  const mockDb: any = {
    _queueDocs: queueDocs,
    _logDocs: logDocs,
    collection: (colName: string) => {
      if (colName === 'whatsapp_queue') {
        return {
          doc: (docId: string) => {
            const docRef: any = {
              id: docId,
              get: async () => {
                const data = queueDocs.get(docId);
                return {
                  exists: !!data,
                  id: docId,
                  data: () => (data ? JSON.parse(JSON.stringify(data)) : undefined)
                };
              },
              set: async (newData: any) => {
                queueDocs.set(docId, JSON.parse(JSON.stringify(newData)));
              },
              update: async (updates: any) => {
                const existing = queueDocs.get(docId) || {};
                queueDocs.set(docId, { ...existing, ...JSON.parse(JSON.stringify(updates)) });
              }
            };
            return docRef;
          }
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
      return {};
    },
    runTransaction: async (updateFunction: (transaction: any) => Promise<any>) => {
      return new Promise((resolve, reject) => {
        transactionMutex = transactionMutex.then(async () => {
          try {
            const transaction = {
              get: async (docRef: any) => docRef.get(),
              set: (docRef: any, data: any) => {
                queueDocs.set(docRef.id, JSON.parse(JSON.stringify(data)));
              },
              update: (docRef: any, updates: any) => {
                const existing = queueDocs.get(docRef.id) || {};
                queueDocs.set(docRef.id, { ...existing, ...JSON.parse(JSON.stringify(updates)) });
              }
            };
            const result = await updateFunction(transaction);
            resolve(result);
          } catch (err) {
            reject(err);
          }
        });
      });
    }
  };

  return mockDb;
}

describe('FASE 2B: Arquitectura Robusta de WhatsApp (Scheduler, Queue Idempotente, Worker & Logs)', () => {

  describe('1. Generador de IDs Deterministas', () => {
    it('genera IDs deterministas idénticos para el mismo evento y rol', () => {
      const id1 = generateDeterministicQueueId('tutoring', 'tutoring_123', 'student', '30min');
      const id2 = generateDeterministicQueueId('tutoring', 'tutoring_123', 'student', '30min');
      expect(id1).toBe('tutoring_tutoring_123_student_30min');
      expect(id1).toBe(id2);
    });

    it('genera IDs diferenciados para distintos roles en el mismo evento', () => {
      const studentId = generateDeterministicQueueId('tutoring', 'req_99', 'student', '30min');
      const teacherId = generateDeterministicQueueId('tutoring', 'req_99', 'teacher', '30min');
      const adminId = generateDeterministicQueueId('tutoring', 'req_99', 'admin', '30min');

      expect(studentId).toBe('tutoring_req_99_student_30min');
      expect(teacherId).toBe('tutoring_req_99_teacher_30min');
      expect(adminId).toBe('tutoring_req_99_admin_30min');
      expect(studentId).not.toBe(teacherId);
      expect(teacherId).not.toBe(adminId);
    });

    it('genera IDs deterministas para eventos de agenda', () => {
      const agendaJobId = generateDeterministicQueueId('agenda', 'event_exam_456', 'student', '30min');
      expect(agendaJobId).toBe('agenda_event_exam_456_student_30min');
    });
  });

  describe('2. Clasificador de Errores de Despacho (Reintentables vs Permanentes)', () => {
    it('clasifica errores 400 y números inválidos como permanentes (no reintentables)', () => {
      const res1 = classifyError(400, 'Invalid phone number');
      expect(res1.isRetryable).toBe(false);
      expect(res1.errorCode).toBe('INVALID_ARGUMENT_OR_PHONE');

      const res2 = classifyError(undefined, 'número inválido');
      expect(res2.isRetryable).toBe(false);
    });

    it('clasifica errores 401 y 403 de autenticación como permanentes', () => {
      const res = classifyError(401, 'Unauthorized credentials');
      expect(res.isRetryable).toBe(false);
      expect(res.errorCode).toBe('AUTHENTICATION_FAILED');
    });

    it('clasifica error 429 de Rate Limit como temporal / reintentable', () => {
      const res = classifyError(429, 'Too many requests');
      expect(res.isRetryable).toBe(true);
      expect(res.errorCode).toBe('RATE_LIMIT_EXCEEDED');
    });

    it('clasifica errores 500/503 y cortes de red como temporales / reintentables', () => {
      const res503 = classifyError(503, 'Service Unavailable');
      expect(res503.isRetryable).toBe(true);
      expect(res503.errorCode).toBe('PROVIDER_TEMPORARY_OUTAGE');

      const resTimeout = classifyError(undefined, 'Connection timeout');
      expect(resTimeout.isRetryable).toBe(true);
      expect(resTimeout.errorCode).toBe('PROVIDER_TEMPORARY_OUTAGE');
    });
  });

  describe('3. Encolamiento Idempotente (enqueueWhatsappJobIdempotent)', () => {
    it('inserta el trabajo la primera vez y rechaza duplicados sin sobrescribir', async () => {
      const db = createMockFirestore();

      const jobPayload = {
        sourceType: 'tutoring' as const,
        sourceId: 'req_101',
        recipientRole: 'student' as const,
        timeSlot: '30min',
        to: '+34600000001',
        message: '¡Hola! Recordatorio de tu clase en 30 min.'
      };

      const firstAttempt = await enqueueWhatsappJobIdempotent(db, jobPayload);
      expect(firstAttempt.created).toBe(true);
      expect(firstAttempt.queueId).toBe('tutoring_req_101_student_30min');

      // Segundo intento concurrente o repetido por otro admin
      const secondAttempt = await enqueueWhatsappJobIdempotent(db, jobPayload);
      expect(secondAttempt.created).toBe(false);
      expect(secondAttempt.reason).toBe('already_exists');
      expect(secondAttempt.queueId).toBe('tutoring_req_101_student_30min');

      // Verificar que solo existe 1 documento en la cola
      expect(db._queueDocs.size).toBe(1);
    });
  });

  describe('4. Operación Atómica de Claim (claimWhatsappQueueJob) y Prevención de Carreras', () => {
    const baseNow = new Date('2026-08-26T10:00:00.000Z');

    it('permite al primer worker adquirir el claim sobre un ítem pendiente', async () => {
      const queueId = 'tutoring_req_200_student_30min';
      const initialJob: WhatsappQueueItem = {
        queueId,
        to: '+34611111111',
        message: 'Tu clase comienza en 30 minutos',
        recipientRole: 'student',
        sourceType: 'tutoring',
        sourceId: 'req_200',
        status: 'pending',
        attemptCount: 0,
        maxAttempts: 3,
        createdAt: '2026-08-26T09:59:00.000Z',
        updatedAt: '2026-08-26T09:59:00.000Z'
      };

      const db = createMockFirestore({ [queueId]: initialJob });

      const claim = await claimWhatsappQueueJob(db, queueId, 'worker_A', baseNow);
      expect(claim.claimed).toBe(true);
      expect(claim.item?.status).toBe('processing');
      expect(claim.item?.processingBy).toBe('worker_A');
      expect(claim.item?.attemptCount).toBe(1);

      // Segundo worker B intentando adquirir el mismo trabajo inmediatamente -> Bloqueado por lock
      const claimWorkerB = await claimWhatsappQueueJob(db, queueId, 'worker_B', baseNow);
      expect(claimWorkerB.claimed).toBe(false);
      expect(claimWorkerB.reason).toBe('already_locked');
    });

    it('rechaza el claim si el trabajo ya fue enviado previamente (status: sent)', async () => {
      const queueId = 'tutoring_req_201_student_30min';
      const sentJob: WhatsappQueueItem = {
        queueId,
        to: '+34611111111',
        message: 'Mensaje ya enviado',
        recipientRole: 'student',
        sourceType: 'tutoring',
        sourceId: 'req_201',
        status: 'sent',
        attemptCount: 1,
        maxAttempts: 3,
        providerMessageId: 'tw_msg_999',
        createdAt: '2026-08-26T09:00:00.000Z',
        updatedAt: '2026-08-26T09:00:05.000Z'
      };

      const db = createMockFirestore({ [queueId]: sentJob });
      const claim = await claimWhatsappQueueJob(db, queueId, 'worker_X', baseNow);
      expect(claim.claimed).toBe(false);
      expect(claim.reason).toBe('already_sent');
    });

    it('permite recuperar un trabajo cuyo lock expiró (worker caído tras 5 minutos)', async () => {
      const queueId = 'tutoring_req_202_student_30min';
      const expiredLockJob = {
        queueId,
        to: '+34611111111',
        message: 'Mensaje con worker muerto',
        recipientRole: 'student',
        sourceType: 'tutoring',
        sourceId: 'req_202',
        status: 'processing',
        processingBy: 'crashed_worker',
        attemptCount: 1,
        maxAttempts: 3,
        lockedUntil: '2026-08-26T09:55:00.000Z', // Lock expiró a las 09:55
        createdAt: '2026-08-26T09:50:00.000Z',
        updatedAt: '2026-08-26T09:50:00.000Z'
      };

      const db = createMockFirestore({ [queueId]: expiredLockJob });
      const claim = await claimWhatsappQueueJob(db, queueId, 'rescuer_worker', baseNow);
      expect(claim.claimed).toBe(true);
      expect(claim.item?.processingBy).toBe('rescuer_worker');
      expect(claim.item?.attemptCount).toBe(2);
    });

    it('respeta el período de backoff para trabajos en estado retry', async () => {
      const queueId = 'tutoring_req_203_student_30min';
      const retryJob = {
        queueId,
        to: '+34611111111',
        message: 'Mensaje en backoff',
        recipientRole: 'student',
        sourceType: 'tutoring',
        sourceId: 'req_203',
        status: 'retry',
        attemptCount: 1,
        maxAttempts: 3,
        nextAttemptAt: '2026-08-26T10:05:00.000Z', // Espera hasta las 10:05
        createdAt: '2026-08-26T09:59:00.000Z',
        updatedAt: '2026-08-26T09:59:00.000Z'
      };

      const db = createMockFirestore({ [queueId]: retryJob });

      // A las 10:00 (antes de tiempo) -> rechazar
      const earlyClaim = await claimWhatsappQueueJob(db, queueId, 'worker_early', new Date('2026-08-26T10:00:00.000Z'));
      expect(earlyClaim.claimed).toBe(false);
      expect(earlyClaim.reason).toBe('backoff_wait');

      // A las 10:06 (después del backoff) -> permitir
      const onTimeClaim = await claimWhatsappQueueJob(db, queueId, 'worker_ontime', new Date('2026-08-26T10:06:00.000Z'));
      expect(onTimeClaim.claimed).toBe(true);
      expect(onTimeClaim.item?.attemptCount).toBe(2);
    });
  });

  describe('5. Ejecución del Worker (executeWhatsappQueueJob) y Ciclo de Vida', () => {
    it('Flujo Exitoso: envía mensaje, actualiza estado a "sent" y crea log inmutable append-only', async () => {
      const queueId = 'tutoring_req_301_student_30min';
      const item: WhatsappQueueItem = {
        queueId,
        to: '+34600112233',
        message: '¡Hola! Recordatorio de clase',
        recipientRole: 'student',
        sourceType: 'tutoring',
        sourceId: 'req_301',
        status: 'processing',
        attemptCount: 1,
        maxAttempts: 3,
        createdAt: '2026-08-26T10:00:00.000Z',
        updatedAt: '2026-08-26T10:00:00.000Z'
      };

      const db = createMockFirestore({ [queueId]: item });

      const mockDispatch = vi.fn().mockResolvedValue({
        success: true,
        sid: 'SM_twilio_success_123'
      });

      const res = await executeWhatsappQueueJob(db, item, 'worker_1', { whatsappMode: 'twilio' }, mockDispatch);

      expect(res.success).toBe(true);
      expect(res.status).toBe('sent');
      expect(res.sid).toBe('SM_twilio_success_123');

      // Validar documento en la cola
      const updatedQueueDoc = db._queueDocs.get(queueId);
      expect(updatedQueueDoc.status).toBe('sent');
      expect(updatedQueueDoc.providerMessageId).toBe('SM_twilio_success_123');
      expect(updatedQueueDoc.lockedUntil).toBeNull();

      // Validar log inmutable append-only
      expect(db._logDocs.length).toBe(1);
      const log = db._logDocs[0];
      expect(log.queueId).toBe(queueId);
      expect(log.to).toBe('+34600112233');
      expect(log.success).toBe(true);
      expect(log.sid).toBe('SM_twilio_success_123');
      expect(log.processedBy).toBe('worker_1');
    });

    it('Flujo de Error Reintentable (HTTP 503): actualiza estado a "retry", programa backoff y crea log de error', async () => {
      const queueId = 'tutoring_req_302_student_30min';
      const item: WhatsappQueueItem = {
        queueId,
        to: '+34600112233',
        message: '¡Hola! Recordatorio de clase',
        recipientRole: 'student',
        sourceType: 'tutoring',
        sourceId: 'req_302',
        status: 'processing',
        attemptCount: 1,
        maxAttempts: 3,
        createdAt: '2026-08-26T10:00:00.000Z',
        updatedAt: '2026-08-26T10:00:00.000Z'
      };

      const db = createMockFirestore({ [queueId]: item });

      const mockDispatch = vi.fn().mockResolvedValue({
        success: false,
        isRetryable: true,
        httpStatus: 503,
        errorCode: 'PROVIDER_TEMPORARY_OUTAGE',
        error: 'Twilio Gateway Timeout'
      });

      const res = await executeWhatsappQueueJob(db, item, 'worker_1', { whatsappMode: 'twilio' }, mockDispatch);

      expect(res.success).toBe(false);
      expect(res.status).toBe('retry');

      const updatedQueueDoc = db._queueDocs.get(queueId);
      expect(updatedQueueDoc.status).toBe('retry');
      expect(updatedQueueDoc.errorCode).toBe('PROVIDER_TEMPORARY_OUTAGE');
      expect(updatedQueueDoc.nextAttemptAt).toBeDefined();

      // Log registrado
      expect(db._logDocs.length).toBe(1);
      expect(db._logDocs[0].success).toBe(false);
      expect(db._logDocs[0].errorCode).toBe('PROVIDER_TEMPORARY_OUTAGE');
    });

    it('Flujo de Error Permanente (Número Inválido): actualiza estado a "failed" inmediatamente', async () => {
      const queueId = 'tutoring_req_303_student_30min';
      const item: WhatsappQueueItem = {
        queueId,
        to: 'invalid_number',
        message: '¡Hola! Recordatorio de clase',
        recipientRole: 'student',
        sourceType: 'tutoring',
        sourceId: 'req_303',
        status: 'processing',
        attemptCount: 1,
        maxAttempts: 3,
        createdAt: '2026-08-26T10:00:00.000Z',
        updatedAt: '2026-08-26T10:00:00.000Z'
      };

      const db = createMockFirestore({ [queueId]: item });

      const mockDispatch = vi.fn().mockResolvedValue({
        success: false,
        isRetryable: false,
        httpStatus: 400,
        errorCode: 'INVALID_ARGUMENT_OR_PHONE',
        error: 'The destination number is not a valid WhatsApp number'
      });

      const res = await executeWhatsappQueueJob(db, item, 'worker_1', { whatsappMode: 'twilio' }, mockDispatch);

      expect(res.success).toBe(false);
      expect(res.status).toBe('failed');

      const updatedQueueDoc = db._queueDocs.get(queueId);
      expect(updatedQueueDoc.status).toBe('failed');
      expect(updatedQueueDoc.errorCode).toBe('INVALID_ARGUMENT_OR_PHONE');
      expect(db._logDocs[0].success).toBe(false);
    });

    it('Agotamiento de Reintentos: si el intento actual alcanza maxAttempts, pasa a "failed"', async () => {
      const queueId = 'tutoring_req_304_student_30min';
      const item: WhatsappQueueItem = {
        queueId,
        to: '+34600112233',
        message: '¡Hola! Recordatorio de clase',
        recipientRole: 'student',
        sourceType: 'tutoring',
        sourceId: 'req_304',
        status: 'processing',
        attemptCount: 3, // Último intento permitido
        maxAttempts: 3,
        createdAt: '2026-08-26T10:00:00.000Z',
        updatedAt: '2026-08-26T10:00:00.000Z'
      };

      const db = createMockFirestore({ [queueId]: item });

      const mockDispatch = vi.fn().mockResolvedValue({
        success: false,
        isRetryable: true,
        httpStatus: 500,
        errorCode: 'SERVER_ERROR',
        error: 'Internal Server Error'
      });

      const res = await executeWhatsappQueueJob(db, item, 'worker_1', { whatsappMode: 'twilio' }, mockDispatch);

      expect(res.success).toBe(false);
      expect(res.status).toBe('failed');

      const updatedQueueDoc = db._queueDocs.get(queueId);
      expect(updatedQueueDoc.status).toBe('failed');
      expect(updatedQueueDoc.errorCode).toBe('MAX_RETRIES_EXCEEDED');
    });
  });

  describe('6. Prueba de Regresión Multi-Admin / Concurrencia Simultánea', () => {
    it('Garantiza que 5 administradores consultando o ejecutando simultáneamente sólo generan 1 trabajo determinista y 1 envío', async () => {
      const db = createMockFirestore();

      const jobPayload = {
        sourceType: 'tutoring' as const,
        sourceId: 'tutoring_shared_999',
        recipientRole: 'student' as const,
        timeSlot: '30min',
        to: '+34699887766',
        message: 'Recordatorio concurrente de tutoría'
      };

      // Simulación de 5 llamadas en paralelo de diferentes sesiones de admin
      const adminPromises = [
        enqueueWhatsappJobIdempotent(db, jobPayload),
        enqueueWhatsappJobIdempotent(db, jobPayload),
        enqueueWhatsappJobIdempotent(db, jobPayload),
        enqueueWhatsappJobIdempotent(db, jobPayload),
        enqueueWhatsappJobIdempotent(db, jobPayload)
      ];

      const results = await Promise.all(adminPromises);

      const createdCount = results.filter(r => r.created).length;
      const rejectedCount = results.filter(r => !r.created).length;

      expect(createdCount).toBe(1);
      expect(rejectedCount).toBe(4);
      expect(db._queueDocs.size).toBe(1);

      // Simulación de 2 workers intentando procesar la cola en paralelo
      const queueId = results[0].queueId;
      const workerPromises = [
        claimWhatsappQueueJob(db, queueId, 'worker_alpha'),
        claimWhatsappQueueJob(db, queueId, 'worker_beta')
      ];

      const workerClaims = await Promise.all(workerPromises);
      const successfulClaims = workerClaims.filter(c => c.claimed);
      expect(successfulClaims.length).toBe(1);
    });
  });
});
