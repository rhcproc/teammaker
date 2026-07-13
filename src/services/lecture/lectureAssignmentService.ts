import {
  doc,
  updateDoc,
  arrayUnion,
  arrayRemove,
  getDoc
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { db, storage } from '../firebase/config';
import { LectureAssignmentSubmission, ApiResponse } from '../../types';

/**
 * Lecture Assignment에 파일 제출
 */
export const submitLectureAssignment = async (
  lectureNoteId: string,
  teamId: string,
  files: File[],
  description?: string
): Promise<ApiResponse<LectureAssignmentSubmission>> => {
  try {
    // Lecture Note 문서 가져오기
    const lectureNoteRef = doc(db, 'lectureNotes', lectureNoteId);
    const lectureNoteDoc = await getDoc(lectureNoteRef);
    
    if (!lectureNoteDoc.exists()) {
      return {
        success: false,
        error: 'Lecture note not found'
      };
    }

    const lectureNoteData = lectureNoteDoc.data();
    
    // teamAssignments가 배열인지 객체인지 확인하여 적절히 처리
    let teamAssignment;
    if (Array.isArray(lectureNoteData.teamAssignments)) {
      teamAssignment = lectureNoteData.teamAssignments.find(
        (ta: any) => ta.teamId === teamId
      );
    } else if (lectureNoteData.teamAssignments && typeof lectureNoteData.teamAssignments === 'object') {
      teamAssignment = lectureNoteData.teamAssignments[teamId];
    }

    if (!teamAssignment) {
      console.error('Team assignment not found:', {
        teamId,
        teamAssignments: lectureNoteData.teamAssignments,
        teamAssignmentsType: typeof lectureNoteData.teamAssignments,
        teamAssignmentsIsArray: Array.isArray(lectureNoteData.teamAssignments)
      });
      return {
        success: false,
        error: 'Team assignment not found'
      };
    }

    // 파일 업로드
    const uploadedFiles = await Promise.all(
      files.map(async (file) => {
        const fileName = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}_${file.name}`;
        const storageRef = ref(storage, `lecture-assignments/${lectureNoteId}/${teamId}/${fileName}`);
        
        const snapshot = await uploadBytes(storageRef, file);
        const downloadURL = await getDownloadURL(snapshot.ref);
        
        return {
          fileName: file.name,
          fileUrl: downloadURL,
          fileSize: file.size
        };
      })
    );

    // 제출 데이터 생성
    const submission: LectureAssignmentSubmission = {
      teamId: teamAssignment.teamId,
      teamName: teamAssignment.teamName,
      leaderEmail: teamAssignment.leaderEmail,
      leaderName: teamAssignment.leaderName,
      fileName: uploadedFiles.map(f => f.fileName).join(', '),
      fileUrl: uploadedFiles.map(f => f.fileUrl).join(', '),
      submittedAt: Date.now(),
      fileSize: uploadedFiles.reduce((sum, f) => sum + f.fileSize, 0),
      files: uploadedFiles
    };

    if (description?.trim()) {
      submission.description = description.trim();
    }

    // 기존 제출이 있으면 제거
    const existingSubmissions = teamAssignment.submissions || [];
    if (existingSubmissions.length > 0) {
      // 기존 파일들 삭제
      for (const existingSubmission of existingSubmissions) {
        if (existingSubmission.files) {
          for (const file of existingSubmission.files) {
            try {
              const fileRef = ref(storage, file.fileUrl);
              await deleteObject(fileRef);
            } catch (error) {
              console.warn('Failed to delete old file:', error);
            }
          }
        }
      }
    }

    // teamAssignments 업데이트 (배열과 객체 모두 처리)
    if (Array.isArray(lectureNoteData.teamAssignments)) {
      // 배열인 경우
      const teamIndex = lectureNoteData.teamAssignments.findIndex((ta: any) => ta.teamId === teamId);
      if (teamIndex !== -1) {
        const updatedTeamAssignments = [...lectureNoteData.teamAssignments];
        updatedTeamAssignments[teamIndex] = {
          ...updatedTeamAssignments[teamIndex],
          submissions: [submission] // 기존 제출을 새 제출로 교체
        };
        
        await updateDoc(lectureNoteRef, {
          teamAssignments: updatedTeamAssignments
        });
      }
    } else if (lectureNoteData.teamAssignments && typeof lectureNoteData.teamAssignments === 'object') {
      // 객체인 경우
      const updatedTeamAssignments = {
        ...lectureNoteData.teamAssignments,
        [teamId]: {
          ...lectureNoteData.teamAssignments[teamId],
          submissions: [submission] // 기존 제출을 새 제출로 교체
        }
      };
      
      await updateDoc(lectureNoteRef, {
        teamAssignments: updatedTeamAssignments
      });
    }

    return {
      success: true,
      data: submission
    };
  } catch (error) {
    console.error('Failed to submit lecture assignment:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to submit assignment'
    };
  }
};

/**
 * Lecture Assignment 제출 삭제
 */
export const deleteLectureAssignmentSubmission = async (
  lectureNoteId: string,
  teamId: string,
  submission: LectureAssignmentSubmission
): Promise<ApiResponse<void>> => {
  try {
    const lectureNoteRef = doc(db, 'lectureNotes', lectureNoteId);
    const lectureNoteDoc = await getDoc(lectureNoteRef);
    
    if (!lectureNoteDoc.exists()) {
      return {
        success: false,
        error: 'Lecture note not found'
      };
    }

    const lectureNoteData = lectureNoteDoc.data();
    
    // teamAssignments가 배열인지 객체인지 확인하여 적절히 처리
    let teamAssignment;
    if (Array.isArray(lectureNoteData.teamAssignments)) {
      teamAssignment = lectureNoteData.teamAssignments.find(
        (ta: any) => ta.teamId === teamId
      );
    } else if (lectureNoteData.teamAssignments && typeof lectureNoteData.teamAssignments === 'object') {
      teamAssignment = lectureNoteData.teamAssignments[teamId];
    }

    if (!teamAssignment) {
      return {
        success: false,
        error: 'Team assignment not found'
      };
    }

    // 파일들 삭제
    if (submission.files) {
      for (const file of submission.files) {
        try {
          const fileRef = ref(storage, file.fileUrl);
          await deleteObject(fileRef);
        } catch (error) {
          console.warn('Failed to delete file:', error);
        }
      }
    }

    // teamAssignments 업데이트 (배열과 객체 모두 처리)
    if (Array.isArray(lectureNoteData.teamAssignments)) {
      // 배열인 경우
      const teamIndex = lectureNoteData.teamAssignments.findIndex((ta: any) => ta.teamId === teamId);
      if (teamIndex !== -1) {
        const updatedTeamAssignments = [...lectureNoteData.teamAssignments];
        updatedTeamAssignments[teamIndex] = {
          ...updatedTeamAssignments[teamIndex],
          submissions: [] // 모든 제출 제거
        };
        
        await updateDoc(lectureNoteRef, {
          teamAssignments: updatedTeamAssignments
        });
      }
    } else if (lectureNoteData.teamAssignments && typeof lectureNoteData.teamAssignments === 'object') {
      // 객체인 경우
      const updatedTeamAssignments = {
        ...lectureNoteData.teamAssignments,
        [teamId]: {
          ...lectureNoteData.teamAssignments[teamId],
          submissions: [] // 모든 제출 제거
        }
      };
      
      await updateDoc(lectureNoteRef, {
        teamAssignments: updatedTeamAssignments
      });
    }

    return {
      success: true
    };
  } catch (error) {
    console.error('Failed to delete lecture assignment submission:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete submission'
    };
  }
};
