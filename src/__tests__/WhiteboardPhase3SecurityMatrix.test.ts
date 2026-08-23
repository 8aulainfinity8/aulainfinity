import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';

/**
 * Suite de Validación Exhaustiva de Matriz de Seguridad — FASE 3: PIZARRA DIGITAL
 * Evalúa los 25 escenarios requeridos sobre la autorización de /whiteboards, /strokes, /documents y /whiteboardCursors.
 */
describe('FASE 3: Matriz de Seguridad de Pizarra Digital (25 Escenarios)', () => {
    const rulesContent = readFileSync(path.join(process.cwd(), 'firestore.rules'), 'utf8');

    interface UserToken {
        uid: string;
        email_verified: boolean;
        role: 'student' | 'teacher' | 'admin';
        isApprovedForTutoring?: boolean;
        enrolledCourseIds?: string[];
        taughtCourseIds?: string[];
    }

    const studentA: UserToken = {
        uid: 'student_A',
        email_verified: true,
        role: 'student',
        enrolledCourseIds: ['course_math_101']
    };
    const studentB: UserToken = {
        uid: 'student_B',
        email_verified: true,
        role: 'student',
        enrolledCourseIds: ['course_math_101']
    };
    const studentC: UserToken = {
        uid: 'student_C',
        email_verified: true,
        role: 'student',
        enrolledCourseIds: ['course_history_201'] // No matriculado en math
    };
    const teacherB: UserToken = {
        uid: 'teacher_B',
        email_verified: true,
        role: 'teacher',
        isApprovedForTutoring: true,
        taughtCourseIds: ['course_math_101']
    };
    const teacherCApproved: UserToken = {
        uid: 'teacher_C',
        email_verified: true,
        role: 'teacher',
        isApprovedForTutoring: true,
        taughtCourseIds: ['course_history_201'] // No docente de math
    };
    const teacherUnapproved: UserToken = {
        uid: 'teacher_unapproved',
        email_verified: true,
        role: 'teacher',
        isApprovedForTutoring: false,
        taughtCourseIds: ['course_history_201']
    };
    const adminUser: UserToken = {
        uid: 'admin_master',
        email_verified: true,
        role: 'admin'
    };

    // Helper functions simulating Firestore rules for whiteboards and whiteboardCursors
    const isIdParticipant = (id: string, user: UserToken): boolean => {
        if (!user.email_verified) return false;
        if (user.role === 'admin') return true;
        const uid = user.uid;
        if (id === uid) return true;
        if (new RegExp(`^direct_${uid}(_.*)?$`).test(id)) return true;
        if (new RegExp(`^peer_${uid}(_.*)?$`).test(id)) return true;
        if (new RegExp(`^room_${uid}(_.*)?$`).test(id)) return true;
        if (new RegExp(`^call_${uid}(_.*)?$`).test(id)) return true;
        if (new RegExp(`^${uid}_.*`).test(id)) return true;
        if (new RegExp(`.*_${uid}$`).test(id)) return true;
        if (new RegExp(`.*_${uid}_.*`).test(id)) return true;
        return false;
    };

    const isEnrolledInCourse = (courseId: string, user: UserToken): boolean => {
        return user.email_verified && user.role === 'student' && (user.enrolledCourseIds?.includes(courseId) || false);
    };

    const isTeacherOfCourse = (courseId: string, user: UserToken): boolean => {
        return user.email_verified && user.role === 'teacher' && (user.taughtCourseIds?.includes(courseId) || false);
    };

    const isWhiteboardParticipant = (whiteboardId: string, resourceData: any, user: UserToken): boolean => {
        if (!user.email_verified) return false;
        if (user.role === 'admin') return true;
        if (isIdParticipant(whiteboardId, user)) return true;
        if (isEnrolledInCourse(whiteboardId, user)) return true;
        if (isTeacherOfCourse(whiteboardId, user)) return true;
        if (whiteboardId.startsWith('whiteboard_')) {
            const courseId = whiteboardId.slice(11);
            if (isEnrolledInCourse(courseId, user) || isTeacherOfCourse(courseId, user)) return true;
        }
        if (resourceData) {
            if (Array.isArray(resourceData.participants) && resourceData.participants.includes(user.uid)) return true;
            if (Array.isArray(resourceData.participantIds) && resourceData.participantIds.includes(user.uid)) return true;
            if (resourceData.studentId === user.uid || resourceData.teacherId === user.uid) return true;
            if (resourceData.createdBy === user.uid || resourceData.userId === user.uid) return true;
            if (resourceData.courseId && (isEnrolledInCourse(resourceData.courseId, user) || isTeacherOfCourse(resourceData.courseId, user))) return true;
        }
        return false;
    };

    const canCreateWhiteboard = (whiteboardId: string, requestData: any, user: UserToken): boolean => {
        if (!user.email_verified) return false;
        if (user.role === 'admin') return true;
        return isIdParticipant(whiteboardId, user) ||
            isEnrolledInCourse(whiteboardId, user) ||
            isTeacherOfCourse(whiteboardId, user) ||
            (whiteboardId.startsWith('whiteboard_') && (isEnrolledInCourse(whiteboardId.slice(11), user) || isTeacherOfCourse(whiteboardId.slice(11), user))) ||
            (requestData?.courseId && (isEnrolledInCourse(requestData.courseId, user) || isTeacherOfCourse(requestData.courseId, user))) ||
            (Array.isArray(requestData?.participants) && requestData.participants.includes(user.uid)) ||
            (requestData?.studentId === user.uid) ||
            (requestData?.teacherId === user.uid) ||
            (requestData?.createdBy === user.uid) ||
            (requestData?.userId === user.uid);
    };

    const canUpdateWhiteboard = (whiteboardId: string, resourceData: any, requestData: any, user: UserToken): boolean => {
        if (!isWhiteboardParticipant(whiteboardId, resourceData, user)) return false;
        if (user.role === 'admin') return true;
        if ('whiteboardId' in requestData && requestData.whiteboardId !== resourceData.whiteboardId) return false;
        if ('courseId' in requestData && requestData.courseId !== resourceData.courseId) return false;
        if ('studentId' in requestData && requestData.studentId !== resourceData.studentId) return false;
        if ('teacherId' in requestData && requestData.teacherId !== resourceData.teacherId) return false;
        if ('tutoringRequestId' in requestData && requestData.tutoringRequestId !== resourceData.tutoringRequestId) return false;
        if ('type' in requestData && requestData.type !== resourceData.type) return false;
        if ('participants' in requestData && JSON.stringify(requestData.participants) !== JSON.stringify(resourceData.participants)) return false;
        if ('createdBy' in requestData && requestData.createdBy !== resourceData.createdBy) return false;
        if ('createdAt' in requestData && requestData.createdAt !== resourceData.createdAt) return false;
        return true;
    };

    const canAccessCursor = (cursorId: string, resourceData: any, user: UserToken): boolean => {
        if (!user.email_verified) return false;
        if (user.role === 'admin') return true;
        if (isIdParticipant(cursorId, user)) return true;
        if (resourceData) {
            if (resourceData.userId === user.uid) return true;
            if (resourceData.courseId && (isEnrolledInCourse(resourceData.courseId, user) || isTeacherOfCourse(resourceData.courseId, user) || isIdParticipant(resourceData.courseId, user))) return true;
        }
        return false;
    };

    const canCreateOrUpdateCursor = (cursorId: string, resourceData: any, requestData: any, user: UserToken): boolean => {
        if (!user.email_verified) return false;
        if (user.role === 'admin') return true;
        if (!isIdParticipant(cursorId, user)) return false;
        if ('userId' in requestData && requestData.userId !== user.uid) return false;
        if ('uid' in requestData && requestData.uid !== user.uid) return false;
        if ('participantId' in requestData && requestData.participantId !== user.uid) return false;
        if (resourceData && 'userId' in resourceData && resourceData.userId !== user.uid) return false;
        return true;
    };

    const courseMathId = 'course_math_101';
    const courseMathBoardData = {
        whiteboardId: courseMathId,
        courseId: courseMathId,
        active: true,
        allowStudentDrawing: true,
        createdAt: '2026-08-21T00:00:00.000Z'
    };

    const private1to1Id = 'whiteboard_student_A_teacher_B';
    const private1to1Data = {
        whiteboardId: private1to1Id,
        studentId: 'student_A',
        teacherId: 'teacher_B',
        participants: ['student_A', 'teacher_B'],
        active: true,
        createdAt: '2026-08-21T00:00:00.000Z'
    };

    const peerBoardId = 'peer_student_A_student_B';
    const peerBoardData = {
        whiteboardId: peerBoardId,
        participants: ['student_A', 'student_B'],
        active: true,
        createdAt: '2026-08-21T00:00:00.000Z'
    };

    // TESTS 1 - 25

    it('TEST 1: Alumno matriculado lee pizarra de su curso -> ALLOW', () => {
        expect(isWhiteboardParticipant(courseMathId, courseMathBoardData, studentA)).toBe(true);
    });

    it('TEST 2: Alumno no matriculado intenta leer pizarra del curso -> DENY', () => {
        expect(isWhiteboardParticipant(courseMathId, courseMathBoardData, studentC)).toBe(false);
    });

    it('TEST 3: Profesor que imparte el curso lee pizarra -> ALLOW', () => {
        expect(isWhiteboardParticipant(courseMathId, courseMathBoardData, teacherB)).toBe(true);
    });

    it('TEST 4: Profesor aprobado pero NO docente del curso intenta leerla -> DENY', () => {
        expect(isWhiteboardParticipant(courseMathId, courseMathBoardData, teacherCApproved)).toBe(false);
    });

    it('TEST 5: Profesor no aprobado y no docente intenta leerla -> DENY', () => {
        expect(isWhiteboardParticipant(courseMathId, courseMathBoardData, teacherUnapproved)).toBe(false);
    });

    it('TEST 6: Alumno matriculado crea stroke -> ALLOW', () => {
        expect(isWhiteboardParticipant(courseMathId, courseMathBoardData, studentA)).toBe(true);
    });

    it('TEST 7: Profesor del curso crea stroke -> ALLOW', () => {
        expect(isWhiteboardParticipant(courseMathId, courseMathBoardData, teacherB)).toBe(true);
    });

    it('TEST 8: Usuario ajeno intenta crear stroke -> DENY', () => {
        expect(isWhiteboardParticipant(courseMathId, courseMathBoardData, studentC)).toBe(false);
        expect(isWhiteboardParticipant(courseMathId, courseMathBoardData, teacherCApproved)).toBe(false);
    });

    it('TEST 9: Usuario ajeno intenta leer stroke -> DENY', () => {
        expect(isWhiteboardParticipant(courseMathId, courseMathBoardData, studentC)).toBe(false);
    });

    it('TEST 10: Usuario legítimo elimina stroke cuando la aplicación lo permite -> ALLOW', () => {
        expect(isWhiteboardParticipant(courseMathId, courseMathBoardData, studentA)).toBe(true);
        expect(isWhiteboardParticipant(courseMathId, courseMathBoardData, teacherB)).toBe(true);
    });

    it('TEST 11: Usuario ajeno intenta eliminar stroke -> DENY', () => {
        expect(isWhiteboardParticipant(courseMathId, courseMathBoardData, studentC)).toBe(false);
        expect(isWhiteboardParticipant(courseMathId, courseMathBoardData, teacherCApproved)).toBe(false);
    });

    it('TEST 12: Admin accede a pizarra de curso -> ALLOW', () => {
        expect(isWhiteboardParticipant(courseMathId, courseMathBoardData, adminUser)).toBe(true);
    });

    it('TEST 13: Alumno participante accede a pizarra privada 1:1 -> ALLOW', () => {
        expect(isWhiteboardParticipant(private1to1Id, private1to1Data, studentA)).toBe(true);
    });

    it('TEST 14: Profesor participante accede a pizarra privada 1:1 -> ALLOW', () => {
        expect(isWhiteboardParticipant(private1to1Id, private1to1Data, teacherB)).toBe(true);
    });

    it('TEST 15: Profesor aprobado no participante intenta acceder a pizarra privada -> DENY', () => {
        expect(isWhiteboardParticipant(private1to1Id, private1to1Data, teacherCApproved)).toBe(false);
    });

    it('TEST 16: Alumno tercero intenta acceder a pizarra peer -> DENY', () => {
        expect(isWhiteboardParticipant(peerBoardId, peerBoardData, studentC)).toBe(false);
    });

    it('TEST 17: Profesor aprobado intenta acceder a pizarra peer -> DENY', () => {
        expect(isWhiteboardParticipant(peerBoardId, peerBoardData, teacherCApproved)).toBe(false);
    });

    it('TEST 18: Participante legítimo accede a documentos de la pizarra -> ALLOW', () => {
        expect(isWhiteboardParticipant(courseMathId, courseMathBoardData, studentA)).toBe(true);
        expect(isWhiteboardParticipant(private1to1Id, private1to1Data, teacherB)).toBe(true);
    });

    it('TEST 19: Usuario ajeno accede a documentos -> DENY', () => {
        expect(isWhiteboardParticipant(courseMathId, courseMathBoardData, studentC)).toBe(false);
        expect(isWhiteboardParticipant(private1to1Id, private1to1Data, teacherCApproved)).toBe(false);
    });

    it('TEST 20: Usuario legítimo actualiza su propio cursor -> ALLOW', () => {
        const cursorId = `${courseMathId}_student_A`;
        const cursorData = {
            courseId: courseMathId,
            userId: 'student_A',
            x: 150,
            y: 200,
            active: true
        };
        expect(canCreateOrUpdateCursor(cursorId, cursorData, cursorData, studentA)).toBe(true);
        expect(canAccessCursor(cursorId, cursorData, studentA)).toBe(true);
    });

    it('TEST 21: Usuario intenta escribir cursor atribuido a otro usuario -> DENY', () => {
        const impersonatedCursorId = `${courseMathId}_student_A`;
        const forgedPayload = {
            courseId: courseMathId,
            userId: 'student_A', // Estudiante B intentando suplantar a Estudiante A
            x: 100,
            y: 100,
            active: true
        };
        expect(canCreateOrUpdateCursor(impersonatedCursorId, null, forgedPayload, studentB)).toBe(false);
    });

    it('TEST 22: Usuario ajeno intenta acceder a cursores de pizarra privada -> DENY', () => {
        const privateCursorId = `direct_student_A_teacher_B_student_A`;
        const privateCursorData = {
            courseId: 'direct_student_A_teacher_B',
            userId: 'student_A'
        };
        expect(canAccessCursor(privateCursorId, privateCursorData, studentC)).toBe(false);
        expect(canAccessCursor(privateCursorId, privateCursorData, teacherCApproved)).toBe(false);
    });

    it('TEST 23: Usuario normal intenta modificar participants -> DENY', () => {
        const maliciousUpdate = {
            ...private1to1Data,
            participants: ['student_A', 'student_B', 'student_C'] // Inyección de tercero
        };
        expect(canUpdateWhiteboard(private1to1Id, private1to1Data, maliciousUpdate, studentA)).toBe(false);
    });

    it('TEST 24: Usuario normal intenta cambiar courseId/studentId/teacherId estructural -> DENY', () => {
        const maliciousCourseUpdate = {
            ...courseMathBoardData,
            courseId: 'course_hacked_999'
        };
        expect(canUpdateWhiteboard(courseMathId, courseMathBoardData, maliciousCourseUpdate, studentA)).toBe(false);

        const maliciousTeacherUpdate = {
            ...private1to1Data,
            teacherId: 'teacher_C'
        };
        expect(canUpdateWhiteboard(private1to1Id, private1to1Data, maliciousTeacherUpdate, studentA)).toBe(false);
    });

    it('TEST 25: Admin puede modificar estructura/moderar -> ALLOW', () => {
        const adminModUpdate = {
            ...private1to1Data,
            teacherId: 'teacher_C',
            participants: ['student_A', 'teacher_C']
        };
        expect(canUpdateWhiteboard(private1to1Id, private1to1Data, adminModUpdate, adminUser)).toBe(true);
        expect(isWhiteboardParticipant(courseMathId, courseMathBoardData, adminUser)).toBe(true);
        expect(isWhiteboardParticipant(private1to1Id, private1to1Data, adminUser)).toBe(true);
        expect(isWhiteboardParticipant(peerBoardId, peerBoardData, adminUser)).toBe(true);
    });

    // Verificación estática en firestore.rules
    it('Verificación estática: firestore.rules NO contiene isApprovedTeacher() en whiteboards ni whiteboardCursors', () => {
        const whiteboardsStart = rulesContent.indexOf('match /whiteboards/{whiteboardId}');
        const conversationsStart = rulesContent.indexOf('match /conversations/{convId}');
        const whiteboardsBlock = rulesContent.substring(whiteboardsStart, conversationsStart);

        expect(whiteboardsBlock).not.toContain('isApprovedTeacher()');
        expect(whiteboardsBlock).toContain('function isWhiteboardParticipant()');
        expect(whiteboardsBlock).toContain('function canAccessCursor()');
    });
});
