const fs = require('fs');
const files = ['src/components/admin/AdminChatPage.tsx', 'src/components/admin/AdminUsersPage.tsx'];

files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  content = content.replace(/!!auth\.currentUser/g, 'user.id === auth?.currentUser?.uid');
  // the one with !!student.id && !!auth.currentUser might have been replaced with !!student.id && user.id === auth?.currentUser?.uid. Let's fix that one explicitly if needed, but actually checking auth?.currentUser?.uid is fine!
  fs.writeFileSync(file, content);
  console.log(`Updated ${file}`);
});
