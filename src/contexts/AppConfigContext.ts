

import React, { createContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { AppConfig } from '../types';
import * as api from '../services/api';
import { eventEmitter } from '../services/eventService';

interface AppConfigContextType {
  appConfig: AppConfig | null;
  updateConfig: (newConfig: AppConfig) => void;
}

export const AppConfigContext = createContext<AppConfigContextType>({
  appConfig: null,
  updateConfig: () => {},
});

// FIX: Added AppConfigProvider to fetch and manage app configuration.
export const AppConfigProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [appConfig, setAppConfig] = useState<AppConfig | null>(null);
    const queryClient = useQueryClient();

    useEffect(() => {
        api.fetchAppConfig().then(config => {
            setAppConfig({ ...config });
            queryClient.setQueryData(['appConfig'], { ...config });
        }).catch(error => {
            console.error("Failed to fetch app config:", error);
        });

        const handleConfigUpdate = (updatedConfig: AppConfig) => {
            const copy = { ...updatedConfig };
            setAppConfig(copy);
            queryClient.setQueryData(['appConfig'], copy);
        };

        eventEmitter.on('app-config-updated', handleConfigUpdate);
        return () => {
            eventEmitter.off('app-config-updated', handleConfigUpdate);
        };
    }, [queryClient]);

    const updateConfig = useCallback((newConfig: AppConfig) => {
        setThemeConfig(newConfig);
    }, []);

    const setThemeConfig = (newConfig: AppConfig) => {
        setAppConfig(newConfig);
        queryClient.setQueryData(['appConfig'], newConfig);
    };
    
    const value = React.useMemo(() => ({ appConfig, updateConfig }), [appConfig, updateConfig]);

    // FIX: Replaced JSX with React.createElement to resolve parsing errors in .ts file.
    return React.createElement(AppConfigContext.Provider, { value: value }, children);
};