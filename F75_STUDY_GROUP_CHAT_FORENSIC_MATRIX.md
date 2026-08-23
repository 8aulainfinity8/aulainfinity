# MATRIZ FORENSE DE CHATS DE GRUPOS DE ESTUDIO (FASE F75)

**Proyecto:** AulaInfinity  
**Fecha:** 23 de Agosto de 2026  
**Fase:** F75 — Auditoría Forense de Chats de Grupos de Estudio  
**Estado:** AUDITORÍA COMPLETADA (SOLO LECTURA)  

---

## 1. COMPARATIVA DE ARQUITECTURA DE CANALES Y PANTALLAS DE GRUPOS

| Dimensión | Pantalla `/app/study-groups` (`StudyGroupsPage.tsx`) | Pantalla `/app/student-chat` (`StudentChatPage.tsx`) - Pestaña Grupos | Pantalla `/admin/chat` (`AdminChatPage.tsx`) - Pestaña Grupos |
| :--- | :--- | :--- | :--- |
| **Ruta URL** | `/app/study-groups` | `/app/student-chat` | `/admin/chat` |
| **Componente React** | `StudyGroupsPage.tsx` | `StudentChatPage.tsx` | `AdminChatPage.tsx` |
| **Rol Destinatario** | Alumno | Alumno | Administrador / Profesor |
| **Tipo de Grupo** | Grupos temporales por asignatura (`subjectId`) | Canales de curso inscritos (`courseId`) | Canales de curso de la plataforma (`courseId`) |
| **Persistencia Principal** | `localStorage` (`aula_study_groups_*`, `aula_study_group_msgs_*`) | Firestore (`chats/{courseId}/messages`) + fallback mock local | Firestore (`chats/{courseId}/messages`) |
| **ID de Chat (`chatId`)** | `group_default_${subjectId}` / `group_temp_${Date.now()}` | `ebau`, `bach_1`, `bach_2`, `eso_3`, `eso_4`... (`courseId`) | `ebau`, `bach_1`, `bach_2`, `eso_3`, `eso_4`... (`courseId`) |
| **Generación de Alumnos Ficticios** | **SÍ (Activa y continua)** | **SÍ (En semilla de conversaciones / mock fallback)** | **NO** |
| **Mecanismo de Respuestas Automáticas** | 1. Semilla al abrir grupo vacío (`SEED_MOCK_COMPANION_NAMES`)<br>2. `setInterval` cada 15s (20% prob)<br>3. `setTimeout` (1.8s) tras envío de mensaje | Datos iniciales en `courseGroupMessagesData` de `mockDatabase.ts` | Ninguno (solo lee y escribe mensajes reales de Firestore) |
| **¿Escribe en Firestore?** | **NO (0 escrituras en Firestore)** | **SÍ** (cuando el alumno envía vía `useChat.ts`) | **SÍ** (cuando el admin envía vía `useChat.ts`) |
| **¿Visible por el Administrador?** | **NO (Completamente invisible para Admin)** | **SÍ** (en tiempo real vía Firestore `chats/{courseId}`) | **SÍ** (en tiempo real vía Firestore `chats/{courseId}`) |

---

## 2. MAPA DE GENERADORES DE ALUMNOS Y MENSAJES FICTICIOS

| Archivo Fuente | Líneas Exactas | Constante / Estructura | Contenido / Alumnos Ficticios | Comportamiento en Runtime |
| :--- | :--- | :--- | :--- | :--- |
| `src/components/StudyGroupsPage.tsx` | 51–85 | `SEED_SIMULATED_RESPONSES` | Respuestas predefinidas para `mat`, `fyq`, `bio` y `default` (ej: límites, matrices, ésteres, mitosis). | Inyectadas tras `setTimeout` o por `setInterval`. |
| `src/components/StudyGroupsPage.tsx` | 87–95 | `SEED_MOCK_COMPANION_NAMES` | "Sofía Martín", "Alejandro Ruiz", "Lucía Fernández", "Marc Gómez", "Daniela Torres", "Javier Serrano", "Marta Beltrán". | Utilizados como `senderName` e ID simulado `peer_sim_${name}`. |
| `src/components/StudyGroupsPage.tsx` | 97–104 | `SEED_COMPANION_STATUSES` | "Estudiando ahora mismo 📝", "Resolviendo cuestionarios ✨", "Repasando ejercicios difíciles 🤔"... | Asignados cíclicamente para simular actividad en línea. |
| `src/components/StudyGroupsPage.tsx` | 172–186 | `defaultGroup` | Creador: "Sofía Martín", ID: `user_seed_sofia`. | Se crea en `localStorage` si no hay grupos para la asignatura. |
| `src/components/StudyGroupsPage.tsx` | 204–222 | `seededMsgs` | Mensajes de "Sofía Martín" y "Alejandro Ruiz". | Se inyectan en `localStorage` al abrir un grupo nuevo. |
| `src/components/StudyGroupsPage.tsx` | 251–285 | `useEffect` (`setInterval`) | Dispara cada 15s una respuesta aleatoria (20% prob) con `isSimulated: true`. | Agrega mensajes al state y a `localStorage`. |
| `src/components/StudyGroupsPage.tsx` | 306–330 | `handleSendMessage` (`setTimeout`) | Tras 1.8 segundos de enviar un mensaje el alumno, genera respuesta simulada. | Agrega mensaje de réplica automática a `localStorage`. |
| `src/services/mockDatabase.ts` | 2816–2859 | `courseGroupMessagesData` | `student1` (Lucía G.), `student2` (Carlos M.), `student3` (Sofía R.). | Mensajes iniciales mostrados en `fetchCourseGroupConversations`. |

---

## 3. TRAZABILIDAD DE COLECCIONES Y DOCUMENTOS EN FIRESTORE

| Entidad | Ruta en Firestore | Regla en `firestore.rules` | Participantes / Permisos |
| :--- | :--- | :--- | :--- |
| **Metadatos de Chat Grupal** | `/chats/{courseId}` | `match /chats/{chatId}` | `allow read, write: if isAuthenticated() && (request.auth.uid in resource.data.participants || isAdmin() || isTeacher());` |
| **Mensajes Grupales** | `/chats/{courseId}/messages/{messageId}` | `match /chats/{chatId}/messages/{messageId}` | `allow read: if canAccessParentChat(chatId);`<br>`allow create: if canWriteToParentChat(chatId);` |
| **Grupos Temporales (`StudyGroupsPage`)** | **NO EXISTE EN FIRESTORE** | N/A | Almacenado exclusivamente en `localStorage` del cliente. |

---

## 4. ANÁLISIS DE CONECTIVIDAD ALUMNO-ADMINISTRADOR

```
+--------------------------------------------------------------------------------------------------+
| FLUJO 1: CHAT DE GRUPOS DE CURSO (/app/student-chat <-> /admin/chat)                             |
|                                                                                                  |
| [ Alumno ]                                                         [ Administrador / Profesor ]  |
|     |                                                                           |                |
|     +---> useChat(courseId) ---> Escribe Firestore [/chats/{courseId}/messages] <---+            |
|     |                                                                           |                |
|     <--- onSnapshot <------------ Lee Firestore [/chats/{courseId}/messages] <--+                |
|                                                                                                  |
| ESTADO: Conectado a Firestore pero desincronizado en la lista inicial (lee mockDatabase.ts)     |
+--------------------------------------------------------------------------------------------------+

+--------------------------------------------------------------------------------------------------+
| FLUJO 2: GRUPOS DE ESTUDIO TEMPORALES (/app/study-groups)                                        |
|                                                                                                  |
| [ Alumno ]                                                         [ Administrador / Profesor ]  |
|     |                                                                           |                |
|     +---> localStorage['aula_study_groups_*']                                    |                |
|     +---> localStorage['aula_study_group_msgs_*']                                |  (DESCONECTADO)|
|     +---> SEED_SIMULATED_RESPONSES (Bots locales)                               |  (SIN ACCESO)  |
|     +---> setTimeout / setInterval (Respuestas automáticas)                     |                |
|                                                                                                  |
| ESTADO: 100% AISLADO Y FICTICIO. No existe en Firestore ni en la vista de administración.       |
+--------------------------------------------------------------------------------------------------+
```
