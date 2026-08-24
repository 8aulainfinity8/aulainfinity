
import admin from 'firebase-admin';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

admin.initializeApp();

if (process.env.GOOGLE_CLOUD_PROJECT !== "aulainfinity8-a6ac0") {
    throw new Error(`CRITICAL: Project ID mismatch! Expected aulainfinity8-a6ac0, got ${process.env.GOOGLE_CLOUD_PROJECT}`);
}

const db = getFirestore(admin.getApp(), "ai-studio-aulainfinity-6be7791f-ef3e-4fc4-b45b-98918b1b57ca");

const ARCHIVE_MAP = [
    {
        source: 'chats/legacy_chat_id_123/messages/orphan_chat_msg_x',
        dest: 'archived_data/chat_messages/orphan_chat_msg_x',
        reason: 'F108_ORPHAN'
    },
    {
        source: 'tutoring_requests/orphan_tutor_req_y',
        dest: 'archived_data/tutoring_requests/orphan_tutor_req_y',
        reason: 'F108_ORPHAN'
    }
];

async function archiveOrphans(dryRun: boolean = true) {
    for (const item of ARCHIVE_MAP) {
        console.log(`Processing ${item.source}...`);
        const sourceRef = db.doc(item.source);
        const sourceDoc = await sourceRef.get();
        
        if (!sourceDoc.exists) {
            console.error(`Source not found: ${item.source}`);
            continue;
        }

        const data = sourceDoc.data();
        const archiveData = {
            ...data,
            sourcePath: item.source,
            archivedAt: FieldValue.serverTimestamp(),
            archiveReason: item.reason,
            originalDocumentId: sourceDoc.id
        };

        if (!dryRun) {
            const destRef = db.doc(item.dest);
            await destRef.set(archiveData);
            
            // Verify
            const destDoc = await destRef.get();
            if (destDoc.exists) {
                await sourceRef.delete();
                console.log(`Successfully archived ${item.source}`);
            } else {
                throw new Error(`Verification failed for ${item.source}`);
            }
        } else {
            console.log(`Dry run: ${item.source} would be copied to ${item.dest}`);
        }
    }
}

archiveOrphans(process.argv.includes('--dry-run')).catch(console.error);
