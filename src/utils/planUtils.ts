import { PlanFeatures, PlanType, UserPlan } from '../types';

// 플랜 기능 정의
export const PLAN_FEATURES: PlanFeatures = {
  free: {
    name: 'Free',
    teamLimit: 5,
    storageLimit: 100 * 1024 * 1024, // 100MB
    features: [
      'Up to 5 teams',
      '100MB storage',
      'Basic team formation',
      'Assignment submissions',
      'Email support'
    ],
    color: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200'
  },
  basic: {
    name: 'Basic',
    teamLimit: 50,
    storageLimit: 5 * 1024 * 1024 * 1024, // 5GB
    features: [
      'Up to 50 teams',
      '5GB storage',
      'Advanced team formation',
      'Priority support',
      'Custom team settings',
      'Export data'
    ],
    color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200',
    price: '$9.99/month'
  },
  premium: {
    name: 'Premium',
    teamLimit: -1, // unlimited
    storageLimit: 50 * 1024 * 1024 * 1024, // 50GB
    features: [
      'Unlimited teams',
      '50GB storage',
      'All advanced features',
      '24/7 priority support',
      'Custom integrations',
      'Advanced analytics',
      'API access'
    ],
    color: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-200',
    price: '$29.99/month'
  }
};

/**
 * 사용자의 기본 플랜 생성 (Free 플랜)
 */
export const createDefaultUserPlan = (userId: string): UserPlan => {
  return {
    userId,
    planType: 'free',
    teamLimit: PLAN_FEATURES.free.teamLimit,
    storageLimit: PLAN_FEATURES.free.storageLimit,
    features: PLAN_FEATURES.free.features,
    isActive: true,
    createdAt: Date.now()
  };
};

/**
 * 플랜 정보 가져오기
 */
export const getPlanInfo = (planType: PlanType) => {
  return PLAN_FEATURES[planType];
};

/**
 * 플랜 제한 확인
 */
export const checkPlanLimits = (userPlan: UserPlan, currentUsage: { teams: number; storage: number }) => {
  const planInfo = getPlanInfo(userPlan.planType);
  
  return {
    teamLimitReached: planInfo.teamLimit !== -1 && currentUsage.teams >= planInfo.teamLimit,
    storageLimitReached: currentUsage.storage >= planInfo.storageLimit,
    teamLimit: planInfo.teamLimit,
    storageLimit: planInfo.storageLimit,
    remainingTeams: planInfo.teamLimit === -1 ? -1 : Math.max(0, planInfo.teamLimit - currentUsage.teams),
    remainingStorage: Math.max(0, planInfo.storageLimit - currentUsage.storage)
  };
};

/**
 * 플랜 업그레이드 가능 여부 확인
 */
export const canUpgrade = (currentPlan: PlanType): boolean => {
  return currentPlan !== 'premium';
};

/**
 * 다음 플랜 정보 가져오기
 */
export const getNextPlan = (currentPlan: PlanType): PlanType | null => {
  switch (currentPlan) {
    case 'free':
      return 'basic';
    case 'basic':
      return 'premium';
    case 'premium':
      return null;
    default:
      return 'basic';
  }
};



