const fs = require('fs');
let content = fs.readFileSync('functions/index.ts', 'utf8');
content = content.replace(/getFirestore\(admin\.app\(\), FIRESTORE_DATABASE_ID\)/g, "getFirestore(FIRESTORE_DATABASE_ID)");
fs.writeFileSync('functions/index.ts', content, 'utf8');
console.log('Patched admin.app() left-overs.');
