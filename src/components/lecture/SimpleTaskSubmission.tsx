import React, { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { submitSimpleTask, deleteSimpleTaskSubmission } from '../../services/lecture/simpleLectureService';

interface SimpleTaskSubmissionProps {
  noteId: string;
  teamId: string;
  teamName: string;
  leaderEmail: string;
  leaderName: string;
  maxFileSize?: number;
  allowedFileTypes?: string[];
  existingSubmission?: any;
  onSubmissionSuccess?: () => Promise<void>;
  isCreator?: boolean;
}

const SimpleTaskSubmission: React.FC<SimpleTaskSubmissionProps> = ({
  noteId,
  teamId,
  teamName,
  leaderEmail,
  leaderName,
  maxFileSize = 5,
  allowedFileTypes = ['pdf', 'doc', 'docx', 'jpg', 'jpeg', 'png'],
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

  const isAuthorized = user && user.email && leaderEmail && user.email.toLowerCase().trim() === leaderEmail.toLowerCase().trim();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    if (selectedFiles.length === 0) return;

    // 파일 크기 검증
    const oversizedFiles = selectedFiles.filter(file => file.size > maxFileSize * 1024 * 1024);
    if (oversizedFiles.length > 0) {
      setError(`Some files exceed the maximum size of ${maxFileSize}MB`);
      return;
    }

    // 파일 타입 검증
    const invalidFiles = selectedFiles.filter(file => {
      const extension = file.name.split('.').pop()?.toLowerCase();
      return !extension || !allowedFileTypes.includes(extension);
    });
    if (invalidFiles.length > 0) {
      setError(`Some files have invalid types. Allowed types: ${allowedFileTypes.join(', ')}`);
      return;
    }

    setFiles(selectedFiles);
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (files.length === 0) return;

    setUploading(true);
    setError(null);

    try {
      const result = await submitSimpleTask(
        noteId,
        teamId,
        teamName,
        leaderEmail,
        leaderName,
        files,
        description
      );

      if (result.success) {
        setSuccess(true);
        setFiles([]);
        setDescription('');
        
        if (onSubmissionSuccess) {
          // 제출 성공 후 약간의 지연을 주어 데이터가 업데이트되도록 함
          setTimeout(async () => {
            await onSubmissionSuccess();
          }, 500);
        }
        
        setTimeout(() => setSuccess(false), 3000);
      } else {
        setError(result.error || 'Failed to submit task');
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
      const result = await deleteSimpleTaskSubmission(noteId, teamId);

      if (result.success && onSubmissionSuccess) {
        // 삭제 성공 후 약간의 지연을 주어 데이터가 업데이트되도록 함
        setTimeout(async () => {
          await onSubmissionSuccess();
        }, 500);
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

  if (!user) {
    return (
      <div className="p-3 bg-gray-50 dark:bg-gray-700 rounded-lg text-center">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Please login to submit task
        </p>
      </div>
    );
  }

  if (!isAuthorized && !isCreator) {
    return (
      <div className="p-3 bg-gray-50 dark:bg-gray-700 rounded-lg text-center">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          {leaderEmail ? 'Only team leader can submit task' : 'Please contact administrator to set team leader email'}
        </p>
      </div>
    );
  }

  // 디버깅 정보 (개발 환경에서만)
  if (process.env.NODE_ENV === 'development') {
    console.log('SimpleTaskSubmission Debug:', {
      teamId,
      teamName,
      existingSubmission,
      submissionCount: existingSubmission?.submissionCount,
      isCreator
    });
  }

  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 shadow-sm">
      {/* Team Info Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h6 className="text-lg font-bold text-gray-900 dark:text-white">{teamName}</h6>
          {leaderEmail && (
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Leader: {leaderEmail}
            </p>
          )}
        </div>
        <span className={`text-xs px-3 py-1 rounded-full font-medium ${
          existingSubmission
            ? existingSubmission.submissionCount === 1
              ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200'
              : existingSubmission.submissionCount === 2
              ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200'
              : 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-200'
            : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-200'
        }`}>
          {existingSubmission 
            ? existingSubmission.submissionCount && existingSubmission.submissionCount > 0
              ? `Submitted (${existingSubmission.submissionCount})`
              : 'Submitted'
            : 'Pending'
          }
        </span>
      </div>

      {success && (
        <div className="mb-3 p-3 bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 rounded-lg text-sm">
          Task submitted successfully!
        </div>
      )}

      {error && (
        <div className="mb-3 p-3 bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200 rounded-lg text-sm whitespace-pre-line">
          {error}
        </div>
      )}

      {/* Submission Display */}
      {existingSubmission ? (
        <div className="space-y-3">
          {/* Files */}
          <div className="bg-green-50 dark:bg-green-900/20 p-3 rounded-lg border border-green-200 dark:border-green-700">
            <h6 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Files submitted:</h6>
            <div className="space-y-2">
              {existingSubmission.files.map((file: any, index: number) => (
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
              ))}
            </div>
          </div>

          {/* Submission Info */}
          <div className="text-sm text-gray-600 dark:text-gray-400">
            <p><span className="font-medium">Submitted:</span> {formatDate(existingSubmission.submittedAt)}</p>
          </div>

          {/* Description */}
          {existingSubmission.description && (
            <div>
              <h6 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Notes:</h6>
              <p className="text-sm text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-700 p-2 rounded">
                {existingSubmission.description}
              </p>
            </div>
          )}

          {/* Action Buttons */}
          {isAuthorized && (
            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setShowSubmissionForm(true)}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
              >
                Resubmit
              </button>
              <button
                onClick={handleDeleteSubmission}
                disabled={uploading}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm disabled:opacity-50"
              >
                Delete
              </button>
            </div>
          )}
        </div>
      ) : isCreator ? (
        <div className="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600">
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">No submission yet</p>
          <p className="text-xs text-gray-500 dark:text-gray-500">
            This team has not submitted their task yet.
          </p>
        </div>
      ) : (
        <div className="text-center py-6">
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">No submission yet</p>
          <button
            onClick={() => setShowSubmissionForm(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
          >
            Submit Task
          </button>
          <div className="text-xs text-gray-500 dark:text-gray-400 text-center mt-3">
            Only team leader can submit
          </div>
        </div>
      )}

      {/* Submission Modal */}
      {showSubmissionForm && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowSubmissionForm(false);
            }
          }}
        >
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="mb-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                {existingSubmission ? 'Resubmit Task' : 'Submit Task'}
              </h3>
            </div>

            {existingSubmission && (
              <div className="mb-4 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-green-900 dark:text-green-100">
                    Current Submission
                  </span>
                  <span className="text-xs text-green-700 dark:text-green-300">
                    {formatDate(existingSubmission.submittedAt)}
                  </span>
                </div>
                
                <div className="space-y-2 mb-3">
                  {existingSubmission.files.map((file: any, index: number) => (
                    <div key={index} className="flex items-center justify-between p-2 bg-gray-100 dark:bg-gray-700 rounded">
                      <div className="flex-1">
                        <p className="text-sm text-gray-900 dark:text-white font-medium">{file.fileName}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">{formatFileSize(file.fileSize)}</p>
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
                  ))}
                </div>
                {existingSubmission.description && (
                  <div>
                    <h6 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Notes:</h6>
                    <p className="text-sm text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 p-2 rounded">
                      {existingSubmission.description}
                    </p>
                  </div>
                )}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="file-upload" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Upload Files
                </label>
                <input
                  id="file-upload"
                  type="file"
                  multiple
                  onChange={handleFileChange}
                  className="w-full text-sm text-gray-500 dark:text-gray-400
                    file:mr-4 file:py-2 file:px-4
                    file:rounded-full file:border-0
                    file:text-sm file:font-semibold
                    file:bg-blue-50 file:text-blue-700
                    hover:file:bg-blue-100 dark:file:bg-blue-900 dark:file:text-blue-200 dark:hover:file:bg-blue-800"
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
                <button
                  type="submit"
                  disabled={uploading || files.length === 0}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
                >
                  {uploading ? 'Submitting...' : (existingSubmission ? 'Resubmit' : 'Submit Task')}
                </button>
                <button
                  type="button"
                  onClick={() => setShowSubmissionForm(false)}
                  className="px-4 py-2 bg-gray-600 text-white rounded-lg font-medium hover:bg-gray-700 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default SimpleTaskSubmission;
