import React, { useState, useRef, useEffect } from 'react';
import { LectureNote, LectureAttachment } from '../../types';
import { LectureAssignmentSubmissionComponent } from './LectureAssignmentSubmission';
import { useAuth } from '../../contexts/AuthContext';

interface LectureNoteCardProps {
  lectureNote: LectureNote;
  isCreator: boolean;
  workspaceData?: any;
  onEdit: (note: LectureNote) => void;
  onDelete: (noteId: string) => void;
  onAddAttachment: (noteId: string, file: File) => Promise<void>;
  onRemoveAttachment: (noteId: string, attachment: LectureAttachment) => Promise<void>;
  onTogglePublish: (noteId: string, isPublished: boolean) => Promise<void>;
  onRefresh?: () => Promise<void>;
  loading?: boolean;
}

const LectureNoteCard: React.FC<LectureNoteCardProps> = ({
  lectureNote,
  isCreator,
  workspaceData,
  onEdit,
  onDelete,
  onAddAttachment,
  onRemoveAttachment,
  onTogglePublish,
  onRefresh,
  loading = false
}) => {
  const [showContent, setShowContent] = useState(false);
  const [showAttachments, setShowAttachments] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { user } = useAuth();

  // 디버깅용 로그
  useEffect(() => {
    console.log('Lecture Note Debug:', {
      lectureNoteId: lectureNote.id,
      hasAssignment: lectureNote.hasAssignment,
      teamAssignments: lectureNote.teamAssignments,
      teamAssignmentsType: Array.isArray(lectureNote.teamAssignments) ? 'array' : typeof lectureNote.teamAssignments,
      teamAssignmentsLength: lectureNote.teamAssignments ? 
        (Array.isArray(lectureNote.teamAssignments) ? 
          lectureNote.teamAssignments.length : 
          Object.keys(lectureNote.teamAssignments).length) : 0,
      teamAssignmentsKeys: lectureNote.teamAssignments ? Object.keys(lectureNote.teamAssignments) : 'no assignments',
      teamAssignmentsValues: lectureNote.teamAssignments ? Object.values(lectureNote.teamAssignments) : 'no assignments',
      isCreator,
      showAssignButton: false,
      shouldShowAssignTeams: lectureNote.hasAssignment && (!lectureNote.teamAssignments || 
        (Array.isArray(lectureNote.teamAssignments) ? 
          lectureNote.teamAssignments.length === 0 : 
          Object.keys(lectureNote.teamAssignments).length === 0))
    });
  }, [lectureNote.id, lectureNote.hasAssignment, lectureNote.teamAssignments, isCreator]);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    // Creator만 파일 업로드 가능
    if (!isCreator) {
      console.error('Only creator can upload files');
      return;
    }

    const file = event.target.files?.[0];
    if (!file) return;

    setUploadingFile(true);
    try {
      await onAddAttachment(lectureNote.id, file);
    } catch (error) {
      console.error('Failed to upload file:', error);
    } finally {
      setUploadingFile(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getFileIcon = (fileType: string): string => {
    if (fileType.includes('pdf')) return '📄';
    if (fileType.includes('word') || fileType.includes('document')) return '📝';
    if (fileType.includes('image')) return '🖼️';
    if (fileType.includes('powerpoint') || fileType.includes('presentation')) return '📊';
    return '📎';
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md border border-gray-200 dark:border-gray-700 p-6">
      {/* Header */}
      <div className="flex justify-between items-start mb-4">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <span className="bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 px-2 py-1 rounded-full text-sm font-medium">
              Week {lectureNote.week}
            </span>
            {lectureNote.isPublished ? (
              <span className="bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 px-2 py-1 rounded-full text-sm font-medium">
                Published
              </span>
            ) : (
              <span className="bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200 px-2 py-1 rounded-full text-sm font-medium">
                Draft
              </span>
            )}
            {lectureNote.hasAssignment && (
              <span className="bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 px-2 py-1 rounded-full text-sm font-medium">
                📝 Assignment
              </span>
            )}
          </div>
          <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
            {lectureNote.title}
          </h3>
          {lectureNote.description && (
            <p className="text-gray-600 dark:text-gray-300 mb-3">
              {lectureNote.description}
            </p>
          )}
        </div>
        
        <div className="flex items-center gap-2">
          {/* Content Toggle Button - 항상 표시 */}
          <button
            onClick={() => {
              setShowContent(!showContent);
              setShowAttachments(!showContent); // Content와 함께 attachment도 토글
            }}
            className="p-2 bg-gray-600 text-white rounded hover:bg-gray-700 transition-colors flex items-center justify-center"
            title={showContent ? 'Hide Details' : 'Show Details'}
          >
            {showContent ? (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            )}
          </button>
          
          {isCreator && (
            <>
              <button
                onClick={() => onTogglePublish(lectureNote.id, !lectureNote.isPublished)}
                disabled={loading}
                className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                  lectureNote.isPublished
                    ? 'bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200 hover:bg-yellow-200 dark:hover:bg-yellow-800'
                    : 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 hover:bg-green-200 dark:hover:bg-green-800'
                } disabled:opacity-50`}
              >
                {lectureNote.isPublished ? 'Unpublish' : 'Publish'}
              </button>
              <button
                onClick={() => onEdit(lectureNote)}
                disabled={loading}
                className="p-2 text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors disabled:opacity-50"
                title="Edit"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
              </button>
              <button
                onClick={() => {
                  if (window.confirm('Are you sure you want to delete this lecture note? This action cannot be undone.')) {
                    onDelete(lectureNote.id);
                  }
                }}
                disabled={loading}
                className="p-2 text-gray-600 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors disabled:opacity-50"
                title="Delete"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Content Display */}
      {lectureNote.content && showContent && (
        <div className="mb-4 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600">
          <div className="whitespace-pre-wrap text-gray-800 dark:text-gray-200 leading-relaxed">
            {lectureNote.content}
          </div>
        </div>
      )}

      {/* Assignment Display */}
      {lectureNote.hasAssignment && showContent && (
        <div className="mb-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-blue-600 dark:text-blue-400">📝</span>
            <h4 className="text-lg font-semibold text-blue-900 dark:text-blue-100">
              {lectureNote.assignmentTitle}
            </h4>
          </div>
          
          {lectureNote.assignmentDescription && (
            <p className="text-blue-800 dark:text-blue-200 mb-3">
              {lectureNote.assignmentDescription}
            </p>
          )}
          
          <div className="grid grid-cols-2 gap-4 text-sm">
            {lectureNote.assignmentDeadline && (
              <div>
                <span className="font-medium text-blue-900 dark:text-blue-100">Deadline:</span>
                <span className="ml-2 text-blue-800 dark:text-blue-200">
                  {new Date(lectureNote.assignmentDeadline).toLocaleString()}
                </span>
              </div>
            )}
            <div>
              <span className="font-medium text-blue-900 dark:text-blue-100">Max File Size:</span>
              <span className="ml-2 text-blue-800 dark:text-blue-200">
                {lectureNote.maxFileSize || 5}MB
              </span>
            </div>
            <div>
              <span className="font-medium text-blue-900 dark:text-blue-100">Allowed Types:</span>
              <span className="ml-2 text-blue-800 dark:text-blue-200">
                {(lectureNote.allowedFileTypes || ['pdf']).join(', ').toUpperCase()}
              </span>
            </div>
            <div>
              <span className="font-medium text-blue-900 dark:text-blue-100">Teams:</span>
              <span className="ml-2 text-blue-800 dark:text-blue-200">
                {workspaceData?.groups?.length || 0} teams assigned
              </span>
            </div>
          </div>

          {/* Team Assignment Submissions */}
          {lectureNote.hasAssignment && (!workspaceData?.groups || workspaceData.groups.length === 0) && (
            <div className="mt-6 border-t border-gray-200 dark:border-gray-600 pt-4">
              <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-700">
                <div className="flex items-center">
                  <svg className="w-5 h-5 text-red-600 dark:text-red-400 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                  </svg>
                  <div className="flex-1">
                    <h5 className="text-sm font-medium text-red-800 dark:text-red-200">Teams Not Assigned</h5>
                    <p className="text-sm text-red-700 dark:text-red-300 mt-1">
                      {isCreator 
                        ? "This assignment has no teams assigned. Teams should be automatically assigned when creating the assignment. Please check if teams exist in the workspace settings, or try recreating this lecture note."
                        : "This assignment has no teams assigned. Please contact the workspace creator."
                      }
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
          
          {workspaceData?.groups && workspaceData.groups.length > 0 && (
            <div className="mt-6 border-t border-gray-200 dark:border-gray-600 pt-4">
              <h5 className="text-lg font-semibold text-blue-900 dark:text-blue-100 mb-4 flex items-center">
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Team Assignment Submissions
                <span className="ml-2 text-sm font-normal text-gray-600 dark:text-gray-400">
                  ({workspaceData.groups.length} teams)
                </span>
              </h5>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {workspaceData.groups.map((group: any, index: number) => {
                  // teamAssignments에서 해당 팀의 제출물 찾기
                  const teamAssignment = Array.isArray(lectureNote.teamAssignments) 
                    ? lectureNote.teamAssignments.find(ta => ta.teamId === group.id)
                    : lectureNote.teamAssignments?.[group.id];
                  
                  const existingSubmission = teamAssignment?.submissions?.[0]; // 최신 제출
                  
                  // 팀 리더 정보 찾기
                  const leaderEmail = group.members[0] || '';
                  const leaderMember = workspaceData.members?.find((member: any) => member.email === leaderEmail);
                  const leaderName = leaderMember?.name || leaderEmail || `Team ${index + 1} Leader`;

                  const teamId = group.id;
                  const teamName = `Team ${index + 1}`;

                  console.log('🎯 Rendering team assignment:', {
                    teamId,
                    teamName,
                    leaderEmail,
                    leaderName,
                    existingSubmission,
                    existingSubmissionType: typeof existingSubmission,
                    existingSubmissionNull: existingSubmission === null,
                    existingSubmissionUndefined: existingSubmission === undefined,
                    teamAssignment,
                    group
                  });

                  return (
                    <div key={teamId} className="space-y-2">
                      <LectureAssignmentSubmissionComponent
                        lectureNoteId={lectureNote.id}
                        teamId={teamId}
                        teamName={teamName}
                        leaderEmail={leaderEmail}
                        leaderName={leaderName}
                        maxFileSize={lectureNote.maxFileSize || 5}
                        allowedFileTypes={lectureNote.allowedFileTypes || ['pdf']}
                        existingSubmission={existingSubmission}
                        onSubmissionSuccess={onRefresh || (() => Promise.resolve())}
                        isCreator={isCreator}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Attachments */}
      <div className="space-y-3 mt-6 border-t border-gray-200 dark:border-gray-600 pt-4">
        <div className="flex justify-between items-center">
          <h4 className="text-lg font-semibold text-gray-700 dark:text-gray-300 flex items-center">
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
            </svg>
            Lecture Materials
            <span className="ml-2 text-sm font-normal text-gray-600 dark:text-gray-400">
              ({lectureNote.attachments.length} files)
            </span>
          </h4>
          {isCreator && (
            <div>
              <input
                ref={fileInputRef}
                type="file"
                onChange={handleFileUpload}
                className="hidden"
                accept=".pdf,.doc,.docx,.txt,.jpg,.jpeg,.png,.gif,.ppt,.pptx"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={loading || uploadingFile}
                className="px-3 py-1 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded text-sm font-medium hover:bg-blue-200 dark:hover:bg-blue-800 transition-colors disabled:opacity-50 flex items-center gap-1"
              >
                {uploadingFile ? (
                  <>
                    <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-blue-800 dark:border-blue-200"></div>
                    Uploading...
                  </>
                ) : (
                  <>
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    Add File
                  </>
                )}
              </button>
            </div>
          )}
        </div>

        {showAttachments && lectureNote.attachments.length > 0 && (
          <div className="space-y-2">
            {lectureNote.attachments.map((attachment) => (
              <div
                key={attachment.id}
                className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg"
              >
                <div className="flex items-center gap-3">
                  <span className="text-lg">{getFileIcon(attachment.fileType)}</span>
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      {attachment.fileName}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {formatFileSize(attachment.fileSize)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <a
                    href={attachment.fileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1 text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                    title="Download"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </a>
                  {isCreator && (
                    <button
                      onClick={() => {
                        if (window.confirm('Are you sure you want to remove this attachment?')) {
                          onRemoveAttachment(lectureNote.id, attachment);
                        }
                      }}
                      disabled={loading}
                      className="p-1 text-gray-600 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors disabled:opacity-50"
                      title="Remove"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {showAttachments && lectureNote.attachments.length === 0 && (
          <p className="text-sm text-gray-500 dark:text-gray-400 italic">
            No attachments yet
          </p>
        )}
      </div>

      {/* Footer */}
      <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Created: {new Date(lectureNote.createdAt).toLocaleDateString()}
          {lectureNote.updatedAt !== lectureNote.createdAt && (
            <span> • Updated: {new Date(lectureNote.updatedAt).toLocaleDateString()}</span>
          )}
        </p>
      </div>
    </div>
  );
};

export default LectureNoteCard;
