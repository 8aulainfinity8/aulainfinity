/**
 * Backend Cloud Functions para AulaInfinity
 */

import * as functions from "firebase-functions";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import * as admin from 'firebase-admin';
import { GoogleGenAI, GenerateContentResponse } from "@google/genai";

if (!admin.apps.length) {
  admin.initializeApp();
}

// Inicializa Gemini con la clave desde la configuración segura de Firebase
const getAi = () => new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || functions.config().gemini?.key || '' });

const systemInstruction = "Si generas contenido que involucre dinero, debes usar Euros (€) como la moneda. Para cualquier notación matemática, no uses LaTeX delimitado (como $...$ o \\(...\\)). En su lugar, usa caracteres Unicode (por ejemplo, x², √2, ≠) o MathML cuando sea apropiado para fórmulas complejas.";

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
});

/**
 * Callable Function exclusiva para Administradores verificados para asignar roles o aprobar profesores.
 * La autorización depende estrictamente del Custom Claim role === 'admin'.
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

    // Sincronizar también en Firestore utilizando Admin SDK
    const db = admin.firestore();
    const updateData: any = {
      role: role,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
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
    const db = admin.firestore();
    const threshold = new Date();
    threshold.setDate(threshold.getDate() - CHAT_RETENTION_DAYS);
    let deletedConversationsCount = 0;
    let deletedMessagesCount = 0;

    const collectionsToCheck = [
      "chats",
      "conversations",
      "firestore_conversations",
      "firestore_peer_conversations",
      "firestore_teacher_conversations"
    ];

    try {
      const bulkWriter = db.bulkWriter();
      bulkWriter.onWriteError((error) => {
        if (error.failedAttempts < 3) {
          return true; // Retry up to 3 times
        }
        console.warn('BulkWriter error:', error);
        return false;
      });

      for (const colName of collectionsToCheck) {
        const colRef = db.collection(colName);
        
        // Paginating through the collection by querying where lastMessageTimestamp < threshold
        // To be safe with possible missing fields or different timestamp types, we will just use 
        // a basic query on lastMessageTimestamp if possible, but the schema might not be uniform.
        // Let's get all documents incrementally in chunks using limit() to prevent OOM
        let lastDoc = null;
        let hasMore = true;
        while (hasMore) {
          let q = colRef.limit(500);
          if (lastDoc) {
            q = q.startAfter(lastDoc);
          }
          const snapshot = await q.get().catch(() => null);
          if (!snapshot || snapshot.empty) {
            hasMore = false;
            break;
          }
          lastDoc = snapshot.docs[snapshot.docs.length - 1];

          for (const docSnap of snapshot.docs) {
            const data = docSnap.data();
            const timestampVal = data.lastMessageTimestamp || data.updatedAt || data.createdAt;
            let dateToCheck = null;

            if (timestampVal) {
              if (typeof timestampVal.toDate === 'function') {
                dateToCheck = timestampVal.toDate();
              } else if (timestampVal instanceof Date) {
                dateToCheck = timestampVal;
              } else if (typeof timestampVal === 'number' || typeof timestampVal === 'string') {
                dateToCheck = new Date(timestampVal);
              }
            }

            if (dateToCheck && dateToCheck < threshold) {
              const chatId = docSnap.id;
              console.log(`[scheduledChatRetentionCleanup] Chat caducado detectado en ${colName}/${chatId} (actividad: ${dateToCheck.toISOString()})`);
              
              // 1. Eliminar subcolecciones (messages, signal, documents)
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
              
              // 2. Eliminar referencias huérfanas en legacy
              const targetIds = [chatId, chatId.replace(/^direct_/, ''), `direct_${chatId}`];
              const legacyCollections = ['firestore_direct_messages', 'firestore_peer_messages', 'firestore_teacher_messages', 'firestore_course_messages'];
              for (const legacyCol of legacyCollections) {
                for (const tid of targetIds) {
                  const legacySnap = await db.collection(legacyCol).where('conversationId', '==', tid).get().catch(() => null);
                  if (legacySnap && !legacySnap.empty) {
                    for (const mDoc of legacySnap.docs) {
                      bulkWriter.delete(mDoc.ref);
                      deletedMessagesCount++;
                    }
                  }
                }
              }

              // 3. Eliminar documento de la conversación
              bulkWriter.delete(docSnap.ref);
              deletedConversationsCount++;
            }
          }
        }
      }
      
      await bulkWriter.close();
      console.log(`[scheduledChatRetentionCleanup] Tarea finalizada con éxito. Conversaciones borradas: ${deletedConversationsCount}, Mensajes/Docs borrados: ${deletedMessagesCount}`);
      return { success: true, deletedConversationsCount, deletedMessagesCount };
    } catch (error) {
      console.error("[scheduledChatRetentionCleanup] Error crítico en tarea programada:", error);
      throw error;
    }
  });


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

  const db = admin.firestore();
  let deletedMessagesCount = 0;
  try {
    const bulkWriter = db.bulkWriter();
    bulkWriter.onWriteError((error) => {
      if (error.failedAttempts < 3) return true;
      return false;
    });
    
    // Identificadores posibles
    const targetIds = [conversationId, conversationId.replace(/^direct_/, ''), `direct_${conversationId}`];
    
    for (const tid of targetIds) {
      // Limpiar subcolecciones
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
    
    // Limpiar colecciones legacy
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
    
    // Actualizar metadatos de conversación padre para quitar lastMessageText
    for (const colName of ["chats", "conversations", "firestore_conversations", "firestore_peer_conversations", "firestore_teacher_conversations"]) {
      for (const tid of targetIds) {
        // En lugar de borrar la conversación, la limpiamos
        const convRef = db.collection(colName).doc(tid);
        bulkWriter.update(convRef, {
          lastMessageText: '',
          // Mantenemos lastMessageTimestamp para que la política de retención la elimine naturalmente
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

