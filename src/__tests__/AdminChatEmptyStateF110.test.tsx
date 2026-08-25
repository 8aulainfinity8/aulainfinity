import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { Spinner } from '../components/ui/Spinner';
import { ChatBubbleLeftRightIcon } from '../components/icons';

// Simple unit simulation of the Messages Panel render branch as specified in F110.4.4
interface MessagesPanelProps {
    isChatLoading: boolean;
    activeMessages: Array<{ id: string; text: string; senderId: string; timestamp?: any }>;
}

const MessagesPanel: React.FC<MessagesPanelProps> = ({ isChatLoading, activeMessages }) => {
    return (
        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4 min-h-0">
            {activeMessages && activeMessages.length > 0 ? (
                <div data-testid="messages-list">
                    {activeMessages.map(msg => (
                        <div key={msg.id} data-testid={`message-${msg.id}`} className="p-3 bg-white rounded-lg shadow-sm">
                            <p>{msg.text}</p>
                        </div>
                    ))}
                </div>
            ) : isChatLoading ? (
                <div data-testid="chat-loading-spinner" className="flex flex-col items-center justify-center h-full text-slate-400 p-8 text-center">
                    <Spinner className="w-6 h-6 mb-2 text-indigo-500 animate-spin" />
                    <p className="text-xs text-slate-500 font-medium">Sincronizando conversación...</p>
                </div>
            ) : (
                <div className="flex flex-col items-center justify-center h-full text-slate-400 dark:text-slate-500 p-8 text-center" data-testid="chat-empty-state">
                    <div className="w-12 h-12 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/80 shadow-sm flex items-center justify-center text-slate-400 mb-3">
                        <ChatBubbleLeftRightIcon className="w-6 h-6" />
                    </div>
                    <p className="font-semibold text-slate-700 dark:text-slate-300 text-sm md:text-base">
                        No hay mensajes todavía en esta conversación
                    </p>
                    <p className="text-xs md:text-sm text-slate-500 dark:text-slate-400 mt-1">
                        Envía un mensaje abajo para iniciar la tutoría.
                    </p>
                </div>
            )}
        </div>
    );
};

describe('F110.4.4 — AdminChatPage Empty State Verification', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('Caso 1 — Chat cargando: isChatLoading=true muestra el Spinner y no muestra empty state ni mensajes', () => {
        render(<MessagesPanel isChatLoading={true} activeMessages={[]} />);
        
        expect(screen.getByTestId('chat-loading-spinner')).toBeInTheDocument();
        expect(screen.queryByTestId('chat-empty-state')).not.toBeInTheDocument();
        expect(screen.queryByTestId('messages-list')).not.toBeInTheDocument();
    });

    it('Caso 2 — Chat vacío: isChatLoading=false y activeMessages=[] muestra el empty state y oculta el Spinner', () => {
        render(<MessagesPanel isChatLoading={false} activeMessages={[]} />);
        
        expect(screen.queryByTestId('chat-loading-spinner')).not.toBeInTheDocument();
        expect(screen.getByTestId('chat-empty-state')).toBeInTheDocument();
        expect(screen.getByText('No hay mensajes todavía en esta conversación')).toBeInTheDocument();
        expect(screen.getByText('Envía un mensaje abajo para iniciar la tutoría.')).toBeInTheDocument();
    });

    it('Caso 3 — Chat con mensajes: isChatLoading=false y activeMessages=[msg] muestra mensajes y oculta empty state', () => {
        const messages = [{ id: 'm1', text: 'Hola, tengo una duda con la lección 2', senderId: 'student_1' }];
        render(<MessagesPanel isChatLoading={false} activeMessages={messages} />);
        
        expect(screen.queryByTestId('chat-loading-spinner')).not.toBeInTheDocument();
        expect(screen.queryByTestId('chat-empty-state')).not.toBeInTheDocument();
        expect(screen.getByTestId('messages-list')).toBeInTheDocument();
        expect(screen.getByText('Hola, tengo una duda con la lección 2')).toBeInTheDocument();
    });

    it('Caso 4 — Cambio de chat: transicionar de chat vacío a chat con mensajes actualiza el panel correctamente', () => {
        const { rerender } = render(<MessagesPanel isChatLoading={false} activeMessages={[]} />);
        expect(screen.getByTestId('chat-empty-state')).toBeInTheDocument();

        // Cambia a chat B con mensajes
        const messagesB = [{ id: 'm2', text: 'Mensaje en chat B', senderId: 'student_2' }];
        rerender(<MessagesPanel isChatLoading={false} activeMessages={messagesB} />);

        expect(screen.queryByTestId('chat-empty-state')).not.toBeInTheDocument();
        expect(screen.getByText('Mensaje en chat B')).toBeInTheDocument();
    });

    it('Caso 5 — Chat vacío después de snapshot inicial con count=0: loading pasa a false y muestra empty state', () => {
        const { rerender } = render(<MessagesPanel isChatLoading={true} activeMessages={[]} />);
        expect(screen.getByTestId('chat-loading-spinner')).toBeInTheDocument();

        // Snapshot inicial recibido con 0 docs
        rerender(<MessagesPanel isChatLoading={false} activeMessages={[]} />);
        expect(screen.queryByTestId('chat-loading-spinner')).not.toBeInTheDocument();
        expect(screen.getByTestId('chat-empty-state')).toBeInTheDocument();
    });

    it('Caso 6 — Regresión: enviar el primer mensaje elimina el empty state y muestra el nuevo mensaje en vivo', () => {
        const { rerender } = render(<MessagesPanel isChatLoading={false} activeMessages={[]} />);
        expect(screen.getByTestId('chat-empty-state')).toBeInTheDocument();

        // Se envía el primer mensaje
        const firstMessage = [{ id: 'm_new', text: '¡Bienvenido a la tutoría!', senderId: 'teacher_1' }];
        rerender(<MessagesPanel isChatLoading={false} activeMessages={firstMessage} />);

        expect(screen.queryByTestId('chat-empty-state')).not.toBeInTheDocument();
        expect(screen.getByText('¡Bienvenido a la tutoría!')).toBeInTheDocument();
    });

    it('Caso 7 — F110.15: Mensajes existentes o locales se muestran inmediatamente incluso si isChatLoading=true', () => {
        const messages = [{ id: 'm_local', text: 'Mensaje existente local', senderId: 'student_1' }];
        render(<MessagesPanel isChatLoading={true} activeMessages={messages} />);

        expect(screen.queryByTestId('chat-loading-spinner')).not.toBeInTheDocument();
        expect(screen.getByTestId('messages-list')).toBeInTheDocument();
        expect(screen.getByText('Mensaje existente local')).toBeInTheDocument();
    });
});
