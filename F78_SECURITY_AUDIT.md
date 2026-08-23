# F78 — AUDITORÍA DE SEGURIDAD (FIRESTORE RULES)

**Proyecto:** AulaInfinity  
**Fase:** F78 — Auditoría Forense de Fechas y Limpieza (Zero Write / Zero Change)  

---

## 1. OBJETIVO
Auditar las reglas de seguridad (`firestore.rules`) relativas al acceso y borrado de mensajes en los chats de grupos de estudio y canales de comunicación.

---

## 2. MATRIZ DE PERMISOS SOBRE MENSAJES DE CHAT (`/chats/{chatId}/messages/{messageId}`)

| Operación | Actor | Condición en Security Rules | Resultado |
|---|---|---|---|
| **READ** | Alumno matriculado / Profesor / Admin | `isChatParticipant()` | **ALLOW** |
| **CREATE** | Alumno matriculado / Profesor / Admin | `isChatParticipant() && request.resource.data.senderId == request.auth.uid` | **ALLOW** |
| **UPDATE** | Autor original del mensaje | `resource.data.senderId == request.auth.uid && request.resource.data.senderId == resource.data.senderId` | **ALLOW** |
| **UPDATE** | Alumno ajeno | No cumple condición de autoría | **DENY** |
| **DELETE** | Administrador (`role == 'admin'`) | `isAdmin() || resource.data.senderId == request.auth.uid` | **ALLOW** |
| **DELETE** | Autor original del mensaje | `isAdmin() || resource.data.senderId == request.auth.uid` | **ALLOW** |
| **DELETE** | Alumno ajeno (no autor, no admin) | `resource.data.senderId == request.auth.uid` (Falso) | **DENY** |
| **CLEAR CHAT** | Cualquier usuario (Masivo) | No existe ninguna regla ni función para borrado masivo por lotes (batch/transaction) sin control individual de documentos. | **DENY / N/A** |

---

## 3. CONCLUSIÓN
Las reglas de Firestore garantizan un control estricto de borrado individual (`delete`), permitiendo que solo el autor del mensaje o un administrador con Custom Claim `role == 'admin'` eliminen un mensaje. No existe vulnerabilidad de borrado masivo no autorizado.
