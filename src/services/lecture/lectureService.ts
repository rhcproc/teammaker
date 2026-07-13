import { 
  collection, 
  query, 
  where, 
  getDocs,
  doc,
  getDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  orderBy,
  arrayUnion,
  arrayRemove
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { db, storage } from '../firebase/config';
import { LectureNote, LectureAttachment, LectureTeamAssignment, ApiResponse } from '../../types';

/**
 * 워크스페이스의 모든 Lecture Note 조회
 */
export const getLectureNotes = async (workspaceId: string): Promise<ApiResponse<LectureNote[]>> => {
  try {
    // 먼저 workspaceId로만 필터링
    const q = query(
      collection(db, 'lectureNotes'), 
      where('workspaceId', '==', workspaceId)
    );
    const snapshot = await getDocs(q);
    
    const lectureNotes: LectureNote[] = [];
    snapshot.forEach(docSnap => {
      lectureNotes.push({ id: docSnap.id, ...docSnap.data() } as LectureNote);
    });
    
    // 클라이언트 사이드에서 주차별로 정렬
    lectureNotes.sort((a, b) => a.week - b.week);
    
    return {
      success: true,
      data: lectureNotes
    };
  } catch (error) {
    console.error('Failed to get lecture notes:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get lecture notes'
    };
  }
};

/**
 * 특정 Lecture Note 조회
 */
export const getLectureNote = async (lectureNoteId: string): Promise<ApiResponse<LectureNote>> => {
  try {
    const docRef = doc(db, 'lectureNotes', lectureNoteId);
    const docSnap = await getDoc(docRef);
    
    if (!docSnap.exists()) {
      return {
        success: false,
        error: 'Lecture note not found'
      };
    }
    
    return {
      success: true,
      data: { id: docSnap.id, ...docSnap.data() } as LectureNote
    };
  } catch (error) {
    console.error('Failed to get lecture note:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get lecture note'
    };
  }
};

/**
 * Lecture Note 생성
 */
export const createLectureNote = async (
  title: string,
  description: string,
  week: number,
  workspaceId: string,
  createdBy: string,
  content?: string,
  hasAssignment?: boolean,
  assignmentData?: {
    title: string;
    description: string;
    deadline?: number;
    maxFileSize?: number;
    allowedFileTypes?: string[];
    teamAssignments: LectureTeamAssignment[];
  }
): Promise<ApiResponse<string>> => {
  try {
    const now = Date.now();
    const lectureNoteData = {
      title: title.trim(),
      description: description.trim(),
      week,
      workspaceId,
      createdBy,
      createdAt: now,
      updatedAt: now,
      content: content || '',
      attachments: [],
      isPublished: false,
      hasAssignment: hasAssignment || false,
      assignmentTitle: assignmentData?.title || '',
      assignmentDescription: assignmentData?.description || '',
      assignmentDeadline: assignmentData?.deadline || null,
      maxFileSize: assignmentData?.maxFileSize || 5,
      allowedFileTypes: assignmentData?.allowedFileTypes || ['pdf'],
      teamAssignments: assignmentData?.teamAssignments || []
    };
    
    const docRef = await addDoc(collection(db, 'lectureNotes'), lectureNoteData);
    
    return {
      success: true,
      data: docRef.id
    };
  } catch (error) {
    console.error('Failed to create lecture note:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create lecture note'
    };
  }
};

/**
 * Lecture Note 업데이트
 */
export const updateLectureNote = async (
  lectureNoteId: string,
  updates: Partial<Pick<LectureNote, 'title' | 'description' | 'content' | 'isPublished' | 'teamAssignments'>>
): Promise<ApiResponse<void>> => {
  try {
    const docRef = doc(db, 'lectureNotes', lectureNoteId);
    await updateDoc(docRef, {
      ...updates,
      updatedAt: Date.now()
    });
    
    return {
      success: true
    };
  } catch (error) {
    console.error('Failed to update lecture note:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update lecture note'
    };
  }
};

/**
 * Lecture Note 삭제
 */
export const deleteLectureNote = async (lectureNoteId: string): Promise<ApiResponse<void>> => {
  try {
    // 먼저 첨부파일들을 Storage에서 삭제
    const lectureNoteResult = await getLectureNote(lectureNoteId);
    if (lectureNoteResult.success && lectureNoteResult.data) {
      const attachments = lectureNoteResult.data.attachments;
      for (const attachment of attachments) {
        try {
          const fileRef = ref(storage, attachment.fileUrl);
          await deleteObject(fileRef);
        } catch (error) {
          console.warn('Failed to delete attachment file:', attachment.fileName, error);
        }
      }
    }
    
    // Firestore에서 Lecture Note 삭제
    await deleteDoc(doc(db, 'lectureNotes', lectureNoteId));
    
    return {
      success: true
    };
  } catch (error) {
    console.error('Failed to delete lecture note:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete lecture note'
    };
  }
};

/**
 * 파일을 Storage에 업로드하고 URL 반환
 */
export const uploadLectureAttachment = async (
  file: File,
  workspaceId: string,
  lectureNoteId: string
): Promise<ApiResponse<LectureAttachment>> => {
  try {
    // 파일 크기 제한 (10MB)
    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      return {
        success: false,
        error: 'File size must be less than 10MB'
      };
    }
    
    // 허용된 파일 타입
    const allowedTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
      'image/jpeg',
      'image/png',
      'image/gif',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    ];
    
    if (!allowedTypes.includes(file.type)) {
      return {
        success: false,
        error: 'File type not allowed. Allowed types: PDF, DOC, DOCX, TXT, JPG, PNG, GIF, PPT, PPTX'
      };
    }
    
    // Storage 경로 생성
    const fileName = `${Date.now()}_${file.name}`;
    const filePath = `lecture-notes/${workspaceId}/${lectureNoteId}/${fileName}`;
    const fileRef = ref(storage, filePath);
    
    // 파일 업로드
    const uploadResult = await uploadBytes(fileRef, file);
    const downloadURL = await getDownloadURL(uploadResult.ref);
    
    const attachment: LectureAttachment = {
      id: Date.now().toString(),
      fileName: file.name,
      fileUrl: downloadURL,
      fileSize: file.size,
      fileType: file.type,
      uploadedAt: Date.now()
    };
    
    return {
      success: true,
      data: attachment
    };
  } catch (error) {
    console.error('Failed to upload lecture attachment:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to upload file'
    };
  }
};

/**
 * Lecture Note에 첨부파일 추가
 */
export const addLectureAttachment = async (
  lectureNoteId: string,
  attachment: LectureAttachment
): Promise<ApiResponse<void>> => {
  try {
    const docRef = doc(db, 'lectureNotes', lectureNoteId);
    await updateDoc(docRef, {
      attachments: arrayUnion(attachment),
      updatedAt: Date.now()
    });
    
    return {
      success: true
    };
  } catch (error) {
    console.error('Failed to add lecture attachment:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to add attachment'
    };
  }
};

/**
 * Lecture Note에서 첨부파일 제거
 */
export const removeLectureAttachment = async (
  lectureNoteId: string,
  attachment: LectureAttachment
): Promise<ApiResponse<void>> => {
  try {
    // Storage에서 파일 삭제
    try {
      const fileRef = ref(storage, attachment.fileUrl);
      await deleteObject(fileRef);
    } catch (error) {
      console.warn('Failed to delete attachment file:', attachment.fileName, error);
    }
    
    // Firestore에서 첨부파일 정보 제거
    const docRef = doc(db, 'lectureNotes', lectureNoteId);
    await updateDoc(docRef, {
      attachments: arrayRemove(attachment),
      updatedAt: Date.now()
    });
    
    return {
      success: true
    };
  } catch (error) {
    console.error('Failed to remove lecture attachment:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to remove attachment'
    };
  }
};

/**
 * 특정 주차의 Lecture Note가 이미 존재하는지 확인
 */
export const checkWeekExists = async (
  workspaceId: string,
  week: number,
  excludeId?: string
): Promise<ApiResponse<boolean>> => {
  try {
    const q = query(
      collection(db, 'lectureNotes'),
      where('workspaceId', '==', workspaceId),
      where('week', '==', week)
    );
    const snapshot = await getDocs(q);
    
    // excludeId가 제공된 경우, 해당 ID는 제외
    const exists = snapshot.docs.some(doc => doc.id !== excludeId);
    
    return {
      success: true,
      data: exists
    };
  } catch (error) {
    console.error('Failed to check week exists:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to check week exists'
    };
  }
};
