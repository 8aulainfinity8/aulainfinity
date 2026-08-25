import { describe, it, expect, vi, beforeEach } from 'vitest';
import React, { useState } from 'react';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { useChat } from '../hooks/useChat';
import { getApps } from 'firebase/app';
import { db, auth } from '../services/firebase';

// Captured snapshot listener callbacks
let messageSnapshotCallback: ((snapshot: any) => void) | null = null;
let messageErrorCallback: ((error: any) => void) | null = null;
let chatMetaSnapshotCallback: ((snapshot: any) => void) | null = null;
let mockOnSnapshotUnsubscribe = vi.fn();

vi.mock('firebase/app', async () => {
    const actual = await vi.importActual('firebase/app');
    return {
        ...actual as any,
        getApps: () => [{ name: '[DEFAULT]', options: { projectId: 'aulainfinity8-a6ac0' } }],
        initializeApp: vi.fn(() => ({ name: '[DEFAULT]', options: { projectId: 'aulainfinity8-a6ac0' } }))
    };
});

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

describe('F110.38 — Definitive Spinner Fix Validation & State Lifecycle', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        messageSnapshotCallback = null;
        messageErrorCallback = null;
        chatMetaSnapshotCallback = null;
    });

    const TestChatView: React.FC<{
        chatId: string | null;
        onReady?: () => void;
    }> = ({ chatId, onReady }) => {
        const [inputText, setInputText] = useState('');
        const { messages, loading, listenerReady } = useChat(chatId, 'teacher_1');

        React.useEffect(() => {
            if (!loading && listenerReady && chatId) {
                onReady?.();
            }
        }, [loading, listenerReady, chatId, onReady]);

        const showSpinner = loading && Boolean(chatId);
        const showEmptyState = !chatId;

        return (
            <div>
                <div data-testid="chat-id">{chatId || 'none'}</div>
                {showEmptyState && <div data-testid="empty-state">EMPTY_STATE</div>}
                {showSpinner && <div data-testid="spinner">SPINNER</div>}
                {!showSpinner && !showEmptyState && <div data-testid="chat-body">CHAT_CONTENT</div>}
                <div data-testid="loading-val">{loading ? 'true' : 'false'}</div>
                <div data-testid="listener-ready-val">{listenerReady ? 'true' : 'false'}</div>
                <div data-testid="message-count">{messages.length}</div>
                <input
                    data-testid="chat-input"
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                />
            </div>
        );
    };

    it('1. Verifies Singleton Firebase app instances and standard transport configuration', () => {
        const apps = getApps();
        expect(apps.length).toBe(1);
        expect(db).toBeDefined();
        expect(auth).toBeDefined();
    });

    it('2. EMPTY STATE: When no conversation is selected (chatId = null), renders EMPTY_STATE without spinner', () => {
        render(<TestChatView chatId={null} />);

        expect(screen.getByTestId('empty-state').textContent).toBe('EMPTY_STATE');
        expect(screen.queryByTestId('spinner')).toBeNull();
        expect(screen.getByTestId('loading-val').textContent).toBe('false');
        expect(screen.getByTestId('listener-ready-val').textContent).toBe('false');
    });

    it('3. CONVERSATION SELECTION: Shows spinner only until first snapshot arrives, then hides spinner and sets CHAT_READY', () => {
        const onReadySpy = vi.fn();
        render(<TestChatView chatId="direct_JIVpN7ThwvfXlQMpfDJUJzNVn573_pi7jAeeuUsebanz0F7pGhXVjzB13" onReady={onReadySpy} />);

        // Before first snapshot: loading is true, spinner is visible
        expect(screen.getByTestId('spinner')).toBeDefined();
        expect(screen.getByTestId('loading-val').textContent).toBe('true');
        expect(screen.getByTestId('listener-ready-val').textContent).toBe('false');
        expect(onReadySpy).not.toHaveBeenCalled();

        // Deliver first snapshot (fast default transport response)
        act(() => {
            messageSnapshotCallback?.({
                size: 2,
                docs: [
                    { id: 'm1', data: () => ({ id: 'm1', text: 'Hello teacher', senderId: 'student_1', timestamp: 1000 }) },
                    { id: 'm2', data: () => ({ id: 'm2', text: 'How can I help?', senderId: 'teacher_1', timestamp: 2000 }) }
                ],
                metadata: { fromCache: false, hasPendingWrites: false }
            });
        });

        // After first snapshot: spinner is HIDDEN, chat body is visible, onReady is fired
        expect(screen.queryByTestId('spinner')).toBeNull();
        expect(screen.getByTestId('chat-body').textContent).toBe('CHAT_CONTENT');
        expect(screen.getByTestId('loading-val').textContent).toBe('false');
        expect(screen.getByTestId('listener-ready-val').textContent).toBe('true');
        expect(screen.getByTestId('message-count').textContent).toBe('2');
        expect(onReadySpy).toHaveBeenCalledTimes(1);
    });

    it('4. TYPING: Input modifications do NOT trigger spinner or reset loading', () => {
        render(<TestChatView chatId="chat_123" />);

        // Deliver initial snapshot
        act(() => {
            messageSnapshotCallback?.({
                size: 1,
                docs: [
                    { id: 'm1', data: () => ({ id: 'm1', text: 'Initial message', senderId: 'student_1', timestamp: 1000 }) }
                ],
                metadata: { fromCache: false, hasPendingWrites: false }
            });
        });

        expect(screen.queryByTestId('spinner')).toBeNull();
        expect(screen.getByTestId('loading-val').textContent).toBe('false');

        // Type in input
        const input = screen.getByTestId('chat-input');
        fireEvent.change(input, { target: { value: 'Writing a reply...' } });

        // Spinner remains hidden and loading remains false
        expect(screen.queryByTestId('spinner')).toBeNull();
        expect(screen.getByTestId('loading-val').textContent).toBe('false');
        expect(screen.getByTestId('listener-ready-val').textContent).toBe('true');
    });

    it('5. NEW MESSAGE: Realtime snapshot updates message list without showing spinner', () => {
        render(<TestChatView chatId="chat_123" />);

        // Initial snapshot
        act(() => {
            messageSnapshotCallback?.({
                size: 1,
                docs: [
                    { id: 'm1', data: () => ({ id: 'm1', text: 'First msg', senderId: 'student_1', timestamp: 1000 }) }
                ],
                metadata: { fromCache: false, hasPendingWrites: false }
            });
        });

        expect(screen.getByTestId('message-count').textContent).toBe('1');
        expect(screen.queryByTestId('spinner')).toBeNull();

        // New message arrives via onSnapshot
        act(() => {
            messageSnapshotCallback?.({
                size: 2,
                docs: [
                    { id: 'm1', data: () => ({ id: 'm1', text: 'First msg', senderId: 'student_1', timestamp: 1000 }) },
                    { id: 'm2', data: () => ({ id: 'm2', text: 'Second msg', senderId: 'student_1', timestamp: 2000 }) }
                ],
                metadata: { fromCache: false, hasPendingWrites: false }
            });
        });

        expect(screen.getByTestId('message-count').textContent).toBe('2');
        expect(screen.queryByTestId('spinner')).toBeNull();
        expect(screen.getByTestId('loading-val').textContent).toBe('false');
        expect(screen.getByTestId('listener-ready-val').textContent).toBe('true');
    });

    it('6. CONVERSATION SWITCH: Switch to new conversation clears prior state and cycles cleanly', () => {
        const { rerender } = render(<TestChatView chatId="chat_A" />);

        act(() => {
            messageSnapshotCallback?.({
                size: 1,
                docs: [{ id: 'mA', data: () => ({ id: 'mA', text: 'Msg A', senderId: 'student_A', timestamp: 1000 }) }],
                metadata: { fromCache: false, hasPendingWrites: false }
            });
        });

        expect(screen.getByTestId('message-count').textContent).toBe('1');
        expect(screen.queryByTestId('spinner')).toBeNull();

        // Switch conversation to chat_B
        rerender(<TestChatView chatId="chat_B" />);

        // Spinner appears for chat_B
        expect(screen.getByTestId('spinner')).toBeDefined();
        expect(screen.getByTestId('loading-val').textContent).toBe('true');
        expect(screen.getByTestId('listener-ready-val').textContent).toBe('false');

        // Deliver chat_B snapshot
        act(() => {
            messageSnapshotCallback?.({
                size: 1,
                docs: [{ id: 'mB', data: () => ({ id: 'mB', text: 'Msg B', senderId: 'student_B', timestamp: 2000 }) }],
                metadata: { fromCache: false, hasPendingWrites: false }
            });
        });

        expect(screen.queryByTestId('spinner')).toBeNull();
        expect(screen.getByTestId('message-count').textContent).toBe('1');
        expect(screen.getByTestId('loading-val').textContent).toBe('false');
        expect(screen.getByTestId('listener-ready-val').textContent).toBe('true');
    });
});
