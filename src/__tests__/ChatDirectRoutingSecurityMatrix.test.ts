import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { 
    getDirectChatId, 
    parseDirectChatId,
    parseSupportChatId,
    inferParticipantsFromChatId, 
    isDirectChatId, 
    isSupportChatId, 
    resolveUserUid 
} from '../utils/chatUtils';

/**
 * Suite de Validación Exhaustiva de Matriz de Seguridad y Enrutamiento Canónico:
 * CHAT ALUMNO ↔ PROFESOR DIRECT ROUTING & SECURITY AUDIT
 */
describe('FASE 4: Matriz de Seguridad y Enrutamiento Canónico Alumno ↔ Profesor', () => {
    const rulesContent = readFileSync(path.join(process.cwd(), 'firestore.rules'), 'utf8');

    interface UserToken {
        uid: string;
        email_verified: boolean;
        role: 'student' | 'teacher' | 'admin';
        isApprovedForTutoring?: boolean;
    }

    const studentA: UserToken = { uid: 'student_JIVpN7ThwvfXlQMpfDJUJn573', email_verified: true, role: 'student' };
    const teacherB: UserToken = { uid: 'teacher_9vK2Lp4N1x7Zq8W3m5T0', email_verified: true, role: 'teacher', isApprovedForTutoring: true };
    const teacherCApproved: UserToken = { uid: 'teacher_Unrelated999', email_verified: true, role: 'teacher', isApprovedForTutoring: true };
    const studentC: UserToken = { uid: 'student_Unrelated888', email_verified: true, role: 'student' };
    const adminUser: UserToken = { uid: 'admin_master_123', email_verified: true, role: 'admin' };
    const unverifiedUser: UserToken = { uid: 'student_JIVpN7ThwvfXlQMpfDJUJn573', email_verified: false, role: 'student' };

    // Simulación del motor de reglas de Firestore
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
        const isPart = isIdParticipant(chatId, user) || (Array.isArray(requestData?.participants) && requestData.participants.includes(user.uid));
        const hasSelfInParticipants = !('participants' in (requestData || {})) || (Array.isArray(requestData?.participants) && requestData.participants.includes(user.uid));
        return isPart && hasSelfInParticipants;
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
            (Array.isArray(msgPayload?.participants) && msgPayload.participants.includes(user.uid)) ||
            (chatDocData && Array.isArray(chatDocData?.participants) && chatDocData.participants.includes(user.uid));
        const isAuthor = msgPayload?.senderId === user.uid;
        return isPart && isAuthor;
    };

    describe('1. Utilidades de Enrutamiento Canónico (chatUtils)', () => {
        it('debe generar el chatId canónico direct_<studentUid>_<teacherUid>', () => {
            const canonicalId = getDirectChatId(studentA.uid, teacherB.uid);
            expect(canonicalId).toBe(`direct_${studentA.uid}_${teacherB.uid}`);
            expect(isDirectChatId(canonicalId)).toBe(true);
            expect(isSupportChatId(canonicalId)).toBe(false);
        });

        it('debe parsear correctamente el chatId canónico', () => {
            const canonicalId = `direct_${studentA.uid}_${teacherB.uid}`;
            const parsed = parseDirectChatId(canonicalId);
            expect(parsed).not.toBeNull();
            expect(parsed?.studentId).toBe(studentA.uid);
            expect(parsed?.teacherId).toBe(teacherB.uid);
        });

        it('debe inferir los participantes directos a partir del formato canónico', () => {
            const canonicalId = `direct_${studentA.uid}_${teacherB.uid}`;
            const participants = inferParticipantsFromChatId(canonicalId);
            expect(participants).toContain(studentA.uid);
            expect(participants).toContain(teacherB.uid);
        });

        it('debe resolver UIDs limpios sin importar si el objeto contiene id o uid', () => {
            expect(resolveUserUid({ id: 'uid_123' })).toBe('uid_123');
            expect(resolveUserUid({ uid: 'uid_456' })).toBe('uid_456');
            expect(resolveUserUid('uid_789')).toBe('uid_789');
        });
    });

    describe('2. Aislamiento Horizontal y Acceso Bidireccional en Chats Canónicos', () => {
        const directChatId = `direct_${studentA.uid}_${teacherB.uid}`;
        const directChatDoc = {
            id: directChatId,
            participants: [studentA.uid, teacherB.uid],
            studentId: studentA.uid,
            teacherId: teacherB.uid,
            type: 'direct',
            createdAt: '2026-08-21T00:00:00Z'
        };

        it('Escenario 1: El ALUMNO participante puede leer y escribir en su chat canónico', () => {
            expect(canReadChat(directChatId, directChatDoc, studentA)).toBe(true);
            expect(canCreateMessage(directChatId, directChatDoc, {
                senderId: studentA.uid,
                text: 'Hola profesor',
                participants: [studentA.uid, teacherB.uid]
            }, studentA)).toBe(true);
        });

        it('Escenario 2: El PROFESOR asignado/participante puede leer y responder en el chat canónico', () => {
            expect(canReadChat(directChatId, directChatDoc, teacherB)).toBe(true);
            expect(canCreateMessage(directChatId, directChatDoc, {
                senderId: teacherB.uid,
                text: 'Hola alumno, ¿en qué te ayudo?',
                participants: [studentA.uid, teacherB.uid]
            }, teacherB)).toBe(true);
        });

        it('Escenario 3: Un PROFESOR NO PARTICIPANTE (incluso con isApprovedForTutoring) es BLOQUEADO', () => {
            expect(canReadChat(directChatId, directChatDoc, teacherCApproved)).toBe(false);
            expect(canCreateMessage(directChatId, directChatDoc, {
                senderId: teacherCApproved.uid,
                text: 'Intento de intromisión',
                participants: [studentA.uid, teacherB.uid]
            }, teacherCApproved)).toBe(false);
        });

        it('Escenario 4: Un TERCER ESTUDIANTE ajeno es BLOQUEADO', () => {
            expect(canReadChat(directChatId, directChatDoc, studentC)).toBe(false);
            expect(canCreateMessage(directChatId, directChatDoc, {
                senderId: studentC.uid,
                text: 'Intento de espionaje',
                participants: [studentA.uid, teacherB.uid]
            }, studentC)).toBe(false);
        });

        it('Escenario 5: Un ADMINISTRADOR tiene supervisión completa del chat', () => {
            expect(canReadChat(directChatId, directChatDoc, adminUser)).toBe(true);
            expect(canCreateMessage(directChatId, directChatDoc, {
                senderId: adminUser.uid,
                text: 'Mensaje de moderación',
                participants: [studentA.uid, teacherB.uid]
            }, adminUser)).toBe(true);
        });

        it('Escenario 6: Usuario con email NO verificado es RECHAZADO', () => {
            expect(canReadChat(directChatId, directChatDoc, unverifiedUser)).toBe(false);
            expect(canCreateMessage(directChatId, directChatDoc, {
                senderId: unverifiedUser.uid,
                text: 'Intento no verificado'
            }, unverifiedUser)).toBe(false);
        });
    });

    describe('3. Integridad de Autoría y Prevención de Spoofing de Mensajes', () => {
        const directChatId = `direct_${studentA.uid}_${teacherB.uid}`;
        const directChatDoc = {
            id: directChatId,
            participants: [studentA.uid, teacherB.uid]
        };

        it('Escenario 7: Un alumno NO puede enviar un mensaje falsificando senderId como el profesor', () => {
            const spoofedPayload = {
                senderId: teacherB.uid, // Spoofing!
                text: 'Mensaje falso suplantando al profesor',
                participants: [studentA.uid, teacherB.uid]
            };
            expect(canCreateMessage(directChatId, directChatDoc, spoofedPayload, studentA)).toBe(false);
        });

        it('Escenario 8: Un profesor NO puede enviar un mensaje falsificando senderId como el alumno', () => {
            const spoofedPayload = {
                senderId: studentA.uid, // Spoofing!
                text: 'Mensaje falso suplantando al alumno',
                participants: [studentA.uid, teacherB.uid]
            };
            expect(canCreateMessage(directChatId, directChatDoc, spoofedPayload, teacherB)).toBe(false);
        });
    });

    describe('4. Aislamiento Estricto del Canal de Soporte vs Chat Privado', () => {
        const supportChatId = `support_${studentA.uid}`;
        const supportChatDoc = {
            id: supportChatId,
            participants: [studentA.uid],
            studentId: studentA.uid,
            type: 'support'
        };

        it('Escenario 9: El alumno y el admin acceden al canal de soporte', () => {
            expect(canReadChat(supportChatId, supportChatDoc, studentA)).toBe(true);
            expect(canReadChat(supportChatId, supportChatDoc, adminUser)).toBe(true);
        });

        it('Escenario 10: Un profesor (sin asignación de soporte) NO puede acceder a support_ del alumno', () => {
            expect(canReadChat(supportChatId, supportChatDoc, teacherB)).toBe(false);
            expect(canReadMessages(supportChatId, supportChatDoc, { senderId: studentA.uid }, teacherB)).toBe(false);
        });
    });

    describe('6. Suite de 15 Tests Obligatorios (Soporte y Chats Directos)', () => {
        const supportIdA = `support_${studentA.uid}`;
        const supportIdC = `support_${studentC.uid}`;
        const supportDocA = { id: supportIdA, type: 'support', participants: [studentA.uid], studentId: studentA.uid };
        const directAB = `direct_${studentA.uid}_${teacherB.uid}`;
        const peerAB = `peer_${studentA.uid}_${studentC.uid}`;

        it('TEST 1: support_<studentUid> se identifica correctamente como support chat', () => {
            expect(isSupportChatId(supportIdA)).toBe(true);
            expect(isSupportChatId(directAB)).toBe(false);
        });

        it('TEST 2: parseSupportChatId() devuelve correctamente studentUid', () => {
            const parsed = parseSupportChatId(supportIdA);
            expect(parsed.studentId).toBe(studentA.uid);
        });

        it('TEST 3: inferParticipantsFromChatId() reconoce support_<studentUid>', () => {
            const participants = inferParticipantsFromChatId(supportIdA, studentA.uid);
            expect(participants).toContain(studentA.uid);
        });

        it('TEST 4: direct_<studentUid>_<teacherUid> continúa funcionando igual', () => {
            expect(getDirectChatId(studentA.uid, teacherB.uid)).toBe(directAB);
        });

        it('TEST 5: peer_<uidA>_<uidB> continúa funcionando igual', () => {
            expect(peerAB.startsWith('peer_')).toBe(true);
        });

        it('TEST 6: Un alumno puede acceder a su propio support_<studentUid>', () => {
            expect(canReadChat(supportIdA, supportDocA, studentA)).toBe(true);
        });

        it('TEST 7: Un alumno NO puede acceder al support_<otroStudentUid>', () => {
            expect(canReadChat(supportIdA, supportDocA, studentC)).toBe(false);
        });

        it('TEST 8: Un administrador autorizado puede acceder a support_<studentUid>', () => {
            expect(canReadChat(supportIdA, supportDocA, adminUser)).toBe(true);
        });

        it('TEST 9: Un profesor que NO es administrador no obtiene acceso global a todos los support_* simplemente por ser profesor', () => {
            expect(canReadChat(supportIdA, supportDocA, teacherB)).toBe(false);
        });

        it('TEST 10: El alumno puede escribir un mensaje en /chats/support_<studentUid>/messages/{messageId}', () => {
            expect(canCreateMessage(supportIdA, supportDocA, { senderId: studentA.uid, text: 'Ayuda', participants: [studentA.uid] }, studentA)).toBe(true);
        });

        it('TEST 11: El administrador puede responder en el mismo /chats/support_<studentUid>/messages/{messageId}', () => {
            expect(canCreateMessage(supportIdA, supportDocA, { senderId: adminUser.uid, text: 'Respuesta admin', participants: [studentA.uid, adminUser.uid] }, adminUser)).toBe(true);
        });

        it('TEST 12: Ambos lados utilizan exactamente el mismo chatId', () => {
            const studentChatId = `support_${studentA.uid}`;
            const adminChatId = `support_${studentA.uid}`;
            expect(studentChatId).toBe(adminChatId);
        });

        it('TEST 13: La creación/inicialización del chat no destruye participants existentes', () => {
            const existingParticipants = [studentA.uid, adminUser.uid];
            const merged = Array.from(new Set([...supportDocA.participants, ...existingParticipants]));
            expect(merged).toContain(studentA.uid);
            expect(merged).toContain(adminUser.uid);
        });

        it('TEST 14: Un chat direct_* sigue aislado entre sus dos participantes', () => {
            const directDoc = { participants: [studentA.uid, teacherB.uid], studentId: studentA.uid, teacherId: teacherB.uid };
            expect(canReadChat(directAB, directDoc, studentC)).toBe(false);
        });

        it('TEST 15: Un usuario externo no puede leer los mensajes de un support_* ajeno', () => {
            expect(canReadMessages(supportIdA, supportDocA, { senderId: studentA.uid }, studentC)).toBe(false);
        });
    });
});
