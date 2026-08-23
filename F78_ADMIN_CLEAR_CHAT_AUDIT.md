# F78 — AUDITORÍA DE "LIMPIAR CHAT" DEL ADMINISTRADOR

**Proyecto:** AulaInfinity  
**Fase:** F78 — Auditoría Forense de Fechas y Limpieza (Zero Write / Zero Change)  

---

## 1. OBJETIVO
Determinar si el panel de administración (`AdminChatPage.tsx`) o cualquier otro componente dispone de una función o botón para "Limpiar chat" / vaciar una conversación completa de manera masiva.

---

## 2. HALLAZGOS

### A. Interfaz de Usuario (UI)
- **ADMIN CLEAR CHAT UI: NOT IMPLEMENTED**
- Tras auditar exhaustivamente `AdminChatPage.tsx`, no existe ningún botón, opción de menú, diálogo modal ni acción rotulada como "Limpiar chat", "Vaciar chat", "Borrar todos los mensajes" o "Purge".
- El administrador únicamente cuenta con acciones de borrado **individual** por cada mensaje mediante el icono de papelera (`TrashIcon`), el cual invoca `deleteMessage(messageId)`.

### B. Funcionalidad de Backend / Servicio
- No existe ninguna función RPC, endpoint Express ni método en `api.ts` o `firestoreSync.ts` que ejecute el borrado masivo de una subcolección de mensajes de chat (`/chats/{courseId}/messages`).

---

## 3. CONCLUSIÓN
El administrador **no dispone** actualmente de una utilidad automatizada de borrado masivo o vaciado completo de chats. Toda moderación de mensajes en canales de grupo o directos se realiza mensaje por mensaje.
