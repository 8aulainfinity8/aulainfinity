const admin = require('firebase-admin');
admin.initializeApp({ projectId: 'aulainfinity8-a6ac0' });
const db = admin.firestore();
db.settings({ databaseId: 'ai-studio-aulainfinity-6be7791f-ef3e-4fc4-b45b-98918b1b57ca' });
async function test() {
  try {
    const snap = await db.collection('chats').limit(1).get();
    console.log('Chats size:', snap.size);
  } catch (e) {
    console.error('Error:', e.message);
  }
}
test();
