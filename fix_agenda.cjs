const fs = require('fs');
const file = 'src/components/AgendaPage.tsx';

let content = fs.readFileSync(file, 'utf8');
content = content.replace(/enabled: !!user,/g, 'enabled: !!user && !!user.id && user.id === auth?.currentUser?.uid,');
if (!content.includes("import { auth }")) {
    content = content.replace(/import { useQuery } from '@tanstack\/react-query';/, "import { useQuery } from '@tanstack/react-query';\nimport { auth } from '../services/firebase';");
}
fs.writeFileSync(file, content);
console.log('Fixed AgendaPage.tsx');
