# INFORME DE AUDITORÍA FORENSE — CHATS DE GRUPOS DE ESTUDIO (FASE F75)

**Proyecto:** AulaInfinity  
**Firebase Project ID:** `aulainfinity8-a6ac0`  
**Firestore Database ID:** `ai-studio-aulainfinity-6be7791f-ef3e-4fc4-b45b-98918b1b57ca`  
**Fecha:** 23 de Agosto de 2026  
**Auditor:** Ingeniero Senior Full-Stack & Auditor de Seguridad  
**Fase:** F75 — Auditoría Forense de Chats de Grupos de Estudio  
**Modalidad:** ESTRICTAMENTE LECTURA Y ANÁLISIS FORENSE (Sin modificaciones de código, reglas ni datos)  

---

## 1. RESUMEN EJECUTIVO Y HALLAZGOS CRÍTICOS

La auditoría forense realizada sobre el sistema de chats de grupos en AulaInfinity ha identificado con precisión matemática y evidencias byte a byte la causa de las respuestas automáticas atribuidas a alumnos ficticios, así como una bifurcación arquitectónica entre dos pantallas de grupos no unificadas:

1. **Origen de las respuestas automáticas y alumnos ficticios:**
   En el componente `src/components/StudyGroupsPage.tsx` (ruta `/app/study-groups`, accesible desde el menú lateral como *"Grupos de Estudio"*), existe un motor de simulación puramente del lado cliente que:
   - Contiene un listado de nombres falsos (`SEED_MOCK_COMPANION_NAMES`: *"Sofía Martín"*, *"Alejandro Ruiz"*, *"Lucía Fernández"*, *"Marc Gómez"*, *"Daniela Torres"*, *"Javier Serrano"*, *"Marta Beltrán"*).
   - Inyecta respuestas automáticas simuladas mediante un `setTimeout` de 1.8 segundos cada vez que el alumno envía un mensaje (`handleSendMessage`, líneas 306–330).
   - Inyecta respuestas automáticas en segundo plano mediante un temporizador `setInterval` cada 15 segundos con un 20% de probabilidad (`useEffect`, líneas 251–285).
   - Precarga mensajes y grupos ficticios iniciales en `localStorage` si no existen.

2. **Destino de los mensajes ficticios:**
   - **Los mensajes ficticios NO se escriben en Firestore.**
   - Viven exclusivamente en el estado React del cliente y en el almacenamiento local del navegador (`localStorage` bajo las claves `aula_study_groups_${subjectId}` y `aula_study_group_msgs_${groupId}`).
   - El administrador y los profesores **NO tienen visibilidad** alguna de estos chats ni de estos mensajes, ya que la pantalla de administración solo consulta Firestore.

3. **Bifurcación de Canales Grupales:**
   - Existen dos sistemas de grupos paralelos:
     - **Sistema A (`StudyGroupsPage.tsx` - `/app/study-groups`):** Grupos temporales por asignatura. Totalmente mockeado, aislado en `localStorage`, desconectado de Firestore y con simulación de bots activa.
     - **Sistema B (`StudentChatPage.tsx` pestaña Grupos - `/app/student-chat` <-> `AdminChatPage.tsx` pestaña Grupos - `/admin/chat`):** Canales permanentes por curso (`chats/{courseId}`). Conectado a Firestore mediante `useChat.ts` (`chats/{courseId}/messages`), pero cuya lista resumen inicial aún lee datos mockeados de `mockDatabase.ts` (`courseGroupMessagesData`).

---

## 2. RESPUESTAS DETALLADAS A LOS PUNTOS DE LA AUDITORÍA FORENSE

### 1. ¿Por qué aparecen respuestas automáticas atribuidas a alumnos ficticios?
Aparecen debido a dos disparadores programados en `src/components/StudyGroupsPage.tsx`:
- **Disparador reactivo (líneas 306–330):** Al invocar `handleSendMessage`, tras un retardo de `1800ms`, se ejecuta una función que selecciona un nombre aleatorio de `SEED_MOCK_COMPANION_NAMES` y una frase de `SEED_SIMULATED_RESPONSES` adaptada a la asignatura (Matemáticas, Física y Química, Biología o Default) y la añade al array de mensajes.
- **Disparador periódico (líneas 251–285):** Un `setInterval` ejecutado cada 15 segundos evalúa `Math.random() > 0.2` para insertar mensajes espontáneos de compañeros ficticios en el chat activo.

### 2. ¿De dónde proceden esos alumnos ficticios?
Proceden de estructuras estáticas codificadas en:
- `src/components/StudyGroupsPage.tsx` (líneas 87–95): Array constante `SEED_MOCK_COMPANION_NAMES`.
- `src/components/StudyGroupsPage.tsx` (líneas 97–104): Array constante `SEED_COMPANION_STATUSES`.
- `src/services/mockDatabase.ts` (líneas 2816–2859): Array `courseGroupMessagesData` con identificadores `student1` ("Lucía G."), `student2` ("Carlos M."), `student3` ("Sofía R.").

### 3. ¿Si los mensajes ficticios realmente se escriben en Firestore o solamente aparecen en el estado/UI?
**Evidencia confirmada:** Los mensajes ficticios **NUNCA se escriben en Firestore**.
- En `StudyGroupsPage.tsx` no existe ningún import de `firebase/firestore` ni llamada a `addDoc`, `setDoc` o `collection`.
- Todo se persiste en `window.localStorage` con `localStorage.setItem('aula_study_group_msgs_' + groupId, JSON.stringify(updated))`.
- En `StudentChatPage.tsx`, los datos del mock database (`courseGroupMessagesData`) solo se consultan en memoria a través de `api.fetchCourseGroupConversations`.

### 4. ¿Qué colección/documento representa actualmente un chat de grupo en Firestore?
- **Colección raíz:** `chats`
- **Documento de metadatos:** `/chats/{courseId}` (donde `courseId` es el identificador del curso, por ejemplo `ebau`, `bach_1`, `bach_2`, `eso_3`, `eso_4`).
- **Subcolección de mensajes:** `/chats/{courseId}/messages/{messageId}`.

### 5. ¿Qué `chatId` utiliza el alumno?
- En `/app/study-groups` (`StudyGroupsPage`): Utiliza IDs de mock como `group_default_${subjectId}` o `group_temp_${Date.now()}`.
- En `/app/student-chat` (`StudentChatPage` - Grupos): Utiliza el ID del curso (`courseId`, ej: `ebau`, `bach_1`).
- En `/app/student-chat` (`StudentChatPage` - Privados): Utiliza `peer_${[uid1, uid2].sort().join('_')}`.
- En `/app/chat` (`ChatPage` - Tutoría Directa): Utiliza `direct_${[studentUid, teacherUid].sort().join('_')}` o `support_${studentUid}`.

### 6. ¿Qué `chatId` utiliza el administrador?
- En `/admin/chat` (`AdminChatPage` - Pestaña Grupos): Utiliza el ID del curso (`course.id`, ej: `ebau`, `bach_1`).
- En `/admin/chat` (`AdminChatPage` - Pestaña Alumnos 1a1): Utiliza `direct_${[studentUid, teacherUid].sort().join('_')}`, `support_${studentUid}` o `peer_...`.
- En `/admin/chat` (`AdminChatPage` - Pestaña Profesores): Utiliza `sala_profesores_coordinacion` o `teacher_${uid1}_${uid2}`.

### 7. ¿Si alumno y administrador están utilizando exactamente el mismo recurso?
- **En Canales de Curso (`StudentChatPage` Grupos vs `AdminChatPage` Grupos):** SÍ, ambos acceden a `/chats/{courseId}/messages` en Firestore cuando abren el canal.
- **En Grupos de Estudio (`StudyGroupsPage`):** NO. El alumno está en una pantalla aislada en `localStorage` a la que el administrador no tiene ningún tipo de acceso ni sincronización.

### 8. ¿Si existen colecciones paralelas para Admin?
No existen colecciones paralelas en Firestore. Ambos roles leen de la colección unificada `chats`. La divergencia ocurría en el frontend por la existencia de la ruta aislada `/app/study-groups`.

### 9. Flujo completo Alumno -> Administrador en Grupos de Curso
1. El alumno abre `/app/student-chat`, selecciona la pestaña "Grupos" y hace clic en un curso (ej: `ebau`).
2. El hook `useChat('ebau', studentId)` suscribe un listener `onSnapshot` a `chats/ebau/messages`.
3. El alumno redacta un mensaje y envía el formulario.
4. `useChat.sendMessage` ejecuta `setDoc` creando un nuevo documento en `chats/ebau/messages/{msgId}` con `serverTimestamp()`, `senderId`, `senderRole: 'student'`, `text` y `participants`.
5. En `/admin/chat` (pestaña Grupos), el administrador que tiene abierto `ebau` recibe el mensaje en tiempo real a través del listener de Firestore `onSnapshot`.

### 10. Flujo inverso Administrador -> Alumno en Grupos de Curso
1. El administrador en `/admin/chat` (pestaña Grupos) selecciona `ebau`.
2. Escribe y envía un mensaje.
3. `useChat.sendMessage` crea un documento en `chats/ebau/messages/{msgId}` con `senderRole: 'admin'`.
4. El alumno en `/app/student-chat` recibe el mensaje instantáneamente en su UI vía `onSnapshot`.

### 11. ¿Existe IA, mock data, seed data, demo data o simulación de alumnos?
- **Sí, plenamente identificado:**
  1. `StudyGroupsPage.tsx`:
     - `SEED_SIMULATED_RESPONSES` (simulación de respuestas temáticas).
     - `SEED_MOCK_COMPANION_NAMES` (simulación de 7 identidades de alumnos).
     - `SEED_COMPANION_STATUSES` (estados de conexión ficticios).
     - `setInterval` de 15s y `setTimeout` de 1.8s (generadores de mensajes falsos).
  2. `mockDatabase.ts`:
     - `courseGroupMessagesData` (mensajes mock precargados).
  3. `geminiService.ts`:
     - Fallback local de respuestas simuladas para el Tutor IA (`askTutor` / `callSimpleAI`) cuando no hay conexión a Cloud Functions.

---

## 3. INTEGRIDAD DE SEGURIDAD Y HASHES CRIPTOGRÁFICOS

Se ha verificado la integridad de los archivos de seguridad y configuración:

| Archivo | SHA-256 Actual | Estado |
| :--- | :--- | :--- |
| `firestore.rules` | `e2d89b5681a58aca7741724cc80ffac0bbcd8cae6834582e786fbf319804e66f` | **INTACTO / CERTIFICADO (F72-F73)** |
| `storage.rules` | `eee9cbafcd605b08989fb732e7987910a7c90be999b2d4c8871dac583e49ea5e` | **INTACTO** |
| `firebase.json` | `3cc50ac32a2b138f5e60e6e637e913c90304d6e8efce1b9853c7384fa13cfadf` | **INTACTO** |

---

## 4. PROPUESTA DE PLAN DE CORRECCIÓN PARA LA FASE F76 (SIN IMPLEMENTAR EN F75)

Para eliminar por completo las respuestas de alumnos ficticios y unificar la experiencia de chats grupales en tiempo real de forma segura y limpia:

1. **Eliminar el motor de simulación de `StudyGroupsPage.tsx`:**
   - Retirar `SEED_SIMULATED_RESPONSES`, `SEED_MOCK_COMPANION_NAMES`, `SEED_COMPANION_STATUSES`.
   - Eliminar los temporizadores `setInterval` y `setTimeout` que generan réplicas automáticas falsas.
2. **Conectar los Grupos de Estudio o Canales a Firestore:**
   - O bien migrar `StudyGroupsPage.tsx` para que consuma colecciones reales de Firestore (`study_groups` o `chats/{courseId}`) mediante `useChat.ts`.
   - O bien unificar el acceso de "Grupos de Estudio" del Sidebar para que dirija directamente a la pestaña "Grupos" de `StudentChatPage.tsx` (`/app/student-chat`), que ya está cableada a Firestore con soporte para videollamadas y pizarras.
3. **Limpiar datos mock de inicialización:**
   - Asegurar que la lista de conversaciones de grupos en `StudentChatPage.tsx` lea los últimos mensajes directamente desde Firestore en lugar de `courseGroupMessagesData` de `mockDatabase.ts`.

---

## 5. CONCLUSIÓN Y ESTADO DE LA FASE F75

La auditoría forense se ha completado en modo estrictamente de lectura, documentando de forma fehaciente todas las fuentes de simulación sin alterar ninguna línea de código de producción, reglas de seguridad ni datos en la base de datos.

**Estado:** 🟢 APROBADO (AUDITORÍA FORENSE COMPLETADA)
