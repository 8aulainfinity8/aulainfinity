

import React, { createContext, useEffect, useContext, ReactNode, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AuthContext } from './AuthContext';
import { NotificationContext } from './NotificationContext';
import { StudentNotificationContext } from './StudentNotificationContext';
import * as api from '../services/api';
import { auth } from '../services/firebase';
import { eventEmitter } from '../services/eventService';
import { findVideoById } from '../data/database';
import type { Video, Comment as CommentType, StudentUser, CourseLevel, TutoringRequest, Conversation, StudentPeerConversation, CourseGroupConversation } from '../types';

export const StudentNotificationProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const { user } = useContext(AuthContext);
    const { addToast } = useContext(NotificationContext);
    const queryClient = useQueryClient();

    // Fetch all comments once to know where the user has commented
    const { data: allComments } = useQuery<CommentType[]>({
        queryKey: ['allComments'],
        queryFn: api.fetchAllComments,
        enabled: !!user && !!user.id && !!auth.currentUser && user.role === 'student',
    });

    const { data: allCourses } = useQuery<CourseLevel[]>({
        queryKey: ['courses'],
        queryFn: api.fetchCourses,
        enabled: !!user && !!user.id && !!auth.currentUser && user.role === 'student',
    });

    // --- NEW: Centralized Student Chat Queries ---
    const { 
        data: studentConversations, 
        isLoading: isConversationsLoading,
        refetch: refetchConversations 
    } = useQuery<Conversation[]>({
        queryKey: ['conversations', user?.id],
        queryFn: () => api.fetchUserChatsFromFirestore(user!.id),
        enabled: !!user && !!user.id && !!auth.currentUser && user.role === 'student',
        staleTime: 30000,
    });

    const { 
        data: peerConversations, 
        isLoading: isPeerConversationsLoading,
        refetch: refetchPeerConversations 
    } = useQuery<StudentPeerConversation[]>({
        queryKey: ['peer-conversations', user?.id],
        queryFn: () => api.fetchUserPeerChatsFromFirestore(user!.id),
        enabled: !!user && !!user.id && !!auth.currentUser && user.role === 'student',
        staleTime: 30000,
    });

    const { 
        data: groupConversations, 
        isLoading: isGroupConversationsLoading,
        refetch: refetchGroupConversations 
    } = useQuery<CourseGroupConversation[]>({
        queryKey: ['group-conversations', user?.id],
        queryFn: () => api.fetchCourseGroupConversations(user!.id),
        enabled: !!user && !!user.id && !!auth.currentUser && user.role === 'student',
        staleTime: 30000,
    });

    const { 
        data: tutoringRequests,
        refetch: refetchTutoringRequests
    } = useQuery<TutoringRequest[]>({
        queryKey: ['tutoringRequests'],
        queryFn: api.fetchTutoringRequests,
        enabled: !!user && !!user.id && !!auth.currentUser && user.role === 'student',
    });

    // --- NEW: Centralized Student Unread Counts ---
    const unreadSupportCount = useMemo(() => {
        if (!user || user.role !== 'student' || !studentConversations) return 0;
        return studentConversations.filter(c => {
            if (!c || !c.id) return false;
            const isSupport = c.type === 'support' || c.id === user.id || c.id === `support_${user.id}` || c.id.startsWith('support_');
            const belongsToStudent = c.studentId === user.id || c.id === user.id || c.id === `support_${user.id}` || c.id.startsWith(user.id + '_') || c.id.startsWith(`support_${user.id}`);
            return isSupport && belongsToStudent && !!c.unreadByStudent;
        }).length;
    }, [studentConversations, user]);

    const unreadPeerCount = useMemo(() => {
        if (!user || user.role !== 'student' || !peerConversations) return 0;
        return peerConversations.filter(c => !!c.unreadByStudentId?.[user.id]).length;
    }, [peerConversations, user]);

    const unreadGroupCount = useMemo(() => {
        if (!user || user.role !== 'student' || !groupConversations) return 0;
        return groupConversations.filter(c => !!c.unreadByUserId?.[user.id]).length;
    }, [groupConversations, user]);

    const pendingTutoringRequestsCount = useMemo(() => {
        if (!user || user.role !== 'student' || !tutoringRequests) return 0;
        // Count modifications proposed by teacher that haven't been seen by the student
        return tutoringRequests.filter(req => 
            req.modificationStatus === 'pending' && 
            req.modificationRequestedBy === 'teacher' && 
            req.studentId === user.id && 
            !req.seenByStudent
        ).length;
    }, [tutoringRequests, user]);

    const unreadStudentTotal = useMemo(() => {
        return unreadSupportCount + unreadPeerCount + unreadGroupCount + pendingTutoringRequestsCount;
    }, [unreadSupportCount, unreadPeerCount, unreadGroupCount, pendingTutoringRequestsCount]);

    useEffect(() => {
        if (!user || user.role !== 'student') return;

        // Handler for new video uploads
        const handleNewVideo = (newVideo: Video) => {
            if (!newVideo || !newVideo.title) return;
            console.log('New video detected by listener:', newVideo.title);
            addToast(`¡Nuevo vídeo disponible!: ${newVideo.title}`, 'info');
            // Invalidate courses query to make sure new videos show up without a refresh
            queryClient.invalidateQueries({ queryKey: ['courses'] });
        };

        // Handler for new comments
        const handleNewComment = (newComment: CommentType) => {
            if (!newComment || !newComment.author || newComment.author.id === user.id) return; // Ignore user's own comments

            const userHasCommentedOnVideo = allComments?.some(
                comment => comment.videoId === newComment.videoId && comment.author?.id === user.id
            );

            if (userHasCommentedOnVideo) {
                const video = findVideoById(newComment.videoId, allCourses || []);
                const toastMessage = video 
                    ? `Nuevo comentario en "${video.title}"`
                    : 'Alguien ha respondido en un vídeo que comentaste.';
                addToast(toastMessage, 'info');
                 // Invalidate comments for the specific video if user is on that page
                queryClient.invalidateQueries({ queryKey: ['comments', newComment.videoId] });
            }
        };

        // Handler for tutoring status updates
        const handleTutoringUpdate = (tutoringRequest?: TutoringRequest | null) => {
            refetchTutoringRequests();
            if (!tutoringRequest || !tutoringRequest.studentId) return;
            if (tutoringRequest.studentId === user.id && tutoringRequest.status !== 'pending') {
                addToast(`El estado de tu petición de tutoría de ${tutoringRequest.subject} ha cambiado a: ${tutoringRequest.status}`, 'info');
            }
        };

        const handleMessageUpdate = (payload: any) => {
            const convoId = payload?.conversationId || payload?.courseId;
            if (!convoId) return;

            const isUnread = payload.read ? false : (payload.senderId !== user.id);

            // Update support/private conversations
            queryClient.setQueryData(['conversations', user.id], (oldData: Conversation[] | undefined) => {
                if (!oldData) return oldData;
                return oldData.map(c => c.id === convoId ? {
                    ...c,
                    lastMessageText: payload.read ? c.lastMessageText : (payload.text || c.lastMessageText),
                    lastMessageTimestamp: payload.read ? c.lastMessageTimestamp : (payload.timestamp || c.lastMessageTimestamp),
                    unreadByStudent: isUnread
                } : c);
            });

            // Update peer conversations
            queryClient.setQueryData(['peer-conversations', user.id], (oldData: StudentPeerConversation[] | undefined) => {
                if (!oldData) return oldData;
                return oldData.map(c => c.id === convoId ? {
                    ...c,
                    lastMessageText: payload.read ? c.lastMessageText : (payload.text || c.lastMessageText),
                    lastMessageTimestamp: payload.read ? c.lastMessageTimestamp : (payload.timestamp || c.lastMessageTimestamp),
                    unreadByStudentId: {
                        ...c.unreadByStudentId,
                        [user.id]: isUnread
                    }
                } : c);
            });

            // Update group conversations
            queryClient.setQueryData(['group-conversations', user.id], (oldData: CourseGroupConversation[] | undefined) => {
                if (!oldData) return oldData;
                return oldData.map(c => c.id === convoId ? {
                    ...c,
                    lastMessageText: payload.read ? c.lastMessageText : (payload.text || c.lastMessageText),
                    lastMessageTimestamp: payload.read ? c.lastMessageTimestamp : (payload.timestamp || c.lastMessageTimestamp),
                    unreadByUserId: {
                        ...c.unreadByUserId,
                        [user.id]: isUnread
                    }
                } : c);
            });
        };

        eventEmitter.on('video-added', handleNewVideo);
        eventEmitter.on('comment-update', handleNewComment);
        eventEmitter.on('tutoring-update', handleTutoringUpdate);
        eventEmitter.on('message-update', handleMessageUpdate);
        eventEmitter.on('direct-message-update', handleMessageUpdate);
        eventEmitter.on('peer-message-update', handleMessageUpdate);
        eventEmitter.on('group-message-update', handleMessageUpdate);

        return () => {
            eventEmitter.off('video-added', handleNewVideo);
            eventEmitter.off('comment-update', handleNewComment);
            eventEmitter.off('tutoring-update', handleTutoringUpdate);
            eventEmitter.off('message-update', handleMessageUpdate);
            eventEmitter.off('direct-message-update', handleMessageUpdate);
            eventEmitter.off('peer-message-update', handleMessageUpdate);
            eventEmitter.off('group-message-update', handleMessageUpdate);
        };
    }, [user, addToast, allComments, queryClient, allCourses, refetchConversations, refetchPeerConversations, refetchGroupConversations, refetchTutoringRequests]);

    const contextValue = {
        unreadSupportCount,
        unreadPeerCount,
        unreadGroupCount,
        unreadStudentTotal,
        pendingTutoringRequestsCount,
        studentConversations,
        peerConversations,
        groupConversations,
        isConversationsLoading,
        isPeerConversationsLoading,
        isGroupConversationsLoading,
        refetchConversations,
        refetchPeerConversations,
        refetchGroupConversations
    };

    return (
        <StudentNotificationContext.Provider value={contextValue}>
            {children}
        </StudentNotificationContext.Provider>
    );
};
