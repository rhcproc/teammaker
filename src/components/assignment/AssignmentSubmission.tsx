import React, { useState } from 'react';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { doc, updateDoc, arrayUnion, arrayRemove, getDoc } from 'firebase/firestore';
import { storage, db } from '../../services/firebase/config';
import { useAuth } from '../../contexts/AuthContext';
import { AssignmentSubmission as AssignmentSubmissionType } from '../../types';
import { calculateUserStorageUsage, STORAGE_LIMIT_BYTES } from '../../utils/storageUtils';
import { createAssignmentSubmittedNotification } from '../../services/notification/notificationService';
import { getUserIdByEmail } from '../../services/user/userService';

interface AssignmentSubmissionProps {
  assignmentId: string;
  teamId: string;
  teamName: string;
  leaderEmail: string;
  leaderName: string;
  maxPdfSize: number;
  allowedFileTypes?: string[];
  onSubmissionSuccess: () => Promise<void>;
  existingSubmission?: AssignmentSubmissionType;
  assignmentTitle?: string;
  workspaceId?: string;
}

const AssignmentSubmission: React.FC<AssignmentSubmissionProps> = ({
  assignmentId,
  teamId,
  teamName,
  leaderEmail,
  leaderName,
  maxPdfSize,
  allowedFileTypes = ['pdf'],
  onSubmissionSuccess,
  existingSubmission,
  assignmentTitle,
  workspaceId
}) => {
  const { user } = useAuth();
  const [files, setFiles] = useState<File[]>([]);
  const [description, setDescription] = useState<string>('');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // 로그인한 사용자의 이메일이 팀 리더 이메일과 일치하는지 확인
  const isAuthorized = user && user.email && user.email.toLowerCase() === leaderEmail.toLowerCase();


  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    if (selectedFiles.length === 0) return;

    const validFiles: File[] = [];
    const errors: string[] = [];

    selectedFiles.forEach((file, index) => {
      // 파일 확장자 검증
      const fileExtension = file.name.split('.').pop()?.toLowerCase();
      if (!fileExtension || !allowedFileTypes.includes(fileExtension)) {
        errors.push(`${file.name}: Only ${allowedFileTypes.join(', ').toUpperCase()} files are allowed.`);
        return;
      }

      // 파일 크기 검증
      if (file.size > maxPdfSize * 1024 * 1024) {
        errors.push(`${file.name}: File size cannot exceed ${maxPdfSize}MB.`);
        return;
      }

      validFiles.push(file);
    });

    if (errors.length > 0) {
      setError(errors.join('\n'));
      return;
    }

    setFiles(validFiles);
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (files.length === 0) return;

    if (!isAuthorized) {
      setError('Only team leaders can submit assignments.');
      return;
    }

    // Storage 제한 확인
    if (user) {
      try {
        const currentUsage = await calculateUserStorageUsage(user.id);
        const totalFileSize = files.reduce((sum, file) => sum + file.size, 0);
        if (currentUsage + totalFileSize > STORAGE_LIMIT_BYTES) {
          setError(`Storage limit exceeded. You have ${Math.round((STORAGE_LIMIT_BYTES - currentUsage) / (1024 * 1024))}MB remaining.`);
          return;
        }
      } catch (error) {
        console.error('Failed to check storage usage:', error);
        setError('Failed to check storage usage. Please try again.');
        return;
      }
    }

    setUploading(true);
    setError(null);

    try {
      // 여러 파일을 업로드하고 URL들을 수집
      const uploadedFiles = await Promise.all(
        files.map(async (file) => {
          const fileName = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}_${file.name}`;
          const storageRef = ref(storage, `assignment-submissions/${assignmentId}/${teamId}/${fileName}`);
          
          const snapshot = await uploadBytes(storageRef, file);
          const downloadURL = await getDownloadURL(snapshot.ref);
          
          return {
            fileName: file.name,
            fileUrl: downloadURL,
            fileSize: file.size
          };
        })
      );

      // Firestore에 제출 정보 저장 (여러 파일 정보 포함)
      const submissionData: any = {
        teamId,
        teamName,
        leaderEmail,
        leaderName,
        fileName: uploadedFiles.map(f => f.fileName).join(', '), // 모든 파일명을 쉼표로 구분
        fileUrl: uploadedFiles.map(f => f.fileUrl).join(', '), // 모든 URL을 쉼표로 구분
        submittedAt: Date.now(),
        fileSize: uploadedFiles.reduce((sum, f) => sum + f.fileSize, 0), // 총 파일 크기
        files: uploadedFiles // 개별 파일 정보도 저장
      };

      // description이 비어있지 않을 때만 추가
      if (description.trim()) {
        submissionData.description = description.trim();
      }

      const assignmentRef = doc(db, 'assignments', assignmentId);
      
      // 기존 제출이 있는지 확인하고 제거
      const assignmentDoc = await getDoc(assignmentRef);
      if (assignmentDoc.exists()) {
        const assignmentData = assignmentDoc.data();
        const existingSubmissions = assignmentData.submissions || [];
        const existingSubmission = existingSubmissions.find((sub: AssignmentSubmissionType) => sub.teamId === teamId);
        
        if (existingSubmission) {
          // 기존 제출 제거
          await updateDoc(assignmentRef, {
            submissions: arrayRemove(existingSubmission)
          });
        }
      }
      
      // 새로운 제출 추가
      await updateDoc(assignmentRef, {
        submissions: arrayUnion(submissionData)
      });

      // 제출 성공 콜백 먼저 호출 (모달 닫기 및 상태 업데이트)
      console.log('Calling onSubmissionSuccess callback...');
      await onSubmissionSuccess();
      console.log('onSubmissionSuccess callback completed');
      
      setSuccess(true);
      setFiles([]);
      setDescription('');
      
      // Assignment 생성자에게 알림 전송
      if (assignmentTitle && workspaceId && user) {
        try {
          // Assignment 문서에서 생성자 정보 가져오기
          const assignmentDoc = await getDoc(assignmentRef);
          if (assignmentDoc.exists()) {
            const assignmentData = assignmentDoc.data();
            const creatorEmail = assignmentData.createdBy;
            
            if (creatorEmail && creatorEmail !== user.email) {
              const creatorUserId = await getUserIdByEmail(creatorEmail);
              if (creatorUserId) {
                await createAssignmentSubmittedNotification(
                  creatorUserId,
                  assignmentTitle,
                  teamName,
                  workspaceId,
                  assignmentId
                );
              }
            }
          }
        } catch (notificationError) {
          console.error('Failed to send submission notification:', notificationError);
        }
      }
    } catch (error) {
      console.error('Upload failed:', error);
      setError('File upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h4 className="font-medium text-gray-900 dark:text-white">{teamName}</h4>
          <p className="text-sm text-gray-600 dark:text-gray-400">Leader: {leaderName}</p>
          <p className="text-xs text-gray-500 dark:text-gray-500">{leaderEmail}</p>
        </div>
        <div className="text-right">
          <span className="text-xs bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-200 px-2 py-1 rounded-full">
            Pending
          </span>
        </div>
      </div>


      {/* 재제출 안내 메시지 */}
      {existingSubmission && (
        <div className="mb-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
          <div className="flex items-center space-x-2">
            <span className="text-yellow-600 dark:text-yellow-400">⚠️</span>
            <div>
              <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
                Resubmission
              </p>
              <p className="text-xs text-yellow-700 dark:text-yellow-300">
                You have already submitted this assignment. Submitting again will replace your previous submission.
              </p>
            </div>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-3">

        {/* 파일 업로드 섹션 */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            File Upload (Max {maxPdfSize}MB per file) - {allowedFileTypes.join(', ').toUpperCase()}
            <span className="block text-xs text-gray-500 dark:text-gray-400 mt-1">
              💡 Tip: Hold Ctrl (or Cmd on Mac) to select multiple files
            </span>
          </label>
          <input
            type="file"
            multiple
            accept={allowedFileTypes.map(type => `.${type}`).join(',')}
            onChange={handleFileChange}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white text-sm"
            disabled={uploading}
          />
          {files.length > 0 && (
            <div className="mt-2 space-y-1">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Selected files ({files.length}):
                </p>
                <button
                  type="button"
                  onClick={() => setFiles([])}
                  className="text-xs text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
                >
                  Clear all
                </button>
              </div>
              {files.map((file, index) => (
                <div key={index} className="flex items-center justify-between text-xs bg-gray-50 dark:bg-gray-700 px-2 py-1 rounded">
                  <span className="text-gray-700 dark:text-gray-300 truncate flex-1 mr-2">
                    {file.name}
                  </span>
                  <div className="flex items-center space-x-2">
                    <span className="text-gray-500 dark:text-gray-400">
                      {(file.size / 1024 / 1024).toFixed(2)} MB
                    </span>
                    <button
                      type="button"
                      onClick={() => setFiles(files.filter((_, i) => i !== index))}
                      className="text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                      title="Remove file"
                    >
                      ×
                    </button>
                  </div>
                </div>
              ))}
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Total size: {(files.reduce((sum, file) => sum + file.size, 0) / 1024 / 1024).toFixed(2)} MB
              </p>
            </div>
          )}
        </div>

        {/* 텍스트 설명 섹션 */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Additional Notes (Optional)
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Add any additional notes or comments about your submission..."
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white text-sm resize-none"
            rows={3}
            maxLength={500}
            disabled={uploading}
          />
          <div className="flex justify-between items-center mt-1">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              This note will only be visible to the assignment creator
            </p>
            <p className="text-xs text-gray-400 dark:text-gray-500">
              {description.length}/500
            </p>
          </div>
        </div>

        {error && (
          <div className="p-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
            <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
          </div>
        )}

        {success && (
          <div className="p-2 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
            <p className="text-sm text-green-800 dark:text-green-200">
              ✅ File submitted successfully!
            </p>
          </div>
        )}

        {success ? (
          <button
            type="button"
            onClick={() => {
              setSuccess(false);
              setFiles([]);
              setDescription('');
              setError(null);
            }}
            className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center space-x-2"
          >
            <span>Submit Another</span>
          </button>
        ) : (
          <button
            type="submit"
            disabled={files.length === 0 || uploading}
            className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
          >
            {uploading ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                <span>Uploading...</span>
              </>
            ) : (
              <span>Submit</span>
            )}
          </button>
        )}
      </form>
    </div>
  );
};

export default AssignmentSubmission;
