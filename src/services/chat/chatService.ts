import { Message, ChatRoom, ApiResponse } from '../../types';

export interface ChatService {
  // Room management
  createRoom: (name: string, description?: string, members?: string[]) => Promise<ApiResponse<ChatRoom>>;
  getRooms: (userId: string) => Promise<ApiResponse<ChatRoom[]>>;
  getRoom: (roomId: string) => Promise<ApiResponse<ChatRoom>>;
  updateRoom: (roomId: string, updates: Partial<ChatRoom>) => Promise<ApiResponse<ChatRoom>>;
  deleteRoom: (roomId: string) => Promise<ApiResponse<void>>;
  
  // Message management
  sendMessage: (roomId: string, content: string, type?: 'text' | 'image' | 'file') => Promise<ApiResponse<Message>>;
  getMessages: (roomId: string, limit?: number) => Promise<ApiResponse<Message[]>>;
  deleteMessage: (messageId: string) => Promise<ApiResponse<void>>;
  
  // Real-time listeners
  subscribeToMessages: (roomId: string, callback: (messages: Message[]) => void) => () => void;
  subscribeToRoomUpdates: (roomId: string, callback: (room: ChatRoom) => void) => () => void;
}

class FirebaseChatService implements ChatService {
  async createRoom(name: string, description?: string, members?: string[]): Promise<ApiResponse<ChatRoom>> {
    try {
      // TODO: Implement Firebase create room
      console.log('Create room:', name, description, members);
      
      const mockRoom: ChatRoom = {
        id: `room-${Date.now()}`,
        name,
        description,
        members: members || [],
        createdBy: 'mock-user-id',
        createdAt: new Date(),
      };

      return {
        success: true,
        data: mockRoom,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Create room failed',
      };
    }
  }

  async getRooms(userId: string): Promise<ApiResponse<ChatRoom[]>> {
    try {
      // TODO: Implement Firebase get rooms
      console.log('Get rooms for user:', userId);
      
      const mockRooms: ChatRoom[] = [
        {
          id: 'room-1',
          name: 'General Chat',
          description: 'General discussion room',
          members: [userId],
          createdBy: 'mock-user-id',
          createdAt: new Date(),
          lastMessage: {
            id: 'msg-1',
            content: 'Hello everyone!',
            senderId: 'mock-user-id',
            senderName: 'Mock User',
            timestamp: new Date(),
            type: 'text',
            roomId: 'room-1',
          },
          unreadCount: 2,
        },
      ];

      return {
        success: true,
        data: mockRooms,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Get rooms failed',
      };
    }
  }

  async getRoom(roomId: string): Promise<ApiResponse<ChatRoom>> {
    try {
      // TODO: Implement Firebase get room
      console.log('Get room:', roomId);
      
      const mockRoom: ChatRoom = {
        id: roomId,
        name: 'Mock Room',
        description: 'Mock room description',
        members: ['mock-user-id'],
        createdBy: 'mock-user-id',
        createdAt: new Date(),
      };

      return {
        success: true,
        data: mockRoom,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Get room failed',
      };
    }
  }

  async updateRoom(roomId: string, updates: Partial<ChatRoom>): Promise<ApiResponse<ChatRoom>> {
    try {
      // TODO: Implement Firebase update room
      console.log('Update room:', roomId, updates);
      
      const mockRoom: ChatRoom = {
        id: roomId,
        name: updates.name || 'Updated Room',
        description: updates.description,
        members: updates.members || [],
        createdBy: 'mock-user-id',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      return {
        success: true,
        data: mockRoom,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Update room failed',
      };
    }
  }

  async deleteRoom(roomId: string): Promise<ApiResponse<void>> {
    try {
      // TODO: Implement Firebase delete room
      console.log('Delete room:', roomId);
      
      return {
        success: true,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Delete room failed',
      };
    }
  }

  async sendMessage(roomId: string, content: string, type: 'text' | 'image' | 'file' = 'text'): Promise<ApiResponse<Message>> {
    try {
      // TODO: Implement Firebase send message
      console.log('Send message:', roomId, content, type);
      
      const mockMessage: Message = {
        id: `msg-${Date.now()}`,
        content,
        senderId: 'mock-user-id',
        senderName: 'Mock User',
        timestamp: new Date(),
        type,
        roomId,
      };

      return {
        success: true,
        data: mockMessage,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Send message failed',
      };
    }
  }

  async getMessages(roomId: string, limit: number = 50): Promise<ApiResponse<Message[]>> {
    try {
      // TODO: Implement Firebase get messages
      console.log('Get messages:', roomId, limit);
      
      const mockMessages: Message[] = [
        {
          id: 'msg-1',
          content: 'Hello!',
          senderId: 'mock-user-id',
          senderName: 'Mock User',
          timestamp: new Date(),
          type: 'text',
          roomId,
        },
      ];

      return {
        success: true,
        data: mockMessages,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Get messages failed',
      };
    }
  }

  async deleteMessage(messageId: string): Promise<ApiResponse<void>> {
    try {
      // TODO: Implement Firebase delete message
      console.log('Delete message:', messageId);
      
      return {
        success: true,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Delete message failed',
      };
    }
  }

  subscribeToMessages(roomId: string, callback: (messages: Message[]) => void): () => void {
    // TODO: Implement Firebase real-time listener
    console.log('Subscribe to messages:', roomId);
    
    // Mock subscription
    const interval = setInterval(() => {
      const mockMessages: Message[] = [
        {
          id: `msg-${Date.now()}`,
          content: 'Mock message',
          senderId: 'mock-user-id',
          senderName: 'Mock User',
          timestamp: new Date(),
          type: 'text',
          roomId,
        },
      ];
      callback(mockMessages);
    }, 5000);

    return () => {
      clearInterval(interval);
      console.log('Unsubscribe from messages:', roomId);
    };
  }

  subscribeToRoomUpdates(roomId: string, callback: (room: ChatRoom) => void): () => void {
    // TODO: Implement Firebase real-time listener
    console.log('Subscribe to room updates:', roomId);
    
    // Mock subscription
    const interval = setInterval(() => {
      const mockRoom: ChatRoom = {
        id: roomId,
        name: 'Updated Room',
        description: 'Updated description',
        members: ['mock-user-id'],
        createdBy: 'mock-user-id',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      callback(mockRoom);
    }, 10000);

    return () => {
      clearInterval(interval);
      console.log('Unsubscribe from room updates:', roomId);
    };
  }
}

export const chatService = new FirebaseChatService(); 