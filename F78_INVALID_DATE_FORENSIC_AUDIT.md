# F78 — AUDITORÍA FORENSE DEL "INVALID DATE"

**Proyecto:** AulaInfinity  
**Fase:** F78 — Auditoría Forense de Fechas y Limpieza (Zero Write / Zero Change)  

---

## 1. DESCRIPCIÓN DEL PROBLEMA A ("Invalid Date")
Debajo de algunos mensajes escritos por estudiantes en los chats de grupos de estudio o directos aparece la etiqueta textual `Invalid Date`. 

---

## 2. TRAZABILIDAD Y CAUSA RAÍZ

### A. Archivos y Funciones Involucradas
1. **Escritura en Firestore (`useChat.ts` / `firestoreSync.ts`):**
   - Los mensajes se envían utilizando `serverTimestamp()` de Firestore (`createdAt: serverTimestamp()`) o bien utilizando una cadena ISO (`timestamp: new Date().toISOString()`) según el origen (mensajes legacy vs mensajes nuevos en tiempo real).
2. **Lectura y Transformación en Cliente (`useChat.ts`):**
   - Los snapshots en tiempo real (`onSnapshot`) devuelven objetos donde el campo de fecha (`timestamp` o `createdAt`) puede ser:
     - Un objeto Firestore `Timestamp` (que contiene los métodos `.toDate()`, `.toMillis()`, y las propiedades `.seconds`, `.nanoseconds`).
     - Una cadena ISO (`string`).
     - Un número (`number` epoch millis).
     - `null` o `undefined` (durante la compensación de latencia o si el campo no está presente en documentos legacy).
3. **Renderizado en UI (`StudentChatPage.tsx` / `AdminChatPage.tsx` / `ChatRoom.tsx`):**
   - En varios componentes de renderizado de mensajes se invoca directamente:
     `new Date(message.timestamp)` o `new Date(message.createdAt)` sin comprobar si el valor es un objeto Firestore `Timestamp`, `null`, `undefined` o una fecha inválida.

### B. Análisis de Tipos
- **Tipo Esperado por la UI:** `string` (ISO format) o `number` (Epoch millis) apto para ser parseado por `new Date()`.
- **Tipo Recibido de Firestore:** Objeto `Timestamp` (cuando proviene de `serverTimestamp()`), `null`, `undefined`, o `string`.
- **Conversión Errónea:** Cuando `message.timestamp` es un objeto Firestore `Timestamp` (ej. `{ seconds: 1724410000, nanoseconds: 500000000 }`), pasar este objeto directamente al constructor `new Date({ seconds: ... })` produce un objeto de fecha inválida en JavaScript (`Invalid Date`). De igual forma, si es `undefined`, `new Date(undefined)` produce `Invalid Date`.

---

## 3. RESUMEN TÉCNICO

| Atributo | Detalle |
|---|---|
| **Archivo Principal** | `src/components/StudentChatPage.tsx`, `src/components/admin/AdminChatPage.tsx`, `src/components/chat/ChatRoom.tsx` |
| **Campo Afectado** | `timestamp` / `createdAt` |
| **Tipo Recibido** | Objeto Firestore `Timestamp` o `undefined`/`null` |
| **Tipo Esperado** | `string` / `number` / `Date` |
| **Causa Raíz** | Incompatibilidad al pasar objetos `Timestamp` nativos de Firestore directamente a `new Date()` sin normalizar mediante `.toDate()` o `.toMillis()`. |
