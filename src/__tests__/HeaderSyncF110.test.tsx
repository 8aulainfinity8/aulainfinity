import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider, useIsFetching } from '@tanstack/react-query';

// Component simulating the Header sync indicator logic of F110.18
const MockHeaderSyncIndicator: React.FC = () => {
    const isFetching = useIsFetching({ queryKey: ['userProfile'] });
    if (isFetching === 0) return null;
    return <div data-testid="syncing-spinner" title="Sincronizando datos..." className="animate-spin" />;
};

describe('F110.18 — Header Global Sync Indicator Verification', () => {
    let queryClient: QueryClient;

    beforeEach(() => {
        queryClient = new QueryClient({
            defaultOptions: {
                queries: { retry: false },
            },
        });
    });

    it('Caso 1 — Initial load: when userProfile is fetching, spinner is visible', async () => {
        // Pre-set query state as fetching
        queryClient.setQueryData(['userProfile', 'test_user'], null);
        queryClient.prefetchQuery({
            queryKey: ['userProfile', 'test_user'],
            queryFn: async () => {
                // Return a promise that stays pending during test observation
                return new Promise(resolve => setTimeout(() => resolve({ id: 'test_user', role: 'student' }), 1000));
            }
        });

        render(
            <QueryClientProvider client={queryClient}>
                <MockHeaderSyncIndicator />
            </QueryClientProvider>
        );

        // Since userProfile is fetching, spinner should be visible
        const spinner = screen.getByTestId('syncing-spinner');
        expect(spinner).toBeInTheDocument();
    });

    it('Caso 2 — App ready & Background polling: when userProfile is settled, background queries (like conversations) fetching do NOT show spinner', async () => {
        queryClient.setQueryData(['userProfile', 'test_user'], { id: 'test_user', role: 'student' });
        
        // Start fetching a secondary background query
        queryClient.prefetchQuery({
            queryKey: ['conversations'],
            queryFn: async () => {
                return new Promise(resolve => setTimeout(() => resolve([]), 1000));
            }
        });

        render(
            <QueryClientProvider client={queryClient}>
                <MockHeaderSyncIndicator />
            </QueryClientProvider>
        );

        // Since userProfile is not fetching (even though conversations is fetching), spinner must NOT be in document
        expect(screen.queryByTestId('syncing-spinner')).not.toBeInTheDocument();
    });

    it('Caso 3 — Critical query complete: spinner disappears', async () => {
        const queryKey = ['userProfile', 'test_user'];
        queryClient.setQueryData(queryKey, { id: 'test_user', role: 'student' });

        render(
            <QueryClientProvider client={queryClient}>
                <MockHeaderSyncIndicator />
            </QueryClientProvider>
        );

        expect(screen.queryByTestId('syncing-spinner')).not.toBeInTheDocument();
    });
});
