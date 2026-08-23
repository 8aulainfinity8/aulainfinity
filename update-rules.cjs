const fs = require('fs');
let rules = fs.readFileSync('firestore.rules', 'utf8');

// 1. Update /firestore_direct_messages
rules = rules.replace(
`    match /firestore_direct_messages/{msgId} {
      allow read, write: if isVerifiedUser() && (
        isAdmin() ||
        isDirectChatIdForUser(msgId) ||
        isParticipant(resource.data)
      );
    }`,
`    match /firestore_direct_messages/{msgId} {
      allow read, create: if isVerifiedUser() && (
        isAdmin() ||
        isDirectChatIdForUser(msgId) ||
        isParticipant(request.resource.data)
      );
      allow update: if isVerifiedUser() && (
        isAdmin() ||
        isDirectChatIdForUser(msgId) ||
        isParticipant(resource.data)
      );
      allow delete: if isVerifiedUser() && (
        isAdmin() ||
        (resource != null && resource.data.senderId == request.auth.uid)
      );
    }`
);

// 2. Update /firestore_peer_messages
rules = rules.replace(
`    match /firestore_peer_messages/{msgId} {
      allow read, write: if isVerifiedUser() && (
        isAdmin() ||
        isPeerChatIdForUser(msgId) ||
        (resource != null && resource.data.participants is list && request.auth.uid in resource.data.participants)
      );
    }`,
`    match /firestore_peer_messages/{msgId} {
      allow read, create: if isVerifiedUser() && (
        isAdmin() ||
        isPeerChatIdForUser(msgId) ||
        (request.resource != null && request.resource.data.participants is list && request.auth.uid in request.resource.data.participants)
      );
      allow update: if isVerifiedUser() && (
        isAdmin() ||
        isPeerChatIdForUser(msgId) ||
        (resource != null && resource.data.participants is list && request.auth.uid in resource.data.participants)
      );
      allow delete: if isVerifiedUser() && (
        isAdmin() ||
        (resource != null && resource.data.senderId == request.auth.uid)
      );
    }`
);

// 3. Update /firestore_teacher_messages
rules = rules.replace(
`    match /firestore_teacher_messages/{msgId} {
      allow read, write: if isAdmin() || (isApprovedTeacher() && (
        msgId == 'sala_profesores_coordinacion' ||
        msgId == 'teacher_' + request.auth.uid ||
        isParticipant(resource.data)
      ));
    }`,
`    match /firestore_teacher_messages/{msgId} {
      allow read, create, update: if isAdmin() || (isApprovedTeacher() && (
        msgId == 'sala_profesores_coordinacion' ||
        msgId == 'teacher_' + request.auth.uid ||
        isParticipant(resource.data)
      ));
      allow delete: if isAdmin() || (isApprovedTeacher() && (resource != null && resource.data.senderId == request.auth.uid));
    }`
);

// 4. Update /firestore_course_messages
rules = rules.replace(
`       allow delete: if isVerifiedUser() && (
         isAdmin() ||
         isEnrolledInCourse(resource.data.courseId) ||
         isTeacherOfCourse(resource.data.courseId)
       );`,
`       allow delete: if isVerifiedUser() && (
         isAdmin() ||
         (resource != null && resource.data.senderId == request.auth.uid)
       );`
);

// 5. Protect timestamps in chats
rules = rules.replace(
`          (!('createdAt' in request.resource.data) || !('createdAt' in resource.data) || request.resource.data.createdAt == resource.data.createdAt)
        )
      );`,
`          (!('createdAt' in request.resource.data) || !('createdAt' in resource.data) || request.resource.data.createdAt == resource.data.createdAt) &&
          (!('lastMessageTimestamp' in request.resource.data) || request.resource.data.lastMessageTimestamp <= request.time) &&
          (!('updatedAt' in request.resource.data) || request.resource.data.updatedAt <= request.time)
        )
      );`
);

fs.writeFileSync('firestore.rules', rules);
console.log('done');
