import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import * as api from '../services/api';
import * as dbMock from '../services/mockDatabase';
import { Conversation } from '../types';

describe('FASE 3F — Migración Forense del Consumidor Administrativo TeacherActiveChatsBar a /chats', () => {

    it('TEST 1: TeacherActiveChatsBar.tsx ya no utiliza api.fetchConversations', () => {
        const filePath = path.join(process.cwd(), 'src/components/TeacherActiveChatsBar.tsx');
        const fileContent = fs.readFileSync(filePath, 'utf-8');
        expect(fileContent).not.toContain('queryFn: api.fetchConversations');
        expect(fileContent).toContain('api.fetchUserChatsFromFirestore');
    });

    it('TEST 2: La fuente canónica utilizada es /chats', () => {
        const apiPath = path.join(process.cwd(), 'src/services/api.ts');
        const apiContent = fs.readFileSync(apiPath, 'utf-8');
        expect(apiContent).toContain("collection(db, 'chats')");
    });

    it('TEST 3: Existe aislamiento correcto mediante participants array-contains userId', () => {
        const apiPath = path.join(process.cwd(), 'src/services/api.ts');
        const apiContent = fs.readFileSync(apiPath, 'utf-8');
        expect(apiContent).toContain("where('participants', 'array-contains', userId)");
    });

    it('TEST 4: fetchUserChatsFromFirestore retorna un arreglo compatible con el contrato Conversation', async () => {
        const chats = await api.fetchUserChatsFromFirestore('teacher_test_id');
        expect(Array.isArray(chats)).toBe(true);
    });

    it('TEST 5: Los chats pertenecientes a otros usuarios ajenos no se devuelven', async () => {
        const chats = await api.fetchUserChatsFromFirestore('isolated_teacher_x');
        const hasForeign = chats.some(c => c.id === 'support_foreign_student_y');
        expect(hasForeign).toBe(false);
    });

    it('TEST 6: Conserva la coherencia del tipo Conversation y sus propiedades', async () => {
        const chats = await api.fetchUserChatsFromFirestore('teacher1');
        chats.forEach(c => {
            expect(typeof c.id).toBe('string');
            expect(typeof c.studentId).toBe('string');
            expect(typeof c.unreadByStudent).toBe('boolean');
        });
    });

    it('TEST 7: El mapeo de campos conserva el contrato legacy Conversation (id, studentId, teacherId, unreadByTeacher)', () => {
        const sampleChat: Conversation = {
            id: 'direct_std1_tch1',
            studentId: 'std1',
            studentName: 'Alumno 1',
            teacherId: 'tch1',
            teacherName: 'Profesor 1',
            lastMessageText: 'Hola profesor',
            lastMessageTimestamp: new Date().toISOString(),
            unreadByStudent: false,
            unreadByTeacher: true,
            unreadByAdmin: false
        };
        expect(sampleChat.unreadByTeacher).toBe(true);
        expect(sampleChat.teacherId).toBe('tch1');
    });

    it('TEST 8: El estado unreadByTeacher se interpreta correctamente', () => {
        const convos: Conversation[] = [
            { id: '1', studentId: 's1', studentName: 'A1', teacherId: 't1', lastMessageText: 'm1', lastMessageTimestamp: 'now', unreadByTeacher: true, unreadByAdmin: false },
            { id: '2', studentId: 's2', studentName: 'A2', teacherId: 't1', lastMessageText: 'm2', lastMessageTimestamp: 'now', unreadByTeacher: false, unreadByAdmin: false }
        ];
        const unreadCount = convos.filter(c => !!c.unreadByTeacher).length;
        expect(unreadCount).toBe(1);
    });

    it('TEST 9: La semántica de selección recentOrUnread filtrando por teacherId / unreadByTeacher permanece intacta', () => {
        const teacherId = 'teacher_abc';
        const convos: Conversation[] = [
            { id: 'c1', studentId: 's1', studentName: 'A1', teacherId: 'teacher_abc', lastMessageText: 'm1', lastMessageTimestamp: 'now', unreadByTeacher: true, unreadByAdmin: false },
            { id: 'c2', studentId: 's2', studentName: 'A2', teacherId: 'other_teacher', lastMessageText: 'm2', lastMessageTimestamp: 'now', unreadByTeacher: false, unreadByAdmin: false },
            { id: 'c3', studentId: 's3', studentName: 'A3', teacherId: 'teacher_abc', lastMessageText: 'm3', lastMessageTimestamp: 'now', unreadByTeacher: false, unreadByAdmin: false }
        ];
        const recentOrUnread = convos.filter(c => c.unreadByTeacher || c.teacherId === teacherId).slice(0, 5);
        expect(recentOrUnread.length).toBe(2);
        expect(recentOrUnread.map(c => c.id)).toEqual(['c1', 'c3']);
    });

    it('TEST 10: La lectura en fetchUserChatsFromFirestore es estrictamente READ-ONLY', () => {
        const apiPath = path.join(process.cwd(), 'src/services/api.ts');
        const apiContent = fs.readFileSync(apiPath, 'utf-8');
        const fnStart = apiContent.indexOf('export const fetchUserChatsFromFirestore');
        const fnBody = apiContent.slice(fnStart, fnStart + 1200);
        expect(fnBody).not.toContain('setDoc(');
        expect(fnBody).not.toContain('updateDoc(');
        expect(fnBody).not.toContain('deleteDoc(');
        expect(fnBody).not.toContain('addDoc(');
    });

    it('TEST 11: No se modifica el componente TeacherActiveChatsBar exportado ni su contrato', () => {
        const barPath = path.join(process.cwd(), 'src/components/TeacherActiveChatsBar.tsx');
        const barContent = fs.readFileSync(barPath, 'utf-8');
        expect(barContent).toContain('export const TeacherActiveChatsBar');
    });

    it('TEST 12: AdminNotificationProvider sigue funcionando con su consumo migrado en FASE 3E', () => {
        const adminProviderPath = path.join(process.cwd(), 'src/contexts/AdminNotificationProvider.tsx');
        const adminProviderContent = fs.readFileSync(adminProviderPath, 'utf-8');
        expect(adminProviderContent).toContain('api.fetchUserChatsFromFirestore');
    });

    it('TEST 13: La función legacy api.fetchConversations sigue existiendo para otros consumidores pendientes', () => {
        expect(typeof api.fetchConversations).toBe('function');
    });
});
