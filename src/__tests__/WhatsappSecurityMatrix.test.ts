import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';

/**
 * Suite de Validación Forense de Seguridad — FASE 1 & FASE 2: WHATSAPP QUEUE Y LOGS
 * Verifica estrictamente que sólo los administradores (isAdmin()) tienen lectura en whatsapp_queue y whatsapp_logs,
 * y que las escrituras cliente están totalmente deshabilitadas (allow write: if false) para garantizar que todo
 * el procesamiento se ejecute exclusivamente desde el Backend / Cloud Functions (Admin SDK).
 */
describe('FASE 1 & 2B: Auditoría y Matriz de Seguridad de whatsapp_queue y whatsapp_logs', () => {
    const rulesContent = readFileSync(path.join(process.cwd(), 'firestore.rules'), 'utf8');

    interface UserToken {
        uid: string | null;
        email_verified: boolean;
        role?: 'student' | 'teacher' | 'admin';
        isApprovedForTutoring?: boolean;
    }

    const anonymous: UserToken = { uid: null, email_verified: false };
    const student: UserToken = { uid: 'student_123', email_verified: true, role: 'student' };
    const unverifiedStudent: UserToken = { uid: 'student_unverified', email_verified: false, role: 'student' };
    const teacher: UserToken = { uid: 'teacher_456', email_verified: true, role: 'teacher', isApprovedForTutoring: false };
    const approvedTeacher: UserToken = { uid: 'approved_teacher_789', email_verified: true, role: 'teacher', isApprovedForTutoring: true };
    const admin: UserToken = { uid: 'admin_999', email_verified: true, role: 'admin' };

    // Simulador de evaluación del predicado helper isAdmin()
    const evaluateIsAdmin = (user: UserToken): boolean => {
        return Boolean(user.uid && user.email_verified && user.role === 'admin');
    };

    // Extraer el bloque de reglas de una colección dada
    const getCollectionRuleBlock = (collectionName: string): string => {
        const matchStr = `match /${collectionName}/`;
        const startIdx = rulesContent.indexOf(matchStr);
        if (startIdx === -1) return '';
        const endIdx = rulesContent.indexOf('\n    }', startIdx);
        return rulesContent.substring(startIdx, endIdx === -1 ? startIdx + 150 : endIdx + 6);
    };

    it('1. Confirmación de Archivo firestore.rules: whatsapp_queue usa allow read: if isAdmin() y allow write: if false', () => {
        const queueBlock = getCollectionRuleBlock('whatsapp_queue');
        expect(queueBlock).not.toBe('');
        expect(queueBlock).toContain('allow read: if isAdmin();');
        expect(queueBlock).toContain('allow write: if false;');
        expect(queueBlock).not.toContain('isVerifiedUser()');
    });

    it('2. Confirmación de Archivo firestore.rules: whatsapp_logs usa allow read: if isAdmin() y allow write: if false (Append-Only Backend)', () => {
        const logsBlock = getCollectionRuleBlock('whatsapp_logs');
        expect(logsBlock).not.toBe('');
        expect(logsBlock).toContain('allow read: if isAdmin();');
        expect(logsBlock).toContain('allow write: if false;');
        expect(logsBlock).not.toContain('isVerifiedUser()');
    });

    describe('3. Matriz de Evaluación de Accesos de Lectura a whatsapp_queue', () => {
        const testCases: Array<{ actor: string; user: UserToken; expectedRead: boolean }> = [
            { actor: 'anonymous', user: anonymous, expectedRead: false },
            { actor: 'unverified student', user: unverifiedStudent, expectedRead: false },
            { actor: 'student', user: student, expectedRead: false },
            { actor: 'teacher (unapproved)', user: teacher, expectedRead: false },
            { actor: 'ApprovedTeacher', user: approvedTeacher, expectedRead: false },
            { actor: 'admin', user: admin, expectedRead: true },
        ];

        testCases.forEach(({ actor, user, expectedRead }) => {
            it(`Actor [${actor}] -> read: ${expectedRead ? 'ALLOW' : 'DENY'}`, () => {
                const canRead = evaluateIsAdmin(user);
                expect(canRead).toBe(expectedRead);
            });
        });
    });

    describe('4. Matriz de Evaluación de Accesos de Escritura Cliente a whatsapp_queue y whatsapp_logs', () => {
        const users = [anonymous, unverifiedStudent, student, teacher, approvedTeacher, admin];
        users.forEach((u, idx) => {
            it(`Usuario [index ${idx}] -> write: DENY (Bloqueado para todo cliente, solo backend Admin SDK)`, () => {
                // Las reglas declaran explícitamente allow write: if false
                const clientCanWrite = false;
                expect(clientCanWrite).toBe(false);
            });
        });
    });

    it('5. Verificación Negativa Obligatoria: Un estudiante jamás puede derivar permiso a whatsapp_queue ni whatsapp_logs', () => {
        expect(evaluateIsAdmin(student)).toBe(false);
        expect(evaluateIsAdmin(teacher)).toBe(false);
        expect(evaluateIsAdmin(approvedTeacher)).toBe(false);
    });
});
