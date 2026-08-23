# FASE F80.1 — INFORME DE AUDITORÍA

## 1. VEREDICTO GENERAL

Estado:
🔴 INCOMPLETA / ⚠️ REQUIERE CORRECCIÓN

Explicación breve:
Aunque las funcionalidades de "Vaciar Chat" por parte del administrador y la política de retención de 30 días fueron implementadas de forma básica en el cliente y Cloud Functions respectivamente, presentan fallas arquitectónicas severas de escalabilidad, recolección de basura incompleta y vulnerabilidades de seguridad en el modelo legacy.

## 2. ARQUITECTURA REAL DE CHATS

| Elemento | Ubicación | Implementación |
|---|---|---|
| Colecciones Principales | Firestore | `chats`, `conversations`, `firestore_conversations`, `firestore_peer_conversations`, `firestore_teacher_conversations` |
| Subcolecciones Mensajes | Firestore | `messages`, `signal`, `documents` (bajo el documento de cada chat) |
| Col. Mensajes Root (Legacy) | Firestore | `firestore_direct_messages`, `firestore_peer_messages`, `firestore_teacher_messages`, `firestore_course_messages` |
| Campo Última Actividad | Firestore | `lastMessageTimestamp` o `updatedAt` o `createdAt` |
| Identificador Utilizado | Firestore | `chatId` = `conversationId` = `direct_...` |
| UI Eliminar / Vaciar Chat | React | `AdminChatPage.tsx` (Función: `handleClearChat`) |
| API Vaciar Chat | TypeScript | `api.ts` -> `syncClearChatMessagesInFirestore` |
| Eliminación Automática | Backend | `functions/index.ts` -> `scheduledChatRetentionCleanup` (Cloud Scheduler) |

## 3. CLEARCHATMESSAGES

¿Existe?
Sí. Definida en `src/services/api.ts` y su lógica de base de datos en `src/services/firestoreSync.ts` (`syncClearChatMessagesInFirestore`).

Detalles:
- Localización: `firestoreSync.ts` (línea ~2280).
- Quién la llama: Modal de confirmación en `AdminChatPage.tsx` por un usuario con rol de Administrador.
- Colecciones modificadas: Subcolección `messages` de la colección `chats`, y colecciones root legacy (`firestore_direct_messages`, etc.).
- ¿Elimina mensajes individualmente? Sí. Iterando sobre documentos con `Promise.all` y `deleteDoc`.
- ¿Elimina la conversación? No, el documento padre de la conversación se mantiene intacto.
- ¿Actualiza timestamps? No. `lastMessageTimestamp` y `lastMessageText` no se limpian, por lo que la previsualización del chat seguirá mostrando el texto antiguo.
- ¿Utiliza batch/transaction? No. Lanza promesas concurrentes de cliente.
- ¿Admin SDK / Callable? No, es una operación de frontend directamente a Firestore.

## 4. VACIADO ADMINISTRATIVO

Estado: IMPLEMENTADO (Pero ineficiente)
Evidencia exacta:
- ARCHIVO: `src/components/admin/AdminChatPage.tsx`
- COMPONENTE: `AdminChatPage` (Línea 1599).
- FUNCIÓN EJECUTADA: Botón "Sí, limpiar chat" ejecuta `handleClearChat()`.
- ACCIÓN REALIZADA: Llama a `api.clearChatMessages` y luego invalida React Query.
- AUTORIZACIÓN: Validado a nivel de UI por las rutas administrativas y en Firestore Rules para la eliminación en colecciones de mensajes.

## 5. SEGURIDAD

Quién puede:
1. Leer chats/mensajes: Participantes de la conversación y el Administrador.
2. Crear chats/mensajes: Participantes (los mensajes en colección nueva solo pueden ser creados si el `senderId` coincide con el del usuario autenticado).
3. Modificar chats/mensajes: Creador del mensaje y Administrador. Participantes pueden modificar metadatos del chat.
4. Eliminar mensajes (Backend/Reglas):
   - En nuevas subcolecciones: Autor y Admin. Si un estudiante ejecuta el borrado, borrará solo los suyos, fallando el resto silenciosamente (el catch en el Promise).
   - En legacy root collections: Permite borrar a cualquiera que cumpla `isParticipant(resource.data)`. Un estudiante podría borrar mensajes de otra persona en estas colecciones.
5. Ejecutar administrativas: Solo el Administrador mediante AdminProtectedRoute.

Riesgos identificados: Los usuarios podrían modificar desde el cliente los timestamps (`updatedAt`, `lastMessageTimestamp`) estableciendo fechas muy futuras y evadiendo el borrado automático de retención indefinidamente.

## 6. RETENCIÓN AUTOMÁTICA

Detalles completos de `scheduledChatRetentionCleanup`:
- Archivo: `functions/index.ts`.
- Runtime: Cloud Scheduler + Cloud Functions v2.
- Región y DB: `europe-west1`, `ai-studio-aulainfinity-6be7791f-ef3e-4fc4-b45b-98918b1b57ca`.
- Frecuencia: Diaria a las 02:00 AM (`"0 2 * * *"`).
- Días de retención: 30 (`CHAT_RETENTION_DAYS = 30`).
- Criterio: Si la fecha (lastMessageTimestamp/updatedAt/createdAt) < (Hoy - 30 días).
- Limitaciones severas:
  - Hace un `.get()` directo y completo de TODAS las colecciones sin paginar (OOM Risk).
  - Borra la subcolección `messages` usando `.batch()` pero sin comprobar el límite de 500 operaciones de Firestore, lo que causará un bloqueo/fail cuando la conversación sea grande.
  - No revisa ni borra mensajes en colecciones root legacy.

## 7. VALIDACIÓN DE 30 DÍAS

Se calcula correctamente: `now - 30 days`.
Cae en cascada buscando: `lastMessageTimestamp`, `updatedAt`, `createdAt`.
Si todos los timestamps faltan, o el valor guardado no es interpretable como fecha, la variable `dateToCheck` queda en `null` y la conversación NO SE ELIMINA NUNCA.
Los usuarios podrían manipular los timestamps y burlar el sistema.

## 8. BORRADO DE SUBCOLECCIONES

El borrado programado y el administrativo NO eliminan subcolecciones adicionales como `/chats/{id}/signal` (WebRTC), `/chats/{id}/documents` (pizarras), ni los archivos reales subidos al Firebase Storage.
Las referencias de colecciones de mensajes legacy ("firestore_direct_messages", etc.) son ignoradas por la limpieza automática, dejando la base de datos con mensajes fantasmas que ocupan cuota.

## 9. ESCALABILIDAD

La implementación actual carece por completo de escalabilidad.
- En frontend (Administrador): Un chat con 2000 mensajes provocará 2000 peticiones concurrentes `.deleteDoc()`, causando ralentización, bloqueo del hilo de React y eventual denegación de servicio (throttle) desde Firestore.
- En backend (Retención): El borrado por lotes fallará invariablemente en chats >500 mensajes, evitando su eliminación permanentemente; y `.get()` masivo de colecciones causará un memory leak o timeout a medida que la base de datos crezca.

## 10. TESTS

- Tests encontrados: `src/__tests__/ChatRetentionAndAdminClear.test.ts`.
- Cobertura real: Engañosa. El test verifica funciones MOCK escritas en un array temporal en JavaScript local (e.g., `dbMock.conversationsData.push(...)`). No evalúan reglas de seguridad de Firestore, no evalúan Firebase Admin de Cloud Functions ni comprueban límites operativos. La prueba de "30 días" del test es tan solo un condicional JS en línea ajeno a la aplicación real.

## 11. BUILD / TESTS

- TESTS: Los tests en la consola marcan éxito total (322 passed).
- BUILD: Compilación correcta, pero la estabilidad operativa en red (debido a la cantidad de operaciones concurrentes en cliente) está comprometida.

## 12. DISCREPANCIAS CON F80

- La Fase afirmaba haber implementado un manejo por lotes y tolerancia a errores robusta para la función automática. Evidencia: No existe límite a 500 en batches, fallando si hay más mensajes.
- Se asume el borrado integral, pero el código ignora subcolecciones adicionales y datos huérfanos legacy.
- Los tests afirman validar reglas de seguridad en retención y borrado, cuando en realidad son pruebas en arrays de mock data local.

## 13. RIESGOS ENCONTRADOS

- **CRÍTICO:** Borrado silencioso roto. La Cloud Function fallará automáticamente la primera vez que un chat contenga más de 500 mensajes (Límite Firestore).
- **CRÍTICO:** OOM Timeout. `colRef.get()` sobre colecciones root no está acotado, por lo que crecerá hasta hacer crashear la función.
- **ALTO:** Estrangulamiento de cliente (Client Throttle). `Promise.all` con `deleteDoc` para cientos de mensajes en el navegador.
- **MEDIO:** Mensajes huérfanos. Las colecciones legacy y otras subcolecciones persisten tras el borrado automático.
- **MEDIO:** Metadatos rotos. Cuando un admin vacía un chat, este se mantiene, pero la previsualización del último mensaje (lastMessageText) sigue mostrándose como si no se hubiese vaciado.

## 14. RECOMENDACIÓN PARA F80.2

NO EJECUTAR EL CÓDIGO ACTUAL EN PRODUCCIÓN MASIVA.
1. Implementar en `syncClearChatMessagesInFirestore` (frontend): Llamada a una Cloud Function Callable segura, o utilizar lógica controlada de paginación o Firebase Functions para el vaciado que limpie `lastMessageTimestamp` y `lastMessageText` a la vez.
2. Refactorizar `scheduledChatRetentionCleanup`:
   - Implementar chunking de arreglos de 500 documentos en los `batch`.
   - Implementar paginación o `.limit(500)` para la obtención inicial de conversaciones, posiblemente con control por cursores (o `Firebase Admin recursiveDelete`).
   - Añadir la limpieza de subcolecciones (`signal`, `documents`) y colecciones legacy huérfanas.
3. Asegurar los timestamps en `firestore.rules` (evitar que un usuario ponga su `lastMessageTimestamp` en el 2099).
