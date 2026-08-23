const fs = require('fs');
let rules = fs.readFileSync('firestore.rules', 'utf8');

const regexes = [
  /match \/conversations\/\{convId\} {\n\s*allow read, write: if isVerifiedUser\(\) && \(\n\s*isAdmin\(\) \|\|\n\s*isDirectChatIdForUser\(convId\) \|\|\n\s*isSupportChatForStudent\(convId\) \|\|\n\s*\(isSupportChatId\(convId\) && isApprovedTeacher\(\)\) \|\|\n\s*isParticipant\(resource.data\)\n\s*\);/g,
  /match \/firestore_conversations\/\{convId\} {\n\s*allow read, write: if isVerifiedUser\(\) && \(\n\s*isAdmin\(\) \|\|\n\s*isDirectChatIdForUser\(convId\) \|\|\n\s*isSupportChatForStudent\(convId\) \|\|\n\s*\(isSupportChatId\(convId\) && isApprovedTeacher\(\)\) \|\|\n\s*isParticipant\(resource.data\)\n\s*\);/g,
  /match \/firestore_peer_conversations\/\{convId\} {\n\s*allow read, write: if isVerifiedUser\(\) && \(\n\s*isAdmin\(\) \|\|\n\s*isPeerChatIdForUser\(convId\) \|\|\n\s*\(resource != null && resource.data.participants is list && request.auth.uid in resource.data.participants\)\n\s*\);/g,
  /match \/firestore_teacher_conversations\/\{convId\} {\n\s*allow read, write: if isAdmin\(\) \|\| \(isApprovedTeacher\(\) && \(\n\s*convId == 'sala_profesores_coordinacion' \|\|\n\s*convId == 'teacher_' \+ request.auth.uid \|\|\n\s*isParticipant\(resource.data\)\n\s*\)\);/g
];

const replacements = [
  `match /conversations/{convId} {
      allow read, create, delete: if isVerifiedUser() && (
        isAdmin() ||
        isDirectChatIdForUser(convId) ||
        isSupportChatForStudent(convId) ||
        (isSupportChatId(convId) && isApprovedTeacher()) ||
        isParticipant(resource.data)
      );
      allow update: if isVerifiedUser() && (
        isAdmin() ||
        isDirectChatIdForUser(convId) ||
        isSupportChatForStudent(convId) ||
        (isSupportChatId(convId) && isApprovedTeacher()) ||
        isParticipant(resource.data)
      ) && (
        (!('lastMessageTimestamp' in request.resource.data) || request.resource.data.lastMessageTimestamp <= request.time) &&
        (!('updatedAt' in request.resource.data) || request.resource.data.updatedAt <= request.time)
      );`,
  `match /firestore_conversations/{convId} {
      allow read, create, delete: if isVerifiedUser() && (
        isAdmin() ||
        isDirectChatIdForUser(convId) ||
        isSupportChatForStudent(convId) ||
        (isSupportChatId(convId) && isApprovedTeacher()) ||
        isParticipant(resource.data)
      );
      allow update: if isVerifiedUser() && (
        isAdmin() ||
        isDirectChatIdForUser(convId) ||
        isSupportChatForStudent(convId) ||
        (isSupportChatId(convId) && isApprovedTeacher()) ||
        isParticipant(resource.data)
      ) && (
        (!('lastMessageTimestamp' in request.resource.data) || request.resource.data.lastMessageTimestamp <= request.time) &&
        (!('updatedAt' in request.resource.data) || request.resource.data.updatedAt <= request.time)
      );`,
  `match /firestore_peer_conversations/{convId} {
      allow read, create, delete: if isVerifiedUser() && (
        isAdmin() ||
        isPeerChatIdForUser(convId) ||
        (resource != null && resource.data.participants is list && request.auth.uid in resource.data.participants)
      );
      allow update: if isVerifiedUser() && (
        isAdmin() ||
        isPeerChatIdForUser(convId) ||
        (resource != null && resource.data.participants is list && request.auth.uid in resource.data.participants)
      ) && (
        (!('lastMessageTimestamp' in request.resource.data) || request.resource.data.lastMessageTimestamp <= request.time) &&
        (!('updatedAt' in request.resource.data) || request.resource.data.updatedAt <= request.time)
      );`,
  `match /firestore_teacher_conversations/{convId} {
      allow read, create, delete: if isAdmin() || (isApprovedTeacher() && (
        convId == 'sala_profesores_coordinacion' ||
        convId == 'teacher_' + request.auth.uid ||
        isParticipant(resource.data)
      ));
      allow update: if (isAdmin() || (isApprovedTeacher() && (
        convId == 'sala_profesores_coordinacion' ||
        convId == 'teacher_' + request.auth.uid ||
        isParticipant(resource.data)
      ))) && (
        (!('lastMessageTimestamp' in request.resource.data) || request.resource.data.lastMessageTimestamp <= request.time) &&
        (!('updatedAt' in request.resource.data) || request.resource.data.updatedAt <= request.time)
      );`
];

for(let i=0; i<4; i++) {
  rules = rules.replace(regexes[i], replacements[i]);
}

fs.writeFileSync('firestore.rules', rules);
console.log('done2');
