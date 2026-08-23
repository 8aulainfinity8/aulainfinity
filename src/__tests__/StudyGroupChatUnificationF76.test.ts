import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as dbMock from '../services/mockDatabase';
import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('FASE F76 — Unificación y Corrección de Chats de Grupos de Estudio', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('1. No existen mensajes simulados o bots precargados en courseGroupMessagesData', () => {
        expect(dbMock.courseGroupMessagesData).toEqual([]);
        expect(dbMock.courseGroupMessagesData.length).toBe(0);
    });

    it('2. Ningún archivo en el frontend contiene SEED_SIMULATED_RESPONSES o almacenamiento localStorage simulado de grupos', () => {
        const studyGroupsPagePath = resolve(__dirname, '../components/StudyGroupsPage.tsx');
        const studyGroupsContent = readFileSync(studyGroupsPagePath, 'utf-8');

        expect(studyGroupsContent).not.toContain('SEED_SIMULATED_RESPONSES');
        expect(studyGroupsContent).not.toContain('SEED_MOCK_COMPANION_NAMES');
        expect(studyGroupsContent).not.toContain('aula_study_group_msgs');
        expect(studyGroupsContent).not.toContain('aula_study_groups_');
        expect(studyGroupsContent).not.toContain('isSimulated');
    });

    it('3. StudyGroupsPage está unificado con StudentChatPage (initialTab="group")', () => {
        const studyGroupsPagePath = resolve(__dirname, '../components/StudyGroupsPage.tsx');
        const studyGroupsContent = readFileSync(studyGroupsPagePath, 'utf-8');

        expect(studyGroupsContent).toContain('StudentChatPage');
        expect(studyGroupsContent).toContain('initialTab="group"');
    });

    it('4. StudentChatPage soporta initialTab="group" y conecta a useChat', () => {
        const studentChatPagePath = resolve(__dirname, '../components/StudentChatPage.tsx');
        const studentChatContent = readFileSync(studentChatPagePath, 'utf-8');

        expect(studentChatContent).toContain('initialTab?: \'private\' | \'group\'');
        expect(studentChatContent).toContain('useChat(activeConvoId, studentId)');
    });

    it('5. Firestore Security Rules protegen /chats/{chatId} y /chats/{chatId}/messages/{messageId} para grupos de curso', () => {
        const rulesPath = resolve(__dirname, '../../firestore.rules');
        const rulesContent = readFileSync(rulesPath, 'utf-8');

        // Verify match /chats/{chatId}
        expect(rulesContent).toContain('match /chats/{chatId}');
        expect(rulesContent).toContain('isEnrolledInCourse(chatId)');
        expect(rulesContent).toContain('isTeacherOfCourse(chatId)');
        expect(rulesContent).toContain('isAdmin()');

        // Verify message creation rules require senderId == request.auth.uid
        expect(rulesContent).toContain('request.resource.data.senderId == request.auth.uid');

        // Verify message delete rules allow sender or admin
        expect(rulesContent).toContain('resource.data.senderId == request.auth.uid');
    });

    it('6. AdminChatPage y StudentChatPage comparten la misma arquitectura de colecciones Firestore (/chats/{courseId}/messages)', () => {
        const adminChatPath = resolve(__dirname, '../components/admin/AdminChatPage.tsx');
        const adminChatContent = readFileSync(adminChatPath, 'utf-8');

        expect(adminChatContent).toContain('useChat(');
        expect(adminChatContent).toContain('groupConversations');
    });
});
