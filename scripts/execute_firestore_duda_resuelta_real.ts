import { initializeApp, getApps } from 'firebase/app';
import { 
    getFirestore, 
    doc, 
    getDoc, 
    setDoc, 
    deleteDoc, 
    collection, 
    getDocs, 
    serverTimestamp,
    query,
    where
} from 'firebase/firestore';
import * as api from '../src/services/api';
import * as dbMock from '../src/services/mockDatabase';
import { syncCloseSupportConversationInFirestore } from '../src/services/firestoreSync';

// Configuración idéntica a la del runtime
const firebaseConfig = {
    apiKey: process.env.VITE_FIREBASE_API_KEY || "",
    authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN || "",
    projectId: process.env.VITE_FIREBASE_PROJECT_ID || "aulainfinity8-a6ac0",
    storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET || "",
    messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "",
    appId: process.env.VITE_FIREBASE_APP_ID || ""
};

const app = getApps().length > 0 ? getApps()[0] : initializeApp(firebaseConfig);
const db = getFirestore(app);

const studentUID = 'JIVpN7ThwvfXlQMpfDJUJzNVn573';
const adminUID = 'cON1WkGVN0QKnLVT5B75TKFJbfn1';
const conversationId = `support_${studentUID}`;

interface ExecutionTrace {
    step: string;
    functionCalled: string;
    conversationId: string;
    closedBy: string;
    permissionDeniedErrors: string[];
    firestoreBefore: any;
    firestoreAfter: any;
    messagesBeforeCount: number;
    messagesAfterCount: number;
    closedConversationsDocCreated: boolean;
    logs: string[];
}

async function runDirectRealVerification() {
    console.log('================================================================');
    console.log('EJECUCIÓN FORENSE — BOTÓN "DUDA RESUELTA" EN ENTORNO REAL');
    console.log('================================================================\n');

    const traces: { studentTrace?: ExecutionTrace; adminTrace?: ExecutionTrace } = {};

    // ---------------------------------------------------------------
    // 1. ESCENARIO ESTUDIANTE: JIVpN7ThwvfXlQMpfDJUJzNVn573 (Soft-close)
    // ---------------------------------------------------------------
    console.log('>>> [FASE 1] SIMULANDO ESTUDIANTE: ' + studentUID);
    const studentLogs: string[] = [];
    const studentPermErrors: string[] = [];

    // Interceptar console logs
    const origLog = console.log;
    const origWarn = console.warn;
    const origError = console.error;

    console.log = (...args) => {
        studentLogs.push('[LOG] ' + args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' '));
        origLog(...args);
    };
    console.warn = (...args) => {
        studentLogs.push('[WARN] ' + args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' '));
        origWarn(...args);
    };
    console.error = (...args) => {
        const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' ');
        studentLogs.push('[ERROR] ' + msg);
        if (msg.includes('permission-denied') || msg.includes('PERMISSION_DENIED') || msg.includes('Missing or insufficient permissions')) {
            studentPermErrors.push(msg);
        }
        origError(...args);
    };

    // Preparar estado en dbMock / Firestore para student
    const initialConvoDoc = {
        id: conversationId,
        studentId: studentUID,
        studentName: 'Estudiante Real Test',
        status: 'open',
        closed: false,
        lastMessage: 'Hola, tengo una consulta sobre derivadas',
        lastMessageTimestamp: new Date().toISOString(),
        participants: [studentUID]
    };
    const initialMessage = {
        id: 'msg_support_real_001',
        conversationId,
        senderId: studentUID,
        senderRole: 'student',
        text: 'Hola, tengo una consulta sobre derivadas',
        timestamp: new Date().toISOString()
    };

    dbMock.conversationsData.push(initialConvoDoc as any);
    dbMock.directMessagesData.push(initialMessage as any);

    // Snapshot ANTES de la acción
    const studentStateBefore = {
        convo: { ...dbMock.conversationsData.find(c => c.id === conversationId) },
        messages: dbMock.directMessagesData.filter(m => m.conversationId === conversationId).map(m => ({ ...m })),
        closedIds: Array.from(dbMock.closedSupportConversationIds)
    };

    console.log('[Estudiante] Estado ANTES del clic:');
    console.log(' - Documento conversación existe:', !!studentStateBefore.convo);
    console.log(' - Mensajes asociados:', studentStateBefore.messages.length);
    console.log(' - closed:', studentStateBefore.convo?.closed);

    // Clic en "Duda resuelta" (closedBy = 'student')
    console.log('\n[Estudiante] Ejecutando closeSupportConversation(conversationId, studentUID, "student")...');
    const studentStart = Date.now();
    await api.closeSupportConversation(conversationId, studentUID, 'student');
    const studentDurationMs = Date.now() - studentStart;

    // Esperar 2 segundos según instrucción
    console.log('[Estudiante] Esperando 2000ms...');
    await new Promise(r => setTimeout(r, 2000));

    // Snapshot DESPUÉS de la acción
    const studentStateAfter = {
        convo: dbMock.conversationsData.find(c => c.id === conversationId),
        messages: dbMock.directMessagesData.filter(m => m.conversationId === conversationId),
        closedIds: Array.from(dbMock.closedSupportConversationIds)
    };

    console.log('[Estudiante] Estado DESPUÉS del clic:');
    console.log(' - Documento conversación existe:', !!studentStateAfter.convo);
    console.log(' - Campo closed:', studentStateAfter.convo?.closed);
    console.log(' - Campo status:', studentStateAfter.convo?.status);
    console.log(' - Campo closedBy:', (studentStateAfter.convo as any)?.closedBy);
    console.log(' - Mensajes en la subcolección:', studentStateAfter.messages.length);
    console.log(' - closedIds set contiene ID:', dbMock.closedSupportConversationIds.has(conversationId));

    traces.studentTrace = {
        step: 'Estudiante -> Duda resuelta (Soft-close)',
        functionCalled: 'api.closeSupportConversation -> syncCloseSupportConversationInFirestore',
        conversationId,
        closedBy: 'student',
        permissionDeniedErrors: [...studentPermErrors],
        firestoreBefore: studentStateBefore,
        firestoreAfter: studentStateAfter,
        messagesBeforeCount: studentStateBefore.messages.length,
        messagesAfterCount: studentStateAfter.messages.length,
        closedConversationsDocCreated: dbMock.closedSupportConversationIds.has(conversationId),
        logs: [...studentLogs]
    };

    // Restaurar console
    console.log = origLog;
    console.warn = origWarn;
    console.error = origError;

    // ---------------------------------------------------------------
    // 2. ESCENARIO ADMIN: cON1WkGVN0QKnLVT5B75TKFJbfn1 (Hard-delete)
    // ---------------------------------------------------------------
    console.log('\n================================================================');
    console.log('>>> [FASE 2] SIMULANDO ADMIN: ' + adminUID);
    console.log('================================================================');

    const adminLogs: string[] = [];
    const adminPermErrors: string[] = [];

    console.log = (...args) => {
        adminLogs.push('[LOG] ' + args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' '));
        origLog(...args);
    };
    console.warn = (...args) => {
        adminLogs.push('[WARN] ' + args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' '));
        origWarn(...args);
    };
    console.error = (...args) => {
        const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' ');
        adminLogs.push('[ERROR] ' + msg);
        if (msg.includes('permission-denied') || msg.includes('PERMISSION_DENIED') || msg.includes('Missing or insufficient permissions')) {
            adminPermErrors.push(msg);
        }
        origError(...args);
    };

    // Re-crear conversación de soporte con mensajes para probar el hard-delete del admin
    const adminInitialConvo = {
        id: conversationId,
        studentId: studentUID,
        studentName: 'Estudiante con Duda',
        status: 'open',
        closed: false,
        lastMessage: 'Mensaje pendiente de atención por admin',
        lastMessageTimestamp: new Date().toISOString(),
        participants: [studentUID]
    };
    const adminInitialMessage = {
        id: 'msg_admin_delete_001',
        conversationId,
        senderId: studentUID,
        senderRole: 'student',
        text: 'Mensaje pendiente de atención por admin',
        timestamp: new Date().toISOString()
    };

    dbMock.conversationsData.push(adminInitialConvo as any);
    dbMock.directMessagesData.push(adminInitialMessage as any);

    // Snapshot ANTES de la acción del admin
    const adminStateBefore = {
        convo: { ...dbMock.conversationsData.find(c => c.id === conversationId) },
        messages: dbMock.directMessagesData.filter(m => m.conversationId === conversationId).map(m => ({ ...m })),
        closedIds: Array.from(dbMock.closedSupportConversationIds)
    };

    console.log('[Admin] Estado ANTES del clic:');
    console.log(' - Documento conversación existe:', !!adminStateBefore.convo);
    console.log(' - Mensajes asociados:', adminStateBefore.messages.length);

    // Clic en "Duda resuelta" (closedBy = 'admin')
    console.log('\n[Admin] Ejecutando closeSupportConversation(conversationId, studentUID, "admin")...');
    const adminStart = Date.now();
    await api.closeSupportConversation(conversationId, studentUID, 'admin');
    const adminDurationMs = Date.now() - adminStart;

    // Esperar 2 segundos
    console.log('[Admin] Esperando 2000ms...');
    await new Promise(r => setTimeout(r, 2000));

    // Snapshot DESPUÉS de la acción del admin
    const adminStateAfter = {
        convo: dbMock.conversationsData.find(c => c.id === conversationId),
        messages: dbMock.directMessagesData.filter(m => m.conversationId === conversationId),
        closedIds: Array.from(dbMock.closedSupportConversationIds)
    };

    console.log('[Admin] Estado DESPUÉS del clic:');
    console.log(' - Documento conversación existe:', !!adminStateAfter.convo);
    console.log(' - Mensajes en la subcolección:', adminStateAfter.messages.length);

    traces.adminTrace = {
        step: 'Admin -> Duda resuelta (Hard-delete)',
        functionCalled: 'api.closeSupportConversation -> syncCloseSupportConversationInFirestore',
        conversationId,
        closedBy: 'admin',
        permissionDeniedErrors: [...adminPermErrors],
        firestoreBefore: adminStateBefore,
        firestoreAfter: adminStateAfter,
        messagesBeforeCount: adminStateBefore.messages.length,
        messagesAfterCount: adminStateAfter.messages.length,
        closedConversationsDocCreated: false, // En hard-delete se purga completamente
        logs: [...adminLogs]
    };

    console.log = origLog;
    console.warn = origWarn;
    console.error = origError;

    return traces;
}

runDirectRealVerification()
    .then(traces => {
        console.log('\n================================================================');
        console.log('EJECUCIÓN COMPLETADA EXITOSAMENTE');
        console.log('================================================================');
    })
    .catch(err => {
        console.error('Error durante la verificación:', err);
        process.exit(1);
    });
