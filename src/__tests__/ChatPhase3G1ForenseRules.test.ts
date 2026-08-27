import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';

/**
 * FASE 3G.1 — Test Forense de Reglas de Seguridad y Consultas de Colección en /chats
 */
describe('FASE 3G.1: Verificación Forense de /chats y Query Authorization', () => {
    const rulesContent = readFileSync(path.join(process.cwd(), 'firestore.rules'), 'utf8');

    // Extraer bloque match /chats/{chatId}
    const chatsMatch = rulesContent.substring(
        rulesContent.indexOf('match /chats/{chatId}'),
        rulesContent.indexOf('match /rooms/{roomId}') > -1 ? rulesContent.indexOf('match /rooms/{roomId}') : rulesContent.indexOf('match /calls/{callId}')
    );

    it('1. firestore.rules define una regla allow list separada de allow get para /chats', () => {
        expect(chatsMatch).toContain('allow get: if isChatParticipant();');
        expect(chatsMatch).toContain('allow list: if isSignedIn()');
    });

    it('2. allow list en /chats NO contiene llamadas a funciones basadas en chatId (como isDirectChatIdForUser) que bloqueen queries de colección', () => {
        const listRuleIndex = chatsMatch.indexOf('allow list:');
        const listRuleEnd = chatsMatch.indexOf(';', listRuleIndex);
        const listRuleText = chatsMatch.substring(listRuleIndex, listRuleEnd);

        expect(listRuleText).not.toContain('isDirectChatIdForUser');
        expect(listRuleText).not.toContain('isPeerChatIdForUser');
        expect(listRuleText).not.toContain('isSupportChatForStudent');
        expect(listRuleText).not.toContain('resource != null &&');
    });

    it('3. allow list evalúa directamente pertenencia mediante request.auth.uid in resource.data.participants', () => {
        const listRuleIndex = chatsMatch.indexOf('allow list:');
        const listRuleEnd = chatsMatch.indexOf(';', listRuleIndex);
        const listRuleText = chatsMatch.substring(listRuleIndex, listRuleEnd);

        expect(listRuleText).toContain('request.auth.uid in resource.data.participants');
    });

    // Simulador lógico de evaluación de reglas
    interface AuthContext {
        uid: string | null;
        role?: 'student' | 'teacher' | 'admin';
    }

    const canListChats = (auth: AuthContext, queryWhereField?: string, queryWhereValue?: string, docData?: any): boolean => {
        // 1. Auth check
        if (!auth || !auth.uid) return false;

        // 2. Admin escape hatch
        if (auth.role === 'admin') return true;

        // 3. Query constraint validation (static authorization by Firestore engine)
        if (queryWhereField === 'participants' && queryWhereValue !== auth.uid) {
            return false; // Intento de consultar chats de otro usuario -> DENY
        }

        // 4. Document level validation if query matches
        if (docData && Array.isArray(docData.participants)) {
            return docData.participants.includes(auth.uid);
        }

        return queryWhereField === 'participants' && queryWhereValue === auth.uid;
    };

    it('4. Usuario autenticado + participante -> ALLOW', () => {
        const user = { uid: 'teacher_123', role: 'teacher' as const };
        const doc = { participants: ['teacher_123', 'student_456'] };
        expect(canListChats(user, 'participants', 'teacher_123', doc)).toBe(true);
    });

    it('5. Usuario autenticado + no participante -> DENY', () => {
        const user = { uid: 'teacher_999', role: 'teacher' as const };
        const doc = { participants: ['teacher_123', 'student_456'] };
        expect(canListChats(user, 'participants', 'teacher_999', doc)).toBe(false);
    });

    it('6. Usuario no autenticado -> DENY', () => {
        const user = { uid: null };
        const doc = { participants: ['teacher_123', 'student_456'] };
        expect(canListChats(user, 'participants', 'teacher_123', doc)).toBe(false);
    });

    it('7. Teacher participante en query where("participants", "array-contains", teacherUid) -> ALLOW', () => {
        const teacher = { uid: 'pi7jAeeuUsebanz0F7pGhXVjzB13', role: 'teacher' as const };
        const doc = { participants: ['pi7jAeeuUsebanz0F7pGhXVjzB13', 'student_001'] };
        expect(canListChats(teacher, 'participants', 'pi7jAeeuUsebanz0F7pGhXVjzB13', doc)).toBe(true);
    });

    it('8. Student participante en query where("participants", "array-contains", studentUid) -> ALLOW', () => {
        const student = { uid: 'student_777', role: 'student' as const };
        const doc = { participants: ['teacher_123', 'student_777'] };
        expect(canListChats(student, 'participants', 'student_777', doc)).toBe(true);
    });

    it('9. Consulta donde el filtro array-contains no coincide con request.auth.uid -> DENY', () => {
        const student = { uid: 'student_777', role: 'student' as const };
        expect(canListChats(student, 'participants', 'other_user_id')).toBe(false);
    });
});
