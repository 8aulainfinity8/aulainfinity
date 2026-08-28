const fs = require('fs');
const file = 'src/components/admin/AdminTeacherApprovalPage.tsx';

let content = fs.readFileSync(file, 'utf8');

// replace `enabled: !!user?.id` with `enabled: !!user && !!user.id && user.id === auth?.currentUser?.uid`
content = content.replace(/enabled: !!user\?\.id/g, 'enabled: !!user && !!user.id && user.id === auth?.currentUser?.uid');

if (!content.includes("import { auth } from '../../services/firebase'")) {
    content = content.replace(/import { useQuery, useMutation, useQueryClient } from '@tanstack\/react-query';/, "import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';\nimport { auth } from '../../services/firebase';");
}

fs.writeFileSync(file, content);
console.log('Fixed AdminTeacherApprovalPage.tsx');
