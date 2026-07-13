import { doc, updateDoc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebase/config';
import { AssignmentSubmission, LectureAssignmentSubmission, ApiResponse } from '../../types';

/**
 * Assignment 제출물 평가
 */
export const evaluateAssignmentSubmission = async (
  assignmentId: string,
  teamId: string,
  score: number,
  feedback: string,
  evaluatedBy: string
): Promise<ApiResponse<void>> => {
  try {
    if (score < 0 || score > 100) {
      return {
        success: false,
        error: 'Score must be between 0 and 100'
      };
    }

    const assignmentRef = doc(db, 'assignments', assignmentId);
    const assignmentDoc = await getDoc(assignmentRef);
    
    if (!assignmentDoc.exists()) {
      return {
        success: false,
        error: 'Assignment not found'
      };
    }

    const assignmentData = assignmentDoc.data();
    const submissions = assignmentData.submissions || [];
    
    // 해당 팀의 제출물 찾기
    const submissionIndex = submissions.findIndex((sub: AssignmentSubmission) => sub.teamId === teamId);
    
    let updatedSubmissions = [...submissions];
    
    if (submissionIndex === -1) {
      // 제출물이 없는 경우 새로운 평가 제출물 생성
      const newSubmission: AssignmentSubmission = {
        teamId,
        teamName: `Team ${teamId}`, // 임시 팀 이름, 나중에 실제 팀 이름으로 업데이트
        leaderEmail: '',
        leaderName: '',
        fileName: '',
        fileUrl: '',
        submittedAt: Date.now(),
        fileSize: 0,
        score,
        feedback: feedback.trim() || '',
        evaluatedAt: Date.now(),
        evaluatedBy
      };
      
      updatedSubmissions.push(newSubmission);
    } else {
      // 기존 제출물 업데이트
      updatedSubmissions[submissionIndex] = {
        ...updatedSubmissions[submissionIndex],
        score,
        feedback: feedback.trim() || '',
        evaluatedAt: Date.now(),
        evaluatedBy
      };
    }

    // undefined 값들을 제거하여 Firebase 호환성 확보
    const cleanSubmissions = updatedSubmissions.map(submission => {
      const cleanSubmission = { ...submission };
      Object.keys(cleanSubmission).forEach(key => {
        if (cleanSubmission[key as keyof AssignmentSubmission] === undefined) {
          delete cleanSubmission[key as keyof AssignmentSubmission];
        }
      });
      return cleanSubmission;
    });

    await updateDoc(assignmentRef, {
      submissions: cleanSubmissions
    });

    return {
      success: true
    };
  } catch (error) {
    console.error('Failed to evaluate assignment submission:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to evaluate submission'
    };
  }
};

/**
 * Lecture Assignment 제출물 평가
 */
export const evaluateLectureAssignmentSubmission = async (
  lectureNoteId: string,
  teamId: string,
  score: number,
  feedback: string,
  evaluatedBy: string
): Promise<ApiResponse<void>> => {
  try {
    if (score < 0 || score > 100) {
      return {
        success: false,
        error: 'Score must be between 0 and 100'
      };
    }

    const lectureNoteRef = doc(db, 'lectureNotes', lectureNoteId);
    const lectureNoteDoc = await getDoc(lectureNoteRef);
    
    if (!lectureNoteDoc.exists()) {
      return {
        success: false,
        error: 'Lecture note not found'
      };
    }

    const lectureNoteData = lectureNoteDoc.data();
    const teamAssignments = lectureNoteData.teamAssignments || [];
    
    // 해당 팀의 assignment 찾기
    const teamAssignmentIndex = teamAssignments.findIndex((ta: any) => ta.teamId === teamId);
    
    if (teamAssignmentIndex === -1) {
      return {
        success: false,
        error: 'Team assignment not found'
      };
    }

    const teamAssignment = teamAssignments[teamAssignmentIndex];
    const submissions = teamAssignment.submissions || [];
    
    if (submissions.length === 0) {
      return {
        success: false,
        error: 'No submission found for this team'
      };
    }

    // 최신 제출물 업데이트
    const updatedSubmissions = [...submissions];
    const latestSubmissionIndex = updatedSubmissions.length - 1;
    updatedSubmissions[latestSubmissionIndex] = {
      ...updatedSubmissions[latestSubmissionIndex],
      score,
      feedback: feedback.trim() || undefined,
      evaluatedAt: Date.now(),
      evaluatedBy
    };

    // teamAssignments 업데이트
    const updatedTeamAssignments = [...teamAssignments];
    updatedTeamAssignments[teamAssignmentIndex] = {
      ...teamAssignment,
      submissions: updatedSubmissions
    };

    await updateDoc(lectureNoteRef, {
      teamAssignments: updatedTeamAssignments
    });

    return {
      success: true
    };
  } catch (error) {
    console.error('Failed to evaluate lecture assignment submission:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to evaluate submission'
    };
  }
};

/**
 * 팀의 평균 점수 계산 (Assignment)
 */
export const calculateTeamAverageScore = async (
  workspaceId: string,
  teamId: string
): Promise<ApiResponse<{ averageScore: number; totalAssignments: number; evaluatedAssignments: number }>> => {
  try {
    // 해당 workspace의 모든 assignment 조회
    const assignmentsRef = collection(db, 'assignments');
    const q = query(assignmentsRef, where('workspaceId', '==', workspaceId));
    const querySnapshot = await getDocs(q);
    
    let totalScore = 0;
    let evaluatedCount = 0;
    let totalAssignments = 0;
    
    querySnapshot.forEach((doc) => {
      const assignmentData = doc.data();
      const submissions = assignmentData.submissions || [];
      
      // 해당 팀의 제출물 찾기
      const teamSubmission = submissions.find((sub: AssignmentSubmission) => sub.teamId === teamId);
      
      if (teamSubmission) {
        totalAssignments++;
        
        if (teamSubmission.score !== undefined) {
          totalScore += teamSubmission.score;
          evaluatedCount++;
        }
      }
    });
    
    const averageScore = evaluatedCount > 0 ? Math.round((totalScore / evaluatedCount) * 100) / 100 : 0;
    
    return {
      success: true,
      data: {
        averageScore,
        totalAssignments,
        evaluatedAssignments: evaluatedCount
      }
    };
  } catch (error) {
    console.error('Failed to calculate team average score:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to calculate average score'
    };
  }
};

/**
 * 팀의 평균 점수 계산 (Lecture Assignment)
 */
export const calculateLectureTeamAverageScore = async (
  workspaceId: string,
  teamId: string
): Promise<ApiResponse<{ averageScore: number; totalAssignments: number; evaluatedAssignments: number }>> => {
  try {
    // 해당 workspace의 모든 lecture note 조회
    const lectureNotesRef = collection(db, 'lectureNotes');
    const q = query(lectureNotesRef, where('workspaceId', '==', workspaceId));
    const querySnapshot = await getDocs(q);
    
    let totalScore = 0;
    let evaluatedCount = 0;
    let totalAssignments = 0;
    
    querySnapshot.forEach((doc) => {
      const lectureNoteData = doc.data();
      const teamAssignments = lectureNoteData.teamAssignments || [];
      
      // 해당 팀의 assignment 찾기
      const teamAssignment = teamAssignments.find((ta: any) => ta.teamId === teamId);
      
      if (teamAssignment && teamAssignment.submissions && teamAssignment.submissions.length > 0) {
        totalAssignments++;
        
        // 최신 제출물의 점수 확인
        const latestSubmission = teamAssignment.submissions[teamAssignment.submissions.length - 1];
        if (latestSubmission.score !== undefined) {
          totalScore += latestSubmission.score;
          evaluatedCount++;
        }
      }
    });
    
    const averageScore = evaluatedCount > 0 ? Math.round((totalScore / evaluatedCount) * 100) / 100 : 0;
    
    return {
      success: true,
      data: {
        averageScore,
        totalAssignments,
        evaluatedAssignments: evaluatedCount
      }
    };
  } catch (error) {
    console.error('Failed to calculate lecture team average score:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to calculate average score'
    };
  }
};

/**
 * 모든 팀의 평균 점수 업데이트 (Assignment)
 */
export const updateAllTeamAverageScores = async (
  workspaceId: string,
  teamIds: string[]
): Promise<ApiResponse<Array<{ teamId: string; averageScore: number; totalAssignments: number; evaluatedAssignments: number }>>> => {
  try {
    const updatePromises = teamIds.map(async (teamId) => {
      const result = await calculateTeamAverageScore(workspaceId, teamId);
      if (result.success && result.data) {
        // 여기서는 계산만 하고, 실제 업데이트는 UI에서 처리
        return { teamId, ...result.data };
      }
      return null;
    });
    
    const results = await Promise.all(updatePromises);
    const validResults = results.filter(result => result !== null) as Array<{ teamId: string; averageScore: number; totalAssignments: number; evaluatedAssignments: number }>;
    
    return {
      success: true,
      data: validResults
    };
  } catch (error) {
    console.error('Failed to update all team average scores:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update average scores'
    };
  }
};

/**
 * 모든 팀의 평균 점수 업데이트 (Lecture Assignment)
 */
export const updateAllLectureTeamAverageScores = async (
  workspaceId: string,
  teamIds: string[]
): Promise<ApiResponse<Array<{ teamId: string; averageScore: number; totalAssignments: number; evaluatedAssignments: number }>>> => {
  try {
    const updatePromises = teamIds.map(async (teamId) => {
      const result = await calculateLectureTeamAverageScore(workspaceId, teamId);
      if (result.success && result.data) {
        // 여기서는 계산만 하고, 실제 업데이트는 UI에서 처리
        return { teamId, ...result.data };
      }
      return null;
    });
    
    const results = await Promise.all(updatePromises);
    const validResults = results.filter(result => result !== null) as Array<{ teamId: string; averageScore: number; totalAssignments: number; evaluatedAssignments: number }>;
    
    return {
      success: true,
      data: validResults
    };
  } catch (error) {
    console.error('Failed to update all lecture team average scores:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update average scores'
    };
  }
};
