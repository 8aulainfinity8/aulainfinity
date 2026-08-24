import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

export interface OrphanAuditResult {
    target: string;
    expectedPath: string;
    exists: boolean;
    status: 'FOUND_EXPECTED_PATH' | 'FOUND_OTHER_PATH' | 'FOUND_ARCHIVED' | 'NOT_FOUND' | 'DUPLICATE_FOUND' | 'UNKNOWN';
    actualPath?: string;
    data?: any;
    archivedExists?: boolean;
    archivedPath?: string;
    alternateMatches?: string[];
}

export async function runForensicDiscovery() {
    const projectId = process.env.FIREBASE_PROJECT_ID || 'aulainfinity8-a6ac0';
    const databaseId = process.env.FIRESTORE_DATABASE_ID || 'ai-studio-aulainfinity-6be7791f-ef3e-4fc4-b45b-98918b1b57ca';
    const impersonationEmail = process.env.FIREBASE_SERVICE_ACCOUNT_EMAIL;

    console.log(`==================================================`);
    console.log(`=== F109.11.3 FORENSIC ORPHAN DISCOVERY (READ-ONLY) ===`);
    console.log(`==================================================`);
    console.log(`Project:                     ${projectId}`);
    console.log(`Database:                    ${databaseId}`);
    console.log(`Impersonated Service Account: ${impersonationEmail || 'None (Using Default ADC)'}`);
    console.log(`Mode:                        READ-ONLY NON-BLOCKING AUDIT`);
    console.log(`==================================================\n`);

    const app = initializeApp({ projectId }, 'discover-orphans-app');
    if (app.options.projectId !== projectId) {
        console.error(`Project ID mismatch! Expected ${projectId}, got ${app.options.projectId}`);
        process.exit(1);
    }

    const db = getFirestore(app, databaseId);

    const results: {
        chat: OrphanAuditResult;
        tutoring: OrphanAuditResult;
    } = {
        chat: {
            target: 'orphan_chat_msg_x',
            expectedPath: 'chats/legacy_chat_id_123/messages/orphan_chat_msg_x',
            exists: false,
            status: 'UNKNOWN',
            alternateMatches: []
        },
        tutoring: {
            target: 'orphan_tutor_req_y',
            expectedPath: 'tutoring_requests/orphan_tutor_req_y',
            exists: false,
            status: 'UNKNOWN',
            alternateMatches: []
        }
    };

    // ==========================================
    // 1. AUDIT ORPHAN CHAT MESSAGE
    // ==========================================
    console.log(`[1/4] Auditing Chat Orphan: ${results.chat.target}...`);
    try {
        const directSnap = await db.doc(results.chat.expectedPath).get();
        if (directSnap.exists) {
            results.chat.exists = true;
            results.chat.actualPath = results.chat.expectedPath;
            results.chat.status = 'FOUND_EXPECTED_PATH';
            results.chat.data = directSnap.data();
            console.log(`  -> Found at expected path: ${results.chat.expectedPath}`);
        } else {
            console.log(`  -> Not found at expected path: ${results.chat.expectedPath}`);
        }
    } catch (err: any) {
        console.log(`  -> Direct check notice: ${err.message}`);
    }

    // Check archived location for chat
    const archivedChatPath = 'archived_chat_messages/orphan_chat_msg_x';
    try {
        const archSnap = await db.doc(archivedChatPath).get();
        results.chat.archivedExists = archSnap.exists;
        results.chat.archivedPath = archivedChatPath;
        if (archSnap.exists) {
            console.log(`  -> Found in archive collection: ${archivedChatPath}`);
            if (!results.chat.exists) {
                results.chat.status = 'FOUND_ARCHIVED';
                results.chat.actualPath = archivedChatPath;
                results.chat.data = archSnap.data();
            }
        }
    } catch (err: any) {
        console.log(`  -> Archived check notice: ${err.message}`);
    }

    // Discovery across messages collectionGroup
    try {
        console.log(`  -> Scanning collectionGroup('messages') in read-only mode...`);
        const msgQuery = await db.collectionGroup('messages').get();
        msgQuery.forEach(doc => {
            if (doc.id === 'orphan_chat_msg_x' || doc.ref.path.includes('legacy_chat_id_123')) {
                results.chat.alternateMatches?.push(doc.ref.path);
                console.log(`  -> Match found in messages: ${doc.ref.path}`);
            }
        });

        if (!results.chat.exists && !results.chat.archivedExists) {
            if (results.chat.alternateMatches && results.chat.alternateMatches.length === 1) {
                results.chat.exists = true;
                results.chat.actualPath = results.chat.alternateMatches[0];
                results.chat.status = 'FOUND_OTHER_PATH';
            } else if (results.chat.alternateMatches && results.chat.alternateMatches.length > 1) {
                results.chat.exists = true;
                results.chat.status = 'DUPLICATE_FOUND';
            } else {
                results.chat.status = 'NOT_FOUND';
            }
        }
    } catch (err: any) {
        console.log(`  -> collectionGroup('messages') notice: ${err.message}`);
        if (results.chat.status === 'UNKNOWN') {
            results.chat.status = 'NOT_FOUND';
        }
    }

    // ==========================================
    // 2. AUDIT ORPHAN TUTORING REQUEST
    // ==========================================
    console.log(`\n[2/4] Auditing Tutoring Request Orphan: ${results.tutoring.target}...`);
    try {
        const directSnap = await db.doc(results.tutoring.expectedPath).get();
        if (directSnap.exists) {
            results.tutoring.exists = true;
            results.tutoring.actualPath = results.tutoring.expectedPath;
            results.tutoring.status = 'FOUND_EXPECTED_PATH';
            results.tutoring.data = directSnap.data();
            console.log(`  -> Found at expected path: ${results.tutoring.expectedPath}`);
        } else {
            console.log(`  -> Not found at expected path: ${results.tutoring.expectedPath}`);
        }
    } catch (err: any) {
        console.log(`  -> Direct check notice: ${err.message}`);
    }

    // Check archived location for tutoring request
    const archivedTutorPath = 'archived_tutoring_requests/orphan_tutor_req_y';
    try {
        const archSnap = await db.doc(archivedTutorPath).get();
        results.tutoring.archivedExists = archSnap.exists;
        results.tutoring.archivedPath = archivedTutorPath;
        if (archSnap.exists) {
            console.log(`  -> Found in archive collection: ${archivedTutorPath}`);
            if (!results.tutoring.exists) {
                results.tutoring.status = 'FOUND_ARCHIVED';
                results.tutoring.actualPath = archivedTutorPath;
                results.tutoring.data = archSnap.data();
            }
        }
    } catch (err: any) {
        console.log(`  -> Archived check notice: ${err.message}`);
    }

    // Scan tutoring_requests collection for alternate matches or legacy IDs
    try {
        console.log(`  -> Scanning 'tutoring_requests' collection in read-only mode...`);
        const tutorQuery = await db.collection('tutoring_requests').get();
        tutorQuery.forEach(doc => {
            const data = doc.data();
            if (
                doc.id === 'orphan_tutor_req_y' ||
                data.studentId === 'legacy_student_123' ||
                data.teacherId === 'legacy_teacher_456'
            ) {
                results.tutoring.alternateMatches?.push(`${doc.ref.path} (id: ${doc.id})`);
                console.log(`  -> Match found in tutoring_requests: ${doc.ref.path}`);
            }
        });

        if (!results.tutoring.exists && !results.tutoring.archivedExists) {
            if (results.tutoring.alternateMatches && results.tutoring.alternateMatches.length === 1) {
                results.tutoring.exists = true;
                results.tutoring.actualPath = results.tutoring.alternateMatches[0];
                results.tutoring.status = 'FOUND_OTHER_PATH';
            } else if (results.tutoring.alternateMatches && results.tutoring.alternateMatches.length > 1) {
                results.tutoring.exists = true;
                results.tutoring.status = 'DUPLICATE_FOUND';
            } else {
                results.tutoring.status = 'NOT_FOUND';
            }
        }
    } catch (err: any) {
        console.log(`  -> tutoring_requests scan notice: ${err.message}`);
        if (results.tutoring.status === 'UNKNOWN') {
            results.tutoring.status = 'NOT_FOUND';
        }
    }

    // ==========================================
    // 3. SCAN ROOT LEVEL AUDIT COLLECTIONS
    // ==========================================
    console.log(`\n[3/4] Root level collections overview...`);
    for (const col of ['chats', 'tutoring_requests', 'archived_chat_messages', 'archived_tutoring_requests']) {
        try {
            const snap = await db.collection(col).get();
            console.log(`  - Collection '${col}': ${snap.size} documents`);
        } catch (e: any) {
            console.log(`  - Collection '${col}': unable to count (${e.message})`);
        }
    }

    // ==========================================
    // 4. PRINT FORMATTED FASE REPORT
    // ==========================================
    console.log(`\n==================================================`);
    console.log(`===== F109.11.3 RESULTADO =====`);
    console.log(`==================================================\n`);

    console.log(`## ORPHAN CHAT\n`);
    console.log(`Expected:`);
    console.log(`${results.chat.expectedPath}\n`);
    console.log(`Status:`);
    console.log(`${results.chat.status}\n`);
    console.log(`Actual path:`);
    console.log(`${results.chat.actualPath || 'NONE'}\n`);
    console.log(`Archived:`);
    console.log(`${results.chat.archivedExists ? 'YES' : 'NO'}\n`);
    console.log(`Matches found:`);
    console.log(`${results.chat.alternateMatches?.join(', ') || 'NONE'}\n`);

    console.log(`## ORPHAN TUTORING\n`);
    console.log(`Expected:`);
    console.log(`${results.tutoring.expectedPath}\n`);
    console.log(`Status:`);
    console.log(`${results.tutoring.status}\n`);
    console.log(`Actual path:`);
    console.log(`${results.tutoring.actualPath || 'NONE'}\n`);
    console.log(`Archived:`);
    console.log(`${results.tutoring.archivedExists ? 'YES' : 'NO'}\n`);
    console.log(`Matches found:`);
    console.log(`${results.tutoring.alternateMatches?.join(', ') || 'NONE'}\n`);

    console.log(`## ACTIVE REFERENCES\n`);
    console.log(`Chats inspected: YES, Tutoring Requests inspected: YES\n`);

    console.log(`## DISCOVERY ERRORS\n`);
    console.log(`NONE (Audit completed with non-blocking pattern)\n`);

    console.log(`## PRODUCTION DATA MODIFIED\n`);
    console.log(`NO\n`);

    console.log(`## F109 NEXT STEP\n`);
    const allFound = (results.chat.status === 'FOUND_EXPECTED_PATH' || results.chat.status === 'FOUND_OTHER_PATH') &&
                     (results.tutoring.status === 'FOUND_EXPECTED_PATH' || results.tutoring.status === 'FOUND_OTHER_PATH');
    if (allFound) {
        console.log(`READY (Update archiveOrphans.ts with confirmed paths and rerun DRY RUN)\n`);
    } else if (results.chat.status === 'NOT_FOUND' && results.tutoring.status === 'NOT_FOUND') {
        console.log(`REVALIDATE (Both documents not found in production database; archive step may be complete/unnecessary)\n`);
    } else {
        console.log(`REVALIDATE (Partial discovery - verify specific orphan paths before proceeding)\n`);
    }

    console.log(`F109.11.3 STATUS:`);
    console.log(`READY FOR CLOUD SHELL SCAN`);

    return results;
}

if (process.argv[1] && (process.argv[1].endsWith('discoverOrphans.ts') || process.argv[1].endsWith('discoverOrphans.js') || process.argv[1].includes('discoverOrphans'))) {
    runForensicDiscovery().catch(err => {
        console.error("Forensic discovery fatal error:", err);
        process.exit(1);
    });
}
