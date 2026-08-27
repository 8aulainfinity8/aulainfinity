
import {
    StudentUser, AdminUser, TeacherUser, AnyUser, CourseLevel, Subject, Video, Comment, AppConfig,
    TopicRequest, TutoringRequest, ExamEvent, Quiz, StudentAnswer,
    NewCourseLevelData, NewSubjectData, NewVideoData,
    Conversation, DirectMessage, VideoBlock, NewVideoBlockData, NewQuizData,
    StudentPeerConversation, StudentPeerMessage, StudentFriend,
    CourseGroupConversation, CourseGroupMessage, Attachment, InfinityTransaction, AIQueryLog,
    StudentPayment, StudentExpense, TeacherPayment
} from '../types';
import * as dbMock from './mockDatabase';
import * as geminiService from './geminiService';
import { eventEmitter } from './eventService';
import { deleteVideoFileFromStorage } from "./storageService";
import { auth, db } from './firebase';
import { collection, addDoc, getDocs, getDoc, deleteDoc, query, where, serverTimestamp, setDoc, doc } from 'firebase/firestore';
import { 
    createUserWithEmailAndPassword, 
    sendEmailVerification, 
    signInWithEmailAndPassword, 
    sendPasswordResetEmail,
    GoogleAuthProvider,
    signInWithPopup
} from 'firebase/auth';
import {
    syncSendPeerMessageToFirestore,
    syncSendDirectMessageToFirestore,
    syncSendTeacherMessageToFirestore,
    syncSendCourseGroupMessageToFirestore,
    syncSubmitTutoringRequestToFirestore,
    syncDeleteTutoringRequestFromFirestore,
    syncUpdateStudentNotesToFirestore,
    syncAssignStudentTeacherInFirestore,
    syncUserToFirestore,
    syncConversationTeacherInFirestore,
    deleteUserFromFirestore,
    syncCoursesToFirestore,
    deleteCourseFromFirestore,
    deleteVideoFromFirestore,
    syncPostCommentToFirestore,
    syncUpdateCommentInFirestore,
    syncMarkCommentAsReadInFirestore,
    syncDeleteCommentFromFirestore,
    syncSubmitTopicRequestToFirestore,
    syncUpdateTopicRequestStatusInFirestore,
    syncDeleteTopicRequestFromFirestore,
    syncAddAgendaEventToFirestore,
    syncUpdateAgendaEventToFirestore,
    syncDeleteAgendaEventFromFirestore,
    syncSaveQuizToFirestore,
    syncStudentPaymentToFirestore,
    syncStudentExpenseToFirestore,
    syncTeacherPaymentToFirestore,
    syncResetFinancialDataFromFirestore,
    syncUpdateDirectMessageInFirestore,
    syncDeleteDirectMessageFromFirestore,
    syncUpdatePeerMessageInFirestore,
    syncDeletePeerMessageFromFirestore,
    syncUpdateTeacherMessageInFirestore,
    syncDeleteTeacherMessageFromFirestore,
    syncAppConfigToFirestore,
    syncAddStudentFriendToFirestore,
    syncAIQueryLogToFirestore,
    syncAddInfinityTransactionToFirestore,
    syncMarkConversationAsReadInFirestore,
    syncMarkPeerConversationAsReadInFirestore,
    syncCloseSupportConversationInFirestore,
    syncClearChatMessagesInFirestore
} from './firestoreSync';

// --- UTILITY ---
// Mock generator for chat streaming is now handled in geminiService or dbMock

// --- LATENCY & SYNC METADATA CONTROLLER ---
// Con este controlador centralizamos la simulación de red.
// Podemos desactivar las demoras de forma global para un rendimiento ultrarrápido,
// o habilitarlas si se desea probar estados de carga (skeletons, spinners, etc.).
export const API_CONFIG = {
    simulateLatency: false, // Desactivado por defecto para rendimiento instantáneo (petición de usuario) 🚀
    logDataFlow: true,      // Muestra logs claros sobre si el dato viene de Firestore o de Local Mock
};

export const apiDelay = (ms: number): Promise<void> => {
    if (!API_CONFIG.simulateLatency) return Promise.resolve();
    return new Promise(resolve => setTimeout(resolve, ms));
};

export const formatDetailsForLog = (details: any, maxChars: number = 150): string => {
    if (!details) return '';
    
    const rawStr = JSON.stringify(details);
    
    if (rawStr.length > maxChars) {
        return `${rawStr.substring(0, maxChars)}... [Truncado, longitud total: ${rawStr.length} chars]`;
    }
    
    return rawStr;
};

export const logApiFlow = (operationName: string, source: 'Firestore' | 'Local Mock' | 'Hybrid', details?: any) => {
    if (API_CONFIG.logDataFlow) {
        const detailsStr = formatDetailsForLog(details);
        console.log(
            `%c[API: ${operationName}] %cSource: ${source} %c${detailsStr}`,
            'color: #6366f1; font-weight: bold;',
            'color: #10b981; font-weight: bold;',
            'color: #6b7280;'
        );
    }
};

// --- AUTH ---
export const authenticateStudent = async (email: string, password: string): Promise<AnyUser | undefined> => {
    let firebaseAuthSuccess = false;
    let firebaseUid: string | undefined;

    if (auth) {
        try {
            const userCredential = await signInWithEmailAndPassword(auth, email, password);
            if (userCredential.user) {
                if (!userCredential.user.emailVerified) {
                    await auth.signOut().catch(() => {});
                    throw new Error("⚠️ Tu correo electrónico aún no ha sido verificado. Por favor, revisa tu bandeja de entrada o carpeta de spam y haz clic en el enlace de confirmación antes de iniciar sesión.");
                }
                firebaseAuthSuccess = true;
                firebaseUid = userCredential.user.uid;
            }
        } catch (fbError: any) {
            if (fbError.message && fbError.message.includes("aún no ha sido verificado")) {
                throw fbError;
            }
            if (!firebaseAuthSuccess && (fbError.code === 'auth/user-not-found' || fbError.code === 'auth/wrong-password' || fbError.code === 'auth/invalid-credential' || fbError.code === 'auth/invalid-email')) {
                return undefined;
            }
            if (!firebaseAuthSuccess) {
                console.warn("Firebase Auth signin note:", fbError.message);
            }
        }
    }

    let user: AnyUser | undefined;

    if (firebaseAuthSuccess) {
        user = dbMock.dbFindUserByEmail(email);
        if (!user && db && firebaseUid) {
            try {
                const [teacherDoc, userDoc] = await Promise.all([
                    getDoc(doc(db, 'teachers', firebaseUid)),
                    getDoc(doc(db, 'users', firebaseUid))
                ]);

                if (teacherDoc.exists()) {
                    const data = teacherDoc.data();
                    user = dbMock.normalizeAnyUser({ id: firebaseUid, uid: firebaseUid, role: 'teacher', ...data } as any);
                } else if (userDoc.exists()) {
                    const data = userDoc.data();
                    user = dbMock.normalizeAnyUser({ id: firebaseUid, uid: firebaseUid, ...data } as any);
                } else {
                    const teachersRef = collection(db, 'teachers');
                    const usersRef = collection(db, 'users');
                    const [teacherSnap, snap] = await Promise.all([
                        getDocs(query(teachersRef, where('email', '==', email.toLowerCase()))),
                        getDocs(query(usersRef, where('email', '==', email.toLowerCase())))
                    ]);
                    
                    if (!teacherSnap.empty) {
                        const docSnap = teacherSnap.docs[0];
                        const data = docSnap.data();
                        user = dbMock.normalizeAnyUser({ id: docSnap.id, uid: docSnap.id, role: 'teacher', ...data } as any);
                    } else if (!snap.empty) {
                        const docSnap = snap.docs[0];
                        const data = docSnap.data();
                        user = dbMock.normalizeAnyUser({ id: docSnap.id, uid: docSnap.id, ...data } as any);
                    }
                }
                if (user) {
                    if (user.role === 'teacher') {
                        if (!dbMock.teachersData.some(t => t.email.toLowerCase() === email.toLowerCase())) {
                            dbMock.teachersData.push(user as TeacherUser);
                        }
                    } else if (user.role === 'admin') {
                        if (!dbMock.adminUserData.some(a => a.email?.toLowerCase() === email.toLowerCase())) {
                            dbMock.adminUserData.push(user as AdminUser);
                        }
                    } else {
                        if (!dbMock.usersData.some(u => u.email.toLowerCase() === email.toLowerCase())) {
                            dbMock.usersData.push(user as StudentUser);
                        }
                    }
                }
            } catch (e) {
                console.warn('[Authenticate] Firestore lookup error:', e);
            }
        }

        if (user) {
            dbMock.dbUpdateUserPassword(email, password);
        } else {
            user = {
                id: firebaseUid || `user_${Date.now()}`,
                name: email.split('@')[0],
                email: email,
                role: 'student',
                enrolledCourseIds: [],
                avatar: `https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=200`,
                points: 0,
                level: 1,
                streak: 1,
                completedVideoIds: [],
                unlockedRewardIds: [],
                unlockedBadgeIds: [],
                watchedVideos: [],
                isSubscribed: true,
                registrationDate: new Date().toISOString(),
                phone: '',
                creditsBalance: 5
            } as unknown as StudentUser;
            dbMock.usersData.push(user as StudentUser);
        }
        return user;
    }

    if (!auth) {
        user = dbMock.dbAuthenticateStudent(email, password);
        return user;
    }

    return undefined;
};

export const loginWithGoogle = async (intendedRole: 'student' | 'teacher' = 'student', optionalCourseId?: string): Promise<AnyUser> => {
    if (!auth) {
        throw new Error("Firebase Auth no está inicializado.");
    }
    
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    
    let userCredential;
    try {
        userCredential = await signInWithPopup(auth, provider);
    } catch (popupErr: any) {
        if (popupErr.code === 'auth/popup-closed-by-user') {
            throw new Error("Inicio de sesión cancelado en la ventana de Google.");
        }
        if (popupErr.code === 'auth/cancelled-popup-request') {
            throw new Error("Se canceló la solicitud anterior de inicio de sesión.");
        }
        if (popupErr.code === 'auth/popup-blocked') {
            throw new Error("La ventana emergente de Google fue bloqueada por el navegador. Por favor permite ventanas emergentes para este sitio.");
        }
        if (popupErr.code === 'auth/operation-not-allowed') {
            throw new Error("⚠️ El proveedor Google Sign-In no está activado en la consola de Firebase. Actívalo en: Firebase Console > Authentication > Sign-in method > Google.");
        }
        throw new Error(popupErr.message || "Error al iniciar sesión con Google.");
    }

    const firebaseUser = userCredential.user;
    const email = (firebaseUser.email || '').toLowerCase().trim();
    const displayName = firebaseUser.displayName || email.split('@')[0] || 'Usuario';
    const photoURL = firebaseUser.photoURL || `https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=200`;
    const firebaseUid = firebaseUser.uid;
    
    if (!email) {
        throw new Error("No se pudo obtener un correo electrónico válido de la cuenta de Google.");
    }
    
    let user: AnyUser | undefined;
    
    // 1. Comprobar si el usuario ya existe en Firestore o Mock DB
    user = dbMock.dbFindUserByEmail(email);
    
    if (!user && db) {
        try {
            const [teacherDoc, userDoc] = await Promise.all([
                getDoc(doc(db, 'teachers', firebaseUid)),
                getDoc(doc(db, 'users', firebaseUid))
            ]);
            
            if (teacherDoc.exists()) {
                const data = teacherDoc.data();
                user = dbMock.normalizeAnyUser({ id: firebaseUid, uid: firebaseUid, role: 'teacher', ...data } as any);
            } else if (userDoc.exists()) {
                const data = userDoc.data();
                user = dbMock.normalizeAnyUser({ id: firebaseUid, uid: firebaseUid, ...data } as any);
            } else {
                const teachersRef = collection(db, 'teachers');
                const usersRef = collection(db, 'users');
                const [teacherSnap, snap] = await Promise.all([
                    getDocs(query(teachersRef, where('email', '==', email))),
                    getDocs(query(usersRef, where('email', '==', email)))
                ]);
                
                if (!teacherSnap.empty) {
                    const docSnap = teacherSnap.docs[0];
                    user = dbMock.normalizeAnyUser({ id: docSnap.id, uid: docSnap.id, role: 'teacher', ...docSnap.data() } as any);
                } else if (!snap.empty) {
                    const docSnap = snap.docs[0];
                    user = dbMock.normalizeAnyUser({ id: docSnap.id, uid: docSnap.id, ...docSnap.data() } as any);
                }
            }
        } catch (err) {
            console.warn('[Google Auth] Firestore lookup note:', err);
        }
    }
    
    // 3. Si ya existe, actualizamos avatar/nombre si procede
    if (user) {
        const u = user as any;
        if (photoURL && (!u.avatar || u.avatar.includes('unsplash'))) {
            u.avatar = photoURL;
        }
        if (displayName && (!u.name || u.name === email.split('@')[0])) {
            u.name = displayName;
        }
        if (user.role === 'teacher') {
            if (!dbMock.teachersData.some(t => t.email.toLowerCase() === email)) {
                dbMock.teachersData.push(user as TeacherUser);
            }
        } else {
            if (!dbMock.usersData.some(uItem => uItem.email.toLowerCase() === email)) {
                dbMock.usersData.push(user as StudentUser);
            }
        }
        return user;
    }
    
    // 4. Si es nuevo usuario, creamos su perfil
    if (intendedRole === 'teacher') {
        const newTeacher: TeacherUser = {
            id: firebaseUid,
            name: displayName,
            email: email,
            role: 'teacher',
            avatar: photoURL,
            phone: firebaseUser.phoneNumber || '',
            category: 'General',
            subjects: ['General'],
            levels: ['Bachillerato'],
            schedules: ['Lunes a Viernes (Tardes)'],
            specialty: 'Profesor',
            isSubscribed: true,
            registrationDate: new Date().toISOString()
        } as unknown as TeacherUser;
        
        dbMock.teachersData.push(newTeacher);
        await syncUserToFirestore(newTeacher, 'teacher', firebaseUid).catch(() => {});
        return newTeacher;
    } else {
        const newStudent: StudentUser = {
            id: firebaseUid,
            name: displayName,
            email: email,
            role: 'student',
            avatar: photoURL,
            enrolledCourseIds: optionalCourseId ? [optionalCourseId] : [],
            points: 10,
            level: 1,
            streak: 1,
            completedVideoIds: [],
            unlockedRewardIds: [],
            unlockedBadgeIds: [],
            watchedVideos: [],
            isSubscribed: true,
            registrationDate: new Date().toISOString(),
            phone: firebaseUser.phoneNumber || '',
            creditsBalance: 5,
            notes: ''
        } as unknown as StudentUser;
        
        dbMock.usersData.push(newStudent);
        await syncUserToFirestore(newStudent, 'student', firebaseUid).catch(() => {});
        return newStudent;
    }
};

export const registerStudent = async (data: { name: string; email: string; password?: string; enrolledCourseIds: string[]; phone: string }): Promise<StudentUser> => {
    // 1. Firebase Auth Creation / Link
    let firebaseUser: any = null;

    if (data.password && auth) {
        try {
            const userCredential = await createUserWithEmailAndPassword(auth, data.email, data.password);
            firebaseUser = userCredential.user;
        } catch (firebaseErr: any) {
            console.warn('Firebase Auth registration error:', firebaseErr.message);
            if (firebaseErr.code === 'auth/email-already-in-use') {
                try {
                    const signCred = await signInWithEmailAndPassword(auth, data.email, data.password);
                    firebaseUser = signCred.user;
                } catch (e: any) {
                    throw new Error("Este correo electrónico ya está en uso. Si ya te has registrado antes, inicia sesión.");
                }
            } else if (firebaseErr.code === 'auth/api-key-not-valid' || (firebaseErr.message && firebaseErr.message.includes('api-key-not-valid'))) {
                throw new Error("⚠️ La clave de API de Firebase aún no está aprovisionada. Acepta los términos en la ventana emergente de Firebase para completar la vinculación.");
            } else if (firebaseErr.code === 'auth/operation-not-allowed' || (firebaseErr.message && firebaseErr.message.includes('operation-not-allowed'))) {
                throw new Error("⚠️ El método de autenticación con Correo/Contraseña está desactivado en la consola de Firebase. Actívalo en: Firebase Console > Authentication > Sign-in method > Correo electrónico/Contraseña.");
            } else if (firebaseErr.code === 'auth/weak-password') {
                throw new Error("⚠️ La contraseña es demasiado débil. Usa al menos 6 caracteres.");
            } else if (firebaseErr.code === 'auth/invalid-email') {
                throw new Error("⚠️ El formato del correo electrónico no es válido.");
            } else {
                throw new Error(`⚠️ Error en autenticación de Firebase: ${firebaseErr.message}`);
            }
        }
    }

    const assignedUid = firebaseUser?.uid || `student_${Date.now()}`;
    const studentData: StudentUser = {
        id: assignedUid,
        uid: assignedUid,
        firebaseUid: assignedUid,
        name: data.name,
        email: data.email,
        password: data.password,
        role: 'student',
        watchedVideos: [],
        favoriteVideos: [],
        enrolledCourseIds: data.enrolledCourseIds || [],
        completedVideoIds: [],
        unlockedRewardIds: [],
        unlockedBadgeIds: [],
        isSubscribed: false,
        registrationDate: new Date().toISOString(),
        phone: data.phone,
        creditsBalance: 5,
    };

    // 2. Sync / Persist to Firestore while STILL authenticated (request.auth is valid)
    try {
        await syncUserToFirestore(studentData, 'student', firebaseUser?.uid);
    } catch (firestoreErr: any) {
        console.error('[RegisterStudent] Firestore write failure:', firestoreErr);
        throw new Error(`⚠️ No se pudo guardar la información del usuario en Firestore: ${firestoreErr.message || 'Permiso denegado o error de red.'}`);
    }

    // 3. Send Verification Email if applicable
    if (firebaseUser && !firebaseUser.emailVerified) {
        try {
            await sendEmailVerification(firebaseUser, { url: window.location.href });
        } catch (emailErr: any) {
            console.warn('Firebase Auth sendEmailVerification note:', emailErr.code, emailErr.message);
            try {
                await sendEmailVerification(firebaseUser);
            } catch (fallbackErr: any) {
                console.warn('Firebase Auth sendEmailVerification fallback note:', fallbackErr.code, fallbackErr.message);
                if (fallbackErr.code === 'auth/too-many-requests' || emailErr.code === 'auth/too-many-requests') {
                    throw new Error("⚠️ Firebase ha limitado temporalmente los envíos de correo por realizar demasiadas solicitudes continuas. Por favor espera 2-3 minutos.");
                }
                throw new Error(`⚠️ Firebase no pudo enviar el correo de verificación. Detalle: ${fallbackErr.message || emailErr.message}. Revisa en Firebase Console > Authentication > Settings que el dominio de la aplicación esté autorizado.`);
            }
        }
    }

    // 4. Update Mock / Local State ONLY AFTER successful Firebase operations
    let finalStudent: StudentUser;
    try {
        // Clean any stale user with the same email if exists in local memory to allow retries
        dbMock.dbPurgeUserFromMemory(data.email);
        finalStudent = dbMock.dbRegisterStudent(data);
    } catch (mockErr: any) {
        finalStudent = studentData;
    }

    // 5. Sign out ONLY AFTER all authenticated Firestore writes are fully resolved
    if (firebaseUser && auth) {
        await auth.signOut().catch(() => {});
    }

    return finalStudent;
};

export const registerTeacher = async (data: { 
    name: string; 
    email: string; 
    password?: string; 
    phone: string; 
    category: string;
    subjects?: string[];
    levels?: string[];
    schedules?: string[];
}): Promise<TeacherUser> => {
    // 1. Firebase Auth Creation / Link
    let firebaseUser: any = null;

    if (data.password && auth) {
        try {
            const userCredential = await createUserWithEmailAndPassword(auth, data.email, data.password);
            firebaseUser = userCredential.user;
        } catch (firebaseErr: any) {
            console.warn('Firebase Auth registration error:', firebaseErr.message);
            if (firebaseErr.code === 'auth/email-already-in-use') {
                try {
                    const signCred = await signInWithEmailAndPassword(auth, data.email, data.password);
                    firebaseUser = signCred.user;
                } catch (e: any) {
                    throw new Error("Este correo electrónico ya está en uso. Si ya te has registrado antes, inicia sesión.");
                }
            } else if (firebaseErr.code === 'auth/api-key-not-valid' || (firebaseErr.message && firebaseErr.message.includes('api-key-not-valid'))) {
                throw new Error("⚠️ La clave de API de Firebase aún no está aprovisionada. Acepta los términos en la ventana emergente de Firebase para completar la vinculación.");
            } else if (firebaseErr.code === 'auth/operation-not-allowed' || (firebaseErr.message && firebaseErr.message.includes('operation-not-allowed'))) {
                throw new Error("⚠️ El método de autenticación con Correo/Contraseña está desactivado en la consola de Firebase. Actívalo en: Firebase Console > Authentication > Sign-in method > Correo electrónico/Contraseña.");
            } else if (firebaseErr.code === 'auth/weak-password') {
                throw new Error("⚠️ La contraseña es demasiado débil. Usa al menos 6 caracteres.");
            } else if (firebaseErr.code === 'auth/invalid-email') {
                throw new Error("⚠️ El formato del correo electrónico no es válido.");
            } else {
                throw new Error(`⚠️ Error en autenticación de Firebase: ${firebaseErr.message}`);
            }
        }
    }

    const assignedUid = firebaseUser?.uid || `teacher_${Date.now()}`;
    const teacherData: TeacherUser = {
        id: assignedUid,
        uid: assignedUid,
        firebaseUid: assignedUid,
        name: data.name,
        email: data.email,
        password: data.password || 'password123',
        role: 'teacher',
        phone: data.phone,
        avatar: `https://api.dicebear.com/8.x/avataaars/svg?seed=${encodeURIComponent(data.name)}`,
        category: data.category,
        isApprovedForTutoring: false, // Strict: Pending admin approval, non-escalatable
        subjects: data.subjects || [],
        levels: data.levels || [],
        schedules: data.schedules || [],
        taughtCourseIds: [],
        coursesTaughtIds: [],
        favoriteVideos: []
    };

    // 2. Sync / Persist to Firestore while STILL authenticated (request.auth is valid)
    try {
        await syncUserToFirestore(teacherData, 'teacher', firebaseUser?.uid);
    } catch (firestoreErr: any) {
        console.error('[RegisterTeacher] Firestore write failure:', firestoreErr);
        throw new Error(`⚠️ No se pudo guardar el perfil del profesor en Firestore: ${firestoreErr.message || 'Permiso denegado o error de red.'}`);
    }

    // 3. Send Verification Email if applicable
    if (firebaseUser && !firebaseUser.emailVerified) {
        try {
            await sendEmailVerification(firebaseUser, { url: window.location.href });
        } catch (emailErr: any) {
            console.warn('Firebase Auth sendEmailVerification note:', emailErr.code, emailErr.message);
            try {
                await sendEmailVerification(firebaseUser);
            } catch (fallbackErr: any) {
                console.warn('Firebase Auth sendEmailVerification fallback note:', fallbackErr.code, fallbackErr.message);
                if (fallbackErr.code === 'auth/too-many-requests' || emailErr.code === 'auth/too-many-requests') {
                    throw new Error("⚠️ Firebase ha limitado temporalmente los envíos de correo por realizar demasiadas solicitudes continuas. Por favor espera 2-3 minutos.");
                }
                throw new Error(`⚠️ Firebase no pudo enviar el correo de verificación. Detalle: ${fallbackErr.message || emailErr.message}. Revisa en Firebase Console > Authentication > Settings que el dominio de la aplicación esté autorizado.`);
            }
        }
    }

    // 4. Update Mock / Local State ONLY AFTER successful Firebase operations
    let finalTeacher: TeacherUser;
    try {
        // Clean any stale user with the same email if exists in local memory to allow retries
        dbMock.dbPurgeUserFromMemory(data.email);
        finalTeacher = dbMock.dbRegisterTeacher(data);
    } catch (mockErr: any) {
        finalTeacher = teacherData;
    }

    // 5. Sign out ONLY AFTER all authenticated Firestore writes are fully resolved
    if (firebaseUser && auth) {
        await auth.signOut().catch(() => {});
    }

    return finalTeacher;
};

export const authenticateAdmin = async (username: string, password: string): Promise<AdminUser | undefined> => {
    await apiDelay(300);
    return dbMock.dbAuthenticateAdmin(username, password);
};

export const changeAdminPassword = async (data: { currentPassword: string, newPassword: string }): Promise<void> => {
    await apiDelay(300);
    dbMock.dbChangeAdminPassword(data);
    const admin = dbMock.adminUserData[0];
    if (admin) await syncUserToFirestore(admin, 'admin');
};

export const changeStudentPassword = async (studentId: string, current: string, newPass: string): Promise<StudentUser> => {
    await apiDelay(300);
    const user = dbMock.dbChangeStudentPassword(studentId, current, newPass);
    if (user) await syncUserToFirestore(user, 'student');
    return user;
};

export const requestAdminPasswordRecovery = async (email: string): Promise<void> => {
    if (auth) {
        try {
            await sendPasswordResetEmail(auth, email);
            return;
        } catch (e: any) {
            console.warn('Firebase sendPasswordResetEmail note:', e.message);
            if (e.code === 'auth/user-not-found') {
                throw new Error("⚠️ No existe ninguna cuenta registrada con este correo electrónico en Firebase.");
            }
            if (e.code === 'auth/too-many-requests') {
                throw new Error("⚠️ Se han realizado demasiadas solicitudes. Espera un momento antes de volver a intentarlo.");
            }
        }
    }
    return dbMock.dbRequestAdminPasswordRecovery(email);
};

export const requestPasswordRecovery = async (email: string): Promise<void> => {
    if (auth) {
        try {
            await sendPasswordResetEmail(auth, email);
            return;
        } catch (e: any) {
            console.warn('Firebase sendPasswordResetEmail note:', e.message);
            if (e.code === 'auth/user-not-found') {
                throw new Error("⚠️ No existe ninguna cuenta registrada con este correo electrónico en Firebase.");
            }
            if (e.code === 'auth/too-many-requests') {
                throw new Error("⚠️ Se han realizado demasiadas solicitudes de recuperación. Espera un momento y revisa tu carpeta de Spam.");
            }
            throw new Error(`⚠️ Error al enviar el correo de recuperación: ${e.message}`);
        }
    }
    return dbMock.dbRequestPasswordRecovery(email);
};

export const resendVerificationEmail = async (email?: string, password?: string): Promise<void> => {
    if (!auth) throw new Error("Servicio de autenticación no inicializado");
    
    let userToVerify = auth.currentUser;
    if (!userToVerify && email && password) {
        try {
            const cred = await signInWithEmailAndPassword(auth, email, password);
            userToVerify = cred.user;
        } catch (e: any) {
            if (e.code === 'auth/too-many-requests') {
                throw new Error("⚠️ Demasiadas solicitudes de Firebase en poco tiempo. Por favor, espera 2 minutos y revisa tu carpeta de Spam.");
            }
            throw new Error(`Error al verificar credenciales para reenvío: ${e.message}`);
        }
    }

    if (userToVerify) {
        try {
            await sendEmailVerification(userToVerify, { url: window.location.href });
        } catch (e: any) {
            console.warn('First sendEmailVerification attempt note:', e.code, e.message);
            // Fallback without custom action Code Settings in case domain isn't whitelisted in Firebase Console
            try {
                await sendEmailVerification(userToVerify);
            } catch (fallbackErr: any) {
                if (fallbackErr.code === 'auth/too-many-requests' || e.code === 'auth/too-many-requests') {
                    throw new Error("⚠️ Firebase ha limitado temporalmente los envíos de correo por realizar demasiados intentos seguidos. Por favor, espera 2 minutos y revisa la carpeta de Spam / Correo no deseado.");
                }
                throw new Error(`Error al enviar el correo de verificación de Firebase: ${fallbackErr.message || e.message}`);
            }
        }
    } else {
        throw new Error("No hay credenciales activas para reenviar el correo. Por favor ingresa tu correo y contraseña e inténtalo de nuevo.");
    }
};

export const checkIsEmailVerified = async (email?: string, password?: string): Promise<boolean> => {
    if (!auth) return false;

    if (email && password) {
        try {
            const cred = await signInWithEmailAndPassword(auth, email, password);
            if (cred.user) {
                await cred.user.reload();
                const verified = cred.user.emailVerified;
                if (!verified) {
                    await auth.signOut().catch(() => {});
                    return false;
                }
                return true;
            }
        } catch (e: any) {
            console.warn("checkIsEmailVerified signIn note:", e.message);
            return false;
        }
    }

    if (auth.currentUser) {
        if (!email || auth.currentUser.email?.toLowerCase() === email.toLowerCase()) {
            try {
                await auth.currentUser.reload();
                const verified = auth.currentUser.emailVerified;
                if (!verified) {
                    await auth.signOut().catch(() => {});
                    return false;
                }
                return true;
            } catch (e) {}
        }
    }

    return false;
};

export const createUserProfile = async (uid: string, data: any): Promise<StudentUser> => {
    // In mock mode, registration handles profile creation directly.
    throw new Error("Use registerStudent in mock mode");
};

export const fetchUserById = async (uid: string): Promise<StudentUser | null> => {
    const users = dbMock.dbFetchUsers();
    return users.find(u => u.id === uid) || null;
};

// --- USERS ---
export const fetchUsers = async (): Promise<StudentUser[]> => {
    let source: 'Firestore' | 'Local Mock' = 'Local Mock';
    if (db) {
        try {
            const usersRef = collection(db, 'users');
            const studentsRef = collection(db, 'students');
            const timeout = new Promise<[any, any]>((_, reject) => 
                setTimeout(() => reject(new Error('Firestore fetchUsers timeout')), 8000)
            );
            const [usersSnap, studentsSnap] = await Promise.race([
                Promise.all([
                    getDocs(query(usersRef, where('role', '==', 'student'))).catch(() => null),
                    getDocs(studentsRef).catch(() => null)
                ]),
                timeout
            ]);

            const fetchedStudents: StudentUser[] = [];
            const addOrUpdateStudent = (data: any, docId: string) => {
                const userId = data.id || data.uid || docId;
                if ((dbMock as any).isUserDeleted && (dbMock as any).isUserDeleted(userId, data.email)) return;
                const roleLower = (data.role || '').toLowerCase();
                if (roleLower !== 'teacher' && roleLower !== 'admin') {
                    const normalizedData = dbMock.normalizeAnyUser({ id: userId, uid: userId, role: 'student', ...data } as any) as StudentUser;
                    if (normalizedData) {
                        const idx = fetchedStudents.findIndex(s => 
                            s.id === userId || 
                            s.id === docId ||
                            (s as any).uid === userId || 
                            (s as any).uid === docId ||
                            (s as any).firebaseUid === userId || 
                            (s as any).firebaseUid === docId ||
                            (s.email && data.email && s.email.toLowerCase() === data.email.toLowerCase())
                        );
                        if (idx === -1) {
                            fetchedStudents.push(normalizedData);
                        } else {
                            const existing = fetchedStudents[idx];
                            fetchedStudents[idx] = {
                                ...existing,
                                ...normalizedData,
                                assignedTeacherId: normalizedData.assignedTeacherId !== undefined ? normalizedData.assignedTeacherId : existing.assignedTeacherId,
                                assignedTeacherName: normalizedData.assignedTeacherName !== undefined ? normalizedData.assignedTeacherName : existing.assignedTeacherName,
                            };
                        }
                    }
                }
            };

            if (usersSnap && !usersSnap.empty) {
                usersSnap.docs.forEach((docSnap: any) => addOrUpdateStudent(docSnap.data(), docSnap.id));
            }
            if (studentsSnap && !studentsSnap.empty) {
                studentsSnap.docs.forEach((docSnap: any) => addOrUpdateStudent(docSnap.data(), docSnap.id));
            }

            if (usersSnap || studentsSnap) {
                dbMock.studentsData.length = 0;
                dbMock.studentsData.push(...fetchedStudents);
                (dbMock.usersData as any).length = 0;
                (dbMock.usersData as any).push(...fetchedStudents);
                source = 'Firestore';
            }
        } catch (e) {
            console.warn('[API fetchUsers] Direct firestore fetch error:', e);
        }
    }
    await apiDelay(150);
    const users = dbMock.dbFetchUsers();
    logApiFlow('fetchUsers', source, { count: users.length });
    return users;
};

export const fetchTeachers = async (): Promise<TeacherUser[]> => {
    let source: 'Firestore' | 'Local Mock' = 'Local Mock';
    if (db) {
        try {
            const usersRef = collection(db, 'users');
            const teachersRef = collection(db, 'teachers');
            const [usersSnap, teachersSnap] = await Promise.all([
                getDocs(query(usersRef, where('role', '==', 'teacher'))).catch(() => null),
                getDocs(teachersRef).catch(() => null)
            ]);

            const fetchedTeachers: TeacherUser[] = [];
            const addOrUpdateTeacher = (data: any, docId: string) => {
                const userId = data.id || data.uid || docId;
                if ((dbMock as any).isUserDeleted && (dbMock as any).isUserDeleted(userId, data.email)) return;
                const roleLower = (data.role || '').toLowerCase();
                if (roleLower === 'teacher') {
                    const normalizedData = dbMock.normalizeAnyUser({ id: userId, role: 'teacher', ...data } as any) as TeacherUser;
                    if (normalizedData) {
                        const idx = fetchedTeachers.findIndex(t => 
                            t.id === userId || 
                            (t as any).uid === userId || 
                            (t as any).firebaseUid === userId || 
                            (t.email && data.email && t.email.toLowerCase() === data.email.toLowerCase())
                        );
                        if (idx === -1) {
                            fetchedTeachers.push(normalizedData);
                        } else {
                            fetchedTeachers[idx] = { ...fetchedTeachers[idx], ...normalizedData };
                        }
                    }
                }
            };

            if (usersSnap && !usersSnap.empty) {
                usersSnap.docs.forEach(docSnap => {
                    const data = docSnap.data();
                    if ((data.role || '').toLowerCase() === 'teacher') addOrUpdateTeacher(data, docSnap.id);
                });
            }
            if (teachersSnap && !teachersSnap.empty) {
                teachersSnap.docs.forEach(docSnap => addOrUpdateTeacher(docSnap.data(), docSnap.id));
            }

            if (usersSnap || teachersSnap) {
                dbMock.teachersData.length = 0;
                dbMock.teachersData.push(...fetchedTeachers);
                source = 'Firestore';
            }
        } catch (e) {
            console.warn('[API fetchTeachers] Direct firestore fetch error:', e);
        }
    }
    await apiDelay(150);
    const teachers = dbMock.dbFetchTeachers();
    logApiFlow('fetchTeachers', source, { count: teachers.length });
    return teachers;
};

export const createTeacher = async (data: { name: string; email: string; password?: string; phone: string; category: string }): Promise<TeacherUser> => {
    await apiDelay(300);
    const teacher = dbMock.dbCreateTeacher(data);
    await syncUserToFirestore(teacher, 'teacher');
    return teacher;
};

export const updateTeacherApproval = async (teacherId: string, isApproved: boolean): Promise<TeacherUser> => {
    await apiDelay(300);
    const teacher = dbMock.dbUpdateTeacherApproval(teacherId, isApproved);
    if (teacher) await syncUserToFirestore(teacher, 'teacher');
    return teacher;
};

export const updateTeacherDetails = async (teacherId: string, data: {
    isApprovedForTutoring?: boolean;
    subjects?: string[];
    levels?: string[];
    schedules?: string[];
    category?: string;
    aiEnabled?: boolean;
    videosEnabled?: boolean;
    canEditContent?: boolean;
    taughtCourseIds?: string[];
    coursesTaughtIds?: string[];
}): Promise<TeacherUser> => {
    await apiDelay(300);
    const teacher = dbMock.dbUpdateTeacherDetails(teacherId, data);
    if (teacher) await syncUserToFirestore(teacher, 'teacher');
    return teacher;
};

export const deleteTeacher = async (teacherId: string): Promise<{ teacherId: string }> => {
    await apiDelay(300);
    const knownTeacher = dbMock.dbFindUserAnywhere(teacherId);
    const res = dbMock.dbDeleteTeacher(teacherId);
    await deleteUserFromFirestore(teacherId, knownTeacher).catch(err => console.warn("Async firestore delete error:", err));
    return res;
};

export const toggleSubscriptionStatus = async (studentId: string, period?: 'monthly' | 'annual'): Promise<StudentUser> => {
    await apiDelay(300);
    const user = dbMock.dbToggleSubscriptionStatus(studentId, period);
    if (user) await syncUserToFirestore(user, 'student');
    return user;
};

export const addCredits = async (studentId: string, amount: number): Promise<StudentUser> => {
    await apiDelay(300);
    const user = dbMock.dbAddCredits(studentId, amount);
    if (user) await syncUserToFirestore(user, 'student');
    return user;
};

export const deductCredits = async (studentId: string, amount: number): Promise<StudentUser> => {
    await apiDelay(300);
    const user = dbMock.dbDeductCredits(studentId, amount);
    if (user) await syncUserToFirestore(user, 'student');
    return user;
};

export const fetchInfinityTransactions = async (studentId: string): Promise<InfinityTransaction[]> => {
    await apiDelay(200);
    return dbMock.dbFetchInfinityTransactions(studentId);
};

export const fetchStudentPayments = async (studentId?: string): Promise<StudentPayment[]> => {
    await apiDelay(200);
    return dbMock.dbFetchStudentPayments(studentId);
};

export const fetchStudentExpenses = async (studentId?: string): Promise<StudentExpense[]> => {
    await apiDelay(200);
    return dbMock.dbFetchStudentExpenses(studentId);
};

export const createStudentPayment = async (data: {
    studentId: string;
    amount: number;
    concept: string;
    method: 'Tarjeta' | 'Transferencia' | 'Efectivo' | 'Bizum';
    date?: string;
    status?: 'pending' | 'approved' | 'rejected' | 'completed';
    itemType?: 'subscription' | 'credits';
    itemQuantity?: number;
    billingPeriod?: 'monthly' | 'annual';
}): Promise<StudentPayment> => {
    await apiDelay(300);
    const pay = dbMock.dbCreateStudentPayment(data);
    await syncStudentPaymentToFirestore(pay);
    return pay;
};

export const approveStudentPayment = async (paymentId: string): Promise<{ payment: StudentPayment; updatedUser?: StudentUser }> => {
    await apiDelay(300);
    const result = dbMock.dbApproveStudentPayment(paymentId);
    await syncStudentPaymentToFirestore(result.payment);
    if (result.updatedUser) {
        await syncUserToFirestore(result.updatedUser);
    }
    return result;
};

export const rejectStudentPayment = async (paymentId: string): Promise<StudentPayment> => {
    await apiDelay(300);
    const pay = dbMock.dbRejectStudentPayment(paymentId);
    await syncStudentPaymentToFirestore(pay);
    return pay;
};

export const createStudentExpense = async (data: {
    studentId: string;
    amount: number;
    unit: 'credits' | 'eur';
    concept: string;
    date?: string;
}): Promise<StudentExpense> => {
    await apiDelay(300);
    const exp = dbMock.dbCreateStudentExpense(data);
    await syncStudentExpenseToFirestore(exp);
    return exp;
};

export const fetchTeacherPayments = async (teacherId?: string): Promise<TeacherPayment[]> => {
    await apiDelay(200);
    return dbMock.dbFetchTeacherPayments(teacherId);
};

export const createTeacherPayment = async (data: {
    teacherId: string;
    studentId: string;
    classConcept: string;
    classPrice: number;
    percentage: number;
    amount: number;
    method: 'Tarjeta' | 'Transferencia' | 'Efectivo' | 'Bizum';
    date?: string;
}): Promise<TeacherPayment> => {
    await apiDelay(300);
    const pay = dbMock.dbCreateTeacherPayment(data);
    await syncTeacherPaymentToFirestore(pay);
    return pay;
};

export const resetFinancialRecords = async (resetBalances: boolean = true): Promise<{ success: boolean; message: string }> => {
    await apiDelay(300);
    dbMock.dbResetFinancialRecords(resetBalances);
    await syncResetFinancialDataFromFirestore(resetBalances);
    return { success: true, message: 'Todos los registros financieros han sido reiniciados a cero.' };
};

export const deleteUser = async (userId: string): Promise<{ userId: string }> => {
    const knownUser = dbMock.dbFindUserAnywhere(userId);
    const res = dbMock.dbDeleteUser(userId);
    await deleteUserFromFirestore(userId, knownUser).catch(err => console.warn("Async firestore delete error:", err));
    return res;
};

export const assignUserRoleByEmail = async (data: { email: string; role: 'student' | 'teacher'; category?: string }): Promise<{ success: boolean; message: string; user: AnyUser }> => {
    await apiDelay(300);
    if (db) {
        try {
            const usersRef = collection(db, 'firestore_users');
            const qEmail = query(usersRef, where('email', '==', data.email.trim().toLowerCase()));
            const snap = await getDocs(qEmail);
            if (!snap.empty) {
                const docSnap = snap.docs[0];
                const uid = docSnap.id;
                const existingData = docSnap.data();
                const updatedUser = {
                    ...existingData,
                    role: data.role,
                    ...(data.role === 'teacher' ? { category: data.category || existingData.category || 'General', isApprovedForTutoring: true } : {})
                };
                await setDoc(doc(db, 'firestore_users', uid), { ...updatedUser, updatedAt: serverTimestamp() }, { merge: true });
                if (data.role === 'teacher') {
                    await setDoc(doc(db, 'teachers', uid), { ...updatedUser, updatedAt: serverTimestamp() }, { merge: true });
                    await deleteDoc(doc(db, 'students', uid)).catch(() => {});
                } else {
                    await setDoc(doc(db, 'students', uid), { ...updatedUser, updatedAt: serverTimestamp() }, { merge: true });
                    await deleteDoc(doc(db, 'teachers', uid)).catch(() => {});
                }
            }
        } catch (e) {
            console.warn('[API assignUserRoleByEmail] Firestore update error:', e);
        }
    }
    const res = dbMock.dbAssignUserRoleByEmail(data);
    if (res.user) await syncUserToFirestore(res.user, res.user.role);
    return res;
};

export const updateStudentCourse = async (studentId: string, newCourseIds: string[]): Promise<StudentUser> => {
    const user = dbMock.dbUpdateStudentCourse(studentId, newCourseIds);
    if (user) await syncUserToFirestore(user, 'student');
    return user;
};

export const resetStudentProgress = async (studentId: string): Promise<StudentUser> => {
    await apiDelay(300);
    const user = dbMock.dbResetStudentProgress(studentId);
    if (user) await syncUserToFirestore(user, 'student');
    return user;
};

export const adminResetStudentPassword = async (studentId: string, password: string): Promise<StudentUser> => {
    await apiDelay(300);
    const user = dbMock.dbAdminResetStudentPassword(studentId, password);
    if (user) await syncUserToFirestore(user, 'student');
    return user;
};

export const updateUserPermissions = async (userId: string, role: 'student' | 'teacher' | 'admin', permissions: { aiEnabled?: boolean; videosEnabled?: boolean; canInitiateCalls?: boolean; canInitiateWhiteboard?: boolean }): Promise<AnyUser> => {
    const user = dbMock.dbUpdateUserPermissions(userId, role as any, permissions as any);
    if (user) await syncUserToFirestore(user, role as any);
    return user;
};

export const assignStudentTeacher = async (studentId: string, teacherId: string | null): Promise<StudentUser> => {
    const user = dbMock.dbAssignStudentTeacher(studentId, teacherId);
    if (user) {
        const teacher = teacherId ? (dbMock.teachersData || []).find(t => t.id === teacherId) : null;
        const teacherName = teacherId ? teacher?.name || teacherId : null;
        
        await syncAssignStudentTeacherInFirestore(studentId, teacherId, teacherName);

        // Complementary sync for Admin role when writing to users/ collection is authorized
        try {
            const currentUser = auth?.currentUser;
            if (currentUser && currentUser.emailVerified) {
                const tokenResult = await currentUser.getIdTokenResult().catch(() => null);
                const isAdmin = tokenResult?.claims?.role === 'admin' || Boolean(tokenResult?.claims?.isAdmin);
                if (isAdmin && db && user.email) {
                    const usersRef = collection(db, 'users');
                    const qUsers = await getDocs(query(usersRef, where('email', '==', user.email))).catch(() => null);
                    if (qUsers && qUsers.docs && qUsers.docs.length > 0) {
                        const updatePayload = {
                            assignedTeacherId: teacherId || null,
                            assignedTeacherName: teacherName || null,
                            updatedAt: serverTimestamp()
                        };
                        await Promise.all(
                            qUsers.docs.map(d => setDoc(doc(db, 'users', d.id), updatePayload, { merge: true }))
                        );
                    }
                }
            }
        } catch (adminSyncErr) {
            console.warn('Optional admin user sync warning in assignStudentTeacher:', adminSyncErr);
        }
    }
    return user;
};

export const addWatchedVideo = async (studentId: string, videoId: string): Promise<StudentUser> => {
    const user = dbMock.dbAddWatchedVideo(studentId, videoId);
    if (user) await syncUserToFirestore(user, 'student');
    return user;
};

export const toggleFavoriteVideo = async (userId: string, videoId: string): Promise<AnyUser> => {
    const user = dbMock.dbToggleFavoriteVideo(userId, videoId);
    if (user) await syncUserToFirestore(user, user.role || 'student');
    return user;
};

// --- CONTENT ---
export const fetchCourses = async (): Promise<CourseLevel[]> => {
    let source: 'Firestore' | 'Local Mock' = 'Local Mock';
    try {
        const coursesRef = collection(db, 'courses');
        const snapshot = await getDocs(coursesRef);
        const courses: CourseLevel[] = [];
        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            courses.push({
                ...data,
                id: docSnap.id,
                name: data.name || data.title || 'Curso',
                title: data.title || data.name || 'Curso',
                subjects: data.subjects || [],
                blocks: data.blocks || [],
                videos: data.videos || [],
                createdAt: data.createdAt || new Date().toISOString(),
            } as CourseLevel);
        });
        
        if (courses.length > 0) {
            // Update local mock data for consistency before sync runs
            dbMock.coursesData.length = 0;
            dbMock.coursesData.push(...courses);
            source = 'Firestore';
            logApiFlow('fetchCourses', source, { count: courses.length });
            return courses;
        }
    } catch (e) {
        console.warn('Failed to fetch courses from Firestore, falling back to mock data', e);
    }

    // Simulate slight delay for realism
    await apiDelay(200);
    const mockCourses = dbMock.dbFetchCourses();
    logApiFlow('fetchCourses', source, { count: mockCourses.length });
    return mockCourses;
};

export const addLevel = async (levelData: NewCourseLevelData) => {
    const res = dbMock.dbAddLevel(levelData);
    syncCoursesToFirestore().catch(e => console.warn('Background sync warning:', e));
    return res;
};

export const updateLevel = async (levelId: string, levelData: Partial<NewCourseLevelData>) => {
    const res = dbMock.dbUpdateLevel(levelId, levelData as NewCourseLevelData);
    syncCoursesToFirestore().catch(e => console.warn('Background sync warning:', e));
    return res;
};

export const deleteLevel = async (levelId: string) => {
    const res = dbMock.dbDeleteLevel(levelId);
    deleteCourseFromFirestore(levelId).catch(e => console.warn('Background delete course warning:', e));
    syncCoursesToFirestore().catch(e => console.warn('Background sync warning:', e));
    return res;
};

export const addSubject = async (levelId: string, subjectData: NewSubjectData): Promise<Subject> => {
    const res = dbMock.dbAddSubject(levelId, subjectData);
    syncCoursesToFirestore().catch(e => console.warn('Background sync warning:', e));
    return res;
};

export const updateSubject = async (levelId: string, subjectId: string, subjectData: NewSubjectData): Promise<Subject> => {
    const res = dbMock.dbUpdateSubject(levelId, subjectId, subjectData);
    syncCoursesToFirestore().catch(e => console.warn('Background sync warning:', e));
    return res;
};

export const deleteSubject = async (levelId: string, subjectId: string): Promise<void> => {
    const res = dbMock.dbDeleteSubject(levelId, subjectId);
    syncCoursesToFirestore().catch(e => console.warn('Background sync warning:', e));
    return res;
};

export const addVideo = async (levelId: string, subjectId: string, videoData: NewVideoData, blockId?: string): Promise<Video> => {
    const res = dbMock.dbAddVideo(levelId, subjectId, videoData, blockId);
    syncCoursesToFirestore().catch(e => console.warn('Background sync warning:', e));
    return res;
};

export const addVideos = async (levelId: string, subjectId: string, videosData: NewVideoData[], blockId?: string): Promise<Video[]> => {
    const res = dbMock.dbAddVideos(levelId, subjectId, videosData, blockId);
    syncCoursesToFirestore().catch(e => console.warn('Background sync warning:', e));
    return res;
};

export const updateVideo = async (levelId: string, subjectId: string, videoId: string, videoData: NewVideoData, blockId?: string): Promise<Video> => {
    const res = dbMock.dbUpdateVideo(levelId, subjectId, videoId, videoData, blockId);
    syncCoursesToFirestore().catch(e => console.warn('Background sync warning:', e));
    return res;
};


export const deleteVideo = async (levelId: string, subjectId: string, videoId: string, blockId?: string): Promise<void> => {
    try {
        const courses = dbMock.dbFetchCourses();
        const level = courses.find(l => l.id === levelId);
        const subject = level?.subjects?.find(s => s.id === subjectId);
        let targetVideo: Video | undefined;
        if (blockId) {
            const block = subject?.blocks?.find(b => b.id === blockId);
            targetVideo = block?.videos?.find(v => v.id === videoId);
        } else {
            targetVideo = subject?.videos?.find(v => v.id === videoId);
        }

        if (targetVideo?.youtubeLinks) {
            for (const link of targetVideo.youtubeLinks) {
                if (link.videoUrl) {
                    deleteVideoFileFromStorage(link.videoUrl).catch(e => console.warn('Could not delete storage file:', e));
                }
            }
        }
    } catch (e) {
        console.warn('Error checking video for storage cleanup:', e);
    }

    const res = dbMock.dbDeleteVideo(levelId, subjectId, videoId, blockId);
    syncCoursesToFirestore().catch(e => console.warn('Background sync warning:', e));
    deleteVideoFromFirestore(videoId).catch(e => console.warn('Background delete warning:', e));
    return res;
};

export const addBlock = async (levelId: string, subjectId: string, blockData: NewVideoBlockData): Promise<VideoBlock> => {
    const res = dbMock.dbAddBlock(levelId, subjectId, blockData);
    syncCoursesToFirestore().catch(e => console.warn('Background sync warning:', e));
    return res;
};

export const updateBlock = async (levelId: string, subjectId: string, blockId: string, blockData: NewVideoBlockData): Promise<VideoBlock> => {
    const res = dbMock.dbUpdateBlock(levelId, subjectId, blockId, blockData);
    syncCoursesToFirestore().catch(e => console.warn('Background sync warning:', e));
    return res;
};

export const deleteBlock = async (levelId: string, subjectId: string, blockId: string): Promise<void> => {
    const res = dbMock.dbDeleteBlock(levelId, subjectId, blockId);
    syncCoursesToFirestore().catch(e => console.warn('Background sync warning:', e));
    return res;
};

// --- COMMENTS ---
export const fetchComments = async (videoId: string): Promise<Comment[]> => {
    if (db) {
        try {
            const commentsRef = collection(db, 'firestore_comments');
            const q = query(commentsRef, where('videoId', '==', videoId));
            const snap = await getDocs(q).catch(() => null);
            if (snap) {
                const firestoreComments: Comment[] = [];
                snap.docs.forEach(docSnap => {
                    const data = docSnap.data();
                    const commentId = data.id || docSnap.id;
                    if (dbMock.deletedCommentIds.has(commentId)) return;
                    if (data.videoId === videoId) {
                        firestoreComments.push({
                            id: commentId,
                            videoId: data.videoId,
                            author: data.author,
                            text: data.text,
                            timestamp: data.timestamp || new Date().toISOString(),
                            isRead: data.isRead === true
                        });
                    }
                });
                // Replace or merge in mock database
                firestoreComments.forEach(fc => {
                    const idx = dbMock.commentsData.findIndex(c => c.id === fc.id);
                    if (idx === -1) dbMock.commentsData.push(fc);
                    else dbMock.commentsData[idx] = fc;
                });
            }
        } catch (e) {
            console.warn('[API fetchComments] Firestore fetch error:', e);
        }
    }
    return dbMock.dbFetchComments(videoId);
};

export const fetchAllComments = async (): Promise<Comment[]> => {
    if (db) {
        try {
            const commentsRef = collection(db, 'firestore_comments');
            const snap = await getDocs(commentsRef).catch(() => null);
            if (snap) {
                const fetchedComments: Comment[] = [];
                snap.docs.forEach(docSnap => {
                    const data = docSnap.data();
                    const commentId = data.id || docSnap.id;
                    if (dbMock.deletedCommentIds.has(commentId)) return;
                    fetchedComments.push({
                        id: commentId,
                        videoId: data.videoId,
                        author: data.author,
                        text: data.text,
                        timestamp: data.timestamp || new Date().toISOString(),
                        isRead: data.isRead === true
                    });
                });
                dbMock.commentsData.length = 0;
                dbMock.commentsData.push(...fetchedComments);
            }
        } catch (e) {
            console.warn('[API fetchAllComments] Firestore fetch error:', e);
        }
    }
    return dbMock.dbFetchAllComments();
};

export const markCommentAsRead = async (commentId: string): Promise<Comment> => {
    const comment = dbMock.dbMarkCommentAsRead(commentId);
    await syncMarkCommentAsReadInFirestore(commentId);
    return comment;
};

export const postComment = async (videoId: string, commentData: { author: { id: string; name: string; }, text: string }): Promise<Comment> => {
    const comment = dbMock.dbPostComment(videoId, commentData);
    await syncPostCommentToFirestore(comment);
    return comment;
};

export const updateComment = async (commentId: string, text: string): Promise<Comment> => {
    const comment = dbMock.dbUpdateComment(commentId, text);
    await syncUpdateCommentInFirestore(commentId, text);
    return comment;
};

export const deleteComment = async (commentId: string): Promise<{ commentId: string }> => {
    const res = dbMock.dbDeleteComment(commentId);
    await syncDeleteCommentFromFirestore(commentId);
    return res;
};

// --- CONFIG ---
export const fetchAppConfig = async (): Promise<AppConfig> => {
    return dbMock.dbFetchAppConfig();
};

export const updateAppConfig = async (newConfig: AppConfig): Promise<AppConfig> => {
    const res = dbMock.dbUpdateAppConfig(newConfig);
    await syncAppConfigToFirestore(res);
    for (const u of dbMock.usersData) {
        await syncUserToFirestore(u, u.role || 'student');
    }
    for (const t of dbMock.teachersData) {
        await syncUserToFirestore(t, 'teacher');
    }
    return res;
};

// --- REQUESTS & TUTORING ---
export const fetchUserSeenStates = async () => {
    return dbMock.dbFetchUserSeenStates();
};

export const syncUserSeenStates = async (stateData: any) => {
    return dbMock.dbSyncUserSeenStates(stateData);
};

export const markTutoringRequestsAsSeen = async (role: 'admin' | 'teacher' | 'student', userId?: string) => {
    return dbMock.dbMarkTutoringRequestsAsSeen(role, userId);
};

export const markTopicRequestsAsSeen = async (role: 'admin' | 'teacher') => {
    return dbMock.dbMarkTopicRequestsAsSeen(role);
};

export const fetchTopicRequests = async (): Promise<TopicRequest[]> => {
    if (db) {
        try {
            const topicRequestsRef = collection(db, 'firestore_topic_requests');
            const snap = await getDocs(topicRequestsRef).catch(() => null);
            if (snap) {
                const fetchedRequests: TopicRequest[] = [];
                snap.docs.forEach(docSnap => {
                    const data = docSnap.data();
                    const reqId = data.id || docSnap.id;
                    if (dbMock.deletedTopicRequestIds.has(reqId)) return;
                    fetchedRequests.push({
                        id: reqId,
                        studentId: data.studentId,
                        studentName: data.studentName,
                        topic: data.topic,
                        subjectId: data.subjectId || data.subject || '',
                        details: data.details || '',
                        status: data.status || 'pending',
                        timestamp: data.timestamp || new Date().toISOString()
                    });
                });
                dbMock.topicRequestsData.length = 0;
                dbMock.topicRequestsData.push(...fetchedRequests);
            }
        } catch (e) {
            console.warn('[API fetchTopicRequests] Firestore fetch error:', e);
        }
    }
    return dbMock.dbFetchTopicRequests();
};

export const submitTopicRequest = async (data: Omit<TopicRequest, 'id' | 'timestamp' | 'status'>) => {
    const req = dbMock.dbSubmitTopicRequest(data);
    await syncSubmitTopicRequestToFirestore(req);
    return req;
};

export const updateTopicRequestStatus = async (requestId: string, status: 'pending' | 'completed') => {
    const req = dbMock.dbUpdateTopicRequestStatus(requestId, status);
    await syncUpdateTopicRequestStatusInFirestore(requestId, status);
    return req;
};

export const deleteTopicRequest = async (requestId: string) => {
    const res = dbMock.dbDeleteTopicRequest(requestId);
    await syncDeleteTopicRequestFromFirestore(requestId);
    return res;
};

export const fetchTutoringRequests = async (): Promise<TutoringRequest[]> => {
    if (db) {
        try {
            const tutoringRef = collection(db, 'firestore_tutoring_requests');
            const currentUser = auth.currentUser;
            const currentUserData = currentUser ? dbMock.dbFindUserAnywhere(currentUser.uid) : null;
            let q;
            if (currentUser && currentUserData && (currentUserData.role === 'admin' || currentUserData.role === 'teacher')) {
                q = tutoringRef;
            } else if (currentUser) {
                q = query(tutoringRef, where('studentId', '==', currentUser.uid));
            } else {
                q = tutoringRef;
            }
            const snap = await getDocs(q).catch(() => null);
            if (snap) {
                const fetchedTutoring: TutoringRequest[] = [];
                snap.docs.forEach(docSnap => {
                    const data = docSnap.data();
                    const reqId = data.id || docSnap.id;
                    if (dbMock.deletedTutoringRequestIds.has(reqId)) return;
                    fetchedTutoring.push({ id: reqId, ...data } as TutoringRequest);
                });
                dbMock.tutoringRequestsData.length = 0;
                dbMock.tutoringRequestsData.push(...fetchedTutoring);
            }
        } catch (e) {
            console.warn('[API fetchTutoringRequests] Firestore fetch error:', e);
        }
    }
    return dbMock.dbFetchTutoringRequests();
};

export const fetchStudentCourseProgress = async (studentId: string) => {
    if (db && studentId) {
        try {
            const progressRef = collection(db, 'student_course_progress');
            const q = query(progressRef, where('studentId', '==', studentId));
            const snap = await getDocs(q).catch(() => null);
            if (snap) {
                return snap.docs.map(docSnap => docSnap.data());
            }
        } catch (e) {
            console.warn('[API fetchStudentCourseProgress] Firestore fetch error:', e);
        }
    }
    return [];
};

export const submitTutoringRequest = async (data: Omit<TutoringRequest, 'id' | 'timestamp' | 'status'>) => {
    const newReq = dbMock.dbSubmitTutoringRequest(data);
    syncSubmitTutoringRequestToFirestore(newReq).catch(console.error);
    return newReq;
};

export const updateTutoringRequestStatus = async (requestId: string, status: 'pending' | 'confirmed' | 'completed', teacherId?: string) => {
    const req = dbMock.dbUpdateTutoringRequestStatus(requestId, status, teacherId);
    if (req) syncSubmitTutoringRequestToFirestore(req).catch(console.error);
    return req;
};

export const approveTutoringRequest = async (requestId: string, role: 'teacher' | 'admin', teacherId?: string) => {
    const req = dbMock.dbApproveTutoringRequest(requestId, role, teacherId);
    if (req) syncSubmitTutoringRequestToFirestore(req).catch(console.error);
    return req;
};

export const requestTutoringModification = async (requestId: string, proposedDate: string, proposedTime: string, proposedDetails: string, requesterRole: 'student' | 'teacher') => {
    const req = dbMock.dbRequestTutoringModification(requestId, proposedDate, proposedTime, proposedDetails, requesterRole);
    if (req) syncSubmitTutoringRequestToFirestore(req).catch(console.error);
    return req;
};

export const respondToTutoringModification = async (requestId: string, action: 'accept' | 'reject', responderRole?: 'teacher' | 'admin') => {
    const req = dbMock.dbRespondToTutoringModification(requestId, action, responderRole);
    if (req) syncSubmitTutoringRequestToFirestore(req).catch(console.error);
    return req;
};

export const updateTutoringWhatsappSent = async (requestId: string) => {
    const req = dbMock.dbUpdateTutoringWhatsappSent(requestId);
    if (req) syncSubmitTutoringRequestToFirestore(req).catch(console.error);
    return req;
};

export const rateTutoringRequest = async (requestId: string, rating: number, feedback: string) => {
    const req = dbMock.dbRateTutoringRequest(requestId, rating, feedback);
    if (req) syncSubmitTutoringRequestToFirestore(req).catch(console.error);
    return req;
};

export const updateTutoringDetails = async (
    requestId: string,
    updates: Partial<Pick<TutoringRequest, 'meetingLink' | 'isVoiceCall' | 'sessionSummary' | 'date' | 'time' | 'teacherId'>>,
    byRole?: 'student' | 'teacher' | 'admin'
) => {
    const req = dbMock.dbUpdateTutoringDetails(requestId, updates, byRole);
    if (req) syncSubmitTutoringRequestToFirestore(req).catch(console.error);
    return req;
};

export const deleteTutoringRequest = async (requestId: string) => {
    dbMock.dbDeleteTutoringRequest(requestId);
    await syncDeleteTutoringRequestFromFirestore(requestId);
    return { success: true };
};

// --- AGENDA, QUIZZES, ANSWERS ---
export const fetchAgendaEvents = async (studentId?: string): Promise<ExamEvent[]> => {
    if (db) {
        try {
            const agendaRef = collection(db, 'firestore_agenda_events');
            const snap = await getDocs(agendaRef).catch(() => null);
            if (snap) {
                const fetchedEvents: ExamEvent[] = [];
                snap.docs.forEach(docSnap => {
                    const data = docSnap.data();
                    const eventId = data.id || docSnap.id;
                    if (dbMock.deletedAgendaIds.has(eventId)) return;
                    if (data.studentId === studentId) {
                        fetchedEvents.push({
                            id: eventId,
                            studentId: data.studentId,
                            title: data.title,
                            date: data.date,
                            subjectId: data.subjectId || data.subject || '',
                            videoIds: data.videoIds || [],
                            studyPlan: data.studyPlan,
                            quiz: data.quiz
                        });
                    }
                });
                const otherEvents = dbMock.agendaData.filter(e => e.studentId !== studentId);
                dbMock.agendaData.length = 0;
                dbMock.agendaData.push(...otherEvents, ...fetchedEvents);
            }
        } catch (e) {
            console.warn('[API fetchAgendaEvents] Firestore fetch error:', e);
        }
    }
    return studentId 
        ? dbMock.dbFetchAgendaEvents(studentId) 
        : dbMock.agendaData.filter(e => !dbMock.deletedAgendaIds.has(e.id));
};

export const addAgendaEvent = async (eventData: Omit<ExamEvent, 'id'>) => {
    const event = dbMock.dbAddAgendaEvent(eventData);
    await syncAddAgendaEventToFirestore(event);
    return event;
};

export const updateAgendaEvent = async (eventId: string, eventData: Partial<Omit<ExamEvent, 'id' | 'studentId'>>) => {
    const updated = dbMock.dbUpdateAgendaEvent(eventId, eventData as any);
    await syncUpdateAgendaEventToFirestore(eventId, eventData);
    return updated;
};

export const deleteAgendaEvent = async (eventId: string) => {
    const res = dbMock.dbDeleteAgendaEvent(eventId);
    await syncDeleteAgendaEventFromFirestore(eventId);
    return res;
};

export const fetchQuizByVideoId = async (videoId: string): Promise<Quiz | null> => {
    return dbMock.dbFetchQuizByVideoId(videoId);
};

export const saveQuiz = async (quizData: NewQuizData): Promise<Quiz> => {
    const quiz = dbMock.dbSaveQuiz(quizData);
    await syncSaveQuizToFirestore(quiz);
    return quiz;
};

export const fetchStudentAnswers = async (studentId: string): Promise<StudentAnswer[]> => {
    return dbMock.dbFetchStudentAnswers(studentId);
};

export const fetchAllStudentAnswers = async (): Promise<StudentAnswer[]> => {
    await apiDelay(150);
    return dbMock.dbFetchAllStudentAnswers();
};

export const submitStudentAnswer = async (answerData: Omit<StudentAnswer, 'timestamp'>) => {
    return dbMock.dbSubmitStudentAnswer(answerData);
};

export function parseConversationParticipants(conversationId: string | null | undefined): { studentId: string | null; teacherId: string | null } {
    return dbMock.parseConversationParticipants(conversationId);
}

// --- CHAT ---
export const fetchConversations = async (): Promise<Conversation[]> => {
    return dbMock.dbFetchConversations();
};

/**
 * FASE 3B: Capa canónica de lectura de listados y metadata desde /chats en Firestore.
 * Lee directamente de la colección canónica /chats aplicando aislamiento estricto
 * por usuario ('participants array-contains userId').
 */
export const fetchUserChatsFromFirestore = async (userId: string): Promise<Conversation[]> => {
    if (!userId) return [];
    try {
        const chatsRef = collection(db, 'chats');
        const q = query(chatsRef, where('participants', 'array-contains', userId));
        const snapshot = await getDocs(q);
        
        console.log(`[fetchUserChatsFromFirestore] CANONICAL /chats SUCCESS: Loaded ${snapshot.docs.length} chats for userId=${userId}`);

        return snapshot.docs.map(docSnap => {
            const data = docSnap.data();
            const chatId = docSnap.id;
            const unreadMap = data.unreadCount || {};
            const userUnread = (unreadMap[userId] || 0) > 0;
            const isSupport = chatId.startsWith('support_') || data.type === 'support';
            
            const studentId = data.studentId || (isSupport ? chatId.replace('support_', '') : chatId.replace(/^direct_/, '').split('_')[0]) || userId;
            const teacherId = data.teacherId || (chatId.startsWith('direct_') ? chatId.replace('direct_', '').split('_')[1] : undefined);
            const msgText = data.lastMessage || data.lastMessageText || '';
            const msgTime = data.lastMessageTimestamp?.toDate 
                ? data.lastMessageTimestamp.toDate().toISOString() 
                : (typeof data.lastMessageTimestamp === 'string' ? data.lastMessageTimestamp : new Date().toISOString());

            const userUnreadCount = unreadMap[userId] || 0;
            const isCallerAdmin = userId === 'admin' || userId.startsWith('admin');
            const isCallerStudent = studentId === userId;
            const isCallerTeacher = teacherId === userId;

            // unreadByAdmin logic
            let unreadByAdmin = false;
            if (data.unreadByAdmin !== undefined) {
                unreadByAdmin = Boolean(data.unreadByAdmin);
                if (isCallerAdmin && unreadMap[userId] !== undefined) {
                    unreadByAdmin = unreadByAdmin && userUnreadCount > 0;
                }
            } else {
                unreadByAdmin = isCallerAdmin ? userUnreadCount > 0 : Object.entries(unreadMap).some(([k, v]) => (k === 'admin' || k.startsWith('admin')) && (v as number) > 0);
            }

            // unreadByStudent logic
            let unreadByStudent = false;
            if (data.unreadByStudent !== undefined) {
                unreadByStudent = Boolean(data.unreadByStudent);
                if (isCallerStudent && unreadMap[userId] !== undefined) {
                    unreadByStudent = unreadByStudent && userUnreadCount > 0;
                }
            } else {
                unreadByStudent = isCallerStudent ? userUnreadCount > 0 : (studentId ? (unreadMap[studentId] || 0) > 0 : false);
            }

            // unreadByTeacher logic
            let unreadByTeacher = false;
            if (data.unreadByTeacher !== undefined) {
                unreadByTeacher = Boolean(data.unreadByTeacher);
                if (isCallerTeacher && unreadMap[userId] !== undefined) {
                    unreadByTeacher = unreadByTeacher && userUnreadCount > 0;
                }
            } else {
                unreadByTeacher = isCallerTeacher ? userUnreadCount > 0 : (teacherId ? (unreadMap[teacherId] || 0) > 0 : false);
            }

            return {
                id: chatId,
                type: data.type || (chatId.startsWith('support_') ? 'support' : chatId.startsWith('direct_') ? 'direct' : chatId.startsWith('peer_') ? 'peer' : 'support'),
                studentId,
                studentName: data.studentName || 'Alumno',
                teacherId,
                teacherName: data.teacherName,
                lastMessageText: msgText,
                lastMessageTimestamp: msgTime,
                unreadByStudent,
                unreadByTeacher,
                unreadByAdmin
            };
        });
    } catch (err: any) {
        const isPermissionDenied = err?.code === 'permission-denied' || err?.message?.includes('insufficient permissions');
        if (isPermissionDenied) {
            console.error('[fetchUserChatsFromFirestore] CANONICAL /chats PERMISSION_DENIED:', {
                collection: '/chats',
                operation: 'list (where participants array-contains userId)',
                userId,
                authUid: auth?.currentUser?.uid || null,
                errorMessage: err?.message || String(err)
            });
        } else {
            console.error('[fetchUserChatsFromFirestore] CANONICAL /chats OTHER_ERROR:', {
                collection: '/chats',
                operation: 'list (where participants array-contains userId)',
                userId,
                authUid: auth?.currentUser?.uid || null,
                errorMessage: err?.message || String(err)
            });
        }
        console.warn('[fetchUserChatsFromFirestore] Falling back to dbMock:', err);
        return dbMock.dbFetchConversations().filter(c => c.studentId === userId || c.teacherId === userId || c.id.includes(userId) || userId === 'admin' || userId.startsWith('admin'));
    }
};

/**
 * FASE 3C: Capa canónica de lectura de listados P2P desde /chats en Firestore.
 * Lee directamente de la colección canónica /chats aplicando aislamiento estricto
 * por usuario ('participants array-contains studentId') y tipo ('type == peer').
 */
export const fetchUserPeerChatsFromFirestore = async (studentId: string): Promise<StudentPeerConversation[]> => {
    if (!studentId) return [];
    try {
        const chatsRef = collection(db, 'chats');
        const q = query(
            chatsRef,
            where('participants', 'array-contains', studentId),
            where('type', '==', 'peer')
        );
        const snapshot = await getDocs(q);
        
        return snapshot.docs.map(docSnap => {
            const data = docSnap.data();
            const chatId = docSnap.id;
            
            let participantIds: string[] = Array.isArray(data.participants) 
                ? data.participants 
                : (Array.isArray(data.participantIds) ? data.participantIds : []);
            if (participantIds.length === 0 && chatId.startsWith('peer_')) {
                participantIds = chatId.replace('peer_', '').split('_');
            }
            
            const lastMessageText = data.lastMessage || data.lastMessageText || '';
            let lastMessageTimestamp = new Date().toISOString();
            if (data.lastMessageTimestamp?.toDate) {
                lastMessageTimestamp = data.lastMessageTimestamp.toDate().toISOString();
            } else if (typeof data.lastMessageTimestamp === 'string') {
                lastMessageTimestamp = data.lastMessageTimestamp;
            } else if (typeof data.lastMessageTimestamp === 'number') {
                lastMessageTimestamp = new Date(data.lastMessageTimestamp).toISOString();
            }
            
            const unreadByStudentId: { [sId: string]: boolean } = {};
            if (data.unreadCount && typeof data.unreadCount === 'object') {
                Object.keys(data.unreadCount).forEach(uid => {
                    unreadByStudentId[uid] = (data.unreadCount[uid] || 0) > 0;
                });
            } else if (data.unreadByStudentId && typeof data.unreadByStudentId === 'object') {
                Object.assign(unreadByStudentId, data.unreadByStudentId);
            }
            
            return {
                id: chatId,
                participantIds,
                lastMessageText,
                lastMessageTimestamp,
                unreadByStudentId
            };
        });
    } catch (err) {
        console.warn('[fetchUserPeerChatsFromFirestore] Falling back to dbMock:', err);
        return dbMock.dbFetchPeerConversations(studentId);
    }
};

export const fetchMessages = async (conversationId: string): Promise<DirectMessage[]> => {
    return dbMock.dbFetchMessages(conversationId);
};

export const sendMessage = async (messageData: Omit<DirectMessage, 'id' | 'timestamp'>): Promise<DirectMessage> => {
    const msg = dbMock.dbSendMessage(messageData);
    syncSendDirectMessageToFirestore(msg).catch(console.error);
    return msg;
};

export const editMessage = async (messageId: string, text: string): Promise<DirectMessage> => {
    const msg = dbMock.dbEditMessage(messageId, text);
    await syncUpdateDirectMessageInFirestore(messageId, text);
    return msg;
};

export const deleteMessage = async (messageId: string): Promise<{ success: boolean; conversationId: string }> => {
    const res = dbMock.dbDeleteMessage(messageId);
    if (res.success) {
        await syncDeleteDirectMessageFromFirestore(messageId);
    }
    return res;
};

export const clearChatMessages = async (conversationId: string): Promise<{ success: boolean; clearedCount: number }> => {
    const res = dbMock.dbClearChatMessages(conversationId);
    await syncClearChatMessagesInFirestore(conversationId);
    return res;
};

export const markConversationAsRead = async (conversationId: string, role?: string) => {
    dbMock.dbMarkConversationAsRead(conversationId, role);
    syncMarkConversationAsReadInFirestore(conversationId, role).catch(console.error);
};

export const closeSupportConversation = async (conversationId: string, studentId: string, closedBy: string = 'teacher') => {
    dbMock.dbCloseSupportConversation(conversationId, studentId, closedBy, false);
    await syncCloseSupportConversationInFirestore(conversationId, studentId, closedBy).catch(console.error);
    
    // Emit events AFTER Firestore sync is completed successfully to prevent any race condition or old data refetch
    dbMock.eventEmitter.emit('message-update', { conversationId, closed: true });
    dbMock.eventEmitter.emit('direct-message-update', { conversationId, closed: true });
    dbMock.eventEmitter.emit('tutoring-request-update', { conversationId, closed: true });
};

export const assignConversationTeacher = async (conversationId: string, teacherId: string | null): Promise<Conversation> => {
    await apiDelay(150);
    const convo = dbMock.dbAssignConversation(conversationId, teacherId);
    const studentId = conversationId.replace('direct_', '');
    const users = dbMock.dbFetchUsers();
    const student = users.find(u => u.id === studentId || u.id === conversationId || u.id === convo.studentId);
    if (student) {
        await assignStudentTeacher(student.id, teacherId);
    } else {
        const teacher = teacherId ? (dbMock.teachersData || []).find(t => t.id === teacherId) : null;
        await syncConversationTeacherInFirestore(conversationId, teacherId, teacher?.name || null);
    }
    return convo;
};

// --- STUDENT PEER CHAT (WHATSAPP-STYLE) ---
export const fetchStudentFriends = async (studentId: string): Promise<StudentFriend[]> => {
    await apiDelay(200);
    return dbMock.dbFetchStudentFriends(studentId);
};

export const addFriendByContact = async (studentId: string, emailOrPhone: string): Promise<StudentFriend> => {
    await apiDelay(300);
    const res = dbMock.dbAddFriendByContact(studentId, emailOrPhone);
    syncAddStudentFriendToFirestore(studentId, res.id).catch(console.error);
    return res;
};

export const searchStudents = async (studentId: string, searchVal: string): Promise<(StudentFriend & { isConnected: boolean })[]> => {
    await apiDelay(150);
    return dbMock.dbSearchStudents(studentId, searchVal);
};

export const fetchPeerConversations = async (studentId: string): Promise<StudentPeerConversation[]> => {
    await apiDelay(200);
    return dbMock.dbFetchPeerConversations(studentId);
};

export const fetchAllPeerConversations = async (): Promise<StudentPeerConversation[]> => {
    await apiDelay(150);
    for (let i = dbMock.studentPeerConversationsData.length - 1; i >= 0; i--) {
        const c = dbMock.studentPeerConversationsData[i];
        const allParticipantsRegistered = c.participantIds.every(pId =>
            (dbMock.studentsData || dbMock.usersData || []).some(u => u.id === pId || (u as any).uid === pId || u.email === pId)
        );
        if (!allParticipantsRegistered) {
            dbMock.studentPeerConversationsData.splice(i, 1);
        }
    }
    return dbMock.studentPeerConversationsData;
};

export const fetchPeerMessages = async (conversationId: string): Promise<StudentPeerMessage[]> => {
    return dbMock.dbFetchPeerMessages(conversationId);
};

export const sendPeerMessage = async (messageData: { conversationId: string; senderId: string; text: string; attachments?: Attachment[] }): Promise<StudentPeerMessage> => {
    const msg = dbMock.dbSendPeerMessage(messageData);
    syncSendPeerMessageToFirestore(msg).catch(console.error);
    return msg;
};

export const editPeerMessage = async (messageId: string, text: string): Promise<StudentPeerMessage> => {
    const msg = dbMock.dbEditPeerMessage(messageId, text);
    await syncUpdatePeerMessageInFirestore(messageId, text);
    return msg;
};

export const deletePeerMessage = async (messageId: string): Promise<{ success: boolean; conversationId: string }> => {
    const res = dbMock.dbDeletePeerMessage(messageId);
    if (res.success) {
        await syncDeletePeerMessageFromFirestore(messageId);
    }
    return res;
};

export const markPeerConversationAsRead = async (conversationId: string, studentId: string): Promise<void> => {
    dbMock.dbMarkPeerConversationAsRead(conversationId, studentId);
    syncMarkPeerConversationAsReadInFirestore(conversationId, studentId).catch(console.error);
};

export const deletePeerConversation = async (conversationId: string): Promise<{ success: boolean }> => {
    const res = dbMock.dbDeletePeerConversation(conversationId);
    return res;
};

// --- CHATS DE PROFESORES ---
export interface TeacherMessage {
    id: string;
    conversationId?: string;
    senderId: string;
    senderName: string;
    text: string;
    timestamp: string;
    attachments?: Attachment[];
}

export const fetchTeacherMessages = async (conversationId?: string): Promise<TeacherMessage[]> => {
    return dbMock.dbFetchTeacherMessages(conversationId);
};

export const sendTeacherMessage = async (messageData: { conversationId?: string; senderId: string; senderName: string; text: string; attachments?: Attachment[] }): Promise<TeacherMessage> => {
    const msg = dbMock.dbSendTeacherMessage(messageData);
    syncSendTeacherMessageToFirestore(msg).catch(console.error);
    return msg;
};

export const editTeacherMessage = async (messageId: string, text: string): Promise<TeacherMessage> => {
    const msg = dbMock.dbEditTeacherMessage(messageId, text);
    await syncUpdateTeacherMessageInFirestore(messageId, text);
    return msg;
};

export const deleteTeacherMessage = async (messageId: string): Promise<{ success: boolean }> => {
    const res = dbMock.dbDeleteTeacherMessage(messageId);
    if (res.success) {
        await syncDeleteTeacherMessageFromFirestore(messageId);
    }
    return res;
};

// --- STUDENT COURSE GROUP CHATS ---
export const fetchCourseGroupConversations = async (studentId: string): Promise<CourseGroupConversation[]> => {
    await apiDelay(200);
    return dbMock.dbFetchCourseGroupConversations(studentId);
};

export const fetchCourseGroupMessages = async (courseId: string): Promise<CourseGroupMessage[]> => {
    return dbMock.dbFetchCourseGroupMessages(courseId);
};

export const markCourseGroupAsRead = async (courseId: string, userId: string): Promise<{ success: boolean }> => {
    return dbMock.dbMarkCourseGroupAsRead(courseId, userId);
};

export const sendCourseGroupMessage = async (messageData: { courseId: string; senderId: string; text: string; attachments?: Attachment[] }): Promise<CourseGroupMessage> => {
    const msg = dbMock.dbSendCourseGroupMessage(messageData);
    syncSendCourseGroupMessageToFirestore(msg).catch(console.error);
    return msg;
};

export const fetchClassmatesOfSameLevel = async (studentId: string): Promise<(StudentFriend & { isConnected: boolean; courseNames: string[] })[]> => {
    await apiDelay(150);
    return dbMock.dbFetchClassmatesOfSameLevel(studentId);
};

export const updateStudentNotes = async (studentId: string, notes: string): Promise<StudentUser> => {
    await apiDelay(100);
    const user = dbMock.dbUpdateStudentNotes(studentId, notes);
    await syncUpdateStudentNotesToFirestore(studentId, notes);
    return user;
};

export const updateStudentCredits = async (studentId: string, credits: number): Promise<StudentUser> => {
    await apiDelay(100);
    const user = dbMock.dbUpdateStudentCredits(studentId, credits);
    if (user) await syncUserToFirestore(user, 'student');
    return user;
};


// --- AI INTEGRATIONS ---
export const getTutorResponse = geminiService.getStreamingResponse;
export const summarizeTopicWithAI = (title: string, desc: string) => dbMock.summarizeTopicWithAI(title, desc);
export const searchYouTubeVideosWithAI = (query: string) => dbMock.searchYouTubeVideosWithAI(query);
export const searchVideosWithAI = (query: string, allVideos: any[]) => dbMock.searchVideosWithAI(query, allVideos);
export const generateStudyPlanWithAIStream = (event: ExamEvent, videos: Video[]) => dbMock.generateStudyPlanWithAIStream(event, videos);
export const generateQuizWithAI = (topic: string) => dbMock.generateQuizWithAI(topic);
export const generatePracticeQuestionWithAI = (topic: string, difficulty: 'fácil' | 'medio' | 'difícil', levelId: string, subjectId: string) => dbMock.generatePracticeQuestionWithAI(topic, difficulty, levelId, subjectId);
export const generatePracticeAnswerWithAI = (question: string, topic: string, levelId: string, subjectId: string) => dbMock.generatePracticeAnswerWithAI(question, topic, levelId, subjectId);
export const generateReinforcementPlanWithAI = (videoId: string, quizId: string, answer: StudentAnswer) => dbMock.generateReinforcementPlanWithAI(videoId, quizId, answer);

export const logAIQuery = async (studentId: string, queryText: string, responseText: string, category: string, vibe: string): Promise<AIQueryLog> => {
    const log = dbMock.dbLogAIQuery(studentId, queryText, responseText, category, vibe);
    syncAIQueryLogToFirestore(log).catch(console.error);
    return log;
};

export const fetchAIQueries = async (): Promise<AIQueryLog[]> => {
    return dbMock.dbFetchAIQueries();
};

export const sendWhatsApp = async (data: {
    to: string;
    message: string;
    whatsappMode?: 'direct' | 'twilio' | 'meta' | 'evolution' | 'firebase_queue' | 'greenapi';
    twilioAccountSid?: string;
    twilioAuthToken?: string;
    twilioWhatsappFrom?: string;
    metaPhoneNumberId?: string;
    metaAccessToken?: string;
    evolutionInstanceUrl?: string;
    evolutionApiKey?: string;
    greenapiIdInstance?: string;
    greenapiApiTokenInstance?: string;
    greenapiApiUrl?: string;
}): Promise<{ success: boolean; simulated?: boolean; message?: string; sid?: string; error?: string }> => {
    try {
        const idToken = auth?.currentUser ? await auth.currentUser.getIdToken().catch(() => null) : null;
        const headers: Record<string, string> = {
            'Content-Type': 'application/json'
        };
        if (idToken) {
            headers['Authorization'] = `Bearer ${idToken}`;
        }

        const response = await fetch('/api/send-whatsapp', {
            method: 'POST',
            headers,
            body: JSON.stringify(data)
        });
        const res = await response.json();
        return res;
    } catch (err: any) {
        return { success: false, message: err.message || 'Error al conectar con el servidor', error: err.message };
    }
};

