import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import * as api from '../services/api';
import { Conversation } from '../types';

describe('FASE 3H — Migración Forense del Consumidor AdminTeacherApprovalPage a /chats', () => {

    it('TEST 1: AdminTeacherApprovalPage.tsx ya no utiliza api.fetchConversations', () => {
        const filePath = path.join(process.cwd(), 'src/components/admin/AdminTeacherApprovalPage.tsx');
        const fileContent = fs.readFileSync(filePath, 'utf-8');
        expect(fileContent).not.toContain('queryFn: api.fetchConversations');
        expect(fileContent).toContain('api.fetchUserChatsFromFirestore');
    });

    it('TEST 2: AdminTeacherApprovalPage.tsx utiliza el hook useAuth para resolver el userId del usuario activo', () => {
        const filePath = path.join(process.cwd(), 'src/components/admin/AdminTeacherApprovalPage.tsx');
        const fileContent = fs.readFileSync(filePath, 'utf-8');
        expect(fileContent).toContain("useAuth()");
        expect(fileContent).toContain("api.fetchUserChatsFromFirestore(user.id)");
    });

    it('TEST 3: La fuente canónica utilizada en api.ts es la colección /chats', () => {
        const apiPath = path.join(process.cwd(), 'src/services/api.ts');
        const apiContent = fs.readFileSync(apiPath, 'utf-8');
        expect(apiContent).toContain("collection(db, 'chats')");
    });

    it('TEST 4: Existe aislamiento por usuario mediante where("participants", "array-contains", userId)', () => {
        const apiPath = path.join(process.cwd(), 'src/services/api.ts');
        const apiContent = fs.readFileSync(apiPath, 'utf-8');
        expect(apiContent).toContain("where('participants', 'array-contains', userId)");
    });

    it('TEST 5: fetchUserChatsFromFirestore retorna un arreglo de tipo Conversation con aislamiento por usuario', async () => {
        const chats = await api.fetchUserChatsFromFirestore('admin_test_id');
        expect(Array.isArray(chats)).toBe(true);
        const hasUnrelated = chats.some(c => c.id === 'unrelated_private_chat_123');
        expect(hasUnrelated).toBe(false);
    });

    it('TEST 6: Conserva la coherencia de las propiedades de Conversation', async () => {
        const chats = await api.fetchUserChatsFromFirestore('admin');
        chats.forEach(c => {
            expect(typeof c.id).toBe('string');
            expect(typeof c.studentId).toBe('string');
            expect(typeof c.unreadByStudent === 'boolean' || typeof c.unreadByStudent === 'undefined').toBe(true);
            expect(typeof c.unreadByTeacher === 'boolean' || typeof c.unreadByTeacher === 'undefined').toBe(true);
        });
    });

    it('TEST 7: No introduce componentes de polling nuevo ni escrituras secundarias en AdminTeacherApprovalPage.tsx', () => {
        const filePath = path.join(process.cwd(), 'src/components/admin/AdminTeacherApprovalPage.tsx');
        const fileContent = fs.readFileSync(filePath, 'utf-8');
        expect(fileContent).not.toContain('setInterval');
        expect(fileContent).not.toContain('onSnapshot');
        expect(fileContent).not.toContain('addDoc');
        expect(fileContent).not.toContain('setDoc');
    });

    it('TEST 8: La función legacy api.fetchConversations sigue existiendo en api.ts para otros consumidores pendientes de migrar', () => {
        expect(typeof api.fetchConversations).toBe('function');
    });
});
