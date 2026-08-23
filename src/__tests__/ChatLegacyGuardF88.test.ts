import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('FASE F88 — Test Suite de Guardia de Legacy y Simplificación del Chat', () => {
  it('1. VERIFIED_AUTH_CHAT_MUST_NOT_IMPORT_LEGACY_CHAT_WRITERS', () => {
    const useChatPath = path.join(__dirname, '../hooks/useChat.ts');
    const content = fs.readFileSync(useChatPath, 'utf8');

    const forbiddenStrings = [
      'firestore_direct_messages',
      'firestore_peer_messages',
      'firestore_teacher_messages',
      'firestore_course_messages',
      'firestore_conversations',
      'firestore_peer_conversations'
    ];

    forbiddenStrings.forEach(str => {
      expect(content).not.toContain(str);
    });
  });

  it('2. Las operaciones de send, edit, delete usan la ruta canonica chats/{chatId}/messages/{messageId}', () => {
    const useChatPath = path.join(__dirname, '../hooks/useChat.ts');
    const content = fs.readFileSync(useChatPath, 'utf8');

    // Comprobar que se usa la ruta chats/{chatId}/messages
    expect(content).toContain("collection(db, 'chats', chatId, 'messages')");
    expect(content).toContain("doc(db, 'chats', chatId, 'messages', messageId)");
    expect(content).toContain("deleteDoc(messageRef)");
    expect(content).toContain("updateDoc(messageRef, { text: newText })");
  });
});
