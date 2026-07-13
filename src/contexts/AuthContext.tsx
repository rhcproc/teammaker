import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, ReactNode } from 'react';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut as firebaseSignOut,
  sendPasswordResetEmail,
  sendEmailVerification as firebaseSendEmailVerification,
  deleteUser,
  reauthenticateWithCredential,
  EmailAuthProvider,
  onAuthStateChanged,
  User as FirebaseUser,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult
} from 'firebase/auth';
import { doc, setDoc, getDoc, deleteDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { auth, db } from '../services/firebase/config';
import { User, AuthState } from '../types';

interface AuthContextType extends AuthState {
  signIn: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signUp: (email: string, password: string, displayName: string) => Promise<void>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  sendEmailVerification: () => Promise<void>;
  deleteAccount: (password?: string) => Promise<void>;
  reauthenticate: (password: string) => Promise<void>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

// Convert Firebase User to our User type
const convertFirebaseUser = (firebaseUser: FirebaseUser): User => ({
  id: firebaseUser.uid,
  email: firebaseUser.email || '',
  displayName: firebaseUser.displayName || '',
  photoURL: firebaseUser.photoURL || undefined,
  createdAt: new Date(firebaseUser.metadata.creationTime || Date.now()),
  lastLoginAt: new Date(firebaseUser.metadata.lastSignInTime || Date.now()),
  emailVerified: firebaseUser.emailVerified,
});

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [authState, setAuthState] = useState<AuthState>({
    user: null,
    loading: true,
    error: null,
  });

  // Initialize Firebase Auth listener
  useEffect(() => {
    // 리다이렉트 결과 처리
    getRedirectResult(auth).then((result) => {
      if (result) {
        console.log('Google OAuth redirect successful:', result.user.email);
        // 리다이렉트 후 돌아온 URL로 이동
        const redirectUrl = localStorage.getItem('redirectAfterAuth') || '/';
        localStorage.removeItem('redirectAfterAuth');
        window.location.href = redirectUrl;
      }
    }).catch((error) => {
      console.error('Google OAuth redirect error:', error);
    });

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        // 1. 인증 정보만으로 먼저 user 세팅 (즉시)
        const initialUser = convertFirebaseUser(firebaseUser);
        setAuthState({
          user: initialUser,
          loading: false,
          error: null,
        });

        // 2. Firestore에서 추가 정보 fetch (비동기)
        try {
          const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
          const userData = userDoc.data();
          
          if (userData) {
            // 추가 정보가 있는 경우에만 업데이트
            const hasAdditionalData = 
              (!initialUser.displayName && userData.displayName) ||
              (!initialUser.photoURL && userData.photoURL);
            
            if (hasAdditionalData) {
              setAuthState(prev => ({
                ...prev,
                user: {
                  ...prev.user!,
                  displayName: prev.user!.displayName || userData.displayName,
                  photoURL: prev.user!.photoURL || userData.photoURL,
                }
              }));
            }
          }
        } catch (error) {
          // Firestore fetch 실패 시 무시 (이미 최소 정보 있음)
          console.warn('Failed to fetch additional user data:', error);
        }
      } else {
        setAuthState({ 
          user: null, 
          loading: false, 
          error: null
        });
      }
    });
    return () => unsubscribe();
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    try {
      setAuthState(prev => ({ ...prev, loading: true, error: null }));
      await signInWithEmailAndPassword(auth, email, password);
      // onAuthStateChanged가 자동으로 상태를 업데이트하므로 여기서는 loading만 false로 설정
      setAuthState(prev => ({ ...prev, loading: false }));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Sign in failed';
      setAuthState(prev => ({ 
        ...prev, 
        loading: false, 
        error: errorMessage
      }));
      throw error; // 에러를 다시 throw하여 AuthModal에서 처리할 수 있도록 함
    }
  }, []);

  const signInWithGoogle = useCallback(async () => {
    try {
      setAuthState(prev => ({ ...prev, loading: true, error: null }));
      const provider = new GoogleAuthProvider();
      
      console.log('Starting Google OAuth...');
      console.log('Current URL:', window.location.origin);
      console.log('Auth domain:', auth.app.options.authDomain);
      
      // COOP 정책 문제를 해결하기 위한 설정
      provider.setCustomParameters({
        prompt: 'select_account'
      });
      
      // 팝업 차단 문제를 해결하기 위한 다단계 접근
      console.log('Attempting Google sign-in with multiple fallback methods...');
      
      try {
        // 1단계: 직접 팝업 방식 시도
        const result = await signInWithPopup(auth, provider);
        console.log('Google OAuth successful via direct popup:', result.user.email);
        setAuthState(prev => ({ ...prev, loading: false }));
        return;
      } catch (popupError) {
        console.warn('Direct popup failed, trying redirect method:', popupError);
        
        // 팝업 실패 시 리다이렉트 방식 사용
        setAuthState(prev => ({ 
          ...prev, 
          loading: false, 
          error: 'Redirecting to Google sign in... Please complete the process and return to this page.' 
        }));
        
        // 현재 페이지 URL을 저장하여 로그인 후 돌아올 수 있도록 함
        const currentUrl = window.location.href;
        localStorage.setItem('redirectAfterAuth', currentUrl);
        
        // Firebase signInWithRedirect 사용 (팝업 차단에 영향받지 않음)
        await signInWithRedirect(auth, provider);
        return;
      }
    } catch (error) {
      console.error('Google OAuth error details:', error);
      
      let errorMessage = 'Google sign in failed';
      if (error instanceof Error) {
        console.log('Error code:', error.message);
        if (error.message.includes('popup-closed-by-user')) {
          errorMessage = 'Sign in was cancelled. Please try again.';
        } else if (error.message.includes('popup-blocked')) {
          errorMessage = 'Popup was blocked. Please allow popups and try again.';
        } else if (error.message.includes('network-request-failed')) {
          errorMessage = 'Network error. Please check your connection and try again.';
        } else if (error.message.includes('Cross-Origin-Opener-Policy') || 
                   error.message.includes('window.closed')) {
          errorMessage = 'Browser security policy blocked the sign-in popup. Please try refreshing the page or use a different browser.';
        } else {
          errorMessage = `Google sign in failed: ${error.message}`;
        }
      }
      
      setAuthState(prev => ({ 
        ...prev, 
        loading: false, 
        error: errorMessage
      }));
    }
  }, []);

  const signUp = useCallback(async (email: string, password: string, displayName: string) => {
    try {
      setAuthState(prev => ({ ...prev, loading: true, error: null }));
      const { user: firebaseUser } = await createUserWithEmailAndPassword(auth, email, password);
      
      // Send email verification
      await firebaseSendEmailVerification(firebaseUser);
      
      // Save additional user data to Firestore
      await setDoc(doc(db, 'users', firebaseUser.uid), {
        displayName,
        email,
        createdAt: new Date(),
        lastLoginAt: new Date(),
        emailVerified: false,
      });
      
      // onAuthStateChanged가 자동으로 상태를 업데이트하므로 여기서는 loading만 false로 설정
      setAuthState(prev => ({ ...prev, loading: false }));
    } catch (error) {
      setAuthState(prev => ({ 
        ...prev, 
        loading: false, 
        error: error instanceof Error ? error.message : 'Sign up failed' 
      }));
    }
  }, []);

  const signOut = useCallback(async () => {
    try {
      setAuthState(prev => ({ ...prev, loading: true, error: null }));
      await firebaseSignOut(auth);
    } catch (error) {
      setAuthState(prev => ({ 
        ...prev, 
        loading: false, 
        error: error instanceof Error ? error.message : 'Sign out failed' 
      }));
    }
  }, []);

  const resetPassword = useCallback(async (email: string) => {
    try {
      setAuthState(prev => ({ ...prev, loading: true, error: null }));
      await sendPasswordResetEmail(auth, email);
      setAuthState(prev => ({ ...prev, loading: false, error: null }));
    } catch (error) {
      setAuthState(prev => ({ 
        ...prev, 
        loading: false, 
        error: error instanceof Error ? error.message : 'Password reset failed' 
      }));
    }
  }, []);

  const sendEmailVerification = useCallback(async () => {
    try {
      if (!auth.currentUser) throw new Error('No user logged in');
      setAuthState(prev => ({ ...prev, loading: true, error: null }));
      await firebaseSendEmailVerification(auth.currentUser);
      setAuthState(prev => ({ ...prev, loading: false, error: null }));
    } catch (error) {
      setAuthState(prev => ({ 
        ...prev, 
        loading: false, 
        error: error instanceof Error ? error.message : 'Email verification failed' 
      }));
    }
  }, []);

  const reauthenticate = useCallback(async (password: string) => {
    try {
      if (!auth.currentUser || !auth.currentUser.email) throw new Error('No user logged in');
      
      const credential = EmailAuthProvider.credential(auth.currentUser.email, password);
      await reauthenticateWithCredential(auth.currentUser, credential);
      console.log('User reauthenticated successfully');
    } catch (error) {
      console.error('Reauthentication error:', error);
      throw error;
    }
  }, []);

  const deleteAccount = useCallback(async (password?: string) => {
    try {
      if (!auth.currentUser) throw new Error('No user logged in');
      console.log('User ID:', auth.currentUser.uid);
      setAuthState(prev => ({ ...prev, loading: true, error: null }));
      
      // 비밀번호가 제공된 경우 재인증 수행
      if (password) {
        console.log('Reauthenticating user...');
        await reauthenticate(password);
      }
      
      // 먼저 Firestore에서 사용자 데이터와 관련 팀들 삭제 시도
      try {
        console.log('Deleting user data and related teams from Firestore...');
        
        // 1. 사용자가 생성한 모든 팀들 삭제
        const workspacesQuery = query(
          collection(db, 'workspaces'), 
          where('userId', '==', auth.currentUser.uid)
        );
        const workspacesSnapshot = await getDocs(workspacesQuery);
        
        console.log(`Found ${workspacesSnapshot.size} teams to delete`);
        
        // 각 팀 삭제
        const deletePromises = workspacesSnapshot.docs.map(doc => {
          console.log(`Deleting team: ${doc.id}`);
          return deleteDoc(doc.ref);
        });
        
        await Promise.all(deletePromises);
        console.log('All user teams deleted from Firestore');
        
        // 2. 사용자 데이터 삭제
        await deleteDoc(doc(db, 'users', auth.currentUser.uid));
        console.log('User data deleted from Firestore');
        
      } catch (firestoreError) {
        console.warn('Failed to delete user data/teams from Firestore:', firestoreError);
        // Firestore 삭제 실패해도 계속 진행
      }
      
      // Firebase Auth에서 사용자 계정 삭제
      console.log('Deleting user account from Firebase Auth...');
      await deleteUser(auth.currentUser);
      console.log('User account deleted from Firebase Auth');
      
      // 계정 삭제 후 즉시 로그아웃 상태로 설정
      setAuthState({ user: null, loading: false, error: null });
      console.log('Auth state updated to logged out');
      
    } catch (error) {
      console.error('Delete account error:', error);
      
      // 계정 삭제 실패 시에도 로그아웃 처리
      try {
        await firebaseSignOut(auth);
        setAuthState({ user: null, loading: false, error: null });
        console.log('Forced logout after delete failure');
      } catch (logoutError) {
        console.error('Logout error:', logoutError);
      }
      
      setAuthState(prev => ({ 
        ...prev, 
        loading: false, 
        error: error instanceof Error ? error.message : 'Account deletion failed' 
      }));
      throw error; // 에러를 다시 throw해서 상위에서 처리할 수 있도록
    }
  }, []);

  const clearError = useCallback(() => {
    setAuthState(prev => ({ ...prev, error: null }));
  }, []);

  const value: AuthContextType = useMemo(() => ({
    ...authState,
    signIn,
    signInWithGoogle,
    signUp,
    signOut,
    resetPassword,
    sendEmailVerification,
    deleteAccount,
    reauthenticate,
    clearError,
  }), [authState, signIn, signInWithGoogle, signUp, signOut, resetPassword, sendEmailVerification, deleteAccount, reauthenticate, clearError]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}; 