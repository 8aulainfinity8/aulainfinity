# ANÁLISIS FORMAL DE BRECHAS DE SEGURIDAD (GAP ANALYSIS) — FIRESTORE RULES
## PROYECTO: AulaInfinity | FASE F68: VALIDACIÓN FORMAL DE FIRESTORE RULES
**Fecha:** 22 de Agosto de 2026  
**Estado:** INFORME FORENSE DE BRECHAS Y ESPECIFICACIÓN FORMAL (Pre-Rules F69)

---

## 1. RESUMEN EJECUTIVO Y MAPA DE RIESGOS

| Nivel de Severidad | Cantidad | Módulos Afectados |
|---|---|---|
| 🔴 **CRITICAL** | 2 | `/firestore_peer_conversations`, `/firestore_peer_messages`, `/firestore_teacher_conversations`, `/firestore_teacher_messages` (bypass por `isApprovedTeacher()`) |
| 🟠 **HIGH** | 3 | Expresión regular permisiva en `isIdParticipant(id)` (posible IDOR por subcadenas), Inyección de chats 1:1 artificiales mediante `request.resource.data.participants` arbitrario, Falta de validación estricta de matriculación en `/chats/{courseId}` cuando no existe documento padre |
| 🟡 **MEDIUM** | 2 | `/chats/{chatId}/signal/**` confía en `isIdParticipant` permitiendo espionaje de señalización SDP en IDs ambiguos, Falta de límite de longitud en payload de mensajes |
| 🟢 **LOW** | 1 | Actualización concurrente de contadores `unreadCount` permite colisiones de campo si no se utiliza `FieldValue.increment` |

---

## 2. HALLAZGOS DETALLADOS POR CATEGORÍA DE SEVERIDAD

### 🔴 BRECHA CRÍTICA 1: Bypass Universal de Docentes en Chats Privados de Alumnos (Colecciones Legadas)
- **Archivo / Líneas:** `firestore.rules:663-671`
  ```playground
  match /firestore_peer_conversations/{convId} {
    allow read, write: if isVerifiedUser() && (isIdParticipant(convId) || isParticipant(resource.data) || isApprovedTeacher());
  }
  match /firestore_peer_messages/{msgId} {
    allow read, write: if isVerifiedUser() && (isIdParticipant(msgId) || isParticipant(resource.data) || isApprovedTeacher());
  }
  ```
- **Vector de Ataque:** Un usuario autenticado con rol `teacher` y `isApprovedForTutoring == true` puede consultar directamente la colección `firestore_peer_conversations` o `firestore_peer_messages` y leer/escribir mensajes privados entre dos estudiantes cualquiera.
- **Resultado Actual:** `ALLOW` incondicional para cualquier `isApprovedTeacher()`.
- **Resultado Deseado:** `DENY` absoluto para profesores en chats entre alumnos (`peer_`). Solo los dos alumnos participantes pueden leer/escribir; administradores solo para auditoría/borrado.
- **Impacto:** Violación de la privacidad del estudiante (RGPD) y ruptura del aislamiento horizontal.
- **Corrección Necesaria:** Eliminar `|| isApprovedTeacher()` de las reglas de peer y sincronización legada, restringiendo a `isCanonicalPeerParticipant(convId)` y administradores.

---

### 🔴 BRECHA CRÍTICA 2: Falta de Aislamiento en Coordinación Docente (`firestore_teacher_*`)
- **Archivo / Líneas:** `firestore.rules:673-682`
  ```playground
  match /firestore_teacher_conversations/{convId} {
    allow read, write: if isApprovedTeacher() || (isVerifiedUser() && (isIdParticipant(convId) || isParticipant(resource.data)));
  }
  ```
- **Vector de Ataque:** Alumnos autenticados pueden intentar leer/escribir si consiguen un `convId` con su UID o inyectar `participants: [alumnoUid]` en la creación.
- **Resultado Actual:** Permite creación si `isIdParticipant(convId)` evalúa verdadero para el alumno.
- **Resultado Deseado:** `DENY` para estudiantes en todas las colecciones de coordinación docente (`teacher_` y `sala_profesores_coordinacion`). Exclusivo para `isApprovedTeacher()` y `isAdmin()`.
- **Impacto:** Filtración de discusiones pedagógicas confidenciales, notas internas y datos administrativos a estudiantes.
- **Corrección Necesaria:** Requerir `isApprovedTeacher()` o `isAdmin()` como condición obligatoria en `firestore_teacher_*`.

---

### 🟠 BRECHA ALTA 1: Expresión Regular Ambigua en `isIdParticipant(id)`
- **Archivo / Líneas:** `firestore.rules:53-65`
  ```playground
  function isIdParticipant(id) {
    return isVerifiedUser() && (
      isAdmin() ||
      id == request.auth.uid ||
      id.matches('^direct_' + request.auth.uid + '(_.*)?$') ||
      id.matches('^peer_' + request.auth.uid + '(_.*)?$') ||
      id.matches('^room_' + request.auth.uid + '(_.*)?$') ||
      id.matches('^call_' + request.auth.uid + '(_.*)?$') ||
      id.matches('^' + request.auth.uid + '_.*') ||
      id.matches('.*_' + request.auth.uid + '$') ||
      id.matches('.*_' + request.auth.uid + '_.*')
    );
  }
  ```
- **Vector de Ataque:** La regla `id.matches('.*_' + request.auth.uid + '_.*')` o `id.matches('.*_' + request.auth.uid + '$')` permite que un usuario cuyo UID sea subcadena o coincida en una posición inesperada obtenga autorización para IDs construidos arbitrariamente (ej. `direct_targetStudent_targetTeacher_attackerUid`).
- **Resultado Actual:** `ALLOW` en cualquier ID que contenga el UID entre guiones bajos.
- **Resultado Deseado:** Coincidencia exacta determinista con los formatos canónicos:
  - Direct: `^direct_[a-zA-Z0-9_-]+_[a-zA-Z0-9_-]+$` donde uno de los dos UIDs sea exactamente `request.auth.uid`.
  - Peer: `^peer_[a-zA-Z0-9_-]+_[a-zA-Z0-9_-]+$` donde uno de los dos UIDs sea exactamente `request.auth.uid`.
  - Support: `^support_' + request.auth.uid + '$` (para el alumno) o rol profesor/admin.
- **Impacto:** Potencial IDOR en identificadores de chat malformados.
- **Corrección Necesaria:** Reemplazar `isIdParticipant` por funciones helper canónicas estructuradas: `isCanonicalDirectParticipant(chatId)`, `isCanonicalPeerParticipant(chatId)`, `isSupportParticipant(chatId)`.

---

### 🟠 BRECHA ALTA 2: Creación Artificial de Chats 1:1 Inyectando `participants`
- **Archivo / Líneas:** `firestore.rules:281-288`
  ```playground
  allow create: if isVerifiedUser() && (
    isAdmin() ||
    (
      (isIdParticipant(chatId) || (request.resource.data.participants is list && request.auth.uid in request.resource.data.participants)) &&
      (!('participants' in request.resource.data) || (request.resource.data.participants is list && request.auth.uid in request.resource.data.participants))
    )
  );
  ```
- **Vector de Ataque:** Un usuario A crea `/chats/random_chat_name` con `request.resource.data.participants = ['A', 'B']`. Como `A in participants`, la regla actual evalúa `ALLOW`.
- **Resultado Actual:** `ALLOW` creando un canal no estructurado fuera de las rutas legítimas.
- **Resultado Deseado:** `DENY` salvo que el `chatId` cumpla uno de los patrones canónicos (`direct_`, `peer_`, `support_`, `teacher_` o curso verificado en `users/{uid}.enrolledCourseIds`).
- **Impacto:** Creación de documentos huérfanos e ilegítimos en Firestore evadiendo la lógica de negocio.
- **Corrección Necesaria:** Exigir en `create` que el `chatId` sea canónico y que `request.resource.data.createdBy == request.auth.uid`.

---

### 🟠 BRECHA ALTA 3: Validación de Grupos de Curso (`{courseId}`) sin Verificación de Matrícula en Creación de Mensajes
- **Archivo / Líneas:** `firestore.rules:321-334`
  ```playground
  allow create: if isVerifiedUser() && (
    isAdmin() || (
      (isIdParticipant(chatId) ||
       isEnrolledInCourse(chatId) ||
       isTeacherOfCourse(chatId) ||
       (request.resource.data.participants is list && request.auth.uid in request.resource.data.participants) ||
       (exists(/databases/$(database)/documents/chats/$(chatId)) && ...)) &&
      request.resource.data.senderId == request.auth.uid
    )
  );
  ```
- **Vector de Ataque:** Un estudiante no matriculado en el curso `ebau` intenta enviar un mensaje a `/chats/ebau/messages/{msgId}` enviando en su payload `participants: [suUid]`. Como la condición incluye `(request.resource.data.participants is list && request.auth.uid in request.resource.data.participants)`, podría evaluar `ALLOW`.
- **Resultado Actual:** Riesgo de bypass si el payload del mensaje contiene un array `participants` manipulado.
- **Resultado Deseado:** Para chats de grupo, verificar `isEnrolledInCourse(chatId)` o `isTeacherOfCourse(chatId)` sin permitir bypass por campos `participants` en el mensaje individual.
- **Impacto:** Acceso no autorizado a foros académicos de asignaturas en las que el alumno no está matriculado.
- **Corrección Necesaria:** Eliminar `(request.resource.data.participants is list ...)` del mensaje individual; la pertenencia se valida contra el chat padre o la función `isEnrolledInCourse`.

---

### 🟡 BRECHA MEDIA 1: Señalización WebRTC en `/chats/{chatId}/signal/**` Confía en `isIdParticipant`
- **Archivo / Líneas:** `firestore.rules:354-360`
  ```playground
  match /signal/{signalDoc=**} {
    allow read, write: if isVerifiedUser() && (
      isAdmin() ||
      isIdParticipant(chatId) ||
      (resource != null && resource.data.participants is list && request.auth.uid in resource.data.participants)
    );
  }
  ```
- **Vector de Ataque:** Herencia de la debilidad de `isIdParticipant` hacia la señalización WebRTC.
- **Resultado Actual:** Permite lectura/escritura de datos de llamada SDP si el ID es coincidente parcialmente.
- **Resultado Deseado:** Solo los dos participantes de la llamada 1:1 o miembros del grupo pueden leer/escribir datos de señalización.
- **Impacto:** Posible interrupción o espionaje de sesiones de audio/vídeo.
- **Corrección Necesaria:** Restringir con `isChatParticipant()` estricto.

---

### 🟡 BRECHA MEDIA 2: Falta de Validación de Esquema en Edición de Mensajes
- **Archivo / Líneas:** `firestore.rules:336-344`
  ```playground
  allow update: if isVerifiedUser() && (
    isAdmin() || (
      resource.data.senderId == request.auth.uid &&
      request.resource.data.senderId == resource.data.senderId &&
      (!('chatId' in request.resource.data) || !('chatId' in resource.data) || request.resource.data.chatId == resource.data.chatId) &&
      (!('timestamp' in request.resource.data) || !('timestamp' in resource.data) || request.resource.data.timestamp == resource.data.timestamp)
    )
  );
  ```
- **Vector de Ataque:** Un usuario edita un mensaje y altera campos como `senderRole`, `type` o inyecta metadatos falsos.
- **Resultado Actual:** Solo `senderId`, `chatId` y `timestamp` están protegidos contra mutación.
- **Resultado Deseado:** Inmutabilidad de `senderRole`, `type`, `createdAt`, `id`, y exigir que solo `text`, `attachments` y `isEdited` puedan cambiar.
- **Impacto:** Integridad de auditoría de mensajes.
- **Corrección Necesaria:** Añadir comprobaciones de inmutabilidad para `senderRole` y `type`.
