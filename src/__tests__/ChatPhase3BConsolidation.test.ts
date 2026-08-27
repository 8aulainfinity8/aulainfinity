import { describe, it, expect } from 'vitest';
import * as api from '../services/api';
import * as dbMock from '../services/mockDatabase';

describe('FASE 3B — Consolidación Incremental de Chat: Capa Canónica de Lectura /chats', () => {
    it('1. fetchUserChatsFromFirestore existe y es exportada como función asíncrona', async () => {
        expect(typeof api.fetchUserChatsFromFirestore).toBe('function');
    });

    it('2. fetchUserChatsFromFirestore devuelve array vacío si no se suministra userId', async () => {
        const result = await api.fetchUserChatsFromFirestore('');
        expect(result).toEqual([]);
    });

    it('3. Fallback controlado a dbMock devuelve únicamente conversaciones asociadas al usuario', async () => {
        const studentId = 'student1';
        
        // Ensure student has a conversation in dbMock
        const convoId = `direct_${studentId}_teacher1`;
        const existing = dbMock.conversationsData.find(c => c.id === convoId);
        if (!existing) {
            dbMock.conversationsData.push({
                id: convoId,
                studentId,
                studentName: 'Lucía G.',
                teacherId: 'teacher1',
                teacherName: 'Prof. Roberto',
                lastMessageText: 'Mensaje de prueba FASE 3B',
                lastMessageTimestamp: new Date().toISOString(),
                unreadByStudent: false,
                unreadByTeacher: true,
                unreadByAdmin: false
            });
        }

        const result = await api.fetchUserChatsFromFirestore(studentId);
        expect(Array.isArray(result)).toBe(true);
        const found = result.find(c => c.studentId === studentId || c.id.includes(studentId));
        expect(found).toBeDefined();
        expect(found?.studentId).toBe(studentId);
    });

    it('4. Aislamiento por usuario: no expone conversaciones donde el usuario no participa', async () => {
        const nonExistentUserId = 'random_unrelated_user_xyz_999';
        const result = await api.fetchUserChatsFromFirestore(nonExistentUserId);
        expect(result).toEqual([]);
    });

    it('5. NO REGRESIÓN: fetchConversations() legado permanece intacto y funcionando sobre dbMock', async () => {
        expect(typeof api.fetchConversations).toBe('function');
        const legacyConvos = await api.fetchConversations();
        expect(Array.isArray(legacyConvos)).toBe(true);
    });
});
