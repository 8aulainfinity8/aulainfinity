const fs = require('fs');
let content = fs.readFileSync('functions/index.ts', 'utf8');

// Chunk 1
content = content.replace(
`import * as admin from 'firebase-admin';
import { GoogleGenAI, GenerateContentResponse } from "@google/genai";

if (!admin.apps.length) {
  admin.initializeApp();
}`,
`import * as admin from 'firebase-admin';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { GoogleGenAI, GenerateContentResponse } from "@google/genai";

if (!admin.apps.length) {
  admin.initializeApp();
}

const FIRESTORE_DATABASE_ID = "ai-studio-aulainfinity-6be7791f-ef3e-4fc4-b45b-98918b1b57ca";`
);

// Chunk 2
content = content.replace(
`    // Sincronizar también en Firestore utilizando Admin SDK
    const db = admin.firestore();
    const updateData: any = {
      role: role,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedByAdminUid: context.auth.uid
    };`,
`    // Sincronizar también en Firestore utilizando Admin SDK
    const db = getFirestore(admin.app(), FIRESTORE_DATABASE_ID);
    const updateData: any = {
      role: role,
      updatedAt: FieldValue.serverTimestamp(),
      updatedByAdminUid: context.auth.uid
    };`
);

// Chunk 3
content = content.replace(
`  async (event) => {
    console.log(\`[scheduledChatRetentionCleanup] Iniciando tarea de retención de chats (límite: \${CHAT_RETENTION_DAYS} días).\`);
    const db = admin.firestore();
    const threshold = new Date();`,
`  async (event) => {
    console.log(\`[scheduledChatRetentionCleanup] Iniciando tarea de retención de chats (límite: \${CHAT_RETENTION_DAYS} días).\`);
    const db = getFirestore(admin.app(), FIRESTORE_DATABASE_ID);
    const threshold = new Date();`
);

// Chunk 4
content = content.replace(
`      for (const colName of collectionsToCheck) {
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
      
      await bulkWriter.close();`,
`      for (const colName of collectionsToCheck) {
        const colRef = db.collection(colName);
        
        let hasMore = true;
        let lastDoc = null;

        while (hasMore) {
          let q = colRef.where('lastMessageTimestamp', '<', threshold)
                        .orderBy('lastMessageTimestamp')
                        .limit(500);

          if (lastDoc) {
            q = q.startAfter(lastDoc);
          }

          const snapshot = await q.get().catch((err) => {
            console.error(\`[scheduledChatRetentionCleanup] Query error on \${colName}:\`, err);
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
            console.log(\`[scheduledChatRetentionCleanup] Chat caducado detectado en \${colName}/\${chatId}\`);
            
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

          // Esperar a que se completen las eliminaciones de este lote antes de continuar
          await bulkWriter.close();
        }
      }`
);

// Chunk 5
content = content.replace(
`  const { conversationId } = data;
  if (!conversationId) {
    throw new functions.https.HttpsError("invalid-argument", "Se requiere conversationId.");
  }

  const db = admin.firestore();
  let deletedMessagesCount = 0;`,
`  const { conversationId } = data;
  if (!conversationId) {
    throw new functions.https.HttpsError("invalid-argument", "Se requiere conversationId.");
  }

  const db = getFirestore(admin.app(), FIRESTORE_DATABASE_ID);
  let deletedMessagesCount = 0;`
);

fs.writeFileSync('functions/index.ts', content, 'utf8');
console.log('Patched functions/index.ts successfully.');
