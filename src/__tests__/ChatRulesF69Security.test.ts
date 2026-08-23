import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';

/**
 * Suite de Validación Exhaustiva de Matriz de Seguridad — FASE F69: CHAT SECURITY RULES
 * Evalúa los 18 casos de prueba canónicos y ataques de la matriz CHAT_RULES_TEST_MATRIX.md.
 */
describe('FASE F69: Matriz de Seguridad y Mitigación de Bypasses en Chat Rules', () => {
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
    const unverifiedStudent: UserToken = { uid: 'student_unverified', email_verified: false, role: 'student' };
    const teacherB: UserToken = { uid: 'teacher_B', email_verified: true, role: 'teacher', isApprovedForTutoring: true, taughtCourseIds: ['course_101'] };
    const teacherCUnapproved: UserToken = { uid: 'teacher_unapproved', email_verified: true, role: 'teacher', isApprovedForTutoring: false };
    const teacherDApproved: UserToken = { uid: 'teacher_D', email_verified: true, role: 'teacher', isApprovedForTutoring: true, taughtCourseIds: ['course_202'] };
    const adminUser: UserToken = { uid: 'admin_master', email_verified: true, role: 'admin' };

    // Reglas canónicas F69
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

    const isSupportChatForStudent = (chatId: string, user: UserToken): boolean => {
        return user.email_verified && user.role === 'student' && chatId === `support_${user.uid}`;
    };

    const isSupportChatId = (chatId: string): boolean => {
        return /^support_[a-zA-Z0-9_-]+$/.test(chatId);
    };

    const isApprovedTeacher = (user: UserToken): boolean => {
        return user.email_verified && (
            user.role === 'admin' ||
            (user.role === 'teacher' && user.isApprovedForTutoring === true)
        );
    };

    const isTeacherCoordinationChat = (chatId: string, user: UserToken): boolean => {
        return isApprovedTeacher(user) && (
            chatId === 'sala_profesores_coordinacion' ||
            chatId === `teacher_${user.uid}` ||
            /^teacher_[a-zA-Z0-9_-]+$/.test(chatId)
        );
    };

    const isEnrolledInCourse = (courseId: string, user: UserToken): boolean => {
        return user.email_verified && user.role === 'student' && (user.enrolledCourseIds || []).includes(courseId);
    };

    const isTeacherOfCourse = (courseId: string, user: UserToken): boolean => {
        return user.email_verified && user.role === 'teacher' && (user.taughtCourseIds || []).includes(courseId);
    };

    const isChatParticipant = (chatId: string, resourceData: any, user: UserToken): boolean => {
        if (!user.email_verified) return false;
        if (user.role === 'admin') return true;
        if (isDirectChatIdForUser(chatId, user)) return true;
        if (isPeerChatIdForUser(chatId, user)) return true;
        if (isSupportChatForStudent(chatId, user)) return true;
        if (isSupportChatId(chatId) && isApprovedTeacher(user)) return true;
        if (isTeacherCoordinationChat(chatId, user)) return true;
        if (isEnrolledInCourse(chatId, user)) return true;
        if (isTeacherOfCourse(chatId, user)) return true;
        if (resourceData) {
            if (Array.isArray(resourceData.participants) && resourceData.participants.includes(user.uid)) return true;
            if (Array.isArray(resourceData.participantIds) && resourceData.participantIds.includes(user.uid)) return true;
            if (resourceData.studentId === user.uid) return true;
            if (resourceData.teacherId === user.uid) return true;
        }
        return false;
    };

    const canCreateChat = (chatId: string, requestData: any, user: UserToken): boolean => {
        if (!user.email_verified) return false;
        if (user.role === 'admin') return true;
        const isLegitCreator = requestData && requestData.createdBy === user.uid;
        const isLegitPattern = (
            isDirectChatIdForUser(chatId, user) ||
            isPeerChatIdForUser(chatId, user) ||
            isSupportChatForStudent(chatId, user) ||
            (isSupportChatId(chatId) && isApprovedTeacher(user)) ||
            isTeacherCoordinationChat(chatId, user) ||
            isEnrolledInCourse(chatId, user) ||
            isTeacherOfCourse(chatId, user)
        );
        const hasSelfInParticipants = !requestData.participants || (Array.isArray(requestData.participants) && requestData.participants.includes(user.uid));
        return isLegitCreator && isLegitPattern && hasSelfInParticipants;
    };

    const canUpdateChat = (chatId: string, resourceData: any, requestData: any, user: UserToken): boolean => {
        if (!isChatParticipant(chatId, resourceData, user)) return false;
        if (user.role === 'admin') return true;
        if (requestData.participants && resourceData.participants && JSON.stringify(requestData.participants) !== JSON.stringify(resourceData.participants)) return false;
        if (requestData.participantIds && resourceData.participantIds && JSON.stringify(requestData.participantIds) !== JSON.stringify(resourceData.participantIds)) return false;
        if (requestData.type && resourceData.type && requestData.type !== resourceData.type) return false;
        if (requestData.chatId && resourceData.chatId && requestData.chatId !== resourceData.chatId) return false;
        if (requestData.createdBy && resourceData.createdBy && requestData.createdBy !== resourceData.createdBy) return false;
        if (requestData.createdAt && resourceData.createdAt && requestData.createdAt !== resourceData.createdAt) return false;
        return true;
    };

    const canCreateMessage = (chatId: string, requestData: any, user: UserToken): boolean => {
        if (!user.email_verified) return false;
        if (user.role === 'admin') return true;
        if (requestData.senderId !== user.uid) return false;
        if (requestData.chatId && requestData.chatId !== chatId) return false;
        return (
            isDirectChatIdForUser(chatId, user) ||
            isPeerChatIdForUser(chatId, user) ||
            isSupportChatForStudent(chatId, user) ||
            (isSupportChatId(chatId) && isApprovedTeacher(user)) ||
            isTeacherCoordinationChat(chatId, user) ||
            isEnrolledInCourse(chatId, user) ||
            isTeacherOfCourse(chatId, user)
        );
    };

    describe('1. Verificación Estática de Reglas en firestore.rules', () => {
        it('Debe contener las funciones helper canónicas isDirectChatIdForUser, isPeerChatIdForUser, isSupportChatForStudent', () => {
            expect(rulesContent).toContain('function isDirectChatIdForUser(chatId)');
            expect(rulesContent).toContain('function isPeerChatIdForUser(chatId)');
            expect(rulesContent).toContain('function isSupportChatForStudent(chatId)');
            expect(rulesContent).toContain('function isSupportChatId(chatId)');
            expect(rulesContent).toContain('function isTeacherCoordinationChat(chatId)');
        });

        it('Debe haber eliminado el bypass isApprovedTeacher() de las colecciones de peer conversations y peer messages', () => {
            const peerConvMatch = rulesContent.match(/match \/firestore_peer_conversations\/\{convId\}[\s\S]*?match \/firestore_peer_messages/);
            expect(peerConvMatch).not.toBeNull();
            if (peerConvMatch) {
                expect(peerConvMatch[0]).not.toContain('isApprovedTeacher()');
            }
        });

        it('Debe proteger firestore_teacher_conversations de accesos directos por estudiantes', () => {
            const teacherConvMatch = rulesContent.match(/match \/firestore_teacher_conversations\/\{convId\}[\s\S]*?match \/firestore_teacher_messages/);
            expect(teacherConvMatch).not.toBeNull();
            if (teacherConvMatch) {
                expect(teacherConvMatch[0]).not.toContain('isVerifiedUser() && (isIdParticipant(convId)');
            }
        });
    });

    describe('2. Evaluación de los 18 Casos de Prueba (CHAT_RULES_TEST_MATRIX.md)', () => {
        it('TC-01: Estudiante participante lee chat directo propio -> ALLOW', () => {
            expect(isChatParticipant('direct_student_A_student_B', { participants: ['student_A', 'student_B'] }, studentA)).toBe(true);
        });

        it('TC-02: Estudiante tercero lee chat directo ajeno -> DENY', () => {
            expect(isChatParticipant('direct_student_A_student_B', { participants: ['student_A', 'student_B'] }, studentC)).toBe(false);
        });

        it('TC-03: Docente no participante lee chat directo entre estudiantes -> DENY', () => {
            expect(isChatParticipant('direct_student_A_student_B', { participants: ['student_A', 'student_B'] }, teacherDApproved)).toBe(false);
        });

        it('TC-04: Admin lee cualquier chat -> ALLOW', () => {
            expect(isChatParticipant('direct_student_A_student_B', { participants: ['student_A', 'student_B'] }, adminUser)).toBe(true);
            expect(isChatParticipant('peer_student_A_student_B', { participants: ['student_A', 'student_B'] }, adminUser)).toBe(true);
            expect(isChatParticipant('support_student_A', { participants: ['student_A'] }, adminUser)).toBe(true);
        });

        it('TC-05: Estudiante crea chat directo canónico con él mismo como creador -> ALLOW', () => {
            const requestData = { createdBy: 'student_A', participants: ['student_A', 'student_B'], type: 'direct' };
            expect(canCreateChat('direct_student_A_student_B', requestData, studentA)).toBe(true);
        });

        it('TC-06: Estudiante intenta crear chat asignando createdBy ajeno (Spoofing) -> DENY', () => {
            const spoofedData = { createdBy: 'student_B', participants: ['student_A', 'student_B'], type: 'direct' };
            expect(canCreateChat('direct_student_A_student_B', spoofedData, studentA)).toBe(false);
        });

        it('TC-07: Estudiante intenta modificar array de participants en chat existente -> DENY', () => {
            const resource = { chatId: 'direct_student_A_student_B', createdBy: 'student_A', participants: ['student_A', 'student_B'] };
            const tamperedUpdate = { participants: ['student_A', 'student_B', 'student_C'] };
            expect(canUpdateChat('direct_student_A_student_B', resource, tamperedUpdate, studentA)).toBe(false);
        });

        it('TC-08: Estudiante envía mensaje con senderId propio en chat directo -> ALLOW', () => {
            const messageData = { senderId: 'student_A', chatId: 'direct_student_A_student_B', text: 'Hola' };
            expect(canCreateMessage('direct_student_A_student_B', messageData, studentA)).toBe(true);
        });

        it('TC-09: Estudiante intenta enviar mensaje suplantando senderId ajeno -> DENY', () => {
            const spoofedMsg = { senderId: 'student_B', chatId: 'direct_student_A_student_B', text: 'Suplantado' };
            expect(canCreateMessage('direct_student_A_student_B', spoofedMsg, studentA)).toBe(false);
        });

        it('TC-10: Estudiante lee chat de soporte propio -> ALLOW', () => {
            expect(isChatParticipant('support_student_A', { participants: ['student_A'] }, studentA)).toBe(true);
        });

        it('TC-11: Estudiante intenta leer chat de soporte de otro estudiante -> DENY', () => {
            expect(isChatParticipant('support_student_A', { participants: ['student_A'] }, studentB)).toBe(false);
        });

        it('TC-12: Docente aprobado lee chat de soporte -> ALLOW', () => {
            expect(isChatParticipant('support_student_A', { participants: ['student_A'] }, teacherB)).toBe(true);
        });

        it('TC-13: Docente lee chat de coordinación docente -> ALLOW', () => {
            expect(isChatParticipant('sala_profesores_coordinacion', {}, teacherB)).toBe(true);
        });

        it('TC-14: Estudiante intenta acceder a sala de profesores -> DENY', () => {
            expect(isChatParticipant('sala_profesores_coordinacion', {}, studentA)).toBe(false);
        });

        it('TC-15: Docente aprobado intenta espiar chat de pares entre estudiantes (peer_A_B) -> DENY', () => {
            expect(isChatParticipant('peer_student_A_student_B', { participants: ['student_A', 'student_B'] }, teacherDApproved)).toBe(false);
        });

        it('TC-16: Estudiante matriculado lee chat de curso -> ALLOW', () => {
            expect(isChatParticipant('course_101', {}, studentA)).toBe(true);
        });

        it('TC-17: Estudiante no matriculado intenta leer chat de curso -> DENY', () => {
            expect(isChatParticipant('course_101', {}, studentC)).toBe(false);
        });

        it('TC-18: Usuario con email no verificado intenta acceder a chat -> DENY', () => {
            expect(isChatParticipant('direct_student_unverified_student_B', {}, unverifiedStudent)).toBe(false);
            expect(canCreateChat('direct_student_unverified_student_B', { createdBy: 'student_unverified' }, unverifiedStudent)).toBe(false);
        });
    });
});
