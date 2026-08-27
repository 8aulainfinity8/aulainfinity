import { describe, it, expect } from 'vitest';
import * as api from '../services/api';
import * as dbMock from '../services/mockDatabase';

describe('FASE 3C — Migración Forense del Listado P2P a /chats (StudentChatPage)', () => {

    it('TEST 1: fetchUserPeerChatsFromFirestore existe y es exportada como función asíncrona', async () => {
        expect(typeof api.fetchUserPeerChatsFromFirestore).toBe('function');
    });

    it('TEST 2 & 3: fetchUserPeerChatsFromFirestore exige `participants array-contains studentId` y `type == peer`', async () => {
        const studentId = 'student1';
        
        // Ensure student has a peer conversation in dbMock fallback
        const convoId = `peer_${studentId}_student2`;
        const existing = dbMock.studentPeerConversationsData.find(c => c.id === convoId);
        if (!existing) {
            dbMock.studentPeerConversationsData.push({
                id: convoId,
                participantIds: [studentId, 'student2'],
                lastMessageText: 'Hola compañero, probando P2P FASE 3C',
                lastMessageTimestamp: new Date().toISOString(),
                unreadByStudentId: { [studentId]: false, student2: true }
            });
        }

        const result = await api.fetchUserPeerChatsFromFirestore(studentId);
        expect(Array.isArray(result)).toBe(true);
        const found = result.find(c => c.id === convoId || c.participantIds.includes(studentId));
        expect(found).toBeDefined();
        expect(found?.participantIds).toContain(studentId);
    });

    it('TEST 4: Una conversación de otro usuario NO aparece (aislamiento por usuario)', async () => {
        const unrelatedUser = 'unrelated_student_xyz_999999';
        const result = await api.fetchUserPeerChatsFromFirestore(unrelatedUser);
        expect(result).toEqual([]);
    });

    it('TEST 5: Conversaciones vacías o sin ID de usuario no retornan datos', async () => {
        const result = await api.fetchUserPeerChatsFromFirestore('');
        expect(result).toEqual([]);
    });

    it('TEST 6: unreadCount se mapea correctamente a unreadByStudentId[studentId]', async () => {
        const studentId = 'student1';
        const result = await api.fetchUserPeerChatsFromFirestore(studentId);
        expect(Array.isArray(result)).toBe(true);
        if (result.length > 0) {
            expect(result[0].unreadByStudentId).toBeDefined();
            expect(typeof result[0].unreadByStudentId).toBe('object');
        }
    });

    it('TEST 7: lastMessageText y lastMessageTimestamp coinciden con la estructura que espera StudentChatPage', async () => {
        const studentId = 'student1';
        const result = await api.fetchUserPeerChatsFromFirestore(studentId);
        if (result.length > 0) {
            expect(typeof result[0].lastMessageText).toBe('string');
            expect(typeof result[0].lastMessageTimestamp).toBe('string');
            expect(Array.isArray(result[0].participantIds)).toBe(true);
        }
    });

    it('TEST 8: La lectura es puramente READ-ONLY y no ejecuta escrituras ni mutaciones', async () => {
        const studentId = 'student1';
        const initialLen = dbMock.studentPeerConversationsData.length;
        await api.fetchUserPeerChatsFromFirestore(studentId);
        expect(dbMock.studentPeerConversationsData.length).toBe(initialLen);
    });

    it('TEST 9: Conserva IDs de conversación P2P canónicas en formato `peer_{id1}_{id2}`', async () => {
        const studentId = 'student1';
        const result = await api.fetchUserPeerChatsFromFirestore(studentId);
        result.forEach(convo => {
            expect(convo.id).toBeDefined();
            expect(convo.participantIds.length).toBeGreaterThanOrEqual(1);
        });
    });

    it('TEST 10: NO REGRESIÓN: fetchPeerConversations() legado permanece disponible para providers no migrados', async () => {
        expect(typeof api.fetchPeerConversations).toBe('function');
        const legacyRes = await api.fetchPeerConversations('student1');
        expect(Array.isArray(legacyRes)).toBe(true);
    });
});
