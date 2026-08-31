import React, { useState, useContext, useEffect, useCallback, KeyboardEvent, useMemo } from 'react';
import { motion } from 'motion/react';
// FIX: Combined and corrected all react-router-dom imports.
import { Link, useNavigate, useLocation, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { StudentProgressContext } from '../contexts/StudentProgressContext';
// FIX: Corrected import path.
import * as api from '../services/api';
// FIX: Corrected import path.
import type { Subject, Video, CourseLevel, StudentUser, VideoBlock } from '../types';
import { iconMap } from './iconMap';
// FIX: Corrected import path.
import { ChevronRightIcon, PlayIcon, CheckCircleIcon, ChevronLeftIcon, BookOpenIcon, LockClosedIcon, ChatBubbleLeftRightIcon } from './icons';
import { Heart } from 'lucide-react';
// FIX: Corrected import path.
import { ROUTES, generateVideoPath, generateCourseLevelPath } from '../constants/routes';
import { FREE_VIDEO_IDS } from '../constants/content';
import { AuthContext } from '../contexts/AuthContext';
import { useBackNavigation } from '../hooks/useBackNavigation';
import { useI18n } from '../hooks/useI18n';
import { isTeacherCourseAssigned, isTeacherSubjectAssigned } from '../utils/teacherPermissions';
import { Card, CardTitle, CardDescription } from './ui/Card';


import { getVideoDifficulty } from '../utils/courseUtils';
export { getVideoDifficulty };


// FIX: Refactored to use conditional rendering for Link/div to solve TypeScript error.
// The previous dynamic component approach caused type conflicts between Link props and div props.
const VideoListItem: React.FC<{ video: Video; isWatched: boolean; isSubscribed: boolean; levelId: string; subjectId: string; }> = React.memo(({ video, isWatched, isSubscribed, levelId, subjectId }) => {
    const { favoriteVideos = [], toggleFavoriteVideo } = useContext(StudentProgressContext);
    const isFavorite = favoriteVideos.includes(video.id);
    const isFree = FREE_VIDEO_IDS.includes(video.id);
    const isLocked = !isSubscribed && !isFree;
    const difficulty = getVideoDifficulty(video);

    const commonClassName = "group flex items-center p-4 rounded-lg transition-colors duration-200";

    // Common content for both locked and unlocked states to avoid repetition.
    const content = (
        <>
            <div className="flex-shrink-0">
                {isLocked ? (
                    <LockClosedIcon className="w-6 h-6 text-slate-400" />
                ) : isWatched ? (
                    <CheckCircleIcon className="w-6 h-6 text-green-500" />
                ) : (
                    <PlayIcon className="w-6 h-6 text-slate-500 dark:text-slate-400 group-hover:text-primary transition-colors" />
                )}
            </div>
            <div className={`ml-4 flex-1 ${isLocked ? 'opacity-60' : ''}`}>
                <div className="flex flex-wrap items-center gap-2">
                    <p className={`font-semibold ${isLocked ? 'text-slate-900 dark:text-slate-100' : 'text-slate-900 dark:text-slate-100 group-hover:text-primary'}`}>{video.title}</p>
                    <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full uppercase tracking-wider ${
                        difficulty === 'Básico' 
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/20 dark:text-emerald-400 dark:border-emerald-900/30'
                        : difficulty === 'Intermedio'
                        ? 'bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/20 dark:text-amber-400 dark:border-amber-900/30'
                        : 'bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/20 dark:text-rose-400 dark:border-rose-900/30'
                    }`}>
                        {difficulty}
                    </span>
                </div>
                <p className="text-sm text-slate-600 dark:text-slate-400 mt-0.5">{video.description}</p>
            </div>
            {isFree && !isWatched && (
                <span className="ml-4 px-2.5 py-1 bg-green-100 text-green-800 text-xs font-bold rounded-full flex-shrink-0">
                    GRATIS
                </span>
            )}
            <button
                type="button"
                onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    toggleFavoriteVideo(video.id);
                }}
                className={`ml-3 p-2 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700 transition-all cursor-pointer flex-shrink-0 focus:outline-none focus:ring-2 focus:ring-primary ${
                    isFavorite ? 'text-rose-500 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/30' : 'text-slate-400 hover:text-rose-500 dark:hover:text-rose-400'
                }`}
                title={isFavorite ? "Quitar de favoritos" : "Marcar como favorito"}
                aria-label={isFavorite ? `Quitar ${video.title} de favoritos` : `Marcar ${video.title} como favorito`}
            >
                <Heart className={`w-5 h-5 transition-transform active:scale-125 ${isFavorite ? 'fill-current' : ''}`} />
            </button>
            {!isLocked && (
                <ChevronRightIcon className="w-5 h-5 text-slate-400 ml-2 transform transition-transform group-hover:translate-x-1 flex-shrink-0" />
            )}
        </>
    );

    // Conditionally render a non-clickable div or a react-router Link wrapped in a motion.div for smooth entry transitions
    if (isLocked) {
        return (
            <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, ease: "easeOut" }}
                className="w-full"
            >
                <div className={`${commonClassName} cursor-not-allowed bg-gray-50 dark:bg-slate-800/50`}>
                    {content}
                </div>
            </motion.div>
        );
    }
    
    return (
        <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="w-full"
        >
            <Link to={generateVideoPath(video.id)} state={{ fromLevel: levelId, fromSubject: subjectId }} className={`${commonClassName} hover:bg-gray-100 dark:hover:bg-slate-700`}>
                {content}
            </Link>
        </motion.div>
    );
});


const SubjectCard: React.FC<{ subject: Subject; watchedVideos: string[]; onSelect: () => void; }> = React.memo(({ subject, watchedVideos, onSelect }) => {
    const totalVideos = subject.videos.length > 0 ? subject.videos.length : (subject.blocks?.reduce((sum, block) => sum + block.videos.length, 0) || 0);
    const watchedInSubject = subject.videos.filter(v => watchedVideos.includes(v.id)).length + (subject.blocks?.flatMap(b => b.videos).filter(v => watchedVideos.includes(v.id)).length || 0);
    const progress = totalVideos > 0 ? Math.round((watchedInSubject / totalVideos) * 100) : 0;
    const SubjectIcon = iconMap[subject.icon] || BookOpenIcon;
    
    const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onSelect();
        }
    };

    return (
        <Card 
            variant="interactive"
            padding="md"
            className="cursor-pointer transform hover:-translate-y-1 transition-transform duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            onClick={onSelect}
            onKeyDown={handleKeyDown}
            role="button"
            tabIndex={0}
            aria-label={`Seleccionar asignatura ${subject.name}`}
        >
            <div className="flex items-start justify-between">
                <div>
                    <div className="p-3 bg-primary/10 inline-block rounded-xl">
                        <SubjectIcon className="w-8 h-8 text-primary" />
                    </div>
                    <CardTitle className="mt-4">{subject.name}</CardTitle>
                    <CardDescription className="mt-1">{totalVideos} vídeos</CardDescription>
                </div>
                <div className="text-right">
                     <span className="text-sm font-semibold text-primary">{progress}%</span>
                </div>
            </div>
             <div className="mt-4 bg-gray-200 dark:bg-slate-700 rounded-full h-2">
                <div className="bg-primary h-2 rounded-full" style={{ width: `${progress}%` }}></div>
            </div>
        </Card>
    );
});

const BlockedVideoList: React.FC<{ blocks: VideoBlock[]; watchedVideos: string[]; isSubscribed: boolean; levelId: string; subjectId: string; }> = React.memo(({ blocks, watchedVideos, isSubscribed, levelId, subjectId }) => {
    const [expandedBlock, setExpandedBlock] = useState<string | null>(null);

    const toggleBlock = (blockName: string) => {
        setExpandedBlock(prev => (prev === blockName ? null : blockName));
    };

    return (
        <div className="space-y-2">
            {blocks.map(block => (
                <div key={block.name} className="border dark:border-slate-700 rounded-lg bg-gray-50 dark:bg-slate-800/50 overflow-hidden">
                    <button
                        onClick={() => toggleBlock(block.name)}
                        className="w-full flex items-center justify-between p-4 text-left font-semibold text-lg text-slate-900 dark:text-slate-100 hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                        aria-expanded={expandedBlock === block.name}
                        aria-label={`Bloque de contenido: ${block.name}. Haz clic para ${expandedBlock === block.name ? 'contraer' : 'expandir'}.`}
                    >
                        <span>{block.name}</span>
                        <ChevronRightIcon className={`w-5 h-5 transition-transform ${expandedBlock === block.name ? 'rotate-90' : ''}`} />
                    </button>
                    {expandedBlock === block.name && (
                        <div className="divide-y divide-gray-200 dark:divide-slate-700 bg-white dark:bg-slate-800">
                            {block.videos.length === 0 ? (
                                <div className="p-4 text-center text-sm text-slate-500 dark:text-slate-400 italic">
                                    Este bloque aún no tiene vídeos.
                                </div>
                            ) : (
                                block.videos.map(video => (
                                    <VideoListItem key={video.id} video={video} isWatched={watchedVideos.includes(video.id)} isSubscribed={isSubscribed} levelId={levelId} subjectId={subjectId}/>
                                ))
                            )}
                        </div>
                    )}
                </div>
            ))}
        </div>
    );
});


export const CoursePage: React.FC = () => {
    const { level } = useParams<{ level: string }>();
    const { user } = useContext(AuthContext);
    const { watchedVideos } = useContext(StudentProgressContext);
    const navigate = useNavigate();
    const handleBack = useBackNavigation();
    const location = useLocation();
    const { openSubject } = location.state || {};
    const { t } = useI18n();

    const [selectedSubject, setSelectedSubject] = useState<Subject | null>(null);
    const [difficultyFilter, setDifficultyFilter] = useState<'Todos' | 'Básico' | 'Intermedio' | 'Avanzado'>('Todos');

    const { data: courses, isLoading } = useQuery<CourseLevel[]>({
        queryKey: ['courses'],
        queryFn: api.fetchCourses
    });
    
    // --- Access Control ---
    useEffect(() => {
        if (user && user.role === 'student') {
            const student = user as StudentUser;
            // Redirect if they try to access a course they are not enrolled in
            if (level && student.enrolledCourseIds && !student.enrolledCourseIds.includes(level)) {
                navigate(ROUTES.DASHBOARD, { replace: true });
            }
        }
    }, [user, level, navigate]);

    const courseLevel = courses?.find(c => c.id === level);

    useEffect(() => {
        // Reset when level changes or a refresh is forced from sidebar
        setSelectedSubject(null);
        setDifficultyFilter('Todos');
        window.scrollTo(0, 0);
    }, [level, location.state?.refresh]);

    useEffect(() => {
        // Restore subject selection when navigating back from a video
        if (openSubject && courseLevel) {
            const subjectToOpen = courseLevel.subjects.find(s => s.id === openSubject);
            if (subjectToOpen) {
                setSelectedSubject(subjectToOpen);
            }
        }
    }, [openSubject, courseLevel]);

    useEffect(() => {
        // Reset difficulty filter when switching subjects
        setDifficultyFilter('Todos');
    }, [selectedSubject]);

    const isSubscribed = user?.role === 'teacher' || user?.role === 'admin' ? true : (user?.role === 'student' ? (user as StudentUser).isSubscribed : false);

    const subjectsToDisplay = useMemo(() => {
        if (!courseLevel?.subjects) return [];
        if (user?.role === 'teacher') {
            return courseLevel.subjects.filter(s => isTeacherSubjectAssigned(user, s.id, s.name));
        }
        return courseLevel.subjects;
    }, [courseLevel, user]);

    // Filter videos inside blocks
    const filteredBlocks = useMemo(() => {
        if (!selectedSubject || !selectedSubject.blocks) return [];
        if (difficultyFilter === 'Todos') return selectedSubject.blocks;

        return selectedSubject.blocks
            .map(block => {
                const filteredVideos = block.videos.filter(v => getVideoDifficulty(v) === difficultyFilter);
                return { ...block, videos: filteredVideos };
            })
            .filter(block => block.videos.length > 0);
    }, [selectedSubject, difficultyFilter]);

    // Filter direct videos (fallback if no blocks exist)
    const filteredDirectVideos = useMemo(() => {
        if (!selectedSubject || !selectedSubject.videos) return [];
        if (difficultyFilter === 'Todos') return selectedSubject.videos;

        return selectedSubject.videos.filter(v => getVideoDifficulty(v) === difficultyFilter);
    }, [selectedSubject, difficultyFilter]);

    const handleSelectSubject = useCallback((subject: Subject) => {
        setSelectedSubject(subject);
        window.scrollTo(0, 0);
    }, []);

    if (isLoading) {
        return <div className="text-center p-8">{t('common.loading')}</div>;
    }

    if (!courseLevel) {
        return <div className="text-center p-8">Nivel del curso no encontrado.</div>;
    }

    if (user?.role === 'teacher' && !isTeacherCourseAssigned(user, courseLevel.id, courseLevel.name)) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[50vh] p-8 text-center bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-red-200 dark:border-red-900/40 max-w-xl mx-auto my-8 animate-fade-in">
                <div className="p-4 bg-red-50 dark:bg-red-950/30 rounded-full text-red-600 dark:text-red-400 mb-4">
                    <LockClosedIcon className="w-12 h-12" />
                </div>
                <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-50 mb-2">
                    {t('coursePage.accessDenied')}
                </h2>
                <p className="text-slate-600 dark:text-slate-400 text-sm max-w-md mb-6 leading-relaxed">
                    {t('coursePage.noCourseAssignedDesc', { courseName: courseLevel.name })}
                </p>
                <button
                    onClick={() => navigate(ROUTES.DASHBOARD)}
                    className="px-6 py-2.5 bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:hover:bg-white dark:text-slate-900 text-white font-bold text-sm rounded-xl transition cursor-pointer shadow-md"
                >
                    {t('coursePage.backToMyPanel')}
                </button>
            </div>
        );
    }

    if (user?.role === 'teacher' && selectedSubject && !isTeacherSubjectAssigned(user, selectedSubject.id, selectedSubject.name)) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[50vh] p-8 text-center bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-red-200 dark:border-red-900/40 max-w-xl mx-auto my-8 animate-fade-in">
                <div className="p-4 bg-red-50 dark:bg-red-950/30 rounded-full text-red-600 dark:text-red-400 mb-4">
                    <LockClosedIcon className="w-12 h-12" />
                </div>
                <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-50 mb-2">
                    {t('coursePage.accessDenied')}
                </h2>
                <p className="text-slate-600 dark:text-slate-400 text-sm max-w-md mb-6 leading-relaxed">
                    {t('coursePage.noSubjectAssignedDesc', { subjectName: selectedSubject.name })}
                </p>
                <button
                    onClick={() => setSelectedSubject(null)}
                    className="px-6 py-2.5 bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:hover:bg-white dark:text-slate-900 text-white font-bold text-sm rounded-xl transition cursor-pointer shadow-md"
                >
                    {t('coursePage.backToSubjects')}
                </button>
            </div>
        );
    }

    if (selectedSubject) {
        return (
            <div className="animate-slide-in-up">
                 <button onClick={() => setSelectedSubject(null)} aria-label={t('coursePage.backToSubjects')} className="flex items-center mb-4 px-4 py-2 bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-600 text-slate-900 dark:text-slate-100 font-semibold rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors duration-200">
                    <ChevronLeftIcon className="w-5 h-5 mr-2" />{t('coursePage.backToSubjects')}
                </button>
                <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-lg">
                    {/* Header with Title and Difficulty Filters */}
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-100 dark:border-slate-700 pb-5 mb-6">
                        <div>
                            <h2 className="text-3xl font-bold text-slate-900 dark:text-slate-50">{selectedSubject.name}</h2>
                            <p className="text-sm text-slate-500 mt-1">{t('coursePage.filterPrompt')}</p>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5 bg-slate-100 dark:bg-slate-900 p-1 rounded-xl border border-slate-200/40 self-start sm:self-center">
                            {(['Todos', 'Básico', 'Intermedio', 'Avanzado'] as const).map(diff => (
                                <button
                                    key={diff}
                                    onClick={() => setDifficultyFilter(diff)}
                                    aria-pressed={difficultyFilter === diff}
                                    aria-label={`Filtrar lecciones: ${diff}`}
                                    className={`px-3.5 py-1.5 rounded-lg text-xs font-bold tracking-tight transition-all cursor-pointer ${
                                        difficultyFilter === diff
                                            ? 'bg-slate-900 dark:bg-slate-800 text-white shadow-sm'
                                            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/20'
                                    }`}
                                >
                                    {diff === 'Todos' ? t('common.all') : diff === 'Básico' ? t('common.basic') : diff === 'Intermedio' ? t('common.intermediate') : t('common.advanced')}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Display of Blocks */}
                    {selectedSubject.blocks && selectedSubject.blocks.length > 0 && (
                        <BlockedVideoList blocks={filteredBlocks} watchedVideos={watchedVideos} isSubscribed={isSubscribed} levelId={level!} subjectId={selectedSubject.id} />
                    )}

                    {/* Display of Direct Videos (Standard layout list fallback) */}
                    {selectedSubject.videos && selectedSubject.videos.length > 0 && (
                        <div className="space-y-2 mt-4">
                            {selectedSubject.blocks && selectedSubject.blocks.length > 0 && (
                                <h3 className="text-sm font-semibold uppercase text-slate-500 dark:text-slate-400 mb-2 px-2">{t('coursePage.individualLessons')}</h3>
                            )}
                            <div className="divide-y divide-gray-200 dark:divide-slate-700">
                                {filteredDirectVideos.map(video => (
                                    <VideoListItem key={video.id} video={video} isWatched={watchedVideos.includes(video.id)} isSubscribed={isSubscribed} levelId={level!} subjectId={selectedSubject.id} />
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Empty State when no videos match difficulty filter */}
                    {filteredBlocks.length === 0 && filteredDirectVideos.length === 0 && (
                        <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                            <div className="p-4 bg-slate-55 dark:bg-slate-900/60 rounded-full text-slate-400 mb-4 border border-slate-100 dark:border-slate-800">
                                <BookOpenIcon className="w-8 h-8 opacity-60 animate-pulse" />
                            </div>
                            <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">{t('common.noLessonsAvailable')}</h3>
                            <p className="text-sm text-slate-500 max-w-sm mt-1">
                                {t('coursePage.noLessonsInDiff', { diff: difficultyFilter })}
                            </p>
                            <button
                                onClick={() => setDifficultyFilter('Todos')}
                                className="mt-4 px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-bold rounded-xl transition-all cursor-pointer"
                            >
                                {t('common.resetFilters')}
                            </button>
                        </div>
                    )}
                </div>
            </div>
        );
    }

    return (
         <div className="animate-slide-in-up">
            <div className="flex justify-between items-center mb-4">
                 <button onClick={handleBack} aria-label={t('common.goBack')} className="flex items-center px-4 py-2 bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-600 text-slate-900 dark:text-slate-100 font-semibold rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors duration-200">
                    <ChevronLeftIcon className="w-5 h-5 mr-2" />{t('common.goBack')}
                </button>
                <nav className="flex items-center text-sm text-slate-600 dark:text-slate-400">
                    <Link to={ROUTES.DASHBOARD} className="hover:text-primary flex-shrink-0">{t('sidebar.dashboard')}</Link>
                    <ChevronRightIcon className="w-4 h-4 mx-1 flex-shrink-0" />
                    <span className="font-semibold text-slate-900 dark:text-slate-100 truncate max-w-[120px] sm:max-w-xs md:max-w-md inline-block align-bottom" title={courseLevel.name}>{courseLevel.name}</span>
                </nav>
            </div>

            <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-slate-900 dark:text-slate-50 mb-2 break-words leading-tight">{t('coursePage.subjectsOf', { courseName: courseLevel.name })}</h1>
            <p className="text-lg text-slate-600 dark:text-slate-400 mb-8">{t('coursePage.selectSubjectPrompt')}</p>

            <div className="bg-gradient-to-r from-indigo-50 to-rose-50/10 dark:from-slate-800/40 dark:to-slate-850/20 border border-indigo-100/65 dark:border-slate-700/60 rounded-2xl p-5 mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="flex items-start gap-4">
                    <div className="p-3 bg-indigo-600 rounded-xl text-white shadow-md shadow-indigo-500/10 hidden sm:block">
                        <ChatBubbleLeftRightIcon className="w-6 h-6" />
                    </div>
                    <div>
                        <h2 className="text-lg font-bold text-slate-900 dark:text-slate-50 flex items-center gap-2">
                            <span>{t('common.communityChat')}</span>
                            <span className="text-[10px] bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 font-extrabold px-1.5 py-0.5 rounded-md flex-shrink-0 tracking-wider">{t('common.realTime')}</span>
                        </h2>
                        <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                            {t('coursePage.communityChatDesc', { courseName: courseLevel.name })}
                        </p>
                    </div>
                </div>
                <button
                    onClick={() => {
                        navigate(ROUTES.STUDENT_CHAT, {
                            state: {
                                activeConvoId: level!,
                                activeChatType: 'group'
                            }
                        });
                    }}
                    className="self-start sm:self-center px-4.5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-md cursor-pointer transition-all hover:scale-102 flex items-center gap-1.5"
                >
                    <span>{t('common.enterGroupChat')}</span>
                </button>
            </div>

            {subjectsToDisplay.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                    {subjectsToDisplay.map(subject => (
                        <SubjectCard 
                            key={subject.id} 
                            subject={subject} 
                            watchedVideos={watchedVideos}
                            onSelect={() => handleSelectSubject(subject)}
                        />
                    ))}
                </div>
            ) : (
                <div className="flex flex-col items-center justify-center p-8 text-center bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 my-4">
                    <BookOpenIcon className="w-12 h-12 text-slate-400 mb-3" />
                    <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">{t('coursePage.noSubjectsAvailable')}</h3>
                    <p className="text-sm text-slate-500 max-w-md mt-1">
                        {user?.role === 'teacher' 
                            ? t('coursePage.noSubjectsDescTeacher')
                            : t('coursePage.noSubjectsDescStudent')}
                    </p>
                </div>
            )}
        </div>
    );
};