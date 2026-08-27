import React, { useState, useEffect, useCallback, ReactNode, useContext } from 'react';
import { useQuery } from '@tanstack/react-query';
import * as api from '../services/api';
import { NewCommentsContext } from './NewCommentsContext';
import { AuthContext } from './AuthContext';
import { auth } from '../services/firebase';
import { Comment } from '../types';
import { eventEmitter } from '../services/eventService';

const LAST_CHECKED_COMMENTS_KEY = 'lastCheckedCommentsTimestamp';

export const NewCommentsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { user } = useContext(AuthContext);
  const [newComments, setNewComments] = useState<Comment[]>([]);

  const { data: comments, isLoading, isError, refetch } = useQuery<Comment[]>({
    queryKey: ['allComments'],
    queryFn: api.fetchAllComments,
    enabled: !!user && !!user.id && !!auth.currentUser && user?.role === 'admin',
  });

  // Listen for real-time comment updates instead of polling
  useEffect(() => {
    if (user?.role !== 'admin') return;
    
    const handleCommentUpdate = () => {
      refetch();
    };
    
    eventEmitter.on('comment-update', handleCommentUpdate);
    eventEmitter.on('comment-deleted', handleCommentUpdate);

    return () => {
      eventEmitter.off('comment-update', handleCommentUpdate);
      eventEmitter.off('comment-deleted', handleCommentUpdate);
    };
  }, [user, refetch]);


  useEffect(() => {
    if (comments) {
      setNewComments(comments.filter(c => !c.isRead));
    }
  }, [comments]);

  const markCommentAsRead = useCallback(async (commentId: string) => {
    setNewComments(prev => prev.filter(c => c.id !== commentId));
    try {
      await api.markCommentAsRead(commentId);
      refetch();
    } catch (e) {
      console.error('Error marking comment as read:', e);
    }
  }, [refetch]);

  const value = {
    newCommentsCount: newComments.length,
    newComments,
    comments,
    isLoading,
    isError,
    refetchComments: refetch,
    markCommentAsRead,
  };

  return (
    <NewCommentsContext.Provider value={value}>
      {children}
    </NewCommentsContext.Provider>
  );
};