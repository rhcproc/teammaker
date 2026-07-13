import { 
  collection, 
  addDoc, 
  getDocs, 
  doc, 
  getDoc, 
  updateDoc, 
  deleteDoc, 
  query, 
  where,
  arrayUnion 
} from 'firebase/firestore';
import { 
  ref, 
  uploadBytes, 
  getDownloadURL, 
  deleteObject 
} from 'firebase/storage';
import { db, storage } from '../firebase/config';
import { SimpleLectureNote, SimpleAttachment, SimpleTeamSubmission, SimpleIndividualSubmission, SimpleSubmissionFile, ApiResponse } from '../../types';

/**
 * 간단한 Lecture Note 생성
 */
export const createSimpleLectureNote = async (
  title: string,
  description: string,
  week: number,
  workspaceId: string,
  createdBy: string,
  hasTask: boolean = false,
  taskData?: {
    title: string;
    description: string;
    deadline?: number | null;
    maxFileSize?: number;
    allowedFileTypes?: string[];
  },
  date?: string,
  assignmentType?: 'team' | 'individual'
): Promise<ApiResponse<string>> => {
  try {
    const now = Date.now();
    const lectureNoteData = {
      title: title.trim(),
      description: description.trim(),
      week,
      date: date || undefined,
      workspaceId,
      createdBy,
      createdAt: now,
      updatedAt: now,
      isPublished: false,
      attachments: [],
      hasTask,
      taskTitle: taskData?.title || '',
      taskDescription: taskData?.description || '',
      taskDeadline: taskData?.deadline || null,
      maxFileSize: taskData?.maxFileSize || 5,
      allowedFileTypes: taskData?.allowedFileTypes || ['pdf', 'doc', 'docx', 'jpg', 'jpeg', 'png'],
      assignmentType: hasTask ? (assignmentType || 'team') : undefined,
      teamSubmissions: [],
      individualSubmissions: []
    };
    
    const docRef = await addDoc(collection(db, 'simpleLectureNotes'), lectureNoteData);
    
    return {
      success: true,
      data: docRef.id
    };
  } catch (error) {
    console.error('Failed to create simple lecture note:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create lecture note'
    };
  }
};

/**
 * 워크스페이스의 간단한 Lecture Note 목록 조회
 */
export const getSimpleLectureNotes = async (workspaceId: string): Promise<ApiResponse<SimpleLectureNote[]>> => {
  try {
    const q = query(
      collection(db, 'simpleLectureNotes'),
      where('workspaceId', '==', workspaceId)
    );
    
    const querySnapshot = await getDocs(q);
    const lectureNotes: SimpleLectureNote[] = [];
    
    querySnapshot.forEach((doc) => {
      lectureNotes.push({
        id: doc.id,
        ...doc.data()
      } as SimpleLectureNote);
    });
    
    // 클라이언트 사이드에서 정렬
    lectureNotes.sort((a, b) => a.week - b.week);
    
    return {
      success: true,
      data: lectureNotes
    };
  } catch (error) {
    console.error('Failed to get simple lecture notes:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get lecture notes'
    };
  }
};

/**
 * 간단한 Lecture Note 조회
 */
export const getSimpleLectureNote = async (noteId: string): Promise<ApiResponse<SimpleLectureNote>> => {
  try {
    const docRef = doc(db, 'simpleLectureNotes', noteId);
    const docSnap = await getDoc(docRef);
    
    if (docSnap.exists()) {
      return {
        success: true,
        data: {
          id: docSnap.id,
          ...docSnap.data()
        } as SimpleLectureNote
      };
    } else {
      return {
        success: false,
        error: 'Lecture note not found'
      };
    }
  } catch (error) {
    console.error('Failed to get simple lecture note:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get lecture note'
    };
  }
};

/**
 * 간단한 Lecture Note 업데이트
 */
export const updateSimpleLectureNote = async (
  noteId: string,
  updates: Partial<SimpleLectureNote>
): Promise<ApiResponse<void>> => {
  try {
    const docRef = doc(db, 'simpleLectureNotes', noteId);
    
    // undefined 값을 제거하여 Firebase 오류 방지
    const cleanUpdates = Object.fromEntries(
      Object.entries(updates).filter(([_, value]) => value !== undefined)
    );
    
    await updateDoc(docRef, {
      ...cleanUpdates,
      updatedAt: Date.now()
    });
    
    return {
      success: true
    };
  } catch (error) {
    console.error('Failed to update simple lecture note:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update lecture note'
    };
  }
};

/**
 * 간단한 Lecture Note 삭제
 */
export const deleteSimpleLectureNote = async (noteId: string): Promise<ApiResponse<void>> => {
  try {
    const docRef = doc(db, 'simpleLectureNotes', noteId);
    await deleteDoc(docRef);
    
    return {
      success: true
    };
  } catch (error) {
    console.error('Failed to delete simple lecture note:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete lecture note'
    };
  }
};

/**
 * 첨부파일 업로드
 */
export const uploadSimpleAttachment = async (
  noteId: string,
  file: File,
  uploadedBy: string
): Promise<ApiResponse<SimpleAttachment>> => {
  try {
    // 파일 업로드
    const fileName = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}_${file.name}`;
    const storageRef = ref(storage, `simple-lecture-attachments/${noteId}/${fileName}`);
    
    const snapshot = await uploadBytes(storageRef, file);
    const downloadURL = await getDownloadURL(snapshot.ref);
    
    const attachment: SimpleAttachment = {
      id: fileName,
      fileName: file.name,
      fileUrl: downloadURL,
      fileSize: file.size,
      uploadedAt: Date.now(),
      uploadedBy
    };
    
    // Lecture Note에 첨부파일 추가 (원자적 업데이트)
    const docRef = doc(db, 'simpleLectureNotes', noteId);
    
    // Firestore 내부 오류에 대한 retry 로직
    let retryCount = 0;
    const maxRetries = 3;
    
    while (retryCount < maxRetries) {
      try {
        await updateDoc(docRef, {
          attachments: arrayUnion(attachment),
          updatedAt: Date.now()
        });
        break; // 성공하면 루프 종료
      } catch (error) {
        retryCount++;
        console.warn(`Firestore update attempt ${retryCount} failed:`, error);
        
        if (retryCount >= maxRetries) {
          throw error; // 최대 재시도 횟수 초과 시 에러 throw
        }
        
        // 지수 백오프: 1초, 2초, 4초 대기
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, retryCount - 1) * 1000));
      }
    }
    
    return {
      success: true,
      data: attachment
    };
  } catch (error) {
    console.error('Failed to upload simple attachment:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to upload attachment'
    };
  }
};

/**
 * 첨부파일 삭제
 */
export const deleteSimpleAttachment = async (
  noteId: string,
  attachment: SimpleAttachment
): Promise<ApiResponse<void>> => {
  try {
    // Storage에서 파일 삭제
    const fileRef = ref(storage, attachment.fileUrl);
    await deleteObject(fileRef);
    
    // Lecture Note에서 첨부파일 제거
    const docRef = doc(db, 'simpleLectureNotes', noteId);
    const docSnap = await getDoc(docRef);
    
    if (docSnap.exists()) {
      const data = docSnap.data();
      const attachments = data.attachments || [];
      const updatedAttachments = attachments.filter((att: SimpleAttachment) => att.id !== attachment.id);
      
      await updateDoc(docRef, {
        attachments: updatedAttachments,
        updatedAt: Date.now()
      });
    }
    
    return {
      success: true
    };
  } catch (error) {
    console.error('Failed to delete simple attachment:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete attachment'
    };
  }
};

/**
 * 팀 과제 제출
 */
export const submitSimpleTask = async (
  noteId: string,
  teamId: string,
  teamName: string,
  leaderEmail: string,
  leaderName: string,
  files: File[],
  description?: string
): Promise<ApiResponse<SimpleTeamSubmission>> => {
  try {
    // 파일 업로드
    const uploadedFiles = await Promise.all(
      files.map(async (file) => {
        const fileName = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}_${file.name}`;
        const storageRef = ref(storage, `simple-task-submissions/${noteId}/${teamId}/${fileName}`);
        
        const snapshot = await uploadBytes(storageRef, file);
        const downloadURL = await getDownloadURL(snapshot.ref);
        
        return {
          fileName: file.name,
          fileUrl: downloadURL,
          fileSize: file.size
        };
      })
    );
    
    // Lecture Note에 제출물 추가
    const docRef = doc(db, 'simpleLectureNotes', noteId);
    const docSnap = await getDoc(docRef);
    
    let existingSubmission: SimpleTeamSubmission | undefined;
    let submissionCount = 1;
    let submission: SimpleTeamSubmission;
    
    if (docSnap.exists()) {
      const data = docSnap.data();
      const teamSubmissions = data.teamSubmissions || [];
      
      // 기존 제출물에서 제출 횟수 확인
      existingSubmission = teamSubmissions.find((sub: SimpleTeamSubmission) => sub.teamId === teamId);
      submissionCount = existingSubmission ? (existingSubmission.submissionCount || 1) + 1 : 1;
      
      // 기존 제출물이 있으면 Storage에서 파일들 삭제
      if (existingSubmission) {
        for (const file of existingSubmission.files) {
          try {
            const fileRef = ref(storage, file.fileUrl);
            await deleteObject(fileRef);
          } catch (error) {
            console.warn('Failed to delete previous file:', error);
          }
        }
      }
      
      // 새 제출물 생성
      submission = {
        teamId,
        teamName,
        leaderEmail,
        leaderName,
        files: uploadedFiles,
        submittedAt: Date.now(),
        description: description?.trim() || '',
        submissionCount
      };
      
      // 기존 제출물 제거하고 새 제출물 추가
      const filteredSubmissions = teamSubmissions.filter((sub: SimpleTeamSubmission) => sub.teamId !== teamId);
      filteredSubmissions.push(submission);
      
      await updateDoc(docRef, {
        teamSubmissions: filteredSubmissions,
        updatedAt: Date.now()
      });
    } else {
      // Lecture Note가 존재하지 않는 경우 기본 제출물 생성
      submission = {
        teamId,
        teamName,
        leaderEmail,
        leaderName,
        files: uploadedFiles,
        submittedAt: Date.now(),
        description: description?.trim() || '',
        submissionCount
      };
    }
    
    return {
      success: true,
      data: submission
    };
  } catch (error) {
    console.error('Failed to submit simple task:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to submit task'
    };
  }
};

/**
 * 팀 과제 제출 삭제
 */
export const deleteSimpleTaskSubmission = async (
  noteId: string,
  teamId: string
): Promise<ApiResponse<void>> => {
  try {
    const docRef = doc(db, 'simpleLectureNotes', noteId);
    const docSnap = await getDoc(docRef);
    
    if (docSnap.exists()) {
      const data = docSnap.data();
      const teamSubmissions = data.teamSubmissions || [];
      const submission = teamSubmissions.find((sub: SimpleTeamSubmission) => sub.teamId === teamId);
      
      if (submission) {
        // Storage에서 파일들 삭제
        for (const file of submission.files) {
          try {
            const fileRef = ref(storage, file.fileUrl);
            await deleteObject(fileRef);
          } catch (error) {
            console.warn('Failed to delete file:', error);
          }
        }
        
        // Lecture Note에서 제출물 제거
        const updatedSubmissions = teamSubmissions.filter((sub: SimpleTeamSubmission) => sub.teamId !== teamId);
        
        await updateDoc(docRef, {
          teamSubmissions: updatedSubmissions,
          updatedAt: Date.now()
        });
      }
    }
    
    return {
      success: true
    };
  } catch (error) {
    console.error('Failed to delete simple task submission:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete submission'
    };
  }
};

/**
 * 개별 과제 제출
 */
export const submitIndividualTask = async (
  noteId: string,
  userId: string,
  userEmail: string,
  userName: string,
  teamId: string,
  teamName: string,
  files: File[],
  description?: string
): Promise<ApiResponse<SimpleIndividualSubmission>> => {
  try {
    const docRef = doc(db, 'simpleLectureNotes', noteId);
    const docSnap = await getDoc(docRef);
    
    if (!docSnap.exists()) {
      return {
        success: false,
        error: 'Lecture note not found'
      };
    }
    
    const data = docSnap.data();
    const individualSubmissions = data.individualSubmissions || [];
    
    // 기존 제출물 확인
    let existingSubmission = individualSubmissions.find((sub: SimpleIndividualSubmission) => sub.userId === userId);
    let submissionCount = 1;
    
    // 기존 제출물이 있으면 제출 횟수 증가
    if (existingSubmission) {
      submissionCount = (existingSubmission.submissionCount || 1) + 1;
      
      // 기존 파일들 삭제
      for (const file of existingSubmission.files) {
        try {
          const fileRef = ref(storage, file.fileUrl);
          await deleteObject(fileRef);
        } catch (error) {
          console.warn('Failed to delete previous file:', error);
        }
      }
    }
    
    // 새 파일들 업로드
    const uploadedFiles: SimpleSubmissionFile[] = [];
    for (const file of files) {
      const fileName = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}_${file.name}`;
      const storageRef = ref(storage, `individual-submissions/${noteId}/${userId}/${fileName}`);
      
      const snapshot = await uploadBytes(storageRef, file);
      const downloadURL = await getDownloadURL(snapshot.ref);
      
      uploadedFiles.push({
        fileName: file.name,
        fileUrl: downloadURL,
        fileSize: file.size
      });
    }
    
    // 새 제출물 생성
    const submission: SimpleIndividualSubmission = {
      userId,
      userEmail,
      userName,
      teamId,
      teamName,
      files: uploadedFiles,
      submittedAt: Date.now(),
      description: description?.trim() || '',
      submissionCount
    };
    
    // 기존 제출물이 있으면 교체, 없으면 추가
    let updatedSubmissions;
    if (existingSubmission) {
      updatedSubmissions = individualSubmissions.map((sub: SimpleIndividualSubmission) => 
        sub.userId === userId ? submission : sub
      );
    } else {
      updatedSubmissions = [...individualSubmissions, submission];
    }
    
    // Firestore 업데이트 (retry 로직 포함)
    let retryCount = 0;
    const maxRetries = 3;
    
    while (retryCount < maxRetries) {
      try {
        await updateDoc(docRef, {
          individualSubmissions: updatedSubmissions,
          updatedAt: Date.now()
        });
        break;
      } catch (error) {
        retryCount++;
        console.warn(`Firestore update attempt ${retryCount} failed:`, error);
        
        if (retryCount >= maxRetries) {
          throw error;
        }
        
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, retryCount - 1) * 1000));
      }
    }
    
    return {
      success: true,
      data: submission
    };
  } catch (error) {
    console.error('Failed to submit individual task:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to submit task'
    };
  }
};

/**
 * 개별 과제 제출 삭제
 */
export const deleteIndividualTaskSubmission = async (
  noteId: string,
  userId: string
): Promise<ApiResponse<void>> => {
  try {
    const docRef = doc(db, 'simpleLectureNotes', noteId);
    const docSnap = await getDoc(docRef);
    
    if (docSnap.exists()) {
      const data = docSnap.data();
      const individualSubmissions = data.individualSubmissions || [];
      const submission = individualSubmissions.find((sub: SimpleIndividualSubmission) => sub.userId === userId);
      
      if (submission) {
        // Storage에서 파일들 삭제
        for (const file of submission.files) {
          try {
            const fileRef = ref(storage, file.fileUrl);
            await deleteObject(fileRef);
          } catch (error) {
            console.warn('Failed to delete file:', error);
          }
        }
        
        // Lecture Note에서 제출물 제거
        const updatedSubmissions = individualSubmissions.filter((sub: SimpleIndividualSubmission) => sub.userId !== userId);
        
        await updateDoc(docRef, {
          individualSubmissions: updatedSubmissions,
          updatedAt: Date.now()
        });
      }
    }
    
    return {
      success: true
    };
  } catch (error) {
    console.error('Failed to delete individual task submission:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete submission'
    };
  }
};
