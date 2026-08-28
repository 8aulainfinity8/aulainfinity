const fs = require('fs');
const files = [
  'src/components/TeacherDashboard.tsx',
  'src/components/StudentTutoringProgressChart.tsx',
  'src/contexts/NewCommentsProvider.tsx'
];

files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  content = content.replace(/!!auth\.currentUser/g, 'user.id === auth?.currentUser?.uid');
  fs.writeFileSync(file, content);
  console.log(`Updated ${file}`);
});
