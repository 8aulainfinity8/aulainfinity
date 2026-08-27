
import React, { createContext, useState, useCallback, ReactNode, useEffect, useContext } from 'react';
import type { AnyUser } from '../types';
import { useQuery } from '@tanstack/react-query';
import { eventEmitter } from '../services/eventService';
import { getUserProfile, initializeAndSyncUserDataInFirestore } from '../services/userService';
import { resetFirestoreSync } from '../services/firestoreSync';
import { auth } from '../services/firebase';
import { onAuthStateChanged, onIdTokenChanged, type User as FirebaseUser } from 'firebase/auth';

// Custom hook to manage a state synchronized with localStorage and across tabs
export function useLocalStorageSync<T>(key: string, initialValue: T | null) {
    const [state, setState] = useState<T | null>(() => {
        if (typeof window === 'undefined') return initialValue;
        try {
            const item = window.localStorage.getItem(key);
            return item ? JSON.parse(item) : initialValue;
        } catch (error) {
            console.error(`Error reading localStorage key "${key}":`, error);
            try {
                window.localStorage.removeItem(key);
            } catch {}
            return initialValue;
        }
    });

    // Update state when localStorage changes in another tab
    useEffect(() => {
        const handleStorageChange = (event: StorageEvent) => {
            if (event.key === key) {
                try {
                    const newValue = event.newValue ? JSON.parse(event.newValue) : null;
                    setState(newValue);
                } catch (error) {
                    console.error(`Error parsing localStorage sync for key "${key}":`, error);
                }
            }
        };

        window.addEventListener('storage', handleStorageChange);
        return () => {
            window.removeEventListener('storage', handleStorageChange);
        };
    }, [key]);

    const setValue = useCallback((value: T | null | ((val: T | null) => T | null)) => {
        try {
            setState((prevState) => {
                const valueToStore = value instanceof Function ? value(prevState) : value;
                if (valueToStore === null) {
                    window.localStorage.removeItem(key);
                } else {
                    window.localStorage.setItem(key, JSON.stringify(valueToStore));
                }
                return valueToStore;
            });
        } catch (error) {
            console.error(`Error setting localStorage key "${key}":`, error);
        }
    }, [key]);

    return [state, setValue] as const;
}

export interface AuthContextType {
  user: AnyUser | null;
  profile: any | null;
  loading: boolean;
  isFirebaseAuthReady: boolean;
  firebaseUser: FirebaseUser | null;
  firebaseUid: string | null;
  firebaseEmailVerified: boolean;
  firebaseRole: 'student' | 'teacher' | 'admin' | null;
  isFirebaseAdmin: boolean;
  firebaseAuthLoading: boolean;
  login: (user: AnyUser) => void;
  logout: () => void;
  updateUser: (user: AnyUser) => void;
}

export const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  loading: true,
  isFirebaseAuthReady: false,
  firebaseUser: null,
  firebaseUid: null,
  firebaseEmailVerified: false,
  firebaseRole: null,
  isFirebaseAdmin: false,
  firebaseAuthLoading: true,
  login: () => {},
  logout: () => {},
  updateUser: () => {},
});

import { getF11045Meta } from '../utils/f11045';

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const instanceIdRef = React.useRef(Math.random().toString(36).substring(2, 9));
    const instanceId = instanceIdRef.current;

    useEffect(() => {
        console.log(`[AUTH DEBUG] AuthProvider MOUNT instanceId: ${instanceId}`);
        console.log(`[F110.45] AUTH_PROVIDER_MOUNT | ${getF11045Meta(instanceId)}`);
        return () => {
            console.log(`[AUTH DEBUG] AuthProvider UNMOUNT instanceId: ${instanceId}`);
            console.log(`[F110.45] AUTH_PROVIDER_UNMOUNT | ${getF11045Meta(instanceId)}`);
        };
    }, [instanceId]);

    const [user, setUser] = useLocalStorageSync<AnyUser>('mockUser', null);
    const [loading] = useState(false);

    // Estados explícitos de Firebase Auth
    const [isFirebaseAuthReady, setIsFirebaseAuthReady] = useState(false);
    const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
    const [firebaseUid, setFirebaseUid] = useState<string | null>(null);
    const [firebaseEmailVerified, setFirebaseEmailVerified] = useState(false);
    const [firebaseRole, setFirebaseRole] = useState<'student' | 'teacher' | 'admin' | null>(null);
    const [firebaseAuthLoading, setFirebaseAuthLoading] = useState(true);

    const isFirebaseAdmin = Boolean(firebaseRole === 'admin');

    const { data: profile } = useQuery({
        queryKey: ['userProfile', user?.id],
        queryFn: () => getUserProfile(user!.id),
        enabled: !!user && !!user.id && !!auth.currentUser,
        staleTime: 1000 * 60 * 5
    });

    useEffect(() => {
        if (user && auth && auth.currentUser) {
            if (auth.currentUser.email?.toLowerCase() === user.email?.toLowerCase()) {
                auth.currentUser.reload().then(() => {
                    if (auth.currentUser && !auth.currentUser.emailVerified) {
                        console.warn("⚠️ Acceso bloqueado en sesión: El correo del usuario no ha sido verificado.");
                        if (auth) auth.signOut().catch(() => {});
                        setUser(null);
                    }
                }).catch(() => {});
            }
        }
    }, [user, setUser]);

    // Sincronizar claims y estado de autenticación real de Firebase Auth con token refresh controlado
    useEffect(() => {
        if (!auth) {
            setIsFirebaseAuthReady(true);
            setFirebaseAuthLoading(false);
            return;
        }

        let currentSyncId = 0;
        let initialAuthChecked = false;
        const lastProcessedTokenRef = { current: null as string | null };

        const syncFirebaseUser = async (fbUser: FirebaseUser | null, forceRefresh: boolean = false) => {
            const syncId = ++currentSyncId;

            if (fbUser) {
                try {
                    // Forzar renovación únicamente en la carga inicial / cambio de usuario, nunca en onIdTokenChanged continuo
                    const tokenResult = await fbUser.getIdTokenResult(forceRefresh);
                    
                    // Si hubo un sync más reciente iniciado mientras esperábamos el token, descartar este resultado
                    if (syncId !== currentSyncId) {
                        return;
                    }

                    const rawRole = tokenResult.claims.role as string | undefined;
                    const rawIsAdmin = Boolean(tokenResult.claims.isAdmin);
                    const customRole = rawRole || (rawIsAdmin ? 'admin' : undefined);
                    const parsedRole = (customRole === 'admin' || customRole === 'teacher' || customRole === 'student') ? customRole : null;
                    const isVerified = Boolean(fbUser.emailVerified);

                    const tokenFingerprint = `${fbUser.uid}:${tokenResult.issuedAtTime}:${tokenResult.expirationTime}:${parsedRole}`;
                    if (lastProcessedTokenRef.current === tokenFingerprint) {
                        if (syncId === currentSyncId) {
                            setIsFirebaseAuthReady(true);
                            setFirebaseAuthLoading(false);
                        }
                        return;
                    }
                    lastProcessedTokenRef.current = tokenFingerprint;

                    setFirebaseUser(fbUser);
                    setFirebaseUid(fbUser.uid);
                    setFirebaseEmailVerified(isVerified);
                    setFirebaseRole(parsedRole);

                    setUser((prevUser) => {
                        if (!prevUser) return prevUser;
                        if (parsedRole && prevUser.role !== parsedRole) {
                            return { ...prevUser, role: parsedRole as any, firebaseUid: fbUser.uid };
                        }
                        return { ...prevUser, firebaseUid: fbUser.uid };
                    });

                    console.log(
                        `[FirebaseAuth] Token refreshed\n` +
                        `UID: ${fbUser.uid}\n` +
                        `emailVerified: ${isVerified}\n` +
                        `role: ${parsedRole || 'none'}\n` +
                        `isAdmin: ${Boolean(rawIsAdmin || parsedRole === 'admin')}\n` +
                        `tokenIssuedAtTime: ${tokenResult.issuedAtTime}\n` +
                        `tokenExpirationTime: ${tokenResult.expirationTime}`
                    );
                    console.log(`[FirebaseAuth] READY | UID: ${fbUser.uid} | emailVerified: ${isVerified} | role: ${parsedRole || 'none'}`);
                } catch (e) {
                    if (syncId !== currentSyncId) return;
                    console.warn('[AuthContext] Error sincronizando token claims:', e);
                }
            } else {
                if (syncId !== currentSyncId) return;
                lastProcessedTokenRef.current = null;
                setFirebaseUser(null);
                setFirebaseUid(null);
                setFirebaseEmailVerified(false);
                setFirebaseRole(null);
                console.log('[FirebaseAuth] READY | No active Firebase user (Firestore protected = BLOQUEADO)');
            }

            if (syncId === currentSyncId) {
                console.log(`[F110.30] [AUTH_READY] | timestamp: ${performance.now()} | instanceId: ${instanceId}`);
                console.log(`[F110.30] [APP_READY_AFTER_AUTH] | timestamp: ${performance.now()} | instanceId: ${instanceId}`);
                setIsFirebaseAuthReady(true);
                setFirebaseAuthLoading(false);
            }
        };

        console.log(`[AUTH DEBUG] onAuthStateChanged SUBSCRIBE instanceId: ${instanceId}`);
        console.log(`[AUTH DEBUG] onIdTokenChanged SUBSCRIBE instanceId: ${instanceId}`);

        const unsubscribeAuth = onAuthStateChanged(auth, (fbUser) => {
            if (typeof window !== 'undefined') {
                (window as any).__FIREBASE_AUTH_UID__ = fbUser?.uid || 'none';
            }
            console.log(`[F110.45] AUTH_STATE_CHANGE | ${getF11045Meta(instanceId, fbUser?.uid)} | hasUser: ${!!fbUser}`);
            const shouldForce = !initialAuthChecked;
            initialAuthChecked = true;
            syncFirebaseUser(fbUser, shouldForce);
        });

        const unsubscribeToken = onIdTokenChanged(auth, (fbUser) => {
            if (typeof window !== 'undefined') {
                (window as any).__FIREBASE_AUTH_UID__ = fbUser?.uid || 'none';
            }
            console.log(`[F110.45] ID_TOKEN_CHANGE | ${getF11045Meta(instanceId, fbUser?.uid)} | hasUser: ${!!fbUser}`);
            // onIdTokenChanged se ejecuta ante cualquier actualización de token.
            // Se debe pasar forceRefresh=false para evitar un ciclo infinito de refresh y quota-exceeded.
            syncFirebaseUser(fbUser, false);
        });

        return () => {
            console.log(`[AUTH DEBUG] onAuthStateChanged UNSUBSCRIBE instanceId: ${instanceId}`);
            console.log(`[AUTH DEBUG] onIdTokenChanged UNSUBSCRIBE instanceId: ${instanceId}`);
            unsubscribeAuth();
            unsubscribeToken();
        };
    }, [setUser]);

    useEffect(() => {
        const handleUserUpdate = (updatedUser?: AnyUser) => {
            if (!updatedUser || typeof updatedUser !== 'object' || !('id' in updatedUser)) return;
            setUser(prevUser => {
                if (prevUser && prevUser.id === updatedUser.id) {
                    return { ...prevUser, ...updatedUser };
                }
                return prevUser;
            });
        };
        
        eventEmitter.on('user-update', handleUserUpdate);
        return () => {
            eventEmitter.off('user-update', handleUserUpdate);
        };
    }, [setUser]);

    const login = useCallback((userData: AnyUser) => {
        const firebaseUser = auth.currentUser;
        const uid = firebaseUser?.uid;

        if (auth && firebaseUser) {
            if (firebaseUser.email?.toLowerCase() === userData.email?.toLowerCase()) {
                if (!firebaseUser.emailVerified) {
                    console.warn("⚠️ Intento de login bloqueado: El usuario no ha verificado su correo electrónico.");
                    throw new Error("⚠️ Tu correo electrónico aún no ha sido verificado. Por favor, revisa tu bandeja de entrada o carpeta de spam y haz clic en el enlace de confirmación antes de iniciar sesión.");
                }
            }
        }

        // Normalize identity: prioritize Firebase Auth UID over Mock/Domain ID
        const normalizedUser = {
            ...userData,
            id: uid || userData.id,
            uid: uid || userData.id,
            firebaseUid: uid || userData.firebaseUid || userData.id
        };

        setUser(normalizedUser);
        
        if (uid) {
            initializeAndSyncUserDataInFirestore(normalizedUser, normalizedUser.role as any, uid).catch(err => {
                console.warn('Sync user data non-critical failure:', err);
            });
        }
    }, [setUser]);

    const logout = useCallback(() => {
        if (auth) {
            auth.signOut().catch(() => {});
        }
        resetFirestoreSync();
        eventEmitter.emit('user-logout');
        setUser(null);
    }, [setUser]);

    const updateUser = useCallback((updatedUserData?: AnyUser) => {
        if (!updatedUserData || typeof updatedUserData !== 'object' || !('id' in updatedUserData)) return;
        setUser(prevUser => {
            if (prevUser && prevUser.id === updatedUserData.id) {
                return { ...prevUser, ...updatedUserData };
            }
            return prevUser;
        });
    }, [setUser]);

    const value = { 
        user, 
        profile, 
        loading, 
        isFirebaseAuthReady,
        firebaseUser,
        firebaseUid,
        firebaseEmailVerified,
        firebaseRole,
        isFirebaseAdmin,
        firebaseAuthLoading,
        login, 
        logout, 
        updateUser 
    };

    return React.createElement(AuthContext.Provider, { value: value }, children);
};

// Convenient useAuth hook for general consumption
export const useAuth = () => useContext(AuthContext);

