import * as admin from 'firebase-admin';
import { FieldValue, Timestamp, Firestore, Transaction } from 'firebase-admin/firestore';

export interface WhatsappQueueItem {
  queueId: string;
  to: string;
  message: string;
  recipientRole: 'student' | 'teacher' | 'admin';
  sourceType: 'tutoring' | 'agenda' | 'manual_admin';
  sourceId: string;
  timeSlot?: string;
  status: 'pending' | 'processing' | 'sent' | 'retry' | 'failed';
  attemptCount: number;
  maxAttempts: number;
  lockedUntil?: Timestamp | null;
  processingBy?: string | null;
  providerMessageId?: string | null;
  errorCode?: string | null;
  lastError?: string | null;
  createdAt: FieldValue | Timestamp | string;
  updatedAt: FieldValue | Timestamp | string;
  nextAttemptAt?: Timestamp | null;
}

export interface WhatsappLogItem {
  queueId?: string;
  to: string;
  message: string;
  mode: string;
  success: boolean;
  sid: string;
  error?: string;
  errorCode?: string;
  timestamp: FieldValue | Timestamp | string;
  processedBy?: string;
}

export interface DispatchResult {
  success: boolean;
  sid?: string;
  simulated?: boolean;
  error?: string;
  errorCode?: string;
  isRetryable?: boolean;
  httpStatus?: number;
}

/**
 * Parsea con seguridad cualquier formato de fecha o Timestamp de Firestore a Date.
 */
export function parseSafeDate(val: any): Date | null {
  if (!val) return null;
  if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
  if (typeof val?.toDate === 'function') {
    try { return val.toDate(); } catch { return null; }
  }
  if (typeof val?.toMillis === 'function') {
    try { return new Date(val.toMillis()); } catch { return null; }
  }
  if (typeof val?.seconds === 'number') return new Date(val.seconds * 1000);
  if (typeof val?._seconds === 'number') return new Date(val._seconds * 1000);
  if (typeof val === 'string' || typeof val === 'number') {
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

/**
 * Generador de ID Determinista para trabajos de la cola de WhatsApp.
 * Garantiza idempotencia matemática en la creación de trabajos de recordatorio.
 */
export function generateDeterministicQueueId(
  sourceType: 'tutoring' | 'agenda' | 'manual_admin',
  sourceId: string,
  recipientRole: 'student' | 'teacher' | 'admin',
  timeSlot: string = '30min'
): string {
  const cleanSourceId = sourceId.replace(/[^a-zA-Z0-9_-]/g, '_');
  return `${sourceType}_${cleanSourceId}_${recipientRole}_${timeSlot}`;
}

/**
 * Clasifica un error HTTP o de proveedor en Reintentable (retryable) o Permanente (non-retryable).
 */
export function classifyError(httpStatus?: number, errorMessage: string = ''): { isRetryable: boolean; errorCode: string } {
  const msg = errorMessage.toLowerCase();

  // Errores permanentes: 400 Bad Request, 401 Unauthorized, 403 Forbidden, 404 Not Found (salvo URL alternativa)
  if (httpStatus === 400 || msg.includes('invalid phone') || msg.includes('número inválido') || msg.includes('bad request') || msg.includes('missing')) {
    return { isRetryable: false, errorCode: 'INVALID_ARGUMENT_OR_PHONE' };
  }
  if (httpStatus === 401 || httpStatus === 403 || msg.includes('unauthorized') || msg.includes('auth') || msg.includes('invalid credentials')) {
    return { isRetryable: false, errorCode: 'AUTHENTICATION_FAILED' };
  }

  // Errores temporales / reintentables: 429 Rate Limit, 500, 502, 503, 504, Timeouts, Red
  if (httpStatus === 429 || msg.includes('rate limit') || msg.includes('too many requests')) {
    return { isRetryable: true, errorCode: 'RATE_LIMIT_EXCEEDED' };
  }
  if ((httpStatus && httpStatus >= 500) || msg.includes('timeout') || msg.includes('econnrefused') || msg.includes('network error') || msg.includes('fetch failed')) {
    return { isRetryable: true, errorCode: 'PROVIDER_TEMPORARY_OUTAGE' };
  }

  // Por defecto, si falló sin código específico, reintentar hasta el máximo
  return { isRetryable: true, errorCode: 'DISPATCH_ERROR' };
}

/**
 * Despacha un mensaje de WhatsApp a través del proveedor configurado o simulación segura.
 */
export async function dispatchWhatsappMessage(
  item: { to: string; message: string },
  config?: any
): Promise<DispatchResult> {
  const { to, message } = item;
  if (!to || !message) {
    return {
      success: false,
      isRetryable: false,
      errorCode: 'MISSING_RECIPIENT_OR_MESSAGE',
      error: "Missing 'to' or 'message' field."
    };
  }

  const mode = config?.whatsappMode || 'twilio';

  // 1. META CLOUD API
  if (mode === 'meta') {
    const phoneNumberId = config?.metaPhoneNumberId || process.env.META_PHONE_NUMBER_ID;
    const accessToken = config?.metaAccessToken || process.env.META_ACCESS_TOKEN;

    if (!phoneNumberId || !accessToken) {
      return {
        success: true,
        simulated: true,
        sid: `sim_meta_${Date.now()}`
      };
    }

    const cleanPhone = to.replace(/[^0-9]/g, '');
    const url = `https://graph.facebook.com/v19.0/${phoneNumberId}/messages`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: cleanPhone,
          type: 'text',
          text: { body: message }
        })
      });

      const data = await response.json() as any;
      if (response.ok) {
        return {
          success: true,
          sid: data.messages?.[0]?.id || `meta_${Date.now()}`
        };
      }

      const { isRetryable, errorCode } = classifyError(response.status, data.error?.message || '');
      return {
        success: false,
        httpStatus: response.status,
        isRetryable,
        errorCode,
        error: data.error?.message || 'Meta Cloud API error'
      };
    } catch (err: any) {
      const { isRetryable, errorCode } = classifyError(undefined, err.message);
      return {
        success: false,
        isRetryable,
        errorCode,
        error: err.message || 'Network exception in Meta API'
      };
    }
  }

  // 2. EVOLUTION API / QR
  if (mode === 'evolution') {
    const instanceUrl = (config?.evolutionInstanceUrl || process.env.EVOLUTION_INSTANCE_URL || '').trim();
    const apiKey = (config?.evolutionApiKey || process.env.EVOLUTION_API_KEY || '').trim();

    if (!instanceUrl || !apiKey) {
      return {
        success: true,
        simulated: true,
        sid: `sim_evolution_${Date.now()}`
      };
    }

    const cleanPhone = to.replace(/[^0-9]/g, '');
    const formattedChatId = cleanPhone.includes('@') ? cleanPhone : `${cleanPhone}@c.us`;

    try {
      const response = await fetch(instanceUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': apiKey,
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          number: cleanPhone,
          chatId: formattedChatId,
          text: message,
          message: message
        })
      });

      const resText = await response.text();
      let data: any = {};
      try { data = JSON.parse(resText); } catch { data = { rawText: resText }; }

      if (response.ok && !data.error) {
        return {
          success: true,
          sid: data.key?.id || data.id || `evolution_${Date.now()}`
        };
      }

      const { isRetryable, errorCode } = classifyError(response.status, data.error || data.message || '');
      return {
        success: false,
        httpStatus: response.status,
        isRetryable,
        errorCode,
        error: data.error || data.message || `Evolution API error (${response.status})`
      };
    } catch (err: any) {
      const { isRetryable, errorCode } = classifyError(undefined, err.message);
      return {
        success: false,
        isRetryable,
        errorCode,
        error: err.message || 'Network exception in Evolution API'
      };
    }
  }

  // 3. TWILIO (o modo directo por defecto)
  if (mode === 'twilio' || mode === 'direct') {
    const accountSid = config?.twilioAccountSid || process.env.TWILIO_ACCOUNT_SID;
    const authToken = config?.twilioAuthToken || process.env.TWILIO_AUTH_TOKEN;
    const fromNumber = config?.twilioWhatsappFrom || process.env.TWILIO_WHATSAPP_FROM;

    if (!accountSid || !authToken || !fromNumber) {
      return {
        success: true,
        simulated: true,
        sid: `sim_twilio_${Date.now()}`
      };
    }

    const formattedFrom = fromNumber.startsWith('whatsapp:') ? fromNumber : `whatsapp:${fromNumber}`;
    const formattedTo = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`;
    const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
    const authString = Buffer.from(`${accountSid}:${authToken}`).toString('base64');

    const params = new URLSearchParams();
    params.append('From', formattedFrom);
    params.append('To', formattedTo);
    params.append('Body', message);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${authString}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: params.toString()
      });

      const data = await response.json() as any;
      if (response.ok) {
        return {
          success: true,
          sid: data.sid || `twilio_${Date.now()}`
        };
      }

      const { isRetryable, errorCode } = classifyError(response.status, data.message || '');
      return {
        success: false,
        httpStatus: response.status,
        isRetryable,
        errorCode,
        error: data.message || 'Twilio API error'
      };
    } catch (err: any) {
      const { isRetryable, errorCode } = classifyError(undefined, err.message);
      return {
        success: false,
        isRetryable,
        errorCode,
        error: err.message || 'Network exception in Twilio API'
      };
    }
  }

  // 4. GREEN API
  if (mode === 'greenapi') {
    const idInstance = config?.greenapiIdInstance || process.env.GREENAPI_ID_INSTANCE;
    const apiTokenInstance = config?.greenapiApiTokenInstance || process.env.GREENAPI_API_TOKEN_INSTANCE;
    const baseUrl = (config?.greenapiApiUrl || process.env.GREENAPI_API_URL || 'https://api.green-api.com').replace(/\/$/, '');

    if (!idInstance || !apiTokenInstance) {
      return {
        success: true,
        simulated: true,
        sid: `sim_greenapi_${Date.now()}`
      };
    }

    const cleanPhone = to.replace(/[^0-9]/g, '');
    const formattedChatId = cleanPhone.includes('@') ? cleanPhone : `${cleanPhone}@c.us`;
    const url = `${baseUrl}/waInstance${idInstance}/sendMessage/${apiTokenInstance}`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId: formattedChatId, message })
      });

      const data = await response.json() as any;
      if (response.ok && data.idMessage) {
        return {
          success: true,
          sid: data.idMessage
        };
      }

      const { isRetryable, errorCode } = classifyError(response.status, data.message || '');
      return {
        success: false,
        httpStatus: response.status,
        isRetryable,
        errorCode,
        error: data.message || 'Green API error'
      };
    } catch (err: any) {
      const { isRetryable, errorCode } = classifyError(undefined, err.message);
      return {
        success: false,
        isRetryable,
        errorCode,
        error: err.message || 'Network exception in Green API'
      };
    }
  }

  // Modo no reconocido
  return {
    success: true,
    simulated: true,
    sid: `sim_fallback_${Date.now()}`
  };
}

/**
 * Operación Atómica de Adquisición de Trabajo (Claim Lease).
 * Evita que dos workers procesen simultáneamente el mismo trabajo de la cola.
 */
export async function claimWhatsappQueueJob(
  firestore: Firestore,
  queueId: string,
  workerId: string,
  now: Date = new Date()
): Promise<{ claimed: boolean; reason?: string; item?: WhatsappQueueItem }> {
  const queueDocRef = firestore.collection('whatsapp_queue').doc(queueId);

  return await firestore.runTransaction(async (transaction: Transaction) => {
    const docSnap = await transaction.get(queueDocRef);
    if (!docSnap.exists) {
      return { claimed: false, reason: 'not_found' };
    }

    const data = docSnap.data() as WhatsappQueueItem;

    // 1. Si ya fue enviado, no volver a enviar jamás
    if (data.status === 'sent') {
      return { claimed: false, reason: 'already_sent', item: data };
    }

    // 2. Si falló permanentemente o superó reintentos
    const maxAttempts = data.maxAttempts || 3;
    if (data.status === 'failed' && (data.attemptCount || 0) >= maxAttempts) {
      return { claimed: false, reason: 'max_attempts_exceeded', item: data };
    }

    // 3. Si está en 'processing', verificar si el lock sigue vigente
    if (data.status === 'processing') {
      const lockedUntilDate = parseSafeDate(data.lockedUntil);
      if (lockedUntilDate && lockedUntilDate.getTime() > now.getTime()) {
        return {
          claimed: false,
          reason: 'already_locked',
          item: data
        };
      }
      // Lock expirado -> El worker previo falló/murió, se permite recuperar
    }

    // 4. Si está en 'retry', verificar si el backoff ya expiró
    if (data.status === 'retry') {
      const nextAttemptDate = parseSafeDate(data.nextAttemptAt);
      if (nextAttemptDate && nextAttemptDate.getTime() > now.getTime()) {
        return { claimed: false, reason: 'backoff_wait', item: data };
      }
    }

    // Adquisición exitosa del claim
    const newAttemptCount = (data.attemptCount || 0) + 1;
    const lockDurationMs = 5 * 60 * 1000; // 5 minutos de lock
    const newLockedUntil = Timestamp.fromMillis(now.getTime() + lockDurationMs);

    transaction.update(queueDocRef, {
      status: 'processing',
      processingBy: workerId,
      attemptCount: newAttemptCount,
      lockedUntil: newLockedUntil,
      updatedAt: FieldValue.serverTimestamp()
    });

    return {
      claimed: true,
      item: {
        ...data,
        status: 'processing',
        processingBy: workerId,
        attemptCount: newAttemptCount,
        lockedUntil: newLockedUntil
      }
    };
  });
}

/**
 * Procesa un trabajo reclamado: llama al proveedor y actualiza el estado y logs de forma segura.
 */
export async function executeWhatsappQueueJob(
  firestore: Firestore,
  item: WhatsappQueueItem,
  workerId: string,
  config?: any,
  dispatchFn = dispatchWhatsappMessage
): Promise<{ success: boolean; status: 'sent' | 'retry' | 'failed'; sid?: string; error?: string }> {
  const queueDocRef = firestore.collection('whatsapp_queue').doc(item.queueId);
  const now = new Date();

  try {
    const result = await dispatchFn({ to: item.to, message: item.message }, config);

    if (result.success) {
      // 1. Éxito: Marcar como sent y registrar log inmutable append-only
      await queueDocRef.update({
        status: 'sent',
        providerMessageId: result.sid || 'ok',
        lockedUntil: null,
        errorCode: null,
        lastError: null,
        updatedAt: FieldValue.serverTimestamp()
      });

      await firestore.collection('whatsapp_logs').add({
        queueId: item.queueId,
        to: item.to,
        message: item.message,
        mode: config?.whatsappMode || 'direct',
        success: true,
        sid: result.sid || '',
        timestamp: FieldValue.serverTimestamp(),
        processedBy: workerId
      });

      return { success: true, status: 'sent', sid: result.sid };
    } else {
      // 2. Error: Clasificar si es reintentable o permanente
      const maxAttempts = item.maxAttempts || 3;
      const attemptCount = item.attemptCount || 1;
      const isRetryable = result.isRetryable !== false && attemptCount < maxAttempts;

      if (isRetryable) {
        // Backoff exponencial: 2^attempt * 60s
        const backoffMs = Math.pow(2, attemptCount) * 60 * 1000;
        const nextAttemptAt = Timestamp.fromMillis(now.getTime() + backoffMs);
        const resolvedErrorCode = result.errorCode || 'DISPATCH_RETRYABLE_ERROR';

        await queueDocRef.update({
          status: 'retry',
          lockedUntil: null,
          errorCode: resolvedErrorCode,
          lastError: result.error || 'Error temporal',
          nextAttemptAt,
          updatedAt: FieldValue.serverTimestamp()
        });

        await firestore.collection('whatsapp_logs').add({
          queueId: item.queueId,
          to: item.to,
          message: item.message,
          mode: config?.whatsappMode || 'direct',
          success: false,
          sid: '',
          error: result.error || 'Error temporal (reintentando)',
          errorCode: resolvedErrorCode,
          timestamp: FieldValue.serverTimestamp(),
          processedBy: workerId
        });

        return { success: false, status: 'retry', error: result.error };
      } else {
        // Error permanente o superó reintentos
        const resolvedErrorCode = attemptCount >= maxAttempts
          ? 'MAX_RETRIES_EXCEEDED'
          : (result.errorCode || 'PERMANENT_ERROR');

        await queueDocRef.update({
          status: 'failed',
          lockedUntil: null,
          errorCode: resolvedErrorCode,
          lastError: result.error || 'Error no reintentable',
          updatedAt: FieldValue.serverTimestamp()
        });

        await firestore.collection('whatsapp_logs').add({
          queueId: item.queueId,
          to: item.to,
          message: item.message,
          mode: config?.whatsappMode || 'direct',
          success: false,
          sid: '',
          error: result.error || 'Error permanente',
          errorCode: resolvedErrorCode,
          timestamp: FieldValue.serverTimestamp(),
          processedBy: workerId
        });

        return { success: false, status: 'failed', error: result.error };
      }
    }
  } catch (fatalErr: any) {
    await queueDocRef.update({
      status: 'failed',
      lockedUntil: null,
      errorCode: 'UNCAUGHT_DISPATCH_EXCEPTION',
      lastError: fatalErr.message || 'Excepción no capturada',
      updatedAt: FieldValue.serverTimestamp()
    });

    await firestore.collection('whatsapp_logs').add({
      queueId: item.queueId,
      to: item.to,
      message: item.message,
      mode: config?.whatsappMode || 'direct',
      success: false,
      sid: '',
      error: fatalErr.message || 'Excepción no capturada en worker',
      errorCode: 'UNCAUGHT_DISPATCH_EXCEPTION',
      timestamp: FieldValue.serverTimestamp(),
      processedBy: workerId
    });

    return { success: false, status: 'failed', error: fatalErr.message };
  }
}

/**
 * Inserta de forma determinista un trabajo en whatsapp_queue evitando sobreescrituras.
 * Si el documento ya existe, no modifica estados existentes (sent, processing, retry).
 */
export async function enqueueWhatsappJobIdempotent(
  firestore: Firestore,
  jobData: {
    sourceType: 'tutoring' | 'agenda' | 'manual_admin';
    sourceId: string;
    recipientRole: 'student' | 'teacher' | 'admin';
    timeSlot?: string;
    to: string;
    message: string;
  }
): Promise<{ created: boolean; queueId: string; reason?: string }> {
  const queueId = generateDeterministicQueueId(
    jobData.sourceType,
    jobData.sourceId,
    jobData.recipientRole,
    jobData.timeSlot || '30min'
  );

  const docRef = firestore.collection('whatsapp_queue').doc(queueId);

  return await firestore.runTransaction(async (transaction: Transaction) => {
    const docSnap = await transaction.get(docRef);
    if (docSnap.exists) {
      return { created: false, queueId, reason: 'already_exists' };
    }

    const newJob: WhatsappQueueItem = {
      queueId,
      to: jobData.to,
      message: jobData.message,
      recipientRole: jobData.recipientRole,
      sourceType: jobData.sourceType,
      sourceId: jobData.sourceId,
      timeSlot: jobData.timeSlot || '30min',
      status: 'pending',
      attemptCount: 0,
      maxAttempts: 3,
      lockedUntil: null,
      processingBy: null,
      providerMessageId: null,
      errorCode: null,
      lastError: null,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      nextAttemptAt: null
    };

    transaction.set(docRef, newJob);
    return { created: true, queueId };
  });
}
