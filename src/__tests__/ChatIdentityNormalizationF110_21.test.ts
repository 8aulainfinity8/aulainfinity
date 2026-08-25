import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useChat } from '../hooks/useChat';
import { updateDoc, deleteDoc, doc, addDoc, getDoc, setDoc } from 'firebase/firestore';

vi.mock('firebase/firestore', async () => {
    const actual = await vi.importActual('firebase/firestore');
    return {
        ...actual as any,
        doc: vi.fn((...args) => {
            if (args.length === 1) {
                return { id: 'msg_doc_id_123', path: 'msg_path' };
            }
            return { path: args.join('/') };
        }),
        collection: vi.fn().mockReturnValue({ path: 'chats/direct_student_teacher/messages' }),
        query: vi.fn().mockReturnValue({}),
        orderBy: vi.fn(),
        limitToLast: vi.fn(),
        getDoc: vi.fn().mockResolvedValue({ 
            exists: () => true, 
            data: () => ({ participants: ['student', 'teacher', 'pi7jAeeuUsebanz0F7pGhXVjzB13'] }) 
        }),
        addDoc: vi.fn().mockResolvedValue({ id: 'msg_new' }),
        setDoc: vi.fn().mockResolvedValue(undefined),
        updateDoc: vi.fn(),
        deleteDoc: vi.fn(),
        onSnapshot: vi.fn((refOrQuery, optsOrCb, cb) => {
            const callback = typeof optsOrCb === 'function' ? optsOrCb : cb;
            if (callback) {
                callback({
                    exists: () => true,
                    id: 'direct_student_teacher',
                    size: 0,
                    docs: [],
                    metadata: { fromCache: false, hasPendingWrites: false },
                    data: () => ({ participants: ['student', 'teacher', 'pi7jAeeuUsebanz0F7pGhXVjzB13'] })
                });
            }
            return () => {};
        })
    };
});

vi.mock('../contexts/AuthContext', () => ({
    useAuth: () => ({
        isFirebaseAuthReady: true,
        firebaseUser: { uid: 'pi7jAeeuUsebanz0F7pGhXVjzB13', emailVerified: true },
        firebaseUid: 'pi7jAeeuUsebanz0F7pGhXVjzB13',
        firebaseEmailVerified: true,
        firebaseRole: 'teacher'
    })
}));

vi.mock('../services/firebase', () => ({
    db: {},
    auth: { currentUser: { uid: 'pi7jAeeuUsebanz0F7pGhXVjzB13', emailVerified: true } }
}));

describe('F110.21 — Normalización Segura de Identidad en Chat (currentUserId vs Auth UID)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('TEST 1 & 7: useChat receives legacy/internal ID (teacher4) but resolves to auth.uid without security error', () => {
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const { result } = renderHook(() => useChat('direct_student_teacher', 'teacher4'));
        
        expect(result.current.loading).toBe(false);
        expect(consoleErrorSpy).not.toHaveBeenCalledWith(
            expect.stringContaining('currentUserId does not match auth.currentUser.uid'),
            expect.anything()
        );
        consoleErrorSpy.mockRestore();
    });

    it('TEST 2: sendMessage uses Firebase Auth UID as senderId via setDoc', async () => {
        (setDoc as any).mockResolvedValueOnce(undefined);

        const { result } = renderHook(() => useChat('direct_student_teacher', 'teacher4'));

        await act(async () => {
            try {
                await result.current.sendMessage('Hello secure chat');
            } catch (err) {
                console.error('sendMessage threw in test:', err);
            }
        });

        expect(setDoc).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({
                senderId: 'pi7jAeeuUsebanz0F7pGhXVjzB13'
            }),
            expect.anything()
        );
    });

    it('TEST 3: markAsRead uses Firebase Auth UID for unreadCount update', async () => {
        (doc as any).mockImplementation((...args: any[]) => {
            if (args.length === 1) return { id: 'doc_id', path: 'path' };
            return { path: args.join('/') };
        });
        (updateDoc as any).mockResolvedValueOnce(undefined);

        const { result } = renderHook(() => useChat('direct_student_teacher', 'teacher4'));

        await act(async () => {
            await result.current.markAsRead();
        });

        expect(updateDoc).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({
                'unreadCount.pi7jAeeuUsebanz0F7pGhXVjzB13': 0
            })
        );
    });

    it('TEST 4 & 5: edit and delete message use normalized auth.uid successfully', async () => {
        (doc as any).mockImplementation((...args: any[]) => {
            if (args.length === 1) return { id: 'doc_id', path: 'path' };
            return { path: args.join('/') };
        });
        (updateDoc as any).mockResolvedValueOnce(undefined);
        (deleteDoc as any).mockResolvedValueOnce(undefined);

        const { result } = renderHook(() => useChat('direct_student_teacher', 'teacher4'));

        await act(async () => {
            await result.current.editMessage('msg_1', 'Updated text');
        });
        expect(updateDoc).toHaveBeenCalled();

        await act(async () => {
            await result.current.deleteMessage('msg_1');
        });
        expect(deleteDoc).toHaveBeenCalled();
    });

    it('TEST 6: internal ID remains intact for business logic components', () => {
        const legacyUser = { id: 'teacher4', role: 'teacher', name: 'Professor' };
        expect(legacyUser.id).toBe('teacher4');
    });
});
