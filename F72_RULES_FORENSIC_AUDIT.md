# FASE F72 — AUDITORÍA FORENSE INTEGRAL PRE-DESPLIEGUE DE FIRESTORE SECURITY RULES
## PROYECTO: AulaInfinity
**Fecha de Ejecución**: 2026-08-23T02:17:00-07:00  
**Auditores**: Auditoría Automatizada de Seguridad & Arquitectura Full-Stack  
**Modo**: EXCLUSIVAMENTE AUDITORÍA (Sin modificaciones en reglas, sin despliegues)

---

## 1. INVENTARIO COMPLETO DE FUNCIONES HELPER (Líneas 6 - 117)

| Nombre de Función | Definición / Lógica | Parámetros | Fuentes de Datos | Evaluación de Seguridad |
| :--- | :--- | :--- | :--- | :--- |
| `isSignedIn()` | `request.auth != null` | Ninguno | `request.auth` | ✅ Seguro. Base de autenticación. |
| `isVerifiedUser()` | `isSignedIn() && request.auth.token.email_verified == true` | Ninguno | `request.auth.token` | ✅ Seguro. Requiere verificación de email criptográfica. |
| `isOwner(userId)` | `isSignedIn() && request.auth.uid == userId` | `userId` | `request.auth.uid` | ✅ Seguro. Comparación estricta de UID. |
| `isAdmin()` | `isVerifiedUser() && request.auth.token.role == 'admin'` | Ninguno | Token Custom Claims | ✅ Seguro. Sin bypass por email ni localStorage. |
| `isTeacher()` | `isVerifiedUser() && (role == 'teacher' \|\| role == 'admin')` | Ninguno | Token Custom Claims | ✅ Seguro. |
| `isApprovedTeacher()` | `isVerifiedUser() && (role == 'admin' \|\| (role == 'teacher' && isApprovedForTutoring == true))` | Ninguno | Token Custom Claims | ✅ Seguro. Exige claim booleano verificado. |
| `isParticipant(data)` | Valida presencia de `request.auth.uid` en `participants`, `participantIds`, `studentId`, `teacherId`, `createdBy`, `senderId`, `recipientId`, `userId` | `data` (map) | `resource.data` / `request.resource.data` | ✅ Seguro. Control de pertenencia multipropósito. |
| `isIdParticipant(id)` | Valida coincidencia o prefijo delimitado de `request.auth.uid` en el ID del documento | `id` (string) | Document ID | ✅ Seguro. Delimitado para llamadas y salas 1a1. |
| `isEnrolledInCourse(courseId)` | Consulta `users/$(uid).enrolledCourseIds` | `courseId` | `get()` a Firestore (`users`) | ✅ Seguro. Relación verificada en BD. |
| `isTeacherOfCourse(courseId)` | Consulta `users/$(uid).taughtCourseIds` / `coursesTaughtIds` / `levels` | `courseId` | `get()` a Firestore (`users`) | ✅ Seguro. Relación docente-curso verificada en BD. |
| `isDirectChatIdForUser(chatId)` | Regex anclada con `^` y `$`: `^direct_${uid}_[a-zA-Z0-9_-]+$` / `^direct_[a-zA-Z0-9_-]+_${uid}$` / `^${uid}_...` / `^..._${uid}$` | `chatId` | Document ID | ✅ Seguro. Delimitadores rígidos evitan colisiones de subcadenas. |
| `isPeerChatIdForUser(chatId)` | Regex anclada: `^peer_${uid}_[a-zA-Z0-9_-]+$` / `^peer_[a-zA-Z0-9_-]+_${uid}$` | `chatId` | Document ID | ✅ Seguro. Exclusivo para ambos participantes pares. |
| `isSupportChatForStudent(chatId)`| `role == 'student' && chatId == 'support_' + request.auth.uid` | `chatId` | Token Claim + Doc ID | ✅ Seguro. Estudiante solo accede a su propio soporte. |
| `isSupportChatId(chatId)` | `chatId.matches('^support_[a-zA-Z0-9_-]+$')` | `chatId` | Document ID | ✅ Seguro. Formato estandarizado. |
| `isSupportChatForApprovedTeacher(chatId)` | `isApprovedTeacher() && isSupportChatId(chatId)` | `chatId` | Token Claim + Doc ID | ✅ Seguro. Docente aprobado para atención de soporte. |
| `isTeacherCoordinationChat(chatId)` | `isApprovedTeacher() && (chatId == 'sala_profesores_coordinacion' \|\| chatId == 'teacher_' + request.auth.uid)` | `chatId` | Token Claim + Doc ID | ✅ Seguro Post-F71. Sin acceso cruzado a otros docentes. |

---

## 2. AUDITORÍA DETALLADA POR COLECCIÓN Y OPERACIÓN

### A. `/chats/{chatId}` y `/chats/{chatId}/messages/{messageId}`
- **GET / LIST (`/chats/{chatId}`)**: Exige `isChatParticipant()`. Solo participantes legítimos (por chatId canónico, curso verificado en BD o array `participants`) o administradores.
- **CREATE (`/chats/{chatId}`)**:
  - Exige `request.resource.data.createdBy == request.auth.uid`.
  - Exige que `chatId` sea canónico y pertenezca al usuario (`isDirectChatIdForUser`, `isPeerChatIdForUser`, etc.).
  - Si contiene `participants`, `request.auth.uid` debe estar presente en el array.
  - **Resultado Adversarial**: Un atacante A NO puede crear un chat `direct_B_C` ni `peer_B_C` porque fallan todas las cláusulas de ID (`DENY`).
- **UPDATE (`/chats/{chatId}`)**:
  - Exige pertenencia previa (`isChatParticipant()`).
  - Inmutabilidad estricta para no administradores: `participants`, `participantIds`, `type`, `chatId`, `createdBy`, `createdAt`.
  - **Resultado Adversarial**: Un participante A no puede añadir a C al array `[A, B]` ni alterar el `type` o `chatId` (`DENY`).
- **DELETE (`/chats/{chatId}`)**: Exclusivo para `isAdmin()` (`DENY` para todo usuario no admin).
- **CREATE (`/chats/{chatId}/messages/{messageId}`)**:
  - Exige `request.resource.data.senderId == request.auth.uid`.
  - Exige que el `chatId` pertenezca al usuario.
  - **Resultado Adversarial**: Inyección de `senderId` falso resulta en `DENY`.
- **UPDATE (`/chats/{chatId}/messages/{messageId}`)**:
  - Exige `resource.data.senderId == request.auth.uid`.
  - Inmutabilidad estricta de `senderId`, `chatId`, `timestamp`, `senderRole`, `type`.
  - **Resultado Adversarial**: Modificar mensajes de otros usuarios o falsificar autoría resulta en `DENY`.
- **DELETE (`/chats/{chatId}/messages/{messageId}`)**:
  - Exige autoría original (`resource.data.senderId == request.auth.uid`) o ser `isAdmin()`.

---

### B. WebRTC: `/chats/{chatId}/signal/**`, `/rooms/{roomId}`, `/calls/{callId}`, `/voice_group_calls/{callId}`
- **`/chats/{chatId}/signal/**`**: Delega directamente en `isChatParticipant()`. Completamente aislado.
- **`/rooms/{roomId}`**:
  - CREATE exige ser `callerUid == request.auth.uid` o estar en `participants`.
  - UPDATE exige `isRoomParticipant()` y garantiza inmutabilidad de `callerUid`, `roomId`, `courseId`, `createdBy`, `createdAt`.
- **`/calls/{callId}`**: Limitado a `callerUid` / `calleeUid` / `isIdParticipant(callId)`.
- **`/voice_group_calls/{callId}`**: Exige matrícula o docencia verificada en el curso (`isEnrolledInCourse` / `isTeacherOfCourse`).

---

### C. Pizarras Digitales: `/whiteboards/{whiteboardId}` y `/whiteboardCursors/{cursorId}`
- **`/whiteboards/{whiteboardId}`**:
  - UPDATE exige pertenencia y protege inmutabilidad de `whiteboardId`, `courseId`, `studentId`, `teacherId`, `tutoringRequestId`, `type`, `participants`, `createdBy`, `createdAt`.
  - Subcolecciones `/strokes` y `/documents` heredan `isWhiteboardParticipant()`.
- **`/whiteboardCursors/{cursorId}`**:
  - CREATE y UPDATE exigen `isIdParticipant(cursorId)` y `userId == request.auth.uid`.

---

### D. Colecciones de Usuarios y Prevención de Escalada Vertical
- **`/users/{userId}` y `/firestore_users/{userId}`**:
  - CREATE: Solo permite auto-registro con `role == 'student'`, `isAdmin == false`, `isApprovedForTutoring == false`.
  - UPDATE: El usuario no puede modificar su `role`, `isAdmin` ni `isApprovedForTutoring` (inmutabilidad estricta contra `resource.data`).
  - **Resultado Adversarial**: Intentos de auto-asignarse rol docente o administrador por cliente resultan en `DENY`.

---

### E. Colecciones Legacy Post-F71
- **`/firestore_direct_messages/{msgId}`**: Sin `isApprovedTeacher()`. Solo participantes o admin.
- **`/firestore_peer_conversations/{convId}` & `/firestore_peer_messages/{msgId}`**: Aislados exclusivamente a los pares mediante `isPeerChatIdForUser` o array `participants`. Docentes no autorizados reciben `DENY`.
- **`/firestore_teacher_conversations/{convId}` & `/firestore_teacher_messages/{msgId}`**: Restringidos a `sala_profesores_coordinacion` y al propio `teacher_${uid}`.
- **`match /{document=**}`**: Fallback final Default Deny (`allow read, write: if isAdmin()`).

---

## 3. RESUMEN DE HALLAZGOS Y EVALUACIÓN FINAL

- **CRITICAL**: **0**
- **HIGH**: **0**
- **MEDIUM**: **0**
- **LOW**: **0**

Las reglas implementan el principio de mínimo privilegio, anclajes estrictos en expresiones regulares, validación de pertenencia cruzada con BD Firestore para cursos y aislamiento absoluto de canales 1a1, pares y grupales.
