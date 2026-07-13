import { 
  collection, 
  query, 
  where, 
  getDocs,
  doc,
  getDoc,
  setDoc,
  updateDoc
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { UserPreferences, LectureNoteSortOrder, ApiResponse } from '../../types';

// Re-export for convenience
export type { LectureNoteSortOrder };

/**
 * 사용자 설정 조회
 */
export const getUserPreferences = async (userId: string): Promise<ApiResponse<UserPreferences>> => {
  try {
    const q = query(
      collection(db, 'userPreferences'), 
      where('userId', '==', userId)
    );
    const snapshot = await getDocs(q);
    
    if (snapshot.empty) {
      // 기본 설정으로 새로 생성
      const defaultPreferences: UserPreferences = {
        userId,
        lectureNoteSortOrder: 'week-asc',
        updatedAt: Date.now()
      };
      
      const docRef = doc(collection(db, 'userPreferences'));
      await setDoc(docRef, defaultPreferences);
      
      return {
        success: true,
        data: { ...defaultPreferences, id: docRef.id }
      };
    }
    
    const docSnap = snapshot.docs[0];
    return {
      success: true,
      data: { id: docSnap.id, ...docSnap.data() } as UserPreferences
    };
  } catch (error) {
    console.error('Failed to get user preferences:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get user preferences'
    };
  }
};

/**
 * 사용자 설정 업데이트
 */
export const updateUserPreferences = async (
  userId: string, 
  preferences: Partial<Pick<UserPreferences, 'lectureNoteSortOrder'>>
): Promise<ApiResponse<void>> => {
  try {
    // 먼저 기존 설정 조회
    const existingResult = await getUserPreferences(userId);
    
    if (!existingResult.success || !existingResult.data) {
      return {
        success: false,
        error: 'Failed to get existing preferences'
      };
    }
    
    const updatedPreferences = {
      ...existingResult.data,
      ...preferences,
      updatedAt: Date.now()
    };
    
    const docRef = doc(db, 'userPreferences', existingResult.data.id!);
    await updateDoc(docRef, updatedPreferences);
    
    return {
      success: true
    };
  } catch (error) {
    console.error('Failed to update user preferences:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update user preferences'
    };
  }
};

/**
 * Lecture Note 정렬 함수
 */
export const sortLectureNotes = (notes: any[], sortOrder: LectureNoteSortOrder) => {
  const sortedNotes = [...notes];
  
  switch (sortOrder) {
    case 'week-asc':
      return sortedNotes.sort((a, b) => a.week - b.week);
    case 'week-desc':
      return sortedNotes.sort((a, b) => b.week - a.week);
    case 'created-asc':
      return sortedNotes.sort((a, b) => a.createdAt - b.createdAt);
    case 'created-desc':
      return sortedNotes.sort((a, b) => b.createdAt - a.createdAt);
    default:
      return sortedNotes.sort((a, b) => a.week - b.week);
  }
};

/**
 * 정렬 옵션 라벨
 */
export const getSortOrderLabel = (sortOrder: LectureNoteSortOrder): string => {
  switch (sortOrder) {
    case 'week-asc':
      return 'Week (Ascending)';
    case 'week-desc':
      return 'Week (Descending)';
    case 'created-asc':
      return 'Created Date (Oldest First)';
    case 'created-desc':
      return 'Created Date (Newest First)';
    default:
      return 'Week (Ascending)';
  }
};
