import React, { useContext, useMemo, useState } from 'react';
import { 
    ResponsiveContainer, 
    ComposedChart, 
    Bar, 
    Cell,
    Line, 
    XAxis, 
    YAxis, 
    Tooltip, 
    CartesianGrid,
    AreaChart,
    Area,
    BarChart,
    Legend
} from 'recharts';
import { ThemeContext } from '../contexts/ThemeContext';
// FIX: Changed react-router-dom import to resolve module export errors.
import { Link, Navigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { AuthContext } from '../contexts/AuthContext';
import { auth } from '../services/firebase';
import { StudentProgressContext } from '../contexts/StudentProgressContext';
import { eventEmitter } from '../services/eventService';
// FIX: Corrected import path.
import * as api from '../services/api';
import { findVideoById } from '../data/database';
// FIX: Corrected import path.
import type { StudentUser, CourseLevel, Video, ExamEvent, StudentAnswer } from '../types';
// FIX: Corrected import path.
import { PlayIcon, CheckCircleIcon, ChartBarIcon, AcademicCapIcon, CreditCardIcon, EyeIcon, ExclamationTriangleIcon } from './icons';
import { Flame, Activity, TrendingUp, Target, BookOpen, Award, CheckSquare, Brain, Clock, Sparkles, Sliders, Heart } from 'lucide-react';
import { useStudyStreak } from '../hooks/useStudyStreak';
// FIX: Corrected import path.
import { ROUTES, generateCourseLevelPath, generateVideoPath } from '../constants/routes';
import { FREE_VIDEO_IDS } from '../constants/content';
import { useI18n } from '../hooks/useI18n';
import { TeacherDashboard } from './TeacherDashboard';
import { StudentLessonsPerformanceChart } from './StudentLessonsPerformanceChart';
import { StudentTutoringProgressChart } from './StudentTutoringProgressChart';
import { Badge, EmptyState } from './ui';

// --- COMPONENTS FOR SUBSCRIBED DASHBOARD ---

const StatCard: React.FC<{ icon: React.ReactNode; label: string; value: string | number; color: string }> = React.memo(({ icon, label, value, color }) => (
    <motion.div 
        whileHover={{ scale: 1.03, y: -2 }}
        whileTap={{ scale: 0.98 }}
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 350, damping: 25 }}
        className="premium-card p-6 flex items-center select-none"
    >
        <div className={`p-3 rounded-2xl text-white ${color} bg-gradient-to-br shadow-inner`}>
            {icon}
        </div>
        <div className="ml-4">
            <p className="text-3xl font-bold text-slate-900 dark:text-slate-50 font-display leading-none">{value}</p>
            <p className="text-slate-500 dark:text-slate-400 text-xs mt-1.5 font-medium">{label}</p>
        </div>
    </motion.div>
));

const CourseProgress: React.FC<{ level: CourseLevel; watchedVideos: string[] }> = React.memo(({ level, watchedVideos = [] }) => {
    const totalVideos = (level?.subjects || []).reduce((sum, subject) => sum + (subject?.videos || []).length, 0);
    const watchedInLevel = (level?.subjects || []).flatMap(s => s?.videos || []).filter(v => v?.id && (watchedVideos || []).includes(v.id)).length;
    const progress = totalVideos > 0 ? Math.round((watchedInLevel / totalVideos) * 100) : 0;
    
    return (
        <motion.div
            whileHover={{ scale: 1.015, y: -3 }}
            whileTap={{ scale: 0.995 }}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ type: "spring", stiffness: 280, damping: 22 }}
        >
            <Link to={generateCourseLevelPath(level?.id || '')} className="group block premium-card p-6 border border-slate-100 dark:border-slate-800/80 hover:border-primary/20 hover:shadow-premium-hover">
                <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-1.5 sm:gap-4 w-full">
                    <h3 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-slate-50 group-hover:text-primary transition-colors leading-tight break-words min-w-0 flex-1 font-display">{level?.name || (level as any)?.title || 'Curso'}</h3>
                    <span className="text-xs sm:text-sm font-semibold text-primary flex-shrink-0 whitespace-nowrap bg-primary/5 dark:bg-primary/10 px-2.5 py-1 rounded-full">{progress}% {useI18n().t('dashboard.completed') || 'completado'}</span>
                </div>
                <div className="mt-4 bg-slate-100 dark:bg-slate-700/80 rounded-full h-2.5 overflow-hidden">
                    <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${progress}%` }}
                        transition={{ duration: 0.8, ease: "easeOut" }}
                        className="bg-gradient-to-r from-primary to-indigo-500 h-2.5 rounded-full"
                    ></motion.div>
                </div>
            </Link>
        </motion.div>
    );
});

const RecentlyWatched: React.FC<{ watchedVideos: string[], courses: CourseLevel[] }> = React.memo(({ watchedVideos = [], courses = [] }) => {
    const { t } = useI18n();
    const recentVideos = useMemo(() => {
        if (!courses || !watchedVideos) return [];
        return [...(watchedVideos || [])].reverse().slice(0, 5).map(videoId => findVideoById(videoId, courses)).filter(Boolean) as Video[];
    }, [watchedVideos, courses]);

    if (recentVideos.length === 0) {
        return null;
    }

    return (
        <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-xl border border-slate-100 dark:border-slate-700/80">
            <h3 className="text-xl font-bold text-slate-900 dark:text-slate-50 mb-4 font-display">{t('dashboard.recentlyWatched')}</h3>
            <ul className="space-y-3">
                {recentVideos.map(video => (
                    <li key={video.id}>
                        <Link to={generateVideoPath(video.id)} className="flex items-center p-2.5 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700/60 transition-colors">
                           <PlayIcon className="w-6 h-6 text-primary flex-shrink-0" />
                           <span className="ml-3 text-slate-900 dark:text-slate-300 font-medium">{video.title}</span>
                        </Link>
                    </li>
                ))}
            </ul>
        </div>
    );
});


// --- QUIZ HISTORY PANEL FOR STUDENTS ---

const QuizHistorySection: React.FC<{ studentAnswers: StudentAnswer[], videoMap: Map<string, string> }> = React.memo(({ studentAnswers = [], videoMap = new Map() }) => {
    const { t } = useI18n();
    
    // Reverse chronologically
    const sortedAnswers = useMemo(() => {
        return [...(studentAnswers || [])].sort((a, b) => new Date(b?.timestamp || 0).getTime() - new Date(a?.timestamp || 0).getTime());
    }, [studentAnswers]);

    if (sortedAnswers.length === 0) {
        return (
            <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-xl border border-slate-100 dark:border-slate-700/80">
                <EmptyState
                    icon={<Brain className="w-8 h-8 text-indigo-500" />}
                    title={t('dashboard.noQuizzesTitle')}
                    description={t('dashboard.noQuizzesSubtitle')}
                />
            </div>
        );
    }

    return (
        <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-xl border border-slate-100 dark:border-slate-700/80">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-700/60 pb-4 mb-5">
                <div>
                    <h3 className="text-xl font-bold text-slate-900 dark:text-slate-50 flex items-center gap-2 font-display">
                        <svg className="w-5 h-5 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        {t('dashboard.quizHistoryTitle')}
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{t('dashboard.quizHistorySubtitle')}</p>
                </div>
                <Badge variant="primary" size="sm">
                    {sortedAnswers.length} {sortedAnswers.length === 1 ? 'Quiz' : 'Quizzes'}
                </Badge>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {sortedAnswers.map((answer, index) => {
                    const videoTitle = videoMap.get(answer.videoId);
                    const quizName = videoTitle ? `Quiz: ${videoTitle}` : `Quiz (${answer.videoId})`;
                    const percentage = Math.round((answer.score / answer.totalQuestions) * 100);
                    
                    // Style badges based on score
                    let badgeVariant: 'success' | 'danger' | 'primary' = 'success';
                    let badgeText = t('dashboard.outstanding');
                    if (percentage < 60) {
                        badgeVariant = 'danger';
                        badgeText = t('dashboard.review');
                    } else if (percentage < 85) {
                        badgeVariant = 'primary';
                        badgeText = t('dashboard.passed');
                    }

                    return (
                        <motion.div
                            key={answer.quizId + answer.timestamp + index}
                            initial={{ opacity: 0, scale: 0.98 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ duration: 0.2, delay: Math.min(index * 0.05, 0.4) }}
                            whileHover={{ scale: 1.01 }}
                            className="bg-slate-50/50 dark:bg-slate-900/30 border border-slate-100 dark:border-slate-750 p-4 rounded-xl flex flex-col justify-between hover:shadow-premium-hover hover:border-indigo-100 hover:dark:border-slate-700 transition-all"
                        >
                            <div>
                                <div className="flex justify-between items-start gap-2 mb-2">
                                    <h4 className="font-bold text-slate-900 dark:text-slate-100 text-sm line-clamp-2" title={quizName}>
                                        {quizName}
                                    </h4>
                                    <Badge variant={badgeVariant} size="sm" dot>
                                        {badgeText}
                                    </Badge>
                                </div>
                                <div className="space-y-1.5 text-xs text-slate-550 dark:text-slate-400 mt-2 font-medium">
                                    <div className="flex items-center gap-1.5">
                                        <svg className="w-3.5 h-3.5 text-slate-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                        </svg>
                                        <span>{t('dashboard.date')} {new Date(answer.timestamp).toLocaleDateString()}</span>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        <svg className="w-3.5 h-3.5 text-slate-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                                        </svg>
                                        <span>{t('dashboard.correct')} <strong className="text-slate-700 dark:text-slate-300">{answer.score}</strong> {t('dashboard.of')} {answer.totalQuestions} ({percentage}%)</span>
                                    </div>
                                </div>
                            </div>

                            <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between">
                                {/* Visual Score Ring or Bar */}
                                <div className="w-2/3 bg-slate-200 dark:bg-slate-700 rounded-full h-1.5 overflow-hidden">
                                    <div 
                                        className={`h-full rounded-full ${percentage >= 85 ? 'bg-emerald-500' : percentage >= 60 ? 'bg-blue-500' : 'bg-rose-500'}`}
                                        style={{ width: `${percentage}%` }}
                                    ></div>
                                </div>
                                <Link 
                                    to={generateVideoPath(answer.videoId)}
                                    className="text-xs font-bold text-indigo-650 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 transition-colors flex items-center gap-0.5 shrink-0"
                                >
                                    {t('dashboard.repeat')}
                                </Link>
                            </div>
                        </motion.div>
                    );
                })}
            </div>
        </div>
    );
});

// --- STUDY ACTIVITY AND PERFORMANCE PANEL ---

interface CustomTooltipProps {
    active?: boolean;
    payload?: any[];
    label?: string;
}

const CustomTooltip: React.FC<CustomTooltipProps> = ({ active, payload }) => {
    const { t } = useI18n();
    if (active && payload && payload.length) {
        const data = payload[0].payload;
        const mins = data.minutos;
        const target = data.objetivo;
        const reachedTarget = mins >= target;

        return (
            <div className="bg-slate-900 border border-slate-700/60 p-3 rounded-xl shadow-xl select-none text-white text-xs max-w-[190px]">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                    {data.fullName}
                </p>
                <div className="space-y-1">
                    <div className="flex items-center justify-between gap-4 font-semibold">
                        <span className="flex items-center gap-1 text-indigo-300">
                            <span className="w-2 h-2 bg-indigo-500 rounded-full inline-block"></span>
                            {t('dashboard.studyLabel')}:
                        </span>
                        <span className="font-mono">{mins} Min</span>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                        <span className="flex items-center gap-1 text-slate-400">
                            <span className="w-2 h-0.5 bg-amber-500 rounded-full inline-block"></span>
                            {t('dashboard.targetLabel')}:
                        </span>
                        <span className="font-mono text-slate-300">{target} Min</span>
                    </div>
                </div>
                <div className="mt-2 pt-1.5 border-t border-slate-800 flex items-center gap-1 text-[9px] font-extrabold">
                    {reachedTarget ? (
                        <span className="text-emerald-400 flex items-center gap-1">
                            {t('dashboard.objectiveReached')}
                        </span>
                    ) : (
                        <span className="text-amber-400 flex items-center gap-1">
                            {t('dashboard.missingMins', { mins: target - mins })}
                        </span>
                    )}
                </div>
            </div>
        );
    }
    return null;
};

const StudyActivityPerformancePanel: React.FC<{ watchedVideos: string[], courses: CourseLevel[] }> = React.memo(({ watchedVideos = [], courses = [] }) => {
    const { t } = useI18n();
    const { theme } = useContext(ThemeContext);
    const isDark = theme === 'dark';

    // Interactive state for week selection & daily study goal matching
    const [selectedWeek, setSelectedWeek] = useState<'current' | 'previous'>('current');
    const [dailyGoal, setDailyGoal] = useState<number>(45);

    const recentVideos = useMemo(() => {
        if (!courses || !watchedVideos) return [];
        return [...(watchedVideos || [])].reverse().slice(0, 5).map(videoId => findVideoById(videoId, courses)).filter(Boolean) as Video[];
    }, [watchedVideos, courses]);

    // Simple deterministic weekly minutes based on watched videos length and selected week
    const weeklyMinutes = useMemo(() => {
        const base = selectedWeek === 'current'
            ? [30, 45, 15, 60, 40, 25, 10]
            : [40, 50, 30, 20, 45, 60, 15];
        const totalVideos = (watchedVideos || []).length;
        
        return base.map((m, i) => {
            const multiplier = selectedWeek === 'current'
                ? 1 + (totalVideos * 0.15) + (i % 2 === 0 ? 0.05 : -0.05)
                : 1 + (totalVideos * 0.10) + (i % 2 !== 0 ? 0.04 : -0.04);
            return Math.min(180, Math.round(m * multiplier));
        });
    }, [watchedVideos, selectedWeek]);

    const totalWeeklyMinutes = useMemo(() => {
        return weeklyMinutes.reduce((acc, m) => acc + m, 0);
    }, [weeklyMinutes]);

    const totalWeeklyTimeText = useMemo(() => {
        const h = Math.floor(totalWeeklyMinutes / 60);
        const m = totalWeeklyMinutes % 60;
        return h > 0 ? `${h}h ${m}m` : `${m} min`;
    }, [totalWeeklyMinutes]);

    const weekdays = useMemo(() => [
        { key: t('dashboard.day_Lun'), name: t('dashboard.day_Lunes') },
        { key: t('dashboard.day_Mar'), name: t('dashboard.day_Martes') },
        { key: t('dashboard.day_Mie'), name: t('dashboard.day_Miercoles') },
        { key: t('dashboard.day_Jue'), name: t('dashboard.day_Jueves') },
        { key: t('dashboard.day_Vie'), name: t('dashboard.day_Viernes') },
        { key: t('dashboard.day_Sab'), name: t('dashboard.day_Sabado') },
        { key: t('dashboard.day_Dom'), name: t('dashboard.day_Domingo') }
    ], [t]);

    const chartData = useMemo(() => {
        return weekdays.map((day, idx) => ({
            name: day.key,
            fullName: day.name,
            minutos: weeklyMinutes[idx],
            objetivo: dailyGoal
        }));
    }, [weeklyMinutes, dailyGoal, weekdays]);

    const studyStreakThisWeek = useMemo(() => {
        return weeklyMinutes.filter(m => m >= dailyGoal).length;
    }, [weeklyMinutes, dailyGoal]);

    return (
        <div id="study-performance-panel" className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-lg border border-slate-100 dark:border-slate-700">
            {/* Header with Title and Total stats */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-100 dark:border-slate-700/60 pb-5 mb-6">
                <div>
                    <h3 className="text-xl font-bold text-slate-900 dark:text-slate-50 flex items-center gap-2">
                        <svg className="w-5 h-5 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                        {t('dashboard.studyPerformanceTitle')}
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{t('dashboard.studyPerformanceSubtitle')}</p>
                </div>
                
                <div className="flex items-center gap-3 bg-indigo-50/50 dark:bg-slate-750 p-2.5 px-4 rounded-xl border border-indigo-100/30 dark:border-slate-700/40 select-none">
                    <div className="p-2 bg-indigo-600 rounded-lg text-white">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                    </div>
                    <div>
                        <p className="text-[10px] text-indigo-600 dark:text-indigo-400 font-bold uppercase tracking-wider">{t('dashboard.weeklyStudyTime')}</p>
                        <p className="text-lg font-black text-slate-900 dark:text-slate-50 leading-tight">{totalWeeklyTimeText}</p>
                    </div>
                </div>
            </div>

            {/* Grid container */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                {/* Column 1: Recently Watched list */}
                <div className="lg:col-span-5 flex flex-col justify-between">
                    <div>
                        <h4 className="text-sm font-bold text-slate-700 dark:text-slate-350 uppercase tracking-wider mb-4 flex items-center gap-1.5">
                            <svg className="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            {t('dashboard.last5Videos')}
                        </h4>
                        
                        {recentVideos.length > 0 ? (
                            <div className="space-y-3">
                                {recentVideos.map((video, idx) => (
                                    <motion.div
                                        key={video.id}
                                        initial={{ opacity: 0, x: -10 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ delay: idx * 0.05 }}
                                    >
                                        <Link 
                                            to={generateVideoPath(video.id)} 
                                            className="group flex items-center justify-between p-3 rounded-xl border border-slate-100 hover:border-indigo-100 dark:border-slate-700/50 dark:hover:border-slate-705 bg-slate-50/50 dark:bg-slate-900/30 hover:bg-indigo-50/30 dark:hover:bg-slate-800/80 transition-all select-none"
                                        >
                                            <div className="flex items-center gap-3 min-w-0">
                                                <div className="p-2 bg-indigo-50 dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 rounded-lg group-hover:bg-indigo-600 group-hover:text-white transition-colors duration-250 flex-shrink-0">
                                                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                                                    </svg>
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="text-sm font-bold text-slate-800 dark:text-slate-200 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors truncate" title={video.title}>
                                                        {video.title}
                                                    </p>
                                                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 truncate bg-white dark:bg-slate-750 max-w-fit px-1.5 py-0.5 rounded border border-slate-100 dark:border-slate-700" title={video.description || 'Lección de estudio'}>
                                                        {video.description || 'Lección de estudio'}
                                                    </p>
                                                </div>
                                            </div>
                                            
                                            <div className="flex items-center gap-1.5 pl-2 flex-shrink-0">
                                                <span className="text-[10px] sm:text-xs font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 px-2.5 py-1 rounded-full border border-emerald-100/50 dark:border-emerald-900/40">
                                                    {t('dashboard.watched')}
                                                </span>
                                            </div>
                                        </Link>
                                    </motion.div>
                                ))}
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center p-6 text-center border border-dashed border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50/50 dark:bg-slate-900/20 py-8">
                                <span className="text-2xl mb-2">🎓</span>
                                <p className="text-sm font-bold text-slate-700 dark:text-slate-300">{t('dashboard.readyToStart')}</p>
                                <p className="text-xs text-slate-500 max-w-xs mt-1">{t('dashboard.startPrompt')}</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Column 2: Interactive Recharts Chart */}
                <div className="lg:col-span-7 flex flex-col justify-between">
                    <div>
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                            <h4 className="text-sm font-bold text-slate-700 dark:text-slate-350 uppercase tracking-wider flex items-center gap-1.5">
                                <svg className="w-4 h-4 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                                </svg>
                                {t('dashboard.studyDistribution', { period: selectedWeek === 'current' ? t('dashboard.weekly') : t('dashboard.previous') })}
                            </h4>
                            
                            {/* Week Toggle */}
                            <div className="flex bg-slate-100 dark:bg-slate-900 border border-slate-200/50 dark:border-slate-700/60 p-1 rounded-xl text-xs self-start sm:self-auto select-none">
                                <button
                                    type="button"
                                    onClick={() => setSelectedWeek('current')}
                                    className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${selectedWeek === 'current' ? 'bg-white dark:bg-slate-800 text-indigo-650 dark:text-indigo-400 shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-350'}`}
                                >
                                    {t('dashboard.thisWeek')}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setSelectedWeek('previous')}
                                    className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${selectedWeek === 'previous' ? 'bg-white dark:bg-slate-800 text-indigo-650 dark:text-indigo-400 shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700'}`}
                                >
                                    {t('dashboard.previousWeek')}
                                </button>
                            </div>
                        </div>
 
                        {/* Interactive Recharts Chart Container */}
                        <div className="relative bg-slate-50 dark:bg-slate-900/40 p-4 rounded-xl border border-slate-100 dark:border-slate-750 overflow-hidden h-64 flex flex-col justify-center">
                            <ResponsiveContainer width="100%" height={220}>
                                <ComposedChart
                                    data={chartData}
                                    margin={{ top: 15, right: 10, left: -25, bottom: 0 }}
                                >
                                    <defs>
                                        <linearGradient id="colorMinsIndigo" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#818cf8" stopOpacity={0.95}/>
                                            <stop offset="95%" stopColor="#4f46e5" stopOpacity={0.45}/>
                                        </linearGradient>
                                        <linearGradient id="colorMinsEmerald" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#34d399" stopOpacity={0.95}/>
                                            <stop offset="95%" stopColor="#059669" stopOpacity={0.45}/>
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid 
                                        stroke={isDark ? "#334155" : "#e2e8f0"} 
                                        strokeDasharray="3 3" 
                                        vertical={false}
                                    />
                                    <XAxis 
                                        dataKey="name" 
                                        stroke={isDark ? "#94a3b8" : "#64748b"}
                                        fontSize={11}
                                        tickLine={false}
                                        axisLine={{ stroke: isDark ? "#334155" : "#e2e8f0" }}
                                    />
                                    <YAxis 
                                        stroke={isDark ? "#94a3b8" : "#64748b"}
                                        fontSize={11}
                                        tickLine={false}
                                        axisLine={false}
                                        unit="m"
                                    />
                                    <Tooltip 
                                        content={<CustomTooltip />} 
                                        cursor={{ fill: isDark ? "rgba(255, 255, 255, 0.05)" : "rgba(0, 0, 0, 0.03)" }}
                                    />
                                    
                                    {/* Daily Study Minutes Bar with hover status and dynamic reactive filling */}
                                    <Bar 
                                        dataKey="minutos" 
                                        radius={[4, 4, 0, 0]} 
                                        maxBarSize={32}
                                    >
                                        {chartData.map((entry, index) => {
                                            const hasReached = entry.minutos >= entry.objetivo;
                                            return (
                                                <Cell 
                                                    key={`cell-${index}`} 
                                                    fill={hasReached ? 'url(#colorMinsEmerald)' : 'url(#colorMinsIndigo)'} 
                                                />
                                            );
                                        })}
                                    </Bar>
                                    
                                    {/* Target Threshold Line */}
                                    <Line 
                                        type="monotone" 
                                        dataKey="objetivo" 
                                        stroke="#f59e0b" 
                                        strokeWidth={2}
                                        strokeDasharray="5 5"
                                        dot={false}
                                        activeDot={false}
                                    />
                                </ComposedChart>
                            </ResponsiveContainer>
                        </div>

                        {/* Daily Goal Selector */}
                        <div className="mt-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/60 dark:bg-slate-900/40 p-3 rounded-xl border border-slate-100 dark:border-slate-755">
                            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                                <span className="text-xs font-semibold text-slate-600 dark:text-slate-350">
                                    🎯 {t('dashboard.dailyGoal')} <strong className="text-amber-500 font-mono font-black">{dailyGoal} min</strong>
                                </span>
                                <motion.div 
                                    key={`${dailyGoal}-${studyStreakThisWeek}`}
                                    initial={{ scale: 0.9, opacity: 0 }}
                                    animate={{ scale: 1, opacity: 1 }}
                                    transition={{ type: "spring", stiffness: 300, damping: 20 }}
                                    className="inline-flex items-center gap-1 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-250/30 dark:border-emerald-800/30 px-2.5 py-0.5 rounded-lg text-[10px] font-bold text-emerald-700 dark:text-emerald-400 self-start"
                                >
                                    <span>🔥 {t('dashboard.weeklyStreak')}</span>
                                    <span className="font-mono text-xs">{studyStreakThisWeek} {studyStreakThisWeek === 1 ? t('dashboard.day') : t('dashboard.days')}</span>
                                </motion.div>
                            </div>
                            <div className="flex flex-wrap gap-1.5 select-none font-sans">
                                {[15, 30, 45, 60, 90].map((goalOption) => (
                                    <button
                                        key={goalOption}
                                        type="button"
                                        onClick={() => setDailyGoal(goalOption)}
                                        className={`px-3 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${dailyGoal === goalOption ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/10' : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200/50 dark:border-slate-700/60 hover:bg-slate-50/50 dark:hover:bg-slate-750/50'}`}
                                    >
                                        {goalOption}m
                                    </button>
                                ))}
                            </div>
                        </div>
                        
                        {/* Motivational tips */}
                        <div className="mt-3 flex items-center gap-3 bg-emerald-50/50 dark:bg-emerald-950/25 p-3 rounded-xl border border-emerald-100/40 dark:border-emerald-950/25 text-[11px] text-emerald-700 dark:text-emerald-450 leading-relaxed">
                            <span className="text-lg">🔥</span>
                            <span>
                                {totalWeeklyMinutes > (dailyGoal * 3) 
                                    ? t('dashboard.achievedGoal') 
                                    : t('dashboard.setRoutine', { goal: dailyGoal })}
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
});

// --- INTERACTIVE DAILY & ACADEMIC PROGRESS CENTER WITH RECHARTS ---

interface InteractiveDailyProgressCenterProps {
    watchedVideos: string[];
    studentAnswers: StudentAnswer[];
    courses: CourseLevel[];
    videoMap: Map<string, string>;
}

const InteractiveDailyProgressCenter: React.FC<InteractiveDailyProgressCenterProps> = React.memo(({ watchedVideos = [], studentAnswers = [], courses = [], videoMap = new Map() }) => {
    const { t } = useI18n();
    const { theme } = useContext(ThemeContext);
    const isDark = theme === 'dark';

    // Active tab and interactive settings
    const [activeTab, setActiveTab] = useState<'evolution' | 'subjects' | 'habits'>('evolution');
    
    // Habits planner states
    const [habits, setHabits] = useState([
        { id: 'quiz', text: 'Completar un examen rápido', checked: false, points: 25 },
        { id: 'video', text: 'Estudiar una videolección completa', checked: true, points: 25 },
        { id: 'tutor', text: 'Consultar dudas al Tutor IA intelectual', checked: false, points: 25 },
        { id: 'review', text: 'Chequear agenda de exámenes futuros', checked: false, points: 25 },
    ]);
    const [focusHours, setFocusHours] = useState<number>(3);

    // 1. Quizzes Trend Data
    const actualQuizData = useMemo(() => {
        return [...(studentAnswers || [])]
            .sort((a, b) => new Date(a?.timestamp || 0).getTime() - new Date(b?.timestamp || 0).getTime())
            .map((ans, idx) => {
                const dateStr = ans?.timestamp ? new Date(ans.timestamp).toLocaleDateString('es-ES', { month: 'short', day: 'numeric' }) : '';
                const title = (ans?.videoId && videoMap?.get(ans.videoId)) || `Quiz #${idx + 1}`;
                const totalQ = ans?.totalQuestions || 10;
                const scoreQ = ans?.score || 0;
                const pct = Math.round((scoreQ / totalQ) * 100);
                return {
                    name: title,
                    porcentaje: pct,
                    date: dateStr,
                    score: scoreQ,
                    total: totalQ
                };
            });
    }, [studentAnswers, videoMap]);

    const combinedQuizData = useMemo(() => {
        return actualQuizData || [];
    }, [actualQuizData]);

    // 2. Subjects completed vs pending videos
    const subjectProgressData = useMemo(() => {
        return (courses || []).map(course => {
            const courseName = course?.name || (course as any)?.title || 'Curso';
            const totalInCourse = (course?.subjects || []).reduce((sum, s) => sum + (s?.videos || []).length, 0);
            const watchedInCourse = (course?.subjects || []).flatMap(s => s?.videos || []).filter(v => v?.id && (watchedVideos || []).includes(v.id)).length;
            const pending = Math.max(0, totalInCourse - watchedInCourse);
            return {
                name: (courseName || '').length > 20 ? `${(courseName || '').substring(0, 18)}...` : (courseName || 'Curso'),
                fullName: courseName || 'Curso',
                Completados: watchedInCourse,
                Pendientes: pending,
                total: totalInCourse
            };
        });
    }, [courses, watchedVideos]);

    // 3. Focus habits computation
    const currentFocusScore = useMemo(() => {
        return habits.reduce((acc, h) => acc + (h.checked ? h.points : 0), 0);
    }, [habits]);

    const overallDailyIndex = useMemo(() => {
        const hourImpact = Math.min(50, focusHours * 10);
        const habitsImpact = currentFocusScore * 0.5;
        return Math.min(100, Math.round(hourImpact + habitsImpact));
    }, [focusHours, currentFocusScore]);

    const handleToggleHabit = (id: string) => {
        setHabits(prev => prev.map(h => h.id === id ? { ...h, checked: !h.checked } : h));
    };

    // Circular progress indicator calculations
    const svgRadius = 54;
    const circumference = 2 * Math.PI * svgRadius;
    const strokeDashoffset = circumference - (overallDailyIndex / 100) * circumference;

    return (
        <div id="interactive-progress-center" className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-lg border border-slate-100 dark:border-slate-700/60 transition-all">
            
            {/* Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-gray-100 dark:border-slate-705 pb-5 mb-6">
                <div>
                    <h3 className="text-xl font-bold text-slate-900 dark:text-slate-50 flex items-center gap-2 font-display">
                        <Sparkles className="w-5 h-5 text-indigo-500 animate-pulse" />
                        {t('dashboard.dailyProgressCenterTitle')}
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-medium">
                        {t('dashboard.dailyProgressCenterSubtitle')}
                    </p>
                </div>
                
                {/* Visual indicator header */}
                <div className="flex items-center gap-2 self-stretch sm:self-auto bg-indigo-50/50 dark:bg-slate-900/40 border border-indigo-100/30 dark:border-slate-700 rounded-lg p-2 px-3">
                    <Activity className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
                    <span className="text-xs font-bold text-slate-750 dark:text-slate-305">
                        {t('dashboard.dailyFocus')} <strong className="text-indigo-650 dark:text-indigo-400 text-sm font-black">{overallDailyIndex}%</strong>
                    </span>
                </div>
            </div>

            {/* TAB SELECTOR */}
            <div className="flex flex-wrap border-b border-gray-150 dark:border-slate-750/90 gap-1.5 pb-3 mb-6 select-none font-sans">
                <button
                    onClick={() => setActiveTab('evolution')}
                    className={`flex items-center gap-2 px-4 py-2 text-xs sm:text-sm font-bold rounded-lg transition-all cursor-pointer ${
                        activeTab === 'evolution' 
                            ? 'bg-gradient-to-r from-indigo-500 to-indigo-600 text-white shadow-md' 
                            : 'bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200/40 dark:border-slate-700/40'
                    }`}
                >
                    <TrendingUp className="w-4 h-4" />
                    {t('dashboard.gradeEvolution')}
                </button>
                <button
                    onClick={() => setActiveTab('subjects')}
                    className={`flex items-center gap-2 px-4 py-2 text-xs sm:text-sm font-bold rounded-lg transition-all cursor-pointer ${
                        activeTab === 'subjects' 
                            ? 'bg-gradient-to-r from-indigo-500 to-indigo-600 text-white shadow-md' 
                            : 'bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200/40 dark:border-slate-700/40'
                    }`}
                >
                    <BookOpen className="w-4 h-4" />
                    {t('dashboard.subjectBalance')}
                </button>
                <button
                    onClick={() => setActiveTab('habits')}
                    className={`flex items-center gap-2 px-4 py-2 text-xs sm:text-sm font-bold rounded-lg transition-all cursor-pointer ${
                        activeTab === 'habits' 
                            ? 'bg-gradient-to-r from-indigo-500 to-indigo-600 text-white shadow-md' 
                            : 'bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200/40 dark:border-slate-700/40'
                    }`}
                >
                    <Target className="w-4 h-4" />
                    {t('dashboard.recurringPlanner')}
                </button>
            </div>

            {/* TAB CONTENT: EVOLUTION TAB (Chronological Area Chart) */}
            {activeTab === 'evolution' && (
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3 }}
                    className="w-full"
                >
                    <div className="w-full">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 select-none">
                            <span className="text-xs uppercase font-extrabold tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1">
                                <Activity className="w-3.5 h-3.5 text-indigo-500" />
                                Historial Dinámico de Puntuaciones (%)
                            </span>
                        </div>

                        {/* Recharts Container */}
                        <div className="bg-slate-50/70 dark:bg-slate-900/30 p-4 rounded-xl border border-slate-100 dark:border-slate-750 h-72 flex flex-col justify-center">
                            {combinedQuizData.length > 0 ? (
                                <ResponsiveContainer width="100%" height={250}>
                                    <AreaChart data={combinedQuizData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                                        <defs>
                                            <linearGradient id="scoreAreaGradient" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#6366f1" stopOpacity={0.8}/>
                                                <stop offset="95%" stopColor="#4338ca" stopOpacity={0.05}/>
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid stroke={isDark ? "#333d4e" : "#f1f3f7"} strokeDasharray="3 3" vertical={false} />
                                        <XAxis 
                                            dataKey="date" 
                                            stroke={isDark ? "#94a3b8" : "#64748b"} 
                                            fontSize={11} 
                                            tickLine={false} 
                                            axisLine={{ stroke: isDark ? "#334155" : "#e2e8f0" }}
                                        />
                                        <YAxis 
                                            stroke={isDark ? "#94a3b8" : "#64748b"} 
                                            fontSize={11} 
                                            tickLine={false} 
                                            domain={[0, 100]} 
                                            axisLine={false}
                                            unit="%"
                                        />
                                        <Tooltip 
                                            content={({ active, payload }) => {
                                                if (active && payload && payload.length) {
                                                    const item = payload[0].payload;
                                                    return (
                                                        <div className="bg-slate-950 border border-slate-800 p-3 rounded-lg shadow-xl text-white text-xs max-w-[210px]">
                                                            <p className="text-[10px] text-slate-400 font-bold tracking-wider mb-1 uppercase">{item.date}</p>
                                                            <p className="font-bold border-b border-slate-800 pb-1.5 mb-1.5 text-slate-100 truncate" title={item.name}>{item.name}</p>
                                                            <div className="flex justify-between items-center text-indigo-400 font-extrabold text-[13px] mb-1">
                                                                <span>Nota:</span>
                                                                <span className="font-mono">{item.porcentaje}%</span>
                                                            </div>
                                                            <p className="text-[10px] text-slate-450 font-medium">Aciertos: {item.score}/{item.total} preguntas</p>
                                                        </div>
                                                    );
                                                }
                                                return null;
                                            }}
                                        />
                                        <Area 
                                            type="monotone" 
                                            dataKey="porcentaje" 
                                            stroke="#6366f1" 
                                            strokeWidth={3} 
                                            fillOpacity={1} 
                                            fill="url(#scoreAreaGradient)"
                                            activeDot={{ r: 6, strokeWidth: 0, fill: '#ff007f' }}
                                        />
                                    </AreaChart>
                                </ResponsiveContainer>
                            ) : (
                                <div className="text-center py-12 flex flex-col items-center justify-center">
                                    <span className="text-3xl mb-2">📈</span>
                                    <p className="text-sm font-bold text-slate-700 dark:text-slate-300">¡Grafica tu rendimiento!</p>
                                    <p className="text-xs text-slate-500 max-w-sm mt-1">
                                        Sigue realizando exámenes rápidos y quizzes en tus asignaturas para ver la progresión en tiempo real de tus notas aquí.
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>
                </motion.div>
            )}

            {/* TAB CONTENT: SUBJECTS PROGRESS HEAT BALANCE */}
            {activeTab === 'subjects' && (
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3 }}
                >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 select-none">
                        <span className="text-xs uppercase font-extrabold tracking-wider text-slate-500 dark:text-slate-450 flex items-center gap-1">
                            <BookOpen className="w-3.5 h-3.5 text-indigo-500" />
                            {t('dashboard.watchedVsPending')}
                        </span>
                    </div>

                    {/* Chart list */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        
                        {/* Horizontal comparative Bar Chart container */}
                        <div className="lg:col-span-2 bg-slate-50/70 dark:bg-slate-900/30 p-4 rounded-xl border border-slate-100 dark:border-slate-750 h-72 flex flex-col justify-center">
                            {subjectProgressData.length > 0 ? (
                                <ResponsiveContainer width="100%" height={250}>
                                    <BarChart
                                        data={subjectProgressData}
                                        layout="vertical"
                                        margin={{ top: 10, right: 10, left: 10, bottom: 5 }}
                                    >
                                        <CartesianGrid stroke={isDark ? "#333d4e" : "#f1f3f7"} strokeDasharray="3 3" horizontal={false} />
                                        <XAxis type="number" stroke={isDark ? "#94a3b8" : "#64748b"} fontSize={11} tickLine={false} />
                                        <YAxis dataKey="name" type="category" stroke={isDark ? "#94a3b8" : "#64748b"} fontSize={10} width={90} tickLine={false} />
                                        <Tooltip
                                            content={({ active, payload }) => {
                                                if (active && payload && payload.length) {
                                                    const item = payload[0].payload;
                                                    return (
                                                        <div className="bg-slate-950 border border-slate-850 p-3 rounded-lg shadow-xl text-white text-xs">
                                                            <p className="font-extrabold text-[11px] mb-1.5 border-b border-slate-800 pb-1 text-slate-200">{item.fullName}</p>
                                                            <div className="space-y-1">
                                                                <p className="flex justify-between gap-6">
                                                                    <span className="text-indigo-400 font-semibold">✓ {t('dashboard.completedLabel')}:</span>
                                                                    <span className="font-mono">{t('dashboard.videosCompletedCount', { count: item.Completados })}</span>
                                                                </p>
                                                                <p className="flex justify-between gap-6">
                                                                    <span className="text-slate-400">⏳ {t('dashboard.pendingLabel')}:</span>
                                                                    <span className="font-mono">{t('dashboard.videosPendingCount', { count: item.Pendientes })}</span>
                                                                </p>
                                                                <p className="flex justify-between gap-6 font-bold pt-1 border-t border-slate-800/80 text-emerald-400">
                                                                    <span>{t('dashboard.progressLabel')}:</span>
                                                                    <span className="font-mono">{item.total > 0 ? Math.round((item.Completados/item.total)*100) : 0}%</span>
                                                                </p>
                                                            </div>
                                                        </div>
                                                    );
                                                }
                                                return null;
                                            }}
                                        />
                                        <Legend wrapperStyle={{ fontSize: 11 }} />
                                        <Bar dataKey="Completados" name={t('dashboard.completedLabel')} stackId="a" fill="#4f46e5" radius={[0, 0, 0, 0]} />
                                        <Bar dataKey="Pendientes" name={t('dashboard.remainingLabel')} stackId="a" fill={isDark ? "#334155" : "#e2e8f0"} radius={[0, 4, 4, 0]} />
                                    </BarChart>
                                </ResponsiveContainer>
                            ) : (
                                <div className="text-center py-12">
                                    <p className="text-sm font-semibold text-slate-500">{t('dashboard.noCoursesRegistered')}</p>
                                </div>
                            )}
                        </div>

                        {/* Comparative stats visual column block */}
                        <div className="bg-slate-50 dark:bg-slate-900/30 p-5 rounded-xl border border-slate-100 dark:border-slate-800 flex flex-col justify-between">
                            <div>
                                <span className="text-xs font-black uppercase bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 px-2.5 py-1 rounded-md self-start border border-emerald-100/30">
                                    {t('dashboard.academicProcessDetail')}
                                </span>
                                
                                <div className="space-y-3 mt-4">
                                    {subjectProgressData.slice(0, 3).map((sub, idx) => {
                                        const pct = sub.total > 0 ? Math.round((sub.Completados / sub.total) * 100) : 0;
                                        return (
                                            <div key={idx} className="space-y-1">
                                                <div className="flex justify-between items-center text-xs font-bold text-slate-700 dark:text-slate-300">
                                                    <span className="truncate max-w-[130px]" title={sub.fullName}>{sub.fullName}</span>
                                                    <span className="font-mono">{pct}%</span>
                                                </div>
                                                <div className="w-full bg-slate-200 dark:bg-slate-700 h-1.5 rounded-full overflow-hidden">
                                                    <div className="h-full bg-indigo-600" style={{ width: `${pct}%` }} />
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            <p className="text-[11px] text-slate-500 dark:text-slate-440 leading-normal font-medium mt-4 pt-4 border-t border-gray-200/50 dark:border-slate-750">
                                {t('dashboard.processDetailDesc')}
                            </p>
                        </div>
                    </div>
                </motion.div>
            )}

            {/* TAB CONTENT: PLANNING AND HABITS TRACKER */}
            {activeTab === 'habits' && (
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3 }}
                    className="grid grid-cols-1 lg:grid-cols-12 gap-8"
                >
                    {/* Column 1: Sliders and Checkboxes */}
                    <div className="lg:col-span-7 space-y-5">
                        <div className="space-y-1 select-none">
                            <span className="text-xs uppercase font-extrabold tracking-wider text-slate-500 dark:text-slate-440 flex items-center gap-1">
                                <Sliders className="w-3.5 h-3.5 text-indigo-500" />
                                {t('dashboard.productivitySettingsLabel')}
                            </span>
                            <h4 className="font-bold text-base text-slate-800 dark:text-slate-200 mt-2">{t('dashboard.timeDedication')}</h4>
                        </div>

                        {/* Focus hours range slider */}
                        <div className="bg-slate-50 dark:bg-slate-900/40 border border-slate-100 dark:border-slate-800 p-4 rounded-xl space-y-3">
                            <div className="flex justify-between items-center select-none">
                                <span className="text-xs font-bold text-slate-650 dark:text-slate-300 flex items-center gap-1.5">
                                    <Clock className="w-4 h-4 text-amber-500" />
                                    {t('dashboard.estimatedHoursLabel')}
                                </span>
                                <span className="text-sm font-extrabold font-mono text-indigo-650 dark:text-indigo-400 bg-indigo-100/50 dark:bg-indigo-950/40 px-2 py-0.5 rounded-md">
                                    {focusHours === 1 ? t('dashboard.hoursCount_one', { count: focusHours }) : t('dashboard.hoursCount_other', { count: focusHours })}
                                </span>
                            </div>
                            
                            <input
                                type="range"
                                min="0"
                                max="8"
                                step="1"
                                value={focusHours}
                                onChange={(e) => setFocusHours(Number(e.target.value))}
                                className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-600 focus:outline-none"
                            />
                            
                            <div className="flex justify-between text-[11px] font-semibold text-slate-400 select-none">
                                <span>{t('dashboard.focus_rest')}</span>
                                <span>{t('dashboard.focus_normal')}</span>
                                <span>{t('dashboard.focus_intense')}</span>
                                <span>{t('dashboard.titanMindLevel')}</span>
                            </div>
                        </div>

                        {/* Interactive Habits Checkboxes */}
                        <div className="space-y-2 border border-slate-100 dark:border-slate-800 p-4 rounded-xl bg-slate-50/20 dark:bg-slate-900/10">
                            <span className="text-xs font-bold text-slate-650 dark:text-slate-350 select-none flex items-center gap-1.5 mb-3">
                                <CheckSquare className="w-4 h-4 text-indigo-500" />
                                {t('dashboard.dailyHabitsList')}
                              </span>
                            
                            {habits.map(habit => (
                                <label 
                                    key={habit.id} 
                                    className="flex items-center gap-3 p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-750 hover:border-indigo-100 dark:hover:border-slate-705 cursor-pointer selection:bg-transparent select-none transition-all"
                                >
                                    <input
                                        type="checkbox"
                                        checked={habit.checked}
                                        onChange={() => handleToggleHabit(habit.id)}
                                        className="w-4 h-4 rounded text-indigo-600 border-slate-300 focus:ring-indigo-500 cursor-pointer"
                                    />
                                    <span className={`text-xs font-medium ${habit.checked ? 'text-slate-750 dark:text-slate-200 line-through opacity-70' : 'text-slate-700 dark:text-slate-300'}`}>
                                        {t('dashboard.habit_' + habit.id)}
                                    </span>
                                </label>
                            ))}
                        </div>
                    </div>

                    {/* Column 2: Large Visual score meter */}
                    <div className="lg:col-span-5 bg-slate-50 dark:bg-slate-900/30 border border-slate-100 dark:border-slate-800 p-5 rounded-xl flex flex-col items-center justify-center text-center">
                        <span className="text-xs font-black uppercase text-indigo-650 dark:text-indigo-400 mb-4 select-none">
                            {t('dashboard.estimatedPerformanceIndex')}
                        </span>

                        {/* Awesome Ring Progress Indicator */}
                        <div className="relative w-36 h-36 flex items-center justify-center mb-4">
                            <svg className="w-full h-full transform -rotate-90">
                                {/* Base track circle */}
                                <circle 
                                    cx="72" 
                                    cy="72" 
                                    r={svgRadius} 
                                    stroke={isDark ? "rgba(255,255,255,0.06)" : "#edf2f7"} 
                                    strokeWidth="8"
                                    fill="transparent" 
                                />
                                {/* Progress circle with gradient strokes */}
                                <circle 
                                    cx="72" 
                                    cy="72" 
                                    r={svgRadius} 
                                    stroke="#6366f1" 
                                    strokeWidth="8"
                                    fill="transparent" 
                                    strokeDasharray={circumference}
                                    strokeDashoffset={strokeDashoffset}
                                    strokeLinecap="round"
                                    style={{ transition: 'stroke-dashoffset 0.5s ease-out' }}
                                />
                            </svg>
                            {/* Central numeric display */}
                            <div className="absolute flex flex-col items-center select-none">
                                <span className="text-3xl font-black font-display text-slate-850 dark:text-slate-100">{overallDailyIndex}</span>
                                <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 tracking-wide uppercase">{t('dashboard.points')}</span>
                            </div>
                        </div>

                        {/* Dynamic textual feedback */}
                        <div className="max-w-xs select-none">
                            <p className="text-sm font-bold text-slate-800 dark:text-slate-100">
                                {overallDailyIndex >= 85 
                                    ? t('dashboard.titanMind')
                                    : overallDailyIndex >= 60 
                                    ? t('dashboard.greatPace')
                                    : t('dashboard.goodStart')}
                            </p>
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 pb-3 leading-relaxed border-b border-slate-150 dark:border-slate-750/50">
                                {overallDailyIndex >= 85 
                                    ? t('dashboard.titanDesc') 
                                    : t('dashboard.paceDesc')}
                            </p>
                        </div>

                        {/* Streak context indicator mini stamp */}
                        <div className="mt-3 flex items-center gap-1.5 text-[10px] font-extrabold text-amber-500">
                            <Flame className="w-4 h-4 animate-bounce" />
                            <span>{t('dashboard.activeStreak')}</span>
                        </div>
                    </div>
                </motion.div>
            )}
        </div>
    );
});

InteractiveDailyProgressCenter.displayName = 'InteractiveDailyProgressCenter';

// --- NEW COMPONENTS FOR NON-SUBSCRIBED DASHBOARD ---

// --- STUDENT ACHIEVEMENTS PANEL ---

interface Badge {
    id: string;
    title: string;
    description: string;
    unlockedEmoji: string;
    lockedEmoji: string;
    isUnlocked: boolean;
    progressText?: string;
    colorClasses: string;
}

const StudentAchievementsPanel: React.FC<{ 
    watchedVideos: string[]; 
    studentAnswers: StudentAnswer[]; 
    streakCount: number; 
    isSubscribed: boolean;
}> = React.memo(({ watchedVideos = [], studentAnswers = [], streakCount = 0, isSubscribed = false }) => {
    const { t } = useI18n();
    const hasPerfectQuiz = useMemo(() => {
        return (studentAnswers || []).some(ans => (ans?.score / (ans?.totalQuestions || 1)) >= 1.0);
    }, [studentAnswers]);

    const badges: Badge[] = useMemo(() => [
        {
            id: 'first-video',
            title: t('dashboard.achievement_science_title'),
            description: t('dashboard.achievement_science_desc'),
            unlockedEmoji: '🎓',
            lockedEmoji: '🔒',
            isUnlocked: (watchedVideos || []).length >= 1,
            progressText: t('dashboard.achievement_status_video_progress', { current: Math.min((watchedVideos || []).length, 1), total: 1 }),
            colorClasses: 'from-amber-400 to-orange-500 text-amber-900',
        },
        {
            id: 'perfect-quiz',
            title: t('dashboard.achievement_titan_title'),
            description: t('dashboard.achievement_titan_desc'),
            unlockedEmoji: '🌟',
            lockedEmoji: '🔒',
            isUnlocked: hasPerfectQuiz,
            progressText: hasPerfectQuiz ? t('dashboard.achievement_status_achieved') : t('dashboard.achievement_status_missing_percent'),
            colorClasses: 'from-purple-500 to-indigo-650 text-white',
        },
        {
            id: 'streak-constant',
            title: t('dashboard.achievement_streak_title'),
            description: t('dashboard.achievement_streak_desc'),
            unlockedEmoji: '⚡',
            lockedEmoji: '🔒',
            isUnlocked: streakCount >= 2,
            progressText: t('dashboard.achievement_status_days_progress', { current: streakCount, total: 2 }),
            colorClasses: 'from-orange-500 to-red-600 text-white',
        },
        {
            id: 'five-videos',
            title: t('dashboard.achievement_marathon_title'),
            description: t('dashboard.achievement_marathon_desc'),
            unlockedEmoji: '🦁',
            lockedEmoji: '🔒',
            isUnlocked: (watchedVideos || []).length >= 5,
            progressText: t('dashboard.achievement_status_videos_progress', { current: Math.min((watchedVideos || []).length, 5), total: 5 }),
            colorClasses: 'from-emerald-400 to-teal-600 text-emerald-950',
        },
        {
            id: 'premium-member',
            title: t('dashboard.achievement_premium_title'),
            description: t('dashboard.achievement_premium_desc'),
            unlockedEmoji: '👑',
            lockedEmoji: '🔒',
            isUnlocked: isSubscribed,
            progressText: isSubscribed ? t('dashboard.achievement_status_premium') : t('dashboard.achievement_status_standard'),
            colorClasses: 'from-blue-400 to-cyan-500 text-blue-900',
        }
    ], [watchedVideos, hasPerfectQuiz, streakCount, isSubscribed, t]);

    const unlockedCount = useMemo(() => badges.filter(b => b.isUnlocked).length, [badges]);

    return (
        <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-lg border border-slate-100 dark:border-slate-700/60">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-gray-100 dark:border-slate-700/60 pb-4 mb-5">
                <div>
                    <h3 className="text-xl font-bold text-slate-900 dark:text-slate-50 flex items-center gap-2">
                        <svg className="w-5 h-5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9.663 17h4.673M12 3v1m6.364 1.364l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                        </svg>
                        {t('dashboard.successBadges')}
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-medium">{t('dashboard.successBadgesDesc')}</p>
                </div>
                <span className="text-xs font-bold px-3 py-1 bg-amber-500/10 text-amber-600 dark:text-amber-400 rounded-full">
                    {t('dashboard.achievementsUnlockedCount', { count: unlockedCount, total: badges.length })}
                </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
                {badges.map((badge, idx) => (
                    <motion.div
                        key={badge.id}
                        initial={{ opacity: 0, y: 15 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.3, delay: idx * 0.05 }}
                        whileHover={{ scale: 1.04 }}
                        className={`p-4 rounded-xl border flex flex-col items-center text-center justify-between h-44 transition-all relative overflow-hidden ${
                            badge.isUnlocked 
                                ? 'bg-gradient-to-b from-slate-50/50 to-slate-105/55 dark:from-slate-900/35 dark:to-slate-850/45 border-slate-200/80 dark:border-slate-700/80' 
                                : 'bg-slate-100/20 dark:bg-slate-900/10 border-slate-250/20 dark:border-slate-800/40 opacity-60'
                        }`}
                    >
                        {/* Status bar */}
                        <div className={`absolute top-0 left-0 w-full h-1 bg-gradient-to-r ${badge.isUnlocked ? badge.colorClasses : 'from-slate-300 to-slate-400 dark:from-slate-700 dark:to-slate-800'}`} />

                        <div className="flex flex-col items-center">
                            <div className={`w-11 h-11 rounded-full flex items-center justify-center text-2xl mb-2 shadow-inner ${
                                badge.isUnlocked 
                                    ? `bg-gradient-to-br ${badge.colorClasses} shadow-[0_4px_10px_rgba(0,0,0,0.1)]` 
                                    : 'bg-slate-200 dark:bg-slate-850 text-slate-400'
                            }`}>
                                {badge.isUnlocked ? badge.unlockedEmoji : badge.lockedEmoji}
                            </div>
                            <h4 className="font-bold text-[11px] sm:text-xs text-slate-850 dark:text-slate-100 line-clamp-1">
                                {badge.title}
                            </h4>
                            <p className="text-[10px] text-slate-500 dark:text-slate-450 mt-1 line-clamp-3 leading-tight px-1 font-medium">
                                {badge.description}
                            </p>
                        </div>

                        <span className={`text-[9.5px] font-extrabold px-2 py-0.5 rounded-full mt-2 select-none ${
                            badge.isUnlocked 
                                ? 'bg-indigo-50 dark:bg-indigo-950/45 text-indigo-650 dark:text-indigo-400 border border-indigo-100/40 dark:border-indigo-900/25' 
                                : 'bg-slate-200/60 dark:bg-slate-850 text-slate-500'
                        }`}>
                            {badge.progressText}
                        </span>
                    </motion.div>
                ))}
            </div>
        </div>
    );
});

StudentAchievementsPanel.displayName = 'StudentAchievementsPanel';

const NonSubscribedWelcomeHero: React.FC = React.memo(() => {
    const { t } = useI18n();
    return (
        <div className="bg-gradient-to-r from-primary to-indigo-600 text-white p-8 rounded-xl shadow-2xl text-center">
            <h2 className="text-4xl font-bold">{t('dashboard.unlockPotential')}</h2>
            <p className="mt-3 text-lg text-blue-200 max-w-2xl mx-auto" dangerouslySetInnerHTML={{ __html: t('dashboard.unlockDescription').replace(/\n/g, '<br/>') }} />
            <Link 
                to={ROUTES.PAYMENT}
                className="mt-6 bg-white text-primary font-bold py-3 px-8 rounded-full hover:bg-gray-100 transition-transform transform hover:scale-105 inline-block shadow-lg text-lg"
            >
                <CreditCardIcon className="w-6 h-6 mr-3 inline" />
                {t('dashboard.activateSubscription')}
            </Link>
        </div>
    );
});

const VideoPreviewCard: React.FC<{ video: Video & { levelName: string } }> = React.memo(({ video }) => (
    <Link to={generateVideoPath(video.id)} className="block bg-white dark:bg-slate-800 p-6 rounded-xl shadow-lg hover:shadow-xl hover:-translate-y-1 transition-all transform group">
        <div className="flex items-start">
            <div className="p-3 bg-green-100 dark:bg-green-900/50 rounded-lg">
                <PlayIcon className="w-8 h-8 text-green-600 dark:text-green-400" />
            </div>
            <div className="ml-4">
                <h3 className="text-xl font-bold text-slate-900 dark:text-slate-50 group-hover:text-primary transition-colors">{video.title}</h3>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-300 bg-gray-100 dark:bg-slate-700 px-2 py-0.5 rounded-full inline-block">{video.levelName}</p>
                <p className="mt-2 text-slate-600 dark:text-slate-400">{video.description}</p>
            </div>
        </div>
    </Link>
));


const FreeContentPreview: React.FC<{ courses: CourseLevel[] }> = React.memo(({ courses = [] }) => {
    const { t } = useI18n();
    const freeVideos = useMemo(() => {
        const videos: (Video & { levelName: string })[] = [];
        if (!courses) return videos;
        for (const level of courses) {
            for (const subject of (level?.subjects || [])) {
                for (const video of (subject?.videos || [])) {
                    if (video?.id && FREE_VIDEO_IDS.includes(video.id)) {
                        videos.push({ ...video, levelName: level?.name || (level as any)?.title || 'Curso' });
                    }
                }
            }
        }
        return videos;
    }, [courses]);

    if (freeVideos.length === 0) return null;

    return (
        <div>
            <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-50 mb-6">{t('dashboard.exploreFreeContent')}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {freeVideos.map(video => (
                    <VideoPreviewCard key={video.id} video={video} />
                ))}
            </div>
        </div>
    );
});


const LockedCourseCard: React.FC<{ level: CourseLevel }> = React.memo(({ level }) => {
    const { t } = useI18n();
    const hasFreeVideo = (level?.subjects || []).some(subject => 
        (subject?.videos || []).some(video => video?.id && FREE_VIDEO_IDS.includes(video.id))
    );

    return (
        <Link to={generateCourseLevelPath(level.id)} className="relative block bg-white dark:bg-slate-800 p-6 rounded-xl shadow-lg transition-all transform hover:-translate-y-1 hover:shadow-xl group">
            {hasFreeVideo ? (
                <div className="absolute top-0 right-4 -mt-3">
                    <span className="bg-green-500 text-white text-xs font-bold px-3 py-1.5 rounded-full shadow-md">
                        {t('dashboard.freeSample')}
                    </span>
                </div>
            ) : (
                <div className="absolute top-0 right-4 -mt-2">
                    <span className="bg-yellow-400 text-yellow-900 text-xs font-bold px-3 py-1 rounded-full shadow-md">
                        {t('dashboard.premium')}
                    </span>
                </div>
            )}
            
            <h3 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-slate-50 mt-2 break-words leading-tight">{level.name}</h3>
            <p className="text-slate-600 dark:text-slate-400 mt-1">{t('dashboard.videosAvailable', { count: (level.subjects || []).reduce((acc, s) => acc + (s.videos || []).length, 0) })}</p>
            
            <div className="absolute inset-0 bg-primary/80 rounded-xl flex flex-col items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none">
                <EyeIcon className="w-10 h-10 mb-2" />
                <span className="font-bold text-lg">{t('dashboard.exploreCourse')}</span>
            </div>
        </Link>
    );
});


const FavoriteVideosSection: React.FC<{ 
    favoriteVideos: string[]; 
    courses: CourseLevel[];
    toggleFavoriteVideo: (id: string) => void;
}> = React.memo(({ favoriteVideos = [], courses = [], toggleFavoriteVideo }) => {
    const [selectedSubjectFilter, setSelectedSubjectFilter] = useState<string>('all');

    const favoriteVideoObjects = useMemo(() => {
        return favoriteVideos.map(id => findVideoById(id, courses)).filter(Boolean) as Video[];
    }, [favoriteVideos, courses]);

    const subjectsWithFavorites = useMemo(() => {
        const subjectsMap = new Map<string, string>();
        courses.forEach(c => {
            (c.subjects || []).forEach(s => {
                const hasFav = (s.videos || []).some(v => favoriteVideos.includes(v.id)) ||
                               (s.blocks || []).some(b => (b.videos || []).some(v => favoriteVideos.includes(v.id)));
                if (hasFav) {
                    subjectsMap.set(s.id, s.name);
                }
            });
        });
        return Array.from(subjectsMap.entries()).map(([id, name]) => ({ id, name }));
    }, [courses, favoriteVideos]);

    const filteredVideos = useMemo(() => {
        if (selectedSubjectFilter === 'all') return favoriteVideoObjects;
        return favoriteVideoObjects.filter(v => {
            for (const c of courses) {
                for (const s of (c.subjects || [])) {
                    if (s.id === selectedSubjectFilter) {
                        if ((s.videos || []).some(vid => vid.id === v.id)) return true;
                        if ((s.blocks || []).some(b => (b.videos || []).some(vid => vid.id === v.id))) return true;
                    }
                }
            }
            return false;
        });
    }, [favoriteVideoObjects, selectedSubjectFilter, courses]);

    return (
        <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-xl border border-slate-100 dark:border-slate-700/80 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-700/80 pb-4">
                <div className="flex items-center gap-2.5">
                    <div className="p-2.5 bg-rose-50 dark:bg-rose-950/40 text-rose-500 dark:text-rose-400 rounded-xl">
                        <Heart className="w-6 h-6 fill-current" />
                    </div>
                    <div>
                        <h3 className="text-xl font-bold text-slate-900 dark:text-slate-50">Mis Vídeos Favoritos</h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400">Acceso rápido y vista filtrada de tus clases marcadas como favoritas</p>
                    </div>
                </div>
                {subjectsWithFavorites.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5">
                        <button
                            onClick={() => setSelectedSubjectFilter('all')}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                                selectedSubjectFilter === 'all'
                                    ? 'bg-rose-500 text-white shadow-sm'
                                    : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
                            }`}
                        >
                            Todos ({favoriteVideoObjects.length})
                        </button>
                        {subjectsWithFavorites.map(s => (
                            <button
                                key={s.id}
                                onClick={() => setSelectedSubjectFilter(s.id)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                                    selectedSubjectFilter === s.id
                                        ? 'bg-rose-500 text-white shadow-sm'
                                        : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
                                }`}
                            >
                                {s.name}
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {filteredVideos.length === 0 ? (
                <div className="text-center py-10 px-4">
                    <div className="w-12 h-12 bg-rose-50 dark:bg-rose-950/20 text-rose-400 rounded-full flex items-center justify-center mx-auto mb-3">
                        <Heart className="w-6 h-6" />
                    </div>
                    <p className="text-sm font-bold text-slate-700 dark:text-slate-300">Aún no tienes vídeos en favoritos</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm mx-auto">
                        Al explorar los cursos, pulsa en el botón del corazón en cualquier tarjeta de vídeo para guardarlo aquí.
                    </p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filteredVideos.map(video => (
                        <div key={video.id} className="group relative flex flex-col justify-between p-4 rounded-xl border border-slate-200/80 hover:border-rose-300 dark:border-slate-700 dark:hover:border-rose-500/50 bg-slate-50/50 dark:bg-slate-900/40 hover:bg-rose-50/20 dark:hover:bg-slate-800/80 transition-all">
                            <div>
                                <div className="flex items-start justify-between gap-2 mb-2">
                                    <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-rose-100 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 tracking-wider">
                                        Favorito
                                    </span>
                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.preventDefault();
                                            toggleFavoriteVideo(video.id);
                                        }}
                                        className="p-1.5 rounded-full text-rose-500 hover:bg-rose-100 dark:hover:bg-slate-700 transition-colors"
                                        title="Quitar de favoritos"
                                        aria-label={`Quitar ${video.title} de favoritos`}
                                    >
                                        <Heart className="w-4 h-4 fill-current" />
                                    </button>
                                </div>
                                <h4 className="font-bold text-sm text-slate-900 dark:text-slate-100 group-hover:text-rose-600 dark:group-hover:text-rose-400 transition-colors line-clamp-2">
                                    {video.title}
                                </h4>
                                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">
                                    {video.description}
                                </p>
                            </div>
                            <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                                <Link
                                    to={generateVideoPath(video.id)}
                                    className="inline-flex items-center gap-1.5 text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors"
                                >
                                    <span>Ver clase</span>
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                                    </svg>
                                </Link>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
});


// --- MAIN DASHBOARD COMPONENT ---

export const StudentDashboard: React.FC = () => {
    const { user } = useContext(AuthContext);
    const { watchedVideos = [], favoriteVideos = [], toggleFavoriteVideo } = useContext(StudentProgressContext);
    const { t } = useI18n();
    const streakCount = useStudyStreak();
    const queryClient = useQueryClient();

    React.useEffect(() => {
        const handleCourses = () => queryClient.invalidateQueries({ queryKey: ['courses'] });
        const handleAgenda = () => queryClient.invalidateQueries({ queryKey: ['agendaEvents'] });
        const handleAnswers = () => queryClient.invalidateQueries({ queryKey: ['studentAnswers'] });
        const handleTutoring = () => queryClient.invalidateQueries({ queryKey: ['tutoringRequests'] });

        eventEmitter.on('courses-updated', handleCourses);
        eventEmitter.on('agenda-updated', handleAgenda);
        eventEmitter.on('student-answers-updated', handleAnswers);
        eventEmitter.on('tutoring-requests-updated', handleTutoring);
        eventEmitter.on('tutoring-update', handleTutoring);

        return () => {
            eventEmitter.off('courses-updated', handleCourses);
            eventEmitter.off('agenda-updated', handleAgenda);
            eventEmitter.off('student-answers-updated', handleAnswers);
            eventEmitter.off('tutoring-requests-updated', handleTutoring);
            eventEmitter.off('tutoring-update', handleTutoring);
        };
    }, [queryClient]);

    const { data: courses = [], isLoading: coursesLoading } = useQuery<CourseLevel[]>({
        queryKey: ['courses'],
        queryFn: api.fetchCourses,
        enabled: !!user && !!user.id && !!auth.currentUser,
    });
    
    const { data: events = [] } = useQuery<ExamEvent[]>({
        queryKey: ['agendaEvents', user?.id],
        queryFn: () => api.fetchAgendaEvents(user!.id),
        enabled: !!user && !!user.id && !!auth.currentUser,
    });

    const { data: studentAnswers = [] } = useQuery<StudentAnswer[]>({
        queryKey: ['studentAnswers', user?.id],
        queryFn: () => api.fetchStudentAnswers(user!.id),
        enabled: !!user && !!user.id && !!auth.currentUser,
    });

    const videoMap = useMemo(() => {
        const map = new Map<string, string>();
        if (!courses) return map;
        courses.forEach(course => {
            (course.subjects || []).forEach(subject => {
                subject.videos?.forEach(video => {
                    map.set(video.id, video.title);
                });
                subject.blocks?.forEach(block => {
                    block.videos?.forEach(video => {
                        map.set(video.id, video.title);
                    });
                });
            });
        });
        return map;
    }, [courses]);

    const findSubjectName = (subjectId: string, allCourses: CourseLevel[]) => {
        for (const level of allCourses) {
            for (const subject of (level.subjects || [])) {
                if (subject.id === subjectId) {
                    return `${level.name} - ${subject.name}`;
                }
            }
        }
        return '';
    };

    const upcomingExamsWithWarning = useMemo(() => {
        if (!events) return [];
        const now = new Date();
        const todayStr = now.toISOString().split('T')[0];

        return events.filter(event => {
            const examStart = new Date(`${event.date}T00:00:00`);
            const examEnd = new Date(`${event.date}T23:59:59`);
            
            // Check if the exam is today
            if (event.date === todayStr && now <= examEnd) {
                return true;
            }
            
            // Or if tomorrow and less than 24 hours
            const timeDiff = examStart.getTime() - now.getTime();
            const hoursDiff = timeDiff / (1000 * 60 * 60);
            
            return hoursDiff > 0 && hoursDiff < 24;
        });
    }, [events]);

    const studentEnrolledCourseIds = (user && user.role === 'student') ? (user as StudentUser).enrolledCourseIds : undefined;

    const enrolledCourses = useMemo(() => {
        if (!courses || !studentEnrolledCourseIds) return [];
        return courses.filter(c => studentEnrolledCourseIds.includes(c.id));
    }, [courses, studentEnrolledCourseIds]);

    // Role-based navigation/early returns AFTER all hooks have executed unconditionally
    if (user?.role === 'teacher') {
        return <TeacherDashboard />;
    }

    if (user?.role === 'admin') {
        return <Navigate to={ROUTES.ADMIN_DASHBOARD} replace />;
    }

    if (coursesLoading) {
        return <div className="text-center p-8">{t('common.loading')}</div>;
    }

    if (!user || user.role !== 'student' || !courses) {
        return <div className="text-center p-8">No se pudieron cargar los datos del estudiante.</div>;
    }

    const student = user as StudentUser;

    const examNotificationsEl = upcomingExamsWithWarning.length > 0 && (
        <div id="exam-notifications" className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/60 p-5 rounded-xl shadow-sm space-y-3 my-4">
            <div className="flex items-center gap-2.5 text-amber-800 dark:text-amber-400">
                <ExclamationTriangleIcon className="w-6 h-6 flex-shrink-0 animate-pulse" />
                <h3 className="font-bold text-lg">⚠️ ¡Atención!: Exámenes Próximos (Menos de 24h)</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {upcomingExamsWithWarning.map(event => {
                    const examDateObj = new Date(event.date);
                    const formattedDateStr = examDateObj.toLocaleDateString('es-ES', { 
                        weekday: 'long', 
                        year: 'numeric', 
                        month: 'long', 
                        day: 'numeric' 
                    });
                    const subjectName = findSubjectName(event.subjectId, courses);

                    return (
                        <div key={event.id} id={`exam-alert-${event.id}`} className="bg-white dark:bg-slate-800 border-l-4 border-amber-500 p-4 rounded-r-lg shadow-sm flex flex-col justify-between">
                            <div>
                                <div className="flex justify-between items-start gap-2">
                                    <h4 className="font-semibold text-slate-900 dark:text-amber-300 text-base">{event.title}</h4>
                                    <span className="bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-200 text-xs font-semibold px-2.5 py-1.5 rounded-full inline-block">
                                        Próximo
                                    </span>
                                </div>
                                {subjectName && (
                                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 uppercase font-medium tracking-wider">
                                        {subjectName}
                                    </p>
                                )}
                                <p className="text-sm text-slate-600 dark:text-slate-300 mt-2 flex items-center gap-1.5">
                                    <span>📅</span> {formattedDateStr}
                                </p>
                            </div>
                            <div className="mt-4 pt-3 border-t border-gray-100 dark:border-slate-700 flex justify-end gap-2">
                                <Link 
                                    to={ROUTES.AGENDA}
                                    className="text-xs font-bold text-amber-700 dark:text-amber-400 hover:text-amber-800 dark:hover:text-amber-300 flex items-center gap-1 transition-colors"
                                >
                                    Ver Agenda y Plan de Estudio ➔
                                </Link>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );

    // --- RENDER FOR NON-SUBSCRIBED USERS ---
    if (!student.isSubscribed) {
        return (
            <div className="space-y-10 animate-slide-in-up">
                <div>
                    <Link to={ROUTES.ACCOUNT} className="group inline-block cursor-pointer transition-all" title="Haz clic para entrar en Mi Cuenta y administrar tu perfil y preferencias">
                        <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-50 group-hover:text-primary dark:group-hover:text-indigo-400 transition-colors flex items-center gap-2">
                            <span>{t('dashboard.welcome_unsubscribed', { name: student.name })}</span>
                            <span className="text-xs font-semibold px-2.5 py-1 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 border border-slate-200 dark:border-slate-700 shadow-sm">
                                ⚙️ Mi Cuenta
                            </span>
                        </h1>
                    </Link>
                    <p className="text-lg text-slate-600 dark:text-slate-400 mt-1">{t('dashboard.subtitle_unsubscribed')}</p>
                </div>

                {examNotificationsEl}

                <NonSubscribedWelcomeHero />
                
                <div className="bg-amber-500/5 dark:bg-slate-800/80 p-5 rounded-2xl border border-amber-500/15 dark:border-slate-700/60 shadow-sm flex flex-col sm:flex-row justify-between items-center gap-4">
                    <div className="flex items-center gap-3.5">
                        <div className="text-3xl">🪙</div>
                        <div>
                            <h4 className="font-extrabold text-slate-900 dark:text-slate-100 text-sm sm:text-base">{t('dashboard.walletTitle')}</h4>
                            <p className="text-xs text-slate-550 dark:text-slate-400 mt-1" dangerouslySetInnerHTML={{ __html: t('dashboard.walletDesc', { balance: student.creditsBalance ?? 0, currency: student.creditsBalance === 1 ? 'Infinity' : 'Infinitys' }) }} />
                        </div>
                    </div>
                    <Link 
                        to={ROUTES.PAYMENT} 
                        className="w-full sm:w-auto text-center px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold rounded-xl text-xs transition-colors shadow-sm whitespace-nowrap"
                    >
                        {t('dashboard.acquireInfinitysCta')}
                    </Link>
                </div>
                
                {enrolledCourses.length > 0 && (
                    <div>
                        <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-50 mb-6">{t('dashboard.yourRegisteredCourses')}</h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {enrolledCourses.map(course => (
                                <LockedCourseCard key={course.id} level={course} />
                            ))}
                        </div>
                    </div>
                )}


                <FreeContentPreview courses={courses} />

                {/* Interactive Dynamic Progress Widget with recharts */}
                <InteractiveDailyProgressCenter 
                    watchedVideos={watchedVideos} 
                    studentAnswers={studentAnswers} 
                    courses={courses} 
                    videoMap={videoMap}
                />

                <FavoriteVideosSection 
                    favoriteVideos={favoriteVideos} 
                    courses={courses} 
                    toggleFavoriteVideo={toggleFavoriteVideo} 
                />

                <StudentTutoringProgressChart studentId={user.id} />

                <StudentAchievementsPanel 
                    watchedVideos={watchedVideos} 
                    studentAnswers={studentAnswers} 
                    streakCount={streakCount} 
                    isSubscribed={false} 
                />

                <QuizHistorySection studentAnswers={studentAnswers} videoMap={videoMap} />

            </div>
        );
    }
    
    // --- RENDER FOR SUBSCRIBED USERS ---
    const totalVideos = (courses || []).reduce((sum, level) => sum + (level.subjects || []).reduce((s, subject) => s + (subject.videos || []).length, 0), 0);
    const subjectsInCourses = (enrolledCourses || []).reduce((sum, course) => sum + (course.subjects || []).length, 0);

    return (
        <div className="space-y-8 animate-slide-in-up">
            <div>
                <Link to={ROUTES.ACCOUNT} className="group inline-block cursor-pointer transition-all" title="Haz clic para entrar en Mi Cuenta y administrar tu perfil y preferencias">
                    <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-50 group-hover:text-primary dark:group-hover:text-indigo-400 transition-colors flex items-center gap-2">
                        <span>{t('dashboard.welcome_subscribed', { name: student.name })}</span>
                        <span className="text-xs font-semibold px-2.5 py-1 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 border border-slate-200 dark:border-slate-700 shadow-sm">
                            ⚙️ {t('dashboard.myAccount')}
                        </span>
                    </h1>
                </Link>
                <p className="text-lg text-slate-600 dark:text-slate-400 mt-1">{t('dashboard.subtitle_subscribed')}</p>
            </div>

            {examNotificationsEl}

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6">
                <StatCard icon={<CheckCircleIcon className="w-8 h-8 text-white" />} label={t('dashboard.videosWatched')} value={watchedVideos.length} color="bg-green-500" />
                <StatCard icon={<AcademicCapIcon className="w-8 h-8 text-white" />} label={t('dashboard.subjectsInCourses')} value={subjectsInCourses} color="bg-blue-500" />
                <StatCard icon={<ChartBarIcon className="w-8 h-8 text-white" />} label={t('dashboard.totalProgress')} value={`${totalVideos > 0 ? Math.round((watchedVideos.length / totalVideos) * 100) : 0}%`} color="bg-indigo-500" />
                <StatCard icon={<Flame className="w-8 h-8 text-white" />} label={t('dashboard.studyStreakLabel')} value={streakCount === 1 ? t('dashboard.studyStreakValue_one', { count: streakCount }) : t('dashboard.studyStreakValue_other', { count: streakCount })} color="bg-orange-500" />
                <Link to={ROUTES.PAYMENT} className="block group">
                    <StatCard icon={<span className="text-2xl">🪙</span>} label={t('dashboard.myInfinitysLabel')} value={student.creditsBalance ?? 0} color="bg-gradient-to-br from-amber-400 to-amber-600" />
                </Link>
            </div>

            {/* Actividad y rendimiento de estudio: gráfico interactivo dual-axis Recharts y lista de últimos vídeos vistos */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <div className="lg:col-span-8">
                    <StudentLessonsPerformanceChart watchedVideos={watchedVideos} courses={courses} />
                </div>
                <div className="lg:col-span-4">
                    {watchedVideos.length > 0 ? (
                        <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl shadow-xl border border-slate-100 dark:border-slate-700/80 h-full flex flex-col justify-between">
                            <div>
                                <h4 className="text-xs font-black text-slate-500 dark:text-slate-440 uppercase tracking-widest mb-4 flex items-center gap-1.5">
                                    <svg className="w-4 h-4 text-emerald-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    {t('dashboard.latestWatchedVideos')}
                                </h4>
                                <div className="space-y-2.5">
                                    {[...watchedVideos].reverse().slice(0, 5).map(videoId => findVideoById(videoId, courses)).filter(Boolean).map((video: any, idx) => (
                                        <motion.div
                                            key={video.id}
                                            initial={{ opacity: 0, x: -10 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            transition={{ delay: idx * 0.05 }}
                                        >
                                            <Link 
                                                to={generateVideoPath(video.id)} 
                                                className="group flex items-center justify-between p-3 rounded-xl border border-slate-100 hover:border-indigo-150/40 dark:border-slate-700/50 dark:hover:border-slate-705 bg-slate-50/50 dark:bg-slate-900/30 hover:bg-indigo-50/30 dark:hover:bg-slate-800/80 transition-all select-none"
                                            >
                                                <div className="flex items-center gap-3 min-w-0">
                                                    <div className="p-2 bg-indigo-50 dark:bg-slate-800 text-indigo-650 dark:text-indigo-400 rounded-lg group-hover:bg-indigo-600 group-hover:text-white transition-colors duration-200 flex-shrink-0">
                                                        <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                                                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                                                        </svg>
                                                    </div>
                                                    <div className="min-w-0">
                                                        <p className="text-xs font-bold text-slate-800 dark:text-slate-200 group-hover:text-indigo-650 dark:group-hover:text-indigo-400 transition-colors truncate" title={video.title}>
                                                            {video.title}
                                                        </p>
                                                    </div>
                                                </div>
                                            </Link>
                                        </motion.div>
                                    ))}
                                </div>
                            </div>
                            <div className="text-[10px] text-slate-400 dark:text-slate-500 mt-4 leading-normal font-semibold border-t border-slate-100 dark:border-slate-750/50 pt-3">
                                {t('dashboard.resumeClassesHint')}
                            </div>
                        </div>
                    ) : (
                        <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-xl border border-slate-100 dark:border-slate-705 h-full flex flex-col items-center justify-center text-center py-10">
                            <span className="text-3xl mb-2">🎓</span>
                            <p className="text-sm font-black text-slate-800 dark:text-slate-200">{t('dashboard.readyToStudy')}</p>
                            <p className="text-xs text-slate-450 dark:text-slate-400 mt-1 max-w-[200px]">
                                {t('dashboard.startVideoLessonsDesc')}
                            </p>
                        </div>
                    )}
                </div>
            </div>

            {/* Interactive Dynamic Progress Widget with recharts */}
            <InteractiveDailyProgressCenter 
                watchedVideos={watchedVideos} 
                studentAnswers={studentAnswers} 
                courses={courses} 
                videoMap={videoMap}
            />

            <FavoriteVideosSection 
                favoriteVideos={favoriteVideos} 
                courses={courses} 
                toggleFavoriteVideo={toggleFavoriteVideo} 
            />

            <StudentTutoringProgressChart studentId={user.id} />

            <div className="space-y-6">
                <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-50">{t('dashboard.courseProgressTitle')}</h2>
                {enrolledCourses.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {enrolledCourses.map(course => (
                            <CourseProgress key={course.id} level={course} watchedVideos={watchedVideos} />
                        ))}
                    </div>
                ) : (
                    <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-lg">
                        <p className="text-slate-900 dark:text-slate-50">{t('dashboard.noCourses')}</p>
                    </div>
                )}
            </div>

            <StudentAchievementsPanel 
                watchedVideos={watchedVideos} 
                studentAnswers={studentAnswers} 
                streakCount={streakCount} 
                isSubscribed={true} 
            />

            <QuizHistorySection studentAnswers={studentAnswers} videoMap={videoMap} />
        </div>
    );
};