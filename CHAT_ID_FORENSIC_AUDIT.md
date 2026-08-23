# AUDITORÍA FORENSE DE FORMATOS DE ID DE CHAT — AULAINFINITY (FASE F67)

**Fecha:** 22 de Agosto de 2026  
**Estado:** VALIDACIÓN FORENSE COMPLETADA (Pre-Rules)  
**Objetivo:** Mapeo exhaustivo de todos los formatos de identificadores de conversación, generadores, participantes y consumidores en el codebase de AulaInfinity.

---

## 1. Tabla Maestra de Formatos de Chat ID

| Tipo de Chat | Formato Canónico / Patrón | Ejemplo Real en Código | Creador / Iniciador | Participantes Reales (`participants`) | Persistencia y Rutas Firestore | Consumidores Frontend / Backend |
|---|---|---|---|---|---|---|
| **DIRECT** (Tutoría Alumno-Profesor 1:1) | `direct_${[uid1, uid2].sort().join('_')}` (orden lexicográfico canónico) | `direct_student1_teacher1` | `ChatPage.tsx`, `ChatList.tsx`, `AdminChatPage.tsx` vía `getDirectChatId(studentUid, teacherUid)` | `[studentUid, teacherUid]` (exactamente 2) | Documento en `chats/{chatId}` con colección hija `chats/{chatId}/messages/{messageId}`. Metadata en `firestore_conversations/{chatId}` | `ChatPage.tsx`, `AdminChatPage.tsx`, `useChat.ts`, `useVoiceCall.ts`, `firestoreSync.ts` |
| **PEER** (Estudiante-Estudiante 1:1) | `peer_${[student1, student2].sort().join('_')}` | `peer_student1_student3` | `StudentChatPage.tsx` (al agregar compañero o hacer clic en chat directo) | `[studentId1, studentId2]` (exactamente 2) | Documento en `chats/{chatId}` con subcolección `messages/{messageId}`, sync legado en `firestore_peer_messages` | `StudentChatPage.tsx`, `useChat.ts`, `firestoreSync.ts`, `mockDatabase.ts` |
| **SUPPORT** (Soporte Técnico / Dudas Generales) | `support_${studentId}` | `support_student1` | `ChatPage.tsx`, `mockDatabase.ts` (`dbFetchConversations`), `AdminChatPage.tsx` | Alumno (`studentId`) + Profesores/Administradores autorizados | `chats/{chatId}` y subcolección `messages`. Metadata en `firestore_conversations` | `ChatPage.tsx`, `ChatList.tsx`, `AdminChatPage.tsx`, `useChat.ts`, `firestoreSync.ts` |
| **TEACHER** (Coordinación Docente 1:1 o Sala General) | `teacher_${teacherId}` ó `sala_profesores_coordinacion` | `teacher_prof_martinez`, `sala_profesores_coordinacion` | `AdminChatPage.tsx` (Tab Docentes) | Docentes aprobados (`role == 'teacher'`) y Administradores (`role == 'admin'`) | `chats/{chatId}/messages` y colección `teacher_coordination_messages` / `firestoreSync.ts` | `AdminChatPage.tsx`, `api.ts`, `mockDatabase.ts` |
| **GROUP** / **COURSE** (Canal Grupal de Asignatura) | `${courseId}` (e.g., `matematicas_2bach`, `ebau`, `fisica_quimica`) | `ebau`, `matematicas` | `StudentChatPage.tsx` (Tab Grupal), `AdminChatPage.tsx` (Tab Grupal) | Estudiantes matriculados en el curso (`enrolledCourseIds`), Docentes y Admins | `chats/{courseId}/messages`, colecciones `course_group_messages` y `firestore_course_groups` | `StudentChatPage.tsx`, `AdminChatPage.tsx`, `mockDatabase.ts`, `firestoreSync.ts` |
| **WEBRTC** (Señalización 1:1 y Grupal) | Señal 1:1: `chats/{chatId}/signal/callData`<br>Voz Grupal: `voice_group_calls/{roomId}` | `chats/direct_student1_teacher1/signal/callData`<br>`voice_group_calls/ebau` | `useVoiceCall.ts`, `VoiceGroupCall.tsx`, `StudentChatPage.tsx`, `AdminChatPage.tsx` | Participantes del chat padre (`chatId`) o alumnos matriculados en `roomId` | Subdocumento `chats/{chatId}/signal/callData` y documento `voice_group_calls/{roomId}` | `useVoiceCall.ts`, `VoiceGroupCall.tsx`, `firestoreSync.ts` |

---

## 2. Análisis Forense Detallado por Componente

### 2.1 `src/utils/chatUtils.ts`
- **Generación de ID:** `getDirectChatId(uid1, uid2)` ordena lexicográficamente los IDs garantizando unicidad bidireccional (`direct_${[uid1, uid2].sort().join('_')}`).
- **Inferencia de Participantes:** `inferParticipantsFromChatId(chatId)` extrae de forma limpia y estricta los IDs sin inyectar UIDs arbitrarios ni añadir el usuario actual si no forma parte del patrón del ID.
- **Resolución de UID:** `resolveUserUid(user)` obtiene el UID real de Firebase Auth (`uid` o `id`).

### 2.2 `src/hooks/useChat.ts`
- **Autenticación e Identidad:** `senderId` se deriva forzosamente de `auth.currentUser.uid` cuando Firebase Auth está activo.
- **Invariante de Pertenencia:** Se valida antes de `sendMessage` que `effectiveSenderId` pertenezca a `targetParticipants` en chats 1:1 (`direct_` y `peer_`), y que corresponda al alumno o admin en `support_`.
- **Ruta Unificada:** Escribe en `chats/{chatId}/messages/{messageId}` y actualiza metadata en `chats/{chatId}` (`lastMessage`, `unreadBy...`, `updatedAt`).

### 2.3 `src/components/ChatPage.tsx` y `src/components/chat/ChatList.tsx`
- **Canales soportados:**
  1. `teacher`: Obtiene el ID canónico con `getDirectChatId(studentId, activeTeacherUid)`.
  2. `support`: Genera `support_${studentId}`.
- **Visualización de no leídos:** Compatible con IDs canónicos `direct_...` y de soporte `support_...`.

### 2.4 `src/components/StudentChatPage.tsx`
- **Chats entre iguales:** Genera `peer_${[studentId, friendId].sort().join('_')}`.
- **Chats grupales:** Utiliza el ID del curso (`enrolledCourseIds`).
- **Verificación de pertenencia:** Función `isConvoForUser` verifica que el alumno esté inscrito o sea parte del array de participantes del chat.

### 2.5 `src/components/admin/AdminChatPage.tsx`
- **Coordinación y Supervisión:**
  - Tab Alumnos: Mapea a `direct_${[studentUid, teacherUid].sort().join('_')}` o `support_${studentUid}`.
  - Tab Docentes: `teacher_${teacherId}` y `sala_profesores_coordinacion`.
  - Tab Grupos: Identificadores de curso (`course.id`).
- **Validación de luz verde:** Docentes deben tener `isApprovedForTutoring !== false` para enviar mensajes.

### 2.6 `src/services/firestoreSync.ts`
- Sincroniza en tiempo real los eventos de Firestore con la base de datos local `dbMock` sin interferir con las operaciones atómicas de `useChat`.
- Monitorea colecciones de compatibilidad y estados de llamadas WebRTC.

---

## 3. Conclusiones y Diagnóstico Forense
1. **Consistencia de IDs:** Todos los puntos generadores de IDs 1:1 (`direct_` y `peer_`) utilizan ordenamiento alfanumérico canónico (`[a, b].sort().join('_')`), eliminando divergencias y duplicaciones de chats.
2. **Seguridad del Remitente:** `useChat.ts` vincula de forma inmutable el `senderId` a `auth.currentUser.uid`, imposibilitando la suplantación de identidad en el payload de mensajes.
3. **Aislamiento Horizontal:** La arquitectura separa formalmente las rutas de datos para alumnos, profesores y administración.
