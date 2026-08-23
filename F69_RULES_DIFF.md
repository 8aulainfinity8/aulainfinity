# F69 — DIFERENCIAS DETALLADAS EN FIRESTORE RULES (RULES DIFF)

Este documento detalla todas las modificaciones quirúrgicas aplicadas a `firestore.rules` durante la **Fase F69**, mitigando las vulnerabilidades IDOR, autorización por substring y bypass de roles documentadas en `CHAT_RULES_GAP_ANALYSIS.md`.

---

## 1. Introducción de Funciones Helper Canónicas

### Eliminación del enfoque genérico por substring `isIdParticipant` para Chats
Se añadieron validaciones canónicas con límites de tokens exactos (`^...$`) y ligaduras de rol:

```diff
+    // Canonical communication helpers (Fase F69)
+    function isDirectChatIdForUser(chatId) {
+      return isVerifiedUser() && (
+        chatId.matches('^direct_' + request.auth.uid + '_[a-zA-Z0-9_-]+$') ||
+        chatId.matches('^direct_[a-zA-Z0-9_-]+_' + request.auth.uid + '$') ||
+        chatId.matches('^' + request.auth.uid + '_[a-zA-Z0-9_-]+$') ||
+        chatId.matches('^[a-zA-Z0-9_-]+_' + request.auth.uid + '$')
+      );
+    }
+
+    function isPeerChatIdForUser(chatId) {
+      return isVerifiedUser() && (
+        chatId.matches('^peer_' + request.auth.uid + '_[a-zA-Z0-9_-]+$') ||
+        chatId.matches('^peer_[a-zA-Z0-9_-]+_' + request.auth.uid + '$')
+      );
+    }
+
+    function isSupportChatForStudent(chatId) {
+      return isVerifiedUser() &&
+             request.auth.token.role == 'student' &&
+             chatId == 'support_' + request.auth.uid;
+    }
+
+    function isSupportChatId(chatId) {
+      return chatId.matches('^support_[a-zA-Z0-9_-]+$');
+    }
+
+    function isTeacherCoordinationChat(chatId) {
+      return isApprovedTeacher() && (
+        chatId == 'sala_profesores_coordinacion' ||
+        chatId == 'teacher_' + request.auth.uid ||
+        chatId.matches('^teacher_[a-zA-Z0-9_-]+$')
+      );
+    }
```

---

## 2. Refactorización de `/chats/{chatId}`

```diff
     match /chats/{chatId} {
-      // Función para validar pertenencia al chat (recurso existente o por ID)
+      // Función para validar pertenencia legítima al chat
       function isChatParticipant() {
         return isVerifiedUser() && (
           isAdmin() ||
-          isIdParticipant(chatId) ||
+          isDirectChatIdForUser(chatId) ||
+          isPeerChatIdForUser(chatId) ||
+          isSupportChatForStudent(chatId) ||
+          (isSupportChatId(chatId) && isApprovedTeacher()) ||
+          isTeacherCoordinationChat(chatId) ||
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
 
       // Lectura: solo participantes legítimos o admin
       allow get, list: if isChatParticipant();
 
-      // Creación: el usuario debe ser parte de los participantes o del chatId
-      allow create: if isVerifiedUser() && (
-        isAdmin() ||
-        (
-          (isIdParticipant(chatId) || (request.resource.data.participants is list && request.auth.uid in request.resource.data.participants)) &&
-          (!('participants' in request.resource.data) || (request.resource.data.participants is list && request.auth.uid in request.resource.data.participants))
-        )
-      );
+      // Creación: exige creador verificado, chatId canónico y pertenencia a participants
+      allow create: if isVerifiedUser() && (
+        isAdmin() || (
+          (request.resource.data.createdBy is string && request.resource.data.createdBy == request.auth.uid) &&
+          (
+            isDirectChatIdForUser(chatId) ||
+            isPeerChatIdForUser(chatId) ||
+            isSupportChatForStudent(chatId) ||
+            (isSupportChatId(chatId) && isApprovedTeacher()) ||
+            isTeacherCoordinationChat(chatId) ||
+            isEnrolledInCourse(chatId) ||
+            isTeacherOfCourse(chatId)
+          ) &&
+          (!('participants' in request.resource.data) || (request.resource.data.participants is list && request.auth.uid in request.resource.data.participants))
+        )
+      );
 
       // Actualización: participantes pueden actualizar estado operativo (lastMessage, unreadCount, etc.)
-      // pero participants, type, chatId, createdBy, createdAt son inmutables para no-admins.
+      // pero participants, participantIds, type, chatId, createdBy, createdAt son inmutables para no-admins.
       allow update: if isChatParticipant() && (
         isAdmin() || (
           (!('participants' in request.resource.data) || !('participants' in resource.data) || request.resource.data.participants == resource.data.participants) &&
+          (!('participantIds' in request.resource.data) || !('participantIds' in resource.data) || request.resource.data.participantIds == resource.data.participantIds) &&
           (!('type' in request.resource.data) || !('type' in resource.data) || request.resource.data.type == resource.data.type) &&
           (!('chatId' in request.resource.data) || !('chatId' in resource.data) || request.resource.data.chatId == resource.data.chatId) &&
           (!('createdBy' in request.resource.data) || !('createdBy' in resource.data) || request.resource.data.createdBy == resource.data.createdBy) &&
           (!('createdAt' in request.resource.data) || !('createdAt' in resource.data) || request.resource.data.createdAt == resource.data.createdAt)
         )
       );
```

---

## 3. Subcolección `/chats/{chatId}/messages/{messageId}`

```diff
       match /messages/{messageId} {
         // Lectura de mensajes: participantes del chat o admin
         allow get, list: if isVerifiedUser() && (
           isAdmin() ||
-          isIdParticipant(chatId) ||
+          isDirectChatIdForUser(chatId) ||
+          isPeerChatIdForUser(chatId) ||
+          isSupportChatForStudent(chatId) ||
+          (isSupportChatId(chatId) && isApprovedTeacher()) ||
+          isTeacherCoordinationChat(chatId) ||
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
 
         // Creación de mensaje: debe ser participante del chat y senderId DEBE coincidir con el usuario autenticado
         allow create: if isVerifiedUser() && (
           isAdmin() || (
-            (isIdParticipant(chatId) ||
-             isEnrolledInCourse(chatId) ||
-             isTeacherOfCourse(chatId) ||
-             (request.resource.data.participants is list && request.auth.uid in request.resource.data.participants) ||
-             (exists(/databases/$(database)/documents/chats/$(chatId)) &&
-              get(/databases/$(database)/documents/chats/$(chatId)).data.get('participants', []) is list &&
-              request.auth.uid in get(/databases/$(database)/documents/chats/$(chatId)).data.get('participants', []))) &&
-            request.resource.data.senderId == request.auth.uid
+            request.resource.data.senderId == request.auth.uid &&
+            (!('chatId' in request.resource.data) || request.resource.data.chatId == chatId) &&
+            (
+              isDirectChatIdForUser(chatId) ||
+              isPeerChatIdForUser(chatId) ||
+              isSupportChatForStudent(chatId) ||
+              (isSupportChatId(chatId) && isApprovedTeacher()) ||
+              isTeacherCoordinationChat(chatId) ||
+              isEnrolledInCourse(chatId) ||
+              isTeacherOfCourse(chatId) ||
+              (exists(/databases/$(database)/documents/chats/$(chatId)) &&
+               get(/databases/$(database)/documents/chats/$(chatId)).data.get('participants', []) is list &&
+               request.auth.uid in get(/databases/$(database)/documents/chats/$(chatId)).data.get('participants', []))
+            )
           )
         );
 
         // Edición de mensaje: solo el autor original (o admin), inmutabilidad de senderId y campos críticos
         allow update: if isVerifiedUser() && (
           isAdmin() || (
             resource.data.senderId == request.auth.uid &&
             request.resource.data.senderId == resource.data.senderId &&
             (!('chatId' in request.resource.data) || !('chatId' in resource.data) || request.resource.data.chatId == resource.data.chatId) &&
-            (!('timestamp' in request.resource.data) || !('timestamp' in resource.data) || request.resource.data.timestamp == resource.data.timestamp)
+            (!('timestamp' in request.resource.data) || !('timestamp' in resource.data) || request.resource.data.timestamp == resource.data.timestamp) &&
+            (!('senderRole' in request.resource.data) || !('senderRole' in resource.data) || request.resource.data.senderRole == resource.data.senderRole) &&
+            (!('type' in request.resource.data) || !('type' in resource.data) || request.resource.data.type == resource.data.type)
           )
         );
```

---

## 4. Colecciones de Sincronización y Compatibilidad

### 4.1 Eliminación de Bypass de Docentes en Chats de Pares (`firestore_peer_conversations` y `firestore_peer_messages`)
```diff
     match /firestore_peer_conversations/{convId} {
-      allow read, write: if isVerifiedUser() && (isIdParticipant(convId) || isParticipant(resource.data) || isApprovedTeacher());
+      allow read, write: if isVerifiedUser() && (
+        isAdmin() ||
+        isPeerChatIdForUser(convId) ||
+        (resource != null && resource.data.participants is list && request.auth.uid in resource.data.participants)
+      );
     }
 
     match /firestore_peer_messages/{msgId} {
-      allow read, write: if isVerifiedUser() && (isIdParticipant(msgId) || isParticipant(resource.data) || isApprovedTeacher());
+      allow read, write: if isVerifiedUser() && (
+        isAdmin() ||
+        isPeerChatIdForUser(msgId) ||
+        (resource != null && resource.data.participants is list && request.auth.uid in resource.data.participants)
+      );
     }
```

### 4.2 Restricción Estricta de Sala de Profesores (`firestore_teacher_conversations` y `firestore_teacher_messages`)
```diff
     match /firestore_teacher_conversations/{convId} {
-      allow read, write: if isApprovedTeacher() || (isVerifiedUser() && (isIdParticipant(convId) || isParticipant(resource.data)));
+      allow read, write: if isAdmin() || (isApprovedTeacher() && (
+        convId == 'sala_profesores_coordinacion' ||
+        convId == 'teacher_' + request.auth.uid ||
+        convId.matches('^teacher_[a-zA-Z0-9_-]+$') ||
+        isParticipant(resource.data)
+      ));
     }
 
     match /firestore_teacher_messages/{msgId} {
-      allow read, write: if isApprovedTeacher() || (isVerifiedUser() && (isIdParticipant(msgId) || isParticipant(resource.data)));
+      allow read, write: if isAdmin() || (isApprovedTeacher() && (
+        msgId == 'sala_profesores_coordinacion' ||
+        msgId == 'teacher_' + request.auth.uid ||
+        msgId.matches('^teacher_[a-zA-Z0-9_-]+$') ||
+        isParticipant(resource.data)
+      ));
     }
```
