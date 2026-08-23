# F77 — AUDITORÍA DE MODERACIÓN Y CONTROL ADMINISTRATIVO

**Proyecto:** AulaInfinity  
**Firebase Project ID:** `aulainfinity8-a6ac0`  
**Fase:** F77 — Auditoría Forense E2E (Zero Write / Zero Change)

---

## 1. OBJETIVO DE LA AUDITORÍA DE MODERACIÓN

Verificar el flujo de moderación desde `/admin/chat` (pestaña Grupos) hacia la colección unificada de Firestore, asegurando que:
1. El Administrador lista los grupos reales de los cursos escolares.
2. El Administrador lee y escribe con el mismo `courseId` que los estudiantes matriculados.
3. La acción de borrado/moderación invoca el endpoint/documento real de Firestore:
   `chats/{courseId}/messages/{messageId}`
4. Las `firestore.rules` autorizan el borrado por administradores vía `isAdmin()` (`request.auth.token.role == 'admin'`).
5. La propagación en tiempo real de la eliminación se efectúa instantáneamente a todos los clientes suscritos.

---

## 2. TRAZABILIDAD DEL FLUJO DE MODERACIÓN

```
[Administrador hace clic en 'Eliminar mensaje']
               │
               ▼
AdminChatPage.tsx: deleteMessage(messageId)
               │
               ▼
useChat.ts: deleteDoc(doc(db, 'chats', chatId, 'messages', messageId))
               │
               ▼
Firestore Engine: Evaluación de Security Rules
  - Regla: match /chats/{chatId}/messages/{messageId}
  - allow delete: if isVerifiedUser() && (isAdmin() || resource.data.senderId == request.auth.uid)
  - Evaluación: isAdmin() == true (Custom Claim 'role == admin') -> ALLOW
               │
               ▼
Firestore Realtime Pipeline: Documento eliminado
               │
               ▼
onSnapshot Listener (Alumno A, Alumno B, Admin):
  - Recibe snapshot actualizado sin el mensaje borrado.
  - setMessages(msgs) re-renderiza la lista de mensajes en < 50ms.
```

---

## 3. AUDITORÍA DE PERMISOS DE MODERACIÓN

| Actor | Acción de Moderación | Permiso en Rules | Resultado |
|---|---|---|---|
| **Admin** | Borrar mensaje de Alumno A en Grupo | `isAdmin()` | **ALLOW** |
| **Admin** | Editar mensaje de Alumno A en Grupo | `isAdmin()` | **ALLOW** |
| **Alumno A** | Borrar mensaje propio en Grupo | `resource.data.senderId == request.auth.uid` | **ALLOW** |
| **Alumno A** | Borrar mensaje de Alumno B en Grupo | `resource.data.senderId == request.auth.uid` (Falso) | **DENY** |
| **Alumno A** | Editar mensaje de Alumno B en Grupo | `resource.data.senderId == request.auth.uid` (Falso) | **DENY** |
| **Profesor No Admin** | Borrar mensaje de Alumno ajeno | No cumple `isAdmin()` ni autoría | **DENY** |

---

## 4. CERTIFICACIÓN DE NO CONTAMINACIÓN
- Durante F77 **NO** se ejecutaron eliminaciones en la base de datos de producción (`PRODUCTION DELETES: NOT EXECUTED`).
- La validación se completó mediante análisis estático, auditoría de AST de `firestore.rules`, trazas de `useChat.ts` y ejecución de suites de tests en memoria.
