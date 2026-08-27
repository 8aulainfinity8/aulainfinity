import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import * as fs from 'fs';

try {
  const envConfig = fs.readFileSync('.env', 'utf8').split('\n');
  for (const line of envConfig) {
    const [key, ...value] = line.split('=');
    if (key && value.length > 0) {
      process.env[key] = value.join('=').trim();
    }
  }
} catch (e) {}

try {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY || '{}');
  initializeApp({
    credential: cert(serviceAccount)
  });
} catch (e) {
  initializeApp();
}

async function bootstrap() {
  const email = '8aulainfinity8@gmail.com';
  try {
    const userRecord = await getAuth().getUserByEmail(email);
    console.log(`User found: ${userRecord.uid}`);
    
    if (!userRecord.emailVerified) {
      await getAuth().updateUser(userRecord.uid, { emailVerified: true });
      console.log(`✅ Email programmatically verified for ${email}`);
    }
    
    await getAuth().setCustomUserClaims(userRecord.uid, {
      ...userRecord.customClaims,
      role: 'admin',
      isAdmin: true,
      isApprovedForTutoring: true
    });
    console.log(`Custom claims added successfully for ${email}`);

    const db = getFirestore();
    await db.collection('firestore_users').doc(userRecord.uid).set({
      role: 'admin',
      isAdmin: true,
      isApprovedForTutoring: true,
      email: email,
      updatedAt: new Date()
    }, { merge: true });
    console.log(`Firestore document updated successfully for ${email}`);
    
  } catch (error: any) {
    if (error.code === 'auth/user-not-found') {
      console.log(`User ${email} not found. Please log in once first.`);
    } else {
      console.error('Error bootstrapping admin:', error);
    }
  }
}

bootstrap().then(() => process.exit(0));
