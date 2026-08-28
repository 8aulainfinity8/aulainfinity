const fs = require('fs');

// 1. AgendaPage.tsx
let f1 = 'src/components/AgendaPage.tsx';
let c1 = fs.readFileSync(f1, 'utf8');
if (!c1.includes("import { auth }")) {
  c1 = c1.replace(/import { useQuery, useMutation, useQueryClient } from '@tanstack\/react-query';/, "import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';\nimport { auth } from '../services/firebase';");
  c1 = c1.replace(/import { useQuery } from '@tanstack\/react-query';/, "import { useQuery } from '@tanstack/react-query';\nimport { auth } from '../services/firebase';");
}
fs.writeFileSync(f1, c1);

// 2. TeacherDashboard.tsx
let f2 = 'src/components/TeacherDashboard.tsx';
let c2 = fs.readFileSync(f2, 'utf8');
c2 = c2.replace(/enabled: !!videoId && !!user && !!user\.id && user\.id === auth\?\.currentUser\?\.uid,/g, "enabled: !!videoId && !!auth?.currentUser,");
fs.writeFileSync(f2, c2);

// 3. AdminProgressPage.tsx
let f3 = 'src/components/admin/AdminProgressPage.tsx';
let c3 = fs.readFileSync(f3, 'utf8');
if (!c3.includes("import { auth }")) {
  c3 = c3.replace(/import { useQuery } from '@tanstack\/react-query';/, "import { useQuery } from '@tanstack/react-query';\nimport { auth } from '../../services/firebase';");
}
fs.writeFileSync(f3, c3);

// 4. AdminUsersPage.tsx
let f4 = 'src/components/admin/AdminUsersPage.tsx';
let c4 = fs.readFileSync(f4, 'utf8');
c4 = c4.replace(/enabled: !!student\.id && user\.id === auth\?\.currentUser\?\.uid/g, "enabled: !!student.id && !!auth.currentUser");
c4 = c4.replace(/enabled: !!student\.id && user\.id === auth\?\.currentUser\?\.uid,/g, "enabled: !!student.id && !!auth.currentUser,");
c4 = c4.replace(/enabled: !!student\.id && !!auth.currentUser,/g, "enabled: !!student.id && !!auth.currentUser,"); // in case it was correct
fs.writeFileSync(f4, c4);

console.log("Fixed TS errors");
