# FASE F78 — INFORME FINAL

## 1. INVALID DATE

ESTADO:

PASS

CAUSA RAÍZ EXACTA:

Archivo:
`src/components/StudentChatPage.tsx`, `src/components/admin/AdminChatPage.tsx`, `src/components/chat/ChatRoom.tsx`

Función:
Componentes de renderizado de mensajes e iteradores de listas de chat.

Campo:
`message.timestamp` / `message.createdAt`

Tipo esperado:
`string` (ISO) o `number` (Epoch millis).

Tipo recibido:
Objeto Firestore `Timestamp` nativo (con propiedades `.seconds` y `.nanoseconds`), `null`, o `undefined`.

Conversión:
`new Date(message.timestamp)` / `new Date(msg.timestamp)`

Error:
Cuando `message.timestamp` es un objeto Firestore `Timestamp` o `undefined`, el constructor `new Date()` de JavaScript no lo procesa correctamente y devuelve `Invalid Date`.

---

## 2. MENSAJES NUEVOS

Determinar cómo se almacena createdAt:
Se almacenan mediante `serverTimestamp()` de Firestore en operaciones de escritura en tiempo real (`useChat.ts`), generando un objeto Firestore `Timestamp` nativo en el servidor.

---

## 3. MENSAJES ANTIGUOS

Determinar si existe incompatibilidad:
Sí. Los mensajes legacy almacenados en mock o registros antiguos utilizaban cadenas ISO (`string`), mientras que los mensajes nuevos utilizan objetos `Timestamp` de Firestore. La ausencia de un normalizador centralizado de fechas produce el fallo visual `Invalid Date` al mezclar ambos formatos.

---

## 4. LIMPIEZA AUTOMÁTICA

NO EXISTE

Si existe:
- Periodicidad: N/A
- Trigger: N/A
- Función: N/A
- Colección: N/A
- Condición: N/A
- Desplegada: N/A
- Última evidencia: N/A
- Tests: N/A

---

## 5. FIRESTORE TTL

NO EXISTE

---

## 6. LIMPIEZA MANUAL ADMIN

NO IMPLEMENTADA

---

## 7. SEGURIDAD

Quién puede:

- READ: Alumno matriculado, Profesor asignado, Administrador (`isChatParticipant()`)
- CREATE: Alumno matriculado / Autor verificado (`request.resource.data.senderId == request.auth.uid`)
- UPDATE: Autor original del mensaje (`resource.data.senderId == request.auth.uid`)
- DELETE: Autor original del mensaje o Administrador (`isAdmin() || resource.data.senderId == request.auth.uid`)
- CLEAR CHAT: Nadie (funcionalidad no implementada)

---

## 8. ALCANCE

Especificar exactamente qué canales se pueden limpiar:
Ningún canal cuenta actualmente con limpieza masiva automática ni manual por lotes; todos operan bajo retención indefinida y borrado granular de mensajes individuales.

---

## 9. RIESGO

LOW

---

## 10. TESTS

Suites:
25

Tests:
311

Passed:
311

Failed:
0

---

## 11. SHA

firestore.rules:
`e2d89b5681a58aca7741724cc80ffac0bbcd8cae6834582e786fbf319804e66f`

storage.rules:
`eee9cbafcd605b08989fb732e7987910a7c90be999b2d4c8871dac583e49ea5e`

firebase.json:
`3cc50ac32a2b138f5e60e6e637e913c90304d6e8efce1b9853c7384fa13cfadf`

---

## 12. ZERO CHANGE

Source:
0

Rules:
0

Database:
0

Deploy:
0

---

## 13. RECOMENDACIÓN F79

NO implementar todavía ninguna solución.

Indicar exactamente qué debería hacer F79 basándose únicamente en la evidencia obtenida en F78:
1. En F79, implementar un helper robusto de normalización de fechas de mensajes (ej. `toJsDate(timestamp)` que soporte objetos Firestore `Timestamp` con `.toDate()` o `.toMillis()`, cadenas ISO, números y fallbacks a `Date.now()`) para erradicar definitivamente el error `Invalid Date`.
2. Si se solicita en el futuro, diseñar un flujo seguro de borrado masivo o "Limpiar chat" exclusivamente para administradores auditado mediante transacciones o batch en Firestore.
