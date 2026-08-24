import React, { useState, useMemo, useContext } from 'react';
// FIX: Added useQuery to imports
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as api from '../../services/api';
import type { TutoringRequest } from '../../types';
// FIX: Added CheckCircleIcon for use in buttons
import { 
    ChevronLeftIcon, 
    VideoCameraIcon, 
    TrashIcon, 
    CheckCircleIcon, 
    CalendarIcon, 
    InfoIcon, 
    ClockIcon, 
    FilterIcon 
} from '../icons';
import { NotificationContext } from '../../contexts/NotificationContext';
import { AdminNotificationContext } from '../../contexts/AdminNotificationContext';
import { AuthContext } from '../../contexts/AuthContext';
import { ConfirmationModal } from '../ConfirmationModal';
import { FilterButton } from '../ui/FilterButton';
import { RequestSkeleton } from '../ui/RequestSkeleton';
import { useBackNavigation } from '../../hooks/useBackNavigation';
import { FailureState } from '../ui/FailureState';
import { EmptyState } from '../ui/EmptyState';
import { VoiceGroupCall } from '../VoiceGroupCall';
import { isTeacherMatchForSubject, isTutoringRequestForTeacher } from '../../utils/tutoringHelpers';
import { useAuthorization } from '../../hooks/useAuthorization';


export const AdminTutoringRequestsPage: React.FC = () => {
    const queryClient = useQueryClient();
    const handleBack = useBackNavigation('/admin/dashboard');
    const { addToast } = useContext(NotificationContext);
    const { user } = useContext(AuthContext);
    const { isAdmin } = useAuthorization();
    const isTeacher = user?.role === 'teacher';
    const isApprovedTeacher = isTeacher ? (user as any).isApprovedForTutoring === true : true;

    React.useEffect(() => {
        if (user) {
            api.markTutoringRequestsAsSeen(user.role as any, user.id);
            queryClient.invalidateQueries({ queryKey: ['tutoringRequests'] });
        }
    }, [user, queryClient]);

    const checkApproval = (): boolean => {
        if (!isApprovedTeacher) {
            addToast('Tu cuenta de profesor aún no ha sido aprobada por la administración de AulaInfinity.', 'error');
            return false;
        }
        return true;
    };

    const { 
        tutoringRequests: requests, 
        isTutoringRequestsLoading: isLoading, 
        isTutoringRequestsError: isError, 
        refetchTutoringRequests: refetch 
    } = useContext(AdminNotificationContext);
    const [filter, setFilter] = useState<'pending' | 'confirmed' | 'completed' | 'all'>('pending');
    const [subjectFilter, setSubjectFilter] = useState<string>('all');
    const [courseFilter, setCourseFilter] = useState<string>('all');
    const [dateFilter, setDateFilter] = useState<string>('all');
    const [teacherFilter, setTeacherFilter] = useState<string>('all');
    const [showOnlyMyRequests, setShowOnlyMyRequests] = useState(false);
    const [requestToDelete, setRequestToDelete] = useState<{ id: string; studentName: string } | null>(null);
    const [activeVoiceCallId, setActiveVoiceCallId] = useState<string | null>(null);

    const [editingDetailsId, setEditingDetailsId] = useState<string | null>(null);
    const [meetingLinkInput, setMeetingLinkInput] = useState('');
    const [isVoiceCallInput, setIsVoiceCallInput] = useState(false);
    const [sessionSummaryInput, setSessionSummaryInput] = useState('');
    const [dateInput, setDateInput] = useState('');
    const [timeInput, setTimeInput] = useState('');
    const [teacherIdInput, setTeacherIdInput] = useState('');

    const { data: teachers } = useQuery({ queryKey: ['teachers'], queryFn: api.fetchTeachers });
    const { data: students } = useQuery({ queryKey: ['users'], queryFn: api.fetchUsers });
    const { data: courses } = useQuery({ queryKey: ['courses'], queryFn: api.fetchCourses });

    const subjects = useMemo(() => {
        if (!requests) return [];
        return Array.from(new Set(requests.map(r => r.subject)));
    }, [requests]);

    const baseRequestsForTeacher = useMemo(() => {
        if (!requests) return [];
        if (user && user.role === 'teacher') {
            return requests.filter(req => isTutoringRequestForTeacher(req, user, teachers));
        }
        return requests;
    }, [requests, user, teachers]);

    const pendingCount = useMemo(() => baseRequestsForTeacher.filter(r => r.status === 'pending').length, [baseRequestsForTeacher]);
    const confirmedCount = useMemo(() => baseRequestsForTeacher.filter(r => r.status === 'confirmed').length, [baseRequestsForTeacher]);
    const completedCount = useMemo(() => baseRequestsForTeacher.filter(r => r.status === 'completed').length, [baseRequestsForTeacher]);
    const totalCount = useMemo(() => baseRequestsForTeacher.length, [baseRequestsForTeacher]);

    const filteredRequests = useMemo(() => {
        let result = [...baseRequestsForTeacher].reverse(); // Show newest first
        if (filter !== 'all') {
            result = result.filter(req => req.status === filter);
        }
        if (courseFilter !== 'all') {
            result = result.filter(req => {
                const student = students?.find(s => s.id === req.studentId);
                return student?.enrolledCourseIds?.includes(courseFilter) ?? false;
            });
        }
        if (subjectFilter !== 'all') {
            result = result.filter(req => req.subject === subjectFilter);
        }
        if (teacherFilter !== 'all') {
            result = result.filter(req => req.teacherId === teacherFilter);
        }

        if (showOnlyMyRequests && user) {
            result = result.filter(req => isTutoringRequestForTeacher(req, user, teachers));
        }
        if (dateFilter !== 'all') {
            result = result.filter(req => {
                const reqDate = new Date(req.timestamp).toLocaleDateString();
                return reqDate === dateFilter;
            });
        }
        return result;
    }, [baseRequestsForTeacher, filter, courseFilter, students, subjectFilter, dateFilter, teacherFilter, showOnlyMyRequests, user]);

    const updateStatusMutation = useMutation<
        TutoringRequest,
        Error,
        { requestId: string; status: 'pending' | 'confirmed' | 'completed'; teacherId?: string },
        { previousRequests: TutoringRequest[] | undefined }
    >({
        mutationFn: ({ requestId, status, teacherId }) => api.updateTutoringRequestStatus(requestId, status, teacherId),
        onMutate: async ({ requestId, status, teacherId }) => {
            await queryClient.cancelQueries({ queryKey: ['tutoringRequests'] });
            const previousRequests = queryClient.getQueryData<TutoringRequest[]>(['tutoringRequests']);
            queryClient.setQueryData<TutoringRequest[]>(['tutoringRequests'], (old) => {
                if (!old) return [];
                return old.map(req => req.id === requestId ? { ...req, status, ...(teacherId ? { teacherId } : {}) } : req);
            });
            return { previousRequests };
        },
        onError: (err, variables, context) => {
            if (context?.previousRequests) {
                queryClient.setQueryData(['tutoringRequests'], context.previousRequests);
            }
            addToast('Error al actualizar la tutoría.', 'error');
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: ['tutoringRequests'] });
        },
        onSuccess: () => {
            addToast('Estado de la tutoría actualizado.', 'success');
        }
    });

    const approveRequestMutation = useMutation({
        mutationFn: ({ requestId, role, teacherId }: { requestId: string; role: 'teacher' | 'admin'; teacherId?: string }) => 
            api.approveTutoringRequest(requestId, role, teacherId),
        onSuccess: () => {
            addToast('Visto bueno registrado con éxito. Si ambos han aprobado, la tutoría se confirmará.', 'success');
            queryClient.invalidateQueries({ queryKey: ['tutoringRequests'] });
        },
        onError: () => {
            addToast('Error al registrar el visto bueno.', 'error');
        }
    });

    const acceptModificationMutation = useMutation({
        mutationFn: (requestId: string) => api.respondToTutoringModification(requestId, 'accept', 'admin'),
        onSuccess: () => {
            addToast('¡Cambio de fecha/hora aceptado y guardado en la agenda!', 'success');
            queryClient.invalidateQueries({ queryKey: ['tutoringRequests'] });
        },
        onError: () => addToast('Error al aceptar el cambio de tutoría.', 'error')
    });

    const rejectModificationMutation = useMutation({
        mutationFn: (requestId: string) => api.respondToTutoringModification(requestId, 'reject'),
        onSuccess: () => {
            addToast('Propuesta de cambio rechazada.', 'info');
            queryClient.invalidateQueries({ queryKey: ['tutoringRequests'] });
        },
        onError: () => addToast('Error al rechazar el cambio de tutoría.', 'error')
    });

    const deleteRequestMutation = useMutation<
        void,
        Error,
        string,
        { previousRequests: TutoringRequest[] | undefined }
    >({
        mutationFn: async (requestId: string) => {
            await api.deleteTutoringRequest(requestId);
        },
        onMutate: async (requestIdToDelete) => {
            await queryClient.cancelQueries({ queryKey: ['tutoringRequests'] });
            const previousRequests = queryClient.getQueryData<TutoringRequest[]>(['tutoringRequests']);
            queryClient.setQueryData<TutoringRequest[]>(['tutoringRequests'], (old) =>
                old ? old.filter(req => req.id !== requestIdToDelete) : []
            );
            setRequestToDelete(null);
            return { previousRequests };
        },
        onError: (err, variables, context) => {
            if (context?.previousRequests) {
                queryClient.setQueryData(['tutoringRequests'], context.previousRequests);
            }
            addToast('Error al eliminar la solicitud.', 'error');
            setRequestToDelete(null);
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: ['tutoringRequests'] });
        },
        onSuccess: () => {
            addToast('Solicitud de tutoría eliminada.', 'success');
        }
    });

    const updateDetailsMutation = useMutation({
        mutationFn: ({ requestId, updates }: { requestId: string; updates: any }) => 
            api.updateTutoringDetails(requestId, updates),
        onSuccess: () => {
            addToast('Detalles de la tutoría guardados con éxito.', 'success');
            queryClient.invalidateQueries({ queryKey: ['tutoringRequests'] });
            setEditingDetailsId(null);
        },
        onError: (err: any) => {
            addToast(`Error al guardar los detalles: ${err.message}`, 'error');
        }
    });

    const confirmDelete = () => {
        if (requestToDelete) {
            if (!checkApproval()) return;
            deleteRequestMutation.mutate(requestToDelete.id);
        }
    };
    
    const getEmptyStateMessage = () => {
        switch (filter) {
            case 'pending':
                return { title: 'No hay solicitudes pendientes', description: '¡Buen trabajo! Has revisado todas las solicitudes.' };
            case 'confirmed':
                return { title: 'No hay tutorías confirmadas', description: 'Las solicitudes que confirmes aparecerán aquí.' };
            case 'completed':
                 return { title: 'No hay tutorías completadas', description: 'Las tutorías que marques como completadas aparecerán aquí.' };
            default:
                 return { title: 'No hay solicitudes', description: 'Cuando un estudiante solicite una tutoría, aparecerá aquí.' };
        }
    };

    return (
        <div className="animate-slide-in-up">
            <div className="flex items-center justify-between mb-6">
                <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-50">Gestionar Tutorías</h1>
                <button onClick={handleBack} className="flex items-center px-4 py-2 bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-600 text-slate-900 dark:text-slate-100 font-semibold rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors duration-200">
                    <ChevronLeftIcon className="w-5 h-5 mr-2" />Volver
                </button>
            </div>

            {/* Interactive Metrics Quick Toggles */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                {/* Pending Requests Card */}
                <button
                    onClick={() => setFilter('pending')}
                    className={`relative p-5 rounded-2xl border text-left flex items-start justify-between shadow-xs transition-all duration-305 ${
                        filter === 'pending'
                            ? 'bg-amber-500/10 border-amber-500 ring-2 ring-amber-500/20 text-amber-900 dark:text-amber-100'
                            : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700/80 hover:border-amber-400 dark:hover:border-amber-600/50'
                    }`}
                >
                    <div className="space-y-1">
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-505 dark:text-slate-400">Pendientes</span>
                        <div className="text-3xl font-black text-slate-900 dark:text-slate-50">
                            {isLoading ? '...' : pendingCount}
                        </div>
                        <p className="text-[11px] font-semibold text-amber-600 dark:text-amber-405">Por confirmar clase</p>
                    </div>
                    <div className={`p-3 rounded-xl transition-colors duration-300 ${
                        filter === 'pending'
                            ? 'bg-amber-500/20 text-amber-600 dark:text-amber-450'
                            : 'bg-amber-50 dark:bg-amber-950/20 text-amber-500'
                    }`}>
                        <ClockIcon className="w-6 h-6" />
                    </div>
                    {filter === 'pending' && (
                        <div className="absolute top-3 right-3 flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                        </div>
                    )}
                </button>

                {/* Confirmed Requests Card */}
                <button
                    onClick={() => setFilter('confirmed')}
                    className={`relative p-5 rounded-2xl border text-left flex items-start justify-between shadow-xs transition-all duration-351 ${
                        filter === 'confirmed'
                            ? 'bg-indigo-500/10 border-indigo-500 ring-2 ring-indigo-500/20 text-indigo-900 dark:text-indigo-100'
                            : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700/80 hover:border-indigo-400 dark:hover:border-indigo-600/50'
                    }`}
                >
                    <div className="space-y-1">
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-505 dark:text-slate-400">Confirmadas</span>
                        <div className="text-3xl font-black text-slate-900 dark:text-slate-50">
                            {isLoading ? '...' : confirmedCount}
                        </div>
                        <p className="text-[11px] font-semibold text-indigo-650 dark:text-indigo-405">Clases agendadas</p>
                    </div>
                    <div className={`p-3 rounded-xl transition-colors duration-300 ${
                        filter === 'confirmed'
                            ? 'bg-indigo-500/20 text-indigo-600 dark:text-indigo-400'
                            : 'bg-indigo-50 dark:bg-indigo-950/20 text-indigo-500'
                    }`}>
                        <CalendarIcon className="w-6 h-6" />
                    </div>
                    {filter === 'confirmed' && (
                        <div className="absolute top-3 right-3 flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-600"></span>
                        </div>
                    )}
                </button>

                {/* Completed Requests Card */}
                <button
                    onClick={() => setFilter('completed')}
                    className={`relative p-5 rounded-2xl border text-left flex items-start justify-between shadow-xs transition-all duration-300 ${
                        filter === 'completed'
                            ? 'bg-emerald-500/10 border-emerald-505 ring-2 ring-emerald-500/20 text-emerald-900 dark:text-emerald-100'
                            : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700/80 hover:border-emerald-400 dark:hover:border-emerald-600/50'
                    }`}
                >
                    <div className="space-y-1">
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-505 dark:text-slate-400">Completadas</span>
                        <div className="text-3xl font-black text-slate-900 dark:text-slate-50">
                            {isLoading ? '...' : completedCount}
                        </div>
                        <p className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">Clases impartidas</p>
                    </div>
                    <div className={`p-3 rounded-xl transition-colors duration-300 ${
                        filter === 'completed'
                            ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-450'
                            : 'bg-emerald-50 dark:bg-emerald-950/20 text-emerald-500'
                    }`}>
                        <CheckCircleIcon className="w-6 h-6" />
                    </div>
                    {filter === 'completed' && (
                        <div className="absolute top-3 right-3 flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                        </div>
                    )}
                </button>

                {/* All */}
                <button
                    onClick={() => setFilter('all')}
                    className={`relative p-5 rounded-2xl border text-left flex items-start justify-between shadow-xs transition-all duration-300 ${
                        filter === 'all'
                            ? 'bg-slate-500/10 border-slate-505 ring-2 ring-slate-500/20 text-slate-900 dark:text-slate-100'
                            : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700/80 hover:border-slate-400 dark:hover:border-slate-605'
                    }`}
                >
                    <div className="space-y-1">
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-505 dark:text-slate-400">Histórico</span>
                        <div className="text-3xl font-black text-slate-900 dark:text-slate-50">
                            {isLoading ? '...' : totalCount}
                        </div>
                        <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">Total solicitudes</p>
                    </div>
                    <div className={`p-3 rounded-xl transition-colors duration-305 ${
                        filter === 'all'
                            ? 'bg-slate-500/20 text-slate-600 dark:text-slate-400'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                    }`}>
                        <InfoIcon className="w-6 h-6" />
                    </div>
                    {filter === 'all' && (
                        <div className="absolute top-3 right-3 flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-slate-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-slate-500"></span>
                        </div>
                    )}
                </button>
            </div>

            <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-lg">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b dark:border-slate-700 pb-5 mb-5">
                    <div className="flex items-center gap-2">
                        <FilterIcon className="w-5 h-5 text-indigo-600 dark:text-indigo-455" />
                        <span className="text-lg font-bold text-slate-800 dark:text-slate-200">Filtros Avanzados</span>
                        <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/20 text-indigo-600 dark:text-indigo-400">
                            Filtro: {filter === 'all' ? 'Todas' : filter === 'pending' ? 'Pendientes' : filter === 'confirmed' ? 'Confirmadas' : 'Completadas'}
                        </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        <button
                            onClick={() => setShowOnlyMyRequests(!showOnlyMyRequests)}
                            className={`px-3 py-2 text-sm font-semibold rounded-lg transition-colors border duration-150 ${
                                showOnlyMyRequests
                                    ? 'bg-indigo-600 text-white border-transparent'
                                    : 'bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 border-slate-300 dark:border-slate-600 hover:bg-slate-55 dark:hover:bg-slate-600'
                            }`}
                        >
                            {showOnlyMyRequests ? '✅ Mis Tutorías' : '👤 Mostrar todas'}
                        </button>
                        <select 
                            value={courseFilter} 
                            onChange={(e) => setCourseFilter(e.target.value)}
                            className="bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-700 dark:text-slate-200 select-none cursor-pointer"
                        >
                            <option value="all">Curso: Todos</option>
                            {courses?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                        <select 
                            value={teacherFilter} 
                            onChange={(e) => setTeacherFilter(e.target.value)}
                            className="bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-700 dark:text-slate-200 select-none cursor-pointer"
                        >
                            <option value="all">Docente: Todos</option>
                            {teachers?.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                        </select>
                        <select 
                            value={subjectFilter} 
                            onChange={(e) => setSubjectFilter(e.target.value)}
                            className="bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-700 dark:text-slate-200 select-none cursor-pointer"
                        >
                            <option value="all">Asignatura: Todas</option>
                            {subjects.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                        <select 
                            value={dateFilter} 
                            onChange={(e) => setDateFilter(e.target.value)}
                            className="bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-700 dark:text-slate-200 select-none cursor-pointer"
                        >
                            <option value="all">Fecha: Todas</option>
                            {Array.from(new Set(requests?.map(r => new Date(r.timestamp).toLocaleDateString()))).map(d => <option key={d} value={d}>{d}</option>)}
                        </select>
                    </div>
                </div>
                {isLoading ? (
                    <div className="space-y-4">
                        <RequestSkeleton />
                        <RequestSkeleton />
                    </div>
                ) : isError ? (
                     <FailureState message="No se pudieron cargar las solicitudes de tutoría." onRetry={refetch} />
                ) : filteredRequests.length > 0 ? (
                    <div className="space-y-4">
                        {filteredRequests.map(req => (
                            <div key={req.id} className="p-4 border dark:border-slate-700 rounded-lg bg-gray-50 dark:bg-slate-800/50">
                                <div className="flex flex-col sm:flex-row justify-between items-start gap-2">
                                    <div className="flex-1 pr-0 sm:pr-4">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <h3 className="text-lg font-bold text-primary break-words">{req.subject}</h3>
                                            {req.teacherId === 'first_available' && (
                                                <span className="px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider rounded-md bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                                                    ⭐ Primer disponible
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-slate-800 dark:text-slate-200 mt-1 break-words">{req.details}</p>
                                        
                                        <div className="mt-2 space-y-1 text-xs text-slate-500 dark:text-slate-400">
                                            <p>👤 <strong>Profesor:</strong> {req.teacherId === 'first_available' ? 'Cualquier docente de la materia (sin asignar)' : (req.teacherName || 'Docente asignado')}</p>
                                            {req.date && <p>📅 <strong>Fecha programada:</strong> {req.date} a las {req.time || 'No definida'}</p>}
                                            {req.isVoiceCall ? (
                                                <div className="mt-2">
                                                    <button
                                                        onClick={() => setActiveVoiceCallId(req.id)}
                                                        className="px-3 py-1.5 bg-emerald-100 hover:bg-emerald-200 text-emerald-800 dark:bg-emerald-900/40 dark:hover:bg-emerald-800/60 dark:text-emerald-300 font-bold rounded-lg text-xs transition-colors flex items-center justify-center gap-1.5"
                                                    >
                                                        <span>🎙️</span> Entrar a la Clase (Voz)
                                                    </button>
                                                </div>
                                            ) : req.meetingLink ? (
                                                <p className="flex items-center gap-1.5 text-indigo-650 dark:text-indigo-400 font-bold mt-1">
                                                    <span>🔗</span> <strong>Enlace de Reunión:</strong> 
                                                    <a href={req.meetingLink.startsWith('http') ? req.meetingLink : `https://${req.meetingLink}`} target="_blank" rel="noopener noreferrer" className="underline hover:text-indigo-800 dark:hover:text-indigo-300 break-all">
                                                        {req.meetingLink}
                                                    </a>
                                                </p>
                                            ) : null}
                                            {req.sessionSummary && (
                                                <div className="bg-slate-150/60 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 p-2.5 rounded-lg text-slate-700 dark:text-slate-300 mt-1 text-xs">
                                                    <strong>📝 Notas/Agenda:</strong> {req.sessionSummary}
                                                </div>
                                            )}
                                        </div>

                                        {req.status === 'pending' && (
                                            <div className="mt-3 flex flex-wrap gap-2 text-xs">
                                                <span className={`inline-flex items-center px-2.5 py-1 rounded-md font-medium border ${
                                                    req.teacherApproved 
                                                        ? 'bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900/50' 
                                                        : 'bg-amber-50 dark:bg-amber-950/10 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-900/30'
                                                }`}>
                                                    👨‍🏫 Profesor: {req.teacherApproved ? 'Aprobado ✅' : 'Pendiente Visto Bueno ⏳'}
                                                </span>
                                                <span className={`inline-flex items-center px-2.5 py-1 rounded-md font-medium border ${
                                                    req.adminApproved 
                                                        ? 'bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900/50' 
                                                        : 'bg-amber-50 dark:bg-amber-950/10 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-900/30'
                                                }`}>
                                                    🛡️ Admin: {req.adminApproved ? 'Aprobado ✅' : 'Pendiente Visto Bueno ⏳'}
                                                </span>
                                            </div>
                                        )}

                                        {req.status === 'confirmed' && (
                                            <div className="mt-3 flex flex-wrap gap-2 text-xs">
                                                <span className="inline-flex items-center px-2.5 py-1 rounded-md font-bold border bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900/50">
                                                    ✅ Tutoría Aceptada por Alumno y Profesor
                                                </span>
                                                <span className="inline-flex items-center px-2.5 py-1 rounded-md font-medium border bg-amber-50 dark:bg-amber-950/20 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-900/50">
                                                    🪙 Pago Alumno: Recibido en Infinitys
                                                </span>
                                                <span className="inline-flex items-center px-2.5 py-1 rounded-md font-medium border bg-indigo-50 dark:bg-indigo-950/20 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-900/50">
                                                    💳 Pago Docente: Pendiente de liquidar al completar
                                                </span>
                                            </div>
                                        )}

                                        {req.status === 'completed' && (
                                            <div className="mt-3 flex flex-wrap gap-2 text-xs">
                                                <span className="inline-flex items-center px-2.5 py-1 rounded-md font-bold border bg-green-50 dark:bg-green-950/20 text-green-700 dark:text-green-400 border-green-200 dark:border-green-900/50">
                                                    🎉 Tutoría Completada e Impartida
                                                </span>
                                                <span className="inline-flex items-center px-2.5 py-1 rounded-md font-medium border bg-emerald-50 dark:bg-emerald-950/20 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900/50">
                                                    🪙 Infinitys liquidados al Docente
                                                </span>
                                            </div>
                                        )}

                                        {/* Pending Modification Proposal */}
                                        {req.proposedDate && (
                                            <div className="mt-3 p-3 bg-indigo-50 dark:bg-indigo-950/40 rounded-lg border border-indigo-200 dark:border-indigo-800 animate-pulse">
                                                <p className="text-xs font-bold text-indigo-700 dark:text-indigo-300">
                                                    ⚠️ Propuesta de Cambio (por {req.modificationRequestedBy === 'student' ? 'el Alumno' : 'el Profesor'}):
                                                </p>
                                                <p className="text-xs text-slate-700 dark:text-slate-300 mt-1">
                                                    Proponen el día <strong>{req.proposedDate}</strong> a las <strong>{req.proposedTime}</strong>
                                                </p>
                                                {req.proposedDetails && (
                                                    <p className="text-xs text-slate-600 dark:text-slate-400 italic mt-0.5">
                                                        "{req.proposedDetails}"
                                                    </p>
                                                )}
                                                {req.modificationRequestedBy === 'student' && (
                                                    <div className="mt-2 flex gap-2">
                                                        <button
                                                            onClick={() => { if (!checkApproval()) return; acceptModificationMutation.mutate(req.id); }}
                                                            disabled={acceptModificationMutation.isPending}
                                                            className="px-2.5 py-1 text-[11px] font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-md shadow-xs transition-colors"
                                                        >
                                                            Aceptar Cambio
                                                        </button>
                                                        <button
                                                            onClick={() => { if (!checkApproval()) return; rejectModificationMutation.mutate(req.id); }}
                                                            disabled={rejectModificationMutation.isPending}
                                                            className="px-2.5 py-1 text-[11px] font-bold bg-red-600 hover:bg-red-700 text-white rounded-md shadow-xs transition-colors"
                                                        >
                                                            Rechazar Cambio
                                                        </button>
                                                    </div>
                                                )}
                                                {req.modificationRequestedBy === 'teacher' && (
                                                    <p className="text-[11px] text-indigo-500 font-semibold mt-1.5">
                                                        Esperando respuesta del alumno.
                                                    </p>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex flex-col items-start sm:items-end space-y-1 text-sm w-full sm:w-auto flex-shrink-0 mt-2 sm:mt-0">
                                        <p className="text-slate-600 dark:text-slate-400">
                                            {new Date(req.timestamp).toLocaleDateString()}
                                        </p>
                                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${
                                            req.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                                            req.status === 'confirmed' ? 'bg-blue-100 text-blue-800' :
                                            'bg-green-100 text-green-800'
                                        }`}>
                                            {req.status === 'pending' ? 'Pendiente' : req.status === 'confirmed' ? 'Confirmado' : 'Completado'}
                                        </span>
                                    </div>
                                </div>
                                {editingDetailsId === req.id ? (
                                    <div className="mt-4 p-4 border border-indigo-150 dark:border-slate-700 bg-indigo-50/20 dark:bg-slate-900/40 rounded-xl space-y-4">
                                        <h4 className="font-bold text-sm text-indigo-900 dark:text-indigo-400 flex items-center gap-2">
                                            <span>⚙️</span> Configurar Detalles de la Tutoría
                                        </h4>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">📅 Fecha de la Sesión</label>
                                                <input
                                                    type="date"
                                                    value={dateInput}
                                                    onChange={(e) => setDateInput(e.target.value)}
                                                    className="w-full text-xs border border-gray-200 dark:border-slate-700 rounded-lg p-2 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:outline-none"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">⏰ Hora de la Sesión</label>
                                                <input
                                                    type="time"
                                                    value={timeInput}
                                                    onChange={(e) => setTimeInput(e.target.value)}
                                                    className="w-full text-xs border border-gray-200 dark:border-slate-700 rounded-lg p-2 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:outline-none"
                                                />
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">🔗 Medio de Clase</label>
                                                <div className="flex flex-col gap-2">
                                                    <label className="flex items-center gap-2 cursor-pointer bg-slate-50 dark:bg-slate-900/50 p-2 rounded-lg border border-slate-200 dark:border-slate-700">
                                                        <input 
                                                            type="checkbox" 
                                                            checked={isVoiceCallInput} 
                                                            onChange={(e) => setIsVoiceCallInput(e.target.checked)} 
                                                            className="w-4 h-4 text-primary bg-white border-gray-300 rounded focus:ring-primary"
                                                        />
                                                        <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                                                            Llamada de voz en la app (LiveKit)
                                                        </span>
                                                    </label>
                                                    {!isVoiceCallInput && (
                                                        <input
                                                            type="text"
                                                            placeholder="Enlace (Google Meet / Zoom / WhatsApp)"
                                                            value={meetingLinkInput}
                                                            onChange={(e) => setMeetingLinkInput(e.target.value)}
                                                            className="w-full text-xs border border-gray-200 dark:border-slate-700 rounded-lg p-2 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:outline-none"
                                                        />
                                                    )}
                                                </div>
                                            </div>
                                            <div>
                                                <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">👨‍🏫 Asignar Docente</label>
                                                <select
                                                    value={teacherIdInput}
                                                    onChange={(e) => setTeacherIdInput(e.target.value)}
                                                    className="w-full text-xs border border-gray-200 dark:border-slate-700 rounded-lg p-2 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:outline-none"
                                                >
                                                    <option value="first_available">⭐ Primer disponible (sin docente fijo)</option>
                                                    {teachers?.map(t => (
                                                        <option key={t.id} value={t.id}>{t.name} ({t.category || t.role})</option>
                                                    ))}
                                                </select>
                                            </div>
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">📝 Resumen académico / Notas de preparación</label>
                                            <textarea
                                                placeholder="Ej: Revisaremos dudas sobre factorización y resolución de ecuaciones de segundo grado."
                                                value={sessionSummaryInput}
                                                onChange={(e) => setSessionSummaryInput(e.target.value)}
                                                rows={2}
                                                className="w-full text-xs border border-gray-200 dark:border-slate-700 rounded-lg p-2 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:outline-none resize-none"
                                            />
                                        </div>
                                        <div className="flex justify-end gap-2">
                                            <button
                                                type="button"
                                                onClick={() => setEditingDetailsId(null)}
                                                className="px-3 py-1.5 border border-gray-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 text-xs font-bold rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                                            >
                                                Cancelar
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => { if (!checkApproval()) return; updateDetailsMutation.mutate({
                                                    requestId: req.id,
                                                    updates: {
                                                        date: dateInput || undefined,
                                                        time: timeInput || undefined,
                                                        meetingLink: meetingLinkInput,
                                                        isVoiceCall: isVoiceCallInput,
                                                        sessionSummary: sessionSummaryInput,
                                                        teacherId: teacherIdInput
                                                    }
                                                })}}
                                                disabled={updateDetailsMutation.isPending}
                                                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-bold rounded-lg transition-colors cursor-pointer"
                                            >
                                                {updateDetailsMutation.isPending ? 'Guardando...' : 'Guardar Cambios'}
                                            </button>
                                        </div>
                                    </div>
                                ) : null}
                                <div className="mt-4 pt-4 border-t dark:border-slate-700 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                                            De: <span className="font-normal text-slate-600 dark:text-slate-400">{req.studentName}</span>
                                        </p>
                                        {(() => {
                                            const student = students?.find(s => s.id === req.studentId);
                                            const studentCourseNames = student && courses
                                                ? student.enrolledCourseIds
                                                    .map(id => courses.find(c => c.id === id)?.name)
                                                    .filter(Boolean)
                                                : [];
                                            return studentCourseNames.map((cName, idx) => (
                                                <span key={idx} className="px-2 py-0.5 text-[10px] font-semibold rounded-md bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-900/50">
                                                    {cName}
                                                </span>
                                            ));
                                        })()}
                                    </div>
                                    <div className="flex items-center gap-2 w-full sm:w-auto">
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setEditingDetailsId(editingDetailsId === req.id ? null : req.id);
                                                setMeetingLinkInput(req.meetingLink || '');
                                                setIsVoiceCallInput(req.isVoiceCall || false);
                                                setSessionSummaryInput(req.sessionSummary || '');
                                                setDateInput(req.date || '');
                                                setTimeInput(req.time || '');
                                                setTeacherIdInput(req.teacherId || 'first_available');
                                            }}
                                            className="px-2.5 py-1.5 text-xs font-bold rounded-lg bg-indigo-50 hover:bg-indigo-100 dark:bg-slate-800 dark:hover:bg-slate-700/85 text-indigo-700 dark:text-slate-200 border border-indigo-100 dark:border-slate-700 transition-all flex items-center gap-1 cursor-pointer whitespace-nowrap"
                                        >
                                            <span>⚙️</span> Configurar
                                        </button>
                                        {req.status === 'pending' && (
                                            <div className="flex flex-wrap gap-2 w-full sm:w-auto">
                                                {user?.role === 'teacher' && (
                                                    <button 
                                                        onClick={() => {
                                                            if (!checkApproval()) return;
                                                            approveRequestMutation.mutate({ 
                                                                requestId: req.id, 
                                                                role: 'teacher',
                                                                teacherId: user.id
                                                            });
                                                        }}
                                                        disabled={req.teacherApproved || approveRequestMutation.isPending}
                                                        className={`px-3 py-1.5 text-sm font-semibold rounded-md transition-colors flex-grow justify-center flex items-center ${
                                                            req.teacherApproved
                                                                ? 'bg-emerald-100 text-emerald-800 cursor-not-allowed opacity-80'
                                                                : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs'
                                                        }`}
                                                    >
                                                        {req.teacherApproved ? '✓ Visto Bueno Profesor' : '👍 Dar Visto Bueno (Profesor)'}
                                                    </button>
                                                )}
                                                {user?.role === 'admin' && (
                                                    <>
                                                        <button 
                                                            onClick={() => approveRequestMutation.mutate({ 
                                                                requestId: req.id, 
                                                                role: 'admin'
                                                            })}
                                                            disabled={req.adminApproved || approveRequestMutation.isPending}
                                                            className={`px-3 py-1.5 text-sm font-semibold rounded-md transition-colors flex-grow justify-center flex items-center ${
                                                                req.adminApproved
                                                                    ? 'bg-indigo-100 text-indigo-800 cursor-not-allowed opacity-80'
                                                                    : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs'
                                                            }`}
                                                        >
                                                            {req.adminApproved ? '✓ Visto Bueno Admin' : '👍 Dar Visto Bueno (Admin)'}
                                                        </button>
                                                        <button 
                                                            onClick={() => updateStatusMutation.mutate({ 
                                                                requestId: req.id, 
                                                                status: 'confirmed'
                                                            })}
                                                            disabled={updateStatusMutation.isPending}
                                                            className="px-3 py-1.5 text-sm font-semibold rounded-md transition-colors bg-blue-100 text-blue-700 hover:bg-blue-200 disabled:opacity-50 flex-grow justify-center flex items-center"
                                                        >
                                                            Aprobación Directa (Admin)
                                                        </button>
                                                    </>
                                                )}
                                            </div>
                                        )}
                                        {req.status === 'confirmed' && (
                                            <button 
                                                onClick={() => {
                                                    if (!checkApproval()) return;
                                                    updateStatusMutation.mutate({ requestId: req.id, status: 'completed' });
                                                }}
                                                disabled={updateStatusMutation.isPending}
                                                className="px-3 py-1.5 text-sm font-semibold rounded-md transition-colors bg-green-100 text-green-700 hover:bg-green-200 disabled:opacity-50 flex-grow justify-center flex items-center"
                                            >
                                                <CheckCircleIcon className="w-4 h-4 mr-1.5 inline"/>
                                                Completar
                                            </button>
                                        )}
                                        {isAdmin && (
                                            <button
                                                onClick={() => {
                                                    if (!checkApproval()) return;
                                                    setRequestToDelete({ id: req.id, studentName: req.studentName });
                                                }}
                                                className="p-1.5 text-sm font-semibold rounded-md transition-colors bg-red-100 text-red-700 hover:bg-red-200 flex-shrink-0"
                                                aria-label="Eliminar solicitud"
                                            >
                                                <TrashIcon className="w-4 h-4"/>
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <EmptyState
                        icon={<VideoCameraIcon />}
                        title={getEmptyStateMessage().title}
                        description={getEmptyStateMessage().description}
                    />
                )}
            </div>

            <ConfirmationModal
                isOpen={!!requestToDelete}
                onClose={() => setRequestToDelete(null)}
                onConfirm={confirmDelete}
                title="Confirmar eliminación"
                description={`¿Estás seguro de que quieres eliminar la solicitud de tutoría de "${requestToDelete?.studentName}"? Esta acción es irreversible.`}
                confirmText="Eliminar"
                isDestructive
                isLoading={deleteRequestMutation.isPending}
            />

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
        </div>
    );
};
