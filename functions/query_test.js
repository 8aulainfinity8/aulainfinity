import admin from 'firebase-admin';
admin.initializeApp({ projectId: 'aulainfinity8-a6ac0' });
const db = admin.firestore();
db.settings({ databaseId: 'ai-studio-aulainfinity-6be7791f-ef3e-4fc4-b45b-98918b1b57ca' });
async function test() {
  try {
    const cols = ['chats', 'conversations', 'firestore_conversations', 'firestore_direct_messages', 'firestore_peer_messages', 'firestore_teacher_messages'];
    for(const col of cols) {
       const snap = await db.collection(col).limit(2).get();
       console.log(col, 'size:', snap.size);
       if (!snap.empty) {
         const data = snap.docs[0].data();
         const ts = data.lastMessageTimestamp || data.createdAt || data.updatedAt;
         console.log('Sample TS:', ts ? ts.toDate() : 'none', 'Fields:', Object.keys(data).join(', '));
       }
    }
  } catch (e) {
    console.error('Error:', e.message);
  }
}
test();
