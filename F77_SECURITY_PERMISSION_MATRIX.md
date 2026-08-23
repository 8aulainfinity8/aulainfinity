# F77 — MATRIZ DE PERMISOS DE SEGURIDAD Y AISLAMIENTO RBAC

**Proyecto:** AulaInfinity  
**Fase:** F77 — Auditoría Forense E2E (Zero Write / Zero Change)

---

## 1. INTEGRIDAD DE ARCHIVOS DE REGLAS

| Archivo | SHA-256 Actual | SHA-256 Baseline F76 | Estado |
|---|---|---|---|
| `firestore.rules` | `e2d89b5681a58aca7741724cc80ffac0bbcd8cae6834582e786fbf319804e66f` | `e2d89b5681a58aca7741724cc80ffac0bbcd8cae6834582e786fbf319804e66f` | **MATCH (100% INTACTO)** |
| `storage.rules` | `eee9cbafcd605b08989fb732e7987910a7c90be999b2d4c8871dac583e49ea5e` | `eee9cbafcd605b08989fb732e7987910a7c90be999b2d4c8871dac583e49ea5e` | **MATCH (100% INTACTO)** |
| `firebase.json` | `3cc50ac32a2b138f5e60e6e637e913c90304d6e8efce1b9853c7384fa13cfadf` | `3cc50ac32a2b138f5e60e6e637e913c90304d6e8efce1b9853c7384fa13cfadf` | **MATCH (100% INTACTO)** |

---

## 2. MATRIZ DE EVALUACIÓN DE CASOS DE ACCESO (GRUPOS DE ESTUDIO)

| Caso | Contexto / Operación | Regla Aplicada | Resultado |
|---|---|---|---|
| **CASO A** | Alumno matriculado → Leer grupo `/chats/{courseId}` y subcolección de mensajes | `isEnrolledInCourse(chatId)` | **ALLOW** |
| **CASO B** | Alumno matriculado → Crear mensaje propio (`senderId == auth.uid`) | `isEnrolledInCourse(chatId) && request.resource.data.senderId == request.auth.uid` | **ALLOW** |
| **CASO C** | Alumno matriculado → Modificar mensaje propio (`text`) | `resource.data.senderId == request.auth.uid && request.resource.data.senderId == resource.data.senderId` | **ALLOW** |
| **CASO D** | Alumno A → Modificar mensaje de Alumno B | `resource.data.senderId == request.auth.uid` (Falso para Alumno A) | **DENY** |
| **CASO E** | Alumno A → Borrar mensaje de Alumno B | `resource.data.senderId == request.auth.uid` (Falso para Alumno A) | **DENY** |
| **CASO F** | Alumno → Acceder a grupo de curso donde NO está matriculado | `isEnrolledInCourse(chatId)` es Falso | **DENY** |
| **CASO G** | Profesor asignado → Acceder y coordinar grupo del curso asignado | `isTeacherOfCourse(chatId)` | **ALLOW** |
| **CASO H** | Profesor no asignado → Acceder a grupo de curso no asignado | `isTeacherOfCourse(chatId)` es Falso (si no es admin) | **DENY** |
| **CASO I** | Administrador (`role == 'admin'`) → Leer cualquier grupo | `isAdmin()` | **ALLOW** |
| **CASO J** | Administrador (`role == 'admin'`) → Moderar/Eliminar cualquier mensaje | `isAdmin()` | **ALLOW** |

---

## 3. AUDITORÍA DE AISLAMIENTO HORIZONTAL

- Los estudiantes solo pueden emitir consultas `onSnapshot` y escribir mensajes en las salas cuyos identificadores coinciden con los cursos en los que están formalmente matriculados en Firestore (`user.enrolledCourseIds`).
- La pertenencia se valida del lado del servidor de Firestore mediante la función de regla:
  ```
  function isEnrolledInCourse(courseId) {
    return isVerifiedUser() && (
      exists(/databases/$(database)/documents/users/$(request.auth.uid)) &&
      get(/databases/$(database)/documents/users/$(request.auth.uid)).data.get('enrolledCourseIds', []) is list &&
      courseId in get(/databases/$(database)/documents/users/$(request.auth.uid)).data.get('enrolledCourseIds', [])
    );
  }
  ```
- Ningún usuario puede suplantar la identidad de otro emisor en un grupo de estudio debido a la cláusula obligatoria `request.resource.data.senderId == request.auth.uid`.
