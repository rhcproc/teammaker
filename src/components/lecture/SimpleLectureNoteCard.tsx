import React, { useState, useRef } from 'react';
import { SimpleLectureNote, SimpleAttachment } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import { uploadSimpleAttachment, deleteSimpleAttachment } from '../../services/lecture/simpleLectureService';
import SimpleTaskSubmission from './SimpleTaskSubmission';
import IndividualTaskSubmission from './IndividualTaskSubmission';
import ImageGalleryModal from './ImageGalleryModal';

interface SimpleLectureNoteCardProps {
  lectureNote: SimpleLectureNote;
  isCreator: boolean;
  workspaceData?: any;
  onEdit: (note: SimpleLectureNote) => void;
  onDelete: (noteId: string) => void;
  onTogglePublish: (noteId: string, isPublished: boolean) => Promise<void>;
  onRefresh?: () => Promise<void>;
  loading?: boolean;
}

const SimpleLectureNoteCard: React.FC<SimpleLectureNoteCardProps> = ({
  lectureNote,
  isCreator,
  workspaceData,
  onEdit,
  onDelete,
  onTogglePublish,
  onRefresh,
  loading = false
}) => {
  const [showContent, setShowContent] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [showImageGallery, setShowImageGallery] = useState(false);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { user } = useAuth();

  // Draft인 경우 Creator만 볼 수 있도록 필터링
  if (!lectureNote.isPublished && !isCreator) {
    return null;
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    setUploadingFile(true);
    try {
      const result = await uploadSimpleAttachment(lectureNote.id, file, user.email);
      if (result.success && onRefresh) {
        await onRefresh();
      }
    } catch (error) {
      console.error('Failed to upload file:', error);
    } finally {
      setUploadingFile(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleDeleteAttachment = async (attachment: SimpleAttachment) => {
    if (!window.confirm('Are you sure you want to delete this file?')) return;

    try {
      const result = await deleteSimpleAttachment(lectureNote.id, attachment);
      if (result.success && onRefresh) {
        await onRefresh();
      }
    } catch (error) {
      console.error('Failed to delete file:', error);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString();
  };

  // 날짜를 월/일 형식으로 포맷팅
  const formatDateToMonthDay = (dateString: string) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    const month = date.getMonth() + 1;
    const day = date.getDate();
    return `${month}/${day}`;
  };

  // 이미지 파일인지 확인
  const isImageFile = (fileName: string) => {
    const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg'];
    const extension = fileName.split('.').pop()?.toLowerCase();
    return extension ? imageExtensions.includes(extension) : false;
  };

  // 이미지 갤러리 열기
  const openImageGallery = (index: number) => {
    setSelectedImageIndex(index);
    setShowImageGallery(true);
  };

  // 이미지 파일들만 필터링
  const imageAttachments = lectureNote.attachments.filter(attachment => 
    isImageFile(attachment.fileName)
  );

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md border border-gray-200 dark:border-gray-700 overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="flex items-center space-x-2">
              <span className="px-2 py-1 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 text-xs font-medium rounded">
                {lectureNote.date ? formatDateToMonthDay(lectureNote.date) : `Week ${lectureNote.week}`}
              </span>
              {lectureNote.isPublished ? (
                <span className="px-2 py-1 bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 text-xs font-medium rounded">
                  Published
                </span>
              ) : (
                <span className="px-2 py-1 bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200 text-xs font-medium rounded">
                  Draft
                </span>
              )}
              {lectureNote.hasTask && (
                <span className="px-2 py-1 bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-200 text-xs font-medium rounded">
                  Task
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setShowContent(!showContent)}
              className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
            >
              <svg 
                className={`w-5 h-5 transform transition-transform ${showContent ? 'rotate-180' : ''}`} 
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {isCreator && (
              <div className="flex items-center space-x-1">
                <button
                  onClick={() => onTogglePublish(lectureNote.id, !lectureNote.isPublished)}
                  disabled={loading}
                  className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                    lectureNote.isPublished
                      ? 'bg-yellow-100 text-yellow-800 hover:bg-yellow-200 dark:bg-yellow-900 dark:text-yellow-200 dark:hover:bg-yellow-800'
                      : 'bg-green-100 text-green-800 hover:bg-green-200 dark:bg-green-900 dark:text-green-200 dark:hover:bg-green-800'
                  }`}
                >
                  {lectureNote.isPublished ? 'Unpublish' : 'Publish'}
                </button>
                <button
                  onClick={() => onEdit(lectureNote)}
                  className="px-3 py-1 text-xs bg-blue-100 text-blue-800 rounded hover:bg-blue-200 dark:bg-blue-900 dark:text-blue-200 dark:hover:bg-blue-800 transition-colors"
                >
                  Edit
                </button>
                <button
                  onClick={() => onDelete(lectureNote.id)}
                  className="px-3 py-1 text-xs bg-red-100 text-red-800 rounded hover:bg-red-200 dark:bg-red-900 dark:text-red-200 dark:hover:bg-red-800 transition-colors"
                >
                  Delete
                </button>
              </div>
            )}
          </div>
        </div>
        
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mt-2">
          {lectureNote.title}
        </h3>
        
        {lectureNote.description && (
          <div className="text-sm text-gray-600 dark:text-gray-400 mt-1 whitespace-pre-wrap">
            {lectureNote.description}
          </div>
        )}
      </div>

      {/* Content */}
      {showContent && (
        <div className="p-4">
          {/* Task Section */}
          {lectureNote.hasTask && (
            <div className="mb-6 p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-800">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-purple-600 dark:text-purple-400">📝</span>
                <h4 className="text-lg font-semibold text-purple-900 dark:text-purple-100">
                  {lectureNote.taskTitle}
                </h4>
              </div>
              
              {lectureNote.taskDescription && (
                <div className="text-purple-800 dark:text-purple-200 mb-3 whitespace-pre-wrap">
                  {lectureNote.taskDescription}
                </div>
              )}
              
              <div className="grid grid-cols-2 gap-4 text-sm">
                {lectureNote.taskDeadline && (
                  <div>
                    <span className="font-medium text-purple-900 dark:text-purple-100">Deadline:</span>
                    <span className="ml-2 text-purple-800 dark:text-purple-200">
                      {formatDate(lectureNote.taskDeadline)}
                    </span>
                  </div>
                )}
                <div>
                  <span className="font-medium text-purple-900 dark:text-purple-100">Max File Size:</span>
                  <span className="ml-2 text-purple-800 dark:text-purple-200">
                    {lectureNote.maxFileSize || 5}MB
                  </span>
                </div>
                <div>
                  <span className="font-medium text-purple-900 dark:text-purple-100">Allowed Types:</span>
                  <span className="ml-2 text-purple-800 dark:text-purple-200">
                    {(lectureNote.allowedFileTypes || ['pdf']).join(', ').toUpperCase()}
                  </span>
                </div>
                <div>
                  <span className="font-medium text-purple-900 dark:text-purple-100">Teams:</span>
                  <span className="ml-2 text-purple-800 dark:text-purple-200">
                    {workspaceData?.groups?.length || 0} teams
                  </span>
                </div>
              </div>

              {/* Team Submissions */}
              {workspaceData?.groups && workspaceData.groups.length > 0 && (
                <div className="mt-4">
                  <h5 className="text-md font-semibold text-purple-900 dark:text-purple-100 mb-3">
                    Team Submissions ({lectureNote.teamSubmissions.length}/{workspaceData.groups.length})
                  </h5>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {workspaceData.groups.map((group: any, index: number) => {
                      const submission = lectureNote.teamSubmissions.find(sub => sub.teamId === group.id);
                      
                      // 디버깅 정보 (개발 환경에서만)
                      if (process.env.NODE_ENV === 'development') {
                        console.log('Submission Debug:', {
                          teamId: group.id,
                          teamSubmissions: lectureNote.teamSubmissions,
                          foundSubmission: submission,
                          submissionCount: submission?.submissionCount
                        });
                      }
                      
                      
                      // teamLeaderEmails에서 올바른 리더 이메일 가져오기
                      let leaderEmail = '';
                      let leaderName = '';
                      
                      // teamLeaderEmails 객체에서 해당 그룹의 리더 이메일 찾기
                      const groupKey = group.id; // 실제 그룹 ID 사용
                      if (workspaceData.teamLeaderEmails && workspaceData.teamLeaderEmails[groupKey]) {
                        leaderEmail = workspaceData.teamLeaderEmails[groupKey];
                        // 해당 이메일로 멤버 정보 찾기
                        const leaderMember = workspaceData.members?.find((member: any) => member.email === leaderEmail);
                        leaderName = leaderMember?.name || leaderEmail || `Team ${index + 1} Leader`;
                        
                      } else {
                        // fallback: teamMemberEmails에서 첫 번째 멤버의 이메일 찾기
                        if (workspaceData.teamMemberEmails && workspaceData.teamMemberEmails[groupKey] && group.members && group.members.length > 0) {
                          const firstMemberName = group.members[0];
                          const memberEmails = workspaceData.teamMemberEmails[groupKey];
                          if (memberEmails[firstMemberName]) {
                            leaderEmail = memberEmails[firstMemberName];
                            leaderName = firstMemberName;
                          }
                        }
                        
                        // 추가 fallback: group.members[0]에서 이메일 찾기
                        if (!leaderEmail && group.members && group.members.length > 0) {
                          const firstMember = group.members[0];
                          
                          if (firstMember.includes('@')) {
                            leaderEmail = firstMember;
                            const leaderMember = workspaceData.members?.find((member: any) => member.email === leaderEmail);
                            leaderName = leaderMember?.name || `Team ${index + 1} Leader`;
                          } else {
                            leaderName = firstMember;
                            const leaderMember = workspaceData.members?.find((member: any) => member.name === leaderName);
                            leaderEmail = leaderMember?.email || '';
                          }
                        }
                        
                        // 최종 fallback: 이메일이 없는 경우 실제 멤버 이름 사용
                        if (!leaderEmail && group.members && group.members.length > 0) {
                          leaderName = group.members[0]; // 첫 번째 멤버를 리더로 설정
                          leaderEmail = ''; // 이메일이 없으면 빈 문자열 사용 (더미 이메일 대신)
                        } else if (!leaderEmail) {
                          leaderName = `Team ${index + 1} Leader`;
                          leaderEmail = '';
                        }
                      }
                      
                      const teamName = `Team ${index + 1}`;
                      

                      // Assignment type에 따라 적절한 컴포넌트 렌더링
                      if (lectureNote.assignmentType === 'individual') {
                        // 개별 제출의 경우, 각 팀 멤버의 제출물을 확인
                        // workspaceData에서 teamMemberEmails와 teamLeaderEmails를 조합하여 팀 멤버 구성
                        let teamMembers: string[] = [];
                        
                        if (workspaceData) {
                          const teamMemberEmails = workspaceData.teamMemberEmails || {};
                          const teamLeaderEmails = workspaceData.teamLeaderEmails || {};
                          
                          // 현재 그룹의 멤버들 가져오기
                          const groupMembers = teamMemberEmails[group.id] || {};
                          const leaderEmail = teamLeaderEmails[group.id];
                          
                          // 멤버 이메일들 수집
                          const memberEmails = Object.values(groupMembers).filter(email => 
                            typeof email === 'string' && email.includes('@')
                          ) as string[];
                          
                          // 리더 이메일 추가 (중복 제거)
                          if (leaderEmail && typeof leaderEmail === 'string' && leaderEmail.includes('@')) {
                            if (!memberEmails.includes(leaderEmail)) {
                              memberEmails.push(leaderEmail);
                            }
                          }
                          
                          teamMembers = memberEmails;
                        }
                        
                        const individualSubmissions = lectureNote.individualSubmissions || [];
                        
                        // 디버깅 로그
                        if (process.env.NODE_ENV === 'development') {
                          console.log('SimpleLectureNoteCard Individual Debug:', {
                            teamId: group.id,
                            teamName,
                            teamMemberEmails: workspaceData?.teamMemberEmails?.[group.id],
                            teamLeaderEmails: workspaceData?.teamLeaderEmails?.[group.id],
                            processedTeamMembers: teamMembers,
                            userEmail: user?.email,
                            isCreator,
                            assignmentType: lectureNote.assignmentType,
                            isUserInTeam: teamMembers.includes(user?.email || '')
                          });
                        }
                        
                        return (
                          <IndividualTaskSubmission
                            key={group.id}
                            lectureNoteId={lectureNote.id}
                            teamId={group.id}
                            teamName={teamName}
                            teamMembers={teamMembers}
                            existingSubmission={individualSubmissions.find(sub => 
                              sub.teamId === group.id && sub.userEmail === user?.email
                            )}
                            allTeamSubmissions={individualSubmissions.filter(sub => sub.teamId === group.id)}
                            onSubmissionSuccess={onRefresh}
                            isCreator={isCreator}
                          />
                        );
                      } else {
                        // 팀 제출의 경우 (기본값)
                        return (
                          <SimpleTaskSubmission
                            key={group.id}
                            noteId={lectureNote.id}
                            teamId={group.id}
                            teamName={teamName}
                            leaderEmail={leaderEmail}
                            leaderName={leaderName}
                            maxFileSize={lectureNote.maxFileSize || 5}
                            allowedFileTypes={lectureNote.allowedFileTypes || ['pdf', 'doc', 'docx', 'jpg', 'jpeg', 'png']}
                            existingSubmission={submission}
                            onSubmissionSuccess={onRefresh}
                            isCreator={isCreator}
                          />
                        );
                      }
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Attachments Section */}
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <h4 className="text-lg font-semibold text-gray-700 dark:text-gray-300 flex items-center">
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                </svg>
                Attachments
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
            
            {lectureNote.attachments.length > 0 ? (
              <div className="space-y-4">
                {/* 이미지 섬네일 그리드 */}
                {imageAttachments.length > 0 && (
                  <div>
                    <h5 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Images</h5>
                    <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2">
                      {imageAttachments.map((attachment, index) => (
                        <div
                          key={attachment.id}
                          className="relative group cursor-pointer"
                          onClick={() => openImageGallery(index)}
                        >
                          <div className="aspect-square bg-gray-100 dark:bg-gray-700 rounded-lg overflow-hidden">
                            <img
                              src={attachment.fileUrl}
                              alt={attachment.fileName}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                              onError={(e) => {
                                const target = e.target as HTMLImageElement;
                                target.style.display = 'none';
                                const parent = target.parentElement;
                                if (parent) {
                                  parent.innerHTML = `
                                    <div class="w-full h-full flex items-center justify-center">
                                      <svg class="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                      </svg>
                                    </div>
                                  `;
                                }
                              }}
                            />
                          </div>
                          <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-20 transition-all duration-200 rounded-lg flex items-center justify-center">
                            <svg className="w-4 h-4 text-white opacity-0 group-hover:opacity-100 transition-opacity duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
                            </svg>
                          </div>
                          <p className="text-xs text-gray-600 dark:text-gray-400 mt-1 truncate" title={attachment.fileName}>
                            {attachment.fileName}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 기타 파일들 */}
                {lectureNote.attachments.filter(attachment => !isImageFile(attachment.fileName)).length > 0 && (
                  <div>
                    <h5 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Files</h5>
                    <div className="space-y-2">
                      {lectureNote.attachments
                        .filter(attachment => !isImageFile(attachment.fileName))
                        .map((attachment) => (
                        <div key={attachment.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                          <div className="flex items-center space-x-3">
                            <svg className="w-5 h-5 text-gray-500 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                            <div>
                              <p className="text-sm font-medium text-gray-900 dark:text-white">{attachment.fileName}</p>
                              <p className="text-xs text-gray-500 dark:text-gray-400">
                                {formatFileSize(attachment.fileSize)} • {formatDate(attachment.uploadedAt)}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center space-x-2">
                            <a
                              href={attachment.fileUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 text-sm font-medium"
                            >
                              Download
                            </a>
                            {isCreator && (
                              <button
                                onClick={() => handleDeleteAttachment(attachment)}
                                className="text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 text-sm font-medium"
                              >
                                Delete
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-6 text-gray-500 dark:text-gray-400">
                <svg className="w-12 h-12 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <p>No attachments yet</p>
                {isCreator && (
                  <p className="text-sm mt-1">Click "Add File" to upload files</p>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Image Gallery Modal */}
      <ImageGalleryModal
        isOpen={showImageGallery}
        onClose={() => setShowImageGallery(false)}
        images={imageAttachments}
        initialIndex={selectedImageIndex}
      />
    </div>
  );
};

export default SimpleLectureNoteCard;
