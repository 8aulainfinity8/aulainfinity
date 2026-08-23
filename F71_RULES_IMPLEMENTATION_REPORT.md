# FASE F71 — INFORME DE IMPLEMENTACIÓN QUIRÚRGICA DE FIRESTORE RULES
## PROYECTO: AulaInfinity
**Fecha**: 2026-08-23  
**Estado**: 🟢 APROBADA (Implementación y verificación completadas con éxito)

---

## 1. OBJETIVO

La **Fase F71** tuvo como objetivo resolver exclusivamente los tres hallazgos residuales identificados durante la auditoría post-F70:
1. **MEDIUM**: Eliminar la cláusula residual `isApprovedTeacher()` de la colección legacy `firestore_direct_messages`.
2. **LOW**: Delimitar el helper `isTeacherCoordinationChat()` para evitar que docentes aprobados accedan a canales privados `teacher_<otroDocenteUid>`.
3. **LOW**: Restringir las colecciones legacy de coordinación docente (`firestore_teacher_conversations` y `firestore_teacher_messages`) retirando la expresión regular genérica `teacher_[a-zA-Z0-9_-]+`.

---

## 2. BACKUP OBLIGATORIO REALIZADO

Antes de aplicar cualquier cambio sobre `firestore.rules`, se generó la copia exacta:
- **Archivo**: `firestore.rules.f71.backup`
- **Hash SHA-256 Original**: `13633462e93ead0c4fba45e2c86df786a123435363d88fc6b19e340cb9f54711`
- **Hash SHA-256 Backup**: `13633462e93ead0c4fba45e2c86df786a123435363d88fc6b19e340cb9f54711`
- **Verificación**: Coincidencia exacta byte a byte confirmada mediante `sha256sum`.

---

## 3. CAMBIOS EXACTOS REALIZADOS

### A. Delimitación de `isTeacherCoordinationChat(chatId)` (Líneas 111-116)
Se retiró la condición `chatId.matches('^teacher_[a-zA-Z0-9_-]+$')`, dejando:
```firestore
function isTeacherCoordinationChat(chatId) {
  return isApprovedTeacher() && (
    chatId == 'sala_profesores_coordinacion' ||
    chatId == 'teacher_' + request.auth.uid
  );
}
```
- **Efecto**: Un docente aprobado únicamente tiene acceso a la sala general de profesores (`sala_profesores_coordinacion`) y a su propio canal privado (`teacher_<suUid>`). Cualquier intento de acceder al canal de otro docente resulta en **DENY**.

### B. Eliminación de Bypass en `match /firestore_direct_messages/{msgId}` (Líneas 737-743)
Se reemplazó la regla legacy permisiva por:
```firestore
match /firestore_direct_messages/{msgId} {
  allow read, write: if isVerifiedUser() && (
    isAdmin() ||
    isDirectChatIdForUser(msgId) ||
    isParticipant(resource.data)
  );
}
```
- **Efecto**: Se eliminó la cláusula `|| isApprovedTeacher()`. Un docente solo puede leer o escribir si es participante directo del mensaje o si es administrador.

### C. Restricción en `firestore_teacher_conversations` y `firestore_teacher_messages` (Líneas 765-788)
Se eliminaron las regex amplias `convId.matches('^teacher_[a-zA-Z0-9_-]+$')` y `msgId.matches('^teacher_[a-zA-Z0-9_-]+$')`:
```firestore
match /firestore_teacher_conversations/{convId} {
  allow read, write: if isAdmin() || (isApprovedTeacher() && (
    convId == 'sala_profesores_coordinacion' ||
    convId == 'teacher_' + request.auth.uid ||
    isParticipant(resource.data)
  ));
  match /{allSubcollections=**} {
    allow read, write: if isAdmin() || (isApprovedTeacher() && (
      convId == 'sala_profesores_coordinacion' ||
      convId == 'teacher_' + request.auth.uid ||
      isParticipant(resource.data)
    ));
  }
}

match /firestore_teacher_messages/{msgId} {
  allow read, write: if isAdmin() || (isApprovedTeacher() && (
    msgId == 'sala_profesores_coordinacion' ||
    msgId == 'teacher_' + request.auth.uid ||
    isParticipant(resource.data)
  ));
}
```

---

## 4. REGLAS NO MODIFICADAS

En cumplimiento de las instrucciones de F71, se mantuvieron intactas:
- `/chats/{chatId}` y subcolección `/chats/{chatId}/messages/{messageId}`.
- `/chats/{chatId}/signal/**` (señalización WebRTC).
- `/rooms/{roomId}`, `/calls/{callId}`, `/voice_group_calls/{callId}`.
- `/whiteboards/{whiteboardId}`, `/whiteboardCursors/{cursorId}`.
- `/users/{userId}` y control de Custom Claims.
- `storage.rules` y `firebase.json`.

---

## 5. SUITE DE PRUEBAS Y RESULTADOS

### Nueva Suite Específica: `src/__tests__/ChatRulesF71Security.test.ts`
Cubre 10 escenarios adversariales y 3 verificaciones estáticas de reglas:
1. Docente aprobado no puede leer chat privado de otro docente (`teacher_B` intentando leer `teacher_A` -> **DENY**).
2. Docente aprobado accede legítimamente a `sala_profesores_coordinacion` y a su propio canal `teacher_<propioUid>` -> **ALLOW**.
3. Estudiante o docente no aprobado intentando entrar a coordinación docente -> **DENY**.
4. Docente aprobado intentando acceder a chat directo entre estudiantes sin ser participante -> **DENY**.
5. Docente aprobado intentando acceder a chat de pares (`peer_`) entre estudiantes -> **DENY**.
6. Usuario no participante (incluyendo docente no participante) leyendo `firestore_direct_messages` -> **DENY**.
7. Suplantación de identidad en `senderId` -> **DENY**.
8. Escalada o ampliación no autorizada del array `participants` -> **DENY**.
9. Aislamiento de canales de soporte (`support_<studentUid>`) -> **Aislado por UID**.
10. Preservación del acceso legítimo de administradores (`isAdmin()`) -> **ALLOW**.

---

## 6. REGRESIONES Y SEGURIDAD

- **Regresiones**: **0**. Todas las suites preexistentes continúan pasando al 100%.
- **Linter & TypeCheck**: `tsc --noEmit` completado con **0 errores**.
- **Despliegues**: **0** (No se ejecutó `firebase deploy`).

---

## 7. CONCLUSIÓN

La Fase F71 cerró quirúrgicamente todos los hallazgos de seguridad residuales sin alterar la arquitectura, sin desestabilizar el frontend y manteniendo la integridad de las 23 suites de pruebas del proyecto.
