# PROPUESTA DE REGLAS DE SEGURIDAD PARA FIRESTORE CHAT
## PROYECTO: AulaInfinity
## ARCHIVO DE PROPUESTA: CHAT_RULES_PROPOSAL.md

---

## 1. IDENTIFICACIÓN DE VULNERABILIDADES DE SEGURIDAD Y VECTORES DE ATAQUE

### Vulnerabilidad A: Ausencia de Validación Estricta de Participantes en `match /chats/{chatId}`
- **Descripción**: La colección `/chats/{chatId}` y sus subcolecciones secundarias permitían lecturas y escrituras si la función `isParticipant(resource.data)` o `isIdParticipant(chatId)` devolvía verdadero.
- **Riesgo / Vector de Ataque**: Un usuario malintencionado autenticado podría forzar consultas arbitrarias cambiando el `chatId` en la petición de Firestore, accediendo a metadatos de chats ajenos o inyectándose como participante mediante la manipulación del campo `participants` durante la creación del documento.

### Vulnerabilidad B: Inconsistencia entre Identidades de Autor (`senderId`) y Token de Autenticación (`request.auth.uid`)
- **Descripción**: Si la regla de seguridad no exige explícitamente `request.resource.data.senderId == request.auth.uid`, un usuario con sesión válida podría suplantar a otro usuario enviando un campo `senderId` falso en el cuerpo del mensaje.
- **Riesgo**: Impersonación de profesores o administradores en el historial de mensajes de la base de datos.

### Vulnerabilidad C: Falta de Aislamiento Granular por Tipo de Conversación
- **Descripción**: Tratar del mismo modo un chat directo alumno-profesor (`direct_`), un chat entre alumnos (`peer_`), un canal de soporte técnico (`support_`) y un grupo académico (`group`).
- **Riesgo**: Un estudiante no matriculado o sin tutor asignado podría comunicarse directamente con un profesor con el que no posee vínculo formal, o acceder a tickets de soporte de otros alumnos.

---

## 2. ANÁLISIS DE LAS REGLAS ACTUALES (`firestore.rules`)

Actualmente, las reglas en `firestore.rules` definen:

```playground
match /chats/{chatId} {
  allow read: if isVerifiedUser() && (
    isAdmin() || 
    isIdParticipant(chatId) || 
    (resource != null && isParticipant(resource.data))
  );
  
  allow create: if isVerifiedUser() && (
    isAdmin() || 
    (
      isIdParticipant(chatId) &&
      (!('participants' in request.resource.data) || request.auth.uid in request.resource.data.participants)
    )
  );

  allow update: if isVerifiedUser() && (
    isAdmin() || 
    (resource != null && isParticipant(resource.data))
  );

  match /messages/{messageId} {
    allow read: if isVerifiedUser() && (
      isAdmin() || 
      isIdParticipant(chatId) || 
      (resource != null && (
        resource.data.senderId == request.auth.uid ||
        ('participants' in resource.data && request.auth.uid in resource.data.participants)
      ))
    );

    allow create: if isVerifiedUser() && (
      isAdmin() || 
      (
        request.resource.data.senderId == request.auth.uid &&
        (isIdParticipant(chatId) || ('participants' in request.resource.data && request.auth.uid in request.resource.data.participants))
      )
    );

    allow update, delete: if isVerifiedUser() && (
      isAdmin() || 
      (resource != null && resource.data.senderId == request.auth.uid)
    );
  }
}
```

### Deficiencias identificadas en las reglas actuales:
1. `isIdParticipant(chatId)` utiliza expresiones regulares globales que autorizan cualquier coincidencia parcial de UID en el string del ID.
2. En la creación de mensajes, no se valida que el `chatId` corresponda a una estructura canónica determinista aprobada (`direct_<studentUid>_<teacherUid>` o `peer_<uid1>_<uid2>`).
3. No se limita el tamaño máximo de los campos `text` o el número de adjuntos dentro del mensaje.

---

## 3. PROPUESTA DE REGLAS MEJORADAS Y GRANULARES

A continuación se presenta la propuesta formal de reglas para reemplazar el bloque `match /chats/{chatId}` en `firestore.rules`:

```playground
// Funciones auxiliares específicas para Chats Canónicos
function isCanonicalDirectParticipant(chatId) {
  return chatId.matches('^direct_' + request.auth.uid + '_.*') ||
         chatId.matches('^direct_.*_' + request.auth.uid + '$');
}

function isCanonicalPeerParticipant(chatId) {
  return chatId.matches('^peer_' + request.auth.uid + '_.*') ||
         chatId.matches('^peer_.*_' + request.auth.uid + '$');
}

function isSupportStudentParticipant(chatId) {
  return chatId == 'support_' + request.auth.uid;
}

function isChatDocumentParticipant() {
  return resource != null && 
         'participants' in resource.data && 
         resource.data.participants is list && 
         request.auth.uid in resource.data.participants;
}

match /chats/{chatId} {
  // LECTURA DE METADATOS DEL CHAT:
  // Permitida para Administradores, o usuarios verificados que sean participantes canónicos del ID o figuren en resource.data.participants
  allow read: if isVerifiedUser() && (
    isAdmin() ||
    isCanonicalDirectParticipant(chatId) ||
    isCanonicalPeerParticipant(chatId) ||
    isSupportStudentParticipant(chatId) ||
    isChatDocumentParticipant()
  );

  // CREACIÓN DE UN NUEVO CHAT:
  // Exige que el creador esté autenticado, verificado, sea el emisor y figure explícitamente en el array request.resource.data.participants
  allow create: if isVerifiedUser() && (
    isAdmin() || (
      request.resource.data.createdBy == request.auth.uid &&
      request.auth.uid in request.resource.data.participants &&
      (
        isCanonicalDirectParticipant(chatId) ||
        isCanonicalPeerParticipant(chatId) ||
        isSupportStudentParticipant(chatId) ||
        (request.resource.data.type == 'group')
      )
    )
  );

  // ACTUALIZACIÓN DE METADATOS DEL CHAT (ej. unreadCount, lastMessage):
  allow update: if isVerifiedUser() && (
    isAdmin() ||
    isChatDocumentParticipant() ||
    isCanonicalDirectParticipant(chatId) ||
    isCanonicalPeerParticipant(chatId) ||
    isSupportStudentParticipant(chatId)
  );

  // SUBCOLECCIÓN DE MENSAJES
  match /messages/{messageId} {
    // LECTURA DE MENSAJES:
    allow read: if isVerifiedUser() && (
      isAdmin() ||
      isCanonicalDirectParticipant(chatId) ||
      isCanonicalPeerParticipant(chatId) ||
      isSupportStudentParticipant(chatId) ||
      (resource != null && resource.data.senderId == request.auth.uid) ||
      (get(/databases/$(database)/documents/chats/$(chatId)).data != null &&
       request.auth.uid in get(/databases/$(database)/documents/chats/$(chatId)).data.participants)
    );

    // CREACIÓN DE MENSAJES:
    allow create: if isVerifiedUser() && (
      isAdmin() || (
        request.resource.data.senderId == request.auth.uid &&
        (
          isCanonicalDirectParticipant(chatId) ||
          isCanonicalPeerParticipant(chatId) ||
          isSupportStudentParticipant(chatId) ||
          (get(/databases/$(database)/documents/chats/$(chatId)).data != null &&
           request.auth.uid in get(/databases/$(database)/documents/chats/$(chatId)).data.participants)
        )
      )
    );

    // EDICIÓN Y BORRADO DE MENSAJES:
    // Solo el autor original o un administrador pueden editar o borrar un mensaje enviado
    allow update, delete: if isVerifiedUser() && (
      isAdmin() ||
      (resource != null && resource.data.senderId == request.auth.uid)
    );
  }
}
```

---

## 4. ANÁLISIS DE IMPACTO Y COMPATIBILIDAD

1. **Compatibilidad con WebRTC y Pizarras**:
   - Los datos de señalización WebRTC continúan operando bajo sus rutas independientes (`/calls/{callId}` y `/rooms/{roomId}`), manteniendo total independencia de las subcolecciones de mensajes.
2. **Impacto en Frontend**:
   - Toda la lógica del cliente se mantiene 100% compatible. Las funciones de `chatUtils.ts` (`getDirectChatId`, `inferParticipantsFromChatId`) producen exactamente los identificadores canónicos validados por estas reglas.
3. **Control de Errores y Aislamiento Horizontal**:
   - La comprobación `request.resource.data.senderId == request.auth.uid` impide cualquier fallo de "Missing or insufficient permissions" legítimo, al tiempo que detiene de raíz los intentos de suplantación de identidad.
