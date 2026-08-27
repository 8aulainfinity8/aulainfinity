import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useChat } from '../hooks/useChat';
import { updateDoc, deleteDoc, doc } from 'firebase/firestore';

vi.mock('firebase/firestore', async () => {
    const actual = await vi.importActual<any>('firebase/firestore');
    return {
        ...actual,
        doc: vi.fn(),
        updateDoc: vi.fn(),
        deleteDoc: vi.fn(),
        onSnapshot: vi.fn().mockReturnValue(() => {})
    };
});

vi.mock('../contexts/AuthContext', () => ({
    useAuth: () => ({ currentUser: { uid: 'user_1' } })
}));

vi.mock('../services/firebase', () => ({
    db: {},
    auth: { currentUser: { uid: 'user_1', emailVerified: true } }
}));

describe('FASE 11 — Origen real de edición y borrado (Chats unified collection)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('1. El Hook useChat exporta editMessage y deleteMessage', () => {
        const { result } = renderHook(() => useChat('chat_123', 'user_1'));
        expect(result.current.editMessage).toBeDefined();
        expect(result.current.deleteMessage).toBeDefined();
    });

    it('2. Editar mensaje usa la ruta chats/{chatId}/messages/{messageId} a traves de updateDoc', async () => {
        (doc as any).mockImplementation((db: any, col1: string, chat: string, col2: string, id: string) => ({ path: `${col1}/${chat}/${col2}/${id}` }));
        (updateDoc as any).mockResolvedValueOnce(undefined);

        const { result } = renderHook(() => useChat('chat_123', 'user_1'));
        
        await act(async () => {
            await result.current.editMessage('msg_456', 'New text');
        });

        expect(doc).toHaveBeenCalledWith(expect.anything(), 'chats', 'chat_123', 'messages', 'msg_456');
        expect(updateDoc).toHaveBeenCalledWith(
            expect.objectContaining({ path: 'chats/chat_123/messages/msg_456' }),
            expect.objectContaining({ text: 'New text' })
        );
    });

    it('3. Borrar mensaje usa la ruta chats/{chatId}/messages/{messageId} a traves de deleteDoc', async () => {
        (doc as any).mockImplementation((db: any, col1: string, chat: string, col2: string, id: string) => ({ path: `${col1}/${chat}/${col2}/${id}` }));
        (deleteDoc as any).mockResolvedValueOnce(undefined);

        const { result } = renderHook(() => useChat('chat_123', 'user_1'));
        
        await act(async () => {
            await result.current.deleteMessage('msg_456');
        });

        expect(doc).toHaveBeenCalledWith(expect.anything(), 'chats', 'chat_123', 'messages', 'msg_456');
        expect(deleteDoc).toHaveBeenCalledWith(
            expect.objectContaining({ path: 'chats/chat_123/messages/msg_456' })
        );
    });
});
