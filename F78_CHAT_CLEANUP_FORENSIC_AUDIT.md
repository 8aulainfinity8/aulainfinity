# F78 — AUDITORÍA FORENSE DE LIMPIEZA DE CHATS

**Proyecto:** AulaInfinity  
**Fase:** F78 — Auditoría Forense de Fechas y Limpieza (Zero Write / Zero Change)  

---

## 1. OBJETIVO
Determinar si AulaInfinity dispone de algún sistema de limpieza automática de mensajes o chats, así como verificar la existencia de funciones o código backend de purga o borrado masivo.

---

## 2. HALLAZGOS DE LA BÚSQUEDA EXHAUSTIVA

### A. Sistema de Limpieza Automática / Cron / Scheduled Functions
- **Resultado:** **NO EXISTE** ningún sistema de limpieza automática (`cleanup`, `retention`, `cron`, `onSchedule`, Cloud Scheduler, ni políticas TTL en Firestore).
- **Evidencia:** 
  - La búsqueda recursiva en el repositorio (`src/`, `functions/`, `firebase.json`) de términos como `cleanup`, `cleanUp`, `purge`, `prune`, `retention`, `expire`, `ttl`, `onSchedule`, etc., no arrojó ninguna función programada en Cloud Functions ni scripts de borrado periódico de mensajes de chat.
  - Las únicas funciones en `functions/index.ts` corresponden exclusivamente a la sincronización de Custom Claims para la autenticación y roles de usuario (`syncUserRole`).

### B. Firestore TTL
- **Resultado:** **NO EXISTE** ninguna política de borrado basado en TTL (Time-To-Live) configurada en Firestore para la colección `/chats/{chatId}/messages/{messageId}` ni para ninguna otra colección de la base de datos.

### C. Código Muerto o Funciones Parciales de Limpieza Masiva
- **Resultado:** **NO EXISTE** ninguna función del tipo `clearChat()`, `clearMessages()`, `deleteAllMessages()`, o `purgeMessages()` destinada a vaciar un canal de curso completo de forma masiva.
- **Evidencia:** El borrado de mensajes implementado actualmente en `useChat.ts` y `AdminChatPage.tsx` es estrictamente granular e individual (`deleteDoc(messageRef)` sobre un mensaje específico mediante su `messageId`), requiriendo privilegios de administrador (`isAdmin()`) o autoría propia (`senderId == auth.uid`).

---

## 3. CONCLUSIÓN
AulaInfinity **no cuenta** con ningún mecanismo automático de retención, caducidad o purga periódica de mensajes. Todos los mensajes permanecen en Firestore de manera indefinida a menos que sean eliminados manualmente de forma individual por su autor o por un administrador.
