/**
 * Backend Cloud Functions para AulaInfinity
 */
import * as functions from "firebase-functions";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import * as admin from 'firebase-admin';
import { getFirestore, FieldValue, DocumentSnapshot } from 'firebase-admin/firestore';
import { GoogleGenAI, GenerateContentResponse } from "@google/genai";

if (!admin.apps.length) {
  admin.initializeApp();
}

export const FIRESTORE_DATABASE_ID = "ai-studio-aulainfinity-6be7791f-ef3e-4fc4-b45b-98918b1b57ca";

// Instancia centralizada de Firestore utilizando la instancia nombrada
const db = getFirestore(admin.app(), FIRESTORE_DATABASE_ID);

// Inicializa Gemini con la clave desde la configuración segura de Firebase
const getAi = () => new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || functions.config().gemini?.key || '' });

const systemInstruction = "Si generas contenido que involucre dinero, debes usar Euros (€) como la moneda. Para cualquier notación matemática, no uses LaTeX delimitado (como $...$ o \\(...\\)). En su lugar, usa caracteres Unicode (por ejemplo, x², √2, ≠) o MathML cuando sea apropiado para fórmulas complejas.";

/**
 * Función auxiliar para convertir valores de fecha heterogéneos a una instancia válida de Date.
 * Acepta: Firestore Timestamp, Date, número (timestamp ms), ISO string.
 * Retorna null para valores inexistentes o inválidos.
 */
export function toValidDate(value: unknown): Date | null {
  if (value === null || value === undefined) return null;
  
  if (value instanceof Date) {
    return isNaN(value.getTime()) ? null : value;
  }
  
  if (typeof value === 'object' && value !== null) {
    if (typeof (value as any).toDate === 'function') {
      try {
        const d = (value as any).toDate();
        return d instanceof Date && !isNaN(d.getTime()) ? d : null;
      } catch {
        return null;
      }
    }
    if (typeof (value as any).seconds === 'number') {
      const d = new Date((value as any).seconds * 1000);
      return isNaN(d.getTime()) ? null : d;
    }
  }
  
  if (typeof value === 'number') {
    if (isNaN(value) || value <= 0) return null;
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }
  
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const d = new Date(trimmed);
    return isNaN(d.getTime()) ? null : d;
  }
  
  return null;
}

/**
 * Determina la fecha efectiva de actividad de una conversación siguiendo la prioridad:
 * 1. lastMessageTimestamp
 * 2. updatedAt
 * 3. createdAt
 */
export function getEffectiveActivityTimestamp(data: Record<string, any>): Date | null {
  if (!data || typeof data !== 'object') return null;
  
  const lastMsg = toValidDate(data.lastMessageTimestamp);
  if (lastMsg) return lastMsg;
  
  const updated = toValidDate(data.updatedAt);
  if (updated) return updated;
  
  const created = toValidDate(data.createdAt);
  if (created) return created;
  
  return null;
}

/**
 * Función para sincronizar de forma segura el rol de usuario con Custom Claims.
 * Evita la escalación de privilegios impidiendo que cambios del cliente otorguen roles privilegiados o aprobación de tutoría.
 */
export const syncUserRole = onDocumentWritten(
  {
    region: "europe-west1",
    database: "ai-studio-aulainfinity-6be7791f-ef3e-4fc4-b45b-98918b1b57ca",
    document: "firestore_users/{userId}"
  },
  async (event) => {
    const change = event.data;
    const userId = event.params.userId;
    const newData = change.after.exists ? change.after.data() : null;
    const oldData = change.before.exists ? change.before.data() : null;

    try {
      let userRecord: admin.auth.UserRecord;
      try {
        userRecord = await admin.auth().getUser(userId);
      } catch (authError: any) {
        if (authError.code === 'auth/user-not-found') {
          console.log(`[syncUserRole] Usuario ${userId} no existe en Auth.`);
          return;
        }
        throw authError;
      }

      const existingClaims = userRecord.customClaims || {};

      // Si el documento de usuario fue eliminado en Firestore, revocar/limpiar claims administrativas
      if (!newData) {
        console.log(`[syncUserRole] Documento firestore_users/${userId} eliminado. Revocando claims privilegiadas.`);
        const cleanedClaims = {
          ...existingClaims,
          role: 'student',
          isAdmin: false,
          isApprovedForTutoring: false
        };
        await admin.auth().setCustomUserClaims(userId, cleanedClaims);
        return;
      }

      let targetRole = newData.role || 'student';
      let isApprovedForTutoring = Boolean(newData.isApprovedForTutoring);
      let isAdmin = Boolean(newData.isAdmin);

      const wasAdmin = oldData?.role === 'admin' || oldData?.isAdmin === true || existingClaims.role === 'admin';
      const wasTeacher = oldData?.role === 'teacher' || existingClaims.role === 'teacher' || wasAdmin;
      const wasApproved = oldData?.isApprovedForTutoring === true || existingClaims.isApprovedForTutoring === true || wasAdmin;

      // 1. Protección contra escalación a admin desde escritura cliente
      if (targetRole === 'admin' || isAdmin) {
        if (!wasAdmin) {
          console.warn(`[syncUserRole] Bloqueada escalación no autorizada a admin para ${userId}`);
          targetRole = oldData?.role || existingClaims.role || 'student';
          isAdmin = false;
        } else {
          isAdmin = true;
        }
      }

      // 2. Protección contra escalación a teacher desde escritura cliente (student -> teacher requiere backend/Admin SDK)
      if (targetRole === 'teacher') {
        if (!wasTeacher) {
          console.warn(`[syncUserRole] Bloqueada escalación no autorizada a teacher para ${userId}. Debe ser aprobada por admin.`);
          targetRole = oldData?.role || existingClaims.role || 'student';
        }
      }

      // 3. Protección contra auto-aprobación de tutoría desde escritura cliente
      if (targetRole === 'teacher' && isApprovedForTutoring) {
        if (!wasApproved) {
          console.warn(`[syncUserRole] Bloqueada auto-aprobación de tutoría para ${userId}`);
          isApprovedForTutoring = false;
        }
      }

      const updatedClaims = {
        ...existingClaims,
        role: targetRole,
        isAdmin: targetRole === 'admin' || isAdmin,
        isApprovedForTutoring: targetRole === 'admin' ? true : (targetRole === 'teacher' ? isApprovedForTutoring : false)
      };

      await admin.auth().setCustomUserClaims(userId, updatedClaims);
      console.log(`[syncUserRole] Custom claims actualizados con éxito para ${userId}:`, updatedClaims);
    } catch (err) {
      console.error(`[syncUserRole] Error al actualizar custom claims para ${userId}:`, err);
    }
  }
);

/**
 * Callable Function exclusiva para Administradores verificados para asignar roles o aprobar profesores.
 * La autorización depende strictly del Custom Claim role === 'admin'.
 */
export const adminSetUserClaims = functions.region("europe-west1").https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Se requiere autenticación.");
  }
  const callerClaims = (context.auth.token || {}) as any;
  const isCallerAdmin = callerClaims.role === 'admin';
  if (!isCallerAdmin) {
    console.warn(`[adminSetUserClaims] Intento de acceso no autorizado por UID: ${context.auth.uid}`);
    throw new functions.https.HttpsError("permission-denied", "Solo un administrador con claim verificado puede modificar permisos de usuario.");
  }

  const { targetUid, role, isApprovedForTutoring, isAdmin } = data;
  if (!targetUid || !role) {
    throw new functions.https.HttpsError("invalid-argument", "Se requiere targetUid y role.");
  }

  if (!['student', 'teacher', 'admin'].includes(role)) {
    throw new functions.https.HttpsError("invalid-argument", "Rol inválido especificado.");
  }

  try {
    const userRecord = await admin.auth().getUser(targetUid);
    const existingClaims = userRecord.customClaims || {};

    const newClaims = {
      ...existingClaims,
      role: role,
      isAdmin: role === 'admin' || Boolean(isAdmin),
      isApprovedForTutoring: role === 'admin' ? true : (role === 'teacher' ? Boolean(isApprovedForTutoring) : false)
    };

    await admin.auth().setCustomUserClaims(targetUid, newClaims);
    console.log(`[adminSetUserClaims] Admin ${context.auth.uid} actualizó claims para ${targetUid}:`, newClaims);

    // Sincronizar también en Firestore utilizando la instancia centralizada
    const updateData: any = {
      role: role,
      updatedAt: FieldValue.serverTimestamp(),
      updatedByAdminUid: context.auth.uid
    };

    if (role === 'teacher') {
      updateData.isApprovedForTutoring = Boolean(isApprovedForTutoring);
    }

    if (role === 'admin') {
      updateData.isAdmin = true;
      updateData.isApprovedForTutoring = true;
    }

    await db.collection('firestore_users').doc(targetUid).set(updateData, { merge: true });
    await db.collection('users').doc(targetUid).set(updateData, { merge: true });

    return { success: true, targetUid, claims: newClaims, updatedBy: context.auth.uid };
  } catch (err: any) {
    console.error("[adminSetUserClaims] Error:", err);
    throw new functions.https.HttpsError("internal", err.message || "Error al actualizar permisos.");
  }
});

// Función para el Tutor IA (chat)
export const callTutorAI = functions.region("europe-west1").https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "El usuario debe estar autenticado para usar el Tutor IA.");
  }

  const history = data.history;
  const image = data.image;

  if (!history || !Array.isArray(history)) {
    throw new functions.https.HttpsError("invalid-argument", "El historial del chat es requerido.");
  }

  const formattedHistory = history.slice(0, -1).map((msg: any) => ({
    role: msg.role,
    parts: [{ text: msg.text }],
  }));

  const lastMessage = history[history.length - 1];
  const lastMessageParts: any[] = [{ text: lastMessage.text }];

  if (image) {
    lastMessageParts.unshift({
      inlineData: {
        mimeType: image.mimeType,
        data: image.data,
      },
    });
  }

  const contents = [...formattedHistory, { role: "user", parts: lastMessageParts }] as any;

  try {
    const ai = getAi();
    const result: GenerateContentResponse = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: contents,
        config: {
            systemInstruction,
        },
    });

    return { text: result.text };
  } catch (error) {
    console.error("Error llamando a la API de Gemini:", error);
    throw new functions.https.HttpsError("internal", "Error al comunicarse con el modelo de IA.");
  }
});

// Función para llamadas simples (resúmenes, preguntas, etc.)
export const callSimpleAI = functions.region("europe-west1").https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "El usuario debe estar autenticado.");
    }

    const prompt = data.prompt;
    if (!prompt || typeof prompt !== 'string') {
        throw new functions.https.HttpsError("invalid-argument", "Se requiere un prompt de texto.");
    }

    try {
        const ai = getAi();
        const result: GenerateContentResponse = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
            config: {
                systemInstruction,
            },
        });

        return { text: result.text };
    } catch (error) {
        console.error("Error llamando a la API de Gemini:", error);
        throw new functions.https.HttpsError("internal", "Error al procesar la solicitud con IA.");
    }
});

export const CHAT_RETENTION_DAYS = 30;

/**
 * Tarea programada (Cloud Scheduler + Cloud Functions v2) para la retención y borrado automático
 * periódico de chats/conversaciones que superen CHAT_RETENTION_DAYS (30 días).
 */
export const scheduledChatRetentionCleanup = onSchedule(
  {
    schedule: "0 2 * * *", // Todos los días a las 02:00 AM
    region: "europe-west1",
    database: "ai-studio-aulainfinity-6be7791f-ef3e-4fc4-b45b-98918b1b57ca",
  },
  async (event) => {
    console.log(`[scheduledChatRetentionCleanup] Iniciando tarea de retención de chats (límite: ${CHAT_RETENTION_DAYS} días).`);
    const threshold = new Date();
    threshold.setDate(threshold.getDate() - CHAT_RETENTION_DAYS);
    
    let deletedConversationsCount = 0;
    let deletedMessagesCount = 0;

    const parentCollections = [
      "chats",
      "conversations",
      "firestore_conversations",
      "firestore_peer_conversations",
      "firestore_teacher_conversations"
    ];
    
    const legacyCollections = [
      'firestore_direct_messages', 
      'firestore_peer_messages', 
      'firestore_teacher_messages', 
      'firestore_course_messages'
    ];

    const parentDateFields = ['lastMessageTimestamp', 'updatedAt', 'createdAt'];
    
    const processedChats = new Set<string>();
    const processedOrphans = new Set<string>();

    try {
      // ---------------------------------------------------------
      // FASE 1: Limpieza de conversaciones padre (verificando la fecha efectiva de actividad)
      // ---------------------------------------------------------
      for (const colName of parentCollections) {
        const colRef = db.collection(colName);
        
        for (const dateField of parentDateFields) {
          let hasMore = true;
          let lastDoc: DocumentSnapshot | null = null;

          while (hasMore) {
            let q = colRef.where(dateField, '<', threshold)
                          .orderBy(dateField)
                          .limit(500);

            if (lastDoc) {
              q = q.startAfter(lastDoc);
            }

            const snapshot = await q.get().catch((err) => {
              console.error(`[scheduledChatRetentionCleanup] Query error on ${colName} (${dateField}):`, err);
              return null;
            });

            if (!snapshot || snapshot.empty) {
              hasMore = false;
              break;
            }

            lastDoc = snapshot.docs[snapshot.docs.length - 1];

            const bulkWriter = db.bulkWriter();
            bulkWriter.onWriteError((error) => {
              if (error.failedAttempts < 3) return true;
              return false;
            });

            for (const docSnap of snapshot.docs) {
              const chatId = docSnap.id;
              const globalId = `${colName}/${chatId}`;
              
              if (processedChats.has(globalId)) {
                continue;
              }
              processedChats.add(globalId);

              const data = docSnap.data();
              const effectiveDate = getEffectiveActivityTimestamp(data);

              const dateToCheck = effectiveDate;
              // REGLA F80.50.2: Solo eliminar si la FECHA EFECTIVA DE ACTIVIDAD es anterior al umbral
              if (!dateToCheck || dateToCheck >= threshold) {
                console.log(`[scheduledChatRetentionCleanup] Chat ${globalId} OMITIDO. Actividad efectiva reciente (${dateToCheck ? dateToCheck.toISOString() : 'sin fecha válida'}).`);
                continue;
              }

              if (dateToCheck < threshold) {
                console.log(`[scheduledChatRetentionCleanup] Chat caducado CONFIRMADO en ${globalId} (fecha efectiva: ${dateToCheck.toISOString()})`);
              }
              
              // 1. Eliminar subcolecciones canónicas
              const subcols = ['messages', 'signal', 'documents'];
              for (const subcol of subcols) {
                const subRef = db.collection(colName).doc(chatId).collection(subcol);
                const subMsgsSnap = await subRef.get().catch(() => null);
                if (subMsgsSnap && !subMsgsSnap.empty) {
                  for (const mDoc of subMsgsSnap.docs) {
                    bulkWriter.delete(mDoc.ref);
                    deletedMessagesCount++;
                  }
                }
              }
              
              // 2. Eliminar referencias huérfanas vinculadas a este chat (Caso A)
              const targetIds = [chatId, chatId.replace(/^direct_/, ''), `direct_${chatId}`];
              for (const legacyCol of legacyCollections) {
                for (const tid of targetIds) {
                  const legacySnap = await db.collection(legacyCol).where('conversationId', '==', tid).get().catch(() => null);
                  if (legacySnap && !legacySnap.empty) {
                    for (const mDoc of legacySnap.docs) {
                      const mGlobalId = `${legacyCol}/${mDoc.id}`;
                      processedOrphans.add(mGlobalId);
                      bulkWriter.delete(mDoc.ref);
                      deletedMessagesCount++;
                    }
                  }
                }
              }

              // 3. Eliminar documento de la conversación padre
              bulkWriter.delete(docSnap.ref);
              deletedConversationsCount++;
            }

            await bulkWriter.close();
          }
        }
      }

      // ---------------------------------------------------------
      // FASE 2: Limpieza de mensajes legacy huérfanos (Caso B, usando createdAt)
      // ---------------------------------------------------------
      for (const legacyCol of legacyCollections) {
        const legacyRef = db.collection(legacyCol);
        let hasMore = true;
        let lastDoc: DocumentSnapshot | null = null;

        while (hasMore) {
          let q = legacyRef.where('createdAt', '<', threshold)
                           .orderBy('createdAt')
                           .limit(500);

          if (lastDoc) {
            q = q.startAfter(lastDoc);
          }

          const snapshot = await q.get().catch((err) => {
            console.error(`[scheduledChatRetentionCleanup] Query error on orphans ${legacyCol} (createdAt):`, err);
            return null;
          });

          if (!snapshot || snapshot.empty) {
            hasMore = false;
            break;
          }

          lastDoc = snapshot.docs[snapshot.docs.length - 1];

          const bulkWriter = db.bulkWriter();
          bulkWriter.onWriteError((error) => {
            if (error.failedAttempts < 3) return true;
            return false;
          });

          for (const docSnap of snapshot.docs) {
            const msgId = docSnap.id;
            const globalId = `${legacyCol}/${msgId}`;
            
            if (processedOrphans.has(globalId)) {
              continue;
            }
            processedOrphans.add(globalId);

            const data = docSnap.data();
            const msgDate = toValidDate(data.createdAt || data.timestamp);
            if (!msgDate || msgDate >= threshold) {
              continue;
            }

            bulkWriter.delete(docSnap.ref);
            deletedMessagesCount++;
          }

          await bulkWriter.close();
        }
      }

      console.log(`[scheduledChatRetentionCleanup] Tarea finalizada con éxito. Conversaciones borradas: ${deletedConversationsCount}, Mensajes/Docs borrados: ${deletedMessagesCount}`);
      return { success: true, deletedConversationsCount, deletedMessagesCount };
    } catch (error) {
      console.error("[scheduledChatRetentionCleanup] Error crítico en tarea programada:", error);
      throw error;
    }
  }
);

/**
 * Callable Function: adminClearChatMessages
 * Permite a un administrador vaciar los mensajes de un chat, sus subcolecciones y colecciones legacy de forma segura.
 */
export const adminClearChatMessages = functions.region("europe-west1").https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Se requiere autenticación.");
  }
  const callerClaims = (context.auth.token || {}) as any;
  const isCallerAdmin = callerClaims.role === 'admin';
  if (!isCallerAdmin) {
    throw new functions.https.HttpsError("permission-denied", "Operación exclusiva para administradores.");
  }

  const { conversationId } = data;
  if (!conversationId) {
    throw new functions.https.HttpsError("invalid-argument", "Se requiere conversationId.");
  }

  let deletedMessagesCount = 0;
  try {
    const bulkWriter = db.bulkWriter();
    bulkWriter.onWriteError((error) => {
      if (error.failedAttempts < 3) return true;
      return false;
    });

    const targetIds = [conversationId, conversationId.replace(/^direct_/, ''), `direct_${conversationId}`];

    for (const tid of targetIds) {
      const subcollections = ['messages', 'signal', 'documents'];
      for (const colName of ["chats", "conversations", "firestore_conversations", "firestore_peer_conversations", "firestore_teacher_conversations"]) {
        for (const subcol of subcollections) {
          const subSnap = await db.collection(colName).doc(tid).collection(subcol).get().catch(() => null);
          if (subSnap && !subSnap.empty) {
            for (const doc of subSnap.docs) {
              bulkWriter.delete(doc.ref);
              deletedMessagesCount++;
            }
          }
        }
      }
    }

    const legacyCollections = ['firestore_direct_messages', 'firestore_peer_messages', 'firestore_teacher_messages', 'firestore_course_messages'];
    for (const legacyCol of legacyCollections) {
      for (const tid of targetIds) {
        const legacySnap = await db.collection(legacyCol).where('conversationId', '==', tid).get().catch(() => null);
        if (legacySnap && !legacySnap.empty) {
          for (const doc of legacySnap.docs) {
            bulkWriter.delete(doc.ref);
            deletedMessagesCount++;
          }
        }
      }
    }

    for (const colName of ["chats", "conversations", "firestore_conversations", "firestore_peer_conversations", "firestore_teacher_conversations"]) {
      for (const tid of targetIds) {
        const convRef = db.collection(colName).doc(tid);
        bulkWriter.update(convRef, {
          lastMessageText: '',
        });
      }
    }

    await bulkWriter.close();

    return { success: true, clearedCount: deletedMessagesCount };
  } catch (err: any) {
    console.error("[adminClearChatMessages] Error:", err);
    throw new functions.https.HttpsError("internal", err.message || "Error al vaciar chat.");
  }
});

// ============================================================================
// FASE 2B: WHATSAPP AUTOMATION, SCHEDULER, IDEMPOTENT QUEUE & WORKER
// ============================================================================
export * from './whatsappService';
import { 
  claimWhatsappQueueJob, 
  executeWhatsappQueueJob, 
  enqueueWhatsappJobIdempotent,
  generateDeterministicQueueId,
  WhatsappQueueItem 
} from './whatsappService';

/**
 * Scheduled Cloud Function: scheduledWhatsappAlertScheduler
 * Ejecuta cada 2 minutos en el backend para evaluar tutorías y eventos de agenda que
 * comenzarán en los próximos 30 minutos, generando trabajos idempotentes en whatsapp_queue.
 */
export const scheduledWhatsappAlertScheduler = onSchedule(
  {
    schedule: "every 2 minutes",
    timeZone: "Europe/Madrid",
    region: "europe-west1"
  },
  async () => {
    const now = new Date();
    console.log(`[scheduledWhatsappAlertScheduler] Ejecutando evaluador de recordatorios a las ${now.toISOString()}`);
    let queuedJobsCount = 0;

    try {
      // 1. Obtener configuración global de WhatsApp
      let appConfig: any = {};
      const configDoc = await db.collection('firestore_app_config').doc('main').get().catch(() => null);
      if (configDoc && configDoc.exists) {
        appConfig = configDoc.data() || {};
      }
      const adminPhone = appConfig.supportPhone || appConfig.adminPhone || process.env.ADMIN_WHATSAPP_PHONE || '';

      // 2. Evaluar Tutorías Confirmadas
      const tutoringSnap = await db.collection('firestore_tutoring_requests')
        .where('status', '==', 'confirmed')
        .get()
        .catch(() => null);

      if (tutoringSnap && !tutoringSnap.empty) {
        for (const tDoc of tutoringSnap.docs) {
          const req = tDoc.data();
          if (req.whatsappSent === true || !req.date || !req.time) continue;

          const cleanDate = String(req.date).split('T')[0];
          const eventDateTime = new Date(`${cleanDate}T${req.time}:00`);
          if (isNaN(eventDateTime.getTime())) continue;

          const diffMinutes = (eventDateTime.getTime() - now.getTime()) / (1000 * 60);

          if (diffMinutes > -15 && diffMinutes <= 30) {
            console.log(`[scheduledWhatsappAlertScheduler] Encolando recordatorio para tutoría ${tDoc.id} (${diffMinutes.toFixed(1)} min restantes)`);

            // Obtener teléfono del estudiante
            let studentPhone = '';
            let studentName = req.studentName || 'Estudiante';
            if (req.studentId) {
              const uDoc = await db.collection('firestore_users').doc(req.studentId).get().catch(() => null);
              if (uDoc && uDoc.exists) {
                studentPhone = uDoc.data()?.phone || '';
                studentName = uDoc.data()?.name || studentName;
              }
            }

            // Obtener teléfono del profesor
            let teacherPhone = '';
            let teacherName = req.teacherName || 'Docente';
            if (req.teacherId) {
              const teacherDoc = await db.collection('firestore_teachers').doc(req.teacherId).get().catch(() => null);
              if (teacherDoc && teacherDoc.exists) {
                teacherPhone = teacherDoc.data()?.phone || '';
                teacherName = teacherDoc.data()?.name || teacherName;
              } else {
                const uDoc = await db.collection('firestore_users').doc(req.teacherId).get().catch(() => null);
                if (uDoc && uDoc.exists) {
                  teacherPhone = uDoc.data()?.phone || '';
                  teacherName = uDoc.data()?.name || teacherName;
                }
              }
            }

            // A. Trabajo Determinista para el Estudiante
            if (studentPhone) {
              const job = await enqueueWhatsappJobIdempotent(db, {
                sourceType: 'tutoring',
                sourceId: tDoc.id,
                recipientRole: 'student',
                timeSlot: '30min',
                to: studentPhone,
                message: `⏰ ¡Hola ${studentName}! Recuerda que tu tutoría de ${req.subject || 'Clase'} comienza en 30 minutos (a las ${req.time}). Profesor: ${teacherName}. ¡Nos vemos en el aula!`
              });
              if (job.created) queuedJobsCount++;
            }

            // B. Trabajo Determinista para el Profesor
            if (teacherPhone) {
              const job = await enqueueWhatsappJobIdempotent(db, {
                sourceType: 'tutoring',
                sourceId: tDoc.id,
                recipientRole: 'teacher',
                timeSlot: '30min',
                to: teacherPhone,
                message: `⏰ ¡Hola ${teacherName}! Recuerda que tienes clase de tutoría de ${req.subject || 'Clase'} con ${studentName} en 30 minutos (a las ${req.time}).`
              });
              if (job.created) queuedJobsCount++;
            }

            // C. Trabajo Determinista para el Administrador
            if (adminPhone) {
              const job = await enqueueWhatsappJobIdempotent(db, {
                sourceType: 'tutoring',
                sourceId: tDoc.id,
                recipientRole: 'admin',
                timeSlot: '30min',
                to: adminPhone,
                message: `⏰ [Aviso Admin] Tutoría de ${req.subject || 'Clase'} entre el Alumno ${studentName} y el Profesor ${teacherName} comienza en 30 minutos (a las ${req.time}).`
              });
              if (job.created) queuedJobsCount++;
            }

            // Marcar whatsappSent como true en la tutoría
            await tDoc.ref.update({
              whatsappSent: true,
              whatsappQueuedAt: FieldValue.serverTimestamp()
            }).catch(console.error);
          }
        }
      }

      // 3. Evaluar Eventos de Agenda (Exámenes, Entregas, Clases)
      const agendaSnap = await db.collection('firestore_agenda_events').get().catch(() => null);
      if (agendaSnap && !agendaSnap.empty) {
        for (const evDoc of agendaSnap.docs) {
          const ev = evDoc.data();
          if (ev.whatsappSent === true || !ev.date) continue;

          const cleanDate = String(ev.date).split('T')[0];
          const eventTime = ev.time || '09:00';
          const eventDateTime = new Date(`${cleanDate}T${eventTime}:00`);
          if (isNaN(eventDateTime.getTime())) continue;

          const diffMinutes = (eventDateTime.getTime() - now.getTime()) / (1000 * 60);

          if (diffMinutes > -15 && diffMinutes <= 30) {
            console.log(`[scheduledWhatsappAlertScheduler] Encolando recordatorio para evento de agenda ${evDoc.id} (${diffMinutes.toFixed(1)} min restantes)`);

            let studentPhone = '';
            let studentName = 'Estudiante';
            let teacherPhone = '';
            let teacherName = '';

            if (ev.studentId) {
              const uDoc = await db.collection('firestore_users').doc(ev.studentId).get().catch(() => null);
              if (uDoc && uDoc.exists) {
                const uData = uDoc.data();
                studentPhone = uData?.phone || '';
                studentName = uData?.name || studentName;
                if (uData?.assignedTeacherId) {
                  const tDoc = await db.collection('firestore_teachers').doc(uData.assignedTeacherId).get().catch(() => null);
                  if (tDoc && tDoc.exists) {
                    teacherPhone = tDoc.data()?.phone || '';
                    teacherName = tDoc.data()?.name || '';
                  }
                }
              }
            }

            // A. Estudiante
            if (studentPhone) {
              const job = await enqueueWhatsappJobIdempotent(db, {
                sourceType: 'agenda',
                sourceId: evDoc.id,
                recipientRole: 'student',
                timeSlot: '30min',
                to: studentPhone,
                message: `⏰ ¡Hola ${studentName}! Recordatorio de tu Agenda: "${ev.title || 'Evento'}" está programado para hoy a las ${eventTime} (comienza en 30 minutos). ¡Muchos éxitos!`
              });
              if (job.created) queuedJobsCount++;
            }

            // B. Profesor asignado
            if (teacherPhone) {
              const job = await enqueueWhatsappJobIdempotent(db, {
                sourceType: 'agenda',
                sourceId: evDoc.id,
                recipientRole: 'teacher',
                timeSlot: '30min',
                to: teacherPhone,
                message: `⏰ ¡Hola ${teacherName}! Recordatorio de Agenda: El alumno ${studentName} tiene el evento "${ev.title || 'Evento'}" programado en 30 minutos (a las ${eventTime}).`
              });
              if (job.created) queuedJobsCount++;
            }

            // C. Administrador
            if (adminPhone) {
              const job = await enqueueWhatsappJobIdempotent(db, {
                sourceType: 'agenda',
                sourceId: evDoc.id,
                recipientRole: 'admin',
                timeSlot: '30min',
                to: adminPhone,
                message: `⏰ [Aviso Admin Agenda] Evento "${ev.title || 'Evento'}" del Alumno ${studentName} comienza en 30 minutos (a las ${eventTime}).`
              });
              if (job.created) queuedJobsCount++;
            }

            await evDoc.ref.update({
              whatsappSent: true,
              whatsappQueuedAt: FieldValue.serverTimestamp()
            }).catch(console.error);
          }
        }
      }

      console.log(`[scheduledWhatsappAlertScheduler] Finalizado. Total de trabajos encolados: ${queuedJobsCount}`);
      return { success: true, queuedJobsCount };
    } catch (err: any) {
      console.error("[scheduledWhatsappAlertScheduler] Error crítico:", err);
      throw err;
    }
  }
);

/**
 * Trigger Cloud Function: processPendingWhatsappQueueTrigger
 * Dispara el procesamiento de forma reactiva en cuanto un documento entra en whatsapp_queue en estado 'pending'.
 */
export const processPendingWhatsappQueueTrigger = onDocumentWritten(
  {
    region: "europe-west1",
    database: FIRESTORE_DATABASE_ID,
    document: "whatsapp_queue/{queueId}"
  },
  async (event) => {
    const queueId = event.params.queueId;
    const change = event.data;
    if (!change || !change.after.exists) return;

    const data = change.after.data() as WhatsappQueueItem;
    if (data.status !== 'pending' && data.status !== 'retry') return;

    const workerId = `trigger_${queueId}_${Date.now()}`;
    const claim = await claimWhatsappQueueJob(db, queueId, workerId);

    if (!claim.claimed || !claim.item) {
      return;
    }

    let appConfig: any = {};
    const configDoc = await db.collection('firestore_app_config').doc('main').get().catch(() => null);
    if (configDoc && configDoc.exists) {
      appConfig = configDoc.data();
    }

    await executeWhatsappQueueJob(db, claim.item, workerId, appConfig);
  }
);

/**
 * Scheduled Worker: scheduledWhatsappQueueWorker
 * Se ejecuta cada minuto como worker de respaldo y procesador de reintentos (retry) y locks caídos.
 */
export const scheduledWhatsappQueueWorker = onSchedule(
  {
    schedule: "every 1 minutes",
    timeZone: "Europe/Madrid",
    region: "europe-west1"
  },
  async () => {
    const now = new Date();
    const workerId = `worker_cron_${now.getTime()}`;
    console.log(`[scheduledWhatsappQueueWorker] Ejecutando worker de cola (${workerId})`);

    let appConfig: any = {};
    const configDoc = await db.collection('firestore_app_config').doc('main').get().catch(() => null);
    if (configDoc && configDoc.exists) {
      appConfig = configDoc.data();
    }

    // Procesar hasta 20 ítems pendientes o en retry
    const snap = await db.collection('whatsapp_queue')
      .where('status', 'in', ['pending', 'retry', 'processing'])
      .limit(20)
      .get()
      .catch(() => null);

    if (!snap || snap.empty) {
      return { success: true, processedCount: 0 };
    }

    let processedCount = 0;
    for (const docSnap of snap.docs) {
      const claim = await claimWhatsappQueueJob(db, docSnap.id, workerId, now);
      if (claim.claimed && claim.item) {
        await executeWhatsappQueueJob(db, claim.item, workerId, appConfig);
        processedCount++;
      }
    }

    console.log(`[scheduledWhatsappQueueWorker] Finalizado. Trabajos procesados: ${processedCount}`);
    return { success: true, processedCount };
  }
);

/**
 * Callable Function: adminCreateWhatsappJob
 * Permite a administradores verificados encolar o enviar un mensaje manual de WhatsApp de forma segura.
 */
export const adminCreateWhatsappJob = functions.region("europe-west1").https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Se requiere autenticación.");
  }
  const callerClaims = (context.auth.token || {}) as any;
  if (callerClaims.role !== 'admin') {
    throw new functions.https.HttpsError("permission-denied", "Operación exclusiva para administradores.");
  }

  const { to, message, recipientRole = 'student', sourceType = 'manual_admin', sourceId = 'admin_direct' } = data;
  if (!to || !message) {
    throw new functions.https.HttpsError("invalid-argument", "Se requiere 'to' y 'message'.");
  }

  try {
    const uniqueId = `manual_${context.auth.uid}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const docRef = db.collection('whatsapp_queue').doc(uniqueId);

    const newJob: WhatsappQueueItem = {
      queueId: uniqueId,
      to,
      message,
      recipientRole,
      sourceType,
      sourceId,
      status: 'pending',
      attemptCount: 0,
      maxAttempts: 3,
      lockedUntil: null,
      processingBy: null,
      providerMessageId: null,
      errorCode: null,
      lastError: null,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      nextAttemptAt: null
    };

    await docRef.set(newJob);

    return {
      success: true,
      queueId: uniqueId,
      message: `Mensaje encolado en backend con ID: ${uniqueId}`
    };
  } catch (err: any) {
    console.error("[adminCreateWhatsappJob] Error:", err);
    throw new functions.https.HttpsError("internal", err.message || "Error al encolar mensaje.");
  }
});

