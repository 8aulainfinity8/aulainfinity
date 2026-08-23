# MATRIZ FORMAL DE PRUEBAS DE SEGURIDAD (SECURITY TEST MATRIX) — FIRESTORE RULES
## PROYECTO: AulaInfinity | FASE F68: VALIDACIÓN FORMAL DE FIRESTORE RULES
**Fecha:** 22 de Agosto de 2026  
**Estado:** ESPECIFICACIÓN DE CASOS DE PRUEBA (Pre-Rules F69)

---

## 1. Tabla de Pruebas de Autorización y Aislamiento (Casos de Seguridad 1 a 18)

| # | Escenario de Prueba | Actor / Rol | Recurso / Ruta Firestore | Payload / Operación | Resultado Esperado | Justificación de Seguridad |
|---|---|---|---|---|---|---|
| **1** | **Estudiante accede a su propio chat 1:1** | Alumno A (`uid_studentA`) | `/chats/direct_uid_studentA_uid_teacher1` | `get` doc y `list` messages | 🟢 **ALLOW** | Alumno es participante legítimo del ID canónico y array `participants`. |
| **2** | **Estudiante intenta acceder a chat de otro estudiante** | Alumno A (`uid_studentA`) | `/chats/direct_uid_studentB_uid_teacher1` | `get` doc o `list` messages | 🔴 **DENY** | Alumno A no figura en el ID ni en `participants`. Aislamiento horizontal estricto. |
| **3** | **Estudiante intenta escribir a profesor no asignado en chat privado no existente** | Alumno A (`uid_studentA`) | `/chats/direct_uid_studentA_uid_unassignedTeacher` | `create` doc | 🟢 **ALLOW (Creación)** / 🔴 **DENY (si profesor está desaprobado)** | Si el docente está aprobado, se permite iniciar contacto; si `isApprovedForTutoring == false`, se bloquea. |
| **4** | **Estudiante escribe a profesor asignado** | Alumno A (`uid_studentA`) | `/chats/direct_uid_studentA_uid_teacher1/messages/msg_1` | `create` con `senderId: uid_studentA` | 🟢 **ALLOW** | Alumno es participante y `senderId == request.auth.uid`. |
| **5** | **Profesor aprobado accede a alumno no asignado (chat privado de otro profesor)** | Profesor 2 (`uid_teacher2`, Aprobado) | `/chats/direct_uid_studentA_uid_teacher1` | `get` doc o `list` messages | 🔴 **DENY** | Un profesor aprobado NO tiene acceso universal a chats privados entre otros profesores y alumnos. |
| **6** | **Profesor aprobado accede a alumno asignado** | Profesor 1 (`uid_teacher1`, Aprobado) | `/chats/direct_uid_studentA_uid_teacher1` | `get`, `list`, `create` msg | 🟢 **ALLOW** | Profesor 1 es participante legítimo de la tutoría. |
| **7** | **Profesor aprobado intenta leer chat entre iguales (Peer Chat)** | Profesor 1 (`uid_teacher1`, Aprobado) | `/chats/peer_uid_studentA_uid_studentB` | `get` doc o `list` messages | 🔴 **DENY** | Los profesores NO tienen acceso a las conversaciones privadas entre alumnos (`peer_`). |
| **8** | **Administrador accede a cualquier chat** | Admin (`uid_admin`, `role: 'admin'`) | Cualquier ruta `/chats/**` | `get`, `list`, `create`, `delete` | 🟢 **ALLOW** | Privilegio de auditoría y moderación global vía Custom Claim `role == 'admin'`. |
| **9** | **Remitente Falso (Ataque de Suplantación de Identidad)** | Alumno A (`uid_studentA`) | `/chats/direct_uid_studentA_uid_teacher1/messages/msg_x` | `create` con `senderId: uid_teacher1` | 🔴 **DENY** | Violación de `request.resource.data.senderId == request.auth.uid`. |
| **10** | **Manipulación de Participantes (`[A, B]` -> `[A, B, C]`)** | Alumno A (`uid_studentA`) | `/chats/direct_uid_studentA_uid_teacher1` | `update` con `participants: ['studentA', 'teacher1', 'attackerC']` | 🔴 **DENY** | Inmutabilidad de `participants` en actualización de chats para no-admins. |
| **11** | **Manipulación de ChatId en Mensaje** | Alumno A (`uid_studentA`) | `/chats/direct_uid_studentA_uid_teacher1/messages/msg_1` | `create` con `chatId: 'direct_studentB_teacher1'` | 🔴 **DENY** | Inconsistencia entre la ruta del documento y el payload del mensaje. |
| **12** | **Manipulación de MessageId Ajeno** | Alumno A (`uid_studentA`) | `/chats/direct_uid_studentA_uid_teacher1/messages/msg_from_teacher` | `update` alterando `text` | 🔴 **DENY** | Solo el autor original (`resource.data.senderId == request.auth.uid`) o admin pueden editar. |
| **13** | **Edición de Mensaje Ajeno** | Alumno A (`uid_studentA`) | `/chats/ebau/messages/msg_from_studentB` | `update` modificando `text` | 🔴 **DENY** | Bloqueado por regla de autoría en actualización. |
| **14** | **Borrado de Mensaje Ajeno** | Alumno A (`uid_studentA`) | `/chats/ebau/messages/msg_from_studentB` | `delete` | 🔴 **DENY** | Bloqueado por regla de autoría en borrado. |
| **15** | **Acceso a Soporte Ajeno** | Alumno B (`uid_studentB`) | `/chats/support_uid_studentA` | `get` doc o `list` messages | 🔴 **DENY** | El canal `support_uid_studentA` solo es accesible por `uid_studentA`, profesores y admins. |
| **16** | **Intercepción de Señalización WebRTC Ajena** | Alumno C (`uid_studentC`) | `/chats/direct_uid_studentA_uid_teacher1/signal/callData` | `get` o `write` en señal SDP | 🔴 **DENY** | Alumno C no es participante del chat; señalización protegida. |
| **17** | **Acceso a Grupo Académico No Matriculado** | Alumno A (`uid_studentA`, no matriculado en `fisica_2bach`) | `/chats/fisica_2bach/messages/msg_1` | `get`, `list` o `create` msg | 🔴 **DENY** | `isEnrolledInCourse('fisica_2bach')` evalúa falso. |
| **18** | **Acceso a Canal Docente por parte de Alumno** | Alumno A (`uid_studentA`) | `/chats/teacher_uid_teacher1` ó `sala_profesores_coordinacion` | `get` doc o `create` msg | 🔴 **DENY** | Canal reservado exclusivamente para docentes y administradores. |

---

## 2. Invariantes de Ejecución y Reglas de Decisión

1. **Invariante 1: Prevalencia del Contexto de Autenticación (`request.auth`)**
   - La identidad del usuario emisor SIEMPRE se evalúa mediante `request.auth.uid`. Cualquier campo `senderId` o `userId` enviado en el cuerpo de la petición debe ser estrictamente idéntico a `request.auth.uid`.

2. **Invariante 2: Inmutabilidad de Metadatos Estructurales**
   - Durante operaciones de `update` sobre `/chats/{chatId}`, los campos `participants`, `type`, `chatId`, `createdBy` y `createdAt` NO pueden ser modificados por ningún usuario con rol distinto de `admin`.

3. **Invariante 3: Aislamiento Completo de Canales de Alumnos (`peer_`)**
   - Ningún docente (incluso con `isApprovedForTutoring == true`) puede obtener lectura ni escritura sobre documentos que comiencen por `peer_`, garantizando el derecho a la privacidad entre estudiantes.
