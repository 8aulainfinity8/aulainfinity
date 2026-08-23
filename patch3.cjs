const fs = require('fs');
let content = fs.readFileSync('functions/index.ts', 'utf8');

const startIndex = content.indexOf('  async (event) => {\n    console.log(`[scheduledChatRetentionCleanup]');
const endIndexString = '/**\n * Callable Function: adminClearChatMessages';
const endIndex = content.indexOf(endIndexString);

if (startIndex === -1 || endIndex === -1) {
  console.error("Could not find start or end indices");
  process.exit(1);
}

const newImplementation = `  async (event) => {
    console.log(\`[scheduledChatRetentionCleanup] Iniciando tarea de retención de chats (límite: \${CHAT_RETENTION_DAYS} días).\`);
    const db = getFirestore(FIRESTORE_DATABASE_ID);
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

    // Campos temporales utilizados para consultas
    const parentDateFields = ['lastMessageTimestamp', 'updatedAt', 'createdAt'];
    const legacyDateFields = ['timestamp', 'createdAt'];
    
    // Evitar procesar dos veces el mismo documento mediante un Set de IDs
    const processedChats = new Set<string>();
    const processedOrphans = new Set<string>();

    try {
      // ---------------------------------------------------------
      // FASE 1: Limpieza de conversaciones padre y sus dependencias
      // ---------------------------------------------------------
      for (const colName of parentCollections) {
        const colRef = db.collection(colName);
        
        for (const dateField of parentDateFields) {
          let hasMore = true;
          let lastDoc = null;

          while (hasMore) {
            let q = colRef.where(dateField, '<', threshold)
                          .orderBy(dateField)
                          .limit(500);

            if (lastDoc) {
              q = q.startAfter(lastDoc);
            }

            const snapshot = await q.get().catch((err) => {
              console.error(\`[scheduledChatRetentionCleanup] Query error on \${colName} (\${dateField}):\`, err);
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
              const globalId = \`\${colName}/\${chatId}\`;
              
              if (processedChats.has(globalId)) {
                continue;
              }
              processedChats.add(globalId);

              console.log(\`[scheduledChatRetentionCleanup] Chat caducado detectado en \${globalId} por campo \${dateField}\`);
              
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
              const targetIds = [chatId, chatId.replace(/^direct_/, ''), \`direct_\${chatId}\`];
              for (const legacyCol of legacyCollections) {
                for (const tid of targetIds) {
                  const legacySnap = await db.collection(legacyCol).where('conversationId', '==', tid).get().catch(() => null);
                  if (legacySnap && !legacySnap.empty) {
                    for (const mDoc of legacySnap.docs) {
                      const mGlobalId = \`\${legacyCol}/\${mDoc.id}\`;
                      processedOrphans.add(mGlobalId); // Marcar para no re-procesarlo en la Fase 2
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

            // Esperar a que se completen las eliminaciones de este lote antes de continuar
            await bulkWriter.close();
          }
        }
      }

      // ---------------------------------------------------------
      // FASE 2: Limpieza de mensajes legacy huérfanos (Caso B)
      // ---------------------------------------------------------
      for (const legacyCol of legacyCollections) {
        const legacyRef = db.collection(legacyCol);
        
        for (const dateField of legacyDateFields) {
          let hasMore = true;
          let lastDoc = null;

          while (hasMore) {
            let q = legacyRef.where(dateField, '<', threshold)
                             .orderBy(dateField)
                             .limit(500);

            if (lastDoc) {
              q = q.startAfter(lastDoc);
            }

            const snapshot = await q.get().catch((err) => {
              console.error(\`[scheduledChatRetentionCleanup] Query error on orphans \${legacyCol} (\${dateField}):\`, err);
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
              const globalId = \`\${legacyCol}/\${msgId}\`;
              
              if (processedOrphans.has(globalId)) {
                continue;
              }
              processedOrphans.add(globalId);

              bulkWriter.delete(docSnap.ref);
              deletedMessagesCount++;
            }

            await bulkWriter.close();
          }
        }
      }

      console.log(\`[scheduledChatRetentionCleanup] Tarea finalizada con éxito. Conversaciones borradas: \${deletedConversationsCount}, Mensajes/Docs borrados: \${deletedMessagesCount}\`);
      return { success: true, deletedConversationsCount, deletedMessagesCount };
    } catch (error) {
      console.error("[scheduledChatRetentionCleanup] Error crítico en tarea programada:", error);
      throw error;
    }
  });

`;

const finalContent = content.substring(0, startIndex) + newImplementation + content.substring(endIndex);
fs.writeFileSync('functions/index.ts', finalContent, 'utf8');
