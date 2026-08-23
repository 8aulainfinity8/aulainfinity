# F77 — MATRIZ DE FLUJO DE TIEMPO REAL Y CICLO DE VIDA DE LISTENERS

**Proyecto:** AulaInfinity  
**Fase:** F77 — Auditoría Forense E2E (Zero Write / Zero Change)

---

## 1. CICLO DE VIDA DEL MENSAJE (END-TO-END)

```
+-----------------------------------------------------------------------------------+
| 1. CREACIÓN DEL MENSAJE (Alumno A)                                                |
|    - Interfaz: StudentChatPage.tsx -> handleSendMessage()                        |
|    - Hook: useChat.ts -> sendMessage(text, type, participants, attachments)        |
|    - Payload:                                                                     |
|      {                                                                            |
|        id: <firestore-auto-id>,                                                   |
|        senderId: auth.currentUser.uid,                                            |
|        text: "Hola grupo",                                                        |
|        type: "text",                                                              |
|        timestamp: serverTimestamp(),                                             |
|        participants: [...]                                                        |
|      }                                                                            |
|    - Ejecución: await setDoc(messageDocRef, messagePayload, { merge: true })      |
|    - Ruta: /chats/{courseId}/messages/{messageId}                                 |
+-----------------------------------------------------------------------------------+
                                         │
                                         ▼
+-----------------------------------------------------------------------------------+
| 2. DISPERSION EN TIEMPO REAL (Firestore onSnapshot)                               |
|    - Query: query(collection(db, 'chats', courseId, 'messages'),                  |
|                   orderBy('timestamp', 'asc'),                                    |
|                   limitToLast(100))                                               |
|    - Subscriptor 1: Alumno A (Emisor) -> Actualiza vista local                    |
|    - Subscriptor 2: Alumno B (Compañero matriculado) -> Renderiza burbuja         |
|    - Subscriptor 3: Administrador (AdminChatPage) -> Renderiza en consola admin   |
+-----------------------------------------------------------------------------------+
                                         │
                                         ▼
+-----------------------------------------------------------------------------------+
| 3. LIMPIEZA DE SUSCRIPCIONES Y PREVENCIÓN DE FUGAS (Cleanup)                      |
|    - useEffect cleanup return () => { unsubChat(); unsubMessages(); }             |
|    - Cambio de pestaña/curso: Desuscribe listener anterior antes de abrir nuevo   |
|    - Desconexión o cambio de rol: Cancela snapshots activos                       |
+-----------------------------------------------------------------------------------+
```

---

## 2. MATRIZ DE IDENTIDAD Y SEGURIDAD DEL MENSAJE

| Campo del Mensaje | Origen | Manipulable por Cliente | Protegido por Security Rules | Inmutable tras creación |
|---|---|---|---|---|
| `id` | Generado por SDK Firestore | No (es el ID del documento) | Sí | Sí |
| `senderId` | `auth.currentUser.uid` | No (forzado a coincidir con Auth) | Sí (`request.resource.data.senderId == request.auth.uid`) | Sí |
| `chatId` | Parámetro de ruta (`courseId`) | No | Sí (validado contra la ruta canónica) | Sí |
| `text` | Entrada del usuario | Sí (contenido) | Sí (validado en string) | Solo por el autor original o Admin |
| `timestamp` | `serverTimestamp()` | No | Sí | Sí |
| `senderRole` | Derivado de Auth Claims | No | Sí | Sí |
| `attachments` | URLs de Cloud Storage | Sí (subida autorizada) | Sí (Storage Security Rules) | Sí |

---

## 3. AUDITORÍA DE FUGAS DE MEMORIA Y PREVENCIÓN DE DUPLICADOS

1. **Idempotencia de envío:** `useChat.ts` utiliza `isSendingRef` para descartar envíos duplicados en vuelo mientras se procesa la promesa de Firestore.
2. **Gestión de listeners:** Cada instancia de `useChat` mantiene `unsubChat` y `unsubMessages` que se ejecutan automáticamente en la función de limpieza de `useEffect` al desmontar el componente o variar el `chatId`.
3. **Manejo de estado de autenticación:** Si el usuario no está verificado o `isFirebaseAuthReady` es `false`, los listeners no se inicializan y limpian cualquier estado previo (`setMessages([])`).
