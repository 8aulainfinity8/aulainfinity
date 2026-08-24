import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';

// Custom deep equality
function isDeepEqual(obj1: any, obj2: any): boolean {
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

    admin.initializeApp();

    // Validate project
    if (admin.app().options.projectId !== projectId) {
        console.error(`Project ID mismatch! Expected ${projectId}, got ${admin.app().options.projectId}`);
        process.exit(1);
    }

    const db = getFirestore(admin.app(), databaseId);

    const tasks = [
        {
            src: 'chats/legacy_chat_id_123/messages/orphan_chat_msg_x',
            dst: 'archived_data/chat_messages/orphan_chat_msg_x'
        },
        {
            src: 'tutoring_requests/orphan_tutor_req_y',
            dst: 'archived_data/tutoring_requests/orphan_tutor_req_y'
        }
    ];

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

main().catch(err => {
    console.error(err);
    process.exit(1);
});
