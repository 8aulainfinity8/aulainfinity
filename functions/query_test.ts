import * as admin from 'firebase-admin';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
admin.initializeApp({ projectId: 'aulainfinity8-a6ac0' });
const db = getFirestore(admin.app(), 'ai-studio-aulainfinity-6be7791f-ef3e-4fc4-b45b-98918b1b57ca');
async function test() {
  try {
    const col = db.collection('chats');
    console.log(typeof col.where);
  } catch (e) {
    console.error('Error:', e.message);
  }
}
test();
