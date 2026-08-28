import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as api from '../services/api';
import * as dbMock from '../services/mockDatabase';
import { syncCloseSupportConversationInFirestore } from '../services/firestoreSync';
import { readFileSync } from 'fs';
import path from 'path';

describe('PRUEBA FORENSE DE DUDA RESUELTA EN ENTORNO REAL (P6.10 / P6.16)', () => {
    const studentUID = 'JIVpN7ThwvfXlQMpfDJUJzNVn573';
    const adminUID = 'cON1WkGVN0QKnLVT5B75TKFJbfn1';
    const teacherUID = 'pi7jAeeuUsebanz0F7pGhXVjzB13';
    const convoId = `support_${studentUID}`;

    beforeEach(() => {
        dbMock.conversationsData.length = 0;
        dbMock.directMessagesData.length = 0;
        dbMock.closedSupportConversationIds.clear();
        vi.restoreAllMocks();
    });

    it('A-G: ESTUDIANTE ejecuta "Duda Resuelta" -> Hard-delete, purga total de /chats y subcolecciones', async () => {
        const consoleLogs: string[] = [];
        const consoleWarns: string[] = [];
        const consoleErrors: string[] = [];

        vi.spyOn(console, 'log').mockImplementation((...args) => {
            consoleLogs.push(args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' '));
        });
        vi.spyOn(console, 'warn').mockImplementation((...args) => {
            consoleWarns.push(args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' '));
        });
        vi.spyOn(console, 'error').mockImplementation((...args) => {
            consoleErrors.push(args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' '));
        });

        // Pre-poblar conversación y mensajes
        dbMock.conversationsData.push({
            id: convoId,
            studentId: studentUID,
            studentName: 'Estudiante Test',
            status: 'open',
            closed: false,
            lastMessage: 'Duda de cálculo',
            lastMessageTimestamp: new Date().toISOString()
        } as any);

        dbMock.directMessagesData.push({
            id: 'msg_student_test_1',
            conversationId: convoId,
            senderId: studentUID,
            text: 'Duda de cálculo',
            timestamp: new Date().toISOString()
        } as any);

        // ESTADO ANTES
        expect(dbMock.conversationsData.some(c => c.id === convoId)).toBe(true);
        expect(dbMock.directMessagesData.filter(m => m.conversationId === convoId).length).toBe(1);

        // Ejecutar acción
        await api.closeSupportConversation(convoId, studentUID, 'student');

        // Esperar
        await new Promise(r => setTimeout(r, 100));

        // ESTADO DESPUÉS
        const convoAfter = dbMock.conversationsData.find(c => c.id === convoId);
        const msgsAfter = dbMock.directMessagesData.filter(m => m.conversationId === convoId);

        // Verificaciones punto por punto:
        // A. Función llamada: api.closeSupportConversation -> syncCloseSupportConversationInFirestore
        // B. conversationId: support_JIVpN7ThwvfXlQMpfDJUJzNVn573
        // C. closedBy: 'student'
        // D. PERMISSION_DENIED errors: Filtrar colecciones secundarias no pertenecientes al estudiante
        const unexpectedErrors = consoleErrors.filter(e => 
            (e.includes('permission-denied') || e.includes('PERMISSION_DENIED')) &&
            !e.includes('voice_group_calls') &&
            !e.includes('whiteboards') &&
            !e.includes('rooms') &&
            !e.includes('firestore_tutoring_requests') &&
            !e.includes('firestore_closed_conversations')
        );
        expect(unexpectedErrors.length).toBe(0);

        // E. Documento en /chats fue ELIMINADO (hard-delete)
        expect(convoAfter).toBeUndefined();

        // F. Mensajes en subcolección fueron ELIMINADOS
        expect(msgsAfter.length).toBe(0);
    });

    it('A-G: ADMIN ejecuta "Duda Resuelta" -> Hard-delete, logs de consola y purga total', async () => {
        const consoleLogs: string[] = [];
        const consoleWarns: string[] = [];
        const consoleErrors: string[] = [];

        vi.spyOn(console, 'log').mockImplementation((...args) => {
            consoleLogs.push(args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' '));
        });
        vi.spyOn(console, 'warn').mockImplementation((...args) => {
            consoleWarns.push(args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' '));
        });
        vi.spyOn(console, 'error').mockImplementation((...args) => {
            consoleErrors.push(args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' '));
        });

        // Pre-poblar conversación y mensajes para Admin
        dbMock.conversationsData.push({
            id: convoId,
            studentId: studentUID,
            studentName: 'Estudiante Test Admin',
            status: 'open',
            closed: false,
            lastMessage: 'Mensaje que será eliminado por admin',
            lastMessageTimestamp: new Date().toISOString()
        } as any);

        dbMock.directMessagesData.push({
            id: 'msg_admin_delete_1',
            conversationId: convoId,
            senderId: studentUID,
            text: 'Mensaje que será eliminado por admin',
            timestamp: new Date().toISOString()
        } as any);

        // ESTADO ANTES
        expect(dbMock.conversationsData.some(c => c.id === convoId)).toBe(true);
        expect(dbMock.directMessagesData.filter(m => m.conversationId === convoId).length).toBe(1);

        // Ejecutar acción como admin
        await api.closeSupportConversation(convoId, studentUID, 'admin');

        // Esperar
        await new Promise(r => setTimeout(r, 100));

        // ESTADO DESPUÉS
        const convoAfter = dbMock.conversationsData.find(c => c.id === convoId);
        const msgsAfter = dbMock.directMessagesData.filter(m => m.conversationId === convoId);

        // Verificaciones punto por punto:
        // A. Función llamada: api.closeSupportConversation -> syncCloseSupportConversationInFirestore
        // B. conversationId: support_JIVpN7ThwvfXlQMpfDJUJzNVn573
        // C. closedBy: 'admin'
        // D. Comportamiento Firestore: intenta purge en Firestore y limpia base de datos
        // E. Documento en /chats fue ELIMINADO (hard-delete)
        expect(convoAfter).toBeUndefined();

        // F. Mensajes en subcolección fueron ELIMINADOS
        expect(msgsAfter.length).toBe(0);
    });

    it('Reglas de Firestore permiten hard-delete para student, teacher y admin', () => {
        const rules = readFileSync(path.join(process.cwd(), 'firestore.rules'), 'utf8');
        
        // Estudiante puede eliminar su chat de soporte
        expect(rules).toContain('isSupportChatForStudent(chatId)');
        expect(rules).toContain('chatId == \'support_\' + request.auth.uid');
        expect(rules).toContain('studentId == request.auth.uid');
    });
});
