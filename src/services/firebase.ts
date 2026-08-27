import { initializeApp, getApps } from "firebase/app";
import { 
  initializeFirestore, 
  enableNetwork, 
  doc, 
  getDocFromServer, 
  setDoc, 
  addDoc, 
  updateDoc, 
  deleteDoc,
  enableMultiTabIndexedDbPersistence
} from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { getFunctions } from "firebase/functions";
import { getStorage } from "firebase/storage";

// Safe import for firebase-applet-config.json in case file is absent or re-created
const metaGlob = (import.meta as unknown as { glob?: (pattern: string, opts?: { eager: boolean }) => Record<string, unknown> }).glob;
const configFiles = typeof metaGlob === 'function' 
  ? {
      ...metaGlob('/firebase-applet-config.json', { eager: true }),
      ...metaGlob('../../firebase-applet-config.json', { eager: true })
    } 
  : {};

const matchedConfigFile = Object.values(configFiles)[0] as { default?: Record<string, string> } | Record<string, string> | undefined;
const firebaseConfigJson = ((matchedConfigFile as { default?: Record<string, string> })?.default || matchedConfigFile || {}) as Record<string, string | undefined>;

// Clean environment variables
const importMetaEnv = ((typeof import.meta !== 'undefined' && import.meta.env) ? import.meta.env : {}) as Record<string, string | undefined>;
const envApiKey = (importMetaEnv.VITE_FIREBASE_API_KEY)?.trim();
const envAuthDomain = (importMetaEnv.VITE_FIREBASE_AUTH_DOMAIN)?.trim();
const envProjectId = (importMetaEnv.VITE_FIREBASE_PROJECT_ID)?.trim();
const envStorageBucket = (importMetaEnv.VITE_FIREBASE_STORAGE_BUCKET)?.trim();
const envMessagingSenderId = (importMetaEnv.VITE_FIREBASE_MESSAGING_SENDER_ID)?.trim();
const envAppId = (importMetaEnv.VITE_FIREBASE_APP_ID)?.trim();
const envDbId = (importMetaEnv.VITE_FIREBASE_DATABASE_ID)?.trim();

// Database ID para la instancia de Firestore
const FIXED_DATABASE_ID = "ai-studio-aulainfinity-6be7791f-ef3e-4fc4-b45b-98918b1b57ca";
const rawDbId = envDbId || firebaseConfigJson.firestoreDatabaseId || firebaseConfigJson.databaseId;
const databaseId = (rawDbId && rawDbId !== "(default)") ? rawDbId : FIXED_DATABASE_ID;

// --- Configuración de Firebase ---
const firebaseConfig = {
  apiKey: envApiKey || firebaseConfigJson.apiKey || "",
  authDomain: envAuthDomain || firebaseConfigJson.authDomain || "",
  projectId: envProjectId || firebaseConfigJson.projectId || "",
  storageBucket: envStorageBucket || firebaseConfigJson.storageBucket || "",
  messagingSenderId: envMessagingSenderId || firebaseConfigJson.messagingSenderId || "",
  appId: envAppId || firebaseConfigJson.appId || "",
};

// Inicializa Firebase
const app = initializeApp(firebaseConfig);
const apps = getApps();
console.log(`[AUTH DEBUG] Firebase Apps count: ${apps.length}`);
apps.forEach((a, i) => {
  console.log(`[AUTH DEBUG] App ${i} name: ${a.name}, projectId: ${a.options.projectId}`);
});

console.log('[FB_TRANSPORT_CONFIG]', {
  experimentalAutoDetectLongPolling: true,
  forceLongPolling: false,
  transport: 'experimentalAutoDetectLongPolling',
  timestamp: Date.now()
});

// Inicializa Firestore con auto-detección de Long Polling para proxies y entornos sandbox
const firestoreSettings = {
  experimentalAutoDetectLongPolling: true,
};

export const db = databaseId 
  ? initializeFirestore(app, firestoreSettings, databaseId)
  : initializeFirestore(app, firestoreSettings);

export const auth = getAuth(app);
export const functions = getFunctions(app, 'europe-west1');
export const storage = getStorage(app);
storage.maxUploadRetryTime = 20000;
storage.maxOperationRetryTime = 20000;

// --- Sistema de Logging exclusivo para Administradores ---
export function checkIsAdminUser(): boolean {
  try {
    const localUser = localStorage.getItem('aulainfinity_user');
    if (localUser) {
      const parsed = JSON.parse(localUser);
      if (parsed.role === 'admin') return true;
    }
  } catch {
    // Ignorar errores de parseo
  }
  return false;
}

export function logAdminEvent(level: 'info' | 'warn' | 'error', message: string, details?: unknown) {
  if (!checkIsAdminUser()) return;
  const time = new Date().toLocaleTimeString();
  const prefix = `[Firebase Admin Log ${time}]`;
  if (details !== undefined) {
    console[level](prefix, message, details);
  } else {
    console[level](prefix, message);
  }
}

// Log inicial de configuración Firebase para Administradores
logAdminEvent('info', 'Inicializando Firebase App', {
  projectId: firebaseConfig.projectId,
  databaseId,
  hasApiKey: Boolean(firebaseConfig.apiKey)
});

if (typeof window !== 'undefined') {
  enableMultiTabIndexedDbPersistence(db)
    .then(() => logAdminEvent('info', '📦 Persistencia offline multidestello habilitada en Firestore'))
    .catch((err) => {
      if (err.code === 'failed-precondition') {
        logAdminEvent('warn', '⚠️ Persistencia offline de Firestore falló por precondición (multi-tab):', err);
      } else if (err.code === 'unimplemented') {
        logAdminEvent('warn', '⚠️ El navegador actual no soporta persistencia offline de Firestore:', err);
      } else {
        logAdminEvent('warn', '⚠️ Error habilitando persistencia offline:', err);
      }
    });
}

import { getF11045Meta } from '../utils/f11045';

// Escuchadores de estado de red y autenticación para diagnóstico Admin
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    console.log(`[F110.45] FIRESTORE_ONLINE | ${getF11045Meta()}`);
    console.log(`[F110.30] [CHAT_SYNC_TRACE] [TRANSPORT_RECONNECT] | timestamp: ${performance.now()} | status: online`);
    logAdminEvent('info', '🌐 Red del navegador restablecida (Online)');
  });
  window.addEventListener('offline', () => {
    console.log(`[F110.45] FIRESTORE_OFFLINE | ${getF11045Meta()}`);
    console.log(`[F110.30] [CHAT_SYNC_TRACE] [TRANSPORT_OFFLINE] | timestamp: ${performance.now()} | status: offline`);
    logAdminEvent('warn', '⚠️ Red del navegador perdida (Offline)');
  });
}

enableNetwork(db)
  .then(() => logAdminEvent('info', '📡 Conexión a red de Firestore habilitada'))
  .catch((e) => logAdminEvent('error', 'Error habilitando red en Firestore:', e));

// --- Diagnósticos y Manejo de Errores Críticos (MANDATORIO) ---
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  logAdminEvent('error', `🔥 Firestore Error [${operationType}] en ${path || 'desconocido'}:`, errInfo);
  console.error('Firestore Error Details:', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Validar la conexión con el servidor de Firestore
async function testFirestoreConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    logAdminEvent('info', '✅ Conexión establecida correctamente con Firestore DB:', { databaseId, projectId: firebaseConfig.projectId });
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      logAdminEvent('error', '🚨 Firestore reporta estado Offline. Verifique conexión.', { databaseId, error: error.message });
    } else {
      logAdminEvent('info', 'ℹ️ Verificación de conexión con Firestore completada:', { databaseId, error: error instanceof Error ? error.message : String(error) });
    }
  }
}
testFirestoreConnection();



