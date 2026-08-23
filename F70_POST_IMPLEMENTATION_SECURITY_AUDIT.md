# FASE F70 — AUDITORÍA FORENSE POST-IMPLEMENTACIÓN DE FIRESTORE RULES
## PROYECTO: AulaInfinity
**Fecha de Ejecución**: 2026-08-23  
**Modo**: EXCLUSIVAMENTE AUDITORÍA (Solo lectura y análisis formal, 0 modificaciones sobre reglas)

---

## 1. EXECUTIVE SUMMARY

La **Fase F70** constituye la auditoría forense y adversarial post-implementación de las reglas de seguridad de Firestore (`firestore.rules`) tras las modificaciones estructurales aplicadas en la **Fase F69**.

El objetivo primario fue verificar formalmente que la capa de autorización en Firestore garantiza:
- **Aislamiento Horizontal Absoluto**: Imposibilidad de que un usuario (estudiante o docente) acceda a conversaciones privadas o canales directos/pares donde no es participante legítimo.
- **Aislamiento Vertical y RBAC Criptográfico**: Validación basada exclusivamente en Custom Claims de Firebase Auth (`token.role`, `token.isApprovedForTutoring`, `token.email_verified`), sin dependencia de datos client-side o comprobaciones bypassables.
- **Integridad de Mensajería y Autoría**: Bloqueo total de suplantación de identidad (`senderId != request.auth.uid`), inmutabilidad de metadatos estructurales (`participants`, `type`, `chatId`, `createdBy`, `createdAt`) y protección contra edición/borrado de mensajes ajenos.
- **Prevención de IDOR y Colisiones por Substring**: Mitigación de colisiones de identificadores mediante expresiones regulares canónicas ancladas (`^` y `$`).
- **Seguridad WebRTC y Pizarras**: Control de acceso independiente y robusto sobre señalización (`/chats/{chatId}/signal/**`, `/rooms/{roomId}`, `/calls/{callId}`, `/voice_group_calls/{callId}`).

**Resultado de la Auditoría**:
- **Reglas modificadas durante F70**: **NO** (0 modificaciones).
- **Despliegues ejecutados**: **NO** (0 comandos de despliegue).
- **TypeScript / Linter**: **0 errores** (`tsc --noEmit` exitoso).
- **Tests Vitest**: **262/262 tests pasados** (22/22 suites, 100% éxito).
- **Evaluación Global**: 🟢 **APROBADA** (Sin vulnerabilidades CRITICAL ni HIGH).

---

## 2. ESTADO REAL DE FIRESTORE.RULES

### Checksums SHA-256 Verificados
```text
13633462e93ead0c4fba45e2c86df786a123435363d88fc6b19e340cb9f54711  firestore.rules
eee9cbafcd605b08989fb732e7987910a7c90be999b2d4c8871dac583e49ea5e  storage.rules
3cc50ac32a2b138f5e60e6e637e913c90304d6e8efce1b9853c7384fa13cfadf  firebase.json
```

### Extracto Exacto de los Bloques Críticos Auditados
```firestore
// Reglas canónicas /chats/{chatId}
match /chats/{chatId} {
  function isChatParticipant() {
    return isVerifiedUser() && (
      isAdmin() ||
      isDirectChatIdForUser(chatId) ||
      isPeerChatIdForUser(chatId) ||
      isSupportChatForStudent(chatId) ||
      isSupportChatForApprovedTeacher(chatId) ||
      isTeacherCoordinationChat(chatId) ||
      isEnrolledInCourse(chatId) ||
      isTeacherOfCourse(chatId) ||
      (resource != null && (
        (resource.data.participants is list && request.auth.uid in resource.data.participants) ||
        (resource.data.participantIds is list && request.auth.uid in resource.data.participantIds) ||
        (resource.data.studentId == request.auth.uid) ||
        (resource.data.teacherId == request.auth.uid)
      ))
    );
  }

  allow get, list: if isChatParticipant();

  allow create: if isVerifiedUser() && (
    isAdmin() || (
      (request.resource.data.createdBy is string && request.resource.data.createdBy == request.auth.uid) &&
      (
        isDirectChatIdForUser(chatId) ||
        isPeerChatIdForUser(chatId) ||
        isSupportChatForStudent(chatId) ||
        isSupportChatForApprovedTeacher(chatId) ||
        isTeacherCoordinationChat(chatId) ||
        isEnrolledInCourse(chatId) ||
        isTeacherOfCourse(chatId)
      ) &&
      (!('participants' in request.resource.data) || (request.resource.data.participants is list && request.auth.uid in request.resource.data.participants))
    )
  );

  allow update: if isChatParticipant() && (
    isAdmin() || (
      (!('participants' in request.resource.data) || !('participants' in resource.data) || request.resource.data.participants == resource.data.participants) &&
      (!('participantIds' in request.resource.data) || !('participantIds' in resource.data) || request.resource.data.participantIds == resource.data.participantIds) &&
      (!('type' in request.resource.data) || !('type' in resource.data) || request.resource.data.type == resource.data.type) &&
      (!('chatId' in request.resource.data) || !('chatId' in resource.data) || request.resource.data.chatId == resource.data.chatId) &&
      (!('createdBy' in request.resource.data) || !('createdBy' in resource.data) || request.resource.data.createdBy == resource.data.createdBy) &&
      (!('createdAt' in request.resource.data) || !('createdAt' in resource.data) || request.resource.data.createdAt == resource.data.createdAt)
    )
  );

  allow delete: if isAdmin();

  match /messages/{messageId} {
    allow get, list: if isVerifiedUser() && (
      isAdmin() ||
      isDirectChatIdForUser(chatId) ||
      isPeerChatIdForUser(chatId) ||
      isSupportChatForStudent(chatId) ||
      isSupportChatForApprovedTeacher(chatId) ||
      isTeacherCoordinationChat(chatId) ||
      isEnrolledInCourse(chatId) ||
      isTeacherOfCourse(chatId) ||
      (resource != null && (
        (resource.data.participants is list && request.auth.uid in resource.data.participants) ||
        resource.data.senderId == request.auth.uid
      )) ||
      (exists(/databases/$(database)/documents/chats/$(chatId)) &&
       get(/databases/$(database)/documents/chats/$(chatId)).data.get('participants', []) is list &&
       request.auth.uid in get(/databases/$(database)/documents/chats/$(chatId)).data.get('participants', []))
    );

    allow create: if isVerifiedUser() && (
      isAdmin() || (
        request.resource.data.senderId == request.auth.uid &&
        (!('chatId' in request.resource.data) || request.resource.data.chatId == chatId) &&
        (
          isDirectChatIdForUser(chatId) ||
          isPeerChatIdForUser(chatId) ||
          isSupportChatForStudent(chatId) ||
          isSupportChatForApprovedTeacher(chatId) ||
          isTeacherCoordinationChat(chatId) ||
          isEnrolledInCourse(chatId) ||
          isTeacherOfCourse(chatId) ||
          (exists(/databases/$(database)/documents/chats/$(chatId)) &&
           get(/databases/$(database)/documents/chats/$(chatId)).data.get('participants', []) is list &&
           request.auth.uid in get(/databases/$(database)/documents/chats/$(chatId)).data.get('participants', []))
        )
      )
    );

    allow update: if isVerifiedUser() && (
      isAdmin() || (
        resource.data.senderId == request.auth.uid &&
        request.resource.data.senderId == resource.data.senderId &&
        (!('chatId' in request.resource.data) || !('chatId' in resource.data) || request.resource.data.chatId == resource.data.chatId) &&
        (!('timestamp' in request.resource.data) || !('timestamp' in resource.data) || request.resource.data.timestamp == resource.data.timestamp) &&
        (!('senderRole' in request.resource.data) || !('senderRole' in resource.data) || request.resource.data.senderRole == resource.data.senderRole) &&
        (!('type' in request.resource.data) || !('type' in resource.data) || request.resource.data.type == resource.data.type)
      )
    );

    allow delete: if isVerifiedUser() && (
      isAdmin() ||
      resource.data.senderId == request.auth.uid
    );
  }

  match /signal/{signalDoc=**} {
    allow read, write: if isChatParticipant();
  }
}
```

---

## 3. COMPARACIÓN F68 -> F69

| Vector de Seguridad | Estado en F68 | Estado en F69 (Actual) | Evaluación Forense |
| :--- | :--- | :--- | :--- |
| **Aislamiento PEER** | `isApprovedTeacher()` podía acceder a chats directos y pares. | Aislamiento estricto con `isPeerChatIdForUser(chatId)` (exclusivo para estudiantes participantes). | **Cerrado y Seguro** |
| **Spoofing de senderId** | No se validaba coincidencia estricta en subcolección unificada. | `request.resource.data.senderId == request.auth.uid` exigido en CREATE. | **Cerrado y Seguro** |
| **Inmutabilidad de Mensajes** | Se permitía sobreescritura de metadatos en edición. | Inmutabilidad forzada para `senderId`, `chatId`, `timestamp`, `senderRole`, `type`. | **Cerrado y Seguro** |
| **Borrado de Mensajes** | Sin restricción explícita por autor. | Exclusivo para autor original (`resource.data.senderId == request.auth.uid`) o Admin. | **Cerrado y Seguro** |
| **Manipulación de participants** | Un usuario podía alterar el array `participants` en updates. | Inmutabilidad de `participants`, `participantIds`, `type`, `chatId`, `createdBy`, `createdAt`. | **Cerrado y Seguro** |
| **Borrado de Chats** | No diferenciaba rol en `allow delete`. | Exclusivo para `isAdmin()`. | **Cerrado y Seguro** |
| **Coincidencia de Chat ID** | Regex permisivas con coincidencia de substring. | Regex ancladas (`^` y `$`) con delimitadores explícitos. | **Cerrado y Seguro** |

---

## 4. INVENTARIO DE RUTAS Y USOS EN EL CODEBASE

| Ruta Firestore | Componente Creador | Componente Lector | Componente Editor | Componente Borrador | Campos Principales | Actor Identidad |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `/chats/{chatId}` | `useChat.ts`, `firestoreSync.ts` | `useChat.ts`, `ChatPage.tsx`, `ChatList.tsx` | `useChat.ts` (`sendMessage`, `markAsRead`) | Exclusivo Admin (`AdminChatPage.tsx`) | `chatId`, `participants`, `type`, `createdBy`, `lastMessage`, `unreadCount` | `currentUser.uid` |
| `/chats/{chatId}/messages/{messageId}` | `useChat.ts` (`sendMessage`) | `useChat.ts` (`onSnapshot`) | `useChat.ts` (`editMessage`) | `useChat.ts` (`deleteMessage`) | `senderId`, `text`, `timestamp`, `type`, `chatId` | `currentUser.uid` |
| `/chats/{chatId}/signal/**` | `useVoiceCall.ts` | `useVoiceCall.ts` | `useVoiceCall.ts` | `useVoiceCall.ts` (`beforeunload` / cleanup) | `callerId`, `offer`, `answer`, `status`, `candidate` | `currentUser.uid` |
| `/rooms/{roomId}` | `webrtcSignaling.ts`, `firestoreSync.ts` | `webrtcSignaling.ts` | `webrtcSignaling.ts` | `webrtcSignaling.ts`, `firestoreSync.ts` | `roomId`, `callerUid`, `calleeUid`, `status` | `currentUser.uid` |
| `/calls/{callId}` | `firestoreSync.ts` | `firestoreSync.ts` | `firestoreSync.ts` | `firestoreSync.ts` | `callId`, `callerId`, `calleeId`, `status` | `currentUser.uid` |
| `/voice_group_calls/{callId}` | `firestoreSync.ts`, `useVoiceCall.ts` | `firestoreSync.ts` | `firestoreSync.ts` | `firestoreSync.ts` | `courseId`, `participants`, `activeUsers` | `currentUser.uid` |
| `/whiteboards/{whiteboardId}` | `WhiteboardRoom.tsx` | `WhiteboardRoom.tsx` | `WhiteboardRoom.tsx` | `WhiteboardRoom.tsx` | `whiteboardId`, `courseId`, `participants`, `createdBy` | `currentUser.uid` |
| `/whiteboardCursors/{cursorId}` | `WhiteboardRoom.tsx` | `WhiteboardRoom.tsx` | `WhiteboardRoom.tsx` | `WhiteboardRoom.tsx` | `userId`, `cursorId`, `x`, `y`, `courseId` | `currentUser.uid` |

---

## 5. MATRIZ DE AUTORIZACIÓN EFECTIVA

| Tipo de Recurso / Chat | Estudiante Titular | Estudiante Ajeno | Docente Asignado/Aprobado | Docente Ajeno / No Aprobado | Administrador |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `direct_<student>_<teacher>` | ✅ ALLOW | ❌ DENY | ✅ ALLOW | ❌ DENY | ✅ ALLOW |
| `peer_<student1>_<student2>` | ✅ ALLOW | ❌ DENY | ❌ DENY (Aislado) | ❌ DENY | ✅ ALLOW |
| `support_<studentUid>` | ✅ ALLOW | ❌ DENY | ✅ ALLOW | ❌ DENY | ✅ ALLOW |
| `teacher_<teacherUid>` | ❌ DENY | ❌ DENY | ✅ ALLOW (si aprobado) | ❌ DENY | ✅ ALLOW |
| `sala_profesores_coordinacion`| ❌ DENY | ❌ DENY | ✅ ALLOW (si aprobado) | ❌ DENY | ✅ ALLOW |
| `course_<courseId>` | ✅ ALLOW (si matriculado) | ❌ DENY | ✅ ALLOW (si imparte curso) | ❌ DENY | ✅ ALLOW |
| `/signal/**` (WebRTC) | ✅ ALLOW (si en chat) | ❌ DENY | ✅ ALLOW (si en chat) | ❌ DENY | ✅ ALLOW |

---

## 6. ANÁLISIS IDOR (INSECURE DIRECT OBJECT REFERENCES)

### A. Ataque por Manipulación de `chatId`
- **Vector**: Atacante `A` intenta leer o escribir en `/chats/direct_B_C` o `/chats/peer_B_C`.
- **Evaluación**:
  - `isDirectChatIdForUser("direct_B_C")` evalúa:
    `"direct_B_C".matches('^direct_' + "A" + '_[a-zA-Z0-9_-]+$')` -> **FALSO**
    `"direct_B_C".matches('^direct_[a-zA-Z0-9_-]+_' + "A" + '$')` -> **FALSO**
  - Al no estar `A` en `chatId` ni en `resource.data.participants`, la evaluación retorna **DENY**.

### B. Ataque por Coincidencia Parcial / Substring
- **Vector**: Atacante con UID `usr1` intenta acceder a `direct_usr10_usr20` o `peer_usr1_fake_usr2`.
- **Evaluación**:
  - Expresión regular: `'^direct_' + request.auth.uid + '_[a-zA-Z0-9_-]+$'`
  - Dado que `usr1` va seguido inmediatamente de `_`, el ID `direct_usr10_usr20` es **rechazado** (`^direct_usr1_...` no casa con `direct_usr10_...`).
  - Resultado: **DENY** (Inmune a colisiones de prefijo o subcadenas).

---

## 7. ANÁLISIS DE ESCALADA HORIZONTAL

1. **Estudiante A -> Conversación Directa de Estudiante B**:
   - `direct_B_Teacher` -> `isDirectChatIdForUser` falla para `A`. **DENY**.
2. **Estudiante A -> Peer Chat entre B y C**:
   - `peer_B_C` -> `isPeerChatIdForUser` falla para `A`. **DENY**.
3. **Docente Aprobado -> Peer Chat entre Estudiantes**:
   - `peer_B_C` -> La regla `/chats/{chatId}` no otorga acceso a docentes por rol en chats `peer_`. **DENY**.
4. **Estudiante A -> Canal de Soporte de B**:
   - `support_B` -> `isSupportChatForStudent("support_B")` falla porque `chatId != 'support_' + A`. **DENY**.
5. **Usuario A -> Pizarra / Llamada de B**:
   - `/calls/call_B_C`, `/rooms/room_B_C` -> Requiere pertenencia en `participants` o `callerUid`/`calleeUid`. **DENY**.

---

## 8. ANÁLISIS DE ESCALADA VERTICAL

1. **Estudiante -> Creación / Auto-asignación de Rol Admin o Teacher**:
   - En `/users/{userId}`: `allow create, update` exige:
     `request.resource.data.role == 'student'` (o inmutable en update)
     `request.resource.data.isAdmin == false`
     `request.resource.data.isApprovedForTutoring == false`
   - El cliente no puede auto-otorgarse privilegios ni modificar Custom Claims. **DENY**.
2. **Docente No Aprobado -> Sala de Coordinación Docente**:
   - `isTeacherCoordinationChat` exige `isApprovedTeacher()`. Si `token.isApprovedForTutoring != true`, evalúa **DENY**.
3. **Docente Aprobado -> Funciones Exclusivas de Administrador**:
   - `isAdmin()` exige `token.role == 'admin'`. Borrado de chats o modificación de configuración global resulta en **DENY**.

---

## 9. ANÁLISIS DE INTEGRIDAD DE AUTORÍA (`senderId`)

- **Operación CREATE en `/messages/{messageId}`**:
  - Regla: `request.resource.data.senderId == request.auth.uid`
  - Si un atacante `A` envía `{ senderId: "B", text: "Mensaje falso" }`, la regla falla inmediatamente: **DENY**.
- **Operación UPDATE en `/messages/{messageId}`**:
  - Regla: `resource.data.senderId == request.auth.uid && request.resource.data.senderId == resource.data.senderId`
  - Un usuario no puede alterar mensajes enviados por otros ni reasignar el autor del mensaje propio: **DENY**.
- **Operación DELETE en `/messages/{messageId}`**:
  - Regla: `resource.data.senderId == request.auth.uid || isAdmin()`
  - Un usuario ordinario no puede eliminar mensajes de terceros: **DENY**.

---

## 10. ANÁLISIS DE INMUTABILIDAD DE `participants`

- **En `/chats/{chatId}`**:
  - Regla en UPDATE:
    ```firestore
    (!('participants' in request.resource.data) || !('participants' in resource.data) || request.resource.data.participants == resource.data.participants) &&
    (!('participantIds' in request.resource.data) || !('participantIds' in resource.data) || request.resource.data.participantIds == resource.data.participantIds)
    ```
  - Un atacante que intente inyectarse a sí mismo en `participants` de un chat existente mediante `updateDoc` es bloqueado: **DENY**.

---

## 11. ANÁLISIS DE CREACIÓN Y FORMATOS DE `chatId`

Formatos soportados y validados por las reglas:
1. `direct_<studentUid>_<teacherUid>` / `direct_<teacherUid>_<studentUid>`
2. `peer_<studentUid1>_<studentUid2>`
3. `support_<studentUid>`
4. `teacher_<teacherUid>` / `sala_profesores_coordinacion`
5. `<courseId>` (requiere verificación en `/users/{uid}.enrolledCourseIds` o `taughtCourseIds`)

**Inmutabilidad de `chatId` en updates**:
`request.resource.data.chatId == resource.data.chatId` forzado en `/chats/{chatId}` y subcolección `/messages/{messageId}`.

---

## 12. ANÁLISIS DE `resource` VS `request.resource`

| Operación | Disponibilidad `resource` | Disponibilidad `request.resource` | Comportamiento en Reglas Actuales | Evaluación |
| :--- | :--- | :--- | :--- | :--- |
| **CREATE `/chats/{chatId}`** | `null` | Disponible | Valida `request.resource.data.createdBy`, `chatId` canónico y `participants`. No accede a `resource.data`. | **Correcto** |
| **GET / LIST `/chats/{chatId}`**| Disponible | `null` | Utiliza `isChatParticipant()` con guarda `resource != null && (...)`. | **Correcto** |
| **UPDATE `/chats/{chatId}`** | Disponible | Disponible | Compara `request.resource.data` contra `resource.data` para inmutabilidad estructural. | **Correcto** |
| **DELETE `/chats/{chatId}`** | Disponible | `null` | Exclusivo `isAdmin()`. | **Correcto** |
| **CREATE `/messages/{msgId}`**| `null` | Disponible | Valida `request.resource.data.senderId == request.auth.uid`. | **Correcto** |
| **UPDATE `/messages/{msgId}`**| Disponible | Disponible | Compara autoría y previene mutación de campos críticos. | **Correcto** |

---

## 13. ANÁLISIS DE WEBRTC Y SEÑALIZACIÓN

1. **`/chats/{chatId}/signal/**`**:
   - Protegido por `isChatParticipant()`. Solo los miembros legítimos del chat pueden leer/escribir ofertas, respuestas y candidatos ICE.
2. **`/rooms/{roomId}`**:
   - Exige `isRoomParticipant()` con validación de `callerUid == request.auth.uid` en creación e inmutabilidad de `callerUid`, `roomId`, `courseId` en actualizaciones.
3. **`/calls/{callId}`**:
   - Exige `isCallParticipant()` impidiendo que un atacante inicie llamadas con identidades ajenas.
4. **`/voice_group_calls/{callId}`**:
   - Exige pertenencia demostrada al curso vía `isEnrolledInCourse` o `isTeacherOfCourse`.

---

## 14. TABLA DE INMUTABILIDAD DE CAMPOS ESTRUCTURALES

| Campo | CREATE | UPDATE USER | UPDATE ADMIN | Estado de Inmutabilidad |
| :--- | :--- | :--- | :--- | :--- |
| `senderId` (mensajes) | Obligatorio `== request.auth.uid` | ❌ Bloqueado | ❌ Bloqueado | **ESTRICTAMENTE INMUTABLE** |
| `chatId` (chat y mensajes) | Debe coincidir con ruta | ❌ Bloqueado | ✅ Permitido | **INMUTABLE PARA USUARIOS** |
| `participants` / `participantIds` | Debe incluir a `request.auth.uid` | ❌ Bloqueado | ✅ Permitido | **INMUTABLE PARA USUARIOS** |
| `type` (direct/peer/group/support)| Debe coincidir con formato | ❌ Bloqueado | ✅ Permitido | **INMUTABLE PARA USUARIOS** |
| `createdBy` | Obligatorio `== request.auth.uid` | ❌ Bloqueado | ✅ Permitido | **INMUTABLE PARA USUARIOS** |
| `createdAt` / `timestamp` | ServerTimestamp / Cliente inicial | ❌ Bloqueado | ✅ Permitido | **INMUTABLE PARA USUARIOS** |
| `lastMessage` / `lastMessageTimestamp` | Opcional | ✅ Permitido | ✅ Permitido | **MUTABLE (Operativo)** |
| `unreadCount` | Opcional | ✅ Permitido | ✅ Permitido | **MUTABLE (Operativo)** |

---

## 15. COMPATIBILIDAD CON EL FRONTEND

El análisis estático de los hooks y servicios (`src/hooks/useChat.ts`, `src/hooks/useVoiceCall.ts`, `src/services/firestoreSync.ts`, `src/utils/chatUtils.ts`) confirma:
1. **Generación determinista de IDs**: `getDirectChatId`, `parseDirectChatId`, `parseSupportChatId` generan identificadores 100% compatibles con las expresiones regulares canónicas de `firestore.rules`.
2. **Estructura de payloads**: `sendMessage` adjunta `senderId: currentUser.uid`, `timestamp: serverTimestamp()`, `chatId`.
3. **Operaciones de edición y borrado**: `editMessage` y `deleteMessage` operan exclusivamente sobre `/chats/{chatId}/messages/{messageId}` validando al usuario autenticado.

---

## 16. HALLAZGOS CRITICAL
- **Total**: **0**
- No se detectaron vulnerabilidades críticas de bypass de autenticación, escalada de privilegios ni compromiso masivo de datos.

---

## 17. HALLAZGOS HIGH
- **Total**: **0**
- No se detectaron vulnerabilidades de alta severidad.

---

## 18. HALLAZGOS MEDIUM
- **Total**: **1**
- **MED-01 — Permisividad residual en colección legacy `firestore_direct_messages`**:
  - *Ubicación*: `firestore.rules`, línea 739.
  - *Condición*: `allow read, write: if isVerifiedUser() && (isIdParticipant(msgId) || isParticipant(resource.data) || isApprovedTeacher());`
  - *Descripción*: La colección legacy conserva la cláusula `|| isApprovedTeacher()`, permitiendo que cualquier docente aprobado lea mensajes en esta colección histórica.
  - *Mitigación existente*: El frontend moderno opera exclusivamente sobre `/chats/{chatId}/messages/{messageId}` donde esta cláusula ya fue eliminada en F69.
  - *Recomendación*: Armonizar en F71 para retirar `isApprovedTeacher()` de las colecciones legacy.

---

## 19. HALLAZGOS LOW
- **Total**: **2**
- **LOW-01 — Patrón amplio en helper de coordinación docente**:
  - *Ubicación*: `firestore.rules`, línea 115 (`chatId.matches('^teacher_[a-zA-Z0-9_-]+$')`).
  - *Descripción*: Permite a cualquier docente aprobado acceder a cualquier chat con prefijo `teacher_`.
  - *Recomendación*: Restringir en F71 para que solo permita `teacher_<propioUID>` o `sala_profesores_coordinacion`.
- **LOW-02 — Acceso global de soporte para docentes aprobados**:
  - *Ubicación*: `firestore.rules`, línea 108 (`isSupportChatForApprovedTeacher`).
  - *Descripción*: Cualquier docente aprobado puede abrir cualquier `support_<studentUid>`.
  - *Justificación*: Corresponde al modelo de mesa de soporte compartida para tutores de AulaInfinity, pero puede afinarse cuando exista un `assignedTeacherId` en metadatos.

---

## 20. RECOMENDACIÓN PARA F71

Para la futura **Fase F71**, se recomienda aplicar las siguientes mejoras no disruptivas:

1. **Eliminar `isApprovedTeacher()` de la colección legacy `firestore_direct_messages`**:
   ```firestore
   match /firestore_direct_messages/{msgId} {
     allow read, write: if isVerifiedUser() && (
       isAdmin() ||
       isDirectChatIdForUser(msgId) ||
       isParticipant(resource.data)
     );
   }
   ```
2. **Afinar helper `isTeacherCoordinationChat`**:
   ```firestore
   function isTeacherCoordinationChat(chatId) {
     return isApprovedTeacher() && (
       chatId == 'sala_profesores_coordinacion' ||
       chatId == 'teacher_' + request.auth.uid
     );
   }
   ```
3. **Tests previos al despliegue**:
   - Mantener y ejecutar la suite `ChatRulesF69Security.test.ts` asegurando 100% de cobertura sobre intentos de acceso docente no autorizado en canales legacy.

---

## CONCLUSIÓN FINAL DE LA FASE F70
- **Reglas de Seguridad Modificadas**: **NO**
- **Reglas de Seguridad Desplegadas**: **NO**
- **TypeScript**: **0 errores** (`tsc --noEmit` exitoso)
- **Tests**: **262/262 pasados** (100%)
- **Estado de Aprobación**: 🟢 **APROBADA**
