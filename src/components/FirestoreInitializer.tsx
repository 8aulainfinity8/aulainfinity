import { useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { initFirestoreSync } from '../services/firestoreSync';

export const FirestoreInitializer = () => {
    const { isFirebaseAuthReady, firebaseUser } = useAuth();

    useEffect(() => {
        if (isFirebaseAuthReady) {
            console.log('[FirestoreInitializer] Auth Ready, initializing sync.');
            initFirestoreSync();
        }
    }, [isFirebaseAuthReady, firebaseUser]);

    return null;
};
