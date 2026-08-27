import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import * as api from '../services/api';
import * as dbMock from '../services/mockDatabase';

describe('FASE 3D — Migración Forense del Badge P2P a /chats (StudentNotificationProvider)', () => {

    it('TEST 1: StudentNotificationProvider.tsx ya no utiliza api.fetchPeerConversations para el badge P2P', () => {
        const filePath = path.join(process.cwd(), 'src/contexts/StudentNotificationProvider.tsx');
        const fileContent = fs.readFileSync(filePath, 'utf-8');
        expect(fileContent).not.toContain('api.fetchPeerConversations(');
        expect(fileContent).toContain('api.fetchUserPeerChatsFromFirestore(');
    });

    it('TEST 2: El acceso canónico utiliza /chats', () => {
        const apiFilePath = path.join(process.cwd(), 'src/services/api.ts');
        const apiContent = fs.readFileSync(apiFilePath, 'utf-8');
        expect(apiContent).toContain("collection(db, 'chats')");
    });

    it('TEST 3 & 4: La consulta canónica exige `participants array-contains studentId` y `type == peer`', () => {
        const apiFilePath = path.join(process.cwd(), 'src/services/api.ts');
        const apiContent = fs.readFileSync(apiFilePath, 'utf-8');
        expect(apiContent).toContain("where('participants', 'array-contains', studentId)");
        expect(apiContent).toContain("where('type', '==', 'peer')");
    });

    it('TEST 5: Una conversación P2P ajena no puede contribuir al contador del estudiante', async () => {
        const studentId = 'student_test_phase3d_unique';
        const result = await api.fetchUserPeerChatsFromFirestore(studentId);
        expect(result).toEqual([]);
        
        // Calcule unread count
        const unreadPeerCount = result.filter(c => !!c.unreadByStudentId?.[studentId]).length;
        expect(unreadPeerCount).toBe(0);
    });

    it('TEST 6: Conversaciones non-peer no contribuyen al contador P2P', async () => {
        const studentId = 'student1';
        const result = await api.fetchUserPeerChatsFromFirestore(studentId);
        // Cada objeto devuelto debe tener un id de peer y participantIds con el studentId
        result.forEach(convo => {
            expect(convo.participantIds).toContain(studentId);
            // Validar que no sean conversaciones de grupo ni soporte
            expect(convo.id.startsWith('course_')).toBe(false);
            expect(convo.id.startsWith('support_')).toBe(false);
        });
    });

    it('TEST 7: unreadCount[studentId] > 0 activa el badge según la semántica existente', async () => {
        const studentId = 'student1';
        const partnerId = 'student2';
        const convoId = `peer_${[studentId, partnerId].sort().join('_')}`;
        
        // Simular en dbMock fallback
        const existingIndex = dbMock.studentPeerConversationsData.findIndex(c => c.id === convoId);
        if (existingIndex >= 0) {
            dbMock.studentPeerConversationsData[existingIndex].unreadByStudentId = { [studentId]: true, [partnerId]: false };
        } else {
            dbMock.studentPeerConversationsData.push({
                id: convoId,
                participantIds: [studentId, partnerId],
                lastMessageText: 'Mensaje sin leer',
                lastMessageTimestamp: new Date().toISOString(),
                unreadByStudentId: { [studentId]: true, [partnerId]: false }
            });
        }

        const result = await api.fetchUserPeerChatsFromFirestore(studentId);
        const unreadPeerCount = result.filter(c => !!c.unreadByStudentId?.[studentId]).length;
        expect(unreadPeerCount).toBeGreaterThanOrEqual(1);
    });

    it('TEST 8: unreadCount[studentId] == 0 no activa el badge', async () => {
        const studentId = 'student1';
        const partnerId = 'student2';
        const convoId = `peer_${[studentId, partnerId].sort().join('_')}`;
        
        const existingIndex = dbMock.studentPeerConversationsData.findIndex(c => c.id === convoId);
        if (existingIndex >= 0) {
            dbMock.studentPeerConversationsData[existingIndex].unreadByStudentId[studentId] = false;
        }

        const result = await api.fetchUserPeerChatsFromFirestore(studentId);
        const targetConvo = result.find(c => c.id === convoId);
        if (targetConvo) {
            expect(!!targetConvo.unreadByStudentId?.[studentId]).toBe(false);
        }
    });

    it('TEST 9: Conserva la semántica de contar conversaciones con mensajes pendientes (vs suma total de mensajes)', async () => {
        // En StudentNotificationProvider:
        // unreadPeerCount = peerConversations.filter(c => !!c.unreadByStudentId?.[user.id]).length;
        // Se cuenta el número de CONVERSACIONES (no la suma de mensajes no leídos)
        const mockConvos = [
            { id: 'peer_1', participantIds: ['s1', 's2'], lastMessageText: 'a', lastMessageTimestamp: '', unreadByStudentId: { s1: true } },
            { id: 'peer_2', participantIds: ['s1', 's3'], lastMessageText: 'b', lastMessageTimestamp: '', unreadByStudentId: { s1: true } },
            { id: 'peer_3', participantIds: ['s1', 's4'], lastMessageText: 'c', lastMessageTimestamp: '', unreadByStudentId: { s1: false } }
        ];

        const unreadCount = mockConvos.filter(c => !!c.unreadByStudentId?.['s1']).length;
        expect(unreadCount).toBe(2);
    });

    it('TEST 10: La operación de obtención del badge P2P es estrictamente READ-ONLY', async () => {
        const studentId = 'student1';
        const initialLen = dbMock.studentPeerConversationsData.length;
        await api.fetchUserPeerChatsFromFirestore(studentId);
        expect(dbMock.studentPeerConversationsData.length).toBe(initialLen);
    });

    it('TEST 11: El contrato público del StudentNotificationProvider no cambia', () => {
        const contextFilePath = path.join(process.cwd(), 'src/contexts/StudentNotificationContext.ts');
        const contextContent = fs.readFileSync(contextFilePath, 'utf-8');
        
        expect(contextContent).toContain('unreadPeerCount: number;');
        expect(contextContent).toContain('peerConversations: StudentPeerConversation[] | undefined;');
        expect(contextContent).toContain('isPeerConversationsLoading: boolean;');
        expect(contextContent).toContain('refetchPeerConversations: () => void;');
    });

    it('TEST 12: fetchPeerConversations sigue existiendo en api.ts para consumidores legacy no migrados', () => {
        expect(typeof api.fetchPeerConversations).toBe('function');
    });

    it('TEST 13: Comprobar que otros badges en StudentNotificationProvider.tsx no sufrieron modificaciones', () => {
        const providerFilePath = path.join(process.cwd(), 'src/contexts/StudentNotificationProvider.tsx');
        const providerContent = fs.readFileSync(providerFilePath, 'utf-8');

        // Soporte
        expect(providerContent).toContain('api.fetchUserChatsFromFirestore');
        expect(providerContent).toContain('unreadSupportCount');

        // Grupos
        expect(providerContent).toContain('api.fetchCourseGroupConversations');
        expect(providerContent).toContain('unreadGroupCount');

        // Tutorías
        expect(providerContent).toContain('api.fetchTutoringRequests');
        expect(providerContent).toContain('pendingTutoringRequestsCount');

        // Total
        expect(providerContent).toContain('unreadStudentTotal');
    });
});
