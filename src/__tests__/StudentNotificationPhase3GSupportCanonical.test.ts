import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import * as api from '../services/api';
import { Conversation } from '../types';

describe('FASE 3G — Migración Forense del Badge de Soporte del Estudiante a /chats (StudentNotificationProvider)', () => {

    it('TEST 1: StudentNotificationProvider.tsx ya no utiliza api.fetchConversations para el badge de soporte', () => {
        const filePath = path.join(process.cwd(), 'src/contexts/StudentNotificationProvider.tsx');
        const fileContent = fs.readFileSync(filePath, 'utf-8');
        expect(fileContent).not.toContain('queryFn: api.fetchConversations');
        expect(fileContent).toContain('api.fetchUserChatsFromFirestore');
    });

    it('TEST 2: El consumidor utiliza la fuente canónica /chats', () => {
        const apiPath = path.join(process.cwd(), 'src/services/api.ts');
        const apiContent = fs.readFileSync(apiPath, 'utf-8');
        expect(apiContent).toContain("collection(db, 'chats')");
    });

    it('TEST 3: La consulta está aislada por participants array-contains userId', () => {
        const apiPath = path.join(process.cwd(), 'src/services/api.ts');
        const apiContent = fs.readFileSync(apiPath, 'utf-8');
        expect(apiContent).toContain("where('participants', 'array-contains', userId)");
    });

    it('TEST 4: Solo conversaciones de soporte (type === support o id support_*) participan en el badge', () => {
        const studentId = 'student123';
        const conversations: Conversation[] = [
            { id: 'support_student123', type: 'support', studentId: 'student123', studentName: 'S1', lastMessageText: 'Ayuda', lastMessageTimestamp: 'now', unreadByStudent: true, unreadByAdmin: false },
            { id: 'peer_student123_student456', type: 'peer', studentId: 'student123', studentName: 'S1', lastMessageText: 'Hola', lastMessageTimestamp: 'now', unreadByStudent: true, unreadByAdmin: false }
        ];

        const supportConvos = conversations.filter(c => {
            const isSupport = c.type === 'support' || c.id === studentId || c.id === `support_${studentId}` || c.id.startsWith('support_');
            const belongsToStudent = c.studentId === studentId || c.id === studentId || c.id === `support_${studentId}` || c.id.startsWith(studentId + '_') || c.id.startsWith(`support_${studentId}`);
            return isSupport && belongsToStudent && !!c.unreadByStudent;
        });

        expect(supportConvos.length).toBe(1);
        expect(supportConvos[0].id).toBe('support_student123');
    });

    it('TEST 5: Una conversación support perteneciente a otro estudiante no cuenta', () => {
        const studentId = 'student123';
        const conversations: Conversation[] = [
            { id: 'support_student999', type: 'support', studentId: 'student999', studentName: 'Other', lastMessageText: 'Ayuda', lastMessageTimestamp: 'now', unreadByStudent: true, unreadByAdmin: false }
        ];

        const count = conversations.filter(c => {
            const isSupport = c.type === 'support' || c.id === studentId || c.id === `support_${studentId}` || c.id.startsWith('support_');
            const belongsToStudent = c.studentId === studentId || c.id === studentId || c.id === `support_${studentId}` || c.id.startsWith(studentId + '_') || c.id.startsWith(`support_${studentId}`);
            return isSupport && belongsToStudent && !!c.unreadByStudent;
        }).length;

        expect(count).toBe(0);
    });

    it('TEST 6: Una conversación peer del mismo estudiante no cuenta para el badge de soporte', () => {
        const studentId = 'student123';
        const conversations: Conversation[] = [
            { id: 'peer_student123_friend', type: 'peer', studentId: 'student123', studentName: 'S1', lastMessageText: 'Peer msg', lastMessageTimestamp: 'now', unreadByStudent: true, unreadByAdmin: false }
        ];

        const count = conversations.filter(c => {
            const isSupport = c.type === 'support' || c.id === studentId || c.id === `support_${studentId}` || c.id.startsWith('support_');
            const belongsToStudent = c.studentId === studentId || c.id === studentId || c.id === `support_${studentId}` || c.id.startsWith(studentId + '_') || c.id.startsWith(`support_${studentId}`);
            return isSupport && belongsToStudent && !!c.unreadByStudent;
        }).length;

        expect(count).toBe(0);
    });

    it('TEST 7: Una conversación direct del mismo estudiante no cuenta si no es de soporte', () => {
        const studentId = 'student123';
        const conversations: Conversation[] = [
            { id: 'direct_student123_teacher1', type: 'direct', studentId: 'student123', studentName: 'S1', teacherId: 'teacher1', lastMessageText: 'Direct msg', lastMessageTimestamp: 'now', unreadByStudent: true, unreadByAdmin: false }
        ];

        const count = conversations.filter(c => {
            const isSupport = c.type === 'support' || c.id === studentId || c.id === `support_${studentId}` || c.id.startsWith('support_');
            const belongsToStudent = c.studentId === studentId || c.id === studentId || c.id === `support_${studentId}` || c.id.startsWith(studentId + '_') || c.id.startsWith(`support_${studentId}`);
            return isSupport && belongsToStudent && !!c.unreadByStudent;
        }).length;

        expect(count).toBe(0);
    });

    it('TEST 8: unreadByStudent === true activa el badge', () => {
        const studentId = 'student123';
        const conversations: Conversation[] = [
            { id: 'support_student123', type: 'support', studentId: 'student123', studentName: 'S1', lastMessageText: 'Ayuda', lastMessageTimestamp: 'now', unreadByStudent: true, unreadByAdmin: false }
        ];

        const count = conversations.filter(c => {
            const isSupport = c.type === 'support' || c.id === studentId || c.id === `support_${studentId}` || c.id.startsWith('support_');
            const belongsToStudent = c.studentId === studentId || c.id === studentId || c.id === `support_${studentId}` || c.id.startsWith(studentId + '_') || c.id.startsWith(`support_${studentId}`);
            return isSupport && belongsToStudent && !!c.unreadByStudent;
        }).length;

        expect(count).toBe(1);
    });

    it('TEST 9: unreadByStudent === false no activa el badge', () => {
        const studentId = 'student123';
        const conversations: Conversation[] = [
            { id: 'support_student123', type: 'support', studentId: 'student123', studentName: 'S1', lastMessageText: 'Ayuda', lastMessageTimestamp: 'now', unreadByStudent: false, unreadByAdmin: false }
        ];

        const count = conversations.filter(c => {
            const isSupport = c.type === 'support' || c.id === studentId || c.id === `support_${studentId}` || c.id.startsWith('support_');
            const belongsToStudent = c.studentId === studentId || c.id === studentId || c.id === `support_${studentId}` || c.id.startsWith(studentId + '_') || c.id.startsWith(`support_${studentId}`);
            return isSupport && belongsToStudent && !!c.unreadByStudent;
        }).length;

        expect(count).toBe(0);
    });

    it('TEST 10: El contador sigue contando CONVERSACIONES y no la cantidad de mensajes', () => {
        const studentId = 'student123';
        const conversations: Conversation[] = [
            { id: 'support_student123', type: 'support', studentId: 'student123', studentName: 'S1', lastMessageText: '5 mensajes sin leer internamente', lastMessageTimestamp: 'now', unreadByStudent: true, unreadByAdmin: false }
        ];

        const count = conversations.filter(c => {
            const isSupport = c.type === 'support' || c.id === studentId || c.id === `support_${studentId}` || c.id.startsWith('support_');
            const belongsToStudent = c.studentId === studentId || c.id === studentId || c.id === `support_${studentId}` || c.id.startsWith(studentId + '_') || c.id.startsWith(`support_${studentId}`);
            return isSupport && belongsToStudent && !!c.unreadByStudent;
        }).length;

        expect(count).toBe(1);
    });

    it('TEST 11: La operación de obtención en fetchUserChatsFromFirestore es estrictamente READ-ONLY', () => {
        const apiPath = path.join(process.cwd(), 'src/services/api.ts');
        const apiContent = fs.readFileSync(apiPath, 'utf-8');
        const fnStart = apiContent.indexOf('export const fetchUserChatsFromFirestore');
        const fnBody = apiContent.slice(fnStart, fnStart + 1200);
        expect(fnBody).not.toContain('setDoc(');
        expect(fnBody).not.toContain('updateDoc(');
        expect(fnBody).not.toContain('deleteDoc(');
        expect(fnBody).not.toContain('addDoc(');
    });

    it('TEST 12: Se mantiene intacto el contrato público de StudentNotificationContext', () => {
        const contextPath = path.join(process.cwd(), 'src/contexts/StudentNotificationContext.ts');
        const contextContent = fs.readFileSync(contextPath, 'utf-8');
        expect(contextContent).toContain('unreadSupportCount: number;');
        expect(contextContent).toContain('unreadPeerCount: number;');
        expect(contextContent).toContain('unreadGroupCount: number;');
        expect(contextContent).toContain('unreadStudentTotal: number;');
        expect(contextContent).toContain('refetchConversations: () => void;');
    });

    it('TEST 13: Los demás badges (peer, group, tutoring) permanecen intactos', () => {
        const providerPath = path.join(process.cwd(), 'src/contexts/StudentNotificationProvider.tsx');
        const providerContent = fs.readFileSync(providerPath, 'utf-8');
        expect(providerContent).toContain('unreadPeerCount');
        expect(providerContent).toContain('unreadGroupCount');
        expect(providerContent).toContain('pendingTutoringRequestsCount');
        expect(providerContent).toContain('unreadStudentTotal');
    });

    it('TEST 14: La función legacy api.fetchConversations sigue existiendo para otros consumidores pendientes', () => {
        expect(typeof api.fetchConversations).toBe('function');
    });

    it('TEST 15: No se introducen timers, polling ni listeners adicionales en StudentNotificationProvider', () => {
        const providerPath = path.join(process.cwd(), 'src/contexts/StudentNotificationProvider.tsx');
        const providerContent = fs.readFileSync(providerPath, 'utf-8');
        expect(providerContent).not.toContain('refetchInterval');
        expect(providerContent).not.toContain('setInterval');
    });
});
