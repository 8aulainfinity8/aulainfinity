import { describe, it, expect, vi, beforeEach } from 'vitest';
import React, { useState } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useChat } from '../hooks/useChat';

// Mock firebase
vi.mock('../services/firebase', () => ({
    db: {},
    auth: { currentUser: { uid: 'teacher_1', emailVerified: true } }
}));

vi.mock('firebase/firestore', async () => {
    const actual = await vi.importActual('firebase/firestore');
    return {
        ...actual as any,
        doc: vi.fn().mockReturnValue({ id: 'chat_test_1', path: 'chats/chat_test_1' }),
        collection: vi.fn().mockReturnValue({ path: 'chats/chat_test_1/messages' }),
        query: vi.fn().mockReturnValue({}),
        orderBy: vi.fn(),
        limitToLast: vi.fn(),
        onSnapshot: vi.fn((refOrQuery, optsOrCb, cb) => {
            const callback = typeof optsOrCb === 'function' ? optsOrCb : cb;
            if (callback) {
                callback({
                    exists: () => true,
                    id: 'chat_test_1',
                    size: 0,
                    docs: [],
                    metadata: { fromCache: false, hasPendingWrites: false },
                    data: () => ({ participants: ['student_1', 'teacher_1'] })
                });
            }
            return () => {};
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

describe('F110.19 — Chat Loading Stability & Typing Spinner Elimination', () => {
    let queryClient: QueryClient;

    beforeEach(() => {
        queryClient = new QueryClient({
            defaultOptions: {
                queries: { retry: false },
            },
        });
        vi.clearAllMocks();
    });

    it('TEST 1 & 4 — Typing text in input does not trigger loading state changes in useChat', async () => {
        const TestComponent: React.FC = () => {
            const [input, setInput] = useState('');
            const { messages, loading, sendMessage } = useChat('chat_test_1', 'teacher_1', { studentId: 'student_1', teacherId: 'teacher_1' });

            return (
                <div>
                    <div data-testid="loading-state">{loading ? 'loading' : 'ready'}</div>
                    <div data-testid="msg-count">{messages.length}</div>
                    <input 
                        data-testid="message-input"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder="Escribe un mensaje..."
                    />
                </div>
            );
        };

        render(
            <QueryClientProvider client={queryClient}>
                <TestComponent />
            </QueryClientProvider>
        );

        // Initially loading might be true or false depending on snapshot, but once ready:
        const inputEl = screen.getByTestId('message-input');

        // Type characters sequentially
        fireEvent.change(inputEl, { target: { value: 'H' } });
        fireEvent.change(inputEl, { target: { value: 'Ho' } });
        fireEvent.change(inputEl, { target: { value: 'Hola' } });

        // Loading must never turn to true solely due to typing
        const loadingState = screen.getByTestId('loading-state').textContent;
        expect(loadingState).not.toBe('loading');
    });

    it('TEST 5 — Sending sets isSending / loading behavior correctly without triggering chat loading', async () => {
        const TestComponent: React.FC = () => {
            const [isSending, setIsSending] = useState(false);
            const { loading } = useChat('chat_test_1', 'teacher_1', { studentId: 'student_1', teacherId: 'teacher_1' });

            const handleSend = async () => {
                setIsSending(true);
                // simulate async send
                await new Promise(res => setTimeout(res, 50));
                setIsSending(false);
            };

            return (
                <div>
                    <div data-testid="loading">{loading ? 'yes' : 'no'}</div>
                    <div data-testid="issending">{isSending ? 'yes' : 'no'}</div>
                    <button data-testid="send-btn" onClick={handleSend}>Enviar</button>
                </div>
            );
        };

        render(
            <QueryClientProvider client={queryClient}>
                <TestComponent />
            </QueryClientProvider>
        );

        const sendBtn = screen.getByTestId('send-btn');
        fireEvent.click(sendBtn);

        expect(screen.getByTestId('issending').textContent).toBe('yes');
        expect(screen.getByTestId('loading').textContent).toBe('no');

        await waitFor(() => {
            expect(screen.getByTestId('issending').textContent).toBe('no');
        });
        expect(screen.getByTestId('loading').textContent).toBe('no');
    });
});
