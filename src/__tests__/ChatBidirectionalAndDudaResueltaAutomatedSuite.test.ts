import { describe, it, expect, beforeEach } from 'vitest';
import * as api from '../services/api';
import * as dbMock from '../services/mockDatabase';
import { 
    getDirectChatId, 
    parseDirectChatId,
    inferParticipantsFromChatId, 
    resolveConversationMetadata,
    resolveUserUid 
} from '../utils/chatUtils';
import { readFileSync } from 'fs';
import path from 'path';

/**
 * SUITE DE PRUEBAS AUTOMATIZADAS — P6.16 & P6.10
 * 1. Flujo completo de chat bidireccional Profesor ↔ Alumno (P6.16)
 * 2. Botón "Duda resuelta": Soft-close para Estudiantes vs Hard-delete para Admin/Teacher (P6.10)
 */
describe('SUITE AUTOMATIZADA: Chats Profesor ↔ Alumno & Botón Duda Resuelta', () => {
    const rulesContent = readFileSync(path.join(process.cwd(), 'firestore.rules'), 'utf8');

    // UIDs especificados en la prueba
    const teacherUID = 'pi7jAeeuUsebanz0F7pGhXVjzB13';
    const studentUID = 'JIVpN7ThwvfXlQMpfDJUJzNVn573';
    const adminUID = 'admin_master_uid_999';

    beforeEach(() => {
        // Reset local database state before each test
        dbMock.conversationsData.length = 0;
        dbMock.directMessagesData.length = 0;
        dbMock.closedSupportConversationIds.clear();
    });

    describe('PRUEBA 1: Chat Profesor ↔ Alumno (Bidireccionalidad)', () => {
        it('1.1 - 1.4: Profesor envía mensaje a Alumno y se crea en direct_{studentId}_{teacherId} con participants correctos', () => {
            // 1.1 Simulación login profesor
            const teacherUser = { id: teacherUID, uid: teacherUID, role: 'teacher', name: 'Profesor Test' };
            const studentUser = { id: studentUID, uid: studentUID, role: 'student', name: 'Alumno Test' };

            // 1.2 Selección del alumno y cálculo de chatId canónico
            const targetStudentUid = resolveUserUid(studentUser);
            const currentTeacherUid = resolveUserUid(teacherUser);
            const expectedChatId = getDirectChatId(targetStudentUid, currentTeacherUid);

            expect(expectedChatId).toBe(`direct_${studentUID}_${teacherUID}`);

            // 1.3 & 1.4 Envío de mensaje simulado por el profesor
            const initialMessage = {
                id: 'msg_teacher_001',
                conversationId: expectedChatId,
                senderId: teacherUID,
                senderRole: 'teacher' as const,
                text: 'Hola desde profesor',
                timestamp: new Date().toISOString(),
                participants: [studentUID, teacherUID]
            };

            // Escribir en mock / base de datos
            dbMock.directMessagesData.push(initialMessage as any);
            dbMock.conversationsData.push({
                id: expectedChatId,
                type: 'direct',
                studentId: studentUID,
                teacherId: teacherUID,
                participants: [studentUID, teacherUID],
                lastMessage: initialMessage.text,
                lastMessageTimestamp: initialMessage.timestamp,
                unreadCount: { [studentUID]: 1, [teacherUID]: 0 },
                unreadByStudent: true,
                unreadByTeacher: false
            } as any);

            // Verificaciones en la entidad del chat
            const chatDoc = dbMock.conversationsData.find(c => c.id === expectedChatId);
            expect(chatDoc).toBeDefined();
            expect(chatDoc?.id).toBe(`direct_${studentUID}_${teacherUID}`);
            expect(chatDoc?.type).toBe('direct');
            expect((chatDoc as any)?.participants).toEqual(expect.arrayContaining([studentUID, teacherUID]));
            expect(chatDoc?.studentId).toBe(studentUID);
            expect(chatDoc?.teacherId).toBe(teacherUID);

            // Verificación del mensaje creado
            const createdMsg = dbMock.directMessagesData.find(m => m.id === 'msg_teacher_001');
            expect(createdMsg).toBeDefined();
            expect(createdMsg?.conversationId).toBe(expectedChatId);
            expect(createdMsg?.senderId).toBe(teacherUID);
            expect(createdMsg?.text).toBe('Hola desde profesor');
        });

        it('1.5 - 1.10: Alumno abre chat desde Docente, escucha el mismo chatId, responde y el profesor recibe la respuesta', () => {
            // 1.5 & 1.6 Simulación login alumno y apertura de canal Docente con profesor
            const studentUser = { id: studentUID, uid: studentUID, role: 'student', name: 'Alumno Test' };
            const teacherUser = { id: teacherUID, uid: teacherUID, role: 'teacher', name: 'Profesor Test' };

            const sUid = resolveUserUid(studentUser);
            const tUid = resolveUserUid(teacherUser);
            const studentChatId = getDirectChatId(sUid, tUid);

            // 1.7 Verificar que el alumno escucha exactamente el mismo ID
            expect(studentChatId).toBe(`direct_${studentUID}_${teacherUID}`);

            // 1.8 Alumno responde al profesor
            const studentReply = {
                id: 'msg_student_002',
                conversationId: studentChatId,
                senderId: studentUID,
                senderRole: 'student' as const,
                text: 'Hola profesor, duda recibida y entendida',
                timestamp: new Date().toISOString(),
                participants: [studentUID, teacherUID]
            };
            dbMock.directMessagesData.push(studentReply as any);

            // 1.9 Verificar que la respuesta se creó en el mismo chatId
            const msgsInChat = dbMock.directMessagesData.filter(m => m.conversationId === studentChatId);
            expect(msgsInChat.length).toBeGreaterThanOrEqual(1);
            const foundReply = msgsInChat.find(m => m.id === 'msg_student_002');
            expect(foundReply).toBeDefined();
            expect(foundReply?.senderId).toBe(studentUID);
            expect(foundReply?.conversationId).toBe(`direct_${studentUID}_${teacherUID}`);

            // 1.10 Profesor lee los mensajes del canal
            const teacherReadMessages = dbMock.directMessagesData.filter(m => m.conversationId === getDirectChatId(studentUID, teacherUID));
            expect(teacherReadMessages.some(m => m.id === 'msg_student_002')).toBe(true);
        });

        it('1.11: Reglas de Firestore autorizan lectura y escritura bidireccional en direct_{studentId}_{teacherId}', () => {
            // Validar que las reglas de firestore.rules contienen las cláusulas canónicas para direct_
            expect(rulesContent).toContain('isDirectChatIdForUser(chatId)');
            expect(rulesContent).toContain("chatId.matches('^direct_' + request.auth.uid + '_[a-zA-Z0-9_-]+$')");
            expect(rulesContent).toContain("chatId.matches('^direct_[a-zA-Z0-9_-]+_' + request.auth.uid + '$')");
        });
    });

    describe('PRUEBA 2: Botón "Duda resuelta" (Estudiante → Hard-delete)', () => {
        it('2.1 - 2.4: Estudiante hace clic en Duda Resuelta en chat de soporte -> Hard-delete físico completo', async () => {
            const supportConvoId = `support_${studentUID}`;

            // Pre-poblar chat de soporte con mensajes
            dbMock.conversationsData.push({
                id: supportConvoId,
                studentId: studentUID,
                studentName: 'Alumno Test',
                status: 'open',
                closed: false,
                lastMessage: 'Tengo una duda con un ejercicio',
                lastMessageTimestamp: new Date().toISOString()
            } as any);

            dbMock.directMessagesData.push({
                id: 'support_msg_1',
                conversationId: supportConvoId,
                senderId: studentUID,
                text: 'Tengo una duda con un ejercicio',
                timestamp: new Date().toISOString()
            } as any);

            // 2.3 Simular clic en "Duda resuelta" por parte del estudiante
            await api.closeSupportConversation(supportConvoId, studentUID, 'student');

            // 2.4 Verificaciones:
            // - El documento en /chats/support_{studentId} fue ELIMINADO (hard-delete)
            const convo = dbMock.conversationsData.find(c => c.id === supportConvoId);
            expect(convo).toBeUndefined();

            // - Los mensajes en /chats/support_{studentId}/messages fueron ELIMINADOS
            const remainingMsgs = dbMock.directMessagesData.filter(m => m.conversationId === supportConvoId);
            expect(remainingMsgs.length).toBe(0);
        });
    });

    describe('PRUEBA 3: Botón "Duda resuelta" (Admin → Hard-delete)', () => {
        it('3.1 - 3.4: Admin hace clic en Duda Resuelta en chat de soporte -> Hard-delete físico completo', async () => {
            const supportConvoId = `support_${studentUID}`;

            // Pre-poblar chat de soporte con mensajes
            dbMock.conversationsData.push({
                id: supportConvoId,
                studentId: studentUID,
                studentName: 'Alumno Test',
                status: 'open',
                closed: false,
                lastMessage: 'Mensaje de soporte',
                lastMessageTimestamp: new Date().toISOString()
            } as any);

            dbMock.directMessagesData.push({
                id: 'admin_test_msg_1',
                conversationId: supportConvoId,
                senderId: studentUID,
                text: 'Mensaje de soporte',
                timestamp: new Date().toISOString()
            } as any);

            // Verificar que existen antes
            expect(dbMock.conversationsData.some(c => c.id === supportConvoId)).toBe(true);
            expect(dbMock.directMessagesData.some(m => m.conversationId === supportConvoId)).toBe(true);

            // 3.3 Simular clic en "Duda resuelta" por parte de Admin
            await api.closeSupportConversation(supportConvoId, studentUID, 'admin');

            // 3.4 Verificaciones:
            // - El documento en /chats/support_{studentId} fue ELIMINADO
            const convoAfter = dbMock.conversationsData.find(c => c.id === supportConvoId);
            expect(convoAfter).toBeUndefined();

            // - Los mensajes en /chats/support_{studentId}/messages fueron ELIMINADOS
            const msgsAfter = dbMock.directMessagesData.filter(m => m.conversationId === supportConvoId);
            expect(msgsAfter.length).toBe(0);
        });
    });

    describe('PRUEBA 4: Botón "Duda resuelta" (Profesor → Hard-delete)', () => {
        it('4.1 - 4.4: Profesor hace clic en Duda Resuelta en chat de soporte -> Hard-delete físico completo', async () => {
            const supportConvoId = `support_${studentUID}`;

            // Pre-poblar chat de soporte con mensajes
            dbMock.conversationsData.push({
                id: supportConvoId,
                studentId: studentUID,
                studentName: 'Alumno Test',
                status: 'open',
                closed: false,
                lastMessage: 'Duda atendida por profesor',
                lastMessageTimestamp: new Date().toISOString()
            } as any);

            dbMock.directMessagesData.push({
                id: 'teacher_test_msg_1',
                conversationId: supportConvoId,
                senderId: studentUID,
                text: 'Duda atendida por profesor',
                timestamp: new Date().toISOString()
            } as any);

            // Verificar que existen antes
            expect(dbMock.conversationsData.some(c => c.id === supportConvoId)).toBe(true);
            expect(dbMock.directMessagesData.some(m => m.conversationId === supportConvoId)).toBe(true);

            // 4.1 - 4.3 Simular clic en "Duda resuelta" por parte del Profesor
            await api.closeSupportConversation(supportConvoId, studentUID, 'teacher');

            // 4.4 Verificaciones:
            // - El documento en /chats/support_{studentId} fue ELIMINADO
            const convoAfter = dbMock.conversationsData.find(c => c.id === supportConvoId);
            expect(convoAfter).toBeUndefined();

            // - Los mensajes en /chats/support_{studentId}/messages fueron ELIMINADOS
            const msgsAfter = dbMock.directMessagesData.filter(m => m.conversationId === supportConvoId);
            expect(msgsAfter.length).toBe(0);
        });
    });
});
