import { describe, it, expect, vi, beforeEach } from 'vitest';
import React, { useState } from 'react';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { useChat } from '../hooks/useChat';

// Captured snapshot listener callbacks
let messageSnapshotCallback: ((snapshot: any) => void) | null = null;
let messageErrorCallback: ((error: any) => void) | null = null;
let chatMetaSnapshotCallback: ((snapshot: any) => void) | null = null;
let mockOnSnapshotUnsubscribe = vi.fn();

vi.mock('../services/firebase', () => ({
    db: {},
    auth: { currentUser: { uid: 'teacher_1', emailVerified: true } }
}));

vi.mock('firebase/firestore', async () => {
    const actual = await vi.importActual('firebase/firestore');
    return {
        ...actual as any,
        doc: vi.fn((_db, _col, id) => ({ id, path: `chats/${id}` })),
        collection: vi.fn((_db, _col, id, sub) => ({ path: sub ? `chats/${id}/${sub}` : `chats` })),
        query: vi.fn((coll) => ({ path: coll?.path || 'chats/chat_123/messages', isQuery: true })),
        orderBy: vi.fn(),
        limitToLast: vi.fn(),
        onSnapshot: vi.fn((refOrQuery, optsOrCb, cb, errCb) => {
            const hasOptions = typeof optsOrCb === 'object';
            const successCb = hasOptions ? cb : optsOrCb;
            const failureCb = hasOptions ? errCb : cb;

            if (refOrQuery?.path?.includes('/messages') || refOrQuery?.isQuery) {
                messageSnapshotCallback = successCb;
                messageErrorCallback = failureCb;
            } else {
                chatMetaSnapshotCallback = successCb;
            }
            return mockOnSnapshotUnsubscribe;
        })
    };
});

vi.mock('../contexts/AuthContext', () => ({
    useAuth: () => ({
        isFirebaseAuthReady: true,
        firebaseUser: { uid: 'teacher_1', emailVerified: true },
        firebaseEmailVerified: true,
        firebaseRole: 'teacher'
    })
}));

describe('F110.36 — Correct Real Loading State & First Snapshot Diagnostics', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        localStorage.clear();
        messageSnapshotCallback = null;
        messageErrorCallback = null;
        chatMetaSnapshotCallback = null;
    });

    // Component wrapper for testing useChat
    const TestChatConsumer: React.FC<{
        chatId: string | null;
        onReadyLog?: (chatId: string) => void;
    }> = ({ chatId, onReadyLog }) => {
        const [text, setText] = useState('');
        const { messages, loading, listenerReady } = useChat(chatId, 'teacher_1');

        React.useEffect(() => {
            if (!loading && listenerReady && chatId) {
                onReadyLog?.(chatId);
            }
        }, [loading, listenerReady, chatId, onReadyLog]);

        return (
            <div>
                <div data-testid="chat-id">{chatId || 'none'}</div>
                <div data-testid="loading-state">{loading ? 'loading' : 'ready'}</div>
                <div data-testid="listener-ready">{listenerReady ? 'yes' : 'no'}</div>
                <div data-testid="message-count">{messages.length}</div>
                <div data-testid="first-message">{messages[0]?.text || ''}</div>
                <input
                    data-testid="chat-input"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                />
            </div>
        );
    };

    it('TEST 1 & TEST 2 — Listener creado y antes del snapshot: loading=true, listenerReady=no', () => {
        render(<TestChatConsumer chatId="chat_123" />);

        expect(screen.getByTestId('loading-state').textContent).toBe('loading');
        expect(screen.getByTestId('listener-ready').textContent).toBe('no');
        expect(screen.getByTestId('message-count').textContent).toBe('0');
    });

    it('TEST 3 — Primer snapshot recibido: loading=false, listenerReady=yes', () => {
        render(<TestChatConsumer chatId="chat_123" />);

        expect(screen.getByTestId('loading-state').textContent).toBe('loading');
        expect(screen.getByTestId('listener-ready').textContent).toBe('no');

        act(() => {
            messageSnapshotCallback?.({
                size: 2,
                docs: [
                    { id: 'm1', data: () => ({ id: 'm1', text: 'Hola mundo', senderId: 'student_1', timestamp: 1000 }) },
                    { id: 'm2', data: () => ({ id: 'm2', text: '¿Cómo estás?', senderId: 'teacher_1', timestamp: 2000 }) }
                ],
                metadata: { fromCache: false, hasPendingWrites: false }
            });
        });

        expect(screen.getByTestId('loading-state').textContent).toBe('ready');
        expect(screen.getByTestId('listener-ready').textContent).toBe('yes');
        expect(screen.getByTestId('message-count').textContent).toBe('2');
        expect(screen.getByTestId('first-message').textContent).toBe('Hola mundo');
    });

    it('TEST 4 — CHAT_READY sólo se dispara después del primer snapshot (firstSnapshotReceived === true)', () => {
        const readySpy = vi.fn();
        render(<TestChatConsumer chatId="chat_123" onReadyLog={readySpy} />);

        // Before snapshot: readySpy MUST NOT have been called
        expect(readySpy).not.toHaveBeenCalled();

        // Deliver first snapshot
        act(() => {
            messageSnapshotCallback?.({
                size: 1,
                docs: [
                    { id: 'm1', data: () => ({ id: 'm1', text: 'Mensaje 1', senderId: 'student_1', timestamp: 1000 }) }
                ],
                metadata: { fromCache: false, hasPendingWrites: false }
            });
        });

        expect(readySpy).toHaveBeenCalledTimes(1);
        expect(readySpy).toHaveBeenCalledWith('chat_123');
    });

    it('TEST 5 — Error terminal de suscripción: loading=false, listenerReady=no', () => {
        render(<TestChatConsumer chatId="chat_123" />);

        expect(screen.getByTestId('loading-state').textContent).toBe('loading');

        act(() => {
            messageErrorCallback?.(new Error('Permission denied or network timeout'));
        });

        expect(screen.getByTestId('loading-state').textContent).toBe('ready'); // loading becomes false on error
        expect(screen.getByTestId('listener-ready').textContent).toBe('no');
    });

    it('TEST 6 — Cambio de chat: loading=true nuevamente, listenerReady=no, estado anterior aislado', () => {
        const { rerender } = render(<TestChatConsumer chatId="chat_123" />);

        // Provide first snapshot for chat_123
        act(() => {
            messageSnapshotCallback?.({
                size: 1,
                docs: [
                    { id: 'm1', data: () => ({ id: 'm1', text: 'Mensaje Chat 1', senderId: 'student_1', timestamp: 1000 }) }
                ],
                metadata: { fromCache: false, hasPendingWrites: false }
            });
        });

        expect(screen.getByTestId('loading-state').textContent).toBe('ready');
        expect(screen.getByTestId('listener-ready').textContent).toBe('yes');
        expect(screen.getByTestId('first-message').textContent).toBe('Mensaje Chat 1');

        // Switch to a new chat: chat_456
        rerender(<TestChatConsumer chatId="chat_456" />);

        // Must immediately reset loading to true and listenerReady to no, and isolate prior messages
        expect(screen.getByTestId('loading-state').textContent).toBe('loading');
        expect(screen.getByTestId('listener-ready').textContent).toBe('no');
        expect(screen.getByTestId('message-count').textContent).toBe('0');
        expect(screen.getByTestId('first-message').textContent).toBe('');
    });

    it('TEST 7 — Typing no altera el estado de loading', () => {
        render(<TestChatConsumer chatId="chat_123" />);

        // Deliver snapshot
        act(() => {
            messageSnapshotCallback?.({
                size: 1,
                docs: [
                    { id: 'm1', data: () => ({ id: 'm1', text: 'Mensaje', senderId: 'student_1', timestamp: 1000 }) }
                ],
                metadata: { fromCache: false, hasPendingWrites: false }
            });
        });

        expect(screen.getByTestId('loading-state').textContent).toBe('ready');

        // Simulate typing
        const input = screen.getByTestId('chat-input');
        fireEvent.change(input, { target: { value: 'Texto de prueba' } });

        // Loading must remain ready (not loading)
        expect(screen.getByTestId('loading-state').textContent).toBe('ready');
        expect(screen.getByTestId('listener-ready').textContent).toBe('yes');
    });

    it('TEST 8 — Nuevo mensaje posterior no vuelve a loading=true', () => {
        render(<TestChatConsumer chatId="chat_123" />);

        // First snapshot
        act(() => {
            messageSnapshotCallback?.({
                size: 1,
                docs: [
                    { id: 'm1', data: () => ({ id: 'm1', text: 'Mensaje 1', senderId: 'student_1', timestamp: 1000 }) }
                ],
                metadata: { fromCache: false, hasPendingWrites: false }
            });
        });

        expect(screen.getByTestId('loading-state').textContent).toBe('ready');
        expect(screen.getByTestId('message-count').textContent).toBe('1');

        // Subsequent snapshot arrives (new message)
        act(() => {
            messageSnapshotCallback?.({
                size: 2,
                docs: [
                    { id: 'm1', data: () => ({ id: 'm1', text: 'Mensaje 1', senderId: 'student_1', timestamp: 1000 }) },
                    { id: 'm2', data: () => ({ id: 'm2', text: 'Mensaje 2', senderId: 'teacher_1', timestamp: 2000 }) }
                ],
                metadata: { fromCache: false, hasPendingWrites: false }
            });
        });

        expect(screen.getByTestId('loading-state').textContent).toBe('ready');
        expect(screen.getByTestId('listener-ready').textContent).toBe('yes');
        expect(screen.getByTestId('message-count').textContent).toBe('2');
    });
});
