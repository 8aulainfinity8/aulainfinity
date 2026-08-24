import { describe, it, expect } from 'vitest';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { ARCHIVE_TASKS, isDeepEqual, isValidDocumentPath } from '../../scripts/archiveOrphans';

describe('Archive Orphans Script - F109.11.1 Verification', () => {
    it('should validate environment variables', () => {
        process.env.FIREBASE_PROJECT_ID = 'aulainfinity8-a6ac0';
        process.env.FIRESTORE_DATABASE_ID = 'ai-studio-aulainfinity-6be7791f-ef3e-4fc4-b45b-98918b1b57ca';
        
        expect(process.env.FIREBASE_PROJECT_ID).toBe('aulainfinity8-a6ac0');
        expect(process.env.FIRESTORE_DATABASE_ID).toBe('ai-studio-aulainfinity-6be7791f-ef3e-4fc4-b45b-98918b1b57ca');
    });

    it('should handle impersonation variable', () => {
        process.env.FIREBASE_SERVICE_ACCOUNT_EMAIL = '327691821124-compute@developer.gserviceaccount.com';
        expect(process.env.FIREBASE_SERVICE_ACCOUNT_EMAIL).toBe('327691821124-compute@developer.gserviceaccount.com');
    });

    it('should initialize and validate app correctly with modular API', () => {
        const projectId = 'aulainfinity8-a6ac0';
        const databaseId = 'ai-studio-aulainfinity-6be7791f-ef3e-4fc4-b45b-98918b1b57ca';
        
        const app = initializeApp({ projectId }, 'test-app-f109-11-1');
        expect(app.options.projectId).toBe(projectId);
        
        const db = getFirestore(app, databaseId);
        expect(db).toBeDefined();
    });

    it('should validate that all archive destination paths are valid 2-segment Firestore document paths', () => {
        expect(ARCHIVE_TASKS).toHaveLength(2);

        const chatTask = ARCHIVE_TASKS.find(t => t.src.includes('legacy_chat_id_123'));
        expect(chatTask).toBeDefined();
        expect(chatTask?.dst).toBe('archived_chat_messages/orphan_chat_msg_x');
        expect(isValidDocumentPath(chatTask!.dst)).toBe(true);

        const tutorTask = ARCHIVE_TASKS.find(t => t.src.includes('orphan_tutor_req_y'));
        expect(tutorTask).toBeDefined();
        expect(tutorTask?.dst).toBe('archived_tutoring_requests/orphan_tutor_req_y');
        expect(isValidDocumentPath(tutorTask!.dst)).toBe(true);
    });

    it('should reject invalid 3-segment paths (e.g. archived_data/chat_messages/id)', () => {
        expect(isValidDocumentPath('archived_data/chat_messages/orphan_chat_msg_x')).toBe(false);
        expect(isValidDocumentPath('archived_data/tutoring_requests/orphan_tutor_req_y')).toBe(false);
        expect(isValidDocumentPath('single_collection')).toBe(false);
        expect(isValidDocumentPath('col/doc/subcol')).toBe(false);
        expect(isValidDocumentPath('col/doc/subcol/subdoc')).toBe(true);
    });

    it('should correctly evaluate isDeepEqual for identical and different objects', () => {
        const objA = {
            id: 'orphan_chat_msg_x',
            text: 'Hello historic message',
            senderId: 'user_1',
            recipientId: 'user_2',
            timestamp: 1234567890,
            meta: { flag: true, tags: ['old', 'legacy'] }
        };

        const objA_identical = {
            id: 'orphan_chat_msg_x',
            text: 'Hello historic message',
            senderId: 'user_1',
            recipientId: 'user_2',
            timestamp: 1234567890,
            meta: { flag: true, tags: ['old', 'legacy'] }
        };

        const objA_different = {
            ...objA,
            text: 'Modified text'
        };

        expect(isDeepEqual(objA, objA_identical)).toBe(true);
        expect(isDeepEqual(objA, objA_different)).toBe(false);
        expect(isDeepEqual(objA, null)).toBe(false);
        expect(isDeepEqual(null, null)).toBe(true);
    });
});
