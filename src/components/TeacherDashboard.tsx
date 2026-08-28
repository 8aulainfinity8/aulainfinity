import React, { useContext, useMemo, useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { eventEmitter } from '../services/eventService';
import { AuthContext } from '../contexts/AuthContext';
import { AdminNotificationContext } from '../contexts/AdminNotificationContext';
import { NotificationContext } from '../contexts/NotificationContext';
import { TeacherScheduleManager } from './TeacherScheduleManager';
import { ROUTES } from '../constants/routes';
import * as api from '../services/api';
import type { TeacherUser, StudentUser, CourseLevel, StudentAnswer, Quiz } from '../types';
import { 
  GraduationCap, 
  MessageSquare, 
  Video, 
  Lightbulb, 
  ArrowRight, 
  User, 
  Compass,
  CheckCircle,
  TrendingUp,
  Search,
  Filter,
  SlidersHorizontal,
  Award,
  Mail,
  Phone,
  Calendar,
  ChevronDown,
  ChevronUp,
  Clock,
  X,
  StickyNote,
  Sparkles,
  AlertCircle,
  AlertTriangle,
  Users
} from 'lucide-react';
import { Card, CardTitle, CardDescription, Badge, Button, EmptyState, Skeleton } from './ui';
import { WorkloadChart } from './WorkloadChart';
import { isTeacherMatchForSubject, isTutoringRequestForTeacher } from '../utils/tutoringHelpers';
import { useI18n } from '../hooks/useI18n';
import { getDirectChatId, resolveUserUid } from '../utils/chatUtils';
import { auth } from '../services/firebase';

// --- SUB-COMPONENT: FULL QUIZ QUESTION ANALYSIS DIAGNOSTIC ---
const QuizSubmissionDetails: React.FC<{ videoId: string; answer: StudentAnswer }> = ({ videoId, answer }) => {
    const { data: quiz, isLoading } = useQuery<Quiz | null>({
        queryKey: ['quiz', videoId],
        queryFn: () => api.fetchQuizByVideoId(videoId),
        enabled: !!videoId && !!auth?.currentUser,
        staleTime: 60000,
    });

    if (isLoading) {
        return (
            <div className="flex items-center gap-2 text-xs text-slate-500 justify-center py-4 bg-slate-50 dark:bg-slate-900/40 rounded-xl" id="loading-diagnostic">
                <span className="animate-spin inline-block w-4 h-4 rounded-full border-2 border-primary border-t-transparent"></span>
                <span>Cargando reactivos e historial de respuestas...</span>
            </div>
        );
    }

    if (!quiz || !quiz.questions || quiz.questions.length === 0) {
        return (
            <div className="text-xs text-slate-400 italic py-3 text-center bg-slate-50 dark:bg-slate-900/40 rounded-xl" id="no-quiz-questions">
                No hay preguntas guardadas para este examen en la base de datos.
            </div>
        );
    }

    return (
        <div className="mt-3 bg-slate-50 dark:bg-slate-900/50 p-4 rounded-xl border border-slate-150 dark:border-slate-800 space-y-4" id={`quiz-details-${videoId}`}>
            <h5 className="text-xs font-black text-indigo-700 dark:text-indigo-400 uppercase tracking-wide">
                Análisis Pedagógico de Respuestas:
            </h5>
            <div className="space-y-3.5">
                {quiz.questions.map((question, qIdx) => {
                    const studentChoice = answer.answers[question.id];
                    const isCorrect = studentChoice === question.correctAnswerIndex;
                    
                    return (
                        <div key={question.id || qIdx} className="bg-white dark:bg-slate-850 p-3 rounded-xl border border-slate-100 dark:border-slate-800 text-xs shadow-xs">
                            <p className="font-bold text-slate-800 dark:text-slate-200">
                                {qIdx + 1}. {question.text}
                            </p>
                            <div className="mt-2.5 space-y-2 pl-2">
                                {question.options.map((option, optIdx) => {
                                    const isSelected = studentChoice === optIdx;
                                    const isCorrectOpt = optIdx === question.correctAnswerIndex;
                                    
                                    let itemColor = "text-slate-500 dark:text-slate-400 border-slate-100 dark:border-slate-800 bg-slate-50/50";
                                    if (isSelected && isCorrect) {
                                        itemColor = "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-300 text-emerald-800 dark:text-emerald-400 font-bold border-2";
                                    } else if (isSelected && !isCorrect) {
                                        itemColor = "bg-red-50 dark:bg-red-950/30 border-red-300 text-red-850 dark:text-red-400 font-bold border-2";
                                    } else if (isCorrectOpt) {
                                        itemColor = "bg-emerald-50/30 dark:bg-emerald-950/10 border-emerald-200 text-emerald-700 dark:text-emerald-450 font-medium border";
                                    }

                                    return (
                                        <div key={optIdx} className={`p-2.5 rounded-lg border text-[11px] flex items-center justify-between gap-2.5 transition duration-150 ${itemColor}`}>
                                            <span className="flex-1">{option}</span>
                                            {isSelected && isCorrect && (
                                                <span className="text-[9px] font-black uppercase text-emerald-700 bg-emerald-100 dark:bg-emerald-900/60 px-2 py-0.5 rounded-md shrink-0">
                                                    Respuesta Correcta ✅
                                                </span>
                                            )}
                                            {isSelected && !isCorrect && (
                                                <span className="text-[9px] font-black uppercase text-red-700 bg-red-100 dark:bg-red-900/60 px-2 py-0.5 rounded-md shrink-0">
                                                    Marcada ❌
                                                </span>
                                            )}
                                            {isCorrectOpt && !isSelected && (
                                                <span className="text-[9px] font-bold text-emerald-600/80 shrink-0">
                                                    Solución Correcta
                                                </span>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                            {question.explanation && (
                                <div className="mt-3 p-3 bg-indigo-50/30 dark:bg-indigo-950/20 rounded-lg border-l-3 border-indigo-400 text-[11px] text-slate-600 dark:text-slate-350 italic leading-relaxed">
                                    <span className="font-extrabold uppercase not-italic text-[9px] mr-1.5 text-indigo-700 dark:text-indigo-400">Justificación del Docente:</span>
                                    {question.explanation}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export const TeacherDashboard: React.FC = () => {
    const { t } = useI18n();
    const { user } = useContext(AuthContext);
    const teacherUser = user && user.role === 'teacher' ? (user as TeacherUser) : null;
    const isApprovedTeacher = teacherUser ? teacherUser.isApprovedForTutoring === true : true;
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const { 
        conversations = [], 
        topicRequests = [], 
        tutoringRequests = [] 
    } = useContext(AdminNotificationContext);

    // --- USERS QUERY ---
    const { data: users, isLoading: usersLoading } = useQuery<StudentUser[]>({
        queryKey: ['users'],
        queryFn: api.fetchUsers,
        staleTime: 30000,
    });

    // Filter conversations for this specific teacher
    const teacherConversations = useMemo(() => {
        if (!conversations) return [];
        return conversations.filter(c => {
            if (!c || !c.id) return false;
            const { teacherId, studentId: parsedStudentId } = api.parseConversationParticipants(c.id);
            if (c.teacherId === user?.id || teacherId === user?.id) return true;
            if (c.id && c.id.includes(user?.id || '')) return true;
            if (c.teacherName && user?.name && c.teacherName.toLowerCase() === user.name.toLowerCase()) return true;
            const studentId = c.studentId || parsedStudentId;
            const student = (users || []).find(u => u.id === studentId || u.id.replace('direct_', '') === studentId);
            if (student && (student as StudentUser).assignedTeacherId === user?.id) return true;
            if (student && !(student as StudentUser).assignedTeacherId) return true;
            if (!c.teacherId && !teacherId) return true;
            return false;
        });
    }, [conversations, user?.id, user?.name, users]);

    // Unread messages counts
    const pendingChatsCount = useMemo(() => {
        return teacherConversations.filter(c => c.unreadByTeacher || c.unreadByAdmin).length;
    }, [teacherConversations]);

    // Pending topic requests
    const pendingTopicRequests = useMemo(() => {
        return topicRequests.filter(req => req.status === 'pending');
    }, [topicRequests]);

    const { data: teachers = [] } = useQuery<TeacherUser[]>({ 
        queryKey: ['teachers'], 
        queryFn: api.fetchTeachers, 
        enabled: !!user && !!user.id && !!auth?.currentUser 
    });

    // Pending tutoring requests for this teacher
    const pendingTutoringRequests = useMemo(() => {
        if (!tutoringRequests || !user) return [];
        return tutoringRequests.filter(req => 
            req.status === 'pending' && isTutoringRequestForTeacher(req, user, teachers)
        );
    }, [tutoringRequests, user, teachers]);

    // Completed tutoring requests for this teacher
    const completedTutoringCount = useMemo(() => {
        if (!tutoringRequests || !user) return 0;
        return tutoringRequests.filter(req => 
            req.status === 'completed' && isTutoringRequestForTeacher(req, user, teachers)
        ).length;
    }, [tutoringRequests, user, teachers]);

    // --- TAB MANAGEMENT STATE ---
    const { addToast } = useContext(NotificationContext);
    const { updateUser } = useContext(AuthContext);
    const [activeTab, setActiveTab] = useState<'overview' | 'students' | 'schedule'>('overview');
    const [isSavingSchedules, setIsSavingSchedules] = useState(false);

    const handleSaveTeacherSchedules = async (newSchedules: string[]) => {
        if (!teacherUser) return;
        setIsSavingSchedules(true);
        try {
            const updated = await api.updateTeacherDetails(teacherUser.id, {
                schedules: newSchedules
            });
            updateUser(updated);
            addToast('Agenda de disponibilidad para tutorías actualizada y sincronizada correctamente.', 'success');
        } catch (err) {
            addToast('Error al guardar los horarios de disponibilidad.', 'error');
        } finally {
            setIsSavingSchedules(false);
        }
    };

    useEffect(() => {
        let userTimer: any = null;
        const handleUsers = () => {
            if (userTimer) clearTimeout(userTimer);
            userTimer = setTimeout(() => {
                queryClient.invalidateQueries({ queryKey: ['users'] });
                queryClient.invalidateQueries({ queryKey: ['teachers'] });
            }, 400);
        };
        const handleCourses = () => queryClient.invalidateQueries({ queryKey: ['courses'] });
        const handleAnswers = () => queryClient.invalidateQueries({ queryKey: ['allStudentAnswers'] });
        const handleTutoring = () => queryClient.invalidateQueries({ queryKey: ['tutoringRequests'] });
        const handleRequests = () => queryClient.invalidateQueries({ queryKey: ['topicRequests'] });
        const handleQuizzes = () => {
            queryClient.invalidateQueries({ queryKey: ['quiz'] });
            queryClient.invalidateQueries({ queryKey: ['quizzes'] });
        };

        eventEmitter.on('user-update', handleUsers);
        eventEmitter.on('user-updated', handleUsers);
        eventEmitter.on('user-deleted', handleUsers);
        eventEmitter.on('courses-updated', handleCourses);
        eventEmitter.on('student-answers-updated', handleAnswers);
        eventEmitter.on('tutoring-requests-updated', handleTutoring);
        eventEmitter.on('tutoring-update', handleTutoring);
        eventEmitter.on('request-update', handleRequests);
        eventEmitter.on('request-deleted', handleRequests);
        eventEmitter.on('quizzes-updated', handleQuizzes);

        return () => {
            if (userTimer) clearTimeout(userTimer);
            eventEmitter.off('user-update', handleUsers);
            eventEmitter.off('user-updated', handleUsers);
            eventEmitter.off('user-deleted', handleUsers);
            eventEmitter.off('courses-updated', handleCourses);
            eventEmitter.off('student-answers-updated', handleAnswers);
            eventEmitter.off('tutoring-requests-updated', handleTutoring);
            eventEmitter.off('tutoring-update', handleTutoring);
            eventEmitter.off('request-update', handleRequests);
            eventEmitter.off('request-deleted', handleRequests);
            eventEmitter.off('quizzes-updated', handleQuizzes);
        };
    }, [queryClient]);

    // --- STUDENTS TAB QUERY & FILTER CONFIGURATION ---
    const { data: courses, isLoading: coursesLoading } = useQuery<CourseLevel[]>({
        queryKey: ['courses'],
        queryFn: api.fetchCourses,
        staleTime: 60000,
    });

    const { data: allAnswers } = useQuery<StudentAnswer[]>({
        queryKey: ['allStudentAnswers'],
        queryFn: api.fetchAllStudentAnswers,
        staleTime: 45000,
    });

    // Sub-segment filtering states
    const [studentSearch, setStudentSearch] = useState('');
    const [courseFilter, setCourseFilter] = useState('all');
    const [statusFilter, setStatusFilter] = useState('all'); // all, premium, free
    const [performanceFilter, setPerformanceFilter] = useState('all'); // all, excellent, average, low, inactive

    // Drawer / Modal overlay states for selected student
    const [selectedStudent, setSelectedStudent] = useState<StudentUser | null>(null);
    const [infoModalTab, setInfoModalTab] = useState<'notes' | 'subjects' | 'quizzes'>('notes');
    const [teacherNote, setTeacherNote] = useState('');
    const [isSavingNote, setIsSavingNote] = useState(false);
    const [saveSuccess, setSaveSuccess] = useState(false);
    const [expandedQuizId, setExpandedQuizId] = useState<string | null>(null);

    // Map watch database titles to display nicely
    const videoTitleMap = useMemo(() => {
        const map = new Map<string, string>();
        if (!courses) return map;
        courses.forEach(c => {
            (c.subjects || []).forEach(s => {
                (s.videos || []).forEach(v => map.set(v.id, v.title));
                (s.blocks || []).flatMap(b => b.videos || []).forEach(v => map.set(v.id, v.title));
            });
        });
        return map;
    }, [courses]);

    // Filter students assigned only to this teacher
    const assignedStudents = useMemo(() => {
        if (!users || !user) return [];
        return users.filter(u => u.assignedTeacherId === user.id);
    }, [users, user?.id]);

    // Compile dynamic lookup statistics per student
    const studentStatsMap = useMemo(() => {
        const stats: {
            [studentId: string]: {
                avgScore: number;
                quizCount: number;
                completedVideos: number;
                totalCourseVideos: number;
                lastActivity: string | null;
            }
        } = {};

        if (!assignedStudents || !courses) return stats;

        assignedStudents.forEach(student => {
            // Filter answers for this student
            const answers = allAnswers?.filter(ans => ans.studentId === student.id) || [];
            
            // Average quiz score percentage
            let avgScore = 0;
            if (answers.length > 0) {
                const totalScorePct = answers.reduce((sum, ans) => sum + (ans.score / ans.totalQuestions), 0);
                avgScore = Math.round((totalScorePct / answers.length) * 100);
            }

            // Total videos inside the courses this student is enrolled in
            let totalVideoCount = 0;
            const enrolled = courses.filter(c => student.enrolledCourseIds?.includes(c.id));
            enrolled.forEach(c => {
                const directVideos = (c.subjects || []).reduce((sum, s) => sum + (s.videos?.length || 0), 0);
                const blockVideos = (c.subjects || []).reduce((sum, s) => sum + (s.blocks?.flatMap(b => b.videos || []).length || 0), 0);
                totalVideoCount += (directVideos + blockVideos);
            });

            // Last active assessment date
            let lastActivityDate: string | null = null;
            if (answers.length > 0) {
                const sorted = [...answers].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
                lastActivityDate = sorted[0].timestamp;
            }

            // Number of completed watched videos
            const completedVideosCount = student.watchedVideos?.length || 0;

            stats[student.id] = {
                avgScore,
                quizCount: answers.length,
                completedVideos: completedVideosCount,
                totalCourseVideos: totalVideoCount || 1, // Avoid divide by zero
                lastActivity: lastActivityDate
            };
        });

        return stats;
    }, [assignedStudents, courses, allAnswers]);

    // Live global metrics of assigned class for teacher review
    const teacherClassStats = useMemo(() => {
        const count = assignedStudents.length;
        if (count === 0) {
            return { total: 0, premium: 0, alertCount: 0, classAvgScore: 0 };
        }

        const premium = assignedStudents.filter(s => s.isSubscribed).length;
        
        let alertCount = 0;
        let scoreSum = 0;
        let gradedCount = 0;

        assignedStudents.forEach(st => {
            const stats = studentStatsMap[st.id];
            
            // Check convo pending unread messages
            const convo = conversations?.find(c => c.studentId === st.id);
            const hasUnread = convo?.unreadByAdmin || false;

            if (hasUnread) {
                alertCount++;
            } else if (stats && stats.quizCount > 0 && stats.avgScore < 60) {
                alertCount++;
            }

            if (stats && stats.quizCount > 0) {
                scoreSum += stats.avgScore;
                gradedCount++;
            }
        });

        return {
            total: count,
            premium,
            alertCount,
            classAvgScore: gradedCount > 0 ? Math.round(scoreSum / gradedCount) : 0
        };
    }, [assignedStudents, studentStatsMap, conversations]);

    // Master filter pipeline
    const filteredStudents = useMemo(() => {
        return assignedStudents.filter(student => {
            // Search text Matcher
            const matchesSearch = studentSearch === '' || 
                student.name.toLowerCase().includes(studentSearch.toLowerCase()) || 
                student.email.toLowerCase().includes(studentSearch.toLowerCase());

            // Level selection filter
            const matchesCourse = courseFilter === 'all' || 
                (student.enrolledCourseIds && student.enrolledCourseIds.includes(courseFilter));

            // Subscription type filter
            const matchesStatus = statusFilter === 'all' || 
                (statusFilter === 'premium' && student.isSubscribed) ||
                (statusFilter === 'free' && !student.isSubscribed);

            // Academic warning triggers or high scores
            const stats = studentStatsMap[student.id];
            let matchesPerformance = true;
            if (performanceFilter !== 'all') {
                if (performanceFilter === 'excellent') {
                    matchesPerformance = (stats?.quizCount ?? 0) > 0 && (stats?.avgScore ?? 0) >= 85;
                } else if (performanceFilter === 'average') {
                    matchesPerformance = (stats?.quizCount ?? 0) > 0 && (stats?.avgScore ?? 0) >= 65 && (stats?.avgScore ?? 0) < 85;
                } else if (performanceFilter === 'low') {
                    matchesPerformance = (stats?.quizCount ?? 0) > 0 && (stats?.avgScore ?? 0) < 65;
                } else if (performanceFilter === 'inactive') {
                    matchesPerformance = (stats?.quizCount ?? 0) === 0;
                }
            }

            return matchesSearch && matchesCourse && matchesStatus && matchesPerformance;
        });
    }, [assignedStudents, studentSearch, courseFilter, statusFilter, performanceFilter, studentStatsMap]);

    // Fetch and sync private teacher notes from localStorage
    const handleOpenStudentDetails = (student: StudentUser) => {
        setSelectedStudent(student);
        const storedNote = localStorage.getItem(`teacher_note_${student.id}`) || '';
        setTeacherNote(storedNote);
        setSaveSuccess(false);
        setInfoModalTab('notes');
        setExpandedQuizId(null);
    };

    // Note saving mechanism with micro feedback loader
    const handleSaveTeacherNote = () => {
        if (!selectedStudent) return;
        if (!isApprovedTeacher) {
            alert('No tienes luz verde de administración para realizar esta acción.');
            return;
        }
        setIsSavingNote(true);
        setTimeout(() => {
            localStorage.setItem(`teacher_note_${selectedStudent.id}`, teacherNote);
            setIsSavingNote(false);
            setSaveSuccess(true);
            setTimeout(() => setSaveSuccess(false), 2000);
        }, 400);
    };

    // Subject/Video structured breakdown calculation for rendering
    const coursesProgressList = useMemo(() => {
        if (!selectedStudent || !courses) return [];
        const studentLevelIds = selectedStudent.enrolledCourseIds || [];
        const studentEnrolled = courses.filter(c => studentLevelIds.includes(c.id));

        return studentEnrolled.map(course => {
            const subjectsCalculations = (course.subjects || []).map(sub => {
                const directVideos = sub.videos || [];
                const blockVideos = sub.blocks?.flatMap(b => b.videos || []) || [];
                const totalVideos = [...directVideos, ...blockVideos];
                
                const watchedCount = totalVideos.filter(v => selectedStudent.watchedVideos?.includes(v.id)).length;
                const percent = totalVideos.length > 0 ? Math.round((watchedCount / totalVideos.length) * 100) : 0;

                return {
                    subjectId: sub.id,
                    subjectName: sub.name,
                    totalCount: totalVideos.length,
                    watchedCount,
                    percent
                };
            });

            return {
                courseId: course.id,
                courseName: course.name,
                subjects: subjectsCalculations
            };
        });
    }, [selectedStudent, courses]);

    // Student specific quizzes answers query
    const studentAnswersQuery = useQuery<StudentAnswer[]>({
        queryKey: ['studentAnswers', selectedStudent?.id],
        queryFn: () => api.fetchStudentAnswers(selectedStudent!.id),
        enabled: !!selectedStudent && !!user && !!user.id && !!auth?.currentUser
    });

    return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-fade-in" id="teacher-dashboard-viewport">
            {!teacherUser?.isApprovedForTutoring && (
                <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/60 rounded-2xl p-6 mb-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 animate-fade-in">
                    <div className="space-y-1">
                        <h3 className="font-bold text-amber-800 dark:text-amber-400 flex items-center gap-2">
                            <Clock className="w-5 h-5 animate-pulse" />
                            Cuenta en espera de aprobación por Administración (Gestión de Profesores)
                        </h3>
                        <p className="text-sm text-amber-700 dark:text-amber-300">
                            Tu solicitud de registro está siendo revisada por un administrador. Una vez aprobada por la sección de Gestión de Profesores, se te habilitará el acceso completo para asignarte alumnos y agendar tutorías.
                        </p>
                        <div className="flex flex-wrap gap-4 mt-2 text-xs text-amber-600 dark:text-amber-400">
                            <span><strong>Asignaturas registradas:</strong> {teacherUser?.subjects?.join(', ') || 'Ninguna'}</span>
                            <span><strong>Niveles:</strong> {teacherUser?.levels?.join(', ') || 'Ninguno'}</span>
                            <span><strong>Horarios indicados:</strong> {teacherUser?.schedules?.join(', ') || 'No indicado'}</span>
                        </div>
                    </div>
                    <span className="text-xs bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 px-3 py-1.5 rounded-full font-bold uppercase tracking-wider shrink-0">
                        En Revisión
                    </span>
                </div>
            )}

            {/* Header / Welcome Hero */}
            <div className="relative overflow-hidden bg-gradient-to-r from-indigo-700 via-indigo-800 to-indigo-900 rounded-2xl shadow-xl text-white p-8 md:p-12 mb-6 border border-indigo-950/20" id="welcome-banner">
                <div className="relative z-10 max-w-2xl">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-500/30 text-indigo-150 text-xs font-semibold uppercase tracking-wider">
                        <GraduationCap className="w-3.5 h-3.5" /> {t('teacherDashboard.portal')}
                    </span>
                    <Link to={ROUTES.ACCOUNT} className="group inline-block cursor-pointer mt-4 transition-all">
                        <h1 className="text-3xl md:text-5xl font-black tracking-tight group-hover:text-indigo-200 transition-colors flex items-center gap-3">
                            <span>{t('teacherDashboard.welcome')} {user?.name || ''}! 👋</span>
                            <span className="text-xs font-bold px-3 py-1 bg-indigo-950/40 text-indigo-200 rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 border border-indigo-500/30 shadow-sm">
                                ⚙️ {t('account.title')}
                            </span>
                        </h1>
                    </Link>
                    <p className="text-indigo-100 text-base md:text-lg mt-3 font-medium leading-relaxed">
                        {t('teacherDashboard.subtitle')}
                    </p>
                    
                    <div className="flex flex-wrap gap-4 mt-6 text-sm text-indigo-200">
                        <div className="flex items-center gap-2 bg-indigo-950/20 px-3 py-1.5 rounded-lg border border-indigo-500/25">
                            <span className="font-bold text-white">{t('teacherDashboard.specialty')}:</span>
                            <span>{teacherUser?.category || 'General'}</span>
                        </div>
                        <div className="flex items-center gap-2 bg-indigo-950/10 px-3 py-1.5 rounded-lg border border-indigo-500/20">
                            <span className="font-bold text-white">{t('teacherDashboard.channel')}:</span>
                            <span className="font-mono">{user?.email}</span>
                        </div>
                    </div>
                </div>
                
                {/* Visual decoration element */}
                <div className="absolute right-0 bottom-0 top-0 w-1/3 opacity-15 hidden md:block select-none pointer-events-none">
                    <GraduationCap className="h-full w-full object-contain -mr-12 text-indigo-400" />
                </div>
            </div>

            {/* Tab Switcher - Visual Hierarchy Enhancement */}
            <div className="flex border-b border-slate-200 dark:border-slate-700 mb-6 bg-slate-50 dark:bg-slate-800/40 p-1.5 rounded-xl max-w-md" id="section-tab-nav">
                <button
                    onClick={() => setActiveTab('overview')}
                    className={`flex-1 flex items-center justify-center gap-2 py-2 text-xs font-black rounded-lg transition-all ${
                        activeTab === 'overview'
                        ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm border border-slate-150 dark:border-slate-700'
                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-850 dark:hover:text-slate-200 hover:bg-slate-100/50 dark:hover:bg-slate-800/20'
                    }`}
                >
                    <TrendingUp className="w-4 h-4" /> {t('teacherDashboard.dailySummary')}
                </button>
                <button
                    onClick={() => setActiveTab('students')}
                    className={`flex-1 flex items-center justify-center gap-2 py-2 text-xs font-black rounded-lg transition-all relative ${
                        activeTab === 'students'
                        ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm border border-slate-150 dark:border-slate-700'
                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-850 dark:hover:text-slate-200 hover:bg-slate-100/50 dark:hover:bg-slate-800/20'
                    }`}
                >
                    <User className="w-4 h-4" /> {t('teacherDashboard.myStudents')}
                    {pendingChatsCount > 0 && (
                        <span className="absolute top-1 right-1 flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                        </span>
                    )}
                </button>
                <button
                    onClick={() => setActiveTab('schedule')}
                    className={`flex-1 flex items-center justify-center gap-2 py-2 text-xs font-black rounded-lg transition-all ${
                        activeTab === 'schedule'
                        ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-sm border border-indigo-200 dark:border-indigo-800'
                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-850 dark:hover:text-slate-200 hover:bg-slate-100/50 dark:hover:bg-slate-800/20'
                    }`}
                >
                    <Calendar className="w-4 h-4" /> {t('teacherDashboard.myAgenda')}
                </button>
            </div>

            {/* TAB 1: OVERVIEW DASHBOARD */}
            {activeTab === 'overview' && (
                <div className="space-y-8 animate-fade-in" id="overview-tab-content">
                    {/* --- NEW: PENDING TUTORING REQUESTS --- */}
                    <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm p-6 border border-slate-200/60 dark:border-slate-700">
                        <h3 className="font-black text-slate-900 dark:text-slate-50 mb-4">Tutorías Asignadas / Disponibles Pendientes</h3>
                        {pendingTutoringRequests.length > 0 ? (
                            <div className="space-y-4">
                                {pendingTutoringRequests.map(req => (
                                    <div key={req.id} className="p-4 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 flex justify-between items-center">
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <p className="font-bold">{req.subject}</p>
                                                {req.teacherId === 'first_available' && (
                                                    <span className="text-[10px] bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300 font-bold px-2 py-0.5 rounded-full">
                                                        Primer disponible
                                                    </span>
                                                )}
                                            </div>
                                            <p className="text-sm text-slate-600 dark:text-slate-400">{req.studentName} {req.date ? `• ${req.date} ${req.time || ''}` : ''}</p>
                                        </div>
                                        <button 
                                            onClick={() => navigate(ROUTES.TUTORING)}
                                            className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-bold hover:bg-primary/90 transition-colors"
                                        >
                                            Gestionar
                                        </button>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="text-sm text-slate-500">No tienes tutorías pendientes asignadas ni disponibles para tus materias.</p>
                        )}
                    </div>

                    {/* --- NEW: WORKLOAD SUMMARY --- */}
                    <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm p-6 border border-slate-200/60 dark:border-slate-700">
                        <div className="flex items-center justify-between mb-6">
                            <div>
                                <h3 className="font-black text-slate-900 dark:text-slate-50">Tu Carga de Trabajo</h3>
                                <p className="text-xs text-slate-500">Resumen de solicitudes de tutoría</p>
                            </div>
                            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 bg-slate-100 dark:bg-slate-700 px-2 py-1 rounded-lg">Esta semana</span>
                        </div>
                        <div className="flex flex-col md:flex-row items-center gap-6">
                            <div className="flex-1 w-full">
                                <WorkloadChart completed={completedTutoringCount} pending={pendingTutoringRequests.length} />
                            </div>
                            <div className="flex flex-col gap-3 w-full md:w-auto">
                                <div className="p-4 bg-emerald-50 dark:bg-emerald-950/20 rounded-xl border border-emerald-100 dark:border-emerald-900/40">
                                    <p className="text-xs font-bold text-emerald-800 dark:text-emerald-300">Completadas</p>
                                    <p className="text-2xl font-black text-emerald-900 dark:text-emerald-100">{completedTutoringCount}</p>
                                </div>
                                <div className="p-4 bg-amber-50 dark:bg-amber-950/20 rounded-xl border border-amber-100 dark:border-amber-900/40">
                                    <p className="text-xs font-bold text-amber-800 dark:text-amber-300">Pendientes</p>
                                    <p className="text-2xl font-black text-amber-900 dark:text-amber-100">{pendingTutoringRequests.length}</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Stats Bento Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                        {/* Box 1: Especialidad */}
                        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm p-6 border border-slate-200/60 dark:border-slate-705 flex flex-col justify-between hover:shadow-md transition">
                            <div className="flex items-start justify-between">
                                <div>
                                    <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Tu Especialidad</p>
                                    <h3 className="text-xl font-black text-slate-900 dark:text-slate-50 mt-1 truncate" title={teacherUser?.category || 'Multi-materia'}>
                                        {teacherUser?.category || 'Multi-materia'}
                                    </h3>
                                </div>
                                <span className="p-3 bg-indigo-50 dark:bg-indigo-950/30 text-indigo-600 dark:text-indigo-400 rounded-xl">
                                    <Compass className="w-6 h-6" />
                                </span>
                            </div>
                            <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-700 text-xs text-slate-500 flex items-center gap-1">
                                <CheckCircle className="w-3.5 h-3.5 text-green-500" />
                                <span>Canales de dudas asignados</span>
                            </div>
                        </div>

                        {/* Box 2: Dudas Alumnos */}
                        <button 
                            onClick={() => navigate(ROUTES.CHAT)}
                            className="text-left bg-white dark:bg-slate-800 rounded-2xl shadow-sm p-6 border border-slate-200/60 dark:border-slate-700 flex flex-col justify-between hover:shadow-md hover:border-primary/45 transition cursor-pointer group"
                        >
                            <div className="flex items-start justify-between">
                                <div>
                                    <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider group-hover:text-primary">Dudas Pendientes</p>
                                    <h3 className="text-3xl font-black text-slate-900 dark:text-slate-50 mt-1 flex items-center gap-2">
                                        {pendingChatsCount}
                                        {pendingChatsCount > 0 && (
                                            <span className="flex h-2.5 w-2.5 relative">
                                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                                                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500"></span>
                                            </span>
                                        )}
                                    </h3>
                                </div>
                                <span className="p-3 bg-red-50 dark:bg-red-950/35 text-red-600 dark:text-red-400 rounded-xl group-hover:bg-red-100 dark:group-hover:bg-red-950/50 transition">
                                    <MessageSquare className="w-6 h-6" />
                                </span>
                            </div>
                            <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-700 text-xs text-primary font-bold flex items-center justify-between w-full">
                                <span>Responder chats ahora</span>
                                <ArrowRight className="w-4 h-4 transform group-hover:translate-x-1 transition" />
                            </div>
                        </button>

                        {/* Box 3: Tutorías Grupales */}
                        <button
                            onClick={() => navigate(ROUTES.TUTORING)}
                            className="text-left bg-white dark:bg-slate-800 rounded-2xl shadow-sm p-6 border border-slate-200/60 dark:border-slate-700 flex flex-col justify-between hover:shadow-md hover:border-primary/45 transition cursor-pointer group"
                        >
                            <div className="flex items-start justify-between">
                                <div>
                                    <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider group-hover:text-primary">Tutorías</p>
                                    <h3 className="text-3xl font-black text-slate-900 dark:text-slate-50 mt-1">
                                        {pendingTutoringRequests.length}
                                    </h3>
                                </div>
                                <span className="p-3 bg-teal-50 dark:bg-teal-950/30 text-teal-600 dark:text-teal-400 rounded-xl group-hover:bg-teal-100 dark:group-hover:bg-teal-950/45 transition">
                                    <Video className="w-6 h-6" />
                                </span>
                            </div>
                            <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-700 text-xs text-primary font-bold flex items-center justify-between w-full">
                                <span>Ver calendario grupal</span>
                                <ArrowRight className="w-4 h-4 transform group-hover:translate-x-1 transition" />
                            </div>
                        </button>

                        {/* Box 4: Peticiones Temas */}
                        <button
                            onClick={() => navigate(ROUTES.REQUEST)}
                            className="text-left bg-white dark:bg-slate-800 rounded-2xl shadow-sm p-6 border border-slate-200/60 dark:border-slate-700 flex flex-col justify-between hover:shadow-md hover:border-primary/45 transition cursor-pointer group"
                        >
                            <div className="flex items-start justify-between">
                                <div>
                                    <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider group-hover:text-primary">Peticiones Alumnos</p>
                                    <h3 className="text-3xl font-black text-slate-900 dark:text-slate-50 mt-1">
                                        {pendingTopicRequests.length}
                                    </h3>
                                </div>
                                <span className="p-3 bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400 rounded-xl group-hover:bg-amber-100 dark:group-hover:bg-amber-950/45 transition">
                                    <Lightbulb className="w-6 h-6" />
                                </span>
                            </div>
                            <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-700 text-xs text-primary font-bold flex items-center justify-between w-full">
                                <span>Ver peticiones de contenido</span>
                                <ArrowRight className="w-4 h-4 transform group-hover:translate-x-1 transition" />
                            </div>
                        </button>
                    </div>

                    {/* Bottom Content Splits */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                        {/* Col 1 & 2: Recent Student Questions */}
                        <div className="lg:col-span-2 bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200/50 dark:border-slate-700 overflow-hidden overflow-x-auto">
                            <div className="p-6 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <span className="p-2 bg-indigo-50 dark:bg-indigo-950/45 text-indigo-600 dark:text-indigo-400 rounded-lg">
                                        <MessageSquare className="w-5 h-5" />
                                    </span>
                                    <div>
                                        <h3 className="font-extrabold text-slate-900 dark:text-slate-55">Dudas Recientes de Alumnos</h3>
                                        <p className="text-xs text-slate-500">Chats directos iniciados por estudiantes contigo</p>
                                    </div>
                                </div>
                            </div>

                            <div className="divide-y overflow-x-auto divide-slate-100 dark:divide-slate-700">
                                {teacherConversations.length > 0 ? (
                                    teacherConversations.slice(0, 5).map((conv) => (
                                        <div key={conv.id} className="p-6 hover:bg-slate-50 dark:hover:bg-slate-750 transition flex items-center justify-between gap-4">
                                            <div className="flex items-center gap-4 min-w-0">
                                                <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-750 flex items-center justify-center text-slate-600 font-bold border border-slate-200 shrink-0 uppercase">
                                                    {conv.studentName?.charAt(0) || <User className="w-5 h-5 text-slate-400" />}
                                                </div>
                                                <div className="min-w-0">
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-extrabold text-slate-900 dark:text-slate-50 truncate text-sm" title={conv.studentName || 'Estudiante'}>
                                                            {conv.studentName || 'Estudiante'}
                                                        </span>
                                                        {(conv.unreadByTeacher || conv.unreadByAdmin) && (
                                                            <span className="px-2 py-0.5 bg-red-500 text-white font-extrabold rounded-full text-[9px] uppercase tracking-wide">
                                                                NUEVO
                                                            </span>
                                                        )}
                                                    </div>
                                                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-1" title={conv.lastMessageText || 'Ningún mensaje todavía.'}>
                                                        {conv.lastMessageText || 'Ningún mensaje todavía.'}
                                                    </p>
                                                </div>
                                            </div>

                                            <button 
                                                onClick={() => {
                                                    const sUid = resolveUserUid(conv.studentId || conv.id);
                                                    const tUid = resolveUserUid(user);
                                                    const directId = getDirectChatId(sUid, tUid);
                                                    navigate(`${ROUTES.CHAT}?studentId=${sUid}`, { state: { activeChatType: 'peer', activeConvoId: directId } });
                                                }}
                                                className="shrink-0 px-4 py-2 border border-slate-200 dark:border-slate-600 hover:border-primary text-slate-700 dark:text-slate-350 hover:text-primary font-bold rounded-lg text-xs transition bg-white dark:bg-slate-800 hover:bg-slate-50 shadow-sm"
                                            >
                                                Ver Chat
                                            </button>
                                        </div>
                                    ))
                                ) : (
                                    <div className="p-12 text-center text-slate-500 dark:text-slate-400">
                                        <MessageSquare className="w-12 h-12 mx-auto text-slate-300 dark:text-slate-600 mb-4" />
                                        <p className="font-bold">No se han recibido dudas directas</p>
                                        <p className="text-xs mt-1">Cuando los estudiantes te manden una duda aparecerán aquí.</p>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Col 3: Side Widgets (Topic requests & Guidelines) */}
                        <div className="space-y-6">
                            {/* Temas Recientes Widget */}
                            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200/50 dark:border-slate-700 p-6">
                                <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-100 dark:border-slate-700">
                                    <h4 className="font-extrabold text-slate-900 dark:text-slate-50 flex items-center gap-2">
                                        <Lightbulb className="w-4 h-4 text-amber-500" /> Temas Propuestos
                                    </h4>
                                    <span className="text-xs font-bold text-slate-500">{pendingTopicRequests.length} pendientes</span>
                                </div>

                                <div className="space-y-3">
                                    {pendingTopicRequests.length > 0 ? (
                                        pendingTopicRequests.slice(0, 3).map((req) => (
                                            <div key={req.id} className="p-3.5 bg-slate-50 dark:bg-slate-900/40 rounded-xl border border-slate-200 dark:border-slate-700">
                                                <p className="text-xs font-bold text-slate-900 dark:text-slate-200">{req.topic}</p>
                                                <p className="text-[10px] text-slate-505 dark:text-slate-400 mt-1 line-clamp-2">{req.details}</p>
                                                <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-200/50 dark:border-slate-700">
                                                    <span className="text-[10px] text-slate-500 uppercase tracking-wide font-mono">Por: {req.studentName}</span>
                                                    <span className="text-[9px] px-1.5 py-0.5 bg-yellow-100 dark:bg-yellow-950/50 text-yellow-850 dark:text-yellow-400 rounded-full font-bold">Pendiente</span>
                                                </div>
                                            </div>
                                        ))
                                    ) : (
                                        <p className="text-center py-6 text-xs text-slate-500 dark:text-slate-400">Ninguna petición de tema pendiente.</p>
                                    )}
                                </div>
                            </div>

                            {/* Quick Guidelines Card */}
                            <div className="bg-gradient-to-br from-indigo-50/50 to-slate-50 dark:from-indigo-950/20 dark:to-slate-900 rounded-2xl shadow-sm border border-indigo-100/50 dark:border-indigo-900/30 p-6">
                                <h4 className="font-extrabold text-indigo-950 dark:text-indigo-200 flex items-center gap-2">
                                    <TrendingUp className="w-4 h-4 text-indigo-600" /> Normas de la Academia
                                </h4>
                                <ul className="text-xs text-indigo-900/85 dark:text-indigo-300 mt-3 space-y-2.5 list-disc list-inside leading-relaxed">
                                    <li>Responde a las dudas en menos de 24 horas hábiles.</li>
                                    <li>Mantén un tono empático, didáctico y motivador.</li>
                                    <li>Recomienda vídeos de los cursos de la plataforma.</li>
                                    <li>Estudia las peticiones de temas para sugerir grabaciones.</li>
                                </ul>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* TAB 2: ACTIVE STUDENT MANAGEMENT PORTAL */}
            {activeTab === 'students' && (
                <div className="space-y-6 animate-fade-in" id="students-tab-content">
                    
                    {/* Advanced student management alert/shortcut */}
                    <div className="bg-gradient-to-r from-primary/10 via-indigo-500/5 to-transparent p-4 sm:p-5 rounded-2xl border border-primary/20 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                        <div className="flex items-start gap-3">
                            <span className="p-2 bg-primary/10 text-primary rounded-xl shrink-0 mt-0.5">
                                <Sparkles className="w-5 h-5" />
                            </span>
                            <div>
                                <h4 className="font-extrabold text-slate-800 dark:text-slate-150 text-sm">¿Quieres elegir nuevos alumnos, ajustar créditos o editar permisos?</h4>
                                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Hemos habilitado un panel de Gestión de Alumnos completo para asignar estudiantes, configurar el asistente IA, habilitar videolecciones y redactar fichas académicas.</p>
                            </div>
                        </div>
                        <button
                            onClick={() => navigate(ROUTES.TEACHER_STUDENTS)}
                            className="flex items-center justify-center gap-1.5 px-4.5 py-2.5 bg-primary hover:bg-primary-dark text-white rounded-xl text-xs font-bold shadow-sm transition shrink-0"
                        >
                            <Users className="w-4 h-4" />
                            <span>Abrir Gestor Avanzado</span>
                        </button>
                    </div>

                    {/* Immersive Classroom Stats Section */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 bg-gradient-to-br from-slate-50 to-white dark:from-slate-900/20 dark:to-slate-800 p-4 rounded-2xl border border-slate-150 dark:border-slate-850">
                        <div className="p-4 bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-750 shadow-xs flex items-center gap-3">
                            <span className="p-2.5 bg-indigo-50 dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 rounded-xl shrink-0">
                                <Users className="w-5 h-5" />
                            </span>
                            <div>
                                <p className="text-[10px] font-extrabold uppercase text-slate-400 tracking-wider">Tus Alumnos Asignados</p>
                                <p className="text-2xl font-black text-slate-800 dark:text-slate-100">{teacherClassStats.total}</p>
                            </div>
                        </div>
                        
                        <div className="p-4 bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-750 shadow-xs flex items-center gap-3">
                            <span className="p-2.5 bg-emerald-50 dark:bg-slate-700 text-emerald-600 dark:text-emerald-400 rounded-xl shrink-0">
                                <Award className="w-5 h-5" />
                            </span>
                            <div>
                                <p className="text-[10px] font-extrabold uppercase text-slate-400 tracking-wider">Alumnos Premium ⭐</p>
                                <p className="text-2xl font-black text-slate-800 dark:text-slate-100">
                                    {teacherClassStats.premium} <span className="text-xs text-slate-400 font-medium font-mono">({teacherClassStats.total > 0 ? Math.round((teacherClassStats.premium / teacherClassStats.total) * 100) : 0}%)</span>
                                </p>
                            </div>
                        </div>

                        <div className="p-4 bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-750 shadow-xs flex items-center gap-3">
                            <span className="p-2.5 bg-indigo-50 dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 rounded-xl shrink-0">
                                <Sparkles className="w-5 h-5" />
                            </span>
                            <div>
                                <p className="text-[10px] font-extrabold uppercase text-slate-400 tracking-wider">Nota Media de Exámenes</p>
                                <p className="text-2xl font-black text-slate-800 dark:text-slate-100">{teacherClassStats.classAvgScore}%</p>
                            </div>
                        </div>

                        <div className={`p-4 bg-white dark:bg-slate-800 rounded-xl border shadow-xs flex items-center gap-3 ${teacherClassStats.alertCount > 0 ? 'border-amber-200 dark:border-amber-950 bg-amber-50/10' : 'border-slate-100 dark:border-slate-750'}`}>
                            <span className={`p-2.5 rounded-xl shrink-0 ${teacherClassStats.alertCount > 0 ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-700' : 'bg-slate-100 dark:bg-slate-700 text-slate-500'}`}>
                                <AlertTriangle className="w-5 h-5" />
                            </span>
                            <div>
                                <p className="text-[10px] font-extrabold uppercase text-slate-400 tracking-wider">Atención de Urgencia</p>
                                <p className={`text-2xl font-black ${teacherClassStats.alertCount > 0 ? 'text-amber-700 dark:text-amber-400' : 'text-slate-800 dark:text-slate-100'}`}>
                                    {teacherClassStats.alertCount} {teacherClassStats.alertCount > 0 && <span className="text-xs text-amber-500 font-bold animate-pulse">● Alertas</span>}
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Filters & Searh Engine */}
                    <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200/60 dark:border-slate-700 shadow-xs space-y-4" id="alumni-filter-deck">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                            <div className="flex items-center gap-2">
                                <span className="p-1.5 bg-slate-50 dark:bg-slate-700 rounded-lg text-slate-500"><SlidersHorizontal className="w-4 h-4" /></span>
                                <h3 className="font-extrabold text-slate-800 dark:text-slate-200">Filtros de Búsqueda y Alertas</h3>
                            </div>
                            <span className="text-xs font-semibold text-slate-400 font-mono">Mostrando {filteredStudents.length} de {assignedStudents.length} alumnos</span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                            {/* Input Buscar */}
                            <div className="relative">
                                <Search className="absolute left-3 top-2.5 w-4.5 h-4.5 text-slate-400" />
                                <input
                                    type="text"
                                    value={studentSearch}
                                    onChange={e => setStudentSearch(e.target.value)}
                                    placeholder="Buscar alumno por nombre o email..."
                                    className="w-full bg-slate-50/70 hover:bg-slate-50 focus:bg-white dark:bg-slate-900/60 dark:hover:bg-slate-900 dark:focus:bg-slate-950 text-slate-800 dark:text-slate-100 text-xs pl-10 pr-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 focus:ring-1 focus:ring-primary focus:border-primary outline-offset-1 placeholder-slate-400 transition"
                                />
                            </div>

                            {/* Dropdown del Curso */}
                            <div className="relative">
                                <select
                                    value={courseFilter}
                                    onChange={e => setCourseFilter(e.target.value)}
                                    className="appearance-none w-full bg-slate-50 hover:bg-slate-50 dark:bg-slate-900/60 dark:hover:bg-slate-900 text-slate-850 dark:text-slate-150 text-xs px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 focus:ring-1 focus:ring-primary focus:border-primary outline-none transition"
                                >
                                    <option value="all">📚 Todos los Cursos</option>
                                    {courses?.map(c => (
                                        <option key={c.id} value={c.id}>{c.name}</option>
                                    ))}
                                </select>
                                <ChevronDown className="absolute right-3.5 top-3 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                            </div>

                            {/* Filtro suscripción */}
                            <div className="relative">
                                <select
                                    value={statusFilter}
                                    onChange={e => setStatusFilter(e.target.value)}
                                    className="appearance-none w-full bg-slate-50 hover:bg-slate-50 dark:bg-slate-900/60 dark:hover:bg-slate-900 text-slate-850 dark:text-slate-150 text-xs px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 focus:ring-1 focus:ring-primary focus:border-primary outline-none transition"
                                >
                                    <option value="all font-semibold">🔒 Todas las Suscripciones</option>
                                    <option value="premium">⭐ Premium (Suscritos)</option>
                                    <option value="free">👤 Gratuitos (No suscritos)</option>
                                </select>
                                <ChevronDown className="absolute right-3.5 top-3 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                            </div>

                            {/* Filtro rendimiento / alerta */}
                            <div className="relative">
                                <select
                                    value={performanceFilter}
                                    onChange={e => setPerformanceFilter(e.target.value)}
                                    className="appearance-none w-full bg-slate-50 hover:bg-slate-50 dark:bg-slate-900/60 dark:hover:bg-slate-900 text-slate-850 dark:text-slate-150 text-xs px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 focus:ring-1 focus:ring-primary focus:border-primary outline-none transition"
                                >
                                    <option value="all">🎯 Tipo de Rendimiento</option>
                                    <option value="excellent text-emerald-600">🎯 Excelente (≥85% nota media)</option>
                                    <option value="average text-indigo-600">👍 Promedio (65% a 85% nota media)</option>
                                    <option value="low text-amber-600">⚠️ Requiere Atención (&lt;65% nota media)</option>
                                    <option value="inactive text-slate-400">💤 Inactivo (0 exámenes hechos)</option>
                                </select>
                                <ChevronDown className="absolute right-3.5 top-3 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                            </div>
                        </div>
                    </div>

                    {/* Students directory list */}
                    {usersLoading || coursesLoading ? (
                        <div className="flex justify-center items-center py-16 bg-white dark:bg-slate-800 rounded-2xl border border-slate-150 dark:border-slate-700 shadow-xs">
                            <div className="flex flex-col items-center gap-2">
                                <span className="animate-spin rounded-full h-8 w-8 border-4 border-primary border-t-transparent"></span>
                                <span className="text-xs text-slate-450 dark:text-slate-350 font-bold">Compilando portafolios de tus alumnos...</span>
                            </div>
                        </div>
                    ) : filteredStudents.length > 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5" id="alumni-cards-grid">
                            {filteredStudents.map(student => {
                                const stats = studentStatsMap[student.id];
                                const watchPercentage = stats && stats.totalCourseVideos > 0 
                                    ? Math.round((stats.completedVideos / stats.totalCourseVideos) * 100) 
                                    : 0;

                                // Has unread notifications or low performance warning
                                const convo = conversations?.find(c => c.studentId === student.id);
                                const hasUnread = convo?.unreadByAdmin || false;
                                const isFailing = stats && stats.quizCount > 0 && stats.avgScore < 60;

                                return (
                                    <div 
                                        key={student.id}
                                        className={`bg-white dark:bg-slate-800 rounded-2xl border p-5 flex flex-col justify-between hover:scale-[1.015] hover:shadow-md transition duration-200 relative overflow-hidden ${
                                            hasUnread 
                                            ? 'border-red-200 dark:border-red-950/40 shadow-xs shadow-red-50/50 bg-red-50/5' 
                                            : isFailing
                                            ? 'border-amber-200 dark:border-amber-950/40 bg-amber-50/5'
                                            : 'border-slate-150 dark:border-slate-705'
                                        }`}
                                    >
                                        {/* Highlight corner alerts */}
                                        {hasUnread && (
                                            <div className="absolute right-0 top-0 bg-red-600 text-white text-[9px] font-black tracking-wider uppercase px-2.5 py-0.5 rounded-bl-lg flex items-center gap-1">
                                                <MessageSquare className="w-2.5 h-2.5 animate-bounce" /> Mensaje nuevo
                                            </div>
                                        )}
                                        {isFailing && !hasUnread && (
                                            <div className="absolute right-0 top-0 bg-amber-500 text-slate-900 text-[9px] font-black tracking-wider uppercase px-2.5 py-0.5 rounded-bl-lg flex items-center gap-1">
                                                <AlertCircle className="w-2.5 h-2.5" /> Notas bajas
                                            </div>
                                        )}

                                        {/* Header Info */}
                                        <div>
                                            <div className="flex items-start gap-3.5">
                                                <div className="w-12 h-12 bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-400 rounded-full flex items-center justify-center font-black uppercase border border-indigo-100 dark:border-indigo-900 text-sm shrink-0">
                                                    {student.name.charAt(0)}
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <h4 className="font-extrabold text-sm text-slate-800 dark:text-slate-100 truncate pr-4" title={student.name}>{student.name}</h4>
                                                    </div>
                                                    <p className="text-[11px] text-slate-450 dark:text-slate-400 truncate mt-0.5" title={student.email}>{student.email}</p>
                                                    <div className="flex items-center gap-1.5 mt-2">
                                                        {student.isSubscribed ? (
                                                            <span className="text-[9px] font-extrabold bg-emerald-100/70 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-450 px-2 py-0.5 rounded-full uppercase tracking-wide">Premium ⭐</span>
                                                        ) : (
                                                            <span className="text-[9px] font-bold bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 px-2 py-0.5 rounded-full uppercase">Socio Gratuito</span>
                                                        )}
                                                        {student.enrolledCourseIds?.map(cId => {
                                                            const match = courses?.find(c => c.id === cId);
                                                            return match ? (
                                                                <span key={cId} className="text-[9px] font-black bg-indigo-50 dark:bg-slate-700 text-indigo-700 dark:text-indigo-300 px-2   py-0.5 rounded-full text-ellipsis truncate max-w-[100px]" title={match.name}>
                                                                    {match.name.split(' ')[0] || match.name}
                                                                </span>
                                                            ) : null;
                                                        })}
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Progress Sections */}
                                            <div className="mt-5 space-y-3.5 border-t border-slate-100 dark:border-slate-700/60 pt-4">
                                                {/* Visual Video progress tracker */}
                                                <div>
                                                    <div className="flex items-center justify-between text-[11px] mb-1 font-semibold">
                                                        <span className="text-slate-500 dark:text-slate-400">Clases del Curso Vistas:</span>
                                                        <span className="text-slate-800 dark:text-slate-200 font-bold font-mono">{stats?.completedVideos} / {stats?.totalCourseVideos} ({watchPercentage}%)</span>
                                                    </div>
                                                    <div className="w-full bg-slate-100 dark:bg-slate-900 rounded-full h-1.5 overflow-hidden overflow-x-auto">
                                                        <div 
                                                            className={`h-1.5 rounded-full transition-all duration-300 ${
                                                                watchPercentage > 80 ? 'bg-emerald-500' : watchPercentage > 40 ? 'bg-primary' : 'bg-indigo-300'
                                                            }`}
                                                            style={{ width: `${Math.min(watchPercentage, 100)}%` }} 
                                                        />
                                                    </div>
                                                </div>

                                                {/* Quiz & Assessments Results Summary */}
                                                <div className="flex justify-between items-center bg-slate-50 dark:bg-slate-900/50 p-2.5 rounded-xl text-[11px]">
                                                    <div className="flex items-center gap-1.5 text-slate-500">
                                                        <CheckCircle className={`w-3.5 h-3.5 shrink-0 ${stats && stats.quizCount > 0 ? 'text-indigo-500' : 'text-slate-400'}`} />
                                                        <span>Exámenes: <strong className="font-bold text-slate-750 dark:text-slate-300 font-mono">{stats?.quizCount ?? 0} hechos</strong></span>
                                                    </div>
                                                    
                                                    {stats && stats.quizCount > 0 ? (
                                                        <div className="flex items-center gap-1">
                                                            <span className="text-slate-450">Nota Media:</span>
                                                            <span className={`font-black uppercase tracking-tight py-0.5 px-1.5 rounded text-xs shrink-0 ${
                                                                stats.avgScore >= 85 
                                                                    ? 'text-emerald-700 bg-emerald-50 dark:bg-emerald-950/30' 
                                                                    : stats.avgScore >= 60 
                                                                        ? 'text-indigo-700 bg-indigo-50 dark:bg-slate-750' 
                                                                        : 'text-amber-700 bg-amber-50 dark:bg-amber-950/30 font-black animate-pulse'
                                                            }`}>
                                                                {stats.avgScore}%
                                                            </span>
                                                        </div>
                                                    ) : (
                                                        <span className="text-slate-400 italic text-[10px]">Sin calificaciones</span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Actions Footer */}
                                        <div className="mt-5 pt-4 border-t border-slate-100 dark:border-slate-755 flex items-center justify-between gap-3">
                                            <button
                                                type="button"
                                                onClick={() => handleOpenStudentDetails(student)}
                                                className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 border border-slate-200 dark:border-slate-650 hover:border-primary/80 dark:hover:border-slate-500 hover:bg-slate-50 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-200 font-black rounded-xl text-xs transition duration-150 shadow-xs cursor-pointer"
                                            >
                                                <StickyNote className="w-3.5 h-3.5" /> Ficha y Notas
                                            </button>

                                            <button
                                                type="button"
                                                onClick={() => {
                                                    const sUid = resolveUserUid(student.id || student);
                                                    const tUid = resolveUserUid(user);
                                                    const directId = getDirectChatId(sUid, tUid);
                                                    navigate(`${ROUTES.CHAT}?studentId=${sUid}`, { state: { activeChatType: 'peer', activeConvoId: directId } });
                                                }}
                                                className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 font-extrabold rounded-xl text-xs transition duration-150 border cursor-pointer shadow-xs ${
                                                    hasUnread 
                                                    ? 'bg-red-600 hover:bg-red-700 text-white border-red-600 animate-pulse' 
                                                    : 'bg-primary hover:bg-indigo-700 text-white border-indigo-600'
                                                }`}
                                            >
                                                <MessageSquare className="w-3.5 h-3.5" /> Chatear
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <div className="p-16 border-2 border-dashed border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-2xl text-center text-slate-500 dark:text-slate-400">
                            <Search className="w-12 h-12 mx-auto text-slate-300 dark:text-slate-650 mb-3" />
                            <p className="font-bold">No se han encontrado alumnos con los filtros activos</p>
                            <p className="text-xs mt-1">Prueba a reajustar los criterios de búsqueda o de rendimiento escolar de la cabecera.</p>
                            <button
                                onClick={() => {
                                    setStudentSearch('');
                                    setCourseFilter('all');
                                    setStatusFilter('all');
                                    setPerformanceFilter('all');
                                }}
                                className="mt-4 px-4 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 dark:bg-slate-700 dark:hover:bg-slate-650 dark:text-indigo-300 font-bold rounded-xl text-xs transition duration-150"
                            >
                                Limpiar Filtros
                            </button>
                        </div>
                    )}
                </div>
            )}

            {/* TAB 3: TUTORING SCHEDULE AVAILABILITY MANAGER */}
            {activeTab === 'schedule' && teacherUser && (
                <div className="space-y-6 animate-fade-in" id="schedule-tab-content">
                    <TeacherScheduleManager
                        teacher={teacherUser}
                        onSave={handleSaveTeacherSchedules}
                        isSaving={isSavingSchedules}
                    />
                </div>
            )}

            {/* HIGH-FIDELITY ACTIVE MODAL: STUDENT DETAILED FILE, PRIVATE NOTES & DIAGNOSTICS */}
            {selectedStudent && (
                <div 
                    className="fixed inset-0 z-[1000] overflow-y-auto" 
                    aria-labelledby="modal-title" 
                    role="dialog" 
                    aria-modal="true"
                    id="student-detailed-modal"
                >
                    <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
                        {/* Backdrop with Blur effect */}
                        <div 
                            className="fixed inset-0 bg-slate-900/60 dark:bg-black/75 backdrop-blur-sm transition-opacity" 
                            aria-hidden="true"
                            onClick={() => setSelectedStudent(null)}
                        />

                        {/* Centered card alignment trick */}
                        <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>

                        {/* Modal card content */}
                        <div className="inline-block align-bottom bg-white dark:bg-slate-800 rounded-2xl text-left overflow-hidden shadow-2xl transform transition-all sm:my-8 sm:align-middle sm:max-w-3xl sm:w-full border border-slate-250 dark:border-slate-700">
                            {/* Modal Header */}
                            <div className="bg-gradient-to-br from-indigo-50/50 to-indigo-100/10 dark:from-slate-900/30 dark:to-slate-800 p-6 border-b border-slate-150 dark:border-slate-700 flex items-center justify-between">
                                <div className="flex items-center gap-3.5">
                                    <div className="w-11 h-11 rounded-full bg-indigo-600 text-white font-black flex items-center justify-center uppercase shadow-sm shrink-0">
                                        {selectedStudent.name.charAt(0)}
                                    </div>
                                    <div>
                                        <h3 className="font-extrabold text-base text-slate-850 dark:text-slate-100 leading-tight">
                                            {selectedStudent.name}
                                        </h3>
                                        <p className="text-xs text-slate-500 font-medium">Expediente de seguimiento académico y tutorías</p>
                                    </div>
                                </div>
                                <button 
                                    onClick={() => setSelectedStudent(null)}
                                    className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-650 text-slate-550 dark:text-slate-305 transition shrink-0 cursor-pointer"
                                    title="Cerrar ventana"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>

                            {/* Modal Internal Navigation Tab Deck */}
                            <div className="flex border-b border-slate-150 dark:border-slate-700 px-6 py-2 gap-3 bg-slate-50/50 dark:bg-slate-900/10 text-xs">
                                <button
                                    onClick={() => setInfoModalTab('notes')}
                                    className={`py-2 px-3 rounded-lg font-black transition-all ${
                                        infoModalTab === 'notes'
                                        ? 'bg-indigo-55 bg-indigo-100 text-indigo-750 dark:bg-slate-700 dark:text-white'
                                        : 'text-slate-450 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                                    }`}
                                >
                                    📝 Ficha & Bloc de Notas
                                </button>
                                <button
                                    onClick={() => setInfoModalTab('subjects')}
                                    className={`py-2 px-3 rounded-lg font-black transition-all ${
                                        infoModalTab === 'subjects'
                                        ? 'bg-indigo-100 text-indigo-750 dark:bg-slate-700 dark:text-white'
                                        : 'text-slate-450 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                                    }`}
                                >
                                    📚 Progreso curricular
                                </button>
                                <button
                                    onClick={() => setInfoModalTab('quizzes')}
                                    className={`py-2 px-3 rounded-lg font-black transition-all ${
                                        infoModalTab === 'quizzes'
                                        ? 'bg-indigo-100 text-indigo-750 dark:bg-slate-700 dark:text-white'
                                        : 'text-slate-450 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                                    }`}
                                >
                                    🎯 Historial de Exámenes
                                </button>
                            </div>

                            {/* Modal Content Frame */}
                            <div className="p-6 max-h-[60vh] overflow-y-auto">
                                
                                {/* TAB A: FICHA COMPLETA & BLOC DE NOTAS */}
                                {infoModalTab === 'notes' && (
                                    <div className="space-y-6 animate-fade-in" id="modal-tab-notes">
                                        {/* Profiles Metadata Card */}
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-50 dark:bg-slate-900/30 p-4.5 rounded-xl border border-slate-150 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-300">
                                            <div className="space-y-3">
                                                <div className="flex items-center gap-2">
                                                    <Mail className="w-4 h-4 text-slate-400" />
                                                    <span>Email: <strong>{selectedStudent.email}</strong></span>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <Phone className="w-4 h-4 text-slate-400" />
                                                    <span>Teléfono: <strong>{selectedStudent.phone || 'No facilitado'}</strong></span>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <Calendar className="w-4 h-4 text-slate-400" />
                                                    <span>Fecha alta: <strong>{selectedStudent.registrationDate ? new Date(selectedStudent.registrationDate).toLocaleDateString() : 'Desconocida'}</strong></span>
                                                </div>
                                            </div>
                                            <div className="space-y-3">
                                                <div className="flex items-center gap-2">
                                                    <Award className="w-4 h-4 text-slate-400" />
                                                    <span>Suscripción: <strong className="text-emerald-700 bg-emerald-50 dark:bg-emerald-950/20 px-1.5 py-0.5 rounded uppercase font-extrabold tracking-wider">{selectedStudent.isSubscribed ? `Premium ⭐` : 'Free 👤'}</strong></span>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <Clock className="w-4 h-4 text-slate-400" />
                                                    <span>Periodo de Facturación: <strong>{selectedStudent.subscriptionPeriod === 'annual' ? 'Anual' : selectedStudent.subscriptionPeriod === 'monthly' ? 'Mensual' : 'Socio Inicial'}</strong></span>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <GraduationCap className="w-4 h-4 text-slate-400" />
                                                    <span>Nivel Educativo: <strong>{selectedStudent.enrolledCourseIds?.map(eId => courses?.find(c => c.id === eId)?.name).filter(Boolean).join(', ') || 'Sin inscribir'}</strong></span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Bloc De Notas Del Tutor */}
                                        <div className="space-y-2">
                                            <div className="flex items-center justify-between">
                                                <label className="text-xs font-black uppercase text-slate-500 tracking-wider flex items-center gap-1.5">
                                                    <StickyNote className="w-4 h-4 text-amber-500" /> Bloc de Notas Privado del Tutor
                                                </label>
                                                <span className="text-[10px] text-slate-400 italic">Visible solo para ti como tutor autorizado</span>
                                            </div>
                                            <textarea
                                                value={teacherNote}
                                                onChange={e => setTeacherNote(e.target.value)}
                                                disabled={!isApprovedTeacher}
                                                placeholder={isApprovedTeacher ? "Registra anotaciones cualitativas sobre este alumno: objetivos de estudio de Geometría, dificultades de cálculo, ritmo de tutorías, temarios repasados..." : "Debes recibir aprobación (luz verde) de un administrador para redactar anotaciones pedagógicas."}
                                                rows={6}
                                                className="w-full bg-slate-55 bg-slate-50 hover:bg-slate-50 focus:bg-white dark:bg-slate-900/50 dark:hover:bg-slate-900 dark:focus:bg-slate-950 text-slate-800 dark:text-slate-100 text-xs p-4 rounded-xl border border-slate-200 dark:border-slate-850 outline-none focus:ring-1 focus:ring-primary focus:border-primary placeholder-slate-400 leading-relaxed font-sans transition shadow-inner disabled:opacity-75 disabled:cursor-not-allowed"
                                            />
                                            
                                            <div className="flex items-center justify-end gap-3 pt-1">
                                                {!isApprovedTeacher && (
                                                    <span className="text-[10px] text-amber-600 dark:text-amber-400 font-bold bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 px-2 py-1 rounded-lg">
                                                        ⚠️ Deshabilitado por falta de aprobación (Luz verde)
                                                    </span>
                                                )}
                                                {saveSuccess && (
                                                    <span className="text-xs text-emerald-500 font-bold flex items-center gap-1 animate-fade-in">
                                                        ¡Guardado con éxito! ✨
                                                    </span>
                                                )}
                                                <button
                                                    type="button"
                                                    onClick={handleSaveTeacherNote}
                                                    disabled={isSavingNote || !isApprovedTeacher}
                                                    className="px-4.5 py-2 bg-primary hover:bg-indigo-750 text-white font-extrabold text-xs rounded-xl transition duration-150 shadow-sm outline-none disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                                                >
                                                    {isSavingNote ? 'Guardando anotación...' : 'Guardar Comentario 💾'}
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* TAB B: PROGRESO DETALLADO POR MATERIAS */}
                                {infoModalTab === 'subjects' && (
                                    <div className="space-y-6 animate-fade-in" id="modal-tab-subjects">
                                        {coursesProgressList.length > 0 ? (
                                            coursesProgressList.map(course => (
                                                <div key={course.courseId} className="space-y-3">
                                                    <h4 className="text-xs font-black text-slate-800 dark:text-slate-100 uppercase tracking-wider pb-1 border-b border-slate-150 dark:border-slate-700 flex items-center gap-2">
                                                        <span>📚 Nivel Enrolado: {course.courseName}</span>
                                                    </h4>
                                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                        {course.subjects.map(subject => (
                                                            <div key={subject.subjectId} className="bg-slate-50 dark:bg-slate-900/30 p-3.5 rounded-xl border border-slate-150 dark:border-slate-800 text-xs text-slate-650 dark:text-slate-350 flex flex-col justify-between gap-2.5">
                                                                <div className="flex justify-between items-start gap-4">
                                                                    <span className="font-extrabold text-slate-800 dark:text-slate-100 leading-snug">{subject.subjectName}</span>
                                                                    <span className="text-[10px] font-bold font-mono text-indigo-700 bg-indigo-50 dark:bg-slate-750 p-1 rounded">
                                                                        {subject.percent}%
                                                                    </span>
                                                                </div>
                                                                
                                                                <div>
                                                                    <div className="w-full bg-slate-200 dark:bg-slate-905 bg-slate-200 dark:bg-slate-800 rounded-full h-1.5 overflow-hidden overflow-x-auto">
                                                                        <div 
                                                                            className="h-1.5 rounded-full bg-indigo-600 transition-all duration-300"
                                                                            style={{ width: `${subject.percent}%` }}
                                                                        />
                                                                    </div>
                                                                    <p className="text-[10px] text-slate-450 mt-1.5">
                                                                        Vistos: <strong className="text-slate-700 dark:text-slate-300 font-black">{subject.watchedCount}</strong> clases de un total de <strong className="text-indigo-650 dark:text-indigo-400 font-bold">{subject.totalCount || 0}</strong>.
                                                                    </p>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            ))
                                        ) : (
                                            <p className="py-6 text-center text-xs text-slate-500 italic">Este alumno no está asignado a ninguna materia del catálogo en este momento.</p>
                                        )}
                                    </div>
                                )}

                                {/* TAB C: HISTORIAL DE EXÁMENES Y QUIZZES CON SUIT DE RESPUESTAS */}
                                {infoModalTab === 'quizzes' && (
                                    <div className="space-y-4 animate-fade-in" id="modal-tab-quizzes">
                                        {studentAnswersQuery.isLoading ? (
                                            <div className="flex justify-center items-center py-12">
                                                <span className="animate-spin inline-block w-6 h-6 rounded-full border-2 border-primary border-t-transparent"></span>
                                            </div>
                                        ) : studentAnswersQuery.data && studentAnswersQuery.data.length > 0 ? (
                                            <div className="space-y-3">
                                                <p className="text-xs text-slate-450 font-semibold mb-2">Exámenes interactivos rendidos por el alumno. Pulsa en cada examen para ver reactivos, respuestas del alumno y justificaciones detalladas.</p>
                                                {studentAnswersQuery.data.map((ans, idx) => {
                                                    const quizName = videoTitleMap.get(ans.videoId) || `Quiz del vídeo ${ans.videoId}`;
                                                    const scorePercentage = Math.round((ans.score / ans.totalQuestions) * 100);
                                                    const isExpanded = expandedQuizId === ans.quizId + ans.timestamp;

                                                    return (
                                                        <div key={ans.quizId + ans.timestamp} className="bg-white dark:bg-slate-800 rounded-xl border border-slate-150 dark:border-slate-800 shadow-xs overflow-hidden transition">
                                                            <div 
                                                                onClick={() => setExpandedQuizId(isExpanded ? null : ans.quizId + ans.timestamp)}
                                                                className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/40 hover:bg-slate-50 dark:bg-slate-900/10 dark:hover:bg-slate-900/30 cursor-pointer transition"
                                                            >
                                                                <div className="space-y-1">
                                                                    <p className="text-xs font-extrabold text-slate-850 dark:text-slate-100">{quizName}</p>
                                                                    <div className="flex items-center gap-3.5 text-[10px] text-slate-450">
                                                                        <span>Tomado el: <strong>{new Date(ans.timestamp).toLocaleDateString()} {new Date(ans.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</strong></span>
                                                                        <span>Reactivos: <strong>{ans.totalQuestions}</strong></span>
                                                                    </div>
                                                                </div>

                                                                <div className="flex items-center gap-3 justify-between sm:justify-start">
                                                                    <div className="flex items-center gap-2">
                                                                        <span className="text-[10px] text-slate-450">Aciertos:</span>
                                                                        <span className="text-xs font-bold font-mono text-slate-705 dark:text-slate-300">({ans.score} / {ans.totalQuestions})</span>
                                                                    </div>

                                                                    <div className="flex items-center gap-2">
                                                                        <span className={`text-xs font-black py-0.5 px-2 rounded-lg font-mono ${
                                                                            scorePercentage >= 80 
                                                                                ? 'text-emerald-700 bg-emerald-50 dark:bg-emerald-950/20' 
                                                                                : scorePercentage >= 60 
                                                                                    ? 'text-indigo-700 bg-indigo-50 dark:bg-slate-750' 
                                                                                    : 'text-red-700 bg-red-50 dark:bg-red-950/20 font-extrabold animate-pulse'
                                                                        }`}>
                                                                            {scorePercentage}%
                                                                        </span>
                                                                        {isExpanded ? (
                                                                            <ChevronUp className="w-4 h-4 text-slate-400 shrink-0" />
                                                                        ) : (
                                                                            <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            </div>

                                                            {isExpanded && (
                                                                <div className="border-t border-slate-100 dark:border-slate-800 p-4">
                                                                    <QuizSubmissionDetails videoId={ans.videoId} answer={ans} />
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        ) : (
                                            <div className="p-10 text-center text-slate-500 dark:text-slate-400">
                                                <Award className="w-10 h-10 mx-auto text-slate-300 dark:text-slate-650 mb-2" />
                                                <p className="font-bold">Este alumno no ha realizado ningún examen curricular interactivo todavía</p>
                                                <p className="text-[11px] mt-1">Cuando resuelva evaluaciones del portal, las verás desglosadas aquí paso a paso.</p>
                                            </div>
                                        )}
                                    </div>
                                )}

                            </div>

                            {/* Modal Footer actions */}
                            <div className="bg-slate-50 dark:bg-slate-900/30 px-6 py-4 border-t border-slate-150 dark:border-slate-700 flex items-center justify-between text-xs font-medium">
                                <span className="text-slate-400 italic font-mono text-[10px]">ID: {selectedStudent.id}</span>
                                <div className="flex gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setSelectedStudent(null)}
                                        className="px-4 py-2 border border-slate-205 hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-200 font-extrabold rounded-xl transition cursor-pointer"
                                    >
                                        Cerrar Expediente
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            const peerConvoId = `peer_${selectedStudent.id}_${user?.id}`;
                                            setSelectedStudent(null);
                                            navigate(`${ROUTES.CHAT}?studentId=${selectedStudent.id}`, { state: { activeChatType: 'peer', activeConvoId: peerConvoId } });
                                        }}
                                        className="px-4.5 py-2 bg-primary hover:bg-indigo-755 text-white font-black rounded-xl transition cursor-pointer flex items-center gap-1.5 shadow-sm"
                                    >
                                        <MessageSquare className="w-3.5 h-3.5" /> Abrir Canal de Tutoría
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
