import React, { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { LectureAssignmentSubmission } from '../../types';
import { submitLectureAssignment, deleteLectureAssignmentSubmission } from '../../services/lecture/lectureAssignmentService';
import { calculateUserStorageUsage, STORAGE_LIMIT_BYTES } from '../../utils/storageUtils';

interface LectureAssignmentSubmissionProps {
  lectureNoteId: string;
  teamId: string;
  teamName: string;
  leaderEmail: string;
  leaderName: string;
  maxFileSize: number;
  allowedFileTypes?: string[];
  existingSubmission?: LectureAssignmentSubmission;
  onSubmissionSuccess: () => Promise<void>;
  isCreator?: boolean;
}

const LectureAssignmentSubmissionComponent: React.FC<LectureAssignmentSubmissionProps> = ({
  lectureNoteId,
  teamId,
  teamName,
  leaderEmail,
  leaderName,
  maxFileSize,
  allowedFileTypes = ['pdf'],
  existingSubmission,
  onSubmissionSuccess,
  isCreator = false
}) => {
  const { user } = useAuth();
  const [files, setFiles] = useState<File[]>([]);
  const [description, setDescription] = useState<string>('');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [showSubmissionForm, setShowSubmissionForm] = useState(false);
  // submissionCompleted 관련 state 제거 - 계속 제출할 수 있도록

  // 로그인한 사용자의 이메일이 팀 리더 이메일과 일치하는지 확인
  const isAuthorized = user && user.email && user.email.toLowerCase() === leaderEmail.toLowerCase();

  // submissionCompleted 관련 로직 제거 - 계속 제출할 수 있도록
  
  // 디버깅: existingSubmission 값 확인
  console.log('LectureAssignmentSubmission Debug:', {
    teamId,
    teamName,
    existingSubmission,
    existingSubmissionType: typeof existingSubmission,
    existingSubmissionNull: existingSubmission === null,
    existingSubmissionUndefined: existingSubmission === undefined,
    existingSubmissionTruthy: !!existingSubmission
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    if (selectedFiles.length === 0) return;

    const validFiles: File[] = [];
    const errors: string[] = [];

    selectedFiles.forEach((file) => {
      // 파일 확장자 검증
      const fileExtension = file.name.split('.').pop()?.toLowerCase();
      if (!fileExtension || !allowedFileTypes.includes(fileExtension)) {
        errors.push(`${file.name}: Only ${allowedFileTypes.join(', ').toUpperCase()} files are allowed.`);
        return;
      }

      // 파일 크기 검증
      if (file.size > maxFileSize * 1024 * 1024) {
        errors.push(`${file.name}: File size cannot exceed ${maxFileSize}MB.`);
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

    // 스토리지 사용량 확인
    if (user) {
      const currentUsage = await calculateUserStorageUsage(user.id);
      const totalFileSize = files.reduce((sum, file) => sum + file.size, 0);
      
      if (currentUsage + totalFileSize > STORAGE_LIMIT_BYTES) {
        setError('Storage limit exceeded. Please delete some files or contact administrator.');
        return;
      }
    }

    setUploading(true);
    setError(null);

    try {
      const result = await submitLectureAssignment(
        lectureNoteId,
        teamId,
        files,
        description
      );

      if (result.success) {
        console.log('✅ Assignment submitted successfully for team:', teamId);
        setSuccess(true);
        // submissionCompleted를 true로 설정하지 않음 - 계속 제출할 수 있도록
        setFiles([]);
        setDescription('');
        // 제출 성공 후에도 모달을 열어두어 사용자가 제출된 상태를 확인할 수 있도록 함
        // setShowSubmissionForm(false); // 이 줄을 제거하여 모달이 닫히지 않도록 함
        
        // 제출 성공 후 부모 컴포넌트 새로고침 (즉시)
        console.log('🔄 Refreshing lecture notes data...');
        try {
          await onSubmissionSuccess();
          console.log('✅ Lecture notes data refreshed successfully');
        } catch (error) {
          console.error('❌ Error refreshing data:', error);
        }
        
        // 5초 후 성공 메시지 숨기기
        setTimeout(() => setSuccess(false), 5000);
      } else {
        setError(result.error || 'Failed to submit assignment');
      }
    } catch (error) {
      console.error('Submission error:', error);
      setError('An unexpected error occurred');
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteSubmission = async () => {
    if (!existingSubmission) return;
    
    if (!window.confirm('Are you sure you want to delete this submission? This action cannot be undone.')) {
      return;
    }

    setUploading(true);
    setError(null);

    try {
      const result = await deleteLectureAssignmentSubmission(
        lectureNoteId,
        teamId,
        existingSubmission
      );

      if (result.success) {
        await onSubmissionSuccess();
      } else {
        setError(result.error || 'Failed to delete submission');
      }
    } catch (error) {
      console.error('Delete error:', error);
      setError('An unexpected error occurred');
    } finally {
      setUploading(false);
    }
  };


  if (!user) {
    return (
      <div className="p-3 bg-gray-50 dark:bg-gray-700 rounded-lg text-center">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Please login to submit assignment
        </p>
      </div>
    );
  }

  // Creator는 모든 팀의 제출 상태를 볼 수 있음
  if (!isAuthorized && !isCreator) {
    return (
      <div className="p-3 bg-gray-50 dark:bg-gray-700 rounded-lg text-center">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Only team leader can submit assignment
        </p>
      </div>
    );
  }

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString();
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 shadow-sm">
      {/* 팀 정보 헤더 */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h6 className="text-lg font-bold text-gray-900 dark:text-white">{teamName}</h6>
          <p className="text-sm text-gray-600 dark:text-gray-400">Leader: {leaderName}</p>
          <p className="text-xs text-gray-500 dark:text-gray-500">{leaderEmail}</p>
        </div>
        <span className={`text-xs px-3 py-1 rounded-full font-medium ${
          existingSubmission
            ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200'
            : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-200'
        }`}>
          {existingSubmission ? 'Submitted' : 'Pending'}
        </span>
      </div>

      {success && (
        <div className="mb-3 p-3 bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 rounded-lg text-sm">
          Assignment submitted successfully!
        </div>
      )}

      {error && (
        <div className="mb-3 p-3 bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200 rounded-lg text-sm whitespace-pre-line">
          {error}
        </div>
      )}

      {/* 제출물 정보 - 항상 표시 */}
      <div className="space-y-3">
        {/* 파일 정보 */}
        {existingSubmission && existingSubmission.fileName && existingSubmission.fileName.trim() !== '' ? (
            <div className="bg-green-50 dark:bg-green-900/20 p-3 rounded-lg border border-green-200 dark:border-green-700">
              <h6 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Files submitted:</h6>
              <div className="space-y-2">
                {existingSubmission.files && existingSubmission.files.length > 0 ? (
                  existingSubmission.files.map((file, index) => (
                    <div key={index} className="flex items-center justify-between">
                      <div className="flex-1">
                        <p className="text-sm text-gray-900 dark:text-white font-medium">• {file.fileName}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">({formatFileSize(file.fileSize)})</p>
                      </div>
                      <a
                        href={file.fileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 text-sm font-medium"
                      >
                        Download
                      </a>
                    </div>
                  ))
                ) : (
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <p className="text-sm text-gray-900 dark:text-white font-medium">• {existingSubmission.fileName}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">({formatFileSize(existingSubmission.fileSize)})</p>
                    </div>
                    <a
                      href={existingSubmission.fileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 text-sm font-medium"
                    >
                      Download
                    </a>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600">
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">No submission yet</p>
              <p className="text-xs text-gray-500 dark:text-gray-500">
                {isCreator 
                  ? "This team has not submitted their assignment yet."
                  : "No files submitted yet."
                }
              </p>
            </div>
          )}

          {/* 제출 정보 */}
          {existingSubmission && existingSubmission.fileName && existingSubmission.fileName.trim() !== '' && (
            <div className="text-sm text-gray-600 dark:text-gray-400">
              <p><span className="font-medium">Submitted:</span> {formatDate(existingSubmission.submittedAt)}</p>
            </div>
          )}

          {/* 추가 노트 */}
          {existingSubmission && existingSubmission.fileName && existingSubmission.fileName.trim() !== '' && existingSubmission.description && (
            <div>
              <h6 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Additional Notes:</h6>
              <p className="text-sm text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-700 p-2 rounded">
                {existingSubmission.description}
              </p>
            </div>
          )}

          {/* 평가 정보 */}
          {existingSubmission && existingSubmission.fileName && existingSubmission.fileName.trim() !== '' ? (
            existingSubmission.score !== undefined ? (
              <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-700">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-blue-800 dark:text-blue-200">
                      Score: {existingSubmission.score}/100
                    </p>
                    {existingSubmission.evaluatedAt && (
                      <p className="text-xs text-blue-600 dark:text-blue-400">
                        Evaluated: {formatDate(existingSubmission.evaluatedAt)}
                      </p>
                    )}
                    {existingSubmission.feedback && (
                      <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">
                        Feedback: {existingSubmission.feedback}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-700">
                <p className="text-sm text-yellow-800 dark:text-yellow-200">Not evaluated yet</p>
              </div>
            )
          ) : (
            <div className="p-3 bg-gray-50 dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {isCreator ? "No submission to evaluate" : "No submission yet"}
              </p>
            </div>
          )}

          {/* 제출 제한 안내 */}
          <div className="text-xs text-gray-500 dark:text-gray-400 text-center pt-2 border-t border-gray-200 dark:border-gray-600">
            Only team leader can submit
          </div>
        </div>
        {/* 제출 버튼 - 팀 리더는 항상 제출 가능 */}
        {isAuthorized ? (
          <div className="text-center py-4">
            <button
              onClick={() => setShowSubmissionForm(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
            >
              {existingSubmission && existingSubmission.fileName && existingSubmission.fileName.trim() !== '' ? 'Resubmit Assignment' : 'Submit Assignment'}
            </button>
            <div className="text-xs text-gray-500 dark:text-gray-400 text-center mt-2">
              Only team leader can submit
            </div>
          </div>
        ) : isCreator ? (
          <div className="text-center py-4">
            <div className="text-xs text-gray-500 dark:text-gray-400 text-center">
              Waiting for team leader to submit
            </div>
          </div>
        ) : null}

      {/* Submission Modal */}
      {showSubmissionForm && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
        >
          <div 
            className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-md max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                {existingSubmission ? 'View/Resubmit Assignment' : 'Submit Assignment'}
              </h3>
            </div>

            {existingSubmission && (
              <div className="mb-4 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-green-900 dark:text-green-100">
                    Current Submission
                  </span>
                  <span className="text-xs text-green-700 dark:text-green-300">
                    {new Date(existingSubmission.submittedAt).toLocaleString()}
                  </span>
                </div>
                
                {existingSubmission.files && existingSubmission.files.length > 0 ? (
                  <div className="space-y-2">
                    {existingSubmission.files.map((file, index) => (
                      <div key={index} className="flex items-center justify-between p-2 bg-white dark:bg-gray-800 rounded border">
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-gray-800 dark:text-gray-200">{file.fileName}</span>
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            ({formatFileSize(file.fileSize)})
                          </span>
                        </div>
                        <a
                          href={file.fileUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 dark:text-blue-400 hover:underline text-sm"
                        >
                          Download
                        </a>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-green-800 dark:text-green-200">
                    {existingSubmission.fileName}
                  </p>
                )}

                {existingSubmission.description && (
                  <div className="mt-2 p-2 bg-white dark:bg-gray-800 rounded border">
                    <p className="text-sm text-gray-800 dark:text-gray-200">
                      {existingSubmission.description}
                    </p>
                  </div>
                )}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Files *
                </label>
                <input
                  type="file"
                  multiple
                  onChange={handleFileChange}
                  accept={allowedFileTypes.map(type => `.${type}`).join(',')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                  disabled={uploading}
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Max file size: {maxFileSize}MB | Allowed types: {allowedFileTypes.join(', ').toUpperCase()}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Description (Optional)
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                  placeholder="Add any additional notes about your submission..."
                  disabled={uploading}
                />
              </div>

              <div className="flex gap-2">
                {success ? (
                  <button
                    type="button"
                    onClick={() => {
                      setSuccess(false);
                      setFiles([]);
                      setDescription('');
                      setError(null);
                    }}
                    className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
                  >
                    Submit Another
                  </button>
                ) : (
                  <>
                    <button
                      type="submit"
                      disabled={uploading || files.length === 0}
                      className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
                    >
                      {uploading ? 'Submitting...' : (existingSubmission ? 'Resubmit' : 'Submit Assignment')}
                    </button>
                    {existingSubmission && (
                      <button
                        type="button"
                        onClick={handleDeleteSubmission}
                        disabled={uploading}
                        className="px-4 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition-colors disabled:opacity-50"
                      >
                        Delete
                      </button>
                    )}
                  </>
                )}
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export { LectureAssignmentSubmissionComponent };
export default LectureAssignmentSubmissionComponent;
