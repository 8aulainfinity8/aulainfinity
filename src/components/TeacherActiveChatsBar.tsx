
import React, { useContext, useState, useEffect } from 'react';
import { useActiveChats } from '../contexts/ActiveChatsContext';
import { MessageSquare, Video, X, Circle, Settings } from 'lucide-react';
import { AuthContext } from '../contexts/AuthContext';
import { db } from '../services/firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { TeacherUser } from '../types';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import * as api from '../services/api';
import { ROUTES } from '../constants/routes';

export const TeacherActiveChatsBar: React.FC = () => {
    const { activeChats, removeActiveChat, currentChatId, setCurrentChatId, addActiveChat } = useActiveChats();
    const { user, updateUser } = useContext(AuthContext);
    const navigate = useNavigate();
    
    const [isMobileCollapsed, setIsMobileCollapsed] = useState(() => {
        return typeof window !== 'undefined' ? window.innerWidth < 768 : true;
    });

    const { data: conversations } = useQuery({
        queryKey: ['conversations', user?.id],
        queryFn: () => api.fetchUserChatsFromFirestore(user?.id || ''),
        enabled: false, // Componente desactivado (retorna null)
        staleTime: 30000
    });

    useEffect(() => {
        const handleResize = () => {
            if (window.innerWidth >= 768) {
                setIsMobileCollapsed(false);
            }
        };
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    useEffect(() => {
        if (conversations && user?.role === 'teacher') {
            const recentOrUnread = conversations.filter(c => c.unreadByTeacher || c.teacherId === user.id).slice(0, 5);
            recentOrUnread.forEach(convo => {
                addActiveChat({
                    id: convo.id,
                    name: convo.studentName || 'Alumno',
                    type: 'chat',
                    hasNewMessage: !!convo.unreadByTeacher
                });
            });
        }
    }, [conversations, user, addActiveChat]);

    // El usuario ha indicado que no quiere el globo flotante de chats activos.
    // Retornamos null para desactivar la burbuja/panel flotante.
    return null;
};
