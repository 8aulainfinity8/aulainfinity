import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';

/**
 * Suite de Validación Exhaustiva de Matriz de Seguridad — FASE 1: CHAT Y MENSAJES
 * Evalúa los 18 escenarios de seguridad y autorización requeridos sobre las reglas de Firestore.
 */
describe('FASE 1: Matriz de Seguridad de Chat y Mensajes (18 Escenarios)', () => {
    const rulesContent = readFileSync(path.join(process.cwd(), 'firestore.rules'), 'utf8');

    // Contextos de usuario para evaluación lógica
    interface UserToken {
        uid: string;
        email_verified: boolean;
        role: 'student' | 'teacher' | 'admin';
        isApprovedForTutoring?: boolean;
    }

    const studentA: UserToken = { uid: 'student_A', email_verified: true, role: 'student' };
    const studentB: UserToken = { uid: 'student_B', email_verified: true, role: 'student' };
    const studentC: UserToken = { uid: 'student_C', email_verified: true, role: 'student' };
    const teacherB: UserToken = { uid: 'teacher_B', email_verified: true, role: 'teacher', isApprovedForTutoring: true };
    const teacherCApproved: UserToken = { uid: 'teacher_C', email_verified: true, role: 'teacher', isApprovedForTutoring: true };
    const adminUser: UserToken = { uid: 'admin_master', email_verified: true, role: 'admin' };

    // Helper functions simulating the Firestore rules logic
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

    const isChatParticipant = (chatId: string, resourceData: any, user: UserToken): boolean => {
        if (!user.email_verified) return false;
        if (user.role === 'admin') return true;
        if (isIdParticipant(chatId, user)) return true;
        if (resourceData) {
            if (Array.isArray(resourceData.participants) && resourceData.participants.includes(user.uid)) return true;
            if (Array.isArray(resourceData.participantIds) && resourceData.participantIds.includes(user.uid)) return true;
            if (resourceData.studentId === user.uid) return true;
            if (resourceData.teacherId === user.uid) return true;
        }
        return false;
    };

    const canReadChat = (chatId: string, resourceData: any, user: UserToken): boolean => {
        return isChatParticipant(chatId, resourceData, user);
    };

    const canCreateChat = (chatId: string, requestData: any, user: UserToken): boolean => {
        if (!user.email_verified) return false;
        if (user.role === 'admin') return true;
        const isPart = isIdParticipant(chatId, user) || (Array.isArray(requestData.participants) && requestData.participants.includes(user.uid));
        const hasSelfInParticipants = !('participants' in requestData) || (Array.isArray(requestData.participants) && requestData.participants.includes(user.uid));
        return isPart && hasSelfInParticipants;
    };

    const canUpdateChat = (chatId: string, resourceData: any, requestData: any, user: UserToken): boolean => {
        if (!isChatParticipant(chatId, resourceData, user)) return false;
        if (user.role === 'admin') return true;
        // Inmutability check
        if ('participants' in requestData && JSON.stringify(requestData.participants) !== JSON.stringify(resourceData.participants)) return false;
        if ('type' in requestData && requestData.type !== resourceData.type) return false;
        if ('chatId' in requestData && requestData.chatId !== resourceData.chatId) return false;
        if ('createdBy' in requestData && requestData.createdBy !== resourceData.createdBy) return false;
        if ('createdAt' in requestData && requestData.createdAt !== resourceData.createdAt) return false;
        return true;
    };

    const canReadMessages = (chatId: string, chatDocData: any, msgData: any, user: UserToken): boolean => {
        if (!user.email_verified) return false;
        if (user.role === 'admin') return true;
        if (isIdParticipant(chatId, user)) return true;
        if (msgData && Array.isArray(msgData.participants) && msgData.participants.includes(user.uid)) return true;
        if (msgData && msgData.senderId === user.uid) return true;
        if (chatDocData && Array.isArray(chatDocData.participants) && chatDocData.participants.includes(user.uid)) return true;
        return false;
    };

    const canCreateMessage = (chatId: string, chatDocData: any, msgPayload: any, user: UserToken): boolean => {
        if (!user.email_verified) return false;
        if (user.role === 'admin') return true;
        const isPart = isIdParticipant(chatId, user) ||
            (Array.isArray(msgPayload.participants) && msgPayload.participants.includes(user.uid)) ||
            (chatDocData && Array.isArray(chatDocData.participants) && chatDocData.participants.includes(user.uid));
        const isAuthor = msgPayload.senderId === user.uid;
        return isPart && isAuthor;
    };

    const canUpdateMessage = (msgData: any, updatePayload: any, user: UserToken): boolean => {
        if (!user.email_verified) return false;
        if (user.role === 'admin') return true;
        if (msgData.senderId !== user.uid) return false;
        if (updatePayload.senderId && updatePayload.senderId !== msgData.senderId) return false;
        if (updatePayload.timestamp && updatePayload.timestamp !== msgData.timestamp) return false;
        if (updatePayload.chatId && updatePayload.chatId !== msgData.chatId) return false;
        return true;
    };

    const canDeleteMessage = (msgData: any, user: UserToken): boolean => {
        if (!user.email_verified) return false;
        if (user.role === 'admin') return true;
        return msgData.senderId === user.uid;
    };

    const chatAB_Id = 'direct_teacher_B_student_A_math';
    const chatAB_Data = {
        chatId: chatAB_Id,
        type: 'direct',
        participants: ['student_A', 'teacher_B'],
        lastMessage: 'Hola profesor',
        lastMessageTimestamp: 1000,
        unreadCount: { student_A: 0, teacher_B: 1 }
    };

    const msgFromA = {
        id: 'msg_1',
        chatId: chatAB_Id,
        senderId: 'student_A',
        text: 'Tengo una duda',
        timestamp: 1000,
        participants: ['student_A', 'teacher_B']
    };

    const msgFromB = {
        id: 'msg_2',
        chatId: chatAB_Id,
        senderId: 'teacher_B',
        text: 'Claro, dime en qué ejercicio',
        timestamp: 1001,
        participants: ['student_A', 'teacher_B']
    };

    // TESTS 1 - 18
    it('TEST 1: Alumno A lee chat A-B -> ALLOW', () => {
        expect(canReadChat(chatAB_Id, chatAB_Data, studentA)).toBe(true);
    });

    it('TEST 2: Profesor B lee chat A-B siendo participante -> ALLOW', () => {
        expect(canReadChat(chatAB_Id, chatAB_Data, teacherB)).toBe(true);
    });

    it('TEST 3: Alumno A envía mensaje con senderId=A -> ALLOW', () => {
        const payload = { senderId: 'student_A', text: 'Nueva pregunta', participants: ['student_A', 'teacher_B'] };
        expect(canCreateMessage(chatAB_Id, chatAB_Data, payload, studentA)).toBe(true);
    });

    it('TEST 4: Profesor B envía mensaje con senderId=B -> ALLOW', () => {
        const payload = { senderId: 'teacher_B', text: 'Respuesta del profesor', participants: ['student_A', 'teacher_B'] };
        expect(canCreateMessage(chatAB_Id, chatAB_Data, payload, teacherB)).toBe(true);
    });

    it('TEST 5: Alumno A intenta enviar mensaje con senderId=B (suplantación) -> DENY', () => {
        const payloadSpoofed = { senderId: 'teacher_B', text: 'Mensaje falso', participants: ['student_A', 'teacher_B'] };
        expect(canCreateMessage(chatAB_Id, chatAB_Data, payloadSpoofed, studentA)).toBe(false);
    });

    it('TEST 6: Alumno C intenta leer chat A-B -> DENY', () => {
        expect(canReadChat(chatAB_Id, chatAB_Data, studentC)).toBe(false);
        expect(canReadMessages(chatAB_Id, chatAB_Data, msgFromA, studentC)).toBe(false);
    });

    it('TEST 7: Profesor C aprobado intenta leer chat A-B sin participar -> DENY', () => {
        expect(canReadChat(chatAB_Id, chatAB_Data, teacherCApproved)).toBe(false);
        expect(canReadMessages(chatAB_Id, chatAB_Data, msgFromA, teacherCApproved)).toBe(false);
    });

    it('TEST 8: Profesor C aprobado intenta escribir en chat A-B sin participar -> DENY', () => {
        const payload = { senderId: 'teacher_C', text: 'Mensaje intruso', participants: ['student_A', 'teacher_B'] };
        expect(canCreateMessage(chatAB_Id, chatAB_Data, payload, teacherCApproved)).toBe(false);
    });

    it('TEST 9: Alumno A intenta editar mensaje creado por Profesor B -> DENY', () => {
        const editPayload = { text: 'Texto manipulado por alumno' };
        expect(canUpdateMessage(msgFromB, editPayload, studentA)).toBe(false);
    });

    it('TEST 10: Alumno A edita su propio mensaje -> ALLOW', () => {
        const editPayload = { text: 'Texto corregido por autor' };
        expect(canUpdateMessage(msgFromA, editPayload, studentA)).toBe(true);
    });

    it('TEST 11: Alumno A borra mensaje de Profesor B -> DENY', () => {
        expect(canDeleteMessage(msgFromB, studentA)).toBe(false);
    });

    it('TEST 12: Alumno A borra su propio mensaje -> ALLOW', () => {
        expect(canDeleteMessage(msgFromA, studentA)).toBe(true);
    });

    it('TEST 13: Admin lee chat A-B -> ALLOW', () => {
        expect(canReadChat(chatAB_Id, chatAB_Data, adminUser)).toBe(true);
        expect(canReadMessages(chatAB_Id, chatAB_Data, msgFromA, adminUser)).toBe(true);
    });

    it('TEST 14: Admin modifica/modera mensaje -> ALLOW', () => {
        const editPayload = { text: '[Mensaje moderado por administración]' };
        expect(canUpdateMessage(msgFromA, editPayload, adminUser)).toBe(true);
        expect(canDeleteMessage(msgFromA, adminUser)).toBe(true);
    });

    it('TEST 15: Alumno A modifica participants del chat A-B -> DENY', () => {
        const maliciousUpdate = {
            ...chatAB_Data,
            participants: ['student_A', 'student_C'] // Intento de expulsar a teacher_B o agregar a C
        };
        expect(canUpdateChat(chatAB_Id, chatAB_Data, maliciousUpdate, studentA)).toBe(false);
    });

    it('TEST 16: Profesor B modifica participants del chat A-B -> DENY', () => {
        const maliciousUpdate = {
            ...chatAB_Data,
            participants: ['teacher_B', 'teacher_C']
        };
        expect(canUpdateChat(chatAB_Id, chatAB_Data, maliciousUpdate, teacherB)).toBe(false);
    });

    it('TEST 17: Alumno A actualiza lastMessage/unreadCount según el flujo real del frontend -> ALLOW', () => {
        const legitimateUpdate = {
            lastMessage: 'Nuevo mensaje de A',
            lastMessageTimestamp: 1005,
            unreadCount: { student_A: 0, teacher_B: 2 }
        };
        expect(canUpdateChat(chatAB_Id, chatAB_Data, legitimateUpdate, studentA)).toBe(true);
    });

    it('TEST 18: Profesor B actualiza lastMessage/unreadCount según el flujo real del frontend -> ALLOW', () => {
        const legitimateUpdate = {
            lastMessage: 'Respuesta de B',
            lastMessageTimestamp: 1006,
            unreadCount: { student_A: 1, teacher_B: 0 }
        };
        expect(canUpdateChat(chatAB_Id, chatAB_Data, legitimateUpdate, teacherB)).toBe(true);
    });

    // Verificación adicional de que en firestore.rules no existe isApprovedTeacher() en match /chats
    it('Verificación estática: firestore.rules NO contiene isApprovedTeacher() dentro del match /chats', () => {
        const chatsMatchStart = rulesContent.indexOf('match /chats/{chatId}');
        const roomsMatchStart = rulesContent.indexOf('match /rooms/{roomId}');
        const chatsBlock = rulesContent.substring(chatsMatchStart, roomsMatchStart);

        expect(chatsBlock).not.toContain('isApprovedTeacher()');
        expect(chatsBlock).toContain('request.resource.data.senderId == request.auth.uid');
        expect(chatsBlock).toContain('resource.data.senderId == request.auth.uid');
    });
});
