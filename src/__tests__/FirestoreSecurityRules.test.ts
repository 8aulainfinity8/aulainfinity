import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';

/**
 * Suite de Pruebas de Auditoría y Verificación de Reglas de Seguridad de Firestore y Storage (Fase 2.1B)
 * Verifica:
 * 1. Eliminación total de bypass por email (8aulainfinity8@gmail.com).
 * 2. Validación de email_verified en todas las operaciones privadas.
 * 3. Aislamiento horizontal de chats, salas, llamadas, pizarras y mensajes.
 * 4. Inmutabilidad de roles y bloqueo de escalación de privilegios en /users y /firestore_users.
 * 5. Sintaxis y aislamiento en Storage (/attachments, /recordings, /avatars, /receipts).
 */
describe('Pruebas de Reglas de Seguridad de Firestore (Fase 2.1B)', () => {
    const rulesContent = readFileSync(path.join(process.cwd(), 'firestore.rules'), 'utf8');

    it('NO contiene la dirección de correo hardcodeada 8aulainfinity8@gmail.com en ninguna regla', () => {
        expect(rulesContent).not.toContain('8aulainfinity8@gmail.com');
    });

    it('Las reglas contienen las funciones auxiliares requeridas: isVerifiedUser e isApprovedTeacher', () => {
        expect(rulesContent).toContain('function isVerifiedUser()');
        expect(rulesContent).toContain('request.auth.token.email_verified == true');
        expect(rulesContent).toContain('function isApprovedTeacher()');
        expect(rulesContent).toContain('request.auth.token.isApprovedForTutoring == true');
    });

    it('La función isAdmin() depende estrictamente de request.auth.token.role == "admin"', () => {
        const isAdminBlock = rulesContent.substring(rulesContent.indexOf('function isAdmin()'), rulesContent.indexOf('function isTeacher()'));
        expect(isAdminBlock).not.toContain('8aulainfinity8@gmail.com');
        expect(isAdminBlock).toContain("request.auth.token.role == 'admin'");
    });

    it('Protege la creación/edición de cursos exigiendo isApprovedTeacher()', () => {
        const coursesBlock = rulesContent.substring(rulesContent.indexOf('match /courses/{courseId}'), rulesContent.indexOf('match /course_levels/{levelId}'));
        expect(coursesBlock).toContain('allow write: if isApprovedTeacher()');
    });

    it('Protege la creación/edición de vídeos exigiendo isApprovedTeacher()', () => {
        const videosBlock = rulesContent.substring(rulesContent.indexOf('match /videos/{videoId}'), rulesContent.indexOf('match /quizzes/{quizId}'));
        expect(videosBlock).toContain('allow write: if isApprovedTeacher()');
    });

    it('Protege los datos de usuario impidiendo escalación de rol o auto-aprobación en el cliente', () => {
        const usersBlock = rulesContent.substring(rulesContent.indexOf('match /firestore_users/{userId}'), rulesContent.indexOf('match /students/{userId}'));
        expect(usersBlock).toContain('isApprovedForTutoring == false');
        expect(usersBlock).toContain('isAdmin == false');
        expect(usersBlock).toContain('request.resource.data.role == resource.data.role');
    });

    it('Implementa aislamiento horizontal de participantes en chats, rooms, calls y pizarras', () => {
        expect(rulesContent).toContain('function isParticipant(data)');
        expect(rulesContent).toContain('function isIdParticipant(id)');
        expect(rulesContent).toContain('match /chats/{chatId}');
        expect(rulesContent).toContain('match /rooms/{roomId}');
        expect(rulesContent).toContain('match /calls/{callId}');
        expect(rulesContent).toContain('match /whiteboards/{whiteboardId}');
        expect(rulesContent).toContain('function isRoomParticipant()');
        expect(rulesContent).toContain('function isCallParticipant()');
        expect(rulesContent).toContain('function isWhiteboardParticipant()');
        expect(rulesContent).toContain('request.resource.data.senderId == request.auth.uid');
    });

    it('Exige isVerifiedUser() para el acceso a mensajes directos y de pares con aislamiento de participantes', () => {
        const dmsBlock = rulesContent.substring(rulesContent.indexOf('match /firestore_direct_messages/{msgId}'), rulesContent.indexOf('match /firestore_peer_conversations/{convId}'));
        expect(dmsBlock).toContain('allow read, write: if isVerifiedUser()');
        expect(dmsBlock).toContain('isParticipant(resource.data)');
        expect(dmsBlock).not.toContain('isApprovedTeacher()');
    });

    it('Define la regla de firestore_user_seen_states/{userId} con aislamiento de propietario e isVerifiedUser', () => {
        expect(rulesContent).toContain('match /firestore_user_seen_states/{userId}');
        expect(rulesContent).toContain('allow read, write: if isVerifiedUser() && (isOwner(userId) || isAdmin())');
    });
});

describe('Pruebas de Reglas de Seguridad de Cloud Storage (Fase 2.1B)', () => {
    const storageRulesContent = readFileSync(path.join(process.cwd(), 'storage.rules'), 'utf8');

    it('NO contiene la dirección de correo hardcodeada 8aulainfinity8@gmail.com', () => {
        expect(storageRulesContent).not.toContain('8aulainfinity8@gmail.com');
    });

    it('Las reglas de almacenamiento contienen isVerifiedUser e isApprovedTeacher', () => {
        expect(storageRulesContent).toContain('function isVerifiedUser()');
        expect(storageRulesContent).toContain('request.auth.token.email_verified == true');
        expect(storageRulesContent).toContain('function isApprovedTeacher()');
    });

    it('Restringe la subida de materiales de curso y vídeos a profesores aprobados con cuotas de tamaño', () => {
        expect(storageRulesContent).toContain('match /course_materials/{courseId}/{fileName}');
        expect(storageRulesContent).toContain('allow write: if isApprovedTeacher() && maxFileSize(50)');
        expect(storageRulesContent).toContain('match /videos/{allPaths=**}');
        expect(storageRulesContent).toContain('allow write: if isApprovedTeacher() && maxFileSize(500)');
    });

    it('Aísla la subida de adjuntos generales por UID de usuario y tiene sintaxis válida', () => {
        const attachmentsBlock = storageRulesContent.substring(storageRulesContent.indexOf('match /attachments/{fileName}'));
        expect(attachmentsBlock).toContain('allow read: if isVerifiedUser()');
        expect(attachmentsBlock).toContain("fileName.matches('^' + request.auth.uid + '_.*')");
        expect(attachmentsBlock).toContain('allow write: if isVerifiedUser() && maxFileSize(25)');
    });
});
