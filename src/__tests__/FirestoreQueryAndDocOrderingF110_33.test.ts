import { describe, it, expect } from 'vitest';
import { 
  query, 
  collection, 
  orderBy, 
  startAt, 
  startAfter, 
  limitToLast, 
  doc 
} from 'firebase/firestore';
import { db } from '../services/firebase';

describe('F110.33 — Query Ordering and Firestore Doc Validation', () => {
    it('1. Verifies that orderBy MUST precede startAt / startAfter in Firebase queries', () => {
        const colRef = collection(db, 'chats_test_ordering');
        
        // Attempting startAt without orderBy throws INVALID_ARGUMENT in real Firebase SDK
        expect(() => {
            query(colRef, startAt('some_value') as any);
        }).toThrow(/Too many arguments provided to|Invalid query/i);

        // Correct sequence: orderBy BEFORE startAt
        const validQuery = query(colRef, orderBy('timestamp', 'asc'), startAt('2026-01-01'));
        expect(validQuery).toBeDefined();
        expect((validQuery as any).type).toBe('query');
    });

    it('2. Verifies that orderBy MUST precede startAfter in Firebase queries', () => {
        const colRef = collection(db, 'chats_test_ordering');
        
        expect(() => {
            query(colRef, startAfter('some_value') as any);
        }).toThrow(/Too many arguments provided to|Invalid query/i);

        const validQuery = query(colRef, orderBy('createdAt', 'desc'), startAfter('2026-01-01'));
        expect(validQuery).toBeDefined();
    });

    it('3. Verifies that doc() accepts valid Firestore or CollectionReference instances', () => {
        const chatDocRef = doc(db, 'chats', 'chat_123');
        expect(chatDocRef.path).toBe('chats/chat_123');

        const messagesColRef = collection(chatDocRef, 'messages');
        expect(messagesColRef.path).toBe('chats/chat_123/messages');

        const msgDocRef = doc(messagesColRef, 'msg_456');
        expect(msgDocRef.path).toBe('chats/chat_123/messages/msg_456');
    });

    it('4. Verifies query composition in useChat (orderBy timestamp asc -> limitToLast 100)', () => {
        const messagesColRef = collection(db, 'chats', 'direct_123', 'messages');
        const q = query(messagesColRef, orderBy('timestamp', 'asc'), limitToLast(100));
        expect(q).toBeDefined();
        expect((q as any).type).toBe('query');
    });
});
