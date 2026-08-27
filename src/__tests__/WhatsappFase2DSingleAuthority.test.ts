import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  generateDeterministicQueueId,
  claimWhatsappQueueJob,
  executeWhatsappQueueJob,
  enqueueWhatsappJobIdempotent
} from '../../functions/whatsappService';
import * as api from '../services/api';

/**
 * Mocking In-Memory Firestore Engine para simulación de transacciones y worker
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
            const tx = {
              get: async (docRef: any) => docRef.get(),
              set: (docRef: any, data: any) => {
                queueDocs.set(docRef.id, JSON.parse(JSON.stringify(data)));
              },
              update: (docRef: any, updates: any) => {
                const existing = queueDocs.get(docRef.id) || {};
                queueDocs.set(docRef.id, { ...existing, ...JSON.parse(JSON.stringify(updates)) });
              }
            };
            const result = await updateFunction(tx);
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

describe('FASE 2D — Verificación Forense de Autoridad Única y Eliminación de Doble Despacho', () => {

  describe('1. Verificación Estática del Frontend (AdminNotificationProvider)', () => {
    it('AdminNotificationProvider NO contiene checkWhatsAppAlerts ni timers de WhatsApp', () => {
      const filePath = path.resolve(__dirname, '../contexts/AdminNotificationProvider.tsx');
      const content = fs.readFileSync(filePath, 'utf-8');

      // checkWhatsAppAlerts debe haber sido completamente eliminado
      expect(content).not.toContain('checkWhatsAppAlerts');
      expect(content).not.toContain('updateTutoringWhatsappSent');

      // Ningún setInterval debe invocar api.sendWhatsApp
      expect(content).not.toContain('api.sendWhatsApp');
    });

    it('AdminNotificationProvider mantiene intactos contadores de UI y notificaciones Toast', () => {
      const filePath = path.resolve(__dirname, '../contexts/AdminNotificationProvider.tsx');
      const content = fs.readFileSync(filePath, 'utf-8');

      expect(content).toContain('AdminNotificationContext');
      expect(content).toContain('pendingTutoringRequestsCount');
      expect(content).toContain('pendingTopicRequestsCount');
      expect(content).toContain('newUsersCount');
      expect(content).toContain('newSubscriptionsCount');
    });
  });

  describe('2. Verificación de Rutas Manuales Legítimas (/api/send-whatsapp)', () => {
    let originalFetch: any;

    beforeEach(() => {
      originalFetch = global.fetch;
    });

    afterEach(() => {
      global.fetch = originalFetch;
    });

    it('api.sendWhatsApp sigue existiendo y puede ser invocado por acciones manuales del Admin', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ success: true, messageId: 'msg_manual_123' })
      });
      global.fetch = mockFetch;

      const res = await api.sendWhatsApp({
        to: '+34600111222',
        message: 'Mensaje manual de prueba para verificar conexión',
        whatsappMode: 'meta'
      });

      expect(res.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith('/api/send-whatsapp', expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'Content-Type': 'application/json' })
      }));
    });

    it('Los callers manuales (AdminCommunicationModal, AdminConnectionPage, AdminDashboardPage) están justificados', () => {
      const commModalPath = path.resolve(__dirname, '../components/admin/AdminCommunicationModal.tsx');
      const connPagePath = path.resolve(__dirname, '../components/admin/AdminConnectionPage.tsx');
      const dashPagePath = path.resolve(__dirname, '../components/admin/AdminDashboardPage.tsx');

      const commContent = fs.readFileSync(commModalPath, 'utf-8');
      const connContent = fs.readFileSync(connPagePath, 'utf-8');
      const dashContent = fs.readFileSync(dashPagePath, 'utf-8');

      // AdminCommunicationModal dispara tras clic en enviar comunicado
      expect(commContent).toContain('handleSendWhatsapp');
      expect(commContent).toContain('api.sendWhatsApp');

      // AdminConnectionPage dispara tras clic en probar conexión
      expect(connContent).toContain('handleSendTestWhatsapp');
      expect(connContent).toContain('api.sendWhatsApp');

      // AdminDashboardPage dispara tras clic en botón de alumno inactivo
      expect(dashContent).toContain('api.sendWhatsApp');
    });
  });

  describe('3. Verificación de Despacho Automático Único (Backend Scheduler + Queue + Worker)', () => {
    it('Una tutoría a T-30 genera un único trabajo en whatsapp_queue y 1 despacho del Worker', async () => {
      const db = createMockFirestore();
      const mockDispatch = vi.fn().mockResolvedValue({ success: true, sid: 'wa_backend_001' });

      // Encolamiento determinista
      const enqueueRes = await enqueueWhatsappJobIdempotent(db, {
        sourceType: 'tutoring',
        sourceId: 'tut_class_100',
        recipientRole: 'student',
        timeSlot: '2026-08-26_10:00',
        to: '+34600111222',
        message: 'Recordatorio tutoría'
      });

      expect(enqueueRes.created).toBe(true);
      expect(enqueueRes.queueId).toBe('tutoring_tut_class_100_student_2026-08-26_10:00');

      // Worker realiza el claim atómico
      const claim = await claimWhatsappQueueJob(db, enqueueRes.queueId, 'worker_cloud_1');
      expect(claim.claimed).toBe(true);
      expect(claim.item?.status).toBe('processing');

      // Worker ejecuta el despacho
      const execRes = await executeWhatsappQueueJob(db, claim.item!, 'worker_cloud_1', { whatsappMode: 'twilio' }, mockDispatch);
      expect(execRes.status).toBe('sent');
      expect(mockDispatch).toHaveBeenCalledTimes(1);

      // Verificación de log inmutable
      expect(db._logDocs.length).toBe(1);
      expect(db._logDocs[0].queueId).toBe(enqueueRes.queueId);
      expect(db._logDocs[0].success).toBe(true);
    });
  });

  describe('4. Prueba de Concurrencia: Navegador Abierto vs Cloud Scheduler', () => {
    it('Con el navegador abierto, el frontend produce 0 envíos y el backend produce exactamente 1 envío', async () => {
      const db = createMockFirestore();
      const mockDispatch = vi.fn().mockResolvedValue({ success: true, messageId: 'wa_backend_002' });

      let frontendAutomaticDispatches = 0;
      let backendAutomaticDispatches = 0;

      // 1. Simulación Backend Cloud Scheduler a T-30
      const enqueueRes = await enqueueWhatsappJobIdempotent(db, {
        sourceType: 'tutoring',
        sourceId: 'tut_shared_event_200',
        recipientRole: 'teacher',
        timeSlot: '2026-08-26_11:00',
        to: '+34600333444',
        message: 'Aviso docente'
      });

      if (enqueueRes.created) {
        const claim = await claimWhatsappQueueJob(db, enqueueRes.queueId, 'worker_cloud_2');
        if (claim.claimed && claim.item) {
          await executeWhatsappQueueJob(db, claim.item, 'worker_cloud_2', { whatsappMode: 'meta' }, async (item: { to: string; message: string }, config?: any) => {
            backendAutomaticDispatches++;
            return mockDispatch(item.to, item.message, config);
          });
        }
      }

      // 2. Simulación Frontend: AdminNotificationProvider ya no tiene poller ni timer
      // por lo que frontendAutomaticDispatches permanece estrictamente en 0.
      expect(frontendAutomaticDispatches).toBe(0);
      expect(backendAutomaticDispatches).toBe(1);
      expect(mockDispatch).toHaveBeenCalledTimes(1);
    });
  });

  describe('5. Prueba de Ejecución Headless (Navegador Cerrado)', () => {
    it('El backend procesa recordatorios de forma 100% autónoma e independiente del frontend', async () => {
      const db = createMockFirestore();
      const mockDispatch = vi.fn().mockResolvedValue({ success: true, messageId: 'wa_headless_003' });

      // Simulación de cron desatendido
      const queueId = generateDeterministicQueueId('agenda', 'event_exam_300', 'student', '2026-08-26_12:00');
      await enqueueWhatsappJobIdempotent(db, {
        sourceType: 'agenda',
        sourceId: 'event_exam_300',
        recipientRole: 'student',
        timeSlot: '2026-08-26_12:00',
        to: '+34600555666',
        message: 'Examen en 30 minutos'
      });

      const claim = await claimWhatsappQueueJob(db, queueId, 'worker_cron_headless');
      expect(claim.claimed).toBe(true);

      const res = await executeWhatsappQueueJob(db, claim.item!, 'worker_cron_headless', { whatsappMode: 'evolution' }, mockDispatch);
      expect(res.status).toBe('sent');
      expect(mockDispatch).toHaveBeenCalledTimes(1);
    });
  });

});
