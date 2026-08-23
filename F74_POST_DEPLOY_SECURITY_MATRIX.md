# FASE F74 — MATRIZ DE SEGURIDAD POST-DESPLIEGUE
## PROYECTO: AulaInfinity
**Fecha de Generación**: 2026-08-23T02:29:35-07:00  

Estados posibles:
- `PASS`: Verificado mediante tests automatizados o validación estática de reglas.
- `FAIL`: Fallo de seguridad o discrepancia.
- `NOT_EXECUTED`: Prueba en vivo de escritura contra producción no ejecutada para evitar contaminación de datos.
- `NOT_VERIFIABLE`: Imposible de comprobar con el arnés actual.

---

### MATRIZ DE EVALUACIÓN POST-DEPLOY (30 ESCENARIOS)

| # | Actor | Recurso | Operación | Resultado Esperado | Resultado Real | Estado | Evidencia / Regla Responsable |
| :-: | :--- | :--- | :--- | :---: | :---: | :---: | :--- |
| 1 | Estudiante A | `/chats/direct_A_B` | READ (GET) | ALLOW | ALLOW | PASS | `isDirectChatIdForUser(chatId)` |
| 2 | Estudiante B | `/chats/direct_A_B` | READ (GET) | ALLOW | ALLOW | PASS | `isDirectChatIdForUser(chatId)` |
| 3 | Docente C (no A/B) | `/chats/direct_A_B` | READ (GET) | DENY | DENY | PASS | Regex anclada falla para UID C |
| 4 | Docente D (aprobado, no A/B)| `/chats/direct_A_B` | READ (GET) | DENY | DENY | PASS | `isApprovedTeacher()` no otorga bypass en direct |
| 5 | Estudiante Tercero | `/chats/direct_A_B` | READ (GET) | DENY | DENY | PASS | `isDirectChatIdForUser` evalúa false |
| 6 | Estudiante A | `/chats/direct_A_B/messages/m1` | CREATE (`senderId=A`) | ALLOW | ALLOW (Simulado) / NOT_EXECUTED (Live Prod) | PASS / NOT_EXECUTED | `request.resource.data.senderId == request.auth.uid` |
| 7 | Estudiante A | `/chats/direct_A_B/messages/m1` | CREATE (`senderId=B`) | DENY | DENY | PASS | Fallo de validación de senderId |
| 8 | Estudiante A | `/chats/direct_A_B/messages/m1` | UPDATE (msg propio) | ALLOW | ALLOW | PASS | `resource.data.senderId == request.auth.uid` |
| 9 | Estudiante A | `/chats/direct_A_B/messages/m2` | UPDATE (msg de B) | DENY | DENY | PASS | Fallo de autoría (`resource.data.senderId`) |
| 10 | Estudiante A | `/chats/direct_A_B` | UPDATE (`participants`) | DENY | DENY | PASS | Inmutabilidad de `participants` para no-admin |
| 11 | Estudiante A | `/chats/peer_A_B` | READ (GET) | ALLOW | ALLOW | PASS | `isPeerChatIdForUser(chatId)` |
| 12 | Estudiante B | `/chats/peer_A_B` | READ (GET) | ALLOW | ALLOW | PASS | `isPeerChatIdForUser(chatId)` |
| 13 | Docente C | `/chats/peer_A_B` | READ (GET) | DENY | DENY | PASS | `isPeerChatIdForUser` evalúa false |
| 14 | Docente D (aprobado) | `/chats/peer_A_B` | READ (GET) | DENY | DENY | PASS | `isApprovedTeacher()` excluido de peer |
| 15 | Administrador | `/chats/peer_A_B` | READ (GET) | ALLOW | ALLOW | PASS | `isAdmin()` (Custom Claim verificado) |
| 16 | Estudiante A | `/chats/peer_C_D` | READ (GET) | DENY | DENY | PASS | Regex peer anclada con `^` y `$` bloquea acceso |
| 17 | Estudiante A | `/chats/support_A` | READ (GET) | ALLOW | ALLOW | PASS | `isSupportChatForStudent(chatId)` |
| 18 | Estudiante B | `/chats/support_A` | READ (GET) | DENY | DENY | PASS | UID no coincide con prefijo `support_` |
| 19 | Docente Aprobado D | `/chats/support_A` | READ (GET) | ALLOW | ALLOW | PASS | `isSupportChatForApprovedTeacher(chatId)` |
| 20 | Administrador | `/chats/support_A` | READ (GET) | ALLOW | ALLOW | PASS | `isAdmin()` |
| 21 | Docente A | `/chats/teacher_A` | READ (GET) | ALLOW | ALLOW | PASS | `isTeacherCoordinationChat` (`teacher_${uid}`) |
| 22 | Docente B | `/chats/teacher_A` | READ (GET) | DENY | DENY | PASS | `isTeacherCoordinationChat` restringe a propio UID |
| 23 | Estudiante A | `/chats/teacher_A` | READ (GET) | DENY | DENY | PASS | Fallo de `isApprovedTeacher()` |
| 24 | Docente Aprobado A | `/chats/sala_profesores_coordinacion` | READ (GET) | ALLOW | ALLOW | PASS | `isTeacherCoordinationChat` (sala explícita) |
| 25 | Estudiante A | `/chats/sala_profesores_coordinacion` | READ (GET) | DENY | DENY | PASS | No docente recibe DENY |
| 26 | Usuario A | `/firestore_direct_messages/m1` | READ / WRITE (ajeno) | DENY | DENY | PASS | `isParticipant()` / `isDirectChatIdForUser` |
| 27 | Usuario A | `/chats/direct_B_C/signal/s1` | READ / WRITE | DENY | DENY | PASS | `isChatParticipant()` evalúa false |
| 28 | Estudiante A | `/rooms/room_B` | READ / JOIN | DENY | DENY | PASS | `isRoomParticipant()` evalúa false |
| 29 | Estudiante A | `/calls/call_B` | READ / WRITE | DENY | DENY | PASS | `isCallParticipant()` evalúa false |
| 30 | Usuario Anónimo / Intruso | `/cualquier_ruta_no_declarada` | READ / WRITE | DENY | DENY | PASS | Default Deny (`match /{document=**}`) |
