import { createContext } from 'react';
import { Conversation, StudentPeerConversation, CourseGroupConversation } from '../types';

export interface StudentNotificationContextType {
    unreadSupportCount: number;
    unreadPeerCount: number;
    unreadGroupCount: number;
    unreadStudentTotal: number;
    pendingTutoringRequestsCount: number;
    studentConversations: Conversation[] | undefined;
    peerConversations: StudentPeerConversation[] | undefined;
    groupConversations: CourseGroupConversation[] | undefined;
    isConversationsLoading: boolean;
    isPeerConversationsLoading: boolean;
    isGroupConversationsLoading: boolean;
    refetchConversations: () => void;
    refetchPeerConversations: () => void;
    refetchGroupConversations: () => void;
}

export const StudentNotificationContext = createContext<StudentNotificationContextType | undefined>(undefined);
