# F77 — AUDITORÍA FORENSE DE RESIDUOS MOCK Y SIMULACIONES

**Proyecto:** AulaInfinity  
**Fase:** F77 — Auditoría Forense E2E (Zero Write / Zero Change)

---

## 1. BÚSQUEDA EXHAUSTIVA DE PATRONES DE SIMULACIÓN

Se ejecutaron búsquedas recursivas en todo el árbol de código (`src/`) para verificar la erradicación de motores de simulación, compañeros falsos y temporizadores de respuesta automática:

| Patrón Buscado | Ocurrencias en Código Funcional | Ocurrencias en Tests | Estado |
|---|---|---|---|
| `SEED_MOCK_COMPANION_NAMES` | 0 | 1 (Aserción de no existencia en test) | **PASS** |
| `SEED_COMPANION_STATUSES` | 0 | 0 | **PASS** |
| `SEED_SIMULATED_RESPONSES` | 0 | 1 (Aserción de no existencia en test) | **PASS** |
| `aula_study_groups_` | 0 | 1 (Aserción de no existencia en test) | **PASS** |
| `aula_study_group_msgs_` | 0 | 1 (Aserción de no existencia en test) | **PASS** |
| `courseGroupMessagesData` | Inicializado en `[]` en `mockDatabase.ts` | Usado en tests / fallback sync | **PASS** |

---

## 2. AUDITORÍA DE TEMPORIZADORES Y RESPUESTAS AUTOMÁTICAS

1. **¿Existe algún `setTimeout` o `setInterval` generador de mensajes?**
   - **NO.** Los únicos usos de `setTimeout` en componentes de chat corresponden a la función de rebote (debounce) para la búsqueda de contactos (`delayDebounce` de 200ms en `StudentChatPage.tsx`).
2. **¿Existe respuesta diferida automática tras escribir un alumno?**
   - **NO.** Al pulsar enviar, se invoca directamente `useChat.sendMessage()`, que persiste en Firestore sin desencadenar ningún timer de respuesta automática.
3. **¿Existe almacenamiento paralelo en localStorage/sessionStorage para grupos?**
   - **NO.** Ni `StudyGroupsPage.tsx` ni `StudentChatPage.tsx` utilizan `localStorage` para almacenar o leer mensajes de grupos.

---

## 3. AUDITORÍA DE DATOS ESTÁTICOS RESIDUALES

- En `mockDatabase.ts`, `courseGroupMessagesData` se encuentra vacía (`export let courseGroupMessagesData: CourseGroupMessage[] = []`).
- No existen mensajes precargados de demostración ("Sofía R." o "Lucía G.") en los canales de grupos escolares de Firestore ni en memoria.
- Todas las interacciones provienen de usuarios autenticados mediante Firebase Authentication.
