He identificado y actualizado exitosamente todas las dependencias de `useQuery` en todo el sistema.

**Lista de consultas modificadas (archivos):**
- `src/contexts/AuthContext.ts` (`['userProfile']`)
- `src/contexts/AdminNotificationProvider.tsx` (Múltiples notificaciones de panel de control)
- `src/contexts/StudentNotificationProvider.tsx` (Comentarios, chats y cursos del estudiante)
- `src/contexts/GamificationContext.ts` (`['courses']`, `['studentAnswers']`)
- `src/hooks/useAgendaEvents.ts` (`['agendaEvents']`)
- `src/components/Dashboard.tsx` (`['courses']`, `['agendaEvents']`, `['studentAnswers']`)
- `src/components/StudentProgressPage.tsx` (`['courses']`, `['studentAnswers']`)
- `src/components/admin/AdminProgressPage.tsx` (`['studentAnswers']`)
- `src/components/QuizPlayer.tsx` (`['studentAnswers']`)
- `src/components/admin/AdminTeacherApprovalPage.tsx` (`['conversations']`)
- `src/components/ChatPage.tsx` (`['conversations']`)
- `src/components/StudentChatPage.tsx` (`['conversations']`, `['peer-conversations']`, `['group-conversations']`)
- `src/components/TeacherStudentsPage.tsx` (`['students']`, `['courseLevels']`)
- `src/components/admin/AdminUsersPage.tsx` (`['users']`, `['courses']`, `['teachers']`)
- `src/components/admin/AdminChatPage.tsx` (`['peerConversations']`, `['peerMessages']`, `['teacherMessages']`, `['courses']`, `['teachers']`)
- `src/components/TeacherDashboard.tsx` (`['quiz']`, `['studentAnswers']`, `['conversations']`)
- `src/components/StudentTutoringProgressChart.tsx` (`['tutoringRequests']`)
- `src/contexts/NewCommentsProvider.tsx` (`['allComments']`)
- `src/components/AgendaPage.tsx` (`['teachers']`)

**Cambios Realizados:**
1. Modifiqué la propiedad `enabled` en todos los archivos anteriores reemplazando comprobaciones inseguras (como `enabled: !!user.id` o comprobaciones omitidas) por comprobaciones fuertes dependientes de Firebase Authentication.
2. Inyecté de forma selectiva `enabled: !!user && !!user.id && user.id === auth?.currentUser?.uid` o `!!auth?.currentUser` en componentes secundarios.
3. Importé `auth` desde `services/firebase` en los archivos que no lo tenían (ej. `AgendaPage.tsx`, `AdminProgressPage.tsx`).
4. Re-compilé de manera exitosa para asegurar integridad del compilador TypeScript (`tsc --noEmit`).
