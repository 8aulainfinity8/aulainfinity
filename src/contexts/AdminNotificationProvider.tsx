

import React, { useState, useEffect, useCallback, ReactNode, useContext, useMemo, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import * as api from '../services/api';
import { AdminNotificationContext } from './AdminNotificationContext';
import { AuthContext } from './AuthContext';
import { StudentUser, TeacherUser, TopicRequest, TutoringRequest, Conversation, TeacherPayment, StudentPayment, CourseGroupConversation } from '../types';
import { eventEmitter } from '../services/eventService';
import { NotificationContext } from './NotificationContext';
import { AppConfigContext } from './AppConfigContext';
import { auth } from '../services/firebase';

import { isTeacherMatchForSubject, isTutoringRequestForTeacher } from '../utils/tutoringHelpers';

const LAST_CHECKED_REGISTRATION_KEY = 'lastCheckedRegistrationTimestamp';
const KNOWN_SUBSCRIBERS_KEY = 'knownSubscriberIds';
const SEEN_STUDENTS_KEY = 'seenStudentUserIds';
const SEEN_TEACHERS_KEY = 'seenTeacherUserIds';

export const AdminNotificationProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { user } = useContext(AuthContext);
  const { addToast } = useContext(NotificationContext);
  const { appConfig } = useContext(AppConfigContext);
  const [newUsersCount, setNewUsersCount] = useState(0);
  const [newSubscriptionsCount, setNewSubscriptionsCount] = useState(0);
  const [newStudentsCount, setNewStudentsCount] = useState(0);
  const [newTeachersCount, setNewTeachersCount] = useState(0);

  // Refs to hold the latest reactive state for background checks (avoiding interval recreation/multiple queries)
  const usersRef = useRef<StudentUser[] | undefined>(undefined);
  const teachersRef = useRef<TeacherUser[] | undefined>(undefined);
  const tutoringRequestsRef = useRef<TutoringRequest[] | undefined>(undefined);
  const agendaEventsRef = useRef<any[] | undefined>(undefined);
  const appConfigRef = useRef<any>(undefined);

  // Refs to store previous counts for notification logic
  const prevTopicRequestsCount = useRef<number | null>(null);
  const prevTutoringRequestsCount = useRef<number | null>(null);

  // --- QUERIES (WITHOUT POLLING) ---
  const { data: users, refetch: refetchUsers } = useQuery<StudentUser[]>({
    queryKey: ['users'],
    queryFn: api.fetchUsers,
    enabled: user?.role === 'admin' || user?.role === 'teacher',
  });

  const { data: teachers, refetch: refetchTeachers } = useQuery<TeacherUser[]>({
    queryKey: ['teachers'],
    queryFn: api.fetchTeachers,
    enabled: user?.role === 'admin' || user?.role === 'teacher',
  });

  const { data: agendaEvents, refetch: refetchAgendaEvents } = useQuery<any[]>({
    queryKey: ['adminAgendaEvents'],
    queryFn: () => api.fetchAgendaEvents(),
    enabled: user?.role === 'admin' || user?.role === 'teacher',
  });

  const { 
    data: topicRequests, 
    isLoading: isTopicRequestsLoading,
    isError: isTopicRequestsError,
    refetch: refetchTopicRequests
  } = useQuery<TopicRequest[]>({
    queryKey: ['topicRequests'],
    queryFn: api.fetchTopicRequests,
    enabled: user?.role === 'admin' || user?.role === 'teacher',
  });

  const { 
    data: tutoringRequests, 
    isLoading: isTutoringLoading,
    isError: isTutoringError,
    refetch: refetchTutoringRequests
  } = useQuery<TutoringRequest[]>({
    queryKey: ['tutoringRequests'],
    queryFn: api.fetchTutoringRequests,
    enabled: !!user,
  });

  const {
    data: conversations,
    isLoading: isConversationsLoading,
    isError: isConversationsError,
    refetch: refetchConversations
  } = useQuery<Conversation[]>({
    queryKey: ['conversations'],
    queryFn: api.fetchConversations,
    enabled: user?.role === 'admin' || user?.role === 'teacher',
    refetchInterval: 3000,
  });

  const { 
    data: groupConversations, 
    refetch: refetchGroupConversations 
  } = useQuery<CourseGroupConversation[]>({
    queryKey: ['group-conversations', user?.id],
    queryFn: () => api.fetchCourseGroupConversations(user!.id),
    enabled: !!user && (user.role === 'admin' || user.role === 'teacher'),
    refetchInterval: 5000,
  });

  const {
    data: teacherPayments,
    isLoading: isTeacherPaymentsLoading,
    refetch: refetchTeacherPayments
  } = useQuery<TeacherPayment[]>({
    queryKey: ['adminTeacherPaymentsNotifications'],
    queryFn: () => api.fetchTeacherPayments(),
    enabled: user?.role === 'admin',
  });

  const {
    data: studentPayments,
    refetch: refetchStudentPayments
  } = useQuery<StudentPayment[]>({
    queryKey: ['adminStudentPaymentsNotifications'],
    queryFn: () => api.fetchStudentPayments(),
    enabled: user?.role === 'admin',
  });

  // --- REAL-TIME EVENT LISTENERS ---
  useEffect(() => {
    if (!user) return;

    let userTimer: any = null;
    let requestTimer: any = null;
    let tutoringTimer: any = null;
    let messageTimer: any = null;
    let teacherPayTimer: any = null;
    let studentPayTimer: any = null;
    let agendaTimer: any = null;

    const handleUserUpdate = () => { 
      if (user.role === 'admin' || user.role === 'teacher') {
        if (userTimer) clearTimeout(userTimer);
        userTimer = setTimeout(() => {
          refetchUsers();
          refetchTeachers();
          refetchConversations();
        }, 500);
      }
    };
    const handleRequestUpdate = () => { 
      if (user.role === 'admin' || user.role === 'teacher') {
        if (requestTimer) clearTimeout(requestTimer);
        requestTimer = setTimeout(() => {
          refetchTopicRequests();
        }, 500);
      }
    };
    const handleTutoringUpdate = () => {
      if (tutoringTimer) clearTimeout(tutoringTimer);
      tutoringTimer = setTimeout(() => {
        refetchTutoringRequests();
      }, 500);
    };
    const handleMessageUpdate = () => { 
      if (user.role === 'admin' || user.role === 'teacher') {
        if (messageTimer) clearTimeout(messageTimer);
        messageTimer = setTimeout(() => {
          refetchConversations();
          refetchGroupConversations();
        }, 500);
      }
    };
    const handleTeacherPaymentUpdate = () => { 
      if (user.role === 'admin') {
        if (teacherPayTimer) clearTimeout(teacherPayTimer);
        teacherPayTimer = setTimeout(() => {
          refetchTeacherPayments();
        }, 500);
      }
    };
    const handleStudentPaymentUpdate = () => { 
      if (user.role === 'admin') {
        if (studentPayTimer) clearTimeout(studentPayTimer);
        studentPayTimer = setTimeout(() => {
          refetchStudentPayments();
        }, 500);
      }
    };
    const handleAgendaUpdate = () => {
      if (user.role === 'admin' || user.role === 'teacher') {
        if (agendaTimer) clearTimeout(agendaTimer);
        agendaTimer = setTimeout(() => {
          refetchAgendaEvents();
        }, 500);
      }
    };
    
    eventEmitter.on('user-update', handleUserUpdate);
    eventEmitter.on('user-deleted', handleUserUpdate);
    eventEmitter.on('subscription-update', handleUserUpdate);
    eventEmitter.on('request-update', handleRequestUpdate);
    eventEmitter.on('request-deleted', handleRequestUpdate);
    eventEmitter.on('tutoring-update', handleTutoringUpdate);
    eventEmitter.on('tutoring-deleted', handleTutoringUpdate);
    eventEmitter.on('message-update', handleMessageUpdate);
    eventEmitter.on('direct-message-update', handleMessageUpdate);
    eventEmitter.on('peer-message-update', handleMessageUpdate);
    eventEmitter.on('group-message-update', handleMessageUpdate);
    eventEmitter.on('course-group-message-update', handleMessageUpdate);
    eventEmitter.on('teacher-payment-created', handleTeacherPaymentUpdate);
    eventEmitter.on('subscription-update', handleTeacherPaymentUpdate); // Subscriptions can trigger state changes
    eventEmitter.on('student-payment-created', handleStudentPaymentUpdate);
    eventEmitter.on('student-payments-updated', handleStudentPaymentUpdate);
    eventEmitter.on('agenda-updated', handleAgendaUpdate);

    // Cleanup listeners on unmount
    return () => {
      if (userTimer) clearTimeout(userTimer);
      if (requestTimer) clearTimeout(requestTimer);
      if (tutoringTimer) clearTimeout(tutoringTimer);
      if (messageTimer) clearTimeout(messageTimer);
      if (teacherPayTimer) clearTimeout(teacherPayTimer);
      if (studentPayTimer) clearTimeout(studentPayTimer);
      if (agendaTimer) clearTimeout(agendaTimer);

      eventEmitter.off('user-update', handleUserUpdate);
      eventEmitter.off('user-deleted', handleUserUpdate);
      eventEmitter.off('subscription-update', handleUserUpdate);
      eventEmitter.off('request-update', handleRequestUpdate);
      eventEmitter.off('request-deleted', handleRequestUpdate);
      eventEmitter.off('tutoring-update', handleTutoringUpdate);
      eventEmitter.off('tutoring-deleted', handleTutoringUpdate);
      eventEmitter.off('message-update', handleMessageUpdate);
      eventEmitter.off('direct-message-update', handleMessageUpdate);
      eventEmitter.off('peer-message-update', handleMessageUpdate);
      eventEmitter.off('group-message-update', handleMessageUpdate);
      eventEmitter.off('course-group-message-update', handleMessageUpdate);
      eventEmitter.off('teacher-payment-created', handleTeacherPaymentUpdate);
      eventEmitter.off('subscription-update', handleTeacherPaymentUpdate);
      eventEmitter.off('student-payment-created', handleStudentPaymentUpdate);
      eventEmitter.off('student-payments-updated', handleStudentPaymentUpdate);
      eventEmitter.off('agenda-updated', handleAgendaUpdate);
    };
  }, [user, refetchUsers, refetchTeachers, refetchTopicRequests, refetchTutoringRequests, refetchConversations, refetchTeacherPayments, refetchStudentPayments, refetchAgendaEvents]);


  const pendingTopicRequestsCount = useMemo(() => {
      if (!topicRequests) return 0;
      return topicRequests.filter(req => req.status === 'pending' && (!user?.role || (user.role === 'admin' ? !req.seenByAdmin : !req.seenByTeacher))).length;
  }, [topicRequests, user]);

  const pendingTutoringRequestsCount = useMemo(() => {
    if (!tutoringRequests) return 0;
    
    // For teachers, count:
    // 1. New pending requests assigned/matching subject
    // 2. Pending modifications requested by student
    if (user?.role === 'teacher') {
      return tutoringRequests.filter(req => {
        const isNewPending = req.status === 'pending' && !req.seenByTeacher && isTutoringRequestForTeacher(req, user, teachers);
        const isPendingModification = req.modificationStatus === 'pending' && req.modificationRequestedBy === 'student' && req.teacherId === user.id && !req.seenByTeacher;
        return isNewPending || isPendingModification;
      }).length;
    }

    // For admin, count:
    // 1. New pending requests where no teacher is assigned or matching admin logic
    // 2. All pending modifications to oversee
    return tutoringRequests.filter(req => 
      (req.status === 'pending' && !req.seenByAdmin) || 
      (req.modificationStatus === 'pending' && !req.seenByAdmin)
    ).length;
  }, [tutoringRequests, user, teachers]);

  const unreadConversationsCount = useMemo(() => {
    if (!conversations) return 0;
    if (user?.role === 'teacher') {
      const teacherId = user.id;
      return conversations.filter(c => {
        const student = (users || []).find(u => u.id === c.studentId || u.id === c.id.replace('direct_', ''));
        const isAssigned = c.teacherId === teacherId || c.studentId === teacherId || (c.id && c.id.includes(teacherId)) || (student && (student as any).assignedTeacherId === teacherId);
        const isUnassigned = student && !(student as any).assignedTeacherId;
        return (isAssigned || isUnassigned || !c.teacherId) && !!c.unreadByTeacher;
      }).length;
    }
    return conversations.filter(c => !!c.unreadByAdmin).length;
  }, [conversations, user, users]);

  const unreadGroupCount = useMemo(() => {
    if (!groupConversations || !user) return 0;
    return groupConversations.filter(c => !!c.unreadByUserId?.[user.id]).length;
  }, [groupConversations, user]);

  const pendingTeacherPayments = useMemo(() => {
    if (!tutoringRequests || !teacherPayments) return [];
    
    // Find completed tutoring requests
    const completedClasses = tutoringRequests.filter(req => req.status === 'completed' && req.teacherId);
    
    // Filter to those that don't have a matching payment
    return completedClasses.filter(req => {
      const hasPayment = teacherPayments.some(pay => {
        const payDateStr = new Date(pay.date).toISOString().split('T')[0];
        return pay.teacherId === req.teacherId &&
               pay.studentId === req.studentId &&
               payDateStr === req.date;
      });
      return !hasPayment;
    });
  }, [tutoringRequests, teacherPayments]);

  const pendingTeacherPaymentsCount = pendingTeacherPayments.length;

  const expiringSubscriptions = useMemo(() => {
    if (!users) return [];
    
    const now = new Date();
    const subscribedUsers = users.filter(u => u.isSubscribed);
    
    const list = subscribedUsers.map(u => {
      const regDate = new Date(u.registrationDate);
      let nextBilling = new Date(now.getFullYear(), now.getMonth(), regDate.getDate());
      
      // If the billing day is in the past for this month, move to next month
      if (nextBilling.getTime() < now.getTime()) {
        nextBilling.setMonth(nextBilling.getMonth() + 1);
      }
      
      const diffTime = nextBilling.getTime() - now.getTime();
      const daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      return {
        student: u,
        nextBillingDate: nextBilling.toISOString().split('T')[0],
        daysRemaining
      };
    });
    
    // Filter to those expiring within 5 days
    return list.filter(item => item.daysRemaining <= 5);
  }, [users]);

  const expiringSubscriptionsCount = expiringSubscriptions.length;

    // Effect for topic request notifications
    useEffect(() => {
        if (user?.role === 'admin') {
            if (prevTopicRequestsCount.current !== null && pendingTopicRequestsCount > prevTopicRequestsCount.current) {
                addToast('¡Nueva petición de tema recibida!', 'info');
            }
            prevTopicRequestsCount.current = pendingTopicRequestsCount;
        }
    }, [pendingTopicRequestsCount, user, addToast]);

    // Effect for tutoring request notifications (Admin and Teacher)
    const prevTeacherTutoringCount = useRef<number | null>(null);
    useEffect(() => {
        if (user?.role === 'admin') {
            if (prevTutoringRequestsCount.current !== null && pendingTutoringRequestsCount > prevTutoringRequestsCount.current) {
                addToast('¡Nueva solicitud de tutoría pendiente para profesor!', 'info');
            }
            prevTutoringRequestsCount.current = pendingTutoringRequestsCount;
        } else if (user?.role === 'teacher') {
            if (prevTeacherTutoringCount.current !== null && pendingTutoringRequestsCount > prevTeacherTutoringCount.current) {
                addToast('¡Tienes una nueva solicitud de tutoría asignada!', 'info');
            }
            prevTeacherTutoringCount.current = pendingTutoringRequestsCount;
        }
    }, [pendingTutoringRequestsCount, user, addToast]);

    // Sync reactive state to refs to prevent background timer re-evaluation/looping
    useEffect(() => {
        usersRef.current = users;
    }, [users]);

    useEffect(() => {
        teachersRef.current = teachers;
    }, [teachers]);

    useEffect(() => {
        tutoringRequestsRef.current = tutoringRequests;
    }, [tutoringRequests]);

    useEffect(() => {
        agendaEventsRef.current = agendaEvents;
    }, [agendaEvents]);

    useEffect(() => {
        appConfigRef.current = appConfig || undefined;
    }, [appConfig]);

    // Background checker to dispatch automated WhatsApp notifications exactly 30 minutes before scheduled agenda events & tutoring sessions
    useEffect(() => {
        const role = user?.role;
        if (!user || (role !== 'admin' && role !== 'teacher')) return;

        const checkWhatsAppAlerts = async () => {
            const now = Date.now();
            const config = appConfigRef.current;
            const currentUsers = usersRef.current || [];
            const currentTeachers = teachersRef.current || [];
            const currentTutoringRequests = tutoringRequestsRef.current || [];
            const currentAgendaEvents = agendaEventsRef.current || [];

            const mode = config?.whatsappMode || 'direct';
            const adminPhone = config?.supportPhone || config?.adminPhone || '';

            const apiPayload = {
                whatsappMode: mode,
                twilioAccountSid: config?.twilioAccountSid,
                twilioAuthToken: config?.twilioAuthToken,
                twilioWhatsappFrom: config?.twilioWhatsappFrom,
                metaPhoneNumberId: config?.metaPhoneNumberId,
                metaAccessToken: config?.metaAccessToken,
                evolutionInstanceUrl: config?.evolutionInstanceUrl,
                evolutionApiKey: config?.evolutionApiKey
            };

            // 1. Check Tutoring Requests (Confirmed)
            if (currentTutoringRequests && currentTutoringRequests.length > 0) {
                for (const req of currentTutoringRequests) {
                    if (req.status !== 'confirmed' || req.whatsappSent || !req.date || !req.time) continue;

                    try {
                        const cleanDate = req.date.split('T')[0];
                        const eventDateTime = new Date(`${cleanDate}T${req.time}:00`);
                        const diffMs = eventDateTime.getTime() - now;
                        const diffMinutes = diffMs / (1000 * 60);

                        if (diffMinutes > -15 && diffMinutes <= 30) {
                            await api.updateTutoringWhatsappSent(req.id);

                            const studentUser = currentUsers.find(u => u.id === req.studentId);
                            const studentPhone = studentUser?.phone || '';

                            let teacherPhone = '';
                            if (req.teacherId) {
                                const teacherUser = currentTeachers.find(t => t.id === req.teacherId);
                                if (teacherUser) teacherPhone = teacherUser.phone;
                            }

                            // Send WhatsApp to Student
                            if (studentPhone) {
                                await api.sendWhatsApp({
                                    to: studentPhone,
                                    message: `⏰ ¡Hola ${req.studentName}! Recuerda que tu tutoría de ${req.subject} comienza en 30 minutos (a las ${req.time}). Profesor: ${req.teacherName || 'Docente asignado'}. ¡Nos vemos en el aula!`,
                                    ...apiPayload
                                });
                            }

                            // Send WhatsApp to Teacher
                            if (teacherPhone && req.teacherName) {
                                await api.sendWhatsApp({
                                    to: teacherPhone,
                                    message: `⏰ ¡Hola ${req.teacherName}! Recuerda que tienes clase de tutoría de ${req.subject} con ${req.studentName} en 30 minutos (a las ${req.time}).`,
                                    ...apiPayload
                                });
                            }

                            // Send WhatsApp to Admin
                            if (adminPhone) {
                                await api.sendWhatsApp({
                                    to: adminPhone,
                                    message: `⏰ [Aviso Admin] Tutoría de ${req.subject} entre el Alumno ${req.studentName} y el Profesor ${req.teacherName || 'Docente'} comienza en 30 minutos (a las ${req.time}).`,
                                    ...apiPayload
                                });
                            }

                            addToast(`🟩 [WhatsApp Tutoría - 30 Min Antes] Notificación enviada a Alumno (${req.studentName}), Profesor (${req.teacherName || 'Docente'}) y Administrador.`, 'success');
                        }
                    } catch (e) {
                        console.error('Error processing Tutoring WhatsApp alarm:', e);
                    }
                }
            }

            // 2. Check Agenda Events (Exams, Assignments, Class Events)
            try {
                for (const ev of currentAgendaEvents) {
                    if (ev.whatsappSent || !ev.date) continue;

                    try {
                        const cleanDate = ev.date.split('T')[0];
                        const eventTime = ev.time || '09:00';
                        const eventDateTime = new Date(`${cleanDate}T${eventTime}:00`);
                        const diffMs = eventDateTime.getTime() - now;
                        const diffMinutes = diffMs / (1000 * 60);

                        if (diffMinutes > -15 && diffMinutes <= 30) {
                            await api.updateAgendaEvent(ev.id, { whatsappSent: true });

                            const studentUser = currentUsers.find(u => u.id === ev.studentId);
                            const studentPhone = studentUser?.phone || '';

                            let teacherPhone = '';
                            let teacherName = '';
                            if (studentUser?.assignedTeacherId) {
                                const teacherUser = currentTeachers.find(t => t.id === studentUser.assignedTeacherId);
                                if (teacherUser) {
                                    teacherPhone = teacherUser.phone;
                                    teacherName = teacherUser.name;
                                }
                            }

                            // Send WhatsApp to Student
                            if (studentPhone) {
                                await api.sendWhatsApp({
                                    to: studentPhone,
                                    message: `⏰ ¡Hola ${studentUser?.name || 'Estudiante'}! Recordatorio de tu Agenda: "${ev.title}" está programado para hoy a las ${eventTime} (comienza en 30 minutos). ¡Muchos éxitos!`,
                                    ...apiPayload
                                });
                            }

                            // Send WhatsApp to Teacher if assigned
                            if (teacherPhone) {
                                await api.sendWhatsApp({
                                    to: teacherPhone,
                                    message: `⏰ ¡Hola ${teacherName}! Recordatorio de Agenda: El alumno ${studentUser?.name || 'Estudiante'} tiene el evento "${ev.title}" programado en 30 minutos (a las ${eventTime}).`,
                                    ...apiPayload
                                });
                            }

                            // Send WhatsApp to Admin
                            if (adminPhone) {
                                await api.sendWhatsApp({
                                    to: adminPhone,
                                    message: `⏰ [Aviso Admin Agenda] Evento "${ev.title}" del Alumno ${studentUser?.name || 'Estudiante'} comienza en 30 minutos (a las ${eventTime}).`,
                                    ...apiPayload
                                });
                            }

                            addToast(`🟩 [WhatsApp Agenda - 30 Min Antes] Notificación enviada para el evento "${ev.title}".`, 'success');
                        }
                    } catch (e) {
                        console.error('Error processing Agenda Event WhatsApp alarm:', e);
                    }
                }
            } catch (err) {
                console.error("Error checking agenda events in WhatsApp checker:", err);
            }
        };

        checkWhatsAppAlerts();
        const alarmInterval = setInterval(checkWhatsAppAlerts, 30000);
        return () => clearInterval(alarmInterval);
    }, [user?.id, user?.role, addToast]);


  useEffect(() => {
    if (users) {
        // Calculate new registrations
        let lastCheckedTimestamp = localStorage.getItem(LAST_CHECKED_REGISTRATION_KEY);
        if (lastCheckedTimestamp === null) {
          lastCheckedTimestamp = new Date().toISOString();
          localStorage.setItem(LAST_CHECKED_REGISTRATION_KEY, lastCheckedTimestamp);
        }
        const newRegisteredUsers = users.filter(u => new Date(u.registrationDate).getTime() > new Date(lastCheckedTimestamp!).getTime());
        setNewUsersCount(newRegisteredUsers.length);

        // Calculate new subscriptions and payments
        let knownSubscriberIds: string[] = JSON.parse(localStorage.getItem(KNOWN_SUBSCRIBERS_KEY) || '[]');
        if (localStorage.getItem(KNOWN_SUBSCRIBERS_KEY) === null) {
          knownSubscriberIds = users.filter(u => u.isSubscribed).map(u => u.id);
          localStorage.setItem(KNOWN_SUBSCRIBERS_KEY, JSON.stringify(knownSubscriberIds));
        }
        const currentSubscriberIds = users.filter(u => u.isSubscribed).map(u => u.id);
        const newSubscribers = currentSubscriberIds.filter(id => !knownSubscriberIds.includes(id));

        let newPaymentsCount = 0;
        if (studentPayments) {
          const KNOWN_PAYMENTS_KEY = 'admin_known_payment_ids';
          let knownPaymentIds: string[] = JSON.parse(localStorage.getItem(KNOWN_PAYMENTS_KEY) || '[]');
          if (localStorage.getItem(KNOWN_PAYMENTS_KEY) === null) {
            knownPaymentIds = studentPayments.map(p => p.id);
            localStorage.setItem(KNOWN_PAYMENTS_KEY, JSON.stringify(knownPaymentIds));
          }
          const newPayments = studentPayments.filter(p => !knownPaymentIds.includes(p.id));
          newPaymentsCount = newPayments.length;
        }

        setNewSubscriptionsCount(Math.max(newSubscribers.length, newPaymentsCount));

        // Calculate specific new student alert count
        let seenStudents: string[] = JSON.parse(localStorage.getItem(SEEN_STUDENTS_KEY) || '[]');
        if (localStorage.getItem(SEEN_STUDENTS_KEY) === null) {
          seenStudents = users.map(u => u.id);
          localStorage.setItem(SEEN_STUDENTS_KEY, JSON.stringify(seenStudents));
        }
        const unseenStudents = users.filter(u => !seenStudents.includes(u.id));
        setNewStudentsCount(unseenStudents.length);
    }
  }, [users, studentPayments]);

  useEffect(() => {
    if (teachers) {
        let seenTeachers: string[] = JSON.parse(localStorage.getItem(SEEN_TEACHERS_KEY) || '[]');
        if (localStorage.getItem(SEEN_TEACHERS_KEY) === null) {
          seenTeachers = teachers.map(t => t.id);
          localStorage.setItem(SEEN_TEACHERS_KEY, JSON.stringify(seenTeachers));
        }
        const unseenTeachers = teachers.filter(t => !seenTeachers.includes(t.id));
        setNewTeachersCount(unseenTeachers.length);
    }
  }, [teachers]);

  const acknowledgeNewUsers = useCallback(() => {
    setNewUsersCount(0);
    localStorage.setItem(LAST_CHECKED_REGISTRATION_KEY, new Date().toISOString());
  }, []);

  const acknowledgeNewSubscriptions = useCallback(() => {
    setNewSubscriptionsCount(0);
    let subscriberIds: string[] = [];
    let paymentIds: string[] = [];
    if (users) {
      subscriberIds = users.filter(u => u.isSubscribed).map(u => u.id);
      localStorage.setItem(KNOWN_SUBSCRIBERS_KEY, JSON.stringify(subscriberIds));
    }
    if (studentPayments) {
      paymentIds = studentPayments.map(p => p.id);
      localStorage.setItem('admin_known_payment_ids', JSON.stringify(paymentIds));
    }
    if (user && auth.currentUser?.emailVerified) {
      api.syncUserSeenStates({ knownSubscriberIds: subscriberIds, knownPaymentIds: paymentIds });
    }
  }, [users, studentPayments, user]);

  const acknowledgeNewStudents = useCallback(() => {
    setNewStudentsCount(0);
    if (users) {
      const currentIds = users.map(u => u.id);
      localStorage.setItem(SEEN_STUDENTS_KEY, JSON.stringify(currentIds));
      if (user && auth.currentUser?.emailVerified) {
        api.syncUserSeenStates({ seenStudentUserIds: currentIds });
      }
    }
  }, [users, user]);

  const acknowledgeNewTeachers = useCallback(() => {
    setNewTeachersCount(0);
    if (teachers) {
      const currentIds = teachers.map(t => t.id);
      localStorage.setItem(SEEN_TEACHERS_KEY, JSON.stringify(currentIds));
      if (user && auth.currentUser?.emailVerified) {
        api.syncUserSeenStates({ seenTeacherUserIds: currentIds });
      }
    }
  }, [teachers, user]);

  const value = { 
      newUsersCount, 
      newSubscriptionsCount,
      newStudentsCount,
      newTeachersCount,
      acknowledgeNewStudents,
      acknowledgeNewTeachers,
      pendingTopicRequestsCount,
      topicRequests,
      isTopicRequestsLoading,
      isTopicRequestsError,
      refetchTopicRequests,
      pendingTutoringRequestsCount,
      tutoringRequests,
      isTutoringRequestsLoading: isTutoringLoading,
      isTutoringRequestsError: isTutoringError,
      refetchTutoringRequests,
      unreadConversationsCount,
      unreadGroupCount,
      conversations,
      groupConversations,
      isConversationsLoading,
      isConversationsError,
      refetchConversations,
      acknowledgeNewUsers, 
      acknowledgeNewSubscriptions,
      pendingTeacherPaymentsCount,
      pendingTeacherPayments,
      isTeacherPaymentsLoading,
      refetchTeacherPayments,
      expiringSubscriptionsCount,
      expiringSubscriptions,
  };

  return (
    <AdminNotificationContext.Provider value={value}>
      {children}
    </AdminNotificationContext.Provider>
  );
};