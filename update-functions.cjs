const fs = require('fs');
let code = fs.readFileSync('functions/index.ts', 'utf8');

const scheduledFunctionRegex = /export const scheduledChatRetentionCleanup = onSchedule\([\s\S]*?\n  \}\n\);\n/g;

const newScheduledFunction = `export const scheduledChatRetentionCleanup = onSchedule(
  {
    schedule: "0 2 * * *", // Todos los días a las 02:00 AM
    region: "europe-west1",
    database: "ai-studio-aulainfinity-6be7791f-ef3e-4fc4-b45b-98918b1b57ca",
  },
  async (event) => {
    console.log(\`[scheduledChatRetentionCleanup] Iniciando tarea de retención de chats (límite: \${CHAT_RETENTION_DAYS} días).\`);
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
              console.log(\`[scheduledChatRetentionCleanup] Chat caducado detectado en \${colName}/\${chatId} (actividad: \${dateToCheck.toISOString()})\`);
              
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
              const targetIds = [chatId, chatId.replace(/^direct_/, ''), \`direct_\${chatId}\`];
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
      console.log(\`[scheduledChatRetentionCleanup] Tarea finalizada con éxito. Conversaciones borradas: \${deletedConversationsCount}, Mensajes/Docs borrados: \${deletedMessagesCount}\`);
      return { success: true, deletedConversationsCount, deletedMessagesCount };
    } catch (error) {
      console.error("[scheduledChatRetentionCleanup] Error crítico en tarea programada:", error);
      throw error;
    }
  });
`;

const newCallableFunction = `
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
    const targetIds = [conversationId, conversationId.replace(/^direct_/, ''), \`direct_\${conversationId}\`];
    
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
`;

code = code.replace(scheduledFunctionRegex, newScheduledFunction + '\n' + newCallableFunction);

fs.writeFileSync('functions/index.ts', code);
console.log('done functions');
