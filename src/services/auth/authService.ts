import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut as firebaseSignOut,
  sendPasswordResetEmail,
  onAuthStateChanged,
  User as FirebaseUser,
  GoogleAuthProvider,
  signInWithPopup
} from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { auth, db } from '../firebase/config';
import { User, ApiResponse } from '../../types';

export interface AuthService {
  signInWithEmail: (email: string, password: string) => Promise<ApiResponse<User>>;
  signInWithGoogle: () => Promise<ApiResponse<User>>;
  signUp: (email: string, password: string, displayName: string) => Promise<ApiResponse<User>>;
  signOut: () => Promise<ApiResponse<void>>;
  resetPassword: (email: string) => Promise<ApiResponse<void>>;
  getCurrentUser: () => Promise<ApiResponse<User | null>>;
}

// Convert Firebase User to our User type
const convertFirebaseUser = (firebaseUser: FirebaseUser): User => ({
  id: firebaseUser.uid,
  email: firebaseUser.email || '',
  displayName: firebaseUser.displayName || '',
  photoURL: firebaseUser.photoURL || undefined,
  createdAt: new Date(firebaseUser.metadata.creationTime || Date.now()),
  lastLoginAt: new Date(firebaseUser.metadata.lastSignInTime || Date.now()),
});

class FirebaseAuthService implements AuthService {
  async signInWithEmail(email: string, password: string): Promise<ApiResponse<User>> {
    try {
      const { user: firebaseUser } = await signInWithEmailAndPassword(auth, email, password);
      const user = convertFirebaseUser(firebaseUser);
      
      return {
        success: true,
        data: user,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Sign in failed',
      };
    }
  }

  async signInWithGoogle(): Promise<ApiResponse<User>> {
    try {
      const provider = new GoogleAuthProvider();
      const { user: firebaseUser } = await signInWithPopup(auth, provider);
      const user = convertFirebaseUser(firebaseUser);
      
      return {
        success: true,
        data: user,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Google sign in failed',
      };
    }
  }

  async signUp(email: string, password: string, displayName: string): Promise<ApiResponse<User>> {
    try {
      const { user: firebaseUser } = await createUserWithEmailAndPassword(auth, email, password);
      
      // Save additional user data to Firestore
      await setDoc(doc(db, 'users', firebaseUser.uid), {
        displayName,
        email,
        createdAt: new Date(),
        lastLoginAt: new Date(),
      });
      
      const user = convertFirebaseUser(firebaseUser);
      return {
        success: true,
        data: user,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Sign up failed',
      };
    }
  }

  async signOut(): Promise<ApiResponse<void>> {
    try {
      await firebaseSignOut(auth);
      return {
        success: true,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Sign out failed',
      };
    }
  }

  async resetPassword(email: string): Promise<ApiResponse<void>> {
    try {
      await sendPasswordResetEmail(auth, email);
      return {
        success: true,
        message: 'Password reset email sent',
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Password reset failed',
      };
    }
  }

  async getCurrentUser(): Promise<ApiResponse<User | null>> {
    try {
      return new Promise((resolve) => {
        const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
          unsubscribe();
          
          if (firebaseUser) {
            try {
              const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
              const userData = userDoc.data();
              
              const user: User = {
                id: firebaseUser.uid,
                email: firebaseUser.email || '',
                displayName: firebaseUser.displayName || userData?.displayName || '',
                photoURL: firebaseUser.photoURL || userData?.photoURL || undefined,
                createdAt: new Date(firebaseUser.metadata.creationTime || Date.now()),
                lastLoginAt: new Date(firebaseUser.metadata.lastSignInTime || Date.now()),
              };
              
              resolve({ success: true, data: user });
            } catch (error) {
              const user = convertFirebaseUser(firebaseUser);
              resolve({ success: true, data: user });
            }
          } else {
            resolve({ success: true, data: null });
          }
        });
      });
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Get current user failed',
      };
    }
  }
}

export const authService = new FirebaseAuthService(); 