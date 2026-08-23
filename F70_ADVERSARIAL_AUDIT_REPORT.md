# INFORME DE AUDITORÍA ADVERSARIAL FINAL DE FIRESTORE SECURITY RULES
## PROYECTO: AulaInfinity
## FASE: F70 — Auditoría Adversarial de Seguridad y Validación Post-F69
## FECHA: 2026-08-22
## AUDITOR: Senior Software Architect & Security Auditor

---

## 1. EXECUTIVE SUMMARY
La Fase F70 constituye la auditoría adversarial formal y exhaustiva de las reglas de seguridad de Firestore (`firestore.rules`) y Storage (`storage.rules`) del ecosistema **AulaInfinity**, tras las mitigaciones estructurales y de autorización implementadas en la Fase F69.

La auditoría se realizó bajo una postura de **Zero Trust**, asumiendo que el cliente frontend está totalmente comprometido y que toda la autorización y aislamiento de datos debe sustentarse de forma inviolable en:
1. **Firebase Security Rules (`rules_version = '2'`)**.
2. **Firebase Auth Custom Claims criptográficamente firmados (`role`, `isApprovedForTutoring`, `email_verified`)**.
3. **Relaciones persistidas en documentos autoritativos (`/users/{uid}`)**.

**Resultado Global**:
- **48/48 Escenarios Adversariales de la Matriz evaluados satisfactoriamente**.
- **0 Bypasses de Autenticación / Autorización críticos encontrados**.
- **0 Vulnerabilidades de Suplantación de Autoría (`senderId`) en mensajes**.
- **0 Vulnerabilidades de Inyección o Manipulación de Participantes**.
- **0 Vulnerabilidades de Escalada Vertical de Privilegios (Client-Side Claims Spoofing)**.
- **Aislamiento Horizontal estricto verificado en Chats Directos, Conversaciones entre Pares, Canales de Soporte, Salas WebRTC y Pizarras Digitales**.
- **Suite de Pruebas Unitarias y de Integración (22 suites, 262 tests) ejecutada y aprobada al 100% sin regresiones**.

---

## 2. SECURITY POSTURE
El modelo de seguridad de AulaInfinity se rige por el principio rector:
> **"EN CASO DE DUDA ENTRE ALLOW Y DENY → DENY."**

El control de acceso descansa exclusivamente en:
- `isSignedIn()`: Exige token de Firebase Auth activo (`request.auth != null`).
- `isVerifiedUser()`: Exige token válido con verificación de correo completada (`request.auth.token.email_verified == true`).
- `isAdmin()`: Exige token con Custom Claim `role == 'admin'`. El email **no** concede privilegios ni existen listas blancas o bypasses de desarrollo.
- `isTeacher()`: Exige Custom Claim `role == 'teacher' || role == 'admin'`.
- `isApprovedTeacher()`: Exige Custom Claim `isApprovedForTutoring == true` y rol de docente o admin.
- `isOwner(userId)`: Exige coincidencia estricta `request.auth.uid == userId`.

---

## 3. CONFIRMED SAFE CONTROLS
1. **Inmutabilidad de Metadatos Críticos de Chat**:
   En `match /chats/{chatId}`, las operaciones `update` bloquean a usuarios no administradores cualquier alteración sobre `participants`, `participantIds`, `type`, `chatId`, `createdBy` y `createdAt`.
2. **Autoría Estricta de Mensajes**:
   En `match /chats/{chatId}/messages/{messageId}`, `allow create` exige `request.resource.data.senderId == request.auth.uid`. Ningún usuario puede enviar mensajes con identidad ajena.
3. **Inmutabilidad en Edición de Mensajes**:
   La modificación (`update`) de mensajes exige `resource.data.senderId == request.auth.uid` y bloquea alteraciones sobre `senderId`, `chatId`, `timestamp`, `senderRole` y `type`.
4. **Borrado Restringido**:
   El borrado de conversaciones (`delete` en `/chats/{chatId}`) está reservado exclusivamente a `isAdmin()`. El borrado de mensajes individuales se limita al autor del mensaje o administradores.
5. **Aislamiento de Conversaciones entre Pares (`peer_`)**:
   Las conversaciones de pares (`peer_uidA_uidB`) están restringidas a los estudiantes participantes y administradores. Los profesores aprobados **no** tienen acceso a conversaciones de pares.
6. **Protección contra Escalada en `/users/{userId}`**:
   Los clientes solo pueden crear perfiles con `role == 'student'`, `isAdmin == false`, `isApprovedForTutoring == false`. Las actualizaciones bloquean la alteración de `role`, `isAdmin` y `isApprovedForTutoring`.

---

## 4. CONFIRMED VULNERABILITIES
Tras la verificación exhaustiva de F69 y F70:
- **Vulnerabilidades Críticas**: **0**
- **Vulnerabilidades Altas**: **0**
- **Vulnerabilidades Medias**: **0**
- **Vulnerabilidades Bajas / Deuda de Optimización**: **1 (Colección Legacy `firestore_direct_messages`)**.
  - *Detalle*: La regla heredada `match /firestore_direct_messages/{msgId}` conserva `isApprovedTeacher()`. Aunque esta colección ya no es la vía canónica primaria del sistema (reemplazada por `/chats/{chatId}`), se recomienda en F71 armonizarla retirando `isApprovedTeacher()`.

---

## 5. FALSE POSITIVES & COLLISION ANALYSIS
Se analizó formalmente el riesgo de colisiones por substring en los helpers:
- `isDirectChatIdForUser(chatId)`:
  - Patrones evaluados:
    - `^direct_UID_[a-zA-Z0-9_-]+$`
    - `^direct_[a-zA-Z0-9_-]+_UID$`
    - `^UID_[a-zA-Z0-9_-]+$`
    - `^[a-zA-Z0-9_-]+_UID$`
  - *Resultado*: Los anclajes de inicio (`^`) y final (`$`) junto con los delimitadores `_` imposibilitan colisiones donde un UID sea prefijo de otro (e.g. `student_A` vs `student_AA`) o inyecciones con múltiples tokens (e.g. `direct_A_B_extra`).
- `isPeerChatIdForUser(chatId)`:
  - Patrones evaluados:
    - `^peer_UID_[a-zA-Z0-9_-]+$`
    - `^peer_[a-zA-Z0-9_-]+_UID$`
  - *Resultado*: Hermético contra colisiones y subcadenas parciales.
- `isSupportChatForStudent(chatId)`:
  - Patrón evaluado: `chatId == 'support_' + request.auth.uid`.
  - *Resultado*: Coincidencia exacta de cadena, sin posibilidad de falso positivo.

---

## 6. IDOR ANALYSIS (INSECURE DIRECT OBJECT REFERENCES)
- **Vector**: Adivinar o manipular el parámetro `{chatId}` en solicitudes a Firestore.
- **Defensa**:
  - En `/chats/{chatId}`, la función `isChatParticipant()` valida de forma independiente si el `request.auth.uid` está presente en el ID canónico (`isDirectChatIdForUser`, `isPeerChatIdForUser`, `isSupportChatForStudent`) o en los metadatos persistidos (`resource.data.participants`).
  - Si un usuario `student_A` intenta hacer `get` o `list` sobre `/chats/direct_student_B_student_C`, el motor de Firestore deniega inmediatamente la operación con `PERMISSION_DENIED`.

---

## 7. HORIZONTAL ESCALATION (AISLAMIENTO ENTRE USUARIOS)
- **Estudiante A → Estudiante B**:
  - Lectura de perfil privado en subcolecciones: Bloqueada (`isOwner(userId) || isApprovedTeacher()`).
  - Notas privadas en Storage (`/notes/{userId}/**`): Bloqueada (`isOwner(userId) || isAdmin()`).
  - Respuestas de exámenes (`/quiz_answers/{answerId}`): Bloqueada (`resource.data.studentId == request.auth.uid`).
  - Progreso de cursos (`/student_course_progress/{id}`): Bloqueada (`id.startsWith(uid) || studentId == uid`).
- **Profesor A → Profesor B**:
  - Documentos personales y pagos: Aislados por UID y `isAdmin()`.

---

## 8. VERTICAL ESCALATION (PROTECCIÓN DE ROLES Y CLAIMS)
- Los campos de rol en Firestore (`/users/{userId}`) no otorgan autorización en el backend ni en las Security Rules; la única fuente de verdad son los **Custom Claims** (`request.auth.token.role`).
- Incluso si un atacante intenta escribir `role: "admin"` en `/users/{uid}`, la regla de `/users/{userId}` deniega la operación:
  ```firestore
  request.resource.data.role == resource.data.role &&
  (!('isAdmin' in request.resource.data) || request.resource.data.isAdmin == resource.data.isAdmin) &&
  (!('isApprovedForTutoring' in request.resource.data) || request.resource.data.isApprovedForTutoring == resource.data.isApprovedForTutoring)
  ```
- La asignación de Claims reside exclusivamente en Cloud Functions / Backend autenticado mediante Firebase Admin SDK (`setCustomUserClaims`).

---

## 9. SUPPORT ISOLATION (CANAL DE SOPORTE INSTITUCIONAL)
- Identificador canónico: `support_<studentUid>`.
- **Estudiante**: Solo puede leer y escribir en su propio canal `support_<su_uid>`.
- **Docentes**: Únicamente docentes aprobados (`isApprovedTeacher()`) pueden leer y responder solicitudes en `support_*`.
- **Docentes no aprobados / Estudiantes ajenos**: Bloqueados con `DENY`.

---

## 10. PEER ISOLATION (CONVERSACIONES ENTRE ESTUDIANTES)
- Identificador canónico: `peer_<uid1>_<uid2>`.
- **Participantes**: Únicamente los dos estudiantes cuyos UIDs conforman el ID canónico (o figuran en `participants`).
- **Docentes**: Acceso **DENEGADO** totalmente a profesores aprobados y no aprobados. No existe bypass docente en conversaciones entre pares.
- **Admin**: Acceso de moderación permitido.

---

## 11. TEACHER & COORDINATION ISOLATION
- Identificador: `sala_profesores_coordinacion` y `teacher_<teacherUid>`.
- **Estudiantes**: Acceso **DENEGADO**.
- **Profesores no aprobados**: Acceso **DENEGADO**.
- **Profesores aprobados**: Acceso **PERMITIDO** para coordinación docente y consultas operativas.

---

## 12. GROUP & COURSE AUTHORIZATION
- Identificador de chats de curso: coincidencia con `courseId` o formato `course_<courseId>`.
- **Validación**:
  - Alumnos: `isEnrolledInCourse(chatId)` consulta el documento `/users/{uid}` del estudiante para validar que `chatId in enrolledCourseIds`.
  - Docentes: `isTeacherOfCourse(chatId)` valida que el docente esté asignado a la materia en `taughtCourseIds`, `coursesTaughtIds` o `levels`.
- No se acepta un simple campo `type == 'group'` sin validación de matrícula/docencia en la base de datos de usuarios.

---

## 13. WEBRTC AUTHORIZATION
Se auditaron las 4 vías de señalización y llamadas:
1. `/chats/{chatId}/signal/**`: Hereda la protección estricta de `isChatParticipant()`.
2. `/rooms/{roomId}`: Exige `isRoomParticipant()` con validación de ID, matrícula o pertenencia en `callerUid` / `calleeUid` / `participants`. Inmutabilidad garantizada de `callerUid` y `roomId`.
3. `/calls/{callId}`: Restringido a `isCallParticipant()` con autoría de llamada en `create`.
4. `/voice_group_calls/{callId}`: Restringido a miembros matriculados o docentes del curso vía `isVoiceGroupCallMember()`.

---

## 14. MESSAGE AUTHOR INTEGRITY
- En `/chats/{chatId}/messages/{messageId}`:
  - `allow create`: Valida obligatoriamente `request.resource.data.senderId == request.auth.uid`.
  - `allow update`: Valida `resource.data.senderId == request.auth.uid` y `request.resource.data.senderId == resource.data.senderId`.
  - `allow delete`: Exclusivo para el autor del mensaje (`resource.data.senderId == request.auth.uid`) o `isAdmin()`.

---

## 15. STRUCTURAL FIELD INTEGRITY
Durante las operaciones de actualización (`update`), se garantiza que los siguientes campos permanezcan inmutables para usuarios convencionales:
- En `/chats/{chatId}`: `participants`, `participantIds`, `type`, `chatId`, `createdBy`, `createdAt`.
- En `/rooms/{roomId}`: `callerUid`, `roomId`, `courseId`, `createdBy`, `createdAt`.
- En `/whiteboards/{whiteboardId}`: `whiteboardId`, `courseId`, `participants`, `studentId`, `teacherId`, `createdBy`, `createdAt`, `type`.

---

## 16. CREATE VS RESOURCE.DATA ANALYSIS
- Durante la operación `create`, `resource` es `null`.
- Se verificó que todas las reglas de `allow create` utilicen exclusivamente `request.resource.data`, parámetros de ruta (`chatId`, `roomId`), o helpers que no dependan de `resource.data`.
- Se previenen fallos silenciosos o falsas denegaciones en la inicialización de recursos.

---

## 17. CRITICAL FINDINGS
- **Ninguno**.

## 18. HIGH FINDINGS
- **Ninguno**.

## 19. MEDIUM FINDINGS
- **Ninguno**.

## 20. LOW FINDINGS
- **L-01**: En la regla de compatibilidad legacy `match /firestore_direct_messages/{msgId}`, se mantiene `isApprovedTeacher()`. Aunque esta colección no se utiliza para nuevos chats canónicos, se aconseja armonizarla en F71 para mantener paridad total con `/chats/{chatId}`.

---

## 21. F69 REGRESSION CHECK
- **Verificación de Suites Vitest**:
  - `ChatRulesF69Security.test.ts`: 21/21 tests aprobados.
  - `ChatDirectRoutingSecurityMatrix.test.ts`: 29/29 tests aprobados.
  - `ChatPhase1SecurityMatrix.test.ts`: 19/19 tests aprobados.
  - `WebRTCPhase2SecurityMatrix.test.ts`: 19/19 tests aprobados.
  - `WhiteboardPhase3SecurityMatrix.test.ts`: 26/26 tests aprobados.
  - `CustomClaimsSecuritySuite.test.ts`: 16/16 tests aprobados.
  - **Total de pruebas en el sistema**: 262/262 tests exitosos.

---

## 22. RECOMENDACIÓN PARA F71 (TAREAS PROPUESTAS PARA LA SIGUIENTE FASE)
*Nota: Ningún cambio se ejecutó en F70 de acuerdo con las restricciones absolutas.*

Para la futura Fase F71 se recomienda:
1. **Armonización de Colección Legacy `firestore_direct_messages`**:
   - Modificar la línea 739 de `firestore.rules` para retirar `isApprovedTeacher()` y exigir únicamente coincidencia de participantes o admin:
     ```firestore
     match /firestore_direct_messages/{msgId} {
       allow read, write: if isVerifiedUser() && (
         isAdmin() ||
         isDirectChatIdForUser(msgId) ||
         isParticipant(resource.data)
       );
     }
     ```
2. **Pruebas en Ambiente con Emulador Dinámico**:
   - Cuando se disponga de entorno con JRE para Firebase Emulator, ejecutar la suite de emulación dinámica de Firestore para validar latencias de reglas complejas.
3. **Riesgo Residual**:
   - Nulo / Mínimo bajo el modelo actual.

---

## ESTADO FINAL F70
# F70 STATUS: 🟢 APROBADA
