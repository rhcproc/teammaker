import { 
  collection, 
  query, 
  where, 
  getDocs,
  doc,
  getDoc
} from 'firebase/firestore';
import { db } from '../firebase/config';

/**
 * 이메일로 사용자 ID 찾기
 */
export const getUserIdByEmail = async (email: string): Promise<string | null> => {
  try {
    const q = query(
      collection(db, 'users'),
      where('email', '==', email.toLowerCase())
    );

    const snapshot = await getDocs(q);
    if (snapshot.empty) {
      return null;
    }

    return snapshot.docs[0].id;
  } catch (error) {
    console.error('Failed to get user ID by email:', error);
    return null;
  }
};

/**
 * 사용자 ID로 사용자 정보 가져오기
 */
export const getUserById = async (userId: string) => {
  try {
    const userRef = doc(db, 'users', userId);
    const userSnap = await getDoc(userRef);
    
    if (userSnap.exists()) {
      return { id: userSnap.id, ...userSnap.data() };
    }
    
    return null;
  } catch (error) {
    console.error('Failed to get user by ID:', error);
    return null;
  }
};

/**
 * 여러 이메일로 사용자 ID들 찾기
 */
export const getUserIdsByEmails = async (emails: string[]): Promise<{ email: string; userId: string | null }[]> => {
  try {
    const results = await Promise.all(
      emails.map(async (email) => ({
        email,
        userId: await getUserIdByEmail(email)
      }))
    );
    
    return results;
  } catch (error) {
    console.error('Failed to get user IDs by emails:', error);
    return emails.map(email => ({ email, userId: null }));
  }
};
