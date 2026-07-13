import { getApps, initializeApp } from 'firebase/app';
import { Analytics, getAnalytics, isSupported } from 'firebase/analytics';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { FirebaseConfig } from '../../types';

// Your web app's Firebase configuration
const firebaseConfig: FirebaseConfig = {
  apiKey: "AIzaSyAKS7DXO0daudjLgyiS9Te4LnkaOpXbisA",
  authDomain: "shufflemates-ce09a.firebaseapp.com",
  projectId: "shufflemates-ce09a",
  storageBucket: "shufflemates-ce09a.firebasestorage.app",
  messagingSenderId: "953820120990",
  appId: "1:953820120990:web:faf9fc1d1efb15c458388f",
};

// Initialize Firebase
export const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);

// Initialize Firebase services
export let analytics: Analytics | null = null;

if (typeof window !== 'undefined') {
  isSupported()
    .then((supported) => {
      if (supported) {
        analytics = getAnalytics(app);
      }
    })
    .catch(() => {
      analytics = null;
    });
}

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

// Firebase collections
export const COLLECTIONS = {
  USERS: 'users',
  TEAMS: 'teams',
  CHAT_ROOMS: 'chatRooms',
  MESSAGES: 'messages',
  SAVED_RESULTS: 'savedResults',
} as const; 
