# MATRIZ DE AUTORIZACIÓN DE CHAT — AULAINFINITY (FASE F67)

**Fecha:** 22 de Agosto de 2026  
**Estado:** DEFINICIÓN OFICIAL DE PERMISOS (RBAC + Custom Claims)  
**Propósito:** Especificación formal de matriz de permisos de lectura, creación, edición, borrado y señalización WebRTC para cada rol y cada tipo de chat.

---

## 1. Matriz de Autorización por Rol y Tipo de Chat

| Tipo de Chat / Ruta | Estudiante Participante (A o B) | Estudiante Tercero (No Participante) | Docente Asignado / Participante | Docente Aprobado (No Asignado) | Administrador (`role == 'admin'`) |
|---|---|---|---|---|---|
| **DIRECT** (`direct_uidA_uidB`) | **Read:** ✅ Sí<br>**Create Msg:** ✅ Sí<br>**Edit/Delete Msg:** ✅ Solo propios<br>**WebRTC Signal:** ✅ Sí | ❌ **DENY** (Lectura y Escritura bloqueadas) | **Read:** ✅ Sí<br>**Create Msg:** ✅ Sí<br>**Edit/Delete Msg:** ✅ Solo propios<br>**WebRTC Signal:** ✅ Sí | ❌ **DENY** (No es participante de la tutoría privada) | **Read:** ✅ Sí (Auditoría)<br>**Create Msg:** ✅ Sí<br>**Edit/Delete Msg:** ✅ Propios y Moderación<br>**WebRTC Signal:** ✅ Sí |
| **PEER** (`peer_studentA_studentB`) | **Read:** ✅ Sí<br>**Create Msg:** ✅ Sí<br>**Edit/Delete Msg:** ✅ Solo propios<br>**WebRTC Signal:** ✅ Sí | ❌ **DENY** (Lectura y Escritura bloqueadas) | ❌ **DENY** (Aislamiento de privacidad entre alumnos) | ❌ **DENY** | **Read:** ✅ Sí (Moderación y Auditoría)<br>**Create Msg:** ❌ No participa<br>**Edit/Delete Msg:** ✅ Solo borrado administrativo si infringe normas |
| **SUPPORT** (`support_studentId`) | **Read:** ✅ Solo el alumno `studentId`<br>**Create Msg:** ✅ Sí<br>**Edit/Delete Msg:** ✅ Solo propios<br>**WebRTC Signal:** ✅ Sí | ❌ **DENY** (Estudiante ajeno bloqueado) | **Read:** ✅ Sí<br>**Create Msg:** ✅ Sí<br>**Edit/Delete Msg:** ✅ Solo propios<br>**WebRTC Signal:** ✅ Sí | **Read:** ✅ Sí (Soporte general)<br>**Create Msg:** ✅ Sí<br>**Edit/Delete Msg:** ✅ Solo propios<br>**WebRTC Signal:** ✅ Sí | **Read:** ✅ Sí<br>**Create Msg:** ✅ Sí<br>**Edit/Delete Msg:** ✅ Propios / Moderación<br>**WebRTC Signal:** ✅ Sí |
| **TEACHER** (`teacher_id`, `sala_profesores...`) | ❌ **DENY** (Canal interno exclusivo de profesorado) | ❌ **DENY** | **Read:** ✅ Sí<br>**Create Msg:** ✅ Sí<br>**Edit/Delete Msg:** ✅ Solo propios<br>**WebRTC Signal:** ✅ Sí | **Read:** ✅ Sí<br>**Create Msg:** ✅ Sí<br>**Edit/Delete Msg:** ✅ Solo propios<br>**WebRTC Signal:** ✅ Sí | **Read:** ✅ Sí<br>**Create Msg:** ✅ Sí<br>**Edit/Delete Msg:** ✅ Total |
| **GROUP / COURSE** (`{courseId}`) | **Read:** ✅ Si está matriculado (`enrolledCourseIds`)<br>**Create Msg:** ✅ Sí<br>**Edit/Delete Msg:** ✅ Solo propios | ❌ **DENY** (No matriculado) | **Read:** ✅ Sí<br>**Create Msg:** ✅ Sí<br>**Edit/Delete Msg:** ✅ Solo propios / Moderación | **Read:** ✅ Sí<br>**Create Msg:** ✅ Sí<br>**Edit/Delete Msg:** ✅ Solo propios | **Read:** ✅ Sí<br>**Create Msg:** ✅ Sí<br>**Edit/Delete Msg:** ✅ Total |
| **WEBRTC SIGNAL** (`chats/{id}/signal/callData`) | ✅ Sí (si `request.auth.uid` está en participantes del chat) | ❌ **DENY** | ✅ Sí (si `request.auth.uid` está en participantes del chat) | ❌ **DENY** | ✅ Sí |
| **VOICE GROUP CALLS** (`voice_group_calls/{roomId}`) | ✅ Sí (si está matriculado o participante) | ❌ **DENY** | ✅ Sí | ✅ Sí | ✅ Sí |

---

## 2. Invariantes de Seguridad y Validación de Operaciones

1. **Invariante de Identidad del Remitente:**
   - Todo mensaje creado (`create`) debe verificar obligatoriamente: `request.resource.data.senderId == request.auth.uid`.
   - Ningún usuario (ni siquiera admin en interfaz estándar) puede crear mensajes suplantando el UID de otro usuario.

2. **Invariante de Mutabilidad / Edición:**
   - La edición de mensajes (`update`) solo permite modificar el campo `text` y `isEdited: true`. Los campos `senderId`, `senderRole`, `timestamp` y `conversationId` son inmutables.
   - Solo el autor original (`resource.data.senderId == request.auth.uid`) o un `admin` pueden editar.

3. **Invariante de Borrado:**
   - Un mensaje solo puede ser eliminado (`delete`) por el autor del mensaje (`resource.data.senderId == request.auth.uid`) o por un usuario con Custom Claim `role === 'admin'`.

4. **Invariante de Docente No Aprobado:**
   - Los docentes con estado `isApprovedForTutoring == false` tienen bloqueada la creación de mensajes y salas de voz hasta recibir aprobación administrativa.

5. **Invariante de Aislamiento Horizontal:**
   - Ningún estudiante puede leer ni escribir en colecciones o chats donde no esté explícitamente listado como participante (`participants`) o matriculado en el curso (`enrolledCourseIds`).
