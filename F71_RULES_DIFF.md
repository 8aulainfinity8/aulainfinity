# FASE F71 — DIFF DE CORRECCIONES QUIRÚRGICAS EN FIRESTORE RULES
## PROYECTO: AulaInfinity

Este documento registra formalmente las diferencias exactas aplicadas en `firestore.rules` durante la **Fase F71** para resolver los tres hallazgos residuales identificados en la auditoría F70.

---

### 1. CORRECCIÓN 1: Eliminación de Bypass en Colección Legacy `firestore_direct_messages`

#### Regla Anterior (F70):
```firestore
match /firestore_direct_messages/{msgId} {
  allow read, write: if isVerifiedUser() && (isIdParticipant(msgId) || isParticipant(resource.data) || isApprovedTeacher());
}
```

#### Regla Nueva (F71):
```firestore
match /firestore_direct_messages/{msgId} {
  allow read, write: if isVerifiedUser() && (
    isAdmin() ||
    isDirectChatIdForUser(msgId) ||
    isParticipant(resource.data)
  );
}
```

#### Motivo:
Eliminar la cláusula residual `|| isApprovedTeacher()` que permitía a cualquier docente aprobado leer mensajes en la colección directa legacy sin ser participante del chat.

#### Vulnerabilidad Cerrada:
- **MED-01**: Escalada horizontal y bypass de lectura/escritura por parte de docentes no participantes sobre mensajes directos en colecciones legacy.

#### Tests que la Validan:
- `src/__tests__/ChatRulesF71Security.test.ts`: Test 6 ("non-participant cannot read legacy direct message -> DENY").
- `src/__tests__/ChatRulesF71Security.test.ts`: Verificación estática 1 ("firestore_direct_messages NO debe contener isApprovedTeacher()").

---

### 2. CORRECCIÓN 2: Delimitación Estricta de `isTeacherCoordinationChat`

#### Regla Anterior (F70):
```firestore
function isTeacherCoordinationChat(chatId) {
  return isApprovedTeacher() && (
    chatId == 'sala_profesores_coordinacion' ||
    chatId == 'teacher_' + request.auth.uid ||
    chatId.matches('^teacher_[a-zA-Z0-9_-]+$')
  );
}
```

#### Regla Nueva (F71):
```firestore
function isTeacherCoordinationChat(chatId) {
  return isApprovedTeacher() && (
    chatId == 'sala_profesores_coordinacion' ||
    chatId == 'teacher_' + request.auth.uid
  );
}
```

#### Motivo:
Eliminar la expresión regular genérica `chatId.matches('^teacher_[a-zA-Z0-9_-]+$')` que permitía a cualquier docente aprobado acceder a los canales privados de otros docentes con prefijo `teacher_`.

#### Vulnerabilidad Cerrada:
- **LOW-01**: Acceso indebido entre docentes aprobados a canales privados `teacher_<otroDocenteUid>`.

#### Tests que la Validan:
- `src/__tests__/ChatRulesF71Security.test.ts`: Test 1 ("approved teacher cannot read another teacher private chat -> DENY").
- `src/__tests__/ChatRulesF71Security.test.ts`: Test 2 ("approved teacher can access general teacher coordination and own teacher chat -> ALLOW").
- `src/__tests__/ChatRulesF71Security.test.ts`: Test 3 ("student cannot access teacher coordination -> DENY").
- `src/__tests__/ChatRulesF71Security.test.ts`: Verificación estática 2 ("isTeacherCoordinationChat NO debe contener regex genérica teacher_[a-zA-Z0-9_-]+").

---

### 3. CORRECCIÓN 3: Delimitación de Colecciones Legacy de Profesores

#### Regla Anterior (F70):
```firestore
match /firestore_teacher_conversations/{convId} {
  allow read, write: if isAdmin() || (isApprovedTeacher() && (
    convId == 'sala_profesores_coordinacion' ||
    convId == 'teacher_' + request.auth.uid ||
    convId.matches('^teacher_[a-zA-Z0-9_-]+$') ||
    isParticipant(resource.data)
  ));
  match /{allSubcollections=**} {
    allow read, write: if isAdmin() || (isApprovedTeacher() && (
      convId == 'sala_profesores_coordinacion' ||
      convId == 'teacher_' + request.auth.uid ||
      convId.matches('^teacher_[a-zA-Z0-9_-]+$') ||
      isParticipant(resource.data)
    ));
  }
}

match /firestore_teacher_messages/{msgId} {
  allow read, write: if isAdmin() || (isApprovedTeacher() && (
    msgId == 'sala_profesores_coordinacion' ||
    msgId == 'teacher_' + request.auth.uid ||
    msgId.matches('^teacher_[a-zA-Z0-9_-]+$') ||
    isParticipant(resource.data)
  ));
}
```

#### Regla Nueva (F71):
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

#### Motivo:
Alinear las colecciones legacy de coordinación docente para que `teacher_<uid>` ajeno no sea accesible por otros docentes salvo pertenencia explícita en `resource.data`.

#### Vulnerabilidad Cerrada:
- Aislamiento total de conversaciones docentes privadas en capas legacy.

#### Tests que la Validan:
- `src/__tests__/ChatRulesF71Security.test.ts`: Verificación estática 3.
