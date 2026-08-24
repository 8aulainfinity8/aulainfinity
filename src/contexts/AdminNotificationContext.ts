import { createContext } from 'react';
import type { TopicRequest, TutoringRequest, Conversation, StudentUser, CourseGroupConversation } from '../types';

export interface AdminNotificationContextType {
  newUsersCount: number;
  newSubscriptionsCount: number;
  pendingTopicRequestsCount: number;
  topicRequests: TopicRequest[] | undefined;
  isTopicRequestsLoading: boolean;
  isTopicRequestsError: boolean;
  refetchTopicRequests: () => void;
  
  pendingTutoringRequestsCount: number;
  tutoringRequests: TutoringRequest[] | undefined;
  isTutoringRequestsLoading: boolean;
  isTutoringRequestsError: boolean;
  refetchTutoringRequests: () => void;

  unreadConversationsCount: number;
  unreadGroupCount: number;
  conversations: Conversation[] | undefined;
  groupConversations: CourseGroupConversation[] | undefined;
  isConversationsLoading: boolean;
  isConversationsError: boolean;
  refetchConversations: () => void;

  acknowledgeNewUsers: () => void;
  acknowledgeNewSubscriptions: () => void;
  
  newStudentsCount: number;
  newTeachersCount: number;
  acknowledgeNewStudents: () => void;
  acknowledgeNewTeachers: () => void;

  // New notification system properties
  pendingTeacherPaymentsCount: number;
  pendingTeacherPayments: TutoringRequest[];
  isTeacherPaymentsLoading: boolean;
  refetchTeacherPayments: () => void;

  expiringSubscriptionsCount: number;
  expiringSubscriptions: { student: StudentUser; nextBillingDate: string; daysRemaining: number }[];
}

export const AdminNotificationContext = createContext<AdminNotificationContextType>({
  newUsersCount: 0,
  newSubscriptionsCount: 0,
  pendingTopicRequestsCount: 0,
  topicRequests: undefined,
  isTopicRequestsLoading: true,
  isTopicRequestsError: false,
  refetchTopicRequests: () => {},

  pendingTutoringRequestsCount: 0,
  tutoringRequests: undefined,
  isTutoringRequestsLoading: true,
  isTutoringRequestsError: false,
  refetchTutoringRequests: () => {},

  unreadConversationsCount: 0,
  unreadGroupCount: 0,
  conversations: undefined,
  groupConversations: undefined,
  isConversationsLoading: true,
  isConversationsError: false,
  refetchConversations: () => {},

  acknowledgeNewUsers: () => {},
  acknowledgeNewSubscriptions: () => {},
  
  newStudentsCount: 0,
  newTeachersCount: 0,
  acknowledgeNewStudents: () => {},
  acknowledgeNewTeachers: () => {},

  // Default values for new properties
  pendingTeacherPaymentsCount: 0,
  pendingTeacherPayments: [],
  isTeacherPaymentsLoading: true,
  refetchTeacherPayments: () => {},

  expiringSubscriptionsCount: 0,
  expiringSubscriptions: [],
});