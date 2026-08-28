const fs = require('fs');
const file = 'src/components/TeacherDashboard.tsx';

let content = fs.readFileSync(file, 'utf8');
content = content.replace(/enabled: !!selectedStudent\n/g, 'enabled: !!selectedStudent && !!user && !!user.id && user.id === auth?.currentUser?.uid\n');
fs.writeFileSync(file, content);
console.log('Fixed TeacherDashboard.tsx');
