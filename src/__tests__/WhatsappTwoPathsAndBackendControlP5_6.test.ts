import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  generateDeterministicQueueId,
  classifyError,
  claimWhatsappQueueJob,
  executeWhatsappQueueJob,
  enqueueWhatsappJobIdempotent,
  dispatchWhatsappMessage,
  WhatsappQueueItem
} from '../../functions/whatsappService';

/**
 * Mocking In-Memory Firestore Engine para validaciones exhaustivas de P5.6
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

describe('P5.6 — WhatsApp: Arquitectura de Dos Caminos y Control del Backend', () => {

  describe('1. TEST WHATSAPP TWO PATHS (Camino A: Real vs Camino B: Simulación/Fallback)', () => {
    let originalFetch: any;

    beforeEach(() => {
      originalFetch = global.fetch;
    });

    it('CAMINO B (Simulación): Cuando no existen credenciales de Meta/Twilio/Evolution, entrega sid simulado sin fallar', async () => {
      // Config sin credenciales
      const config = { whatsappMode: 'meta' };
      const item = { to: '+34600111222', message: 'Mensaje de prueba simulación' };

      const result = await dispatchWhatsappMessage(item, config);

      expect(result.success).toBe(true);
      expect(result.simulated).toBe(true);
      expect(result.sid).toMatch(/^sim_meta_\d+/);
    });

    it('CAMINO A (Real): Cuando existen credenciales en Meta Cloud API, despacha vía API HTTP real', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          messaging_product: 'whatsapp',
          contacts: [{ input: '34600111222', wa_id: '34600111222' }],
          messages: [{ id: 'wamid.HBgLMzQ2MDAxMTExMjIVAgASGBQzQUJDMDEyMzQ1Njc4OUFCQ0RFRAA=' }]
        })
      });
      global.fetch = mockFetch;

      const config = {
        whatsappMode: 'meta',
        metaPhoneNumberId: '10987654321',
        metaAccessToken: 'EAAG_VALID_META_TOKEN'
      };
      const item = { to: '+34600111222', message: 'Mensaje real vía Meta' };

      const result = await dispatchWhatsappMessage(item, config);

      expect(result.success).toBe(true);
      expect(result.simulated).toBeUndefined();
      expect(result.sid).toBe('wamid.HBgLMzQ2MDAxMTExMjIVAgASGBQzQUJDMDEyMzQ1Njc4OUFCQ0RFRAA=');
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://graph.facebook.com/v19.0/10987654321/messages',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Authorization': 'Bearer EAAG_VALID_META_TOKEN'
          })
        })
      );

      global.fetch = originalFetch;
    });

    it('CAMINO A (Real): Cuando existen credenciales en Twilio, despacha vía API REST de Twilio', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          sid: 'SM_TWILIO_SID_REAL_12345',
          status: 'queued'
        })
      });
      global.fetch = mockFetch;

      const config = {
        whatsappMode: 'twilio',
        twilioAccountSid: 'AC_TEST_ACCOUNT_123',
        twilioAuthToken: 'AUTH_TOKEN_SECRET_456',
        twilioWhatsappFrom: '+14155238886'
      };
      const item = { to: '+34600999888', message: 'Mensaje real Twilio' };

      const result = await dispatchWhatsappMessage(item, config);

      expect(result.success).toBe(true);
      expect(result.sid).toBe('SM_TWILIO_SID_REAL_12345');
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.twilio.com/2010-04-01/Accounts/AC_TEST_ACCOUNT_123/Messages.json',
        expect.objectContaining({
          method: 'POST'
        })
      );

      global.fetch = originalFetch;
    });
  });

  describe('2. TEST WHATSAPP NO ADMIN SELECT & NO OVERRIDE (Sin selección por mensaje)', () => {
    it('enqueueWhatsappJobIdempotent rechaza o ignora cualquier intento de inyectar provider/transport por mensaje', async () => {
      const db = createMockFirestore();

      // Intento malicioso de inyectar 'forceProvider' o 'overrideTransport'
      const maliciousPayload: any = {
        sourceType: 'tutoring',
        sourceId: 'tut_999',
        recipientRole: 'student',
        timeSlot: '30min',
        to: '+34600123456',
        message: 'Clase en 30m',
        forceProvider: 'meta', // No debe ser aceptado
        transport: 'twilio'    // No debe ser aceptado
      };

      const result = await enqueueWhatsappJobIdempotent(db, maliciousPayload);
      expect(result.created).toBe(true);

      const savedDoc = db._queueDocs.get(result.queueId);
      expect(savedDoc.forceProvider).toBeUndefined();
      expect(savedDoc.transport).toBeUndefined();
      expect(savedDoc.provider).toBeUndefined();
    });

    it('El contrato de WhatsappQueueItem no expone campos de selección de transporte por mensaje', () => {
      const sampleItem: WhatsappQueueItem = {
        queueId: 'tutoring_tut_1_student_30min',
        to: '+34600111222',
        message: 'Aviso',
        recipientRole: 'student',
        sourceType: 'tutoring',
        sourceId: 'tut_1',
        status: 'pending',
        attemptCount: 0,
        maxAttempts: 3,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      expect((sampleItem as any).provider).toBeUndefined();
      expect((sampleItem as any).transport).toBeUndefined();
      expect((sampleItem as any).forceProvider).toBeUndefined();
    });
  });

  describe('3. TEST WHATSAPP BACKEND DECISION (Decisión exclusiva del backend)', () => {
    it('El worker decide el modo basándose exclusivamente en la configuración del backend, no en el ítem', async () => {
      const db = createMockFirestore();
      const mockDispatch = vi.fn().mockResolvedValue({ success: true, sid: 'backend_decided_sid' });

      const item: WhatsappQueueItem = {
        queueId: 'agenda_ev_42_student_30min',
        to: '+34600000042',
        message: 'Examen en 30 minutos',
        recipientRole: 'student',
        sourceType: 'agenda',
        sourceId: 'ev_42',
        status: 'processing',
        attemptCount: 1,
        maxAttempts: 3,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      // Configuración global del backend
      const backendGlobalConfig = { whatsappMode: 'evolution' };

      const execResult = await executeWhatsappQueueJob(
        db,
        item,
        'backend_worker_01',
        backendGlobalConfig,
        mockDispatch
      );

      expect(execResult.success).toBe(true);
      expect(mockDispatch).toHaveBeenCalledWith(
        { to: item.to, message: item.message },
        backendGlobalConfig // El backend pasa su config global soberana
      );
    });
  });

  describe('4. TEST WHATSAPP GLOBAL CONFIG (Configuración global del sistema)', () => {
    it('La configuración global permite conmutar el proveedor maestro para todo el sistema', async () => {
      const item = { to: '+34600111222', message: 'Test de conmutación global' };

      const savedEnv = { ...process.env };
      delete process.env.TWILIO_ACCOUNT_SID;
      delete process.env.TWILIO_AUTH_TOKEN;
      delete process.env.TWILIO_WHATSAPP_FROM;
      delete process.env.GREENAPI_ID_INSTANCE;
      delete process.env.GREENAPI_API_TOKEN_INSTANCE;
      delete process.env.GREENAPI_API_URL;
      delete process.env.EVOLUTION_INSTANCE_URL;
      delete process.env.EVOLUTION_API_KEY;
      delete process.env.META_PHONE_NUMBER_ID;
      delete process.env.META_ACCESS_TOKEN;

      try {
        // Caso 1: Config Global = Twilio (simulado sin credenciales)
        const resTwilio = await dispatchWhatsappMessage(item, { whatsappMode: 'twilio' });
        expect(resTwilio.sid).toMatch(/^sim_twilio_/);

        // Caso 2: Config Global = Green API (simulado sin credenciales)
        const resGreen = await dispatchWhatsappMessage(item, { whatsappMode: 'greenapi' });
        expect(resGreen.sid).toMatch(/^sim_greenapi_/);

        // Caso 3: Config Global = Evolution (simulado sin credenciales)
        const resEvolution = await dispatchWhatsappMessage(item, { whatsappMode: 'evolution' });
        expect(resEvolution.sid).toMatch(/^sim_evolution_/);
      } finally {
        process.env = savedEnv;
      }
    });
  });

  describe('5. TEST WHATSAPP DETERMINISTIC QUEUE (ID Determinista e Idempotencia)', () => {
    it('generateDeterministicQueueId es 100% determinista e inmune a duplicaciones', () => {
      const qId1 = generateDeterministicQueueId('tutoring', 'tutoring_alpha_10', 'student', '30min');
      const qId2 = generateDeterministicQueueId('tutoring', 'tutoring_alpha_10', 'student', '30min');
      const qIdTeacher = generateDeterministicQueueId('tutoring', 'tutoring_alpha_10', 'teacher', '30min');

      expect(qId1).toBe('tutoring_tutoring_alpha_10_student_30min');
      expect(qId1).toBe(qId2);
      expect(qId1).not.toBe(qIdTeacher);
    });
  });

  describe('6. TEST WHATSAPP ATOMIC CLAIM (Prevención de concurrencia y doble envío)', () => {
    it('Solo un worker puede hacer claim exitoso simultáneamente', async () => {
      const queueId = 'tutoring_race_1_student_30min';
      const initialJob: WhatsappQueueItem = {
        queueId,
        to: '+34600111222',
        message: 'Clase',
        recipientRole: 'student',
        sourceType: 'tutoring',
        sourceId: 'race_1',
        status: 'pending',
        attemptCount: 0,
        maxAttempts: 3,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      const db = createMockFirestore({ [queueId]: initialJob });
      const now = new Date();

      // Worker 1 reclama
      const claim1 = await claimWhatsappQueueJob(db, queueId, 'worker_node_A', now);
      expect(claim1.claimed).toBe(true);

      // Worker 2 intenta reclamar el mismo ítem
      const claim2 = await claimWhatsappQueueJob(db, queueId, 'worker_node_B', now);
      expect(claim2.claimed).toBe(false);
      expect(claim2.reason).toBe('already_locked');
    });
  });

  describe('7. TEST WHATSAPP IMMUTABLE LOG (Registro append-only inmutable)', () => {
    it('executeWhatsappQueueJob añade una entrada inmutable a whatsapp_logs tras cada despacho', async () => {
      const db = createMockFirestore();
      const mockDispatch = vi.fn().mockResolvedValue({ success: true, sid: 'msg_log_verified_01' });

      const item: WhatsappQueueItem = {
        queueId: 'tutoring_audit_log_1',
        to: '+34600888999',
        message: 'Auditoría',
        recipientRole: 'student',
        sourceType: 'tutoring',
        sourceId: 'audit_1',
        status: 'processing',
        attemptCount: 1,
        maxAttempts: 3,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      await executeWhatsappQueueJob(db, item, 'worker_logger', { whatsappMode: 'twilio' }, mockDispatch);

      expect(db._logDocs.length).toBe(1);
      const logEntry = db._logDocs[0];
      expect(logEntry.queueId).toBe('tutoring_audit_log_1');
      expect(logEntry.to).toBe('+34600888999');
      expect(logEntry.success).toBe(true);
      expect(logEntry.sid).toBe('msg_log_verified_01');
      expect(logEntry.processedBy).toBe('worker_logger');
    });
  });

  describe('8. TEST WHATSAPP RETRY/BACKOFF (Clasificación de fallos y reintentos)', () => {
    it('Errores temporales (429 Rate Limit, 503 Outage) colocan el ítem en retry con backoff', async () => {
      const db = createMockFirestore();
      const mockDispatch = vi.fn().mockResolvedValue({
        success: false,
        isRetryable: true,
        errorCode: 'RATE_LIMIT_EXCEEDED',
        error: 'Too many requests'
      });

      const item: WhatsappQueueItem = {
        queueId: 'agenda_retry_job_1',
        to: '+34600777888',
        message: 'Reintento temporal',
        recipientRole: 'student',
        sourceType: 'agenda',
        sourceId: 'retry_1',
        status: 'processing',
        attemptCount: 1,
        maxAttempts: 3,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      const result = await executeWhatsappQueueJob(db, item, 'worker_retry_test', {}, mockDispatch);

      expect(result.success).toBe(false);
      expect(result.status).toBe('retry');

      const updatedJob = db._queueDocs.get('agenda_retry_job_1');
      expect(updatedJob.status).toBe('retry');
      expect(updatedJob.errorCode).toBe('RATE_LIMIT_EXCEEDED');
      expect(updatedJob.nextAttemptAt).toBeDefined();
    });

    it('Errores permanentes (400 Bad Request / Invalid Phone) fallan de inmediato sin reintentos innecesarios', async () => {
      const db = createMockFirestore();
      const mockDispatch = vi.fn().mockResolvedValue({
        success: false,
        isRetryable: false,
        errorCode: 'INVALID_ARGUMENT_OR_PHONE',
        error: 'Invalid phone number format'
      });

      const item: WhatsappQueueItem = {
        queueId: 'agenda_perm_fail_1',
        to: 'invalid_number_abc',
        message: 'Fallo permanente',
        recipientRole: 'student',
        sourceType: 'agenda',
        sourceId: 'perm_1',
        status: 'processing',
        attemptCount: 1,
        maxAttempts: 3,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      const result = await executeWhatsappQueueJob(db, item, 'worker_fail_test', {}, mockDispatch);

      expect(result.success).toBe(false);
      expect(result.status).toBe('failed');

      const updatedJob = db._queueDocs.get('agenda_perm_fail_1');
      expect(updatedJob.status).toBe('failed');
      expect(updatedJob.errorCode).toBe('INVALID_ARGUMENT_OR_PHONE');
    });
  });
});
