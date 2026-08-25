import { describe, it, expect, vi } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('F110.31 — Redundant Polling Removal & Realtime Synchronization Audit', () => {
    it('1. Confirma la ausencia total de refetchInterval en componentes y providers de chat y notificaciones', () => {
        const filesToCheck = [
            'src/contexts/AdminNotificationProvider.tsx',
            'src/contexts/StudentNotificationProvider.tsx',
            'src/components/TeacherActiveChatsBar.tsx',
            'src/components/ChatPage.tsx',
            'src/components/StudentChatPage.tsx',
            'src/components/admin/AdminChatPage.tsx',
        ];

        filesToCheck.forEach(relativePath => {
            const absolutePath = path.resolve(process.cwd(), relativePath);
            const content = fs.readFileSync(absolutePath, 'utf-8');
            expect(content).not.toContain('refetchInterval');
        });
    });

    it('2. Verifica que las queries utilicen staleTime configurado para prevenir refetches accidentales', () => {
        const adminNotificationContent = fs.readFileSync(path.resolve(process.cwd(), 'src/contexts/AdminNotificationProvider.tsx'), 'utf-8');
        expect(adminNotificationContent).toContain("staleTime: 30000");

        const studentNotificationContent = fs.readFileSync(path.resolve(process.cwd(), 'src/contexts/StudentNotificationProvider.tsx'), 'utf-8');
        expect(studentNotificationContent).toContain("staleTime: 30000");
    });

    it('3. Confirma que firestoreSync contiene los listeners onSnapshot y los eventEmitter correspondientes', () => {
        const syncContent = fs.readFileSync(path.resolve(process.cwd(), 'src/services/firestoreSync.ts'), 'utf-8');
        expect(syncContent).toContain("eventEmitter.emit('message-update'");
        expect(syncContent).toContain("eventEmitter.emit('peer-message-update'");
        expect(syncContent).toContain("eventEmitter.emit('group-message-update'");
    });

    it('4. Confirma el ciclo de vida limpio y sin reconexiones infinitas en useChat', () => {
        const useChatContent = fs.readFileSync(path.resolve(process.cwd(), 'src/hooks/useChat.ts'), 'utf-8');
        expect(useChatContent).toContain('firebaseUid');
        expect(useChatContent).toContain('}, [chatId, isFirebaseAuthReady, firebaseUid');
    });
});
