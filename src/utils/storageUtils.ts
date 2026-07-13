import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../services/firebase/config';
import { Assignment, AssignmentSubmission } from '../types';

/**
 * 사용자의 총 Storage 사용량을 계산합니다 (바이트 단위)
 */
export const calculateUserStorageUsage = async (userId: string): Promise<number> => {
  try {
    // 사용자가 생성한 모든 workspace의 assignment들을 가져옵니다
    const assignmentsQuery = query(
      collection(db, 'assignments'),
      where('createdBy', '==', userId)
    );
    
    const assignmentsSnapshot = await getDocs(assignmentsQuery);
    let totalSize = 0;
    
    assignmentsSnapshot.forEach((doc) => {
      const assignment = { id: doc.id, ...doc.data() } as Assignment;
      
      // 각 assignment의 submissions에서 파일 크기를 합산
      if (assignment.submissions && assignment.submissions.length > 0) {
        assignment.submissions.forEach((submission: AssignmentSubmission) => {
          totalSize += submission.fileSize || 0;
        });
      }
    });
    
    return totalSize;
  } catch (error) {
    console.error('Failed to calculate storage usage:', error);
    return 0;
  }
};

/**
 * 바이트를 읽기 쉬운 형태로 변환합니다
 */
export const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

/**
 * Storage 사용량 퍼센티지를 계산합니다
 */
export const calculateStoragePercentage = (usedBytes: number, maxBytes: number): number => {
  if (maxBytes === 0) return 0;
  return Math.min((usedBytes / maxBytes) * 100, 100);
};

/**
 * Storage 제한 설정 (100MB)
 */
export const STORAGE_LIMIT_BYTES = 100 * 1024 * 1024; // 100MB

/**
 * 팀 순서를 localStorage에 저장합니다
 */
export const saveTeamOrder = (userEmail: string, teamOrder: { teamId: string; displayOrder: number; teamNumber: number }[]): void => {
  try {
    const key = `teamOrder_${userEmail}`;
    localStorage.setItem(key, JSON.stringify(teamOrder));
    console.log('✅ Team order saved to localStorage:', teamOrder);
  } catch (error) {
    console.error('Failed to save team order to localStorage:', error);
  }
};

/**
 * localStorage에서 팀 순서를 불러옵니다
 */
export const loadTeamOrder = (userEmail: string): { teamId: string; displayOrder: number; teamNumber: number }[] | null => {
  try {
    const key = `teamOrder_${userEmail}`;
    const stored = localStorage.getItem(key);
    if (stored) {
      const teamOrder = JSON.parse(stored);
      console.log('✅ Team order loaded from localStorage:', teamOrder);
      return teamOrder;
    }
    return null;
  } catch (error) {
    console.error('Failed to load team order from localStorage:', error);
    return null;
  }
};

/**
 * 팀 순서를 localStorage에서 삭제합니다
 */
export const clearTeamOrder = (userEmail: string): void => {
  try {
    const key = `teamOrder_${userEmail}`;
    localStorage.removeItem(key);
    console.log('✅ Team order cleared from localStorage');
  } catch (error) {
    console.error('Failed to clear team order from localStorage:', error);
  }
};
