import React, { useState, useRef } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { submitIndividualTask, deleteIndividualTaskSubmission } from '../../services/lecture/simpleLectureService';
import { SimpleIndividualSubmission, Group } from '../../types';

interface IndividualTaskSubmissionProps {
  lectureNoteId: string;
  teamId: string;
  teamName: string;
  teamMembers: string[];
  existingSubmission?: SimpleIndividualSubmission;
  allTeamSubmissions?: SimpleIndividualSubmission[]; // 팀의 모든 제출물
  onSubmissionSuccess?: () => void;
  isCreator?: boolean;
}

const IndividualTaskSubmission: React.FC<IndividualTaskSubmissionProps> = ({
  lectureNoteId,
  teamId,
  teamName,
  teamMembers,
  existingSubmission,
  allTeamSubmissions = [],
  onSubmissionSuccess,
  isCreator = false
}) => {
  const { user } = useAuth();
  const [files, setFiles] = useState<File[]>([]);
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 현재 사용자가 이 팀의 멤버인지 확인
  const isTeamMember = user?.email && teamMembers.includes(user.email);
  
  // 현재 사용자의 제출물인지 확인
  const isMySubmission = existingSubmission && user?.email === existingSubmission.userEmail;

  // 제출 권한 확인 (팀 멤버이거나 creator)
  const isAuthorized = isTeamMember || isCreator;

  // 디버깅 로그
  if (process.env.NODE_ENV === 'development') {
    console.log('IndividualTaskSubmission Debug:', {
      teamId,
      teamName,
      userEmail: user?.email,
      teamMembers,
      isTeamMember,
      isCreator,
      isAuthorized,
      existingSubmission: existingSubmission ? {
        userId: existingSubmission.userId,
        userEmail: existingSubmission.userEmail
      } : null
    });
  }

  // 팀 완료 상태 계산
  const submittedMembers = allTeamSubmissions.map(sub => sub.userEmail);
  const completedMembers = teamMembers.filter(member => submittedMembers.includes(member));
  const isTeamComplete = completedMembers.length === teamMembers.length && teamMembers.length > 0;
  const completionRate = teamMembers.length > 0 ? (completedMembers.length / teamMembers.length) * 100 : 0;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    setFiles(selectedFiles);
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!user || !isAuthorized) {
      setError('You are not authorized to submit for this team');
      return;
    }

    if (files.length === 0) {
      setError('Please select at least one file');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const result = await submitIndividualTask(
        lectureNoteId,
        user.id,
        user.email,
        user.displayName || user.email.split('@')[0],
        teamId,
        teamName,
        files,
        description
      );

      if (result.success) {
        setSuccess(true);
        setFiles([]);
        setDescription('');
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
        
        // 부모 컴포넌트에 성공 알림
        if (onSubmissionSuccess) {
          setTimeout(() => {
            onSubmissionSuccess();
          }, 500); // 데이터 전파를 위한 지연
        }
      } else {
        setError(result.error || 'Failed to submit task');
      }
    } catch (error) {
      console.error('Submission error:', error);
      setError('An unexpected error occurred');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!user || !existingSubmission || !isMySubmission) return;
    
    if (!window.confirm('Are you sure you want to delete your submission?')) return;

    try {
      const result = await deleteIndividualTaskSubmission(lectureNoteId, user.id);
      if (result.success && onSubmissionSuccess) {
        onSubmissionSuccess();
      }
    } catch (error) {
      console.error('Delete error:', error);
      setError('Failed to delete submission');
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getSubmissionStatusColor = (submissionCount?: number) => {
    if (!submissionCount || submissionCount === 1) {
      return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200';
    } else if (submissionCount === 2) {
      return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200';
    } else {
      return 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-200';
    }
  };

  if (!isAuthorized) {
    return (
      <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
        <p className="text-gray-600 dark:text-gray-400 text-sm">
          {isCreator ? 'You can view submissions as creator' : 'You are not a member of this team'}
        </p>
      </div>
    );
  }

  return (
    <div className="p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-3">
          <h4 className="text-lg font-semibold text-gray-900 dark:text-white">
            {teamName} - Individual Submission
          </h4>
          {isTeamComplete && (
            <span className="flex items-center px-2 py-1 bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200 rounded-full text-sm font-medium">
              <span className="mr-1">✓</span>
              Team Complete
            </span>
          )}
        </div>
        {existingSubmission && (
          <span className={`px-3 py-1 rounded-full text-sm font-medium ${getSubmissionStatusColor(existingSubmission.submissionCount)}`}>
            {existingSubmission.submissionCount && existingSubmission.submissionCount > 0
              ? `Submitted (${existingSubmission.submissionCount})`
              : 'Submitted'
            }
          </span>
        )}
      </div>

      {/* 팀 완료 진행률 표시 */}
      <div className="mb-4">
        <div className="flex items-center justify-between text-sm text-gray-600 dark:text-gray-400 mb-2">
          <span>Team Progress</span>
          <span>{completedMembers.length}/{teamMembers.length} members submitted</span>
        </div>
        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
          <div 
            className={`h-2 rounded-full transition-all duration-300 ${
              isTeamComplete 
                ? 'bg-green-500' 
                : completionRate >= 50 
                  ? 'bg-yellow-500' 
                  : 'bg-blue-500'
            }`}
            style={{ width: `${completionRate}%` }}
          ></div>
        </div>
      </div>

      {/* 팀 멤버 목록 */}
      <div className="mb-4">
        <h5 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Team Members:</h5>
        <div className="flex flex-wrap gap-2">
          {teamMembers.map((member, index) => {
            const hasSubmitted = allTeamSubmissions.some(sub => sub.userEmail === member);
            return (
              <span
                key={index}
                className={`px-2 py-1 rounded text-xs ${
                  hasSubmitted
                    ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200'
                    : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
                }`}
              >
                {member} {hasSubmitted && '✓'}
              </span>
            );
          })}
        </div>
      </div>

      {/* 팀의 모든 제출물 표시 */}
      {allTeamSubmissions.length > 0 && (
        <div className="mb-4">
          <h5 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Team Submissions:</h5>
          <div className="space-y-3">
            {allTeamSubmissions.map((submission, index) => (
              <div key={index} className="p-3 bg-gray-50 dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600">
                <div className="flex items-center justify-between mb-2">
                  <h6 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    {submission.userName} ({submission.userEmail})
                  </h6>
                  <div className="flex items-center space-x-2">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                      submission.submissionCount === 1 
                        ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200'
                        : submission.submissionCount === 2
                        ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200'
                        : 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-200'
                    }`}>
                      {submission.submissionCount || 1}st attempt
                    </span>
                    {submission.userEmail === user?.email && (
                      <button
                        onClick={handleDelete}
                        className="text-red-600 hover:text-red-800 text-sm"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>
                
                {submission.description && (
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                    {submission.description}
                  </p>
                )}
                
                <div className="space-y-1">
                  {submission.files.map((file, fileIndex) => (
                    <div key={fileIndex} className="flex items-center text-sm text-gray-600 dark:text-gray-400">
                      <span className="mr-2">📎</span>
                      <a
                        href={file.fileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:text-blue-600 dark:hover:text-blue-400 underline"
                      >
                        {file.fileName}
                      </a>
                      <span className="ml-2 text-xs">({formatFileSize(file.fileSize)})</span>
                    </div>
                  ))}
                </div>
                
                <p className="text-xs text-gray-500 dark:text-gray-500 mt-2">
                  Submitted: {new Date(submission.submittedAt).toLocaleString()}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}


      {/* 제출 폼 (팀 멤버만) */}
      {isTeamMember && (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Files
            </label>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              onChange={handleFileChange}
              className="block w-full text-sm text-gray-500 dark:text-gray-400
                file:mr-4 file:py-2 file:px-4
                file:rounded-full file:border-0
                file:text-sm file:font-semibold
                file:bg-blue-50 file:text-blue-700
                hover:file:bg-blue-100
                dark:file:bg-blue-900/30 dark:file:text-blue-300
                dark:hover:file:bg-blue-900/50"
            />
            {files.length > 0 && (
              <div className="mt-2 space-y-1">
                {files.map((file, index) => (
                  <div key={index} className="text-sm text-gray-600 dark:text-gray-400">
                    📎 {file.name} ({formatFileSize(file.size)})
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Description (Optional)
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md
                bg-white dark:bg-gray-700 text-gray-900 dark:text-white
                focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Add a description for your submission..."
            />
          </div>

          {error && (
            <div className="p-3 bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200 rounded-lg text-sm">
              {error}
            </div>
          )}

          {success && (
            <div className="p-3 bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 rounded-lg text-sm">
              Task submitted successfully!
            </div>
          )}

          <button
            type="submit"
            disabled={submitting || files.length === 0}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400
              text-white font-medium py-2 px-4 rounded-lg transition-colors
              disabled:cursor-not-allowed"
          >
            {submitting ? 'Submitting...' : existingSubmission ? 'Resubmit' : 'Submit Task'}
          </button>
        </form>
      )}

      {/* Creator용 디버깅 정보 */}
      {process.env.NODE_ENV === 'development' && isCreator && (
        <div className="mt-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg text-xs">
          <strong>Debug Info:</strong>
          <pre className="mt-1 text-gray-600 dark:text-gray-400">
            {JSON.stringify({
              teamId,
              teamName,
              existingSubmission: existingSubmission ? {
                userId: existingSubmission.userId,
                userEmail: existingSubmission.userEmail,
                submissionCount: existingSubmission.submissionCount
              } : null,
              isCreator
            }, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
};

export default IndividualTaskSubmission;
