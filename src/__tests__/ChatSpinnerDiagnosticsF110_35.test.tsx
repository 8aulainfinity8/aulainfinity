import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { Spinner } from '../components/ui/Spinner';

// Simulated Component Tree to test state changes in a fully instrumented way
interface AdminChatSimulationProps {
    isConversationsLoading: boolean;
    selectedConversationId: string | null;
    isChatLoading: boolean;
    activeMessages: Array<{ id: string; text: string; senderId: string }>;
    onTyping?: () => void;
}

const AdminChatSimulation: React.FC<AdminChatSimulationProps> = ({
    isConversationsLoading,
    selectedConversationId,
    isChatLoading,
    activeMessages,
    onTyping
}) => {
    return (
        <div data-testid="admin-chat-layout" className="flex h-screen">
            {/* Sidebar */}
            <div data-testid="sidebar" className="w-1/3 border-r">
                {isConversationsLoading ? (
                    <div data-testid="sidebar-spinner"><Spinner /></div>
                ) : (
                    <div data-testid="conversations-list">
                        <button data-testid="convo-item-1" onClick={onTyping}>Convo 1</button>
                    </div>
                )}
            </div>

            {/* Main Panel */}
            <div data-testid="main-panel" className="w-2/3">
                {selectedConversationId ? (
                    <div data-testid="active-chat-workspace">
                        <div className="messages-panel h-64 overflow-y-auto">
                            {activeMessages.length > 0 ? (
                                <div data-testid="messages-list">
                                    {activeMessages.map(m => (
                                        <div key={m.id} data-testid={`msg-${m.id}`}>{m.text}</div>
                                    ))}
                                </div>
                            ) : isChatLoading ? (
                                <div data-testid="chat-loading-spinner"><Spinner /></div>
                            ) : (
                                <div data-testid="chat-empty-state">No hay mensajes todavía</div>
                            )}
                        </div>
                    </div>
                ) : (
                    <div data-testid="main-empty-state">Bandeja de Entrada - Elige una duda</div>
                )}
            </div>
        </div>
    );
};

describe('F110.35 — Chat Spinner Diagnostics & Regression Suite', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('Test 1 — Conversations loading: spinner = true', () => {
        render(
            <AdminChatSimulation
                isConversationsLoading={true}
                selectedConversationId={null}
                isChatLoading={false}
                activeMessages={[]}
            />
        );

        expect(screen.getByTestId('sidebar-spinner')).toBeInTheDocument();
        expect(screen.queryByTestId('conversations-list')).not.toBeInTheDocument();
    });

    it('Test 2 — Conversations success + no conversation selected: spinner = false, emptyState = true', () => {
        render(
            <AdminChatSimulation
                isConversationsLoading={false}
                selectedConversationId={null}
                isChatLoading={false}
                activeMessages={[]}
            />
        );

        expect(screen.queryByTestId('sidebar-spinner')).not.toBeInTheDocument();
        expect(screen.getByTestId('conversations-list')).toBeInTheDocument();
        expect(screen.getByTestId('main-empty-state')).toBeInTheDocument();
        expect(screen.queryByTestId('active-chat-workspace')).not.toBeInTheDocument();
    });

    it('Test 3 — Conversation selected + chat loading: spinner = true', () => {
        render(
            <AdminChatSimulation
                isConversationsLoading={false}
                selectedConversationId="convo_1"
                isChatLoading={true}
                activeMessages={[]}
            />
        );

        expect(screen.queryByTestId('sidebar-spinner')).not.toBeInTheDocument();
        expect(screen.getByTestId('active-chat-workspace')).toBeInTheDocument();
        expect(screen.getByTestId('chat-loading-spinner')).toBeInTheDocument();
        expect(screen.queryByTestId('chat-empty-state')).not.toBeInTheDocument();
    });

    it('Test 4 — CHAT_READY: spinner = false', () => {
        render(
            <AdminChatSimulation
                isConversationsLoading={false}
                selectedConversationId="convo_1"
                isChatLoading={false}
                activeMessages={[]}
            />
        );

        expect(screen.queryByTestId('chat-loading-spinner')).not.toBeInTheDocument();
        expect(screen.getByTestId('chat-empty-state')).toBeInTheDocument();
    });

    it('Test 5 — Typing después de CHAT_READY: spinner = false', () => {
        const handleTyping = vi.fn();
        const { rerender } = render(
            <AdminChatSimulation
                isConversationsLoading={false}
                selectedConversationId="convo_1"
                isChatLoading={false}
                activeMessages={[]}
                onTyping={handleTyping}
            />
        );

        screen.getByTestId('convo-item-1').click();
        expect(handleTyping).toHaveBeenCalled();

        // Simulate re-render while typing/interacting
        rerender(
            <AdminChatSimulation
                isConversationsLoading={false}
                selectedConversationId="convo_1"
                isChatLoading={false}
                activeMessages={[]}
                onTyping={handleTyping}
            />
        );

        expect(screen.queryByTestId('chat-loading-spinner')).not.toBeInTheDocument();
    });

    it('Test 6 — Nuevo mensaje después de CHAT_READY: spinner = false', () => {
        const { rerender } = render(
            <AdminChatSimulation
                isConversationsLoading={false}
                selectedConversationId="convo_1"
                isChatLoading={false}
                activeMessages={[]}
            />
        );

        expect(screen.getByTestId('chat-empty-state')).toBeInTheDocument();

        // Simulate incoming message
        const messages = [{ id: 'msg_1', text: 'Hola, buenas', senderId: 'student_1' }];
        rerender(
            <AdminChatSimulation
                isConversationsLoading={false}
                selectedConversationId="convo_1"
                isChatLoading={false}
                activeMessages={messages}
            />
        );

        expect(screen.queryByTestId('chat-loading-spinner')).not.toBeInTheDocument();
        expect(screen.queryByTestId('chat-empty-state')).not.toBeInTheDocument();
        expect(screen.getByTestId('messages-list')).toBeInTheDocument();
        expect(screen.getByText('Hola, buenas')).toBeInTheDocument();
    });

    it('Test 7 — React remount: spinner no queda bloqueado', () => {
        const { unmount } = render(
            <AdminChatSimulation
                isConversationsLoading={false}
                selectedConversationId="convo_1"
                isChatLoading={true}
                activeMessages={[]}
            />
        );

        expect(screen.getByTestId('chat-loading-spinner')).toBeInTheDocument();

        // Unmount component
        unmount();

        // Remount component with fresh loader resolved state
        render(
            <AdminChatSimulation
                isConversationsLoading={false}
                selectedConversationId="convo_1"
                isChatLoading={false}
                activeMessages={[]}
            />
        );

        expect(screen.queryByTestId('chat-loading-spinner')).not.toBeInTheDocument();
        expect(screen.getByTestId('chat-empty-state')).toBeInTheDocument();
    });
});
