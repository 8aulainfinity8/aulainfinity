const fs = require('fs');
const files = [
  'src/contexts/AuthContext.ts',
  'src/contexts/AdminNotificationProvider.tsx',
  'src/contexts/StudentNotificationProvider.tsx',
  'src/contexts/GamificationContext.ts',
  'src/hooks/useAgendaEvents.ts',
  'src/components/Dashboard.tsx',
  'src/components/StudentProgressPage.tsx',
  'src/components/admin/AdminProgressPage.tsx',
  'src/components/QuizPlayer.tsx',
  'src/components/TeacherActiveChatsBar.tsx',
  'src/components/admin/AdminTeacherApprovalPage.tsx',
  'src/components/ChatPage.tsx',
  'src/components/StudentChatPage.tsx'
];

files.forEach(file => {
  if (!fs.existsSync(file)) {
      console.log(`Not found: ${file}`);
      return;
  }
  let content = fs.readFileSync(file, 'utf8');
  let changed = false;
  
  if (content.includes('enabled:')) {
     console.log(`Has enabled: ${file}`);
  } else {
     console.log(`No enabled: ${file}`);
  }
});
