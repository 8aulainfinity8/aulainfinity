import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

export const ARCHIVE_TASKS = [
    {
        src: 'chats/legacy_chat_id_123/messages/orphan_chat_msg_x',
        dst: 'archived_chat_messages/orphan_chat_msg_x'
    },
    {
        src: 'tutoring_requests/orphan_tutor_req_y',
        dst: 'archived_tutoring_requests/orphan_tutor_req_y'
    }
];

// Custom deep equality
export function isDeepEqual(obj1: any, obj2: any): boolean {
    if (obj1 === obj2) return true;
    if (typeof obj1 !== 'object' || obj1 === null || typeof obj2 !== 'object' || obj2 === null) return false;
    const keys1 = Object.keys(obj1);
    const keys2 = Object.keys(obj2);
    if (keys1.length !== keys2.length) return false;
    for (const key of keys1) {
        if (!keys2.includes(key) || !isDeepEqual(obj1[key], obj2[key])) return false;
    }
    return true;
}

export function isValidDocumentPath(path: string): boolean {
    if (!path || typeof path !== 'string') return false;
    const segments = path.split('/').filter(Boolean);
    return segments.length > 0 && segments.length % 2 === 0;
}

async function main() {
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const databaseId = process.env.FIRESTORE_DATABASE_ID;
    const impersonationEmail = process.env.FIREBASE_SERVICE_ACCOUNT_EMAIL;
    const dryRun = process.env.DRY_RUN !== 'false';

    if (!projectId || !databaseId) {
        console.error("Missing FIREBASE_PROJECT_ID or FIRESTORE_DATABASE_ID");
        process.exit(1);
    }

    console.log(`--- ARCHIVE SCRIPT ---`);
    console.log(`Project: ${projectId}`);
    console.log(`Database: ${databaseId}`);
    console.log(`Impersonated service account: ${impersonationEmail || 'None (Using Default ADC)'}`);
    console.log(`Mode: ${dryRun ? 'DRY_RUN' : 'LIVE'}`);

    const app = initializeApp({ projectId });

    // Validate project
    if (app.options.projectId !== projectId) {
        console.error(`Project ID mismatch! Expected ${projectId}, got ${app.options.projectId}`);
        process.exit(1);
    }

    const db = getFirestore(app, databaseId);

    const tasks = ARCHIVE_TASKS;

    // Validate all task paths are valid document paths (even number of segments)
    for (const task of tasks) {
        if (!isValidDocumentPath(task.src)) {
            console.error(`Invalid source document path (must have even number of segments): ${task.src}`);
            process.exit(1);
        }
        if (!isValidDocumentPath(task.dst)) {
            console.error(`Invalid destination document path (must have even number of segments): ${task.dst}`);
            process.exit(1);
        }
    }

    for (const task of tasks) {
        console.log(`\nProcessing ${task.src}...`);
        const srcRef = db.doc(task.src);
        const dstRef = db.doc(task.dst);

        const srcSnap = await srcRef.get();
        if (!srcSnap.exists) {
            console.error(`Source not found: ${task.src}`);
            process.exit(1);
        }

        const srcData = srcSnap.data();

        // Check dst
        const dstSnap = await dstRef.get();
        if (dstSnap.exists) {
            const dstData = dstSnap.data();
            if (isDeepEqual(srcData, dstData)) {
                console.log(`Idempotency: Dest already exists and is identical. Skipping copy.`);
            } else {
                console.error(`Abort: Dest exists and is DIFFERENT.`);
                process.exit(1);
            }
        } else {
            if (dryRun) {
                console.log(`[DRY RUN] Would copy ${task.src} to ${task.dst}`);
            } else {
                await dstRef.set(srcData!);
                console.log(`Copied to ${task.dst}`);

                // Verification
                const dstSnapVerify = await dstRef.get();
                if (!isDeepEqual(srcData, dstSnapVerify.data())) {
                    console.error(`Abort: Deep equality failure.`);
                    process.exit(1);
                }

                await srcRef.delete();
                console.log(`Deleted source: ${task.src}`);
            }
        }
    }
    console.log("\nProcess complete.");
}

export { main };

if (process.argv[1] && (process.argv[1].endsWith('archiveOrphans.ts') || process.argv[1].endsWith('archiveOrphans.js') || process.argv[1].includes('archiveOrphans'))) {
    main().catch(err => {
        console.error(err);
        process.exit(1);
    });
}

