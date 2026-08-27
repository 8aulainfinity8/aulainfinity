import { useState, useMemo, useContext } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as api from '../services/api';
import type { ExamEvent } from '../types';
import { AuthContext } from '../contexts/AuthContext';
import { NotificationContext } from '../contexts/NotificationContext';
import { auth } from '../services/firebase';

export const useAgendaEvents = () => {
    const { user } = useContext(AuthContext);
    const { addToast } = useContext(NotificationContext);
    const queryClient = useQueryClient();

    const [modalOpen, setModalOpen] = useState(false);
    const [eventToEdit, setEventToEdit] = useState<ExamEvent | null>(null);
    const [eventToDelete, setEventToDelete] = useState<ExamEvent | null>(null);
    const [studyPlanEvent, setStudyPlanEvent] = useState<ExamEvent | null>(null);
    const [dateForNewEvent, setDateForNewEvent] = useState<Date | null>(null);


    const { data: events = [], isLoading } = useQuery<ExamEvent[]>({
        queryKey: ['agendaEvents', user?.id, user?.role],
        queryFn: () => api.fetchAgendaEvents(user?.role === 'admin' ? undefined : user!.id),
        enabled: !!user && !!user.id && !!auth.currentUser,
    });

    const deleteMutation = useMutation({
        mutationFn: api.deleteAgendaEvent,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['agendaEvents', user?.id] });
            addToast('Examen eliminado.', 'success');
            setEventToDelete(null);
        }
    });
    
    const openAddModal = (date: Date) => {
        setEventToEdit(null);
        setDateForNewEvent(date);
        setModalOpen(true);
    };

    const openEditModal = (event: ExamEvent) => {
        setEventToEdit(event);
        setModalOpen(true);
    };

    const upcomingEvents = useMemo(() => {
        const todayStr = new Date().toISOString().split('T')[0];
        return events
            .filter(e => e.date >= todayStr)
            .sort((a, b) => a.date.localeCompare(b.date));
    }, [events]);

    return {
        events,
        isLoading,
        upcomingEvents,
        modalOpen,
        setModalOpen,
        eventToEdit,
        dateForNewEvent,
        openAddModal,
        openEditModal,
        eventToDelete,
        setEventToDelete,
        deleteMutation,
        studyPlanEvent,
        setStudyPlanEvent,
    };
};