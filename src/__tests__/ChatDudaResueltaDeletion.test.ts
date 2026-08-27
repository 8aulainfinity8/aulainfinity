import { describe, it, expect } from 'vitest';
import * as api from '../services/api';
import * as dbMock from '../services/mockDatabase';
import { syncCloseSupportConversationInFirestore } from '../services/firestoreSync';

describe('Duda Resuelta — Pruebas de Borrado Completo y Seguro', () => {

    it('TEST 1: closeSupportConversation llama a dbCloseSupportConversation y limpia el estado local', async () => {
        // Inicializar datos simulados para la prueba
        const testStudentId = 'student_test_123';
        const testConvoId = 'direct_student_test_123';

        // Agregar una conversación de prueba a mock database
        dbMock.conversationsData.push({
            id: testConvoId,
            studentId: testStudentId,
            studentName: 'Test Student',
            lastMessageText: 'Hola',
            lastMessageTimestamp: new Date().toISOString()
        } as any);

        dbMock.directMessagesData.push({
            id: 'msg_1',
            conversationId: testConvoId,
            senderId: testStudentId,
            text: 'Duda de prueba',
            timestamp: new Date().toISOString()
        } as any);

        // Validar que existen antes de cerrar
        const beforeConvosCount = dbMock.conversationsData.filter(c => c.id === testConvoId).length;
        const beforeMsgsCount = dbMock.directMessagesData.filter(m => m.conversationId === testConvoId).length;
        expect(beforeConvosCount).toBe(1);
        expect(beforeMsgsCount).toBe(1);

        // Ejecutar el cierre de la duda (duda resuelta)
        await api.closeSupportConversation(testConvoId, testStudentId, 'teacher');

        // Validar borrado completo (no debe haber rastro de la conversación ni de los mensajes en el mock local)
        const afterConvosCount = dbMock.conversationsData.filter(c => c.id === testConvoId).length;
        const afterMsgsCount = dbMock.directMessagesData.filter(m => m.conversationId === testConvoId).length;
        expect(afterConvosCount).toBe(0);
        expect(afterMsgsCount).toBe(0);
    });

    it('TEST 2: syncCloseSupportConversationInFirestore es una función asíncrona exportada', () => {
        expect(typeof syncCloseSupportConversationInFirestore).toBe('function');
    });

    it('TEST 3: closeSupportConversation por parte de un estudiante hace soft-close sin borrar', async () => {
        const studentId = 'student_soft_close_789';
        const convoId = 'direct_student_soft_close_789';

        dbMock.conversationsData.push({
            id: convoId,
            studentId: studentId,
            studentName: 'Student Soft Close',
            lastMessageText: 'Ayuda',
            lastMessageTimestamp: new Date().toISOString()
        } as any);

        dbMock.directMessagesData.push({
            id: 'msg_soft_1',
            conversationId: convoId,
            senderId: studentId,
            text: 'Duda por resolver',
            timestamp: new Date().toISOString()
        } as any);

        await api.closeSupportConversation(convoId, studentId, 'student');

        const convo = dbMock.conversationsData.find(c => c.id === convoId);
        expect(convo).toBeDefined();
        expect(convo?.status).toBe('resolved');
        expect(convo?.closed).toBe(true);
        expect(convo?.closedBy).toBe('student');

        const msgs = dbMock.directMessagesData.filter(m => m.conversationId === convoId);
        expect(msgs.length).toBe(1); // No borrado
    });
});
