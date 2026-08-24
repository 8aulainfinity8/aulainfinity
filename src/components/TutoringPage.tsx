import React, { useContext, useMemo, useState } from 'react';
import { useForm, SubmitHandler } from 'react-hook-form';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown } from 'lucide-react';
import * as api from '../services/api';
import { AppConfigContext } from '../contexts/AppConfigContext';
import { AuthContext } from '../contexts/AuthContext';
import { NotificationContext } from '../contexts/NotificationContext';
import { ChevronLeftIcon, VideoCameraIcon, HistoryIcon, BookOpenIcon, ExternalLinkIcon, DownloadIcon, ClockIcon, CalendarIcon } from './icons';
import { SubscriptionGate } from './SubscriptionGate';
import type { StudentUser, CourseLevel } from '../types';
import { useBackNavigation } from '../hooks/useBackNavigation';
import { useI18n } from '../hooks/useI18n';
import { AdminTutoringRequestsPage } from './admin/AdminTutoringRequestsPage';
import { Link } from 'react-router-dom';
import { ROUTES } from '../constants/routes';
import { VoiceGroupCall } from './VoiceGroupCall';
import { parseTeacherSchedules } from '../utils/scheduleUtils';
import { isCancellableSession } from '../utils/tutoringHelpers';
import { ConfirmationModal } from './ConfirmationModal';
import { eventEmitter } from '../services/eventService';

interface IFormInput {
  subject: string;
  details: string;
  teacherId: string;
  date: string;
  time: string;
}

const CompactSlotHeader: React.FC<{
    subjects: string[];
    levels: { id: string; name: string }[];
    levelName: string;
    activeSubjectFilter: string;
    colorClasses: {
        border: string;
        bg: string;
        badge: string;
        text: string;
    };
}> = ({ subjects, levels, levelName, activeSubjectFilter, colorClasses }) => {
    const [isOpen, setIsOpen] = useState(false);

    const subjectList = useMemo(() => {
        if (Array.isArray(subjects) && subjects.length > 0) return subjects;
        return ['Tutoría General'];
    }, [subjects]);

    const primarySubject = useMemo(() => {
        if (activeSubjectFilter !== 'all') {
            const matched = subjectList.find(s => s.toLowerCase() === activeSubjectFilter.toLowerCase());
            if (matched) return matched;
        }
        return subjectList[0];
    }, [subjectList, activeSubjectFilter]);

    const otherSubjectsCount = subjectList.length - 1;

    const formattedLevels = useMemo(() => {
        if (!levels || levels.length === 0) return levelName;
        if (levels.length <= 2) return levels.map(l => l.name).join(', ');

        const names = levels.map(l => l.name);
        const hasEso = names.some(n => /e\.?s\.?o\.?/i.test(n));
        const hasBach = names.some(n => /bach/i.test(n));
        const hasEbau = names.some(n => /ebau|evau/i.test(n));

        const groups = [];
        if (hasEso) groups.push('E.S.O.');
        if (hasBach) groups.push('Bachillerato');
        if (hasEbau) groups.push('EBAU');

        if (groups.length > 0) return groups.join(' · ');
        return `${levels[0].name} (+${levels.length - 1})`;
    }, [levels, levelName]);

    return (
        <div className="flex items-center gap-1.5 flex-wrap">
            <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-md tracking-wider shadow-2xs ${colorClasses.badge}`}>
                {primarySubject}
            </span>

            {otherSubjectsCount > 0 && (
                <div className="relative inline-block" onClick={(e) => e.stopPropagation()}>
                    <button
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation();
                            setIsOpen(!isOpen);
                        }}
                        className="text-[10px] font-extrabold px-2 py-0.5 rounded-md bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-500/20 active:scale-95 transition-all flex items-center gap-1 cursor-pointer border border-indigo-500/20"
                        title="Ver todas las asignaturas disponibles en este horario"
                    >
                        <span>+{otherSubjectsCount} asignaturas</span>
                        <ChevronDown className={`w-3 h-3 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
                    </button>

                    {isOpen && (
                        <>
                            <div 
                                className="fixed inset-0 z-30" 
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setIsOpen(false);
                                }} 
                            />
                            <div className="absolute left-0 top-full mt-1.5 z-40 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 shadow-xl min-w-[210px] max-w-[280px] animate-in fade-in zoom-in-95 duration-150">
                                <p className="text-[10px] font-extrabold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2 px-1 flex items-center justify-between">
                                    <span>Asignaturas impartidas:</span>
                                    <span className="text-[9px] bg-slate-100 dark:bg-slate-700 px-1.5 py-0.2 rounded font-mono">{subjectList.length} en total</span>
                                </p>
                                <div className="flex flex-wrap gap-1 max-h-40 overflow-y-auto pr-1">
                                    {subjectList.map((s) => (
                                        <span
                                            key={s}
                                            className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                                                s === primarySubject
                                                    ? `${colorClasses.badge} ring-1 ring-indigo-400/40 font-extrabold`
                                                    : 'bg-slate-100 dark:bg-slate-700/80 text-slate-700 dark:text-slate-300'
                                            }`}
                                        >
                                            {s}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        </>
                    )}
                </div>
            )}

            <span 
                className="text-[10px] font-bold text-slate-500 dark:text-slate-400 bg-white/80 dark:bg-slate-800/80 px-2 py-0.5 rounded-md border border-slate-200/60 dark:border-slate-700/60 truncate max-w-[170px]"
                title={levelName}
            >
                {formattedLevels}
            </span>
        </div>
    );
};

export const TutoringPage: React.FC = () => {
    const { t } = useI18n();
    const { user } = useContext(AuthContext);
    const queryClient = useQueryClient();
    
    React.useEffect(() => {
        if (user && user.role === 'student') {
            api.markTutoringRequestsAsSeen('student', user.id);
            queryClient.invalidateQueries({ queryKey: ['tutoringRequests'] });
        }
    }, [user, queryClient]);

    if (user?.role === 'teacher' || user?.role === 'admin') {
        return <AdminTutoringRequestsPage />;
    }

    const studentUser = user?.role === 'student' ? user as StudentUser : null;

    const { appConfig } = useContext(AppConfigContext);
    const { addToast } = useContext(NotificationContext);
    const handleBack = useBackNavigation();

    // Filters for Agenda
    const [levelFilter, setLevelFilter] = useState<string>('all');
    const [subjectFilter, setSubjectFilter] = useState<string>('all');
    const [teacherFilter, setTeacherFilter] = useState<string>('all');
    const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
    const [bottomTab, setBottomTab] = useState<'active' | 'history'>('active');
    const [historySearch, setHistorySearch] = useState<string>('');
    const [ratingSessionId, setRatingSessionId] = useState<string | null>(null);
    const [ratingValue, setRatingValue] = useState<number>(5);
    const [ratingFeedback, setRatingFeedback] = useState<string>('');
    const [activeVoiceCallId, setActiveVoiceCallId] = useState<string | null>(null);
    const [cancelModalSession, setCancelModalSession] = useState<{ id: string; date?: string; time?: string; subject?: string } | null>(null);
    const [pendingSlotToConfirm, setPendingSlotToConfirm] = useState<any | null>(null);
    const [pendingFormToConfirm, setPendingFormToConfirm] = useState<IFormInput | null>(null);

    const { register, handleSubmit, formState: { errors, isSubmitting }, reset, setValue, watch } = useForm<IFormInput>({
        defaultValues: {
            date: new Date().toISOString().split('T')[0],
            time: '12:00',
            teacherId: 'first_available',
            subject: '',
            details: ''
        }
    });
    
    const { data: schedule, isLoading: isScheduleLoading } = useQuery({
      queryKey: ['tutoringSchedule'],
      queryFn: async () => {
          const config = await api.fetchAppConfig();
          return config.tutoringSchedule;
      },
      initialData: appConfig?.tutoringSchedule,
    });

    const { data: courses } = useQuery<CourseLevel[]>({ queryKey: ['courses'], queryFn: api.fetchCourses });
    const { data: teachers = [] } = useQuery({ queryKey: ['teachers'], queryFn: api.fetchTeachers });
    const { data: tutoringRequests, isLoading: isRequestsLoading } = useQuery({
        queryKey: ['tutoringRequests'],
        queryFn: api.fetchTutoringRequests
    });

    const enrolledCourseSubjects = useMemo(() => {
        if (!user || user.role !== 'student' || !courses) return [];
        const student = user as StudentUser;
        const coursesForStudent = courses.filter(c => student.enrolledCourseIds && student.enrolledCourseIds.includes(c.id));
        return coursesForStudent.flatMap(c => c.subjects || []);
    }, [user, courses]);

    const handleCancelReservation = (requestId: string, dateStr?: string, timeStr?: string, subject?: string) => {
        const { cancellable, hoursRemaining } = isCancellableSession(dateStr, timeStr);
        if (!cancellable) {
            addToast(`No es posible anular la tutoría. Faltan ${Math.max(0, hoursRemaining).toFixed(1)}h para la clase (mínimo permitido: 24 horas).`, 'error');
            return;
        }
        setCancelModalSession({ id: requestId, date: dateStr, time: timeStr, subject });
    };

    // Generate availability slots dynamically based on teachers' actual schedules, subjects and levels
    const availabilitySlots = useMemo(() => {
        if (!courses) return [];
        const slots: any[] = [];
        const today = new Date();
        
        // Active teachers list (or fallback defaults if teachers array is empty)
        const activeTeachers = (teachers && teachers.length > 0) ? teachers : [
            { id: 'teacher1', name: 'Carlos Vega', category: 'Física y Química', subjects: ['Física y Química'], levels: ['2º E.S.O.', '1º Bachillerato'], schedules: ['Lunes: 11:00, 16:30', 'Miércoles: 10:00, 17:00', 'Viernes: 16:00'] },
            { id: 'teacher2', name: 'Marta Robles', category: 'Matemáticas', subjects: ['Matemáticas'], levels: ['1º E.S.O.', '2º E.S.O.'], schedules: ['Martes: 10:00, 17:00', 'Jueves: 12:00, 16:00'] },
            { id: 'teacher3', name: 'Ana Gómez', category: 'Biología y Geología', subjects: ['Biología y Geología'], levels: ['1º E.S.O.', '3º E.S.O.'], schedules: ['Lunes: 09:30', 'Miércoles: 11:30', 'Viernes: 15:30'] }
        ];

        const dayNames = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

        // Generate availability slots for the next 14 calendar days
        for (let dayOffset = 1; dayOffset <= 14; dayOffset++) {
            const currentDay = new Date(today);
            currentDay.setDate(today.getDate() + dayOffset);
            const dayOfWeek = currentDay.getDay();
            if (dayOfWeek === 0 || dayOfWeek === 6) continue; // Skip weekends

            const dateStr = currentDay.toISOString().split('T')[0];
            const dayName = dayNames[dayOfWeek];

            activeTeachers.forEach((teacher: any) => {
                // Parse exact teacher schedules
                const scheduleMap = parseTeacherSchedules(teacher.schedules);
                const teacherTimes = scheduleMap[dayOfWeek] || [];
                if (teacherTimes.length === 0) return; // Teacher has no free slots for this day

                // Determine teacher subjects
                const teacherSubjects: string[] = (teacher.subjects && teacher.subjects.length > 0)
                    ? teacher.subjects
                    : [teacher.category || 'Tutoría General'];

                // Determine teacher levels and IDs
                let teacherLevels: { id: string; name: string }[] = [];
                if (teacher.levels && teacher.levels.length > 0) {
                    teacherLevels = teacher.levels.map((lvl: string) => {
                        const matchedCourse = courses.find(c => c.name.toLowerCase() === lvl.toLowerCase() || c.id === lvl);
                        return {
                            id: matchedCourse ? matchedCourse.id : lvl.toLowerCase().replace(/\s+/g, '_'),
                            name: matchedCourse ? matchedCourse.name : lvl
                        };
                    });
                } else if (teacher.taughtCourseIds && teacher.taughtCourseIds.length > 0) {
                    teacherLevels = courses
                        .filter(c => teacher.taughtCourseIds.includes(c.id))
                        .map(c => ({ id: c.id, name: c.name }));
                }

                if (teacherLevels.length === 0) {
                    teacherLevels = courses.slice(0, 2).map(c => ({ id: c.id, name: c.name }));
                    if (teacherLevels.length === 0) {
                        teacherLevels = [
                            { id: 'eso_1', name: '1º E.S.O.' },
                            { id: 'eso_2', name: '2º E.S.O.' }
                        ];
                    }
                }

                const levelNamesStr = teacherLevels.map(l => l.name).join(', ');

                // Create ONE single slot entry per teacher per date per assignedTime (No duplicates per subject/level!)
                teacherTimes.forEach((assignedTime: string) => {
                    slots.push({
                        id: `slot-${teacher.id}-${dateStr}-${assignedTime.replace(':', '')}`,
                        teacherId: teacher.id,
                        teacherName: teacher.name,
                        subjects: teacherSubjects,
                        subject: teacherSubjects[0] || 'Tutoría General',
                        levels: teacherLevels,
                        levelName: levelNamesStr,
                        date: dateStr,
                        dayName,
                        time: assignedTime
                    });
                });
            });
        }

        return slots;
    }, [teachers, courses]);

    // Filtered slots for agenda display
    const filteredSlots = useMemo(() => {
        return availabilitySlots.filter(slot => {
            const slotLevels = Array.isArray(slot.levels) ? slot.levels : [];
            const slotSubjects = Array.isArray(slot.subjects) ? slot.subjects : (slot.subject ? [slot.subject] : []);
            
            const matchesLevel = levelFilter === 'all' || slotLevels.some((l: any) => l.id === levelFilter || l.name === levelFilter || (l.id && l.id.toLowerCase() === levelFilter.toLowerCase()));
            const matchesSubject = subjectFilter === 'all' || slotSubjects.some((s: string) => s.toLowerCase() === subjectFilter.toLowerCase());
            const matchesTeacher = teacherFilter === 'all' || slot.teacherId === teacherFilter;
            return matchesLevel && matchesSubject && matchesTeacher;
        });
    }, [availabilitySlots, levelFilter, subjectFilter, teacherFilter]);

    // Unique subjects from availability slots for selector
    const availableSubjects = useMemo(() => {
        const set = new Set<string>();
        availabilitySlots.forEach(s => {
            if (Array.isArray(s.subjects)) {
                s.subjects.forEach((sub: string) => set.add(sub));
            } else if (s.subject) {
                set.add(s.subject);
            }
        });
        return Array.from(set);
    }, [availabilitySlots]);

    // Distinct days in the availability data
    const distinctDays = useMemo(() => {
        const daysMap = new Map<string, { date: string; dayName: string }>();
        filteredSlots.forEach(s => {
            daysMap.set(s.date, { date: s.date, dayName: s.dayName });
        });
        return Array.from(daysMap.values()).sort((a, b) => a.date.localeCompare(b.date));
    }, [filteredSlots]);

    // My sessions from tutoring requests list
    const mySessions = useMemo(() => {
        if (!tutoringRequests || !user) return [];
        return tutoringRequests.filter(req => req.studentId === user.id)
            .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    }, [tutoringRequests, user]);

    const activeSessions = useMemo(() => {
        return mySessions.filter(req => req.status !== 'completed');
    }, [mySessions]);

    const pastSessions = useMemo(() => {
        let list = mySessions.filter(req => req.status === 'completed');
        if (historySearch.trim()) {
            const query = historySearch.toLowerCase();
            list = list.filter(req => 
                req.subject.toLowerCase().includes(query) || 
                (req.teacherName && req.teacherName.toLowerCase().includes(query)) ||
                (req.sessionSummary && req.sessionSummary.toLowerCase().includes(query)) ||
                (req.details && req.details.toLowerCase().includes(query))
            );
        }
        return list;
    }, [mySessions, historySearch]);

    const handleRateSession = async (requestId: string) => {
        if (!ratingValue) return;
        try {
            await api.rateTutoringRequest(requestId, ratingValue, ratingFeedback);
            addToast('¡Muchas gracias por tu valoración!', 'success');
            queryClient.invalidateQueries({ queryKey: ['tutoringRequests'] });
            setRatingSessionId(null);
            setRatingFeedback('');
            setRatingValue(5);
        } catch (error) {
            addToast('Error al registrar la valoración.', 'error');
        }
    };

    const executeDirectSlotConfirm = async (slot: any) => {
        if (!user || user.role !== 'student') return;
        const studentUser = user as StudentUser;
        if ((studentUser.creditsBalance ?? 0) <= 0) {
            addToast('No tienes saldo suficiente de Infinitys para reservar esta tutoría.', 'error');
            return;
        }

        let chosenSubject = slot.subject || 'Tutoría General';
        const slotSubjects = Array.isArray(slot.subjects) ? slot.subjects : (slot.subject ? [slot.subject] : []);
        if (subjectFilter !== 'all' && slotSubjects.some((s: string) => s.toLowerCase() === subjectFilter.toLowerCase())) {
            chosenSubject = subjectFilter;
        } else if (slotSubjects.length > 0) {
            const matchingSubject = enrolledCourseSubjects.find(ens => 
                slotSubjects.some((ts: string) => ts.toLowerCase() === ens.name.toLowerCase())
            );
            if (matchingSubject) {
                chosenSubject = matchingSubject.name;
            } else if (slotSubjects[0]) {
                chosenSubject = slotSubjects[0];
            }
        }

        try {
            const selectedTeacher = teachers.find(t => t.id === slot.teacherId);
            const teacherName = selectedTeacher ? selectedTeacher.name : (slot.teacherName || 'Docente Asignado');

            await api.submitTutoringRequest({
                studentId: user.id,
                studentName: user.name || 'Alumno',
                subject: chosenSubject,
                details: `Tutoría reservada para ${chosenSubject}`,
                teacherId: slot.teacherId,
                teacherName,
                date: slot.date,
                time: slot.time,
                seenByTeacher: false,
                seenByAdmin: false
            });

            addToast(`¡Reserva realizada con éxito para el ${slot.date} a las ${slot.time} con ${teacherName}! Se ha descontado 1 Infinity de tu saldo.`, 'success');
            queryClient.invalidateQueries({ queryKey: ['tutoringRequests'] });
            queryClient.invalidateQueries({ queryKey: [['tutoringRequests']] });
            eventEmitter.emit('tutoring-requests-updated');
            eventEmitter.emit('tutoring-update');
            setSelectedSlotId(null);
            setPendingSlotToConfirm(null);
        } catch (error) {
            console.error('Error confirming tutoring reservation:', error);
            addToast('Error al confirmar la reserva. Inténtalo de nuevo.', 'error');
        }
    };

    const handleDirectSlotConfirm = (slot: any) => {
        if (!user || user.role !== 'student') return;
        const studentUser = user as StudentUser;
        if ((studentUser.creditsBalance ?? 0) <= 0) {
            addToast('No tienes saldo suficiente de Infinitys para reservar esta tutoría.', 'error');
            return;
        }

        const { hoursRemaining } = isCancellableSession(slot.date, slot.time);
        if (hoursRemaining < 24) {
            setPendingSlotToConfirm(slot);
        } else {
            executeDirectSlotConfirm(slot);
        }
    };

    const handleSelectSlot = (slot: any) => {
        setSelectedSlotId(slot.id);
        setValue('date', slot.date);
        setValue('time', slot.time);
        setValue('teacherId', slot.teacherId);
        
        // Choose best matching subject to prefill
        let chosenSubject = slot.subject || 'Tutoría General';
        const slotSubjects = Array.isArray(slot.subjects) ? slot.subjects : (slot.subject ? [slot.subject] : []);
        if (subjectFilter !== 'all' && slotSubjects.some((s: string) => s.toLowerCase() === subjectFilter.toLowerCase())) {
            chosenSubject = subjectFilter;
        } else if (slotSubjects.length > 0) {
            const matchingSubject = enrolledCourseSubjects.find(ens => 
                slotSubjects.some((ts: string) => ts.toLowerCase() === ens.name.toLowerCase())
            );
            if (matchingSubject) {
                chosenSubject = matchingSubject.name;
            } else if (slotSubjects[0]) {
                chosenSubject = slotSubjects[0];
            }
        }
        
        setValue('subject', chosenSubject);
        setValue('details', `Tutoría de repaso y resolución de dudas de ${chosenSubject}`);
    };

    const executeFormSubmit = async (data: IFormInput) => {
        if (!user || user.role !== 'student') return;

        try {
            const selectedTeacher = teachers.find(t => t.id === data.teacherId);
            const teacherName = selectedTeacher ? selectedTeacher.name : (data.teacherId === 'first_available' ? 'Primer profesor disponible' : 'Docente Asignado');
            
            await api.submitTutoringRequest({
                studentId: user.id,
                studentName: user.name || 'Alumno',
                subject: data.subject,
                details: data.details || `Tutoría de repaso y resolución de dudas de ${data.subject}`,
                teacherId: data.teacherId,
                teacherName,
                date: data.date,
                time: data.time,
                seenByTeacher: false,
                seenByAdmin: false
            });

            addToast(`¡Solicitud de tutoría enviada con éxito! Se ha descontado 1 Infinity de tu saldo. Se ha notificado al profesor ${teacherName} y a administración para su visto bueno.`, 'success');
            queryClient.invalidateQueries({ queryKey: ['tutoringRequests'] });
            queryClient.invalidateQueries({ queryKey: [['tutoringRequests']] });
            eventEmitter.emit('tutoring-requests-updated');
            eventEmitter.emit('tutoring-update');
            setSelectedSlotId(null);
            setPendingFormToConfirm(null);
            reset({
                subject: '',
                details: '',
                teacherId: 'first_available',
                date: new Date().toISOString().split('T')[0],
                time: '12:00'
            });
        } catch (error) {
            addToast('Error al enviar la solicitud. Inténtalo de nuevo.', 'error');
        }
    };

    const onSubmit: SubmitHandler<IFormInput> = (data) => {
        if (!user || user.role !== 'student') return;
        const { hoursRemaining } = isCancellableSession(data.date, data.time);
        if (hoursRemaining < 24) {
            setPendingFormToConfirm(data);
        } else {
            executeFormSubmit(data);
        }
    };

    return (
        <SubscriptionGate>
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 animate-slide-in-up">
                {/* Back Button */}
                <button 
                    onClick={handleBack} 
                    aria-label="Volver al panel principal" 
                    className="flex items-center mb-6 px-4 py-2 bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-600 text-slate-900 dark:text-slate-100 font-semibold rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors duration-200"
                >
                    <ChevronLeftIcon className="w-5 h-5 mr-2" />Volver
                </button>

                {/* Header */}
                <div className="text-center mb-8">
                    <VideoCameraIcon className="w-16 h-16 text-primary mx-auto"/>
                    <h1 className="text-4xl font-extrabold text-slate-900 dark:text-slate-50 mt-4 tracking-tight">{t('tutoring.title')}</h1>
                    <p className="text-lg text-slate-600 dark:text-slate-400 mt-2 max-w-2xl mx-auto">
                        {t('tutoring.subtitle')}
                    </p>

                    {/* Credits Balance Display Widget */}
                    {studentUser && (
                        <div className="mt-6 inline-flex flex-col sm:flex-row items-center gap-4 bg-indigo-50 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/40 p-4 px-6 rounded-2xl shadow-sm">
                            <div className="flex items-center gap-2.5">
                                <span className="text-2xl select-none">🪙</span>
                                <div className="text-left">
                                    <span className="block text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest font-mono">Tu Saldo de Infinitys</span>
                                    <span className="text-base font-extrabold text-indigo-700 dark:text-indigo-400">
                                        {studentUser.creditsBalance ?? 0} {studentUser.creditsBalance === 1 ? 'Infinity' : 'Infinitys'} de clase
                                    </span>
                                </div>
                            </div>
                            <div className="sm:border-l border-slate-200 dark:border-slate-800 sm:pl-4">
                                <Link
                                    to={`${ROUTES.PAYMENT}?type=credits`}
                                    className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs rounded-xl shadow-sm transition-colors cursor-pointer select-none"
                                >
                                    Adquirir Infinitys 🪙
                                </Link>
                            </div>
                        </div>
                    )}
                </div>

                {/* Main Interactive Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                    
                    {/* Left Column: Availability Agenda (8 cols) */}
                    <div className="lg:col-span-8 bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-xl border border-slate-100 dark:border-slate-700">
                        
                        {/* Title and Agenda Filters */}
                        <div className="border-b dark:border-slate-700 pb-5 mb-5">
                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                                <div>
                                    <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-50 flex items-center gap-2">
                                        📅 Agenda de Disponibilidad
                                    </h2>
                                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                                        Filtra por profesor, asignatura o nivel para ver las horas disponibles.
                                    </p>
                                </div>
                            </div>

                            {/* Filters Bar */}
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
                                {/* Level Filter */}
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Nivel / Curso</label>
                                    <select
                                        value={levelFilter}
                                        onChange={(e) => { setLevelFilter(e.target.value); setSelectedSlotId(null); }}
                                        className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-slate-900 dark:text-slate-100 text-sm cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary"
                                    >
                                        <option value="all">📚 Todos los niveles</option>
                                        {courses?.map(course => (
                                            <option key={course.id} value={course.id}>{course.name}</option>
                                        ))}
                                    </select>
                                </div>

                                {/* Subject Filter */}
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Asignatura</label>
                                    <select
                                        value={subjectFilter}
                                        onChange={(e) => { setSubjectFilter(e.target.value); setSelectedSlotId(null); }}
                                        className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-slate-900 dark:text-slate-100 text-sm cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary"
                                    >
                                        <option value="all">📝 Todas las asignaturas</option>
                                        {availableSubjects.map(sub => (
                                            <option key={sub} value={sub}>{sub}</option>
                                        ))}
                                    </select>
                                </div>

                                {/* Teacher Filter */}
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Profesor / Tutor</label>
                                    <select
                                        value={teacherFilter}
                                        onChange={(e) => { setTeacherFilter(e.target.value); setSelectedSlotId(null); }}
                                        className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-slate-900 dark:text-slate-100 text-sm cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary"
                                    >
                                        <option value="all">👥 Todos los profesores</option>
                                        {teachers.map((teacher: any) => (
                                            <option key={teacher.id} value={teacher.id}>{teacher.name}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        </div>

                        {/* Interactive Weekly agenda layout */}
                        <div className="space-y-8">
                            {distinctDays.map(day => {
                                const daySlots = filteredSlots.filter(s => s.date === day.date);
                                
                                return (
                                    <div key={day.date} className="border-b border-slate-100 dark:border-slate-700/60 last:border-0 pb-6 last:pb-0">
                                        {/* iOS Style Day Header */}
                                        <div className="flex items-center gap-3 mb-4 sticky top-0 bg-white dark:bg-slate-800 py-2 z-10">
                                            <div className="flex items-center justify-center w-10 h-10 rounded-full bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900/20 text-indigo-600 dark:text-indigo-400 flex-shrink-0 shadow-sm">
                                                <span className="text-sm font-black tracking-tight leading-none">
                                                    {new Date(day.date).getDate()}
                                                </span>
                                            </div>
                                            <div>
                                                <h3 className="text-sm font-black text-slate-900 dark:text-slate-50 capitalize">
                                                    {day.dayName}, {new Date(day.date).toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })}
                                                </h3>
                                                <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest font-mono">
                                                    Horas de Tutoría Disponibles
                                                </p>
                                            </div>
                                        </div>

                                        {daySlots.length > 0 ? (
                                            <div className="space-y-3.5 pl-2">
                                                {daySlots.map((slot, sIdx) => {
                                                    const isSelected = selectedSlotId === slot.id;
                                                    
                                                    // Determine a nice pastel color theme for each subject
                                                    let colorClasses = {
                                                        border: 'border-l-[4px] border-l-indigo-500',
                                                        bg: 'bg-indigo-500/5 hover:bg-indigo-500/10',
                                                        badge: 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-300',
                                                        text: 'text-indigo-600 dark:text-indigo-400'
                                                    };
                                                    if (slot.subject.includes('Matemáticas')) {
                                                        colorClasses = {
                                                            border: 'border-l-[4px] border-l-sky-500',
                                                            bg: 'bg-sky-500/5 hover:bg-sky-500/10',
                                                            badge: 'bg-sky-500/10 text-sky-700 dark:text-sky-300',
                                                            text: 'text-sky-600 dark:text-sky-400'
                                                        };
                                                    } else if (slot.subject.includes('Física') || slot.subject.includes('Química')) {
                                                        colorClasses = {
                                                            border: 'border-l-[4px] border-l-violet-500',
                                                            bg: 'bg-violet-500/5 hover:bg-violet-500/10',
                                                            badge: 'bg-violet-500/10 text-violet-700 dark:text-violet-300',
                                                            text: 'text-violet-600 dark:text-violet-400'
                                                        };
                                                    } else if (slot.subject.includes('Biología') || slot.subject.includes('Geología')) {
                                                        colorClasses = {
                                                            border: 'border-l-[4px] border-l-emerald-500',
                                                            bg: 'bg-emerald-500/5 hover:bg-emerald-500/10',
                                                            badge: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
                                                            text: 'text-emerald-600 dark:text-emerald-400'
                                                        };
                                                    }

                                                    // Calculate end hour for representation (usually +1 hr)
                                                    let endHour = '12:00';
                                                    if (slot.time) {
                                                        const [h, m] = slot.time.split(':');
                                                        const eh = (parseInt(h) + 1).toString().padStart(2, '0');
                                                        endHour = `${eh}:${m}`;
                                                    }

                                                    return (
                                                        <div key={slot.id} className="flex items-stretch group relative min-w-0 max-w-full">
                                                            {/* Hour label column */}
                                                            <div className="w-11 sm:w-14 flex-shrink-0 text-left pt-2.5 pr-1 sm:pr-2.5">
                                                                <span className="block text-[11px] sm:text-xs font-black text-slate-800 dark:text-slate-200 font-mono">
                                                                    {slot.time}
                                                                </span>
                                                                <span className="block text-[9px] sm:text-[9.5px] font-bold text-slate-400 dark:text-slate-500 leading-none mt-0.5 font-mono">
                                                                    {endHour}
                                                                </span>
                                                            </div>

                                                            {/* Timeline vertical dot and line separator */}
                                                            <div className="w-3 sm:w-4 flex-shrink-0 flex flex-col items-center relative">
                                                                <div className="w-2.5 h-2.5 rounded-full bg-slate-200 dark:bg-slate-700 border-2 border-white dark:border-slate-800 z-10 group-hover:border-indigo-400 dark:group-hover:border-indigo-500 transition-colors mt-3.5" />
                                                                {sIdx < daySlots.length - 1 && (
                                                                    <div className="w-[1.5px] bg-slate-100 dark:bg-slate-700/60 flex-grow my-1" />
                                                                )}
                                                            </div>

                                                            {/* iOS Calendar Style Card */}
                                                            <div
                                                                role="button"
                                                                tabIndex={0}
                                                                onClick={() => handleSelectSlot(slot)}
                                                                onKeyDown={(e) => {
                                                                    if (e.key === 'Enter' || e.key === ' ') {
                                                                        e.preventDefault();
                                                                        handleSelectSlot(slot);
                                                                    }
                                                                }}
                                                                className={`flex-1 min-w-0 text-left p-3 sm:p-3.5 pl-3 sm:pl-4 rounded-xl transition-all duration-300 flex flex-col justify-between gap-2 select-none cursor-pointer border border-transparent max-w-full overflow-hidden ${colorClasses.border} ${
                                                                    isSelected 
                                                                        ? 'bg-indigo-50/70 dark:bg-slate-750/80 border-indigo-200 dark:border-slate-600 shadow-md ring-2 ring-indigo-500/20 scale-[1.01]' 
                                                                        : `${colorClasses.bg} border-slate-50 dark:border-slate-800/20 hover:shadow-sm`
                                                                }`}
                                                            >
                                                                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 w-full min-w-0">
                                                                    <div className="min-w-0 flex-1 w-full">
                                                                        <CompactSlotHeader
                                                                            subjects={slot.subjects || [slot.subject]}
                                                                            levels={slot.levels || []}
                                                                            levelName={slot.levelName || ''}
                                                                            activeSubjectFilter={subjectFilter}
                                                                            colorClasses={colorClasses}
                                                                        />
                                                                        <h4 className="text-sm font-extrabold text-slate-900 dark:text-slate-50 mt-1.5 leading-snug truncate">
                                                                            Sesión de Tutoría
                                                                        </h4>
                                                                        <p className="text-xs font-semibold text-slate-600 dark:text-slate-350 mt-0.5 flex items-center gap-1 truncate">
                                                                            <span className="opacity-85">👨‍🏫</span> {slot.teacherName}
                                                                        </p>
                                                                    </div>

                                                                    <div className="flex-shrink-0 flex items-center gap-2 self-start sm:self-center">
                                                                        {(() => {
                                                                            const userBooking = mySessions.find(req => 
                                                                                req.status !== 'completed' && 
                                                                                req.date === slot.date && 
                                                                                req.time === slot.time &&
                                                                                (req.teacherId === slot.teacherId || req.teacherId === 'first_available' || (req.subject && slot.subject && req.subject.toLowerCase() === slot.subject.toLowerCase()) || (slot.subjects && slot.subjects.some((s: string) => req.subject && s.toLowerCase() === req.subject.toLowerCase())))
                                                                            );
                                                                            const { cancellable } = isCancellableSession(slot.date, slot.time);

                                                                            if (userBooking) {
                                                                                if (cancellable) {
                                                                                    return (
                                                                                        <button
                                                                                            type="button"
                                                                                            onClick={(e) => {
                                                                                                e.stopPropagation();
                                                                                                handleCancelReservation(userBooking.id, slot.date, slot.time);
                                                                                            }}
                                                                                            className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-extrabold rounded-lg shadow-xs transition-colors flex items-center gap-1 cursor-pointer z-20 whitespace-nowrap"
                                                                                            title="Anular tu reserva de tutoría (Reembolsa 1 Infinity)"
                                                                                        >
                                                                                            <span>❌</span> Anular
                                                                                        </button>
                                                                                    );
                                                                                } else {
                                                                                    return (
                                                                                        <button
                                                                                            type="button"
                                                                                            onClick={(e) => {
                                                                                                e.stopPropagation();
                                                                                                addToast('No es posible anular la reserva a menos de 24 horas de la tutoría.', 'error');
                                                                                            }}
                                                                                            className="px-2.5 py-1.5 bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-[10.5px] sm:text-[11px] font-extrabold rounded-lg cursor-not-allowed flex items-center gap-1 opacity-85 z-20 whitespace-nowrap max-w-full"
                                                                                            title="No se puede anular a menos de 24 horas de la tutoría"
                                                                                        >
                                                                                            <span>🔒</span> No anulable (&lt;24h)
                                                                                        </button>
                                                                                    );
                                                                                }
                                                                            }

                                                                            if (!isSelected) {
                                                                                return (
                                                                                    <span className="text-[11px] font-extrabold text-slate-400 dark:text-slate-500 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors whitespace-nowrap">
                                                                                        Reservar ➔
                                                                                    </span>
                                                                                );
                                                                            }

                                                                            return null;
                                                                        })()}
                                                                    </div>
                                                                </div>

                                                                {isSelected && !mySessions.some(req => 
                                                                    req.status !== 'completed' && 
                                                                    req.date === slot.date && 
                                                                    req.time === slot.time &&
                                                                    (req.teacherId === slot.teacherId || req.teacherId === 'first_available' || (req.subject && slot.subject && req.subject.toLowerCase() === slot.subject.toLowerCase()) || (slot.subjects && slot.subjects.some((s: string) => req.subject && s.toLowerCase() === req.subject.toLowerCase())))
                                                                ) && (() => {
                                                                    const { hoursRemaining } = isCancellableSession(slot.date, slot.time);
                                                                    const isLessThan24h = hoursRemaining < 24;

                                                                    return (
                                                                        <div className="w-full mt-2 pt-2 border-t border-indigo-100/80 dark:border-slate-700/60 flex flex-col gap-2.5 min-w-0">
                                                                            {isLessThan24h && (
                                                                                <div className="w-full p-2.5 sm:p-3 bg-amber-500/15 border-2 border-amber-500/40 rounded-xl text-left text-xs text-amber-950 dark:text-amber-100 space-y-1 animate-fadeIn box-border max-w-full overflow-hidden">
                                                                                    <p className="font-extrabold text-amber-800 dark:text-amber-300 flex items-center gap-1.5 text-[11px] sm:text-[12px] flex-wrap leading-tight">
                                                                                        <span>⚠️</span> Tutoría a menos de 24 horas
                                                                                    </p>
                                                                                    <p className="text-[10px] sm:text-[11px] leading-snug break-words">
                                                                                        Esta tutoría está programada para dentro de menos de 24 horas de la fecha actual.
                                                                                    </p>
                                                                                    <p className="text-[10px] sm:text-[11px] font-bold text-amber-950 dark:text-amber-100 leading-snug break-words">
                                                                                        Si confirmas la reserva, <u>no se podrá anular</u> por ser a menos de 24h y los Infinitys se cobrarán sin opción de devolución.
                                                                                    </p>
                                                                                </div>
                                                                            )}
                                                                            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2 w-full">
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={(e) => {
                                                                                        e.stopPropagation();
                                                                                        handleDirectSlotConfirm(slot);
                                                                                    }}
                                                                                    className={`w-full sm:w-auto px-4 py-2.5 text-white text-[11px] font-black rounded-xl shadow-md transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                                                                                        isLessThan24h 
                                                                                            ? 'bg-amber-600 hover:bg-amber-700' 
                                                                                            : 'bg-indigo-600 hover:bg-indigo-700 animate-pulse'
                                                                                    }`}
                                                                                >
                                                                                    <span>🚀</span> Confirmar Reserva {isLessThan24h ? '(<24h)' : ''}
                                                                                </button>
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={(e) => {
                                                                                        e.stopPropagation();
                                                                                        setSelectedSlotId(null);
                                                                                    }}
                                                                                    className="w-full sm:w-auto px-3.5 py-2.5 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700/80 bg-slate-100 dark:bg-slate-800 text-[11px] font-extrabold rounded-xl transition-all flex items-center justify-center gap-1 cursor-pointer border border-slate-200 dark:border-slate-700"
                                                                                >
                                                                                    <span>✕</span> Cancelar
                                                                                </button>
                                                                            </div>
                                                                        </div>
                                                                    );
                                                                })()}
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        ) : (
                                            <p className="text-xs text-slate-400 dark:text-slate-500 italic py-1 pl-12">
                                                No hay horarios disponibles que coincidan con tus filtros para este día.
                                            </p>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Right Column: Request Form (4 cols) */}
                    <div className="lg:col-span-4 space-y-6">
                        
                        {/* Selected Slot Details Card / Instructions */}
                        <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-xl border border-slate-100 dark:border-slate-700">
                            <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
                                <h2 className="text-xl font-bold text-slate-900 dark:text-slate-50 flex items-center gap-2">
                                    📝 Solicitar Tutoría
                                </h2>
                                <span className="px-2.5 py-1 text-xs font-black rounded-full bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-900/40">
                                    {appConfig?.tutoringPrice !== undefined ? `${appConfig.tutoringPrice}€ / sesión` : '12.50€ / sesión'}
                                </span>
                            </div>
                            
                            {selectedSlotId ? (
                                <div className="p-3.5 bg-green-500/10 border border-green-500/30 rounded-xl mb-4">
                                    <p className="text-xs font-black text-green-700 dark:text-green-400 uppercase tracking-wider">
                                        ¡Horario Reservado de la Agenda!
                                    </p>
                                    <p className="text-sm text-slate-800 dark:text-slate-200 mt-1">
                                        Vas a solicitar una tutoría con el profesor disponible. Completa el formulario de abajo.
                                    </p>
                                </div>
                            ) : (
                                <div className="p-3.5 bg-amber-500/10 border border-amber-500/30 rounded-xl mb-4">
                                    <p className="text-xs font-black text-amber-700 dark:text-amber-400 uppercase tracking-wider">
                                        Selección Recomendada
                                    </p>
                                    <p className="text-sm text-slate-800 dark:text-slate-200 mt-1">
                                        Haz clic en cualquiera de las horas disponibles de la agenda para rellenar los detalles automáticamente.
                                    </p>
                                </div>
                            )}

                            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                                {/* Subject Input */}
                                <div>
                                    <label htmlFor="subject" className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                                        Asignatura
                                    </label>
                                    <select
                                        id="subject"
                                        aria-invalid={errors.subject ? "true" : "false"}
                                        {...register("subject", { required: "La asignatura es obligatoria" })}
                                        className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                                    >
                                        <option value="">Selecciona asignatura...</option>
                                        {enrolledCourseSubjects.map(subject => (
                                            <option key={subject.id} value={subject.name}>{subject.name}</option>
                                        ))}
                                        {/* Fallback to non-enrolled subjects if selected via slot */}
                                        {availableSubjects.map(sub => (
                                            <option key={`fallback-${sub}`} value={sub}>{sub} (Disponibilidad)</option>
                                        ))}
                                    </select>
                                    {errors.subject && <p className="mt-1 text-xs text-red-600">{errors.subject.message}</p>}
                                </div>

                                {/* Teacher Input */}
                                <div>
                                    <label htmlFor="teacherId" className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                                        Profesor / Tutor
                                    </label>
                                    <select
                                        id="teacherId"
                                        aria-invalid={errors.teacherId ? "true" : "false"}
                                        {...register("teacherId", { required: "Selecciona una opción de profesor" })}
                                        className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                                    >
                                        <option value="first_available">⭐ Primer profesor disponible</option>
                                        {teachers.map((teacher: any) => (
                                            <option key={teacher.id} value={teacher.id}>
                                                {teacher.name}
                                            </option>
                                        ))}
                                    </select>
                                    {errors.teacherId && <p className="mt-1 text-xs text-red-600">{errors.teacherId.message}</p>}
                                </div>

                                {/* Date & Time */}
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label htmlFor="date" className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                                            Fecha
                                        </label>
                                        <input
                                            type="date"
                                            id="date"
                                            {...register("date", { required: "La fecha es obligatoria" })}
                                            min={new Date().toISOString().split('T')[0]}
                                            className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-slate-900 dark:text-slate-100 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                                        />
                                    </div>
                                    <div>
                                        <label htmlFor="time" className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                                            Hora
                                        </label>
                                        <input
                                            type="time"
                                            id="time"
                                            {...register("time", { required: "La hora es obligatoria" })}
                                            className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-slate-900 dark:text-slate-100 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                                        />
                                    </div>
                                </div>

                                {/* Details */}
                                <div>
                                    <label htmlFor="details" className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                                        ¿Qué te gustaría repasar?
                                    </label>
                                    <textarea
                                        id="details"
                                        rows={3}
                                        placeholder="Ej: Dudas con problemas de examen o repaso general."
                                        {...register("details", { required: "Por favor, cuéntanos brevemente qué deseas repasar" })}
                                        className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                                    ></textarea>
                                    {errors.details && <p className="mt-1 text-xs text-red-600">{errors.details.message}</p>}
                                </div>

                                <div className="p-3 bg-indigo-50/60 dark:bg-indigo-950/30 rounded-xl border border-indigo-100 dark:border-indigo-900/40 text-center text-xs">
                                    <p className="text-indigo-950 dark:text-indigo-200 font-bold flex items-center justify-center gap-1 text-[12px]">
                                        <span>🪙</span> Se restará <strong className="text-indigo-600 dark:text-indigo-400 font-black">1 Infinity</strong> de tu saldo al reservar.
                                    </p>
                                    <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-1">
                                        Una vez que el profesor y la administración den el visto bueno, la tutoría quedará asignada y confirmada en tu agenda.
                                    </p>
                                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                                        Saldo actual disponible: <strong className="text-indigo-600 dark:text-indigo-400 font-extrabold">{studentUser?.creditsBalance ?? 0} {studentUser?.creditsBalance === 1 ? 'Infinity' : 'Infinitys'}</strong>
                                    </p>
                                    <div className="mt-1.5 pt-1.5 border-t border-indigo-100 dark:border-indigo-900/50 text-center">
                                        <Link 
                                            to={`${ROUTES.PAYMENT}?type=credits`} 
                                            className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline inline-flex items-center gap-1"
                                        >
                                            📋 Ver historial de transacciones y recargas
                                        </Link>
                                    </div>
                                </div>

                                {(() => {
                                    const watchDate = watch('date');
                                    const watchTime = watch('time');
                                    const { hoursRemaining } = isCancellableSession(watchDate, watchTime);
                                    if (hoursRemaining < 24) {
                                        return (
                                            <div className="p-3 bg-amber-500/15 border-2 border-amber-500/40 rounded-xl text-xs text-amber-950 dark:text-amber-100 space-y-1 my-2 animate-fadeIn box-border max-w-full">
                                                <p className="font-extrabold text-amber-800 dark:text-amber-300 flex items-center gap-1.5 text-[12px] flex-wrap">
                                                    <span>⚠️</span> Tutoría a menos de 24 horas de la fecha actual
                                                </p>
                                                <p className="text-[11px] leading-snug break-words">
                                                    Esta tutoría es para dentro de menos de 24 horas de la fecha actual.
                                                </p>
                                                <p className="text-[11px] font-bold text-amber-950 dark:text-amber-100 leading-snug break-words">
                                                    Si confirmas la reserva, <u>no se podrá anular</u> por ser una tutoría a menos de 24h y los Infinitys se cobrarán sin opción de devolución.
                                                </p>
                                            </div>
                                        );
                                    }
                                    return null;
                                })()}

                                <button
                                    type="submit"
                                    disabled={isSubmitting || !!(studentUser && (studentUser.creditsBalance ?? 0) <= 0)}
                                    className="w-full py-3 px-4 bg-primary text-white font-bold rounded-xl hover:bg-primary-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm shadow-md flex items-center justify-center gap-2"
                                >
                                    {isSubmitting ? (
                                        'Enviando...'
                                    ) : (studentUser && (studentUser.creditsBalance ?? 0) <= 0) ? (
                                        'No tienes Infinitys suficientes 🪙'
                                    ) : (
                                        'Enviar Solicitud de Tutoría'
                                    )}
                                </button>

                                {studentUser && (studentUser.creditsBalance ?? 0) <= 0 && (
                                    <div className="text-center mt-2">
                                        <Link
                                            to={`${ROUTES.PAYMENT}?type=credits`}
                                            className="inline-block text-xs font-black text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 hover:underline"
                                        >
                                            Adquirir paquete de Infinitys ahora →
                                        </Link>
                                    </div>
                                )}
                            </form>
                        </div>

                    </div>
                </div>

                {/* Bottom Section: My tutoring sessions list & Live Visto Bueno updates */}
                <div className="bg-white dark:bg-slate-800 p-6 sm:p-8 rounded-2xl shadow-xl mt-8 border border-slate-100 dark:border-slate-700">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-700 pb-5 mb-6">
                        <div>
                            <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-50 flex items-center gap-2">
                                📋 Mis Sesiones de Tutoría
                            </h2>
                            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                                Administra tus próximas clases, revisa temas tratados anteriormente y descarga los recursos recomendados.
                            </p>
                        </div>
                        
                        {/* Tab Selectors */}
                        <div className="flex bg-slate-100 dark:bg-slate-900 p-1 rounded-xl self-start md:self-auto">
                            <button
                                onClick={() => setBottomTab('active')}
                                className={`px-4 py-2 rounded-lg text-xs sm:text-sm font-bold transition-all ${
                                    bottomTab === 'active'
                                        ? 'bg-white dark:bg-slate-800 text-slate-950 dark:text-white shadow-xs'
                                        : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-300'
                                }`}
                            >
                                ⏳ Próximas y Pendientes ({activeSessions.length})
                            </button>
                            <button
                                onClick={() => setBottomTab('history')}
                                className={`px-4 py-2 rounded-lg text-xs sm:text-sm font-bold transition-all flex items-center gap-1.5 ${
                                    bottomTab === 'history'
                                        ? 'bg-white dark:bg-slate-800 text-slate-950 dark:text-white shadow-xs'
                                        : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-300'
                                }`}
                            >
                                <HistoryIcon className="w-4 h-4" />
                                Historial de Clases ({pastSessions.length})
                            </button>
                        </div>
                    </div>

                    {isRequestsLoading ? (
                        <div className="space-y-4 animate-pulse">
                            <div className="h-16 bg-gray-200 dark:bg-slate-700 rounded-xl"></div>
                            <div className="h-16 bg-gray-200 dark:bg-slate-700 rounded-xl"></div>
                        </div>
                    ) : bottomTab === 'active' ? (
                        /* Active & Pending Sessions */
                        activeSessions.length > 0 ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {activeSessions.map((session) => (
                                    <div key={session.id} className="p-5 rounded-xl border border-slate-200 dark:border-slate-700/80 bg-slate-50/50 dark:bg-slate-800/30">
                                        <div className="flex justify-between items-start mb-2">
                                            <div>
                                                <h3 className="text-md font-bold text-slate-900 dark:text-slate-100">
                                                    {session.subject}
                                                </h3>
                                                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                                                    👨‍🏫 Profesor: {session.teacherId === 'first_available' ? 'Cualquier disponible' : (session.teacherName || 'Asignado')}
                                                </p>
                                            </div>
                                            <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                                                session.status === 'confirmed' 
                                                    ? 'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900/50' 
                                                    : 'bg-amber-100 dark:bg-amber-950/40 text-amber-800 dark:text-amber-400 border border-amber-200 dark:border-amber-900/50'
                                            }`}>
                                                {session.status === 'confirmed' ? 'Confirmado ✅' : 'Pendiente ⏳'}
                                            </span>
                                        </div>
                                        
                                        <p className="text-xs text-slate-700 dark:text-slate-300 mb-3 italic">
                                            "{session.details}"
                                        </p>

                                        <div className="bg-white dark:bg-slate-800 p-3 rounded-lg border border-slate-150 dark:border-slate-700 space-y-2">
                                            <div className="flex justify-between text-xs font-semibold">
                                                <span className="text-slate-500 flex items-center gap-1"><CalendarIcon className="w-3.5 h-3.5" /> Fecha:</span>
                                                <span className="text-slate-800 dark:text-slate-200">{session.date || 'Sin programar'}</span>
                                            </div>
                                            <div className="flex justify-between text-xs font-semibold">
                                                <span className="text-slate-500 flex items-center gap-1"><ClockIcon className="w-3.5 h-3.5" /> Hora:</span>
                                                <span className="text-slate-800 dark:text-slate-200">{session.time ? `${session.time} h` : 'Sin programar'}</span>
                                            </div>
                                            
                                            {session.status === 'confirmed' && (
                                                <div className="pt-3 mt-2 border-t dark:border-slate-700">
                                                    {session.isVoiceCall ? (
                                                        <button
                                                            onClick={() => setActiveVoiceCallId(session.id)}
                                                            className="w-full py-2 bg-emerald-100 hover:bg-emerald-200 text-emerald-800 dark:bg-emerald-900/40 dark:hover:bg-emerald-800/60 dark:text-emerald-300 font-bold rounded-lg text-xs transition-colors flex items-center justify-center gap-1.5"
                                                        >
                                                            <span>🎙️</span> Entrar a la Clase (Voz)
                                                        </button>
                                                    ) : session.meetingLink ? (
                                                        <a
                                                            href={session.meetingLink.startsWith('http') ? session.meetingLink : `https://${session.meetingLink}`}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="w-full py-2 bg-indigo-100 hover:bg-indigo-200 text-indigo-800 dark:bg-indigo-900/40 dark:hover:bg-indigo-800/60 dark:text-indigo-300 font-bold rounded-lg text-xs transition-colors flex items-center justify-center gap-1.5"
                                                        >
                                                            <ExternalLinkIcon className="w-4 h-4" /> Entrar a la Clase (Enlace Externo)
                                                        </a>
                                                    ) : (
                                                        <p className="text-xs text-slate-500 italic text-center">El docente aún no ha añadido el enlace de la clase.</p>
                                                    )}
                                                </div>
                                            )}

                                            {session.status === 'pending' && (
                                                <div className="pt-2 border-t dark:border-slate-700 flex flex-col gap-1.5">
                                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                                                        Doble Visto Bueno Requerido:
                                                    </p>
                                                    <div className="flex justify-between text-xs">
                                                        <span className="text-slate-500">👨‍🏫 Visto Bueno Profesor:</span>
                                                        <span className={`font-bold ${session.teacherApproved ? 'text-emerald-600' : 'text-amber-600'}`}>
                                                            {session.teacherApproved ? 'Aprobado ✅' : 'Pendiente ⏳'}
                                                        </span>
                                                    </div>
                                                    <div className="flex justify-between text-xs">
                                                        <span className="text-slate-500">🛡️ Visto Bueno Admin:</span>
                                                        <span className={`font-bold ${session.adminApproved ? 'text-emerald-600' : 'text-amber-600'}`}>
                                                            {session.adminApproved ? 'Aprobado ✅' : 'Pendiente ⏳'}
                                                        </span>
                                                    </div>
                                                </div>
                                            )}

                                            <div className="pt-3 border-t dark:border-slate-700">
                                                {isCancellableSession(session.date, session.time).cancellable ? (
                                                    <button
                                                        type="button"
                                                        onClick={() => handleCancelReservation(session.id, session.date, session.time)}
                                                        className="w-full py-2 px-3 bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/30 dark:hover:bg-rose-900/50 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-900/50 font-extrabold rounded-xl text-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
                                                    >
                                                        <span>❌</span> Anular Reserva (1 Infinity)
                                                    </button>
                                                ) : (
                                                    <div className="w-full py-2 px-3 bg-slate-100 dark:bg-slate-800/80 text-slate-500 dark:text-slate-400 rounded-xl border border-slate-200 dark:border-slate-700 text-center">
                                                        <span className="text-[11px] font-bold flex items-center justify-center gap-1">
                                                            <span>🔒</span> No anulable (&lt;24h para la tutoría)
                                                        </span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="text-slate-500 dark:text-slate-400 italic">No tienes tutorías activas o pendientes actualmente.</p>
                        )
                    ) : (
                        /* Completed Sessions History View */
                        <div className="space-y-6">
                            {/* Search History */}
                            <div className="relative max-w-md">
                                <input
                                    type="text"
                                    value={historySearch}
                                    onChange={(e) => setHistorySearch(e.target.value)}
                                    placeholder="🔍 Buscar por asignatura, profesor, tema..."
                                    className="w-full pl-9 pr-4 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                                />
                            </div>

                            {pastSessions.length > 0 ? (
                                <div className="grid grid-cols-1 gap-6">
                                    {pastSessions.map((session) => (
                                        <div key={session.id} className="p-6 rounded-2xl border border-slate-200 dark:border-slate-700/80 bg-slate-50/30 dark:bg-slate-800/10 flex flex-col md:flex-row gap-6">
                                            
                                            {/* Column 1: Info and topics */}
                                            <div className="flex-1 space-y-4">
                                                <div className="flex flex-wrap items-center justify-between gap-2 border-b dark:border-slate-700/50 pb-3">
                                                    <div>
                                                        <span className="px-2.5 py-0.5 rounded-md text-[10px] font-extrabold uppercase tracking-widest bg-blue-100 dark:bg-blue-950/50 text-blue-800 dark:text-blue-300 border border-blue-200 dark:border-blue-900/40 mr-2">
                                                            {session.subject}
                                                        </span>
                                                        <span className="text-xs text-slate-500 dark:text-slate-400 font-bold inline-flex items-center gap-1">
                                                            📅 {session.date} a las {session.time} h
                                                        </span>
                                                    </div>
                                                    <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                                                        👨‍🏫 Profesor: <span className="font-bold text-slate-950 dark:text-white">{session.teacherName || 'Docente Asignado'}</span>
                                                    </div>
                                                </div>

                                                {/* What student asked for */}
                                                <div>
                                                    <p className="text-[10px] font-black uppercase text-slate-400 tracking-wider mb-1">Tu consulta original:</p>
                                                    <p className="text-xs text-slate-600 dark:text-slate-400 italic">"{session.details}"</p>
                                                </div>

                                                {/* Topics covered summary */}
                                                <div className="p-4 bg-white dark:bg-slate-800/80 rounded-xl border border-slate-150 dark:border-slate-700">
                                                    <h4 className="text-xs font-black uppercase tracking-wider text-primary dark:text-sky-400 flex items-center gap-1.5 mb-2">
                                                        <BookOpenIcon className="w-4 h-4" /> Temas Tratados en la Sesión
                                                    </h4>
                                                    <p className="text-sm text-slate-800 dark:text-slate-200 leading-relaxed whitespace-pre-line">
                                                        {session.sessionSummary || 'El profesor aún no ha ingresado el resumen de los temas abordados en esta sesión.'}
                                                    </p>
                                                </div>
                                            </div>

                                            {/* Column 2: Resources & Rating (Right Sidebar of the card) */}
                                            <div className="w-full md:w-80 flex flex-col justify-between border-t md:border-t-0 md:border-l border-slate-200 dark:border-slate-700 pt-4 md:pt-0 md:pl-6 space-y-4">
                                                
                                                {/* Resources Shared */}
                                                <div className="space-y-2">
                                                    <h4 className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                                                        📁 Recursos del Profesor
                                                    </h4>
                                                    
                                                    {session.sharedResources && session.sharedResources.length > 0 ? (
                                                        <div className="grid grid-cols-1 gap-2">
                                                            {session.sharedResources.map((res, idx) => (
                                                                <a 
                                                                    key={idx} 
                                                                    href={res.url} 
                                                                    target="_blank" 
                                                                    referrerPolicy="no-referrer"
                                                                    rel="noopener noreferrer" 
                                                                    className="flex items-center gap-2 p-2.5 rounded-lg bg-white dark:bg-slate-800 hover:bg-primary/5 dark:hover:bg-sky-400/5 hover:border-primary/40 dark:hover:border-sky-400/40 border border-slate-200 dark:border-slate-700 transition-all text-xs font-bold text-slate-700 dark:text-slate-300"
                                                                >
                                                                    <DownloadIcon className="w-4 h-4 text-primary shrink-0" />
                                                                    <span className="truncate flex-1">{res.title}</span>
                                                                    <ExternalLinkIcon className="w-3.5 h-3.5 text-slate-400" />
                                                                </a>
                                                            ))}
                                                        </div>
                                                    ) : (
                                                        <p className="text-xs text-slate-400 dark:text-slate-500 italic">
                                                            No se compartieron archivos o enlaces en esta sesión.
                                                        </p>
                                                    )}
                                                </div>

                                                {/* Star rating and feedback */}
                                                <div className="pt-3 border-t border-slate-150 dark:border-slate-700 space-y-2">
                                                    <h4 className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                                        ⭐ Valoración de la Clase
                                                    </h4>

                                                    {session.rating ? (
                                                        <div className="bg-white dark:bg-slate-800/50 p-3 rounded-xl border border-slate-150 dark:border-slate-700/60">
                                                            <div className="flex gap-1 text-amber-400 text-sm">
                                                                {Array.from({ length: 5 }).map((_, i) => (
                                                                    <span key={i}>
                                                                        {i < (session.rating || 0) ? '★' : '☆'}
                                                                    </span>
                                                                ))}
                                                            </div>
                                                            {session.feedback && (
                                                                <p className="text-xs text-slate-600 dark:text-slate-400 italic mt-2 border-l-2 border-slate-200 dark:border-slate-600 pl-2">
                                                                    "{session.feedback}"
                                                                </p>
                                                            )}
                                                        </div>
                                                    ) : ratingSessionId === session.id ? (
                                                        /* Inline Rating Form */
                                                        <div className="bg-slate-100 dark:bg-slate-900 p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 space-y-3">
                                                            <div className="space-y-1">
                                                                <label className="block text-[10px] font-black uppercase text-slate-500">Puntuación:</label>
                                                                <div className="flex gap-1.5">
                                                                    {[1, 2, 3, 4, 5].map((val) => (
                                                                        <button
                                                                            type="button"
                                                                            key={val}
                                                                            onClick={() => setRatingValue(val)}
                                                                            className={`w-7 h-7 rounded-md text-xs font-bold transition-all ${
                                                                                ratingValue >= val 
                                                                                    ? 'bg-amber-400 text-white' 
                                                                                    : 'bg-slate-200 dark:bg-slate-800 text-slate-600'
                                                                            }`}
                                                                        >
                                                                            ★
                                                                        </button>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                            
                                                            <div className="space-y-1">
                                                                <label htmlFor={`feedback-${session.id}`} className="block text-[10px] font-black uppercase text-slate-500">Comentario:</label>
                                                                <textarea
                                                                    id={`feedback-${session.id}`}
                                                                    value={ratingFeedback}
                                                                    onChange={(e) => setRatingFeedback(e.target.value)}
                                                                    placeholder="¿Qué te pareció la clase?"
                                                                    rows={2}
                                                                    className="w-full px-2.5 py-1.5 text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-1 focus:ring-primary focus:outline-none"
                                                                />
                                                            </div>

                                                            <div className="flex gap-2 justify-end">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setRatingSessionId(null)}
                                                                    className="px-2.5 py-1 text-[11px] font-bold text-slate-600 dark:text-slate-400 hover:underline"
                                                                >
                                                                    Cancelar
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleRateSession(session.id)}
                                                                    className="px-3 py-1 bg-primary text-white text-[11px] font-bold rounded-md hover:bg-primary-dark"
                                                                >
                                                                    Guardar
                                                                </button>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <button
                                                            onClick={() => {
                                                                setRatingSessionId(session.id);
                                                                setRatingValue(5);
                                                                setRatingFeedback('');
                                                            }}
                                                            className="w-full py-2 px-3 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-xl text-xs transition-colors shadow-xs"
                                                        >
                                                            ⭐ Valorar esta Tutoría
                                                        </button>
                                                    )}
                                                </div>

                                            </div>

                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-slate-500 dark:text-slate-400 italic">
                                    {historySearch.trim() ? 'No se encontraron tutorías pasadas que coincidan con tu búsqueda.' : 'No tienes tutorías completadas en tu historial.'}
                                </p>
                            )}
                        </div>
                    )}
                </div>

            </div>
            {/* Active Voice Call Modal */}
            {activeVoiceCallId && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
                    <div className="bg-white dark:bg-slate-900 w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden border border-slate-200 dark:border-slate-700 relative flex flex-col max-h-[90vh]">
                        <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-800/50">
                            <h2 className="font-extrabold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                                <span>🎙️</span> Clase en Directo
                            </h2>
                            <button 
                                onClick={() => setActiveVoiceCallId(null)}
                                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                            >
                                ✕
                            </button>
                        </div>
                        <div className="p-4 overflow-y-auto">
                            <VoiceGroupCall courseId={`tutoring_${activeVoiceCallId}`} onClose={() => setActiveVoiceCallId(null)} />
                        </div>
                    </div>
                </div>
            )}

            {/* Less than 24h Slot Confirmation Modal */}
            <ConfirmationModal
                isOpen={!!pendingSlotToConfirm}
                onClose={() => setPendingSlotToConfirm(null)}
                onConfirm={() => {
                    if (pendingSlotToConfirm) {
                        executeDirectSlotConfirm(pendingSlotToConfirm);
                    }
                }}
                title="⚠️ Confirmar Tutoría (< 24 Horas)"
                description={`Esta tutoría con ${pendingSlotToConfirm?.teacherName || 'el docente'} para el ${pendingSlotToConfirm?.date} a las ${pendingSlotToConfirm?.time}h está programada a menos de 24 horas de la fecha actual. Si confirmas la reserva, NO se podrá anular posteriormente y se cobrará 1 Infinity de tu saldo sin opción de devolución. ¿Deseas confirmar?`}
                confirmText="Sí, Confirmar Reserva"
                cancelText="Cancelar"
            />

            {/* Less than 24h Form Submission Modal */}
            <ConfirmationModal
                isOpen={!!pendingFormToConfirm}
                onClose={() => setPendingFormToConfirm(null)}
                onConfirm={() => {
                    if (pendingFormToConfirm) {
                        executeFormSubmit(pendingFormToConfirm);
                    }
                }}
                title="⚠️ Confirmar Tutoría (< 24 Horas)"
                description={`Esta solicitud de tutoría de "${pendingFormToConfirm?.subject}" para el ${pendingFormToConfirm?.date} a las ${pendingFormToConfirm?.time}h está programada a menos de 24 horas de la fecha actual. Si confirmas la reserva, NO se podrá anular posteriormente y se cobrará 1 Infinity de tu saldo sin opción de devolución. ¿Deseas confirmar?`}
                confirmText="Sí, Confirmar Reserva"
                cancelText="Cancelar"
            />

            {/* Cancel Tutoring Confirmation Modal */}
            {cancelModalSession && (
                <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
                    <div className="bg-white dark:bg-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-700 space-y-4">
                        <div className="flex items-center gap-3 text-rose-600 dark:text-rose-400">
                            <div className="p-3 bg-rose-100 dark:bg-rose-950/40 rounded-xl">
                                <span className="text-2xl">❌</span>
                            </div>
                            <div>
                                <h3 className="text-lg font-black text-slate-900 dark:text-white">¿Anular Reserva de Tutoría?</h3>
                                <p className="text-xs text-slate-500 dark:text-slate-400">{cancelModalSession.subject ? `Materia: ${cancelModalSession.subject}` : 'Sesión de tutoría'}</p>
                            </div>
                        </div>

                        <div className="p-3.5 bg-amber-50 dark:bg-amber-950/30 rounded-xl border border-amber-200 dark:border-amber-800/40 text-xs text-amber-900 dark:text-amber-200 space-y-2">
                            <p className="font-bold flex items-center gap-1 text-emerald-700 dark:text-emerald-300">
                                <span>🪙</span> Se reembolsará 1 Infinity a tu saldo
                            </p>
                            <p className="text-[11px] text-slate-700 dark:text-slate-300">
                                Al anular la reserva, la plaza quedará liberada para otros alumnos y se notificará al profesor.
                            </p>
                            <div className="text-[11px] font-semibold text-amber-800 dark:text-amber-300 border-t border-amber-200 dark:border-amber-800/40 pt-1 mt-1">
                                ⏱️ <strong>Política de Anulación:</strong> Permitida únicamente hasta 24 horas antes del inicio de la clase.
                            </div>
                        </div>

                        <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-700">
                            <button
                                type="button"
                                onClick={() => setCancelModalSession(null)}
                                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                            >
                                Volver / Mantener
                            </button>
                            <button
                                type="button"
                                onClick={async () => {
                                    const target = cancelModalSession;
                                    setCancelModalSession(null);
                                    if (target) {
                                        try {
                                            await api.deleteTutoringRequest(target.id);
                                            addToast('Reserva de tutoría anulada con éxito. Se ha reembolsado 1 Infinity a tu saldo.', 'success');
                                            queryClient.invalidateQueries({ queryKey: ['tutoringRequests'] });
                                            queryClient.invalidateQueries({ queryKey: [['tutoringRequests']] });
                                            queryClient.invalidateQueries({ queryKey: ['users'] });
                                            queryClient.invalidateQueries({ queryKey: ['user'] });
                                            eventEmitter.emit('tutoring-requests-updated');
                                            if (user) eventEmitter.emit('user-update', user);
                                            setSelectedSlotId(null);
                                        } catch (error) {
                                            console.error('Error cancelling tutoring request:', error);
                                            addToast('Error al anular la reserva. Inténtalo de nuevo.', 'error');
                                        }
                                    }
                                }}
                                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer shadow-sm flex items-center gap-1"
                            >
                                <span>❌</span> Confirmar Anulación
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </SubscriptionGate>
    );
};
