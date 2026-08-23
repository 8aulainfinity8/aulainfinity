const fs = require('fs');
let code = fs.readFileSync('src/services/firestoreSync.ts', 'utf8');

// replace the clear logic
code = code.replace(
`export const syncClearChatMessagesInFirestore = async (conversationId: string): Promise<void> => {
    try {
        const targetIds = [conversationId, conversationId.replace(/^direct_/, ''), \`direct_\${conversationId}\`];
        for (const tid of targetIds) {
            const subMsgsSnap = await getDocs(collection(db, 'chats', tid, 'messages')).catch(() => null);
            if (subMsgsSnap) {
                await Promise.all(subMsgsSnap.docs.map(d => deleteDoc(d.ref).catch(() => {})));
            }
        }
        for (const colName of ['firestore_direct_messages', 'firestore_peer_messages', 'firestore_teacher_messages', 'firestore_course_messages']) {
            const colRef = collection(db, colName);
            for (const tid of targetIds) {
                const q = query(colRef, where('conversationId', '==', tid));
                const snap = await getDocs(q).catch(() => null);
                if (snap) {
                    await Promise.all(snap.docs.map(d => deleteDoc(d.ref).catch(() => {})));
                }
            }
        }
    } catch (e) {
        console.warn('Failed to clear chat messages in Firestore:', e);
    }
};`,
`import { httpsCallable } from 'firebase/functions';

export const syncClearChatMessagesInFirestore = async (conversationId: string): Promise<void> => {
    try {
        const { functions } = await import('./firebase');
        const adminClearChatMessages = httpsCallable(functions, 'adminClearChatMessages');
        await adminClearChatMessages({ conversationId });
    } catch (e) {
        console.warn('Failed to clear chat messages via Callable Function:', e);
        throw e;
    }
};`
);

fs.writeFileSync('src/services/firestoreSync.ts', code);
console.log('done sync');
