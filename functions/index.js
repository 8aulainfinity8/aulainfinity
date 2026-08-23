"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var index_exports = {};
__export(index_exports, {
  CHAT_RETENTION_DAYS: () => CHAT_RETENTION_DAYS,
  FIRESTORE_DATABASE_ID: () => FIRESTORE_DATABASE_ID,
  adminClearChatMessages: () => adminClearChatMessages,
  adminSetUserClaims: () => adminSetUserClaims,
  callSimpleAI: () => callSimpleAI,
  callTutorAI: () => callTutorAI,
  getEffectiveActivityTimestamp: () => getEffectiveActivityTimestamp,
  scheduledChatRetentionCleanup: () => scheduledChatRetentionCleanup,
  syncUserRole: () => syncUserRole,
  toValidDate: () => toValidDate
});
module.exports = __toCommonJS(index_exports);
var functions = __toESM(require("firebase-functions"));
var import_firestore = require("firebase-functions/v2/firestore");
var import_scheduler = require("firebase-functions/v2/scheduler");
var admin = __toESM(require("firebase-admin"));
var import_firestore2 = require("firebase-admin/firestore");
var import_genai = require("@google/genai");
if (!admin.apps.length) {
  admin.initializeApp();
}
const FIRESTORE_DATABASE_ID = "ai-studio-aulainfinity-6be7791f-ef3e-4fc4-b45b-98918b1b57ca";
const db = (0, import_firestore2.getFirestore)(admin.app(), FIRESTORE_DATABASE_ID);
const getAi = () => new import_genai.GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || functions.config().gemini?.key || "" });
const systemInstruction = "Si generas contenido que involucre dinero, debes usar Euros (\u20AC) como la moneda. Para cualquier notaci\xF3n matem\xE1tica, no uses LaTeX delimitado (como $...$ o \\(...\\)). En su lugar, usa caracteres Unicode (por ejemplo, x\xB2, \u221A2, \u2260) o MathML cuando sea apropiado para f\xF3rmulas complejas.";
function toValidDate(value) {
  if (value === null || value === void 0) return null;
  if (value instanceof Date) {
    return isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === "object" && value !== null) {
    if (typeof value.toDate === "function") {
      try {
        const d = value.toDate();
        return d instanceof Date && !isNaN(d.getTime()) ? d : null;
      } catch {
        return null;
      }
    }
    if (typeof value.seconds === "number") {
      const d = new Date(value.seconds * 1e3);
      return isNaN(d.getTime()) ? null : d;
    }
  }
  if (typeof value === "number") {
    if (isNaN(value) || value <= 0) return null;
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const d = new Date(trimmed);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}
function getEffectiveActivityTimestamp(data) {
  if (!data || typeof data !== "object") return null;
  const lastMsg = toValidDate(data.lastMessageTimestamp);
  if (lastMsg) return lastMsg;
  const updated = toValidDate(data.updatedAt);
  if (updated) return updated;
  const created = toValidDate(data.createdAt);
  if (created) return created;
  return null;
}
const syncUserRole = (0, import_firestore.onDocumentWritten)(
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
      let userRecord;
      try {
        userRecord = await admin.auth().getUser(userId);
      } catch (authError) {
        if (authError.code === "auth/user-not-found") {
          console.log(`[syncUserRole] Usuario ${userId} no existe en Auth.`);
          return;
        }
        throw authError;
      }
      const existingClaims = userRecord.customClaims || {};
      if (!newData) {
        console.log(`[syncUserRole] Documento firestore_users/${userId} eliminado. Revocando claims privilegiadas.`);
        const cleanedClaims = {
          ...existingClaims,
          role: "student",
          isAdmin: false,
          isApprovedForTutoring: false
        };
        await admin.auth().setCustomUserClaims(userId, cleanedClaims);
        return;
      }
      let targetRole = newData.role || "student";
      let isApprovedForTutoring = Boolean(newData.isApprovedForTutoring);
      let isAdmin = Boolean(newData.isAdmin);
      const wasAdmin = oldData?.role === "admin" || oldData?.isAdmin === true || existingClaims.role === "admin";
      const wasTeacher = oldData?.role === "teacher" || existingClaims.role === "teacher" || wasAdmin;
      const wasApproved = oldData?.isApprovedForTutoring === true || existingClaims.isApprovedForTutoring === true || wasAdmin;
      if (targetRole === "admin" || isAdmin) {
        if (!wasAdmin) {
          console.warn(`[syncUserRole] Bloqueada escalaci\xF3n no autorizada a admin para ${userId}`);
          targetRole = oldData?.role || existingClaims.role || "student";
          isAdmin = false;
        } else {
          isAdmin = true;
        }
      }
      if (targetRole === "teacher") {
        if (!wasTeacher) {
          console.warn(`[syncUserRole] Bloqueada escalaci\xF3n no autorizada a teacher para ${userId}. Debe ser aprobada por admin.`);
          targetRole = oldData?.role || existingClaims.role || "student";
        }
      }
      if (targetRole === "teacher" && isApprovedForTutoring) {
        if (!wasApproved) {
          console.warn(`[syncUserRole] Bloqueada auto-aprobaci\xF3n de tutor\xEDa para ${userId}`);
          isApprovedForTutoring = false;
        }
      }
      const updatedClaims = {
        ...existingClaims,
        role: targetRole,
        isAdmin: targetRole === "admin" || isAdmin,
        isApprovedForTutoring: targetRole === "admin" ? true : targetRole === "teacher" ? isApprovedForTutoring : false
      };
      await admin.auth().setCustomUserClaims(userId, updatedClaims);
      console.log(`[syncUserRole] Custom claims actualizados con \xE9xito para ${userId}:`, updatedClaims);
    } catch (err) {
      console.error(`[syncUserRole] Error al actualizar custom claims para ${userId}:`, err);
    }
  }
);
const adminSetUserClaims = functions.region("europe-west1").https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Se requiere autenticaci\xF3n.");
  }
  const callerClaims = context.auth.token || {};
  const isCallerAdmin = callerClaims.role === "admin";
  if (!isCallerAdmin) {
    console.warn(`[adminSetUserClaims] Intento de acceso no autorizado por UID: ${context.auth.uid}`);
    throw new functions.https.HttpsError("permission-denied", "Solo un administrador con claim verificado puede modificar permisos de usuario.");
  }
  const { targetUid, role, isApprovedForTutoring, isAdmin } = data;
  if (!targetUid || !role) {
    throw new functions.https.HttpsError("invalid-argument", "Se requiere targetUid y role.");
  }
  if (!["student", "teacher", "admin"].includes(role)) {
    throw new functions.https.HttpsError("invalid-argument", "Rol inv\xE1lido especificado.");
  }
  try {
    const userRecord = await admin.auth().getUser(targetUid);
    const existingClaims = userRecord.customClaims || {};
    const newClaims = {
      ...existingClaims,
      role,
      isAdmin: role === "admin" || Boolean(isAdmin),
      isApprovedForTutoring: role === "admin" ? true : role === "teacher" ? Boolean(isApprovedForTutoring) : false
    };
    await admin.auth().setCustomUserClaims(targetUid, newClaims);
    console.log(`[adminSetUserClaims] Admin ${context.auth.uid} actualiz\xF3 claims para ${targetUid}:`, newClaims);
    const updateData = {
      role,
      updatedAt: import_firestore2.FieldValue.serverTimestamp(),
      updatedByAdminUid: context.auth.uid
    };
    if (role === "teacher") {
      updateData.isApprovedForTutoring = Boolean(isApprovedForTutoring);
    }
    if (role === "admin") {
      updateData.isAdmin = true;
      updateData.isApprovedForTutoring = true;
    }
    await db.collection("firestore_users").doc(targetUid).set(updateData, { merge: true });
    await db.collection("users").doc(targetUid).set(updateData, { merge: true });
    return { success: true, targetUid, claims: newClaims, updatedBy: context.auth.uid };
  } catch (err) {
    console.error("[adminSetUserClaims] Error:", err);
    throw new functions.https.HttpsError("internal", err.message || "Error al actualizar permisos.");
  }
});
const callTutorAI = functions.region("europe-west1").https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "El usuario debe estar autenticado para usar el Tutor IA.");
  }
  const history = data.history;
  const image = data.image;
  if (!history || !Array.isArray(history)) {
    throw new functions.https.HttpsError("invalid-argument", "El historial del chat es requerido.");
  }
  const formattedHistory = history.slice(0, -1).map((msg) => ({
    role: msg.role,
    parts: [{ text: msg.text }]
  }));
  const lastMessage = history[history.length - 1];
  const lastMessageParts = [{ text: lastMessage.text }];
  if (image) {
    lastMessageParts.unshift({
      inlineData: {
        mimeType: image.mimeType,
        data: image.data
      }
    });
  }
  const contents = [...formattedHistory, { role: "user", parts: lastMessageParts }];
  try {
    const ai = getAi();
    const result = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents,
      config: {
        systemInstruction
      }
    });
    return { text: result.text };
  } catch (error) {
    console.error("Error llamando a la API de Gemini:", error);
    throw new functions.https.HttpsError("internal", "Error al comunicarse con el modelo de IA.");
  }
});
const callSimpleAI = functions.region("europe-west1").https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "El usuario debe estar autenticado.");
  }
  const prompt = data.prompt;
  if (!prompt || typeof prompt !== "string") {
    throw new functions.https.HttpsError("invalid-argument", "Se requiere un prompt de texto.");
  }
  try {
    const ai = getAi();
    const result = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        systemInstruction
      }
    });
    return { text: result.text };
  } catch (error) {
    console.error("Error llamando a la API de Gemini:", error);
    throw new functions.https.HttpsError("internal", "Error al procesar la solicitud con IA.");
  }
});
const CHAT_RETENTION_DAYS = 30;
const scheduledChatRetentionCleanup = (0, import_scheduler.onSchedule)(
  {
    schedule: "0 2 * * *",
    // Todos los días a las 02:00 AM
    region: "europe-west1",
    database: "ai-studio-aulainfinity-6be7791f-ef3e-4fc4-b45b-98918b1b57ca"
  },
  async (event) => {
    console.log(`[scheduledChatRetentionCleanup] Iniciando tarea de retenci\xF3n de chats (l\xEDmite: ${CHAT_RETENTION_DAYS} d\xEDas).`);
    const threshold = /* @__PURE__ */ new Date();
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
      "firestore_direct_messages",
      "firestore_peer_messages",
      "firestore_teacher_messages",
      "firestore_course_messages"
    ];
    const parentDateFields = ["lastMessageTimestamp", "updatedAt", "createdAt"];
    const processedChats = /* @__PURE__ */ new Set();
    const processedOrphans = /* @__PURE__ */ new Set();
    try {
      for (const colName of parentCollections) {
        const colRef = db.collection(colName);
        for (const dateField of parentDateFields) {
          let hasMore = true;
          let lastDoc = null;
          while (hasMore) {
            let q = colRef.where(dateField, "<", threshold).orderBy(dateField).limit(500);
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
              if (!dateToCheck || dateToCheck >= threshold) {
                console.log(`[scheduledChatRetentionCleanup] Chat ${globalId} OMITIDO. Actividad efectiva reciente (${dateToCheck ? dateToCheck.toISOString() : "sin fecha v\xE1lida"}).`);
                continue;
              }
              if (dateToCheck < threshold) {
                console.log(`[scheduledChatRetentionCleanup] Chat caducado CONFIRMADO en ${globalId} (fecha efectiva: ${dateToCheck.toISOString()})`);
              }
              const subcols = ["messages", "signal", "documents"];
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
              const targetIds = [chatId, chatId.replace(/^direct_/, ""), `direct_${chatId}`];
              for (const legacyCol of legacyCollections) {
                for (const tid of targetIds) {
                  const legacySnap = await db.collection(legacyCol).where("conversationId", "==", tid).get().catch(() => null);
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
              bulkWriter.delete(docSnap.ref);
              deletedConversationsCount++;
            }
            await bulkWriter.close();
          }
        }
      }
      for (const legacyCol of legacyCollections) {
        const legacyRef = db.collection(legacyCol);
        let hasMore = true;
        let lastDoc = null;
        while (hasMore) {
          let q = legacyRef.where("createdAt", "<", threshold).orderBy("createdAt").limit(500);
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
      console.log(`[scheduledChatRetentionCleanup] Tarea finalizada con \xE9xito. Conversaciones borradas: ${deletedConversationsCount}, Mensajes/Docs borrados: ${deletedMessagesCount}`);
      return { success: true, deletedConversationsCount, deletedMessagesCount };
    } catch (error) {
      console.error("[scheduledChatRetentionCleanup] Error cr\xEDtico en tarea programada:", error);
      throw error;
    }
  }
);
const adminClearChatMessages = functions.region("europe-west1").https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Se requiere autenticaci\xF3n.");
  }
  const callerClaims = context.auth.token || {};
  const isCallerAdmin = callerClaims.role === "admin";
  if (!isCallerAdmin) {
    throw new functions.https.HttpsError("permission-denied", "Operaci\xF3n exclusiva para administradores.");
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
    const targetIds = [conversationId, conversationId.replace(/^direct_/, ""), `direct_${conversationId}`];
    for (const tid of targetIds) {
      const subcollections = ["messages", "signal", "documents"];
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
    const legacyCollections = ["firestore_direct_messages", "firestore_peer_messages", "firestore_teacher_messages", "firestore_course_messages"];
    for (const legacyCol of legacyCollections) {
      for (const tid of targetIds) {
        const legacySnap = await db.collection(legacyCol).where("conversationId", "==", tid).get().catch(() => null);
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
          lastMessageText: ""
        });
      }
    }
    await bulkWriter.close();
    return { success: true, clearedCount: deletedMessagesCount };
  } catch (err) {
    console.error("[adminClearChatMessages] Error:", err);
    throw new functions.https.HttpsError("internal", err.message || "Error al vaciar chat.");
  }
});
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  CHAT_RETENTION_DAYS,
  FIRESTORE_DATABASE_ID,
  adminClearChatMessages,
  adminSetUserClaims,
  callSimpleAI,
  callTutorAI,
  getEffectiveActivityTimestamp,
  scheduledChatRetentionCleanup,
  syncUserRole,
  toValidDate
});
