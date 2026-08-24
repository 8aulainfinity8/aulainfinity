
import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';

admin.initializeApp({ projectId: "aulainfinity8-a6ac0" });

async function test() {
    try {
        const db = getFirestore();
        console.log("Connected to Default DB");
        const collections = await db.listCollections();
        console.log("Collections:", collections.map(c => c.id));
    } catch (e) {
        console.log("Default DB failed:", e.code, e.details);
    }
}
test();
