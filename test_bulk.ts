import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
admin.initializeApp({ projectId: 'aulainfinity8-a6ac0' });
const db = getFirestore();
const writer = db.bulkWriter();
console.log(typeof writer.flush);
