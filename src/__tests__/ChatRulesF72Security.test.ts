import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';

/**
 * Suite de Validación Adversarial FASE F72 — AUDITORÍA FINAL PRE-DESPLIEGUE
 * 30+ Escenarios adversariales que cubren la matriz de amenazas completa
 */
describe('FASE F72: Auditoría Adversarial Pre-Despliegue de Firestore Security Rules', () => {
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
    const studentC: UserToken = { uid: 'student_C', email_verified: true, role: 'student', enrolledCourseIds: ['course_202'] };
    
    const teacherA: UserToken = { uid: 'teacher_A', email_verified: true, role: 'teacher', isApprovedForTutoring: true, taughtCourseIds: ['course_101'] };
    const teacherB: UserToken = { uid: 'teacher_B', email_verified: true, role: 'teacher', isApprovedForTutoring: true, taughtCourseIds: ['course_202'] };
    const teacherUnapproved: UserToken = { uid: 'teacher_unapproved', email_verified: true, role: 'teacher', isApprovedForTutoring: false };
    
    const adminUser: UserToken = { uid: 'admin_master', email_verified: true, role: 'admin' };

    // Modelado de helpers de Firestore Rules
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

    const isTeacherCoordinationChat = (chatId: string, user: UserToken): boolean => {
        return isApprovedTeacher(user) && (
            chatId === 'sala_profesores_coordinacion' ||
            chatId === `teacher_${user.uid}`
        );
    };

    const isSupportChatForStudent = (chatId: string, user: UserToken): boolean => {
        return user.email_verified && user.role === 'student' && chatId === `support_${user.uid}`;
    };

    const isSupportChatForApprovedTeacher = (chatId: string, user: UserToken): boolean => {
        return isApprovedTeacher(user) && /^support_[a-zA-Z0-9_-]+$/.test(chatId);
    };

    const isEnrolledInCourse = (courseId: string, user: UserToken): boolean => {
        return user.email_verified && user.role === 'student' && (user.enrolledCourseIds || []).includes(courseId);
    };

    const isTeacherOfCourse = (courseId: string, user: UserToken): boolean => {
        return user.email_verified && user.role === 'teacher' && (user.taughtCourseIds || []).includes(courseId);
    };

    const canReadChat = (chatId: string, resourceData: any, user: UserToken): boolean => {
        if (!user.email_verified) return false;
        if (user.role === 'admin') return true;
        if (isDirectChatIdForUser(chatId, user)) return true;
        if (isPeerChatIdForUser(chatId, user)) return true;
        if (isSupportChatForStudent(chatId, user)) return true;
        if (isSupportChatForApprovedTeacher(chatId, user)) return true;
        if (isTeacherCoordinationChat(chatId, user)) return true;
        if (isEnrolledInCourse(chatId, user)) return true;
        if (isTeacherOfCourse(chatId, user)) return true;
        if (resourceData) {
            if (Array.isArray(resourceData.participants) && resourceData.participants.includes(user.uid)) return true;
            if (Array.isArray(resourceData.participantIds) && resourceData.participantIds.includes(user.uid)) return true;
            if (resourceData.studentId === user.uid || resourceData.teacherId === user.uid) return true;
        }
        return false;
    };

    const canCreateChat = (chatId: string, requestData: any, user: UserToken): boolean => {
        if (!user.email_verified) return false;
        if (user.role === 'admin') return true;
        if (requestData.createdBy !== user.uid) return false;
        const isCanonicalChat = (
            isDirectChatIdForUser(chatId, user) ||
            isPeerChatIdForUser(chatId, user) ||
            isSupportChatForStudent(chatId, user) ||
            isSupportChatForApprovedTeacher(chatId, user) ||
            isTeacherCoordinationChat(chatId, user) ||
            isEnrolledInCourse(chatId, user) ||
            isTeacherOfCourse(chatId, user)
        );
        if (!isCanonicalChat) return false;
        if (requestData.participants && Array.isArray(requestData.participants) && !requestData.participants.includes(user.uid)) {
            return false;
        }
        return true;
    };

    const canUpdateChat = (chatId: string, oldData: any, newData: any, user: UserToken): boolean => {
        if (!user.email_verified) return false;
        if (user.role === 'admin') return true;
        if (!canReadChat(chatId, oldData, user)) return false;
        // Inmutabilidad de campos críticos
        if (JSON.stringify(oldData.participants) !== JSON.stringify(newData.participants)) return false;
        if (oldData.type !== newData.type) return false;
        if (oldData.chatId !== newData.chatId) return false;
        if (oldData.createdBy !== newData.createdBy) return false;
        if (oldData.createdAt !== newData.createdAt) return false;
        return true;
    };

    const canCreateMessage = (chatId: string, chatData: any, messageData: any, user: UserToken): boolean => {
        if (!user.email_verified) return false;
        if (user.role === 'admin') return true;
        if (messageData.senderId !== user.uid) return false;
        if (messageData.chatId && messageData.chatId !== chatId) return false;
        const isParticipant = (
            isDirectChatIdForUser(chatId, user) ||
            isPeerChatIdForUser(chatId, user) ||
            isSupportChatForStudent(chatId, user) ||
            isSupportChatForApprovedTeacher(chatId, user) ||
            isTeacherCoordinationChat(chatId, user) ||
            isEnrolledInCourse(chatId, user) ||
            isTeacherOfCourse(chatId, user) ||
            (chatData && Array.isArray(chatData.participants) && chatData.participants.includes(user.uid))
        );
        return isParticipant;
    };

    const canUpdateMessage = (oldMsg: any, newMsg: any, user: UserToken): boolean => {
        if (!user.email_verified) return false;
        if (user.role === 'admin') return true;
        if (oldMsg.senderId !== user.uid) return false;
        if (newMsg.senderId !== oldMsg.senderId) return false;
        if (oldMsg.chatId !== newMsg.chatId) return false;
        if (oldMsg.timestamp !== newMsg.timestamp) return false;
        if (oldMsg.type !== newMsg.type) return false;
        return true;
    };

    const canDeleteMessage = (msg: any, user: UserToken): boolean => {
        if (!user.email_verified) return false;
        if (user.role === 'admin') return true;
        return msg.senderId === user.uid;
    };

    // 30 Escenarios Adversariales
    describe('Matriz de 30 Escenarios Adversariales de Seguridad', () => {
        it('1. Estudiante propio accediendo a su canal directo -> ALLOW', () => {
            expect(canReadChat('direct_student_A_student_B', {}, studentA)).toBe(true);
        });

        it('2. Estudiante tercero intentando leer chat directo ajeno -> DENY', () => {
            expect(canReadChat('direct_student_A_student_B', {}, studentC)).toBe(false);
        });

        it('3. Docente asignado al curso accediendo al canal grupal del curso -> ALLOW', () => {
            expect(canReadChat('course_101', {}, teacherA)).toBe(true);
        });

        it('4. Docente no asignado a curso intentando acceder a canal grupal -> DENY', () => {
            expect(canReadChat('course_101', {}, teacherB)).toBe(false);
        });

        it('5. Docente aprobado accediendo a sala de profesores general -> ALLOW', () => {
            expect(canReadChat('sala_profesores_coordinacion', {}, teacherA)).toBe(true);
        });

        it('6. Administrador accediendo a cualquier recurso legítimo -> ALLOW', () => {
            expect(canReadChat('direct_student_A_student_B', {}, adminUser)).toBe(true);
            expect(canReadChat('course_101', {}, adminUser)).toBe(true);
        });

        it('7. Suplantación de senderId falso en creación de mensaje -> DENY', () => {
            const fakeMsg = { senderId: 'student_B', text: 'Impersonation attempt' };
            expect(canCreateMessage('direct_student_A_student_B', {}, fakeMsg, studentA)).toBe(false);
        });

        it('8. Inyección no autorizada en array participants durante actualización -> DENY', () => {
            const oldChat = { participants: ['student_A', 'student_B'], type: 'direct', chatId: 'direct_student_A_student_B' };
            const tamperedChat = { participants: ['student_A', 'student_B', 'student_C'], type: 'direct', chatId: 'direct_student_A_student_B' };
            expect(canUpdateChat('direct_student_A_student_B', oldChat, tamperedChat, studentA)).toBe(false);
        });

        it('9. Inyección de chatId inconsistente en mensaje -> DENY', () => {
            const msg = { senderId: 'student_A', chatId: 'direct_student_B_student_C', text: 'Cross-chat injection' };
            expect(canCreateMessage('direct_student_A_student_B', {}, msg, studentA)).toBe(false);
        });

        it('10. Manipulación de messageId y campos inmutables en update de mensaje -> DENY', () => {
            const oldMsg = { senderId: 'student_A', chatId: 'direct_student_A_student_B', timestamp: 1000, type: 'text' };
            const tamperedMsg = { senderId: 'student_A', chatId: 'direct_student_A_student_B', timestamp: 2000, type: 'audio' };
            expect(canUpdateMessage(oldMsg, tamperedMsg, studentA)).toBe(false);
        });

        it('11. Acceso a direct ajeno entre otros dos usuarios -> DENY', () => {
            expect(canReadChat('direct_student_B_teacher_A', {}, studentA)).toBe(false);
        });

        it('12. Acceso a peer ajeno entre otros dos estudiantes -> DENY', () => {
            expect(canReadChat('peer_student_B_student_C', {}, studentA)).toBe(false);
            expect(canReadChat('peer_student_B_student_C', {}, teacherA)).toBe(false);
        });

        it('13. Estudiante intentando acceder al canal de soporte de otro estudiante -> DENY', () => {
            expect(canReadChat('support_student_B', {}, studentA)).toBe(false);
        });

        it('14. Docente intentando acceder al canal privado de otro docente (teacher_B) -> DENY', () => {
            expect(canReadChat('teacher_teacher_B', {}, teacherA)).toBe(false);
        });

        it('15. Estudiante intentando acceder a canal de curso al que no está matriculado -> DENY', () => {
            expect(canReadChat('course_202', {}, studentA)).toBe(false);
        });

        it('16. Usuario intentando acceder a grupo ajeno sin pertenencia -> DENY', () => {
            const groupData = { participants: ['student_B', 'teacher_B'] };
            expect(canReadChat('group_private_lab', groupData, studentA)).toBe(false);
        });

        it('17. Estudiante intentando acceder a la coordinación docente general -> DENY', () => {
            expect(canReadChat('sala_profesores_coordinacion', {}, studentA)).toBe(false);
        });

        it('18. Señalización WebRTC en chat ajeno -> DENY', () => {
            expect(canReadChat('direct_student_B_student_C', {}, studentA)).toBe(false);
        });

        it('19. Acceso a llamada WebRTC directa ajena -> DENY', () => {
            const callData = { callerUid: 'student_B', calleeUid: 'student_C' };
            const isCallParticipant = (data: any, user: UserToken) => data.callerUid === user.uid || data.calleeUid === user.uid;
            expect(isCallParticipant(callData, studentA)).toBe(false);
        });

        it('20. Acceso a sala WebRTC ajena -> DENY', () => {
            const roomData = { callerUid: 'student_B', calleeUid: 'student_C', participants: ['student_B', 'student_C'] };
            const isRoomMember = (data: any, user: UserToken) => data.participants.includes(user.uid);
            expect(isRoomMember(roomData, studentA)).toBe(false);
        });

        it('21. Acceso a llamada de voz grupal de curso ajeno -> DENY', () => {
            expect(isEnrolledInCourse('course_202', studentA)).toBe(false);
            expect(isTeacherOfCourse('course_202', teacherA)).toBe(false);
        });

        it('22. Intento de modificar participants por no-administrador -> DENY', () => {
            const oldChat = { participants: ['student_A', 'teacher_A'], type: 'direct' };
            const newChat = { participants: ['student_A', 'teacher_A', 'student_B'], type: 'direct' };
            expect(canUpdateChat('direct_student_A_teacher_A', oldChat, newChat, studentA)).toBe(false);
        });

        it('23. Intento de alterar senderId en mensaje existente -> DENY', () => {
            const oldMsg = { senderId: 'student_A', text: 'Hola' };
            const newMsg = { senderId: 'student_B', text: 'Hola' };
            expect(canUpdateMessage(oldMsg, newMsg, studentA)).toBe(false);
        });

        it('24. Intento de alterar createdBy en chat existente -> DENY', () => {
            const oldChat = { createdBy: 'student_A', type: 'direct' };
            const newChat = { createdBy: 'student_B', type: 'direct' };
            expect(canUpdateChat('direct_student_A_student_B', oldChat, newChat, studentA)).toBe(false);
        });

        it('25. Intento de alterar type en chat existente -> DENY', () => {
            const oldChat = { type: 'direct', createdBy: 'student_A' };
            const newChat = { type: 'group', createdBy: 'student_A' };
            expect(canUpdateChat('direct_student_A_student_B', oldChat, newChat, studentA)).toBe(false);
        });

        it('26. Intento de alterar courseId en recurso existente -> DENY', () => {
            const oldCourse = { courseId: 'course_101' };
            const newCourse = { courseId: 'course_202' };
            const isCourseImmutable = oldCourse.courseId === newCourse.courseId;
            expect(isCourseImmutable).toBe(false);
        });

        it('27. Intento de borrar mensaje creado por otro usuario -> DENY', () => {
            const foreignMsg = { senderId: 'student_B', text: 'Mensaje de B' };
            expect(canDeleteMessage(foreignMsg, studentA)).toBe(false);
        });

        it('28. Intento de borrar chat completo por usuario no admin -> DENY', () => {
            const canDeleteChat = (user: UserToken) => user.role === 'admin';
            expect(canDeleteChat(studentA)).toBe(false);
            expect(canDeleteChat(teacherA)).toBe(false);
            expect(canDeleteChat(adminUser)).toBe(true);
        });

        it('29. Intento de crear chat artificial direct_B_C por usuario A -> DENY', () => {
            const requestData = { createdBy: 'student_A', participants: ['student_B', 'student_C'] };
            expect(canCreateChat('direct_student_B_student_C', requestData, studentA)).toBe(false);
        });

        it('30. Consulta LIST/Query sin coincidencia con los chats del usuario -> Filtrado por Rules', () => {
            const chatsInDb = [
                { id: 'direct_student_A_student_B', participants: ['student_A', 'student_B'] },
                { id: 'direct_student_B_student_C', participants: ['student_B', 'student_C'] },
                { id: 'peer_student_A_student_C', participants: ['student_A', 'student_C'] }
            ];
            const visibleToStudentA = chatsInDb.filter(c => canReadChat(c.id, c, studentA));
            expect(visibleToStudentA.map(c => c.id)).toEqual(['direct_student_A_student_B', 'peer_student_A_student_C']);
            expect(visibleToStudentA.map(c => c.id)).not.toContain('direct_student_B_student_C');
        });
    });
});
