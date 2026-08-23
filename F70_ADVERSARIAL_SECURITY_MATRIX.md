# F70 — MATRIZ ADVERSARIAL DE SEGURIDAD Y VULNERABILIDADES (FIRESTORE SECURITY RULES)
## PROYECTO: AulaInfinity
## FASE: F70 — Auditoría Adversarial Final Post-F69
## FECHA: 2026-08-22
## METODOLOGÍA: Adversarial Red Team / Threat Modeling / Formal Security Rules Evaluation

---

### CONVENCIONES DE LA MATRIZ
- **ACTORES**:
  - `A`: Estudiante atacante (UID: `student_A`, role: `student`, verified)
  - `B`: Estudiante víctima / legítimo (UID: `student_B`, role: `student`, verified)
  - `C`: Estudiante tercero (UID: `student_C`, role: `student`, verified)
  - `T_AP`: Docente aprobado para tutorías (UID: `teacher_AP`, role: `teacher`, `isApprovedForTutoring: true`, verified)
  - `T_NOAP`: Docente NO aprobado (UID: `teacher_NOAP`, role: `teacher`, `isApprovedForTutoring: false`, verified)
  - `T_ASIG`: Docente asignado al curso/alumno (UID: `teacher_ASIG`, role: `teacher`, `isApprovedForTutoring: true`, verified)
  - `T_OTRO`: Docente no asignado (UID: `teacher_OTRO`, role: `teacher`, `isApprovedForTutoring: true`, verified)
  - `UNVER`: Usuario sin verificar (`email_verified: false`)
  - `ANON`: Usuario anónimo / no autenticado (`request.auth == null`)
  - `ADMIN`: Administrador institucional (`role: admin`, verified)

- **SEVERIDAD DE RIESGO**:
  - `CRITICAL`: Compromiso total de privacidad o control administrativo sin autorización.
  - `HIGH`: Escalada horizontal o acceso indebido a datos privados de terceros.
  - `MEDIUM`: Acceso a metadatos no críticos o creación de recursos huérfanos sin impacto en datos ajenos.
  - `LOW`: Inconsistencia menor de nombres o redundancia sintáctica sin riesgo de explotación.
  - `NONE`: Control de seguridad hermético y verificado.

---

| ID | ACTOR | RECURSO | OPERACIÓN | PAYLOAD / PARÁMETROS | CONDICIÓN EVALUADA | RESULTADO ACTUAL | RESULTADO ESPERADO | EVALUACIÓN | VULNERABILIDAD IDENTIFICADA | SEVERIDAD | JUSTIFICACIÓN TÉCNICA |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **TC-01** | `A` | `/chats/direct_student_A_student_B` | `get` | N/A | `isDirectChatIdForUser` evalúa `true` para `student_A` | ALLOW | ALLOW | PASS | Ninguna | NONE | El UID `student_A` coincide con el token canónico del chatId delimitado. |
| **TC-02** | `A` | `/chats/direct_student_B_student_C` | `get` | N/A | `student_A` no está en el chatId ni en participants | DENY | DENY | PASS | Ninguna | NONE | El helper `isDirectChatIdForUser` rechaza a `student_A`; `resource.data` no contiene a `student_A`. |
| **TC-03** | `T_AP` | `/chats/direct_student_A_student_B` | `get` | N/A | `T_AP` no es participante ni admin | DENY | DENY | PASS | Ninguna | NONE | `isApprovedTeacher()` fue eliminado de `/chats/{chatId}` en F69. Docentes ajenos no tienen acceso a chats privados entre estudiantes. |
| **TC-04** | `A` | `/chats/direct_student_B_student_C` | `create` | `{ createdBy: "student_A", participants: ["student_B", "student_C"] }` | `isDirectChatIdForUser` evalúa `false` para `student_A` | DENY | DENY | PASS | Ninguna | NONE | `allow create` exige coincidencia canónica de `chatId` con el UID del creador. |
| **TC-05** | `A` | `/chats/direct_student_A_student_B` | `create` | `{ createdBy: "student_B", participants: ["student_A", "student_B"] }` | `request.resource.data.createdBy == request.auth.uid` | DENY | DENY | PASS | Ninguna | NONE | Spoofing de `createdBy` bloqueado; se exige estrictamente `createdBy == request.auth.uid`. |
| **TC-06** | `A` | `/chats/direct_student_A_student_B` | `create` | `{ createdBy: "student_A", participants: ["student_B", "student_C"] }` | `request.auth.uid in request.resource.data.participants` | DENY | DENY | PASS | Ninguna | NONE | Se valida que el usuario esté presente en `participants`. |
| **TC-07** | `A` | `/chats/direct_student_A_student_B` | `update` | `{ participants: ["student_A", "student_B", "student_C"] }` | `request.resource.data.participants == resource.data.participants` | DENY | DENY | PASS | Ninguna | NONE | Los campos estructurales (`participants`, `participantIds`, `type`, `chatId`, `createdBy`, `createdAt`) son estrictamente inmutables para no-admins. |
| **TC-08** | `A` | `/chats/direct_student_A_student_B` | `update` | `{ lastMessage: "Hola", unreadCount: 1 }` | `isChatParticipant()` es `true`, campos estructurales sin cambios | ALLOW | ALLOW | PASS | Ninguna | NONE | Actualización operativa legítima de metadatos de chat por un participante. |
| **TC-09** | `A` | `/chats/direct_student_A_student_B` | `delete` | N/A | `isAdmin()` | DENY | DENY | PASS | Ninguna | NONE | Borrado de chats restringido con exclusividad a `isAdmin()`. Estudiantes y profesores no pueden borrar chats. |
| **TC-10** | `A` | `/chats/direct_student_A_student_B_extra` | `get` | N/A | `isDirectChatIdForUser` regex anchor (`$`) | DENY | DENY | PASS | Ninguna | NONE | El anclaje regex `^direct_UID_[a-zA-Z0-9_-]+$` rechaza tokens adicionales (evita colisiones por substring). |
| **TC-11** | `A` | `/chats/direct_student_AA_student_B` | `get` | N/A | `isDirectChatIdForUser` delimitadores de token | DENY | DENY | PASS | Ninguna | NONE | Delimitación estricta con `_` evita que `student_A` acceda a cuentas con prefijos homónimos (`student_AA`). |
| **TC-12** | `A` | `/chats/peer_student_A_student_B` | `get` | N/A | `isPeerChatIdForUser` evalúa `true` | ALLOW | ALLOW | PASS | Ninguna | NONE | Chat de pares canónico entre estudiantes. |
| **TC-13** | `A` | `/chats/peer_student_B_student_C` | `get` | N/A | `isPeerChatIdForUser` evalúa `false` | DENY | DENY | PASS | Ninguna | NONE | Estudiante tercero bloqueado de acceder a conversaciones entre pares ajenas. |
| **TC-14** | `T_AP` | `/chats/peer_student_A_student_B` | `get` | N/A | `isChatParticipant()` no contiene bypass para pares | DENY | DENY | PASS | Ninguna | NONE | Aislamiento total de conversaciones de pares entre estudiantes; ningún docente tiene acceso. |
| **TC-15** | `A` | `/chats/peer_student_B_student_C` | `create` | `{ createdBy: "student_A", participants: ["student_B", "student_C"] }` | `isPeerChatIdForUser` evalúa `false` | DENY | DENY | PASS | Ninguna | NONE | Creación artificial de chats de pares ajenos bloqueada. |
| **TC-16** | `A` | `/chats/support_student_A` | `get` | N/A | `isSupportChatForStudent` evalúa `true` | ALLOW | ALLOW | PASS | Ninguna | NONE | El estudiante accede a su propio canal de soporte institucional. |
| **TC-17** | `A` | `/chats/support_student_B` | `get` | N/A | `isSupportChatForStudent` evalúa `false` (`chatId == support_student_B != support_student_A`) | DENY | DENY | PASS | Ninguna | NONE | Aislamiento horizontal de canales de soporte entre estudiantes. |
| **TC-18** | `T_AP` | `/chats/support_student_A` | `get` | N/A | `isSupportChatForApprovedTeacher` evalúa `true` | ALLOW | ALLOW | PASS | Ninguna | NONE | Docentes aprobados de guardia pueden atender solicitudes de soporte de estudiantes. |
| **TC-19** | `T_NOAP` | `/chats/support_student_A` | `get` | N/A | `isApprovedTeacher()` es `false` | DENY | DENY | PASS | Ninguna | NONE | Docentes no aprobados para tutorías (`isApprovedForTutoring == false`) no pueden acceder a canales de soporte. |
| **TC-20** | `T_AP` | `/chats/support_student_B` | `create` | `{ createdBy: "teacher_AP", participants: ["teacher_AP", "student_B"] }` | `isSupportChatForApprovedTeacher` evalúa `true` | ALLOW | ALLOW | PASS | Ninguna | NONE | Docente de guardia puede inicializar la conversación de soporte para responder al estudiante. |
| **TC-21** | `A` | `/chats/support_student_A` | `update` | `{ teacherId: "teacher_hacker" }` | Inmutabilidad de campos estructurales | DENY | DENY | PASS | Ninguna | NONE | Los estudiantes no pueden reasignar arbitrariamente docentes en metadatos protegidos. |
| **TC-22** | `A` | `/chats/sala_profesores_coordinacion` | `get` | N/A | `isTeacherCoordinationChat` exige `isApprovedTeacher()` | DENY | DENY | PASS | Ninguna | NONE | Estudiantes tienen prohibido el acceso a la sala de coordinación de profesores. |
| **TC-23** | `T_NOAP` | `/chats/sala_profesores_coordinacion` | `get` | N/A | `isTeacherCoordinationChat` exige `isApprovedTeacher()` | DENY | DENY | PASS | Ninguna | NONE | Profesores no aprobados no pueden ingresar a la sala de coordinación docente. |
| **TC-24** | `T_AP` | `/chats/sala_profesores_coordinacion` | `get` | N/A | `isTeacherCoordinationChat` evalúa `true` | ALLOW | ALLOW | PASS | Ninguna | NONE | Docentes aprobados acceden legítimamente a la coordinación docente. |
| **TC-25** | `A` | `/chats/course_matematicas_101` | `get` | N/A | `isEnrolledInCourse("course_matematicas_101")` (asumiendo NO matriculado) | DENY | DENY | PASS | Ninguna | NONE | Estudiante no matriculado no puede leer el chat del curso. |
| **TC-26** | `A` (Matriculado) | `/chats/matematicas_101` | `get` | N/A | `isEnrolledInCourse("matematicas_101")` evalúa `true` en `/users/{uid}` | ALLOW | ALLOW | PASS | Ninguna | NONE | Estudiante formalmente inscrito en la base de datos de usuarios accede al chat del curso. |
| **TC-27** | `T_ASIG` | `/chats/matematicas_101` | `get` | N/A | `isTeacherOfCourse("matematicas_101")` evalúa `true` en `/users/{uid}` | ALLOW | ALLOW | PASS | Ninguna | NONE | Docente titular del curso accede al canal de su curso. |
| **TC-28** | `T_OTRO` | `/chats/matematicas_101` | `get` | N/A | `isTeacherOfCourse` evalúa `false` | DENY | DENY | PASS | Ninguna | NONE | Docente no asignado a la materia no puede acceder al canal del curso. |
| **TC-29** | `A` | `/chats/direct_student_A_student_B/messages/msg1` | `create` | `{ senderId: "student_A", text: "Hola", chatId: "direct_student_A_student_B" }` | `request.resource.data.senderId == request.auth.uid` | ALLOW | ALLOW | PASS | Ninguna | NONE | Creación legítima de mensaje con autoría válida. |
| **TC-30** | `A` | `/chats/direct_student_A_student_B/messages/msg2` | `create` | `{ senderId: "student_B", text: "Suplantación", chatId: "direct_student_A_student_B" }` | `request.resource.data.senderId == request.auth.uid` | DENY | DENY | PASS | Ninguna | NONE | Intento de suplantación de `senderId` bloqueado de forma estricta. |
| **TC-31** | `A` | `/chats/direct_student_A_student_B/messages/msg_from_B` | `update` | `{ text: "Mensaje modificado por atacante" }` | `resource.data.senderId == request.auth.uid` | DENY | DENY | PASS | Ninguna | NONE | Un usuario no puede modificar mensajes enviados por otros usuarios. |
| **TC-32** | `A` | `/chats/direct_student_A_student_B/messages/msg_from_A` | `update` | `{ text: "Mensaje editado legítimo", senderId: "student_A" }` | `resource.data.senderId == request.auth.uid`, campos inmutables preservados | ALLOW | ALLOW | PASS | Ninguna | NONE | El autor original puede editar el contenido textual de su mensaje. |
| **TC-33** | `A` | `/chats/direct_student_A_student_B/messages/msg_from_B` | `delete` | N/A | `resource.data.senderId == request.auth.uid || isAdmin()` | DENY | DENY | PASS | Ninguna | NONE | Borrado de mensajes ajenos bloqueado; solo el autor original o el admin pueden borrarlo. |
| **TC-34** | `A` | `/chats/direct_student_A_student_B/messages/msg_from_A` | `delete` | N/A | `resource.data.senderId == request.auth.uid` | ALLOW | ALLOW | PASS | Ninguna | NONE | El autor original puede eliminar su propio mensaje. |
| **TC-35** | `ADMIN` | `/chats/direct_student_A_student_B/messages/msg_from_A` | `delete` | N/A | `isAdmin()` | ALLOW | ALLOW | PASS | Ninguna | NONE | El administrador institucional conserva permisos de moderación de contenido. |
| **TC-36** | `A` | `/chats/direct_student_A_student_B/signal/webrtc_offer` | `create` | `{ sdp: "offer", type: "offer" }` | `isChatParticipant()` evalúa `true` | ALLOW | ALLOW | PASS | Ninguna | NONE | Señalización WebRTC permitida a participantes del chat. |
| **TC-37** | `A` | `/chats/direct_student_B_student_C/signal/webrtc_offer` | `create` | `{ sdp: "offer", type: "offer" }` | `isChatParticipant()` evalúa `false` | DENY | DENY | PASS | Ninguna | NONE | Señalización WebRTC en chats ajenos bloqueada. |
| **TC-38** | `A` | `/rooms/room_student_B_student_C` | `get` | N/A | `isRoomParticipant()` evalúa `false` | DENY | DENY | PASS | Ninguna | NONE | Acceso a salas WebRTC ajenas bloqueado. |
| **TC-39** | `A` | `/calls/call_student_B_student_C` | `get` | N/A | `isCallParticipant()` evalúa `false` | DENY | DENY | PASS | Ninguna | NONE | Acceso a llamadas directas ajenas bloqueado. |
| **TC-40** | `A` | `/voice_group_calls/matematicas_101` | `get` | N/A | `isVoiceGroupCallMember()` evalúa `false` para estudiante no matriculado | DENY | DENY | PASS | Ninguna | NONE | Acceso a audioconferencias grupales restringido a matriculados y docentes asignados. |
| **TC-41** | `A` | `/users/student_A` | `update` | `{ role: "admin", isAdmin: true }` | `request.resource.data.role == resource.data.role` && `isAdmin == resource.data.isAdmin` | DENY | DENY | PASS | Ninguna | NONE | Intento de auto-escalada de privilegios a admin bloqueado en la colección `/users`. |
| **TC-42** | `T_NOAP` | `/users/teacher_NOAP` | `update` | `{ isApprovedForTutoring: true }` | Inmutabilidad de `isApprovedForTutoring` para no-admins | DENY | DENY | PASS | Ninguna | NONE | Docente no puede auto-aprobarse para tutorías mediante mutación directa en Firestore. |
| **TC-43** | `UNVER` | `/chats/direct_unver_student_B` | `get` | N/A | `isVerifiedUser()` exige `email_verified == true` | DENY | DENY | PASS | Ninguna | NONE | Usuarios con correo no verificado tienen denegado el acceso a cualquier canal de comunicación. |
| **TC-44** | `ANON` | `/chats/cualquiera` | `get` | N/A | `isSignedIn()` exige `request.auth != null` | DENY | DENY | PASS | Ninguna | NONE | Accesos anónimos bloqueados en todas las colecciones privadas. |
| **TC-45** | `A` | `/firestore_peer_conversations/peer_student_B_student_C` | `get` | N/A | `isPeerChatIdForUser` en colecciones legacy | DENY | DENY | PASS | Ninguna | NONE | Colección de sincronización legacy protegida contra accesos de estudiantes ajenos. |
| **TC-46** | `T_AP` | `/firestore_peer_conversations/peer_student_A_student_B` | `get` | N/A | `isApprovedTeacher()` eliminado de colecciones peer legacy en F69 | DENY | DENY | PASS | Ninguna | NONE | Docentes aprobados no pueden interceptar mensajes legacy de pares entre estudiantes. |
| **TC-47** | `A` | `/firestore_teacher_conversations/sala_profesores_coordinacion` | `get` | N/A | Exclusivo para docentes aprobados y admin | DENY | DENY | PASS | Ninguna | NONE | Acceso de estudiantes a conversaciones docentes legacy bloqueado. |
| **TC-48** | `A` | `/whiteboards/whiteboard_student_B_student_C` | `get` | N/A | `isWhiteboardParticipant()` evalúa `false` | DENY | DENY | PASS | Ninguna | NONE | Aislamiento estricto de pizarras digitales colaborativas privadas. |

---
**RESULTADO TOTAL DE LA MATRIZ**: 48/48 CASOS ADVERSARIALES AUDITADOS Y CONFORMES CON EL PRINCIPIO DE MÍNIMO PRIVILEGIO.
