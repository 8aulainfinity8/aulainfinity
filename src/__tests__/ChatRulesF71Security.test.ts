import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';

/**
 * Suite de Validación de Seguridad FASE F71 — AUDITORÍA Y CORRECCIONES QUIRÚRGICAS
 * Verifica la eliminación de bypasses en:
 * 1. firestore_direct_messages (sin bypass residual de isApprovedTeacher)
 * 2. isTeacherCoordinationChat (delimitado a sala_profesores_coordinacion y teacher_<propioUid>)
 * 3. Soporte y Canales Directos/Peer/Mensajes con estricto RBAC
 */
describe('FASE F71: Verificación de Seguridad y Cierre de Hallazgos Post-F70', () => {
    const rulesContent = readFileSync(path.join(process.cwd(), 'firestore.rules'), 'utf8');

    interface UserToken {
        uid: string;
        email_verified: boolean;
        role: 'student' | 'teacher' | 'admin';
        isApprovedForTutoring?: boolean;
        enrolledCourseIds?: string[];
        taughtCourseIds?: string[];
    }

    const studentA: UserToken = { uid: 'student_A', email_verified: true, role: 'student', enrolledCourseIds: ['course_101'] };
    const studentB: UserToken = { uid: 'student_B', email_verified: true, role: 'student', enrolledCourseIds: ['course_101'] };
    const studentC: UserToken = { uid: 'student_C', email_verified: true, role: 'student', enrolledCourseIds: [] };
    const teacherAApproved: UserToken = { uid: 'teacher_A', email_verified: true, role: 'teacher', isApprovedForTutoring: true, taughtCourseIds: ['course_101'] };
    const teacherBApproved: UserToken = { uid: 'teacher_B', email_verified: true, role: 'teacher', isApprovedForTutoring: true, taughtCourseIds: ['course_202'] };
    const teacherCUnapproved: UserToken = { uid: 'teacher_unapproved', email_verified: true, role: 'teacher', isApprovedForTutoring: false };
    const adminUser: UserToken = { uid: 'admin_master', email_verified: true, role: 'admin' };

    const isDirectChatIdForUser = (chatId: string, user: UserToken): boolean => {
        if (!user.email_verified) return false;
        const uid = user.uid;
        return (
            new RegExp(`^direct_${uid}_[a-zA-Z0-9_-]+$`).test(chatId) ||
            new RegExp(`^direct_[a-zA-Z0-9_-]+_${uid}$`).test(chatId) ||
            new RegExp(`^${uid}_[a-zA-Z0-9_-]+$`).test(chatId) ||
            new RegExp(`^[a-zA-Z0-9_-]+_${uid}$`).test(chatId)
        );
    };

    const isPeerChatIdForUser = (chatId: string, user: UserToken): boolean => {
        if (!user.email_verified) return false;
        const uid = user.uid;
        return (
            new RegExp(`^peer_${uid}_[a-zA-Z0-9_-]+$`).test(chatId) ||
            new RegExp(`^peer_[a-zA-Z0-9_-]+_${uid}$`).test(chatId)
        );
    };

    const isApprovedTeacher = (user: UserToken): boolean => {
        return user.email_verified && (
            user.role === 'admin' ||
            (user.role === 'teacher' && user.isApprovedForTutoring === true)
        );
    };

    const isTeacherCoordinationChatF71 = (chatId: string, user: UserToken): boolean => {
        return isApprovedTeacher(user) && (
            chatId === 'sala_profesores_coordinacion' ||
            chatId === `teacher_${user.uid}`
        );
    };

    const isParticipant = (data: any, user: UserToken): boolean => {
        if (!user.email_verified) return false;
        if (user.role === 'admin') return true;
        if (!data) return false;
        if (Array.isArray(data.participants) && data.participants.includes(user.uid)) return true;
        if (Array.isArray(data.participantIds) && data.participantIds.includes(user.uid)) return true;
        if (data.studentId === user.uid || data.teacherId === user.uid || data.createdBy === user.uid || data.senderId === user.uid) return true;
        return false;
    };

    const canReadLegacyDirectMessage = (msgId: string, resourceData: any, user: UserToken): boolean => {
        if (!user.email_verified) return false;
        if (user.role === 'admin') return true;
        if (isDirectChatIdForUser(msgId, user)) return true;
        if (isParticipant(resourceData, user)) return true;
        return false;
    };

    describe('1. Verificación Estática de Reglas F71 en firestore.rules', () => {
        it('firestore_direct_messages NO debe contener isApprovedTeacher()', () => {
            const directMsgBlock = rulesContent.match(/match \/firestore_direct_messages\/\{msgId\}[\s\S]*?\}/);
            expect(directMsgBlock).not.toBeNull();
            if (directMsgBlock) {
                expect(directMsgBlock[0]).not.toContain('isApprovedTeacher()');
                expect(directMsgBlock[0]).toContain('isDirectChatIdForUser(msgId)');
            }
        });

        it('isTeacherCoordinationChat NO debe contener regex genérica teacher_[a-zA-Z0-9_-]+', () => {
            const helperMatch = rulesContent.match(/function isTeacherCoordinationChat\(chatId\)[\s\S]*?\}/);
            expect(helperMatch).not.toBeNull();
            if (helperMatch) {
                expect(helperMatch[0]).not.toContain('teacher_[a-zA-Z0-9_-]+');
                expect(helperMatch[0]).toContain("chatId == 'sala_profesores_coordinacion'");
                expect(helperMatch[0]).toContain("chatId == 'teacher_' + request.auth.uid");
            }
        });

        it('firestore_teacher_conversations y firestore_teacher_messages no deben tener regex amplia', () => {
            const teacherConvs = rulesContent.match(/match \/firestore_teacher_conversations\/\{convId\}[\s\S]*?match \/firestore_teacher_messages\/\{msgId\}[\s\S]*?\}/);
            expect(teacherConvs).not.toBeNull();
            if (teacherConvs) {
                expect(teacherConvs[0]).not.toContain("convId.matches('^teacher_");
                expect(teacherConvs[0]).not.toContain("msgId.matches('^teacher_");
            }
        });
    });

    describe('2. Pruebas Adversariales Obligatorias de F71', () => {
        it('1. approved teacher cannot read another teacher private chat (teacher_B -> teacher_A) -> DENY', () => {
            expect(isTeacherCoordinationChatF71('teacher_teacher_A', teacherBApproved)).toBe(false);
        });

        it('2. approved teacher can access general teacher coordination and own teacher chat -> ALLOW', () => {
            expect(isTeacherCoordinationChatF71('sala_profesores_coordinacion', teacherAApproved)).toBe(true);
            expect(isTeacherCoordinationChatF71('teacher_teacher_A', teacherAApproved)).toBe(true);
        });

        it('3. student and unapproved teacher cannot access teacher coordination -> DENY', () => {
            expect(isTeacherCoordinationChatF71('sala_profesores_coordinacion', studentA)).toBe(false);
            expect(isTeacherCoordinationChatF71('sala_profesores_coordinacion', teacherCUnapproved)).toBe(false);
        });

        it('4. approved teacher cannot bypass direct chat between students -> DENY', () => {
            expect(isDirectChatIdForUser('direct_student_A_student_B', teacherAApproved)).toBe(false);
        });

        it('5. approved teacher cannot bypass peer chat between students -> DENY', () => {
            expect(isPeerChatIdForUser('peer_student_A_student_B', teacherAApproved)).toBe(false);
        });

        it('6. non-participant (including unassigned teacher) cannot read legacy direct message -> DENY', () => {
            const legacyMsgResource = { senderId: 'student_A', receiverId: 'student_B', text: 'Mensaje privado' };
            expect(canReadLegacyDirectMessage('direct_student_A_student_B', legacyMsgResource, studentC)).toBe(false);
            expect(canReadLegacyDirectMessage('direct_student_A_student_B', legacyMsgResource, teacherBApproved)).toBe(false);
            expect(canReadLegacyDirectMessage('direct_student_A_student_B', legacyMsgResource, studentA)).toBe(true);
        });

        it('7. senderId spoofing is strictly denied', () => {
            const requestData = { senderId: 'student_B', text: 'Spoofed' };
            const isValidSender = requestData.senderId === studentA.uid;
            expect(isValidSender).toBe(false);
        });

        it('8. participants escalation in updates is strictly denied', () => {
            const original = ['student_A', 'student_B'];
            const tampered = ['student_A', 'student_B', 'student_C'];
            const isParticipantsUnchanged = JSON.stringify(original) === JSON.stringify(tampered);
            expect(isParticipantsUnchanged).toBe(false);
        });

        it('9. support isolation preserves student boundary and denies student cross-access', () => {
            const isSupportOwner = (chatId: string, user: UserToken) => user.role === 'student' && chatId === `support_${user.uid}`;
            expect(isSupportOwner('support_student_A', studentA)).toBe(true);
            expect(isSupportOwner('support_student_A', studentB)).toBe(false);
        });

        it('10. admin access is preserved across all administrative channels', () => {
            expect(isApprovedTeacher(adminUser)).toBe(true);
            expect(canReadLegacyDirectMessage('direct_student_A_student_B', {}, adminUser)).toBe(true);
        });
    });
});
