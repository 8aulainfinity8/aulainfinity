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
  'src/components/QuizPlayer.tsx'
];

files.forEach(file => {
  if (!fs.existsSync(file)) return;
  let content = fs.readFileSync(file, 'utf8');
  
  // Replace !!auth.currentUser with user.id === auth?.currentUser?.uid
  content = content.replace(/!!auth\.currentUser/g, 'user.id === auth?.currentUser?.uid');
  
  // Also fix AdminProgressPage.tsx which has `enabled: !!user.id`
  if (file.includes('AdminProgressPage.tsx')) {
    content = content.replace(/enabled: !!user\.id,/, "enabled: !!user && !!user.id && user.id === auth?.currentUser?.uid,");
    if (!content.includes("import { auth } from '../../services/firebase'")) {
       content = content.replace(/import { useQuery } from '@tanstack\/react-query';/, "import { useQuery } from '@tanstack/react-query';\nimport { auth } from '../../services/firebase';");
    }
  }

  // Also fix QuizPlayer.tsx which has `enabled: !!user`
  if (file.includes('QuizPlayer.tsx')) {
    content = content.replace(/enabled: !!user,/, "enabled: !!user && !!user.id && user.id === auth?.currentUser?.uid,");
    if (!content.includes("import { auth } from '../services/firebase'")) {
       content = content.replace(/import { useQuery, useMutation } from '@tanstack\/react-query';/, "import { useQuery, useMutation } from '@tanstack/react-query';\nimport { auth } from '../services/firebase';");
    }
  }
  
  fs.writeFileSync(file, content);
  console.log(`Updated ${file}`);
});
