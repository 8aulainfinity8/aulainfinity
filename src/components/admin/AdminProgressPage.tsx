import React, { useState, useMemo, useRef, useContext, useCallback, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { auth } from '../../services/firebase';
import { useVirtualizer } from '@tanstack/react-virtual';
import * as api from '../../services/api';
import type { StudentUser, CourseLevel, StudentAnswer, Video } from '../../types';
import { ChevronLeftIcon, SearchIcon, CloseIcon, TrophyIcon, CheckCircleIcon, CalendarIcon, DownloadIcon } from '../icons';
import { useDebounce } from '../../hooks/useDebounce';
import { useBackNavigation } from '../../hooks/useBackNavigation';
import { FailureState } from '../ui/FailureState';
import { NotificationContext } from '../../contexts/NotificationContext';
import { Button } from '../ui/Button';
import { ConfirmationModal } from '../ConfirmationModal';

const UserRowSkeleton = () => (
    <div className="flex items-center p-4 animate-pulse">
        <div className="flex-shrink-0 h-10 w-10 rounded-full bg-gray-200 dark:bg-slate-700"></div>
        <div className="ml-4 flex-1">
            <div className="h-4 bg-gray-200 dark:bg-slate-700 rounded w-1/4 mb-2"></div>
            <div className="h-3 bg-gray-200 dark:bg-slate-700 rounded w-1/2"></div>
        </div>
        <div className="w-1/3 ml-4">
            <div className="h-4 bg-gray-200 dark:bg-slate-700 rounded"></div>
        </div>
    </div>
);

const ProgressBar: React.FC<{ value: number; max: number }> = ({ value, max }) => {
    const percentage = max > 0 ? (value / max) * 100 : 0;
    return (
        <div className="w-full bg-gray-200 dark:bg-slate-700 rounded-full h-2.5">
            <div className="bg-primary h-2.5 rounded-full transition-all duration-300" style={{ width: `${percentage}%` }}></div>
        </div>
    );
};

// Drawer modal to display complete student performance and progress details
const StudentDetailsModal: React.FC<{
    user: StudentUser;
    onClose: () => void;
    courses: CourseLevel[];
    onResetProgress: () => void;
    isResetting: boolean;
}> = ({ user, onClose, courses, onResetProgress, isResetting }) => {
    const [activeTab, setActiveTab] = useState<'videos' | 'quizzes'>('videos');
    const [isConfirmResetOpen, setIsConfirmResetOpen] = useState(false);

    // Fetch this student's quiz answers history
    const { data: answers, isLoading: answersLoading } = useQuery<StudentAnswer[]>({
        queryKey: ['studentAnswers', user.id],
        queryFn: () => api.fetchStudentAnswers(user.id),
        enabled: !!user && !!user.id && user.id === auth?.currentUser?.uid,
    });

    // Extract watched video details grouped by subject and level
    const watchedVideosDetail = useMemo(() => {
        const details: { video: Video; subjectName: string; levelName: string }[] = [];
        if (!courses) return details;
        courses.forEach(level => {
            level.subjects.forEach(subject => {
                subject.videos.forEach(video => {
                    if (user.watchedVideos.includes(video.id)) {
                        details.push({ video, subjectName: subject.name, levelName: level.name });
                    }
                });
            });
        });
        return details;
    }, [user.watchedVideos, courses]);

    // Match quiz answers with video title
    const quizResultsDetail = useMemo(() => {
        if (!answers || !courses) return [];
        return answers.map(answer => {
            let matchedVideoTitle = 'Lección del cuestionario';
            courses.forEach(level => {
                level.subjects.forEach(subject => {
                    subject.videos.forEach(video => {
                        if (video.id === answer.videoId) {
                            matchedVideoTitle = video.title;
                        }
                    });
                });
            });
            return {
                ...answer,
                videoTitle: matchedVideoTitle,
            };
        });
    }, [answers, courses]);

    const handleConfirmReset = () => {
        onResetProgress();
        setIsConfirmResetOpen(false);
    };

    return (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-end animate-fade-in" onClick={onClose}>
            <div className="bg-white dark:bg-slate-800 h-full w-full max-w-xl shadow-2xl flex flex-col animate-slide-in-right" onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="flex justify-between items-center p-6 border-b dark:border-slate-700">
                    <div className="flex items-center">
                        <img className="h-12 w-12 rounded-full object-cover bg-gray-200 border-2 border-primary" src={`https://api.dicebear.com/8.x/initials/svg?seed=${user.name}`} alt={user.name} />
                        <div className="ml-4">
                            <h3 className="text-xl font-bold text-slate-900 dark:text-slate-50">{user.name}</h3>
                            <p className="text-sm text-slate-500 dark:text-slate-400">{user.email}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-slate-700 transition" aria-label="Cerrar">
                        <CloseIcon className="w-6 h-6 text-slate-500 dark:text-slate-400" />
                    </button>
                </div>

                {/* Info summary */}
                <div className="p-6 bg-slate-50 dark:bg-slate-800/50 border-b dark:border-slate-700">
                    <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                            <span className="text-slate-500 dark:text-slate-400 block">Fecha de Registro:</span>
                            <span className="font-semibold text-slate-800 dark:text-slate-200">{new Date(user.registrationDate).toLocaleDateString()}</span>
                        </div>
                        <div>
                            <span className="text-slate-500 dark:text-slate-400 block">Suscripción:</span>
                            {user.isSubscribed ? (
                                <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800 font-sans">Activa</span>
                            ) : (
                                <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-red-100 text-red-800 font-sans">Inactiva</span>
                            )}
                        </div>
                    </div>

                    <div className="mt-4">
                        <div className="flex justify-between text-sm font-semibold mb-1">
                            <span className="text-slate-700 dark:text-slate-300">Lecciones Completadas:</span>
                            <span className="text-primary">{user.watchedVideos.length} vídeos</span>
                        </div>
                        <ProgressBar value={user.watchedVideos.length} max={courses.reduce((sum, level) => sum + level.subjects.reduce((s, subject) => s + subject.videos.length, 0), 0)} />
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex border-b dark:border-slate-700">
                    <button 
                        onClick={() => setActiveTab('videos')}
                        className={`flex-1 py-3 text-center font-semibold text-sm transition-colors border-b-2 ${activeTab === 'videos' ? 'border-primary text-primary' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
                    >
                        Vídeos Vistos ({watchedVideosDetail.length})
                    </button>
                    <button 
                        onClick={() => setActiveTab('quizzes')}
                        className={`flex-1 py-3 text-center font-semibold text-sm transition-colors border-b-2 ${activeTab === 'quizzes' ? 'border-primary text-primary' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
                    >
                        Cuestionarios ({quizResultsDetail.length})
                    </button>
                </div>

                {/* Tab content wrapper */}
                <div className="flex-1 overflow-y-auto p-6 space-y-4">
                    {activeTab === 'videos' ? (
                        watchedVideosDetail.length > 0 ? (
                            <div className="space-y-3">
                                {watchedVideosDetail.map(({ video, subjectName, levelName }) => (
                                    <div key={video.id} className="p-3 border dark:border-slate-700 rounded-lg flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-700/30 transition">
                                        <div className="truncate pr-4">
                                            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">{levelName} • {subjectName}</span>
                                            <span className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate block">{video.title}</span>
                                        </div>
                                        <CheckCircleIcon className="w-5 h-5 text-green-500 flex-shrink-0" />
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="text-center py-12 text-slate-500 dark:text-slate-400">
                                <p className="mb-1 font-semibold">Ningún vídeo visto aún</p>
                                <p className="text-xs">El estudiante todavía no ha completado ninguna lección de vídeo.</p>
                            </div>
                        )
                    ) : (
                        answersLoading ? (
                            <div className="space-y-2">
                                <div className="h-10 bg-gray-100 dark:bg-slate-700 animate-pulse rounded-md"></div>
                                <div className="h-10 bg-gray-100 dark:bg-slate-700 animate-pulse rounded-md"></div>
                            </div>
                        ) : quizResultsDetail.length > 0 ? (
                            <div className="space-y-3">
                                {quizResultsDetail.map((result) => {
                                    const percent = Math.round((result.score / result.totalQuestions) * 100);
                                    let badgeColor = 'bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300';
                                    if (percent >= 80) badgeColor = 'bg-green-100 text-green-800 dark:bg-green-950/40 dark:text-green-300';
                                    else if (percent >= 50) badgeColor = 'bg-yellow-100 text-yellow-800 dark:bg-yellow-950/40 dark:text-yellow-300';

                                    return (
                                        <div key={result.timestamp} className="p-4 border dark:border-slate-700 rounded-lg space-y-2 hover:bg-slate-50 dark:hover:bg-slate-700/30 transition">
                                            <div className="flex justify-between items-start gap-2">
                                                <div className="truncate">
                                                    <span className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate block" title={result.videoTitle}>{result.videoTitle}</span>
                                                    <span className="text-[11px] text-slate-400 dark:text-slate-500 flex items-center mt-1">
                                                        <CalendarIcon className="w-3.5 h-3.5 mr-1" />
                                                        {new Date(result.timestamp).toLocaleString()}
                                                    </span>
                                                </div>
                                                <span className={`px-2.5 py-1 rounded-full text-xs font-bold font-sans flex-shrink-0 ${badgeColor}`}>
                                                    Nota: {result.score} / {result.totalQuestions} ({percent}%)
                                                </span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <div className="text-center py-12 text-slate-500 dark:text-slate-400">
                                <TrophyIcon className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
                                <p className="mb-1 font-semibold">Ningún examen realizado</p>
                                <p className="text-xs">El estudiante aún no ha enviado respuestas para ningún cuestionario.</p>
                            </div>
                        )
                    )}
                </div>

                {/* Footer and destructive panel */}
                <div className="p-6 border-t dark:border-slate-700 bg-gray-50 dark:bg-slate-800/80 flex items-center justify-between">
                    <Button 
                        variant="secondary"
                        onClick={() => setIsConfirmResetOpen(true)}
                        className="text-red-600 border-red-200 hover:bg-red-50 dark:hover:bg-red-950/20 hover:text-red-700 hover:border-red-300 transition"
                    >
                        Reiniciar Progreso
                    </Button>
                    <Button onClick={onClose}>Cerrar</Button>
                </div>
            </div>

            <ConfirmationModal
                isOpen={isConfirmResetOpen}
                onClose={() => setIsConfirmResetOpen(false)}
                onConfirm={handleConfirmReset}
                title="¿Reiniciar progreso de aprendizaje?"
                description={`Esta acción restablecerá a cero las lecciones completadas y respuestas de exámenes para ${user.name}. El estudiante tendrá que volver a marcar las lecciones.`}
                confirmText="Reiniciar del todo"
                isDestructive
                isLoading={isResetting}
            />
        </div>
    );
};

interface ProgressRowProps {
    user: StudentUser;
    totalVideos: number;
    virtualRow: any;
    measureElement: (element: HTMLElement | null) => void;
    onClick: (user: StudentUser) => void;
}

const ProgressRow: React.FC<ProgressRowProps> = React.memo(({
    user,
    totalVideos,
    virtualRow,
    measureElement,
    onClick,
}) => {
    return (
        <div
            ref={measureElement}
            data-index={virtualRow.index}
            style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: `${virtualRow.size}px`,
                transform: `translateY(${virtualRow.start}px)`,
            }}
            onClick={() => onClick(user)}
            className="admin-table-row flex flex-col md:flex-row md:items-center p-4 cursor-pointer transition group border-none gap-3 md:gap-0"
        >
            <div className="w-full md:w-2/5 flex items-center min-w-0">
                <img loading="lazy" className="h-10 w-10 rounded-full object-cover bg-gray-200 border group-hover:border-primary transition flex-shrink-0" src={`https://api.dicebear.com/8.x/initials/svg?seed=${user.name}`} alt="" />
                <div className="ml-4 truncate flex-1 min-w-0">
                    <div className="text-sm font-bold text-slate-900 dark:text-slate-100 group-hover:text-primary transition truncate">{user.name}</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 truncate">{user.email}</div>
                </div>
            </div>
            <div className="w-full md:w-3/5 flex items-center justify-between gap-4 md:pl-4">
                <div className="flex-1 min-w-0 pr-2 md:pr-8">
                    <ProgressBar value={user.watchedVideos.length} max={totalVideos} />
                </div>
                <span className="text-xs md:text-sm font-bold text-slate-800 dark:text-slate-200 w-16 md:w-24 text-right flex-shrink-0">
                    {user.watchedVideos.length} / {totalVideos}
                </span>
            </div>
        </div>
    );
});
ProgressRow.displayName = 'ProgressRow';

export const AdminProgressPage: React.FC = () => {
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedCourseFilter, setSelectedCourseFilter] = useState('all');
    const [selectedSubFilter, setSelectedSubFilter] = useState('all');
    const [selectedUser, setSelectedUser] = useState<StudentUser | null>(null);
    const handleSetSelectedUser = useCallback((user: StudentUser) => {
        setSelectedUser(user);
    }, []);
    const handleBack = useBackNavigation('/admin/dashboard');
    const { addToast } = useContext(NotificationContext);
    const queryClient = useQueryClient();
    const debouncedSearchTerm = useDebounce(searchTerm, 300);
    const parentRef = useRef<HTMLDivElement>(null);

    const [isMobile, setIsMobile] = useState(false);
    useEffect(() => {
        const checkMobile = () => setIsMobile(window.innerWidth < 768);
        checkMobile();
        window.addEventListener('resize', checkMobile);
        return () => window.removeEventListener('resize', checkMobile);
    }, []);

    const { data: users, isLoading: usersLoading, isError: usersError, refetch: refetchUsers } = useQuery<StudentUser[]>({
        queryKey: ['users'],
        queryFn: api.fetchUsers,
    });

    const { data: courses, isLoading: coursesLoading, isError: coursesError, refetch: refetchCourses } = useQuery<CourseLevel[]>({
        queryKey: ['courses'],
        queryFn: api.fetchCourses,
    });
    
    // Mutation to reset progress 
    const resetProgressMutation = useMutation({
        mutationFn: (studentId: string) => api.resetStudentProgress(studentId),
        onSuccess: (updatedUser) => {
            queryClient.invalidateQueries({ queryKey: ['users'] });
            addToast(`El progreso de ${updatedUser.name} ha sido reiniciado.`, 'success');
            // Update selected user reference to reflect zeroed progress immediately
            setSelectedUser(updatedUser);
        },
        onError: () => {
            addToast('Error al reiniciar el progreso del estudiante.', 'error');
        }
    });

    const totalVideos = useMemo(() => {
        if (!courses) return 0;
        return courses.reduce((sum, level) => sum + level.subjects.reduce((s, subject) => s + subject.videos.length, 0), 0);
    }, [courses]);

    const filteredUsers = useMemo(() => {
        if (!users) return [];
        const lowercasedFilter = debouncedSearchTerm.toLowerCase();
        return users.filter(user => {
            const matchesSearch = user.name.toLowerCase().includes(lowercasedFilter) ||
                                 user.email.toLowerCase().includes(lowercasedFilter);
            const matchesCourse = selectedCourseFilter === 'all' || user.enrolledCourseIds.includes(selectedCourseFilter);
            const matchesSub = selectedSubFilter === 'all' || 
                              (selectedSubFilter === 'active' && user.isSubscribed) ||
                              (selectedSubFilter === 'inactive' && !user.isSubscribed);
            return matchesSearch && matchesCourse && matchesSub;
        });
    }, [users, debouncedSearchTerm, selectedCourseFilter, selectedSubFilter]);

    const handleExportCSV = () => {
        if (!filteredUsers || filteredUsers.length === 0) {
            addToast('No hay usuarios para exportar.', 'error');
            return;
        }
        
        const headers = ['Nombre', 'Email', 'Telefono', 'Cursos Inscritos', 'Videos Visto', 'Total Videos', 'Porcentaje', 'Suscripcion'];
        const csvRows = [headers.join(',')];
        
        filteredUsers.forEach(user => {
            const courseNames = user.enrolledCourseIds.map(id => {
                const found = courses?.find(c => c.id === id);
                return found ? found.name : id;
            }).join('; ');
            
            const watchedCount = user.watchedVideos.length;
            const completionPct = totalVideos > 0 ? Math.round((watchedCount / totalVideos) * 100) : 0;
            const subscriptionText = user.isSubscribed ? 'Premium' : 'Gratuito';
            
            const row = [
                `"${user.name.replace(/"/g, '""')}"`,
                `"${user.email.replace(/"/g, '""')}"`,
                `"${user.phone || ''}"`,
                `"${courseNames.replace(/"/g, '""')}"`,
                watchedCount,
                totalVideos,
                `${completionPct}%`,
                subscriptionText
            ];
            csvRows.push(row.join(','));
        });
        
        const csvContent = "\uFEFF" + csvRows.join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `reporte_progreso_aulainfinity_${new Date().toISOString().slice(0, 10)}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        addToast('Reporte de progreso exportado en CSV.', 'success');
    };

    const rowVirtualizer = useVirtualizer({
        count: filteredUsers.length,
        getScrollElement: () => parentRef.current,
        estimateSize: useCallback(() => isMobile ? 112 : 72, [isMobile]), // Estimate height of a row
        overscan: 5,
    });

    const isLoading = usersLoading || coursesLoading;
    const isError = usersError || coursesError;

    const handleRetry = () => {
        if (usersError) refetchUsers();
        if (coursesError) refetchCourses();
    };
    
    if (isError) {
        return <FailureState message="No se pudo cargar el progreso de los estudiantes." onRetry={handleRetry} />;
    }

    return (
        <div className="animate-slide-in-up">
            <div className="flex items-center justify-between mb-6">
                <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-50">Progreso de Estudiantes</h1>
                <button onClick={handleBack} className="flex items-center px-4 py-2 bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-600 text-slate-900 dark:text-slate-100 font-semibold rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors duration-200">
                    <ChevronLeftIcon className="w-5 h-5 mr-2" />Volver
                </button>
            </div>
            
            <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-lg">
                <div className="flex flex-col md:flex-row gap-4 justify-between items-start md:items-center mb-6">
                    <div className="flex flex-col sm:flex-row gap-4 w-full md:w-auto flex-1">
                        {/* Search input */}
                        <div className="relative flex-1 max-w-xs">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <SearchIcon className="h-5 w-5 text-gray-400" />
                            </div>
                            <input
                                type="text"
                                placeholder="Buscar estudiante..."
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                                className="block w-full bg-gray-50 dark:bg-slate-700 border border-gray-300 dark:border-slate-600 rounded-md py-2 pl-10 pr-4 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition text-sm"
                            />
                        </div>

                        {/* Course Filter */}
                        <div className="w-full sm:w-auto">
                            <select
                                value={selectedCourseFilter}
                                onChange={e => setSelectedCourseFilter(e.target.value)}
                                className="block w-full bg-gray-50 dark:bg-slate-700 border border-gray-300 dark:border-slate-600 rounded-md py-2 px-3 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary text-sm"
                            >
                                <option value="all">Todos los Niveles</option>
                                {courses?.map(course => (
                                    <option key={course.id} value={course.id}>{course.name}</option>
                                ))}
                            </select>
                        </div>

                        {/* Subscription Filter */}
                        <div className="w-full sm:w-auto">
                            <select
                                value={selectedSubFilter}
                                onChange={e => setSelectedSubFilter(e.target.value)}
                                className="block w-full bg-gray-50 dark:bg-slate-700 border border-gray-300 dark:border-slate-600 rounded-md py-2 px-3 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary text-sm"
                            >
                                <option value="all">Todas las suscripciones</option>
                                <option value="active">Premium (Suscriptor)</option>
                                <option value="inactive">Gratuito (No suscriptor)</option>
                            </select>
                        </div>
                    </div>

                    {/* Export Action */}
                    <button
                        onClick={handleExportCSV}
                        className="w-full md:w-auto flex items-center justify-center px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg shadow transition duration-150 text-sm"
                    >
                        <DownloadIcon className="w-4 h-4 mr-2" />
                        Exportar Reporte (CSV)
                    </button>
                </div>

                <div className="admin-table admin-table-container">
                    <div className="hidden md:flex items-center p-4 bg-gray-50/80 dark:bg-slate-700/60 border-b border-gray-200 dark:border-slate-700/80 rounded-t-lg w-full">
                        <div className="w-2/5 font-semibold text-sm text-slate-900 dark:text-slate-300">Estudiante</div>
                        <div className="w-3/5 font-semibold text-sm text-slate-900 dark:text-slate-300">Progreso ({totalVideos} vídeos)</div>
                    </div>
                    <div
                        ref={parentRef}
                        className="h-[60vh] overflow-y-auto w-full"
                    >
                        {isLoading ? (
                             <div style={{ height: `${rowVirtualizer.getTotalSize()}px` }} className="w-full relative">
                                {Array.from({ length: 10 }).map((_, i) => <UserRowSkeleton key={i} />)}
                            </div>
                        ) : filteredUsers.length > 0 ? (
                            <div style={{ height: `${rowVirtualizer.getTotalSize()}px` }} className="w-full relative font-medium">
                                {rowVirtualizer.getVirtualItems().map(virtualRow => {
                                    const user = filteredUsers[virtualRow.index];
                                    return (
                                        <ProgressRow
                                            key={user.id}
                                            user={user}
                                            totalVideos={totalVideos}
                                            virtualRow={virtualRow}
                                            measureElement={rowVirtualizer.measureElement}
                                            onClick={handleSetSelectedUser}
                                        />
                                    );
                                })}
                            </div>
                        ) : (
                            <div className="text-center py-12 text-slate-500 dark:text-slate-400">
                                Ningún estudiante coincide con su búsqueda.
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {selectedUser && courses && (
                <StudentDetailsModal
                    user={selectedUser}
                    courses={courses}
                    onClose={() => setSelectedUser(null)}
                    onResetProgress={() => resetProgressMutation.mutate(selectedUser.id)}
                    isResetting={resetProgressMutation.isPending}
                />
            )}
        </div>
    );
};
