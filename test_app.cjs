const admin = require('firebase-admin');
admin.initializeApp({ projectId: 'aulainfinity8-a6ac0' });
console.log(typeof admin.app);
console.log(typeof admin.app());
