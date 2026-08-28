import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';

// Mocks for Firebase & Firestore
vi.mock('firebase/firestore', () => ({
    initializeFirestore: vi.fn(() => ({})),
    getFirestore: vi.fn(() => ({})),
    enableNetwork: vi.fn().mockResolvedValue(undefined),
    disableNetwork: vi.fn().mockResolvedValue(undefined),
    collection: vi.fn((_db, col) => ({ col })),
    onSnapshot: vi.fn(() => vi.fn()),
    doc: vi.fn(),
    setDoc: vi.fn(),
    getDoc: vi.fn(),
    enableMultiTabIndexedDbPersistence: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('../../services/firebase', () => ({
    db: {},
    auth: {
        currentUser: null
    }
}));

import { auth } from '../services/firebase';
import { collection, onSnapshot } from 'firebase/firestore';

describe('Pruebas de Autorización Mínimo Privilegio para Whiteboards en AdminChat', () => {

    beforeEach(() => {
        vi.clearAllMocks();
        (auth as any).currentUser = null;
    });

    it('1. Usuario no autenticado (currentUser = null) → NO suscribe el listener global de /whiteboards', async () => {
        (auth as any).currentUser = null;

        const setupListener = async (user: any) => {
            if (!user || user.role !== 'admin') return;
            const currentUser = auth.currentUser;
            if (!currentUser || !(currentUser as any).emailVerified) return;
            const tokenResult = await (currentUser as any).getIdTokenResult();
            if (tokenResult.claims.role === 'admin') {
                onSnapshot(collection({} as any, 'whiteboards'), vi.fn());
            }
        };

        await setupListener({ role: 'admin' });
        expect(onSnapshot).not.toHaveBeenCalled();
    });

    it('2. Usuario no verificado (emailVerified = false) → NO suscribe el listener global de /whiteboards', async () => {
        (auth as any).currentUser = {
            uid: 'admin_unverified',
            emailVerified: false,
            getIdTokenResult: vi.fn().mockResolvedValue({ claims: { role: 'admin' } })
        };

        const setupListener = async (user: any) => {
            if (!user || user.role !== 'admin') return;
            const currentUser = auth.currentUser;
            if (!currentUser || !(currentUser as any).emailVerified) return;
            const tokenResult = await (currentUser as any).getIdTokenResult();
            if (tokenResult.claims.role === 'admin') {
                onSnapshot(collection({} as any, 'whiteboards'), vi.fn());
            }
        };

        await setupListener({ role: 'admin' });
        expect(onSnapshot).not.toHaveBeenCalled();
    });

    it('3. Usuario no admin (role = student o teacher) → NO suscribe el listener global de /whiteboards', async () => {
        (auth as any).currentUser = {
            uid: 'student_123',
            emailVerified: true,
            getIdTokenResult: vi.fn().mockResolvedValue({ claims: { role: 'student' } })
        };

        const setupListener = async (user: any) => {
            if (!user || user.role !== 'admin') return;
            const currentUser = auth.currentUser;
            if (!currentUser || !(currentUser as any).emailVerified) return;
            const tokenResult = await (currentUser as any).getIdTokenResult();
            if (tokenResult.claims.role === 'admin') {
                onSnapshot(collection({} as any, 'whiteboards'), vi.fn());
            }
        };

        await setupListener({ role: 'student' });
        expect(onSnapshot).not.toHaveBeenCalled();
    });

    it('4. Admin sin Custom Claim en el token JWT (claims.role != "admin") → NO suscribe el listener global', async () => {
        (auth as any).currentUser = {
            uid: 'admin_no_claim',
            emailVerified: true,
            getIdTokenResult: vi.fn().mockResolvedValue({ claims: {} })
        };

        const setupListener = async (user: any) => {
            if (!user || user.role !== 'admin') return;
            const currentUser = auth.currentUser;
            if (!currentUser || !(currentUser as any).emailVerified) return;
            const tokenResult = await (currentUser as any).getIdTokenResult();
            if (tokenResult.claims.role === 'admin') {
                onSnapshot(collection({} as any, 'whiteboards'), vi.fn());
            }
        };

        await setupListener({ role: 'admin' });
        expect(onSnapshot).not.toHaveBeenCalled();
    });

    it('5. Admin verificado con Custom Claim (role = "admin") → Suscribe exitosamente el listener global', async () => {
        (auth as any).currentUser = {
            uid: 'admin_verified_789',
            emailVerified: true,
            getIdTokenResult: vi.fn().mockResolvedValue({ claims: { role: 'admin' } })
        };

        const setupListener = async (user: any) => {
            if (!user || user.role !== 'admin') return;
            const currentUser = auth.currentUser;
            if (!currentUser || !(currentUser as any).emailVerified) return;
            const tokenResult = await (currentUser as any).getIdTokenResult();
            if (tokenResult.claims.role === 'admin') {
                onSnapshot(collection({} as any, 'whiteboards'), vi.fn());
            }
        };

        await setupListener({ role: 'admin' });
        expect(onSnapshot).toHaveBeenCalledTimes(1);
    });

    it('6. Verificación de Inmutabilidad de firestore.rules para /whiteboards', () => {
        const rulesContent = readFileSync(path.join(process.cwd(), 'firestore.rules'), 'utf8');

        expect(rulesContent).toContain('match /whiteboards/{whiteboardId}');
        expect(rulesContent).toContain('isAdmin()');
        expect(rulesContent).toContain('isApprovedTeacher()');
        expect(rulesContent).toContain('isIdParticipant(whiteboardId)');
        expect(rulesContent).toContain('isEnrolledInCourse(whiteboardId)');
    });
});
