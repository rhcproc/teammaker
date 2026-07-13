import { 
  collection, 
  addDoc, 
  query, 
  where, 
  getDocs, 
  updateDoc, 
  deleteDoc,
  doc, 
  limit,
  Timestamp 
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { Notification, NotificationType, NotificationSettings } from '../../types';

/**
 * 알림 생성 (중복 방지)
 */
export const createNotification = async (
  userId: string,
  type: NotificationType,
  title: string,
  message: string,
  data?: any
): Promise<string> => {
  try {
    // 중복 알림 체크 (같은 사용자, 같은 타입, 같은 제목, 최근 5분 내)
    const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
    const duplicateCheckQuery = query(
      collection(db, 'notifications'),
      where('userId', '==', userId),
      where('type', '==', type),
      where('title', '==', title),
      where('createdAt', '>', fiveMinutesAgo)
    );

    const duplicateSnapshot = await getDocs(duplicateCheckQuery);
    if (!duplicateSnapshot.empty) {
      console.log('Duplicate notification prevented:', { userId, type, title });
      return duplicateSnapshot.docs[0].id; // 기존 알림 ID 반환
    }

    const notificationData = {
      userId,
      type,
      title,
      message,
      isRead: false,
      createdAt: Date.now(),
      data: data || {}
    };

    const docRef = await addDoc(collection(db, 'notifications'), notificationData);
    return docRef.id;
  } catch (error) {
    console.error('Failed to create notification:', error);
    throw error;
  }
};

/**
 * 사용자의 알림 목록 가져오기
 */
export const getUserNotifications = async (
  userId: string, 
  limitCount: number = 10,
  lastNotification?: Notification
): Promise<Notification[]> => {
  try {
    // 인덱스 문제를 피하기 위해 orderBy를 제거하고 클라이언트에서 정렬
    let q = query(
      collection(db, 'notifications'),
      where('userId', '==', userId),
      limit(limitCount * 2) // 더 많이 가져와서 클라이언트에서 필터링
    );

    const snapshot = await getDocs(q);
    const notifications: Notification[] = [];

    snapshot.forEach((doc) => {
      notifications.push({ id: doc.id, ...doc.data() } as Notification);
    });

    // 클라이언트 사이드에서 정렬
    notifications.sort((a, b) => b.createdAt - a.createdAt);

    // 페이지네이션 처리
    if (lastNotification) {
      const lastIndex = notifications.findIndex(n => n.createdAt <= lastNotification.createdAt);
      if (lastIndex !== -1) {
        notifications.splice(0, lastIndex + 1);
      }
    }

    // 요청된 개수만큼 반환
    return notifications.slice(0, limitCount);
  } catch (error) {
    console.error('Failed to get user notifications:', error);
    return [];
  }
};

/**
 * 읽지 않은 알림 개수 가져오기
 */
export const getUnreadNotificationCount = async (userId: string): Promise<number> => {
  try {
    const q = query(
      collection(db, 'notifications'),
      where('userId', '==', userId),
      where('isRead', '==', false)
    );

    const snapshot = await getDocs(q);
    return snapshot.size;
  } catch (error) {
    console.error('Failed to get unread notification count:', error);
    return 0;
  }
};

/**
 * 알림을 읽음으로 표시
 */
export const markNotificationAsRead = async (notificationId: string): Promise<void> => {
  try {
    const notificationRef = doc(db, 'notifications', notificationId);
    await updateDoc(notificationRef, { isRead: true });
  } catch (error) {
    console.error('Failed to mark notification as read:', error);
    throw error;
  }
};

/**
 * 모든 알림을 읽음으로 표시
 */
export const markAllNotificationsAsRead = async (userId: string): Promise<void> => {
  try {
    const q = query(
      collection(db, 'notifications'),
      where('userId', '==', userId),
      where('isRead', '==', false)
    );

    const snapshot = await getDocs(q);
    const updatePromises = snapshot.docs.map(doc => 
      updateDoc(doc.ref, { isRead: true })
    );

    await Promise.all(updatePromises);
  } catch (error) {
    console.error('Failed to mark all notifications as read:', error);
    throw error;
  }
};

/**
 * 알림 설정 가져오기
 */
export const getNotificationSettings = async (userId: string): Promise<NotificationSettings | null> => {
  try {
    const q = query(
      collection(db, 'notificationSettings'),
      where('userId', '==', userId),
      limit(1)
    );

    const snapshot = await getDocs(q);
    if (snapshot.empty) {
      return null;
    }

    const data = snapshot.docs[0].data();
    return { 
      id: snapshot.docs[0].id, 
      userId: data.userId,
      emailNotifications: data.emailNotifications || false,
      pushNotifications: data.pushNotifications || false,
      assignmentDeadlineReminders: data.assignmentDeadlineReminders || false,
      teamActivityNotifications: data.teamActivityNotifications || false,
      systemAnnouncements: data.systemAnnouncements || false
    } as NotificationSettings;
  } catch (error) {
    console.error('Failed to get notification settings:', error);
    return null;
  }
};

/**
 * 알림 설정 저장
 */
export const saveNotificationSettings = async (settings: NotificationSettings): Promise<void> => {
  try {
    const existingSettings = await getNotificationSettings(settings.userId);
    
    if (existingSettings && existingSettings.id) {
      // 기존 설정 업데이트
      const settingsRef = doc(db, 'notificationSettings', existingSettings.id);
      const { id, ...settingsData } = settings; // id 제외하고 업데이트
      await updateDoc(settingsRef, settingsData);
    } else {
      // 새 설정 생성
      const { id, ...settingsData } = settings; // id 제외하고 생성
      await addDoc(collection(db, 'notificationSettings'), settingsData);
    }
  } catch (error) {
    console.error('Failed to save notification settings:', error);
    throw error;
  }
};

/**
 * 중복 알림 정리 (같은 사용자, 같은 타입, 같은 제목의 오래된 알림들 삭제)
 */
export const cleanupDuplicateNotifications = async (userId: string): Promise<void> => {
  try {
    const q = query(
      collection(db, 'notifications'),
      where('userId', '==', userId),
      where('isRead', '==', true)
    );

    const snapshot = await getDocs(q);
    const notifications = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Notification));

    // 같은 타입과 제목을 가진 알림들을 그룹화
    const groupedNotifications = notifications.reduce((groups, notification) => {
      const key = `${notification.type}_${notification.title}`;
      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(notification);
      return groups;
    }, {} as Record<string, Notification[]>);

    // 각 그룹에서 최신 알림만 남기고 나머지 삭제
    const deletePromises: Promise<void>[] = [];
    
    Object.values(groupedNotifications).forEach(group => {
      if (group.length > 1) {
        // createdAt 기준으로 정렬하여 최신 것만 남기기
        group.sort((a, b) => b.createdAt - a.createdAt);
        const toDelete = group.slice(1); // 첫 번째(최신) 제외하고 나머지 삭제
        
        toDelete.forEach(notification => {
          deletePromises.push(
            deleteDoc(doc(db, 'notifications', notification.id))
              .then(() => console.log(`Cleaned up duplicate notification: ${notification.id}`))
              .catch(error => console.error(`Failed to cleanup notification ${notification.id}:`, error))
          );
        });
      }
    });

    await Promise.all(deletePromises);
  } catch (error) {
    console.error('Failed to cleanup duplicate notifications:', error);
  }
};

/**
 * 특정 이벤트에 대한 알림 생성 헬퍼 함수들
 */
export const createAssignmentCreatedNotification = async (
  userId: string,
  assignmentTitle: string,
  workspaceId: string,
  assignmentId: string
): Promise<void> => {
  await createNotification(
    userId,
    'assignment_created',
    'New Assignment Created',
    `A new assignment "${assignmentTitle}" has been created.`,
    { workspaceId, assignmentId }
  );
};

export const createAssignmentSubmittedNotification = async (
  userId: string,
  assignmentTitle: string,
  teamName: string,
  workspaceId: string,
  assignmentId: string
): Promise<void> => {
  await createNotification(
    userId,
    'assignment_submitted',
    'Assignment Submitted',
    `${teamName} has submitted the assignment "${assignmentTitle}".`,
    { workspaceId, assignmentId, teamName }
  );
};

export const createStorageWarningNotification = async (
  userId: string,
  usagePercentage: number
): Promise<void> => {
  await createNotification(
    userId,
    'storage_warning',
    'Storage Usage Warning',
    `Your storage usage is at ${usagePercentage}%. Consider cleaning up old files.`,
    { usagePercentage }
  );
};
