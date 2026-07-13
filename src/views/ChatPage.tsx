import React from 'react';
import { useParams } from '../lib/router';

const ChatPage: React.FC = () => {
  const { workspaceId, teamId } = useParams<{ workspaceId: string; teamId: string }>();

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 dark:bg-gray-900">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8 w-full max-w-2xl">
        <h1 className="text-2xl font-bold mb-4 text-center">Team Chat</h1>
        <p className="text-center text-gray-600 dark:text-gray-300 mb-6">
          Workspace: {workspaceId} / Team: {teamId}
        </p>
        {/* TODO: 채팅 메시지 목록, 입력창 등 구현 */}
        <div className="text-center text-gray-400">채팅 기능 준비 중...</div>
      </div>
    </div>
  );
};

export default ChatPage; 