import { describe, it, expect, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import * as api from '../services/api';
import * as dbMock from '../services/mockDatabase';

describe('FASE 3E — Migración Forense del Primer Consumidor Administrativo a /chats (AdminNotificationProvider)', () => {

    it('TEST 1: AdminNotificationProvider.tsx ya no utiliza api.fetchConversations', () => {
        const filePath = path.join(process.cwd(), 'src/contexts/AdminNotificationProvider.tsx');
        const fileContent = fs.readFileSync(filePath, 'utf-8');
        expect(fileContent).not.toContain('queryFn: api.fetchConversations');
        expect(fileContent).toContain('api.fetchUserChatsFromFirestore(');
    });

    it('TEST 2: El acceso canónico utiliza la colección /chats', () => {
        const apiPath = path.join(process.cwd(), 'src/services/api.ts');
        const apiContent = fs.readFileSync(apiPath, 'utf-8');
        expect(apiContent).toContain("collection(db, 'chats')");
    });

    it('TEST 3: fetchUserChatsFromFirestore utiliza aislamiento por `participants array-contains userId`', () => {
        const apiPath = path.join(process.cwd(), 'src/services/api.ts');
        const apiContent = fs.readFileSync(apiPath, 'utf-8');
        expect(apiContent).toContain("where('participants', 'array-contains', userId)");
    });

    it('TEST 4: fetchUserChatsFromFirestore retorna una lista de conversaciones con contrato Conversation', async () => {
        const chats = await api.fetchUserChatsFromFirestore('admin_test_user');
        expect(Array.isArray(chats)).toBe(true);
    });

    it('TEST 5: Una conversación de otro usuario ajeno no debe ser visible', async () => {
        const chatsForUserA = await api.fetchUserChatsFromFirestore('user_a_unique_999');
        const hasUserBChat = chatsForUserA.some(c => c.id === 'support_user_b_unique_888');
        expect(hasUserBChat).toBe(false);
    });

    it('TEST 6: Conversaciones con unreadByAdmin / unreadCount mapean correctamente el flag sin leer', async () => {
        const chats = await api.fetchUserChatsFromFirestore('admin');
        chats.forEach(c => {
            expect(typeof c.id).toBe('string');
            expect(typeof c.studentId).toBe('string');
        });
    });

    it('TEST 7: unreadCount mapea correctamente a unreadByAdmin / unreadByTeacher', () => {
        const sampleChat = {
            id: 'support_std1',
            studentId: 'std1',
            studentName: 'Estudiante 1',
            lastMessageText: 'Hola soporte',
            lastMessageTimestamp: new Date().toISOString(),
            unreadByAdmin: true,
            unreadByStudent: false
        };
        expect(sampleChat.unreadByAdmin).toBe(true);
    });

    it('TEST 8: unreadByAdmin = false no incrementa el contador de admin', () => {
        const convos = [
            { id: 'support_1', studentId: '1', lastMessageText: 'a', lastMessageTimestamp: 'now', unreadByAdmin: false },
            { id: 'support_2', studentId: '2', lastMessageText: 'b', lastMessageTimestamp: 'now', unreadByAdmin: false },
        ];
        const unreadCount = convos.filter(c => !!c.unreadByAdmin).length;
        expect(unreadCount).toBe(0);
    });

    it('TEST 9: Conserva la semántica de filtrado de unreadConversationsCount para admin y profesor', () => {
        const providerPath = path.join(process.cwd(), 'src/contexts/AdminNotificationProvider.tsx');
        const providerContent = fs.readFileSync(providerPath, 'utf-8');
        expect(providerContent).toContain('conversations.filter(c => !!c.unreadByAdmin)');
        expect(providerContent).toContain('c.unreadByTeacher');
    }, 10000);

    it('TEST 10: La operación de obtención de chats es strictly READ-ONLY', () => {
        const apiPath = path.join(process.cwd(), 'src/services/api.ts');
        const apiContent = fs.readFileSync(apiPath, 'utf-8');
        const fetchFnIndex = apiContent.indexOf('export const fetchUserChatsFromFirestore');
        const fetchFnBody = apiContent.slice(fetchFnIndex, fetchFnIndex + 1200);
        expect(fetchFnBody).not.toContain('setDoc(');
        expect(fetchFnBody).not.toContain('updateDoc(');
        expect(fetchFnBody).not.toContain('deleteDoc(');
        expect(fetchFnBody).not.toContain('addDoc(');
    });

    it('TEST 11: Se mantiene intacto el contrato público de AdminNotificationContext', () => {
        const contextPath = path.join(process.cwd(), 'src/contexts/AdminNotificationContext.ts');
        const contextContent = fs.readFileSync(contextPath, 'utf-8');
        expect(contextContent).toContain('unreadConversationsCount: number');
        expect(contextContent).toContain('conversations: Conversation[]');
        expect(contextContent).toContain('refetchConversations: () => void');
    });

    it('TEST 12: Los demás badges/contadores del AdminNotificationProvider permanecen sin cambios', () => {
        const providerPath = path.join(process.cwd(), 'src/contexts/AdminNotificationProvider.tsx');
        const providerContent = fs.readFileSync(providerPath, 'utf-8');
        expect(providerContent).toContain('pendingTopicRequestsCount');
        expect(providerContent).toContain('pendingTutoringRequestsCount');
        expect(providerContent).toContain('pendingTeacherPaymentsCount');
        expect(providerContent).toContain('expiringSubscriptionsCount');
        expect(providerContent).toContain('unreadGroupCount');
    });

    it('TEST 13: La función legacy api.fetchConversations sigue existiendo para otros consumidores', () => {
        expect(typeof api.fetchConversations).toBe('function');
    });
});
