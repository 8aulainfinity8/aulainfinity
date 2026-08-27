import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useChat } from '../hooks/useChat';
import { updateDoc, deleteDoc, doc } from 'firebase/firestore';
import * as dbMock from '../services/mockDatabase';

vi.mock('firebase/firestore', async () => {
    const actual = await vi.importActual('firebase/firestore');
    return {
        ...actual as any,
        doc: vi.fn(),
        updateDoc: vi.fn(),
        deleteDoc: vi.fn(),
        onSnapshot: vi.fn().mockReturnValue(() => {})
    };
});

vi.mock('../contexts/AuthContext', () => ({
    useAuth: () => ({ 
        currentUser: { uid: 'real_firebase_user_uid' },
        firebaseUser: { uid: 'real_firebase_user_uid' },
        firebaseRole: 'teacher',
        isFirebaseAuthReady: true
    })
}));

vi.mock('../services/firebase', () => ({
    db: {},
    auth: { currentUser: { uid: 'real_firebase_user_uid', emailVerified: true } }
}));

describe('useChat — Pruebas de Identidades Híbridas y Sincronización Local', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('Debe permitir editar un mensaje exitosamente incluso si hay un mismatch de ID para roles privilegiados', async () => {
        (doc as any).mockImplementation((db: any, col1: string, chat: string, col2: string, id: string) => ({ path: `${col1}/${chat}/${col2}/${id}` }));
        (updateDoc as any).mockResolvedValueOnce(undefined);

        // Simulamos un mismatch: resolvedUserId es 'custom_local_user_id' pero currentUser.uid es 'real_firebase_user_uid'
        const { result } = renderHook(() => useChat('chat_123', 'custom_local_user_id'));
        
        await act(async () => {
            // No debe arrojar error porque el rol es privilegiado ('teacher')
            await expect(result.current.editMessage('msg_456', 'Contenido actualizado')).resolves.not.toThrow();
        });

        expect(updateDoc).toHaveBeenCalledWith(
            expect.objectContaining({ path: 'chats/chat_123/messages/msg_456' }),
            { text: 'Contenido actualizado' }
        );
    });

    it('Debe permitir eliminar un mensaje exitosamente incluso si hay un mismatch de ID para roles privilegiados', async () => {
        (doc as any).mockImplementation((db: any, col1: string, chat: string, col2: string, id: string) => ({ path: `${col1}/${chat}/${col2}/${id}` }));
        (deleteDoc as any).mockResolvedValueOnce(undefined);

        // Simulamos un mismatch
        const { result } = renderHook(() => useChat('chat_123', 'custom_local_user_id'));
        
        await act(async () => {
            // No debe arrojar error porque el rol es privilegiado
            await expect(result.current.deleteMessage('msg_456')).resolves.not.toThrow();
        });

        expect(deleteDoc).toHaveBeenCalledWith(
            expect.objectContaining({ path: 'chats/chat_123/messages/msg_456' })
        );
    });
});
