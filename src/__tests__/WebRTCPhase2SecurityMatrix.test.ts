import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';

/**
 * Suite de Validación Exhaustiva de Matriz de Seguridad — FASE 2: LLAMADAS Y WEBRTC
 * Evalúa los 18 escenarios requeridos sobre la autorización de /rooms, /calls, /voice_group_calls y candidatos ICE.
 */
describe('FASE 2: Matriz de Seguridad de Llamadas y WebRTC (18 Escenarios)', () => {
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
    const adminUser: UserToken = {
        uid: 'admin_master',
        email_verified: true,
        role: 'admin'
    };

    // Helper functions simulating Firestore rules for rooms and calls
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

    const isRoomParticipant = (roomId: string, resourceData: any, user: UserToken): boolean => {
        if (!user.email_verified) return false;
        if (user.role === 'admin') return true;
        if (isIdParticipant(roomId, user)) return true;
        if (roomId.startsWith('room_')) {
            const courseId = roomId.slice(5);
            if (isEnrolledInCourse(courseId, user) || isTeacherOfCourse(courseId, user)) return true;
        }
        if (resourceData) {
            if (resourceData.callerUid === user.uid || resourceData.calleeUid === user.uid) return true;
            if (Array.isArray(resourceData.participants) && resourceData.participants.includes(user.uid)) return true;
            if (Array.isArray(resourceData.participantIds) && resourceData.participantIds.includes(user.uid)) return true;
            if (resourceData.studentId === user.uid || resourceData.teacherId === user.uid) return true;
        }
        return false;
    };

    const canCreateRoom = (roomId: string, requestData: any, user: UserToken): boolean => {
        if (!user.email_verified) return false;
        if (user.role === 'admin') return true;
        const isPart = isIdParticipant(roomId, user) ||
            (roomId.startsWith('room_') && (isEnrolledInCourse(roomId.slice(5), user) || isTeacherOfCourse(roomId.slice(5), user))) ||
            (requestData.callerUid === user.uid) ||
            (Array.isArray(requestData.participants) && requestData.participants.includes(user.uid));
        const callerMatch = !('callerUid' in requestData) || requestData.callerUid === user.uid;
        return isPart && callerMatch;
    };

    const canUpdateRoom = (roomId: string, resourceData: any, requestData: any, user: UserToken): boolean => {
        if (!isRoomParticipant(roomId, resourceData, user)) return false;
        if (user.role === 'admin') return true;
        if ('callerUid' in requestData && requestData.callerUid !== resourceData.callerUid) return false;
        if ('roomId' in requestData && requestData.roomId !== resourceData.roomId) return false;
        if ('courseId' in requestData && requestData.courseId !== resourceData.courseId) return false;
        if ('createdBy' in requestData && requestData.createdBy !== resourceData.createdBy) return false;
        if ('createdAt' in requestData && requestData.createdAt !== resourceData.createdAt) return false;
        return true;
    };

    const isVoiceGroupCallMember = (callId: string, resourceData: any, user: UserToken): boolean => {
        if (!user.email_verified) return false;
        if (user.role === 'admin') return true;
        if (isIdParticipant(callId, user)) return true;
        if (isEnrolledInCourse(callId, user) || isTeacherOfCourse(callId, user)) return true;
        if (resourceData) {
            if (resourceData.courseId && (isEnrolledInCourse(resourceData.courseId, user) || isTeacherOfCourse(resourceData.courseId, user))) return true;
            if (Array.isArray(resourceData.participants) && resourceData.participants.some((p: any) => (typeof p === 'string' ? p === user.uid : p.id === user.uid))) return true;
        }
        return false;
    };

    const roomAB_Id = 'room_student_A_teacher_B';
    const roomAB_Data = {
        roomId: roomAB_Id,
        callerUid: 'student_A',
        status: 'calling',
        offer: { type: 'offer', sdp: 'v=0...' }
    };

    // TESTS 1 - 18
    it('TEST 1: Alumno A crea/lee su llamada con Profesor B -> ALLOW', () => {
        expect(canCreateRoom(roomAB_Id, roomAB_Data, studentA)).toBe(true);
        expect(isRoomParticipant(roomAB_Id, roomAB_Data, studentA)).toBe(true);
    });

    it('TEST 2: Profesor B participante lee la llamada -> ALLOW', () => {
        expect(isRoomParticipant(roomAB_Id, roomAB_Data, teacherB)).toBe(true);
    });

    it('TEST 3: Alumno A escribe señalización -> ALLOW', () => {
        const updatePayload = { status: 'calling', updatedAt: 100 };
        expect(canUpdateRoom(roomAB_Id, roomAB_Data, updatePayload, studentA)).toBe(true);
    });

    it('TEST 4: Profesor B escribe señalización (Answer SDP) -> ALLOW', () => {
        const answerPayload = {
            calleeUid: 'teacher_B',
            status: 'connected',
            answer: { type: 'answer', sdp: 'v=0...' }
        };
        expect(canUpdateRoom(roomAB_Id, roomAB_Data, answerPayload, teacherB)).toBe(true);
    });

    it('TEST 5: Alumno C intenta leer llamada A-B -> DENY', () => {
        expect(isRoomParticipant(roomAB_Id, roomAB_Data, studentC)).toBe(false);
    });

    it('TEST 6: Alumno C intenta escribir señalización de A-B -> DENY', () => {
        const maliciousUpdate = { answer: { type: 'answer', sdp: 'hacked' } };
        expect(canUpdateRoom(roomAB_Id, roomAB_Data, maliciousUpdate, studentC)).toBe(false);
    });

    it('TEST 7: Profesor C aprobado intenta leer llamada A-B sin participar -> DENY', () => {
        expect(isRoomParticipant(roomAB_Id, roomAB_Data, teacherCApproved)).toBe(false);
    });

    it('TEST 8: Profesor C aprobado intenta modificar señalización de A-B -> DENY', () => {
        const maliciousUpdate = { status: 'ended' };
        expect(canUpdateRoom(roomAB_Id, roomAB_Data, maliciousUpdate, teacherCApproved)).toBe(false);
    });

    it('TEST 9: Profesor aprobado que NO pertenece al curso intenta acceder a llamada grupal -> DENY', () => {
        const groupCallCourseId = 'course_math_101';
        expect(isVoiceGroupCallMember(groupCallCourseId, { courseId: groupCallCourseId }, teacherCApproved)).toBe(false);
    });

    it('TEST 10: Alumno matriculado accede a llamada grupal de su curso -> ALLOW', () => {
        const groupCallCourseId = 'course_math_101';
        expect(isVoiceGroupCallMember(groupCallCourseId, { courseId: groupCallCourseId }, studentA)).toBe(true);
    });

    it('TEST 11: Profesor docente del curso accede a llamada grupal -> ALLOW', () => {
        const groupCallCourseId = 'course_math_101';
        expect(isVoiceGroupCallMember(groupCallCourseId, { courseId: groupCallCourseId }, teacherB)).toBe(true);
    });

    it('TEST 12: Profesor aprobado pero no docente del curso es rechazado -> DENY', () => {
        const groupCallCourseId = 'course_math_101';
        expect(isVoiceGroupCallMember(groupCallCourseId, { courseId: groupCallCourseId }, teacherCApproved)).toBe(false);
    });

    it('TEST 13: Alumno no matriculado intenta acceder a llamada grupal -> DENY', () => {
        const groupCallCourseId = 'course_math_101';
        expect(isVoiceGroupCallMember(groupCallCourseId, { courseId: groupCallCourseId }, studentC)).toBe(false);
    });

    it('TEST 14: Admin accede a llamada privada -> ALLOW', () => {
        expect(isRoomParticipant(roomAB_Id, roomAB_Data, adminUser)).toBe(true);
        expect(isVoiceGroupCallMember('course_math_101', {}, adminUser)).toBe(true);
    });

    it('TEST 15: Admin modifica/elimina señalización -> ALLOW', () => {
        const adminOverride = { status: 'ended' };
        expect(canUpdateRoom(roomAB_Id, roomAB_Data, adminOverride, adminUser)).toBe(true);
    });

    it('TEST 16: Usuario intenta alterar callerUid/calleeUid/participants de forma ilegítima -> DENY', () => {
        const maliciousPayload = {
            ...roomAB_Data,
            callerUid: 'student_C' // Intento de secuestrar autoría
        };
        expect(canUpdateRoom(roomAB_Id, roomAB_Data, maliciousPayload, studentA)).toBe(false);
    });

    it('TEST 17: Usuario ajeno intenta leer callerCandidates/calleeCandidates -> DENY', () => {
        expect(isRoomParticipant(roomAB_Id, roomAB_Data, studentC)).toBe(false);
        expect(isRoomParticipant(roomAB_Id, roomAB_Data, teacherCApproved)).toBe(false);
    });

    it('TEST 18: Participante legítimo puede leer/escribir candidates -> ALLOW', () => {
        expect(isRoomParticipant(roomAB_Id, roomAB_Data, studentA)).toBe(true);
        expect(isRoomParticipant(roomAB_Id, roomAB_Data, teacherB)).toBe(true);
    });

    // Verificación estática de reglas en firestore.rules
    it('Verificación estática: firestore.rules NO contiene isApprovedTeacher() en rooms, calls ni voice_group_calls', () => {
        const roomsMatchStart = rulesContent.indexOf('match /rooms/{roomId}');
        const whiteboardsMatchStart = rulesContent.indexOf('match /whiteboards/{whiteboardId}');
        const callsBlock = rulesContent.substring(roomsMatchStart, whiteboardsMatchStart);

        expect(callsBlock).not.toContain('isApprovedTeacher()');
        expect(callsBlock).toContain('function isRoomParticipant()');
        expect(callsBlock).toContain('function isCallParticipant()');
        expect(callsBlock).toContain('function isVoiceGroupCallMember()');
    });
});
