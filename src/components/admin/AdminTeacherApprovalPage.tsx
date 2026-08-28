import React, { useContext, useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { auth } from '../../services/firebase';
import { useNavigate } from 'react-router-dom';
import * as api from '../../services/api';
import { TeacherUser, StudentUser, Conversation } from '../../types';
import { NotificationContext } from '../../contexts/NotificationContext';
import { AppConfigContext } from '../../contexts/AppConfigContext';
import { useAuth } from '../../contexts/AuthContext';
import { motion, AnimatePresence } from 'motion/react';
import { Button } from '../ui/Button';
import { ConfirmationModal } from '../ConfirmationModal';
import { ROUTES } from '../../constants/routes';
import { 
    Check, 
    X, 
    ChevronDown, 
    ChevronUp, 
    Edit3, 
    Save, 
    Clock, 
    BookOpen, 
    Award, 
    CheckCircle2, 
    Search,
    UserCheck,
    UserX,
    Phone,
    Mail,
    Sparkles,
    Calendar,
    Filter,
    GraduationCap,
    SlidersHorizontal,
    Inbox,
    Trash,
    Plus,
    Video,
    MessageSquare,
    Lock,
    Pencil
} from 'lucide-react';

const TEACHER_SUBJECT_OPTIONS = [
    "Matemáticas",
    "Física y Química",
    "Biología y Geología",
    "Lengua Castellana y Literatura",
    "Inglés"
];

const TEACHER_LEVEL_OPTIONS = [
    "1º E.S.O.",
    "2º E.S.O.",
    "3º E.S.O.",
    "4º E.S.O.",
    "1º Bachillerato",
    "2º Bachillerato"
];

export interface AdminTeacherApprovalPageProps {
    hideHeader?: boolean;
    onOpenCommunication?: (recipient: { type: 'specific'; userId: string; userType: 'student' | 'teacher' }, tab?: 'message' | 'test_whatsapp') => void;
}

export const AdminTeacherApprovalPage: React.FC<AdminTeacherApprovalPageProps> = ({ hideHeader, onOpenCommunication }) => {
    const { user } = useAuth();
    const queryClient = useQueryClient();
    const navigate = useNavigate();
    const { addToast } = useContext(NotificationContext);
    const { appConfig } = useContext(AppConfigContext);

    const initialSeenTeacherIds = useMemo(() => {
        try {
            return JSON.parse(localStorage.getItem('seenTeacherUserIds') || '[]');
        } catch (e) {
            return [];
        }
    }, []);
    
    // States
    const [activeTab, setActiveTab] = useState<'teachers' | 'requests'>('teachers');
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState<'all' | 'approved' | 'revoked'>('all');
    const [subjectFilter, setSubjectFilter] = useState<string>('all');
    const [expandedTeacherId, setExpandedTeacherId] = useState<string | null>(null);

    // Dialog & extra states
    const [isCreateTeacherModalOpen, setIsCreateTeacherModalOpen] = useState(false);
    const [teacherToDelete, setTeacherToDelete] = useState<TeacherUser | null>(null);

    // Editing State for Expanded Teacher
    const [editSubjects, setEditSubjects] = useState<string[]>([]);
    const [editLevels, setEditLevels] = useState<string[]>([]);
    const [editTaughtCourseIds, setEditTaughtCourseIds] = useState<string[]>([]);
    const [customSubjectInput, setCustomSubjectInput] = useState<string>('');
    const [editSchedules, setEditSchedules] = useState<string>('');
    const [editCategory, setEditCategory] = useState<string>('');
    const [editAiEnabled, setEditAiEnabled] = useState<boolean>(true);
    const [editVideosEnabled, setEditVideosEnabled] = useState<boolean>(true);
    const [editCanEditContent, setEditCanEditContent] = useState<boolean>(true);

    // Fetching data
    const { data: teachers, isLoading: isTeachersLoading, isError: isTeachersError } = useQuery({ 
        queryKey: ['teachers'], 
        queryFn: api.fetchTeachers 
    });

    const { data: courses } = useQuery({ 
        queryKey: ['courses'], 
        queryFn: api.fetchCourses 
    });
    
    const { data: requests, isLoading: isRequestsLoading, isError: isRequestsError } = useQuery({ 
        queryKey: ['tutoringRequests'], 
        queryFn: api.fetchTutoringRequests 
    });

    const { data: users } = useQuery<StudentUser[]>({
        queryKey: ['users'],
        queryFn: api.fetchUsers
    });

    const { data: conversations } = useQuery<Conversation[]>({
        queryKey: ['conversations', user?.id],
        queryFn: () => user?.id ? api.fetchUserChatsFromFirestore(user.id) : Promise.resolve([]),
        enabled: !!user && !!user.id && user.id === auth?.currentUser?.uid
    });

    // Mutations
    const createTeacherMutation = useMutation({
        mutationFn: (data: { name: string; email: string; password?: string; phone: string; category: string }) => api.createTeacher(data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['teachers'] });
            setIsCreateTeacherModalOpen(false);
            addToast('Profesor registrado con éxito.', 'success');
        },
        onError: () => {
            addToast('Error al registrar el profesor.', 'error');
        }
    });

    const deleteTeacherMutation = useMutation({
        mutationFn: (teacherId: string) => api.deleteTeacher(teacherId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['teachers'] });
            queryClient.invalidateQueries({ queryKey: ['users'] });
            queryClient.invalidateQueries({ queryKey: ['tutoringRequests'] });
            queryClient.invalidateQueries({ queryKey: ['conversations'] });
            queryClient.invalidateQueries({ queryKey: ['peer-conversations'] });
            queryClient.invalidateQueries({ queryKey: ['messages'] });
            queryClient.invalidateQueries({ queryKey: ['teacher-messages'] });
            setTeacherToDelete(null);
            addToast('Profesor eliminado con éxito.', 'success');
        },
        onError: () => {
            setTeacherToDelete(null);
            addToast('Error al eliminar el profesor.', 'error');
        },
        onSettled: () => {
            setTeacherToDelete(null);
        }
    });

    const updatePermissionsMutation = useMutation({
        mutationFn: (data: { userId: string; role: 'student' | 'teacher'; aiEnabled: boolean; videosEnabled: boolean }) =>
            api.updateUserPermissions(data.userId, data.role, { aiEnabled: data.aiEnabled, videosEnabled: data.videosEnabled }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['teachers'] });
            addToast('Permisos actualizados con éxito.', 'success');
        },
        onError: () => {
            addToast('Error al actualizar permisos.', 'error');
        }
    });

    const updateTeacherMutation = useMutation({
        mutationFn: ({ teacherId, data }: { teacherId: string; data: any }) => 
            api.updateTeacherDetails(teacherId, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['teachers'] });
            addToast('Datos del profesor actualizados con éxito.', 'success');
            setExpandedTeacherId(null);
        },
        onError: () => {
            addToast('Error al actualizar los datos del profesor.', 'error');
        }
    });

    const convertToStudentMutation = useMutation({
        mutationFn: (teacherEmail: string) => api.assignUserRoleByEmail({ email: teacherEmail, role: 'student' }),
        onSuccess: (res) => {
            queryClient.invalidateQueries({ queryKey: ['teachers'] });
            queryClient.invalidateQueries({ queryKey: ['users'] });
            addToast(res.message || `Profesor convertido a alumno correctamente.`, 'success');
            setExpandedTeacherId(null);
        },
        onError: (err: any) => {
            addToast(err?.message || 'Error al cambiar el rol del usuario.', 'error');
        }
    });

    const toggleApprovalMutation = useMutation({
        mutationFn: ({ teacherId, isApproved }: { teacherId: string; isApproved: boolean }) => 
            api.updateTeacherApproval(teacherId, isApproved),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['teachers'] });
            addToast('Estado de aprobación actualizado.', 'success');
        },
        onError: () => {
            addToast('Error al actualizar el estado de aprobación.', 'error');
        }
    });

    const updateRequestStatusMutation = useMutation({
        mutationFn: ({ requestId, status }: { requestId: string; status: 'confirmed' }) => 
            api.updateTutoringRequestStatus(requestId, status),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['tutoringRequests'] });
            addToast('Solicitud aprobada.', 'success');
        },
        onError: () => {
            addToast('Error al aprobar solicitud.', 'error');
        }
    });

    // Handle expand/collapse teacher card
    const handleExpandTeacher = (teacher: TeacherUser) => {
        if (expandedTeacherId === teacher.id) {
            setExpandedTeacherId(null);
        } else {
            setExpandedTeacherId(teacher.id);
            setEditSubjects(teacher.subjects || []);
            setEditLevels(teacher.levels || []);
            setEditTaughtCourseIds(teacher.taughtCourseIds || teacher.coursesTaughtIds || teacher.levels || []);
            setEditSchedules(teacher.schedules?.[0] || '');
            setEditCategory(teacher.category || '');
            setEditAiEnabled(teacher.aiEnabled !== false);
            setEditVideosEnabled(teacher.videosEnabled !== false);
            setEditCanEditContent(teacher.canEditContent !== false);
            setCustomSubjectInput('');
        }
    };

    // Save edited details
    const handleSaveDetails = (teacherId: string) => {
        updateTeacherMutation.mutate({
            teacherId,
            data: {
                subjects: editSubjects,
                levels: editLevels.length > 0 ? editLevels : editTaughtCourseIds,
                taughtCourseIds: editTaughtCourseIds,
                coursesTaughtIds: editTaughtCourseIds,
                schedules: [editSchedules],
                category: editCategory || (editSubjects[0] ?? 'General'),
                aiEnabled: editAiEnabled,
                videosEnabled: editVideosEnabled,
                canEditContent: editCanEditContent
            }
        });
    };

    // Filter Logic
    const filteredTeachers = useMemo(() => {
        if (!teachers) return [];
        return teachers.filter(t => {
            const matchesSearch = t.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                t.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
                (t.category && t.category.toLowerCase().includes(searchTerm.toLowerCase()));
            
            const matchesStatus = statusFilter === 'all' 
                ? true 
                : statusFilter === 'approved' 
                    ? t.isApprovedForTutoring 
                    : !t.isApprovedForTutoring;
                    
            const matchesSubject = subjectFilter === 'all'
                ? true
                : t.subjects?.includes(subjectFilter);
                
            return matchesSearch && matchesStatus && matchesSubject;
        });
    }, [teachers, searchTerm, statusFilter, subjectFilter]);

    const pendingRequests = useMemo(() => {
        return requests?.filter(r => r.status === 'pending') || [];
    }, [requests]);

    // Counters for Filter Badges
    const counts = useMemo(() => {
        const res = {
            total: teachers?.length || 0,
            approved: 0,
            revoked: 0
        };
        teachers?.forEach(t => {
            if (t.isApprovedForTutoring) res.approved++;
            else res.revoked++;
        });
        return res;
    }, [teachers]);

    if (isTeachersLoading || isRequestsLoading) {
        return (
            <div className="p-6 flex items-center justify-center min-h-[400px]">
                <div className="flex flex-col items-center gap-4">
                    <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-600 dark:border-indigo-400"></div>
                    <p className="text-slate-500 dark:text-slate-400 font-bold text-sm">Cargando panel de profesores...</p>
                </div>
            </div>
        );
    }

    if (isTeachersError || isRequestsError) {
        return (
            <div className="p-6 text-center max-w-md mx-auto my-12 bg-rose-50 dark:bg-rose-950/20 rounded-2xl border border-rose-100 dark:border-rose-900/30">
                <p className="font-black text-rose-700 dark:text-rose-400 text-lg">Error al cargar datos</p>
                <p className="text-sm mt-2 text-rose-600 dark:text-rose-450">Por favor, inténtalo de nuevo más tarde o verifica la conexión.</p>
            </div>
        );
    }

    return (
        <div className={`${hideHeader ? '' : 'p-6 max-w-7xl mx-auto'} space-y-8 animate-slide-in-up`}>
            {/* Elegant Header */}
            {hideHeader ? (
                <div className="flex justify-end gap-3 mb-2">
                    <Button onClick={() => setIsCreateTeacherModalOpen(true)} className="shadow-sm">
                        + Registrar Profesor
                    </Button>
                </div>
            ) : (
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div>
                        <h1 className="text-3xl font-black tracking-tight text-slate-900 dark:text-slate-50 flex items-center gap-2">
                            <Sparkles className="w-8 h-8 text-indigo-600 dark:text-indigo-400" />
                            Gestión de Profesores
                        </h1>
                        <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
                            Controla el personal docente, autoriza asignaturas/niveles, ajusta horarios de tutorías y valida solicitudes de alumnos.
                        </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                        <Button onClick={() => setIsCreateTeacherModalOpen(true)} className="shadow-md">
                            + Registrar Profesor
                        </Button>
                    </div>
                </div>
            )}

            {/* Reorganized KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-100 dark:border-slate-700/60 shadow-sm flex items-center gap-4 hover:border-indigo-100 dark:hover:border-slate-700 transition duration-200">
                    <div className="p-3 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 rounded-xl">
                        <Award className="w-6 h-6" />
                    </div>
                    <div>
                        <p className="text-xs text-slate-500 dark:text-slate-400 font-black uppercase tracking-wider">Total Profesores</p>
                        <h3 className="text-2xl font-black text-slate-900 dark:text-slate-50 mt-1">{counts.total}</h3>
                    </div>
                </div>

                <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-100 dark:border-slate-700/60 shadow-sm flex items-center gap-4 hover:border-emerald-100 dark:hover:border-slate-700 transition duration-200">
                    <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 rounded-xl">
                        <UserCheck className="w-6 h-6" />
                    </div>
                    <div>
                        <p className="text-xs text-slate-500 dark:text-slate-400 font-black uppercase tracking-wider">Acceso Concedido</p>
                        <h3 className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1">
                            {counts.approved}
                        </h3>
                    </div>
                </div>

                <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-100 dark:border-slate-700/60 shadow-sm flex items-center gap-4 hover:border-rose-100 dark:hover:border-slate-700 transition duration-200">
                    <div className="p-3 bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 rounded-xl">
                        <UserX className="w-6 h-6" />
                    </div>
                    <div>
                        <p className="text-xs text-slate-500 dark:text-slate-400 font-black uppercase tracking-wider">Acceso Revocado</p>
                        <h3 className="text-2xl font-black text-rose-600 dark:text-rose-450 mt-1">
                            {counts.revoked}
                        </h3>
                    </div>
                </div>

                <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-100 dark:border-slate-700/60 shadow-sm flex items-center gap-4 hover:border-amber-100 dark:hover:border-slate-700 transition duration-200">
                    <div className="p-3 bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 rounded-xl">
                        <Clock className="w-6 h-6 animate-pulse" />
                    </div>
                    <div>
                        <p className="text-xs text-slate-500 dark:text-slate-400 font-black uppercase tracking-wider">Tutorías Pendientes</p>
                        <h3 className="text-2xl font-black text-amber-600 dark:text-amber-500 mt-1">{pendingRequests.length}</h3>
                    </div>
                </div>
            </div>

            {/* Navigation Tabs */}
            <div className="flex border-b border-slate-100 dark:border-slate-700/80 gap-6">
                <button
                    onClick={() => setActiveTab('teachers')}
                    className={`pb-3 text-sm font-black border-b-2 transition-all duration-200 flex items-center gap-2 relative ${
                        activeTab === 'teachers' 
                            ? 'border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400' 
                            : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
                    }`}
                >
                    <GraduationCap className="w-4 h-4" />
                    Profesores Registrados
                    <span className="ml-1.5 px-2 py-0.5 text-xs font-bold rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                        {counts.total}
                    </span>
                </button>
                <button
                    onClick={() => setActiveTab('requests')}
                    className={`pb-3 text-sm font-black border-b-2 transition-all duration-200 flex items-center gap-2 relative ${
                        activeTab === 'requests' 
                            ? 'border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400' 
                            : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
                    }`}
                >
                    <Clock className="w-4 h-4" />
                    Peticiones de Tutoría
                    {pendingRequests.length > 0 && (
                        <span className="ml-1.5 px-2 py-0.5 text-xs font-black rounded-full bg-amber-500 text-white animate-pulse">
                            {pendingRequests.length}
                        </span>
                    )}
                </button>
            </div>

            {/* Tabs Content */}
            <AnimatePresence mode="wait">
                {activeTab === 'teachers' ? (
                    <motion.div
                        key="teachers-tab"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="space-y-6"
                    >
                        {/* Search & Smart Filters Panel */}
                        <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-100 dark:border-slate-700/60 shadow-sm flex flex-col lg:flex-row gap-4 items-center justify-between">
                            <div className="relative w-full lg:max-w-md">
                                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                                <input
                                    type="text"
                                    placeholder="Buscar por nombre, correo o especialidad..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="w-full pl-10 pr-4 py-2 bg-slate-50 dark:bg-slate-750 border border-slate-200/60 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-900 dark:text-slate-50 text-sm transition"
                                />
                            </div>

                            <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
                                <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 text-xs font-bold uppercase tracking-wider">
                                    <Filter className="w-3.5 h-3.5" /> Filtrar:
                                </div>
                                
                                {/* Status Select Filter */}
                                <select
                                    value={statusFilter}
                                    onChange={(e) => setStatusFilter(e.target.value as any)}
                                    className="px-3 py-1.5 bg-slate-50 dark:bg-slate-750 border border-slate-200/60 dark:border-slate-700 rounded-xl text-slate-750 dark:text-slate-300 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                                >
                                    <option value="all">Todos los estados</option>
                                    <option value="approved">Acceso Concedido</option>
                                    <option value="revoked">Acceso Revocado</option>
                                </select>

                                {/* Subject Select Filter */}
                                <select
                                    value={subjectFilter}
                                    onChange={(e) => setSubjectFilter(e.target.value)}
                                    className="px-3 py-1.5 bg-slate-50 dark:bg-slate-750 border border-slate-200/60 dark:border-slate-700 rounded-xl text-slate-750 dark:text-slate-300 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                                >
                                    <option value="all">Todas las asignaturas</option>
                                    {TEACHER_SUBJECT_OPTIONS.map(subj => (
                                        <option key={subj} value={subj}>{subj}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        {/* List of Teachers */}
                        <div className="grid grid-cols-1 gap-4">
                            {filteredTeachers.map(teacher => {
                                const isExpanded = expandedTeacherId === teacher.id;
                                return (
                                    <div 
                                        key={teacher.id} 
                                        className={`bg-white dark:bg-slate-800 rounded-2xl border transition-all duration-300 ${
                                            isExpanded 
                                                ? 'border-indigo-500/40 dark:border-indigo-500/30 shadow-md ring-1 ring-indigo-500/5' 
                                                : 'border-slate-100 dark:border-slate-700/50 hover:border-slate-200 dark:hover:border-slate-600 shadow-sm'
                                        }`}
                                    >
                                        {/* Main Summary Header */}
                                        <div 
                                            onClick={() => handleExpandTeacher(teacher)}
                                            className="p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 cursor-pointer select-none"
                                        >
                                            <div className="flex items-center gap-4">
                                                <div className="relative">
                                                    <img 
                                                        src={teacher.avatar || `https://api.dicebear.com/8.x/avataaars/svg?seed=${encodeURIComponent(teacher.name)}`} 
                                                        alt={teacher.name} 
                                                        className="w-12 h-12 rounded-full bg-slate-50 dark:bg-slate-700 border border-slate-100 dark:border-slate-650 object-cover"
                                                    />
                                                    {teacher.isApprovedForTutoring && (
                                                        <div className="absolute -bottom-1 -right-1 p-0.5 bg-emerald-500 rounded-full border-2 border-white dark:border-slate-800">
                                                            <Check className="w-3 h-3 text-white stroke-[4]" />
                                                        </div>
                                                    )}
                                                </div>
                                                <div>
                                                    <h3 className="font-bold text-slate-900 dark:text-slate-50 text-base flex items-center gap-2">
                                                        {teacher.name}
                                                        {(() => {
                                                            try {
                                                                const seenIds = initialSeenTeacherIds;
                                                                if (!seenIds.includes(teacher.id)) {
                                                                    return (
                                                                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-black bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400 animate-pulse">
                                                                            NUEVO 🔴
                                                                        </span>
                                                                    );
                                                                }
                                                            } catch (e) {}
                                                            return null;
                                                        })()}
                                                        {teacher.aiEnabled !== false ? (
                                                            appConfig?.aiEnabled === false ? (
                                                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-rose-50 dark:bg-rose-950/20 text-rose-700 dark:text-rose-400 border border-rose-100 dark:border-rose-900/30 text-[10px] font-black" title="La IA está desactivada globalmente en Ajustes Generales">
                                                                    <Sparkles className="w-2.5 h-2.5 text-rose-500" /> IA (Off Global)
                                                                </span>
                                                            ) : (
                                                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-900/30 text-[10px] font-black">
                                                                    <Sparkles className="w-2.5 h-2.5 text-indigo-500" /> IA
                                                                </span>
                                                            )
                                                        ) : null}
                                                        {teacher.canEditContent === false && (
                                                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-900/40 text-[10px] font-black" title="La edición de contenidos está restringida por el administrador">
                                                                <Lock className="w-2.5 h-2.5 text-rose-500" /> Edición Bloqueada
                                                            </span>
                                                        )}
                                                    </h3>
                                                    <div className="text-xs text-slate-500 dark:text-slate-450 mt-1 flex flex-wrap items-center gap-y-1 gap-x-4">
                                                        <span className="flex items-center gap-1.5"><Mail className="w-3.5 h-3.5" /> {teacher.email}</span>
                                                        {teacher.phone && <span className="flex items-center gap-1.5"><Phone className="w-3.5 h-3.5" /> {teacher.phone}</span>}
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-4 w-full md:w-auto justify-between md:justify-end">
                                                <div className="text-left md:text-right">
                                                    <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider block mb-1">Especialidad</span>
                                                    <span className="text-xs font-bold bg-indigo-50/70 dark:bg-indigo-950/20 text-indigo-700 dark:text-indigo-400 px-2.5 py-1 rounded-lg border border-indigo-100/50 dark:border-indigo-900/30">
                                                        {teacher.category || "General"}
                                                    </span>
                                                </div>

                                                <div className="flex items-center flex-wrap gap-2 md:gap-3">
                                                    <button
                                                        type="button"
                                                        disabled={updateTeacherMutation.isPending}
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            const nextRestricted = teacher.canEditContent === false ? true : false;
                                                            updateTeacherMutation.mutate({
                                                                teacherId: teacher.id,
                                                                data: { canEditContent: nextRestricted }
                                                            });
                                                        }}
                                                        className={`px-3.5 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 transition shadow-sm cursor-pointer border ${
                                                            teacher.canEditContent === false
                                                                ? 'bg-emerald-100 hover:bg-emerald-200 text-emerald-800 dark:bg-emerald-950/70 dark:hover:bg-emerald-900/70 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800'
                                                                : 'bg-rose-100 hover:bg-rose-200 text-rose-800 dark:bg-rose-950/70 dark:hover:bg-rose-900/70 dark:text-rose-300 border-rose-300 dark:border-rose-800'
                                                        }`}
                                                        title={teacher.canEditContent === false ? "Permitir que este profesor edite contenidos" : "Restringir que este profesor edite contenidos"}
                                                    >
                                                        {teacher.canEditContent === false ? (
                                                            <>
                                                                <Pencil className="w-4 h-4 text-emerald-600 dark:text-emerald-400" /> Permitir Edición
                                                            </>
                                                        ) : (
                                                            <>
                                                                <Lock className="w-4 h-4 text-rose-600 dark:text-rose-400" /> Restringir Edición
                                                            </>
                                                        )}
                                                    </button>

                                                    <button
                                                        type="button"
                                                        disabled={toggleApprovalMutation.isPending}
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            toggleApprovalMutation.mutate({ 
                                                                teacherId: teacher.id, 
                                                                isApproved: !teacher.isApprovedForTutoring 
                                                            });
                                                        }}
                                                        className={`px-4 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 transition shadow-sm cursor-pointer ${
                                                            teacher.isApprovedForTutoring
                                                                ? 'bg-amber-100 hover:bg-amber-200 text-amber-900 dark:bg-amber-950/60 dark:hover:bg-amber-900/60 dark:text-amber-300 border border-amber-200 dark:border-amber-800/50'
                                                                : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                                                        }`}
                                                    >
                                                        {teacher.isApprovedForTutoring ? (
                                                            <>
                                                                <UserX className="w-4 h-4 text-amber-700 dark:text-amber-400" /> Revocar Acceso
                                                            </>
                                                        ) : (
                                                            <>
                                                                <UserCheck className="w-4 h-4" /> Dar Acceso / Aprobar
                                                            </>
                                                        )}
                                                    </button>

                                                    {onOpenCommunication && (
                                                        <button
                                                            type="button"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                onOpenCommunication({ type: 'specific', userId: teacher.id, userType: 'teacher' }, 'message');
                                                            }}
                                                            className="px-4 py-2 bg-indigo-50 hover:bg-indigo-100 dark:bg-slate-700 dark:hover:bg-slate-600 text-indigo-700 dark:text-indigo-300 rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
                                                        >
                                                            💌 Enviar Correo / WhatsApp
                                                        </button>
                                                    )}

                                                    <button
                                                        type="button"
                                                        disabled={convertToStudentMutation.isPending}
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            if (window.confirm('¿Estás seguro de convertir a ' + teacher.name + ' en Alumno? Su cuenta pasará a la sección de Estudiantes.')) {
                                                                convertToStudentMutation.mutate(teacher.email);
                                                            }
                                                        }}
                                                        className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-black flex items-center gap-1.5 transition shadow-sm cursor-pointer"
                                                    >
                                                        🔄 Cambiar a Alumno
                                                    </button>

                                                    <button
                                                        type="button"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setTeacherToDelete(teacher);
                                                        }}
                                                        className="px-4 py-2 bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white rounded-xl text-xs font-black flex items-center gap-1.5 transition shadow-sm cursor-pointer ml-auto"
                                                    >
                                                        <Trash className="w-4 h-4" /> Eliminar
                                                    </button>
                                                </div>
                                                                </div>
                                                            </div>

                                                                                                                <AnimatePresence>
                                                            {isExpanded && (
                                                                <motion.div
                                                                    initial={{ height: 0, opacity: 0 }}
                                                                    animate={{ height: "auto", opacity: 1 }}
                                                                    exit={{ height: 0, opacity: 0 }}
                                                                    transition={{ duration: 0.2 }}
                                                                    className="overflow-hidden border-t border-slate-100 dark:border-slate-700/60 bg-slate-50/50 dark:bg-slate-850/50"
                                                                >
                                                                    <div className="p-6 space-y-6">
                                                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                                                            <div>
                                                                                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 block">Categoría / Especialidad Principal</label>
                                                                                <select
                                                                                    value={editCategory}
                                                                                    onChange={e => setEditCategory(e.target.value)}
                                                                                    className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-semibold text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                                                                >
                                                                                    <option value="">Seleccionar Categoría Principal</option>
                                                                                    {TEACHER_SUBJECT_OPTIONS.map(subj => (
                                                                                        <option key={subj} value={subj}>{subj}</option>
                                                                                    ))}
                                                                                </select>
                                                                            </div>
                                                                            <div>
                                                                                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 block">Horario Preferido</label>
                                                                                <input
                                                                                    type="text"
                                                                                    value={editSchedules}
                                                                                    onChange={e => setEditSchedules(e.target.value)}
                                                                                    placeholder="Ej: Lunes a Viernes 16:00 - 20:00"
                                                                                    className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-semibold text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                                                                />
                                                                            </div>
                                                                        </div>

                                                                        {/* --- CURSOS / NIVELES SELECTION --- */}
                                                                        <div>
                                                                            <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5 flex items-center justify-between">
                                                                                <span>📚 Cursos / Niveles Asignados (Puedes seleccionar varios a la vez)</span>
                                                                                <span className="text-[11px] text-indigo-600 dark:text-indigo-400 font-semibold normal-case">
                                                                                    {editTaughtCourseIds.length} curso(s) seleccionado(s)
                                                                                </span>
                                                                            </label>
                                                                            <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">
                                                                                El profesor solo podrá ver y editar el contenido de los cursos que tenga asignados aquí.
                                                                            </p>
                                                                            <div className="flex flex-wrap gap-2 p-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700/80">
                                                                                {/* Render courses from database */}
                                                                                {(courses && courses.length > 0 ? courses : TEACHER_LEVEL_OPTIONS.map((lvl, idx) => ({ id: `level_${idx}`, name: lvl }))).map(course => {
                                                                                    const isSelected = editTaughtCourseIds.includes(course.id) || editTaughtCourseIds.includes(course.name) || editLevels.includes(course.name);
                                                                                    return (
                                                                                        <button
                                                                                            key={course.id}
                                                                                            type="button"
                                                                                            onClick={() => {
                                                                                                const updatedCourses = isSelected
                                                                                                    ? editTaughtCourseIds.filter(id => id !== course.id && id !== course.name)
                                                                                                    : [...editTaughtCourseIds, course.id, course.name];
                                                                                                const updatedLevels = isSelected
                                                                                                    ? editLevels.filter(lvl => lvl !== course.name && lvl !== course.id)
                                                                                                    : [...editLevels, course.name];
                                                                                                setEditTaughtCourseIds(Array.from(new Set(updatedCourses)));
                                                                                                setEditLevels(Array.from(new Set(updatedLevels)));
                                                                                            }}
                                                                                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer border ${
                                                                                                isSelected
                                                                                                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                                                                                                    : 'bg-slate-100 dark:bg-slate-700/60 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-600 hover:bg-slate-200 dark:hover:bg-slate-600'
                                                                                            }`}
                                                                                        >
                                                                                            {isSelected ? <Check className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5 opacity-60" />}
                                                                                            {course.name}
                                                                                        </button>
                                                                                    );
                                                                                })}
                                                                            </div>
                                                                        </div>

                                                                        {/* --- ASIGNATURAS SELECTION --- */}
                                                                        <div>
                                                                            <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5 flex items-center justify-between">
                                                                                <span>📖 Asignaturas Asignadas (Puedes seleccionar varias a la vez)</span>
                                                                                <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold normal-case">
                                                                                    {editSubjects.length} asignatura(s) seleccionada(s)
                                                                                </span>
                                                                            </label>
                                                                            <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">
                                                                                Asigna las materias que el profesor está autorizado a impartir.
                                                                            </p>
                                                                            <div className="flex flex-wrap gap-2 p-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700/80 mb-3">
                                                                                {/* Merge static options with courses subjects */}
                                                                                {Array.from(new Set([
                                                                                    ...TEACHER_SUBJECT_OPTIONS,
                                                                                    ...(courses ? courses.flatMap(c => (c.subjects || []).map(s => s.name)) : []),
                                                                                    ...editSubjects
                                                                                ])).map(subjectName => {
                                                                                    const isSelected = editSubjects.some(s => s.toLowerCase() === subjectName.toLowerCase());
                                                                                    return (
                                                                                        <button
                                                                                            key={subjectName}
                                                                                            type="button"
                                                                                            onClick={() => {
                                                                                                if (isSelected) {
                                                                                                    setEditSubjects(editSubjects.filter(s => s.toLowerCase() !== subjectName.toLowerCase()));
                                                                                                } else {
                                                                                                    setEditSubjects([...editSubjects, subjectName]);
                                                                                                }
                                                                                            }}
                                                                                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer border ${
                                                                                                isSelected
                                                                                                    ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                                                                                                    : 'bg-slate-100 dark:bg-slate-700/60 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-600 hover:bg-slate-200 dark:hover:bg-slate-600'
                                                                                            }`}
                                                                                        >
                                                                                            {isSelected ? <Check className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5 opacity-60" />}
                                                                                            {subjectName}
                                                                                        </button>
                                                                                    );
                                                                                })}
                                                                            </div>

                                                                            {/* Custom Subject Addition Input */}
                                                                            <div className="flex gap-2">
                                                                                <input
                                                                                    type="text"
                                                                                    value={customSubjectInput}
                                                                                    onChange={e => setCustomSubjectInput(e.target.value)}
                                                                                    onKeyDown={e => {
                                                                                        if (e.key === 'Enter') {
                                                                                            e.preventDefault();
                                                                                            if (customSubjectInput.trim() && !editSubjects.includes(customSubjectInput.trim())) {
                                                                                                setEditSubjects([...editSubjects, customSubjectInput.trim()]);
                                                                                                setCustomSubjectInput('');
                                                                                            }
                                                                                        }
                                                                                    }}
                                                                                    placeholder="Añadir otra asignatura personalizada..."
                                                                                    className="flex-1 px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                                                                                />
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={() => {
                                                                                        if (customSubjectInput.trim() && !editSubjects.includes(customSubjectInput.trim())) {
                                                                                            setEditSubjects([...editSubjects, customSubjectInput.trim()]);
                                                                                            setCustomSubjectInput('');
                                                                                        }
                                                                                    }}
                                                                                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1 cursor-pointer"
                                                                                >
                                                                                    <Plus className="w-3.5 h-3.5" /> Añadir
                                                                                </button>
                                                                            </div>
                                                                        </div>

                                                                        <div className="flex flex-wrap items-center gap-6 pt-2">
                                                                            <label className={`flex items-center gap-2 ${appConfig?.aiEnabled === false ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}>
                                                                                <input
                                                                                    type="checkbox"
                                                                                    checked={appConfig?.aiEnabled !== false && editAiEnabled}
                                                                                    disabled={appConfig?.aiEnabled === false}
                                                                                    onChange={e => setEditAiEnabled(e.target.checked)}
                                                                                    className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300 dark:border-slate-700 disabled:opacity-50"
                                                                                />
                                                                                <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                                                                                    Permitir Asistente IA {appConfig?.aiEnabled === false && '(Desactivado en Acceso Global)'}
                                                                                </span>
                                                                            </label>

                                                                            <label className={`flex items-center gap-2 ${appConfig?.videosEnabled === false ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}>
                                                                                <input
                                                                                    type="checkbox"
                                                                                    checked={appConfig?.videosEnabled !== false && editVideosEnabled}
                                                                                    disabled={appConfig?.videosEnabled === false}
                                                                                    onChange={e => setEditVideosEnabled(e.target.checked)}
                                                                                    className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300 dark:border-slate-700 disabled:opacity-50"
                                                                                />
                                                                                <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                                                                                    Permitir Subida de Videos {appConfig?.videosEnabled === false && '(Desactivado en Acceso Global)'}
                                                                                </span>
                                                                            </label>

                                                                            <label className="flex items-center gap-2 cursor-pointer">
                                                                                <input
                                                                                    type="checkbox"
                                                                                    checked={editCanEditContent}
                                                                                    onChange={e => setEditCanEditContent(e.target.checked)}
                                                                                    className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300 dark:border-slate-700"
                                                                                />
                                                                                <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Permitir Edición de Contenidos</span>
                                                                            </label>
                                                                        </div>

                                                                        <div className="flex justify-end gap-3 pt-4 border-t border-slate-200/60 dark:border-slate-700/60">
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => handleSaveDetails(teacher.id)}
                                                                                disabled={updateTeacherMutation.isPending}
                                                                                className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black shadow-sm transition flex items-center gap-2 cursor-pointer"
                                                                            >
                                                                                <Check className="w-4 h-4" /> Guardar Cambios del Profesor
                                                                            </button>
                                                                        </div>
                                                                    </div>
                                                                </motion.div>
                                                            )}
                                                        </AnimatePresence>
                                    </div>
                                );
                            })}

                            {filteredTeachers.length === 0 && (
                                <div className="text-center py-16 bg-white dark:bg-slate-800 rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-700/80">
                                    <Inbox className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                                    <h4 className="font-bold text-slate-800 dark:text-slate-300">No se encontraron profesores</h4>
                                    <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">Prueba a reajustar los filtros o la búsqueda.</p>
                                </div>
                            )}
                        </div>
                    </motion.div>
                ) : (
                    <motion.div
                        key="requests-tab"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700/60 shadow-sm overflow-hidden"
                    >
                        <div className="p-5 border-b border-slate-100 dark:border-slate-700/60">
                            <h2 className="text-xl font-bold text-slate-900 dark:text-slate-50">Solicitudes de Alumnos</h2>
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                                Revisa y aprueba las sesiones de tutoría propuestas por los estudiantes.
                            </p>
                        </div>

                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="text-left text-slate-400 dark:text-slate-500 bg-slate-50 dark:bg-slate-850 border-b border-slate-150/60 dark:border-slate-700/60">
                                        <th className="p-4 font-bold text-xs uppercase tracking-wider">Alumno</th>
                                        <th className="p-4 font-bold text-xs uppercase tracking-wider">Asignatura</th>
                                        <th className="p-4 font-bold text-xs uppercase tracking-wider">Fecha / Hora Propuesta</th>
                                        <th className="p-4 font-bold text-xs uppercase tracking-wider">Detalles</th>
                                        <th className="p-4 font-bold text-xs uppercase tracking-wider text-right">Acción</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                                    {pendingRequests.map(req => (
                                        <tr key={req.id} className="group hover:bg-slate-50/50 dark:hover:bg-slate-800/20 transition">
                                            <td className="p-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center font-bold text-indigo-600 dark:text-indigo-400 text-xs">
                                                        {req.studentName ? req.studentName.slice(0,2).toUpperCase() : 'ST'}
                                                    </div>
                                                    <span className="font-bold text-slate-900 dark:text-slate-50">{req.studentName}</span>
                                                </div>
                                            </td>
                                            <td className="p-4">
                                                <span className="bg-indigo-50/80 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/30 text-indigo-700 dark:text-indigo-400 text-xs font-black px-2.5 py-1 rounded-lg">
                                                    {req.subject}
                                                </span>
                                            </td>
                                            <td className="p-4 text-slate-650 dark:text-slate-300">
                                                <span className="font-semibold block">{req.date}</span>
                                                <span className="text-xs text-slate-500 dark:text-slate-450 mt-0.5 block">{req.time} hs</span>
                                            </td>
                                            <td className="p-4 text-slate-500 dark:text-slate-450 max-w-xs truncate" title={req.details}>
                                                {req.details || "Sin detalles adicionales"}
                                            </td>
                                            <td className="p-4 text-right">
                                                <button 
                                                    onClick={() => updateRequestStatusMutation.mutate({ requestId: req.id, status: 'confirmed' })}
                                                    className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black shadow-sm transition inline-flex items-center gap-1.5"
                                                >
                                                    <Check className="w-4 h-4" /> Aprobar Tutoría
                                                </button>
                                            </td>
                                        </tr>
                                    ))}

                                    {pendingRequests.length === 0 && (
                                        <tr>
                                            <td colSpan={5} className="text-center py-16 text-slate-500 dark:text-slate-400">
                                                <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-3 animate-bounce" />
                                                <h4 className="font-bold text-slate-800 dark:text-slate-300">¡Todo al día!</h4>
                                                <p className="text-sm text-slate-500 dark:text-slate-450 mt-1">No hay peticiones de tutorías pendientes de validación.</p>
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Create Teacher Modal */}
            {isCreateTeacherModalOpen && (
                <CreateTeacherModal
                    onClose={() => setIsCreateTeacherModalOpen(false)}
                    onSave={(data) => createTeacherMutation.mutate(data)}
                    isSaving={createTeacherMutation.isPending}
                />
            )}

            {/* Delete Confirmation Modal */}
            {teacherToDelete && (
                <ConfirmationModal
                    isOpen={!!teacherToDelete}
                    onClose={() => setTeacherToDelete(null)}
                    onConfirm={() => deleteTeacherMutation.mutate(teacherToDelete.id)}
                    title="Eliminar Profesor Permanente"
                    description={`¿Estás seguro de que quieres eliminar definitivamente al profesor "${teacherToDelete.name}"? Esta acción es irreversible, eliminará su cuenta y todos sus datos de la plataforma.`}
                    confirmText="Sí, eliminar profesor"
                    cancelText="Cancelar"
                    isDestructive
                    isLoading={deleteTeacherMutation.isPending}
                />
            )}
        </div>
    );
};

// Subcomponent: CreateTeacherModal
const CreateTeacherModal: React.FC<{
    onClose: () => void;
    onSave: (data: { name: string; email: string; password?: string; phone: string; category: string }) => void;
    isSaving: boolean;
}> = ({ onClose, onSave, isSaving }) => {
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [phone, setPhone] = useState('');
    const [category, setCategory] = useState('');
    const [error, setError] = useState('');

    const handleSave = () => {
        if (!name || !email || !category) {
            setError('El nombre, correo electrónico y especialidad son obligatorios.');
            return;
        }
        if (!email.includes('@')) {
            setError('Introduce un correo electrónico válido.');
            return;
        }
        onSave({
            name,
            email,
            password: password || '123456',
            phone,
            category
        });
    };

    return (
        <div className="fixed inset-0 bg-black/60 z-[9999] flex items-center justify-center p-4 animate-fade-in" onClick={onClose}>
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-lg dialog-container" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center p-4 border-b dark:border-slate-700">
                    <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">Registrar Nuevo Profesor</h3>
                    <button onClick={onClose} className="p-1 rounded-full hover:bg-gray-200 dark:hover:bg-slate-700 cursor-pointer">
                        <X className="w-5 h-5 text-slate-500" />
                    </button>
                </div>
                <div className="p-6 space-y-4">
                    {error && (
                        <div className="p-3 bg-red-50 dark:bg-red-900/30 text-red-500 dark:text-red-400 text-sm rounded-md border border-red-200 dark:border-red-900/50 animate-pulse">
                            {error}
                        </div>
                    )}
                    <div className="space-y-1">
                        <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Nombre Completo *</label>
                        <input
                            type="text"
                            value={name}
                            onChange={e => { setName(e.target.value); setError(''); }}
                            placeholder="Ej. Profesor Carlos"
                            className="bg-gray-50 dark:bg-slate-700 dark:border-slate-600 block w-full border border-gray-300 dark:border-slate-600 rounded-md py-2 px-3 text-slate-950 dark:text-slate-50 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                        />
                    </div>
                    <div className="space-y-1">
                        <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Correo Electrónico *</label>
                        <input
                            type="email"
                            value={email}
                            onChange={e => { setEmail(e.target.value); setError(''); }}
                            placeholder="profesor@ejemplo.com"
                            className="bg-gray-50 dark:bg-slate-700 dark:border-slate-600 block w-full border border-gray-300 dark:border-slate-600 rounded-md py-2 px-3 text-slate-950 dark:text-slate-50 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                        />
                    </div>
                    <div className="space-y-1">
                        <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Especialidad (Materia Primaria) *</label>
                        <select
                            value={category}
                            onChange={e => { setCategory(e.target.value); setError(''); }}
                            className="bg-gray-50 dark:bg-slate-700 dark:border-slate-600 block w-full border border-gray-300 dark:border-slate-600 rounded-md py-2 px-3 text-slate-950 dark:text-slate-50 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                        >
                            <option value="">Selecciona Especialidad</option>
                            {TEACHER_SUBJECT_OPTIONS.map(subject => (
                                <option key={subject} value={subject}>{subject}</option>
                            ))}
                        </select>
                    </div>
                    <div className="space-y-1">
                        <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Teléfono (Opcional)</label>
                        <input
                            type="text"
                            value={phone}
                            onChange={e => setPhone(e.target.value)}
                            placeholder="600000000"
                            className="bg-gray-50 dark:bg-slate-700 dark:border-slate-600 block w-full border border-gray-300 dark:border-slate-600 rounded-md py-2 px-3 text-slate-950 dark:text-slate-50 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                        />
                    </div>
                    <div className="space-y-1">
                        <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Contraseña (Por defecto "123456")</label>
                        <input
                            type="password"
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            placeholder="******"
                            className="bg-gray-50 dark:bg-slate-700 dark:border-slate-600 block w-full border border-gray-300 dark:border-slate-600 rounded-md py-2 px-3 text-slate-950 dark:text-slate-50 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                        />
                    </div>
                </div>
                <div className="flex justify-end gap-3 p-4 bg-gray-50 dark:bg-slate-800/50 rounded-b-xl border-t dark:border-slate-700">
                    <Button variant="secondary" onClick={onClose}>Cancelar</Button>
                    <Button onClick={handleSave} isLoading={isSaving}>Registrar</Button>
                </div>
            </div>
        </div>
    );
};
