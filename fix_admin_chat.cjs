const fs = require('fs');
const file = 'src/components/admin/AdminChatPage.tsx';

let content = fs.readFileSync(file, 'utf8');
content = content.replace(/enabled: activeTab === 'peer',/g, "enabled: activeTab === 'peer' && !!user && !!user.id && user.id === auth?.currentUser?.uid,");
content = content.replace(/enabled: activeTab === 'peer' && !!selectedConversationId,/g, "enabled: activeTab === 'peer' && !!selectedConversationId && !!user && !!user.id && user.id === auth?.currentUser?.uid,");
content = content.replace(/enabled: activeTab === 'teacher',/g, "enabled: activeTab === 'teacher' && !!user && !!user.id && user.id === auth?.currentUser?.uid,");
content = content.replace(/enabled: activeTab === 'group' \|\| activeTab === 'whiteboard'/g, "enabled: (activeTab === 'group' || activeTab === 'whiteboard') && !!user && !!user.id && user.id === auth?.currentUser?.uid");

fs.writeFileSync(file, content);
console.log('Fixed AdminChatPage.tsx');
