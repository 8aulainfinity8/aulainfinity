import * as admin from 'firebase-admin';
import { getApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
admin.initializeApp({ projectId: 'aulainfinity8-a6ac0' });
const app = getApp();
const db = getFirestore(app, 'ai-studio-aulainfinity-6be7791f-ef3e-4fc4-b45b-98918b1b57ca');
console.log(typeof db.collection);
