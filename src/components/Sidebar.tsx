
import React, { useContext, useState, useMemo, useRef, useCallback } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import * as api from '../services/api';
import type { CourseLevel, StudentUser, TeacherUser, Conversation, StudentPeerConversation } from '../types';
import { AuthContext } from '../contexts/AuthContext';
import { AdminNotificationContext } from '../contexts/AdminNotificationContext';
import { AppConfigContext } from '../contexts/AppConfigContext';
import { BookOpenIcon, DashboardIcon, AcademicCapIcon, CalendarIcon, UserGroupIcon, LightBulbIcon, VideoCameraIcon, UserCircleIcon, CreditCardIcon, ChartBarIcon, LogoutIcon, ChatBubbleLeftRightIcon, SparklesIcon, FolderOpenIcon } from './icons';
import { ROUTES, generateCourseLevelPath } from '../constants/routes';
import { Users, Flame, Library } from 'lucide-react';
import { ConfirmationModal } from './ConfirmationModal';
import { useI18n } from '../hooks/useI18n';
import { useStudyStreak } from '../hooks/useStudyStreak';
import { useAuthorization } from '../hooks/useAuthorization';
import { ThemeContext } from '../contexts/ThemeContext';
import { OFFICIAL_LOGO_PATH, OFFICIAL_ICON_PATH, handleImageError } from '../constants/branding';

import { filterCoursesForTeacher } from '../utils/teacherPermissions';

interface NavItemProps {
    to: string;
    icon: React.ReactNode;
    label: string;
    isSidebarOpen: boolean;
    onItemClick: () => void;
    badgeCount?: number;
    state?: any;
}

const NavItem: React.FC<NavItemProps> = React.memo(({ to, icon, label, isSidebarOpen, onItemClick, badgeCount, state }) => {
    const navigate = useNavigate();
    const location = useLocation();

    const handleClick = (e: React.MouseEvent) => {
        onItemClick(); // Scrolls the main content to the top.

        const isResettableLink = to.startsWith('/app/course/') || to.startsWith('/app/bach/');
        if (isResettableLink && location.pathname === to) {
            e.preventDefault();
            navigate(to, { state: { refresh: Date.now(), ...(state || {}) } });
        }
    };
    
    return (
        <NavLink
            to={to}
            state={state}
            end
            onClick={handleClick}
            className={({ isActive }) =>
                `flex items-center px-3.5 py-3 my-1.5 rounded-xl transition-all duration-200 outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${!isSidebarOpen ? 'justify-center whitespace-nowrap' : 'whitespace-normal'} ${
                isActive
                    ? 'bg-primary text-white shadow-md font-semibold'
                    : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100/80 dark:hover:bg-slate-700/60 hover:text-slate-900 dark:hover:text-slate-100'
                }`
            }
        >
            <div className="relative w-6 h-6 flex-shrink-0 flex items-center justify-center transition-transform">
                {icon}
                {badgeCount && badgeCount > 0 && !isSidebarOpen && (
                    <span className="absolute -top-1 -right-1 block h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white dark:ring-slate-800 animate-pulse"></span>
                )}
            </div>
            {isSidebarOpen ? (
                <div className="flex items-center justify-between flex-1 min-w-0">
                    <span className="ml-4 transition-all duration-200 whitespace-normal break-words opacity-100 font-sans tracking-wide leading-tight text-sm">
                        {label}
                    </span>
                    {badgeCount && badgeCount > 0 ? (
                        <span className="ml-2 bg-red-500 text-white text-[10px] font-black rounded-full h-5 px-1.5 flex items-center justify-center min-w-[20px] shadow animate-bounce">
                            {badgeCount > 9 ? '9+' : badgeCount}
                        </span>
                    ) : null}
                </div>
            ) : (
                <span className="w-0 overflow-hidden opacity-0 pointer-events-none"></span>
            )}
        </NavLink>
    );
});

interface CourseLinkProps {
    to: string;
    label: string;
    isSidebarOpen: boolean;
    onItemClick: () => void;
}

const CourseLink: React.FC<CourseLinkProps> = React.memo(({ to, label, isSidebarOpen, onItemClick }) => {
    return (
        <NavItem 
            to={to} 
            icon={<AcademicCapIcon className="w-6 h-6" />} 
            label={label} 
            isSidebarOpen={isSidebarOpen} 
            onItemClick={onItemClick}
        />
    );
});

interface SidebarProps {
    sidebarState: 'open' | 'collapsed' | 'closed';
    onItemClick: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ sidebarState, onItemClick }) => {
    const { logout } = useContext(AuthContext);
    const { user, isTeacher, isStudent, isAdmin, studentUser, teacherUser } = useAuthorization();
    const { theme } = useContext(ThemeContext);
    const { appConfig } = useContext(AppConfigContext);
    const { unreadConversationsCount, pendingTutoringRequestsCount, pendingTopicRequestsCount } = useContext(AdminNotificationContext);
    const { t } = useI18n();
    const navigate = useNavigate();
    const streakCount = useStudyStreak();
    const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);
    const navRef = useRef<HTMLElement>(null);

    const { data: courses, isLoading } = useQuery<CourseLevel[]>({
        queryKey: ['courses'],
        queryFn: api.fetchCourses
    });

    const { data: studentConversations } = useQuery<Conversation[]>({
        queryKey: ['conversations'],
        queryFn: api.fetchConversations,
        enabled: !!user && user.role === 'student',
        refetchInterval: 5000,
    });

    const { data: peerConversations } = useQuery<StudentPeerConversation[]>({
        queryKey: ['peer-conversations', user?.id],
        queryFn: () => api.fetchPeerConversations(user!.id),
        enabled: !!user && user.role === 'student',
        refetchInterval: 5000,
    });

    const unreadSupportCount = useMemo(() => {
        if (!user || user.role !== 'student' || !studentConversations) return 0;
        return studentConversations.filter(c => {
            if (!c || !c.id) return false;
            const belongsToStudent = c.studentId === user.id || c.id === user.id || c.id.startsWith(user.id + '_');
            return belongsToStudent && !!c.unreadByStudent;
        }).length;
    }, [studentConversations, user]);

    const unreadPeerCount = useMemo(() => {
        if (!user || user.role !== 'student' || !peerConversations) return 0;
        return peerConversations.filter(c => !!c.unreadByStudentId?.[user.id]).length;
    }, [peerConversations, user]);

    const handleLogout = () => {
        logout();
        navigate(ROUTES.LOGIN);
    };

    const isSidebarOpen = sidebarState === 'open';

    const teacherCourseLinks = useMemo(() => {
        if (isLoading || !courses || !user || !isTeacher) {
            return null;
        }

        const tUser = teacherUser || (user as TeacherUser);
        const availableCourses = filterCoursesForTeacher(courses, tUser);

        return availableCourses.map(course => (
            <CourseLink 
                key={course.id} 
                to={generateCourseLevelPath(course.id)} 
                label={course.name} 
                isSidebarOpen={isSidebarOpen} 
                onItemClick={onItemClick}
            />
        ));
    }, [isLoading, courses, user, teacherUser, isTeacher, isSidebarOpen, onItemClick]);

    const courseLinks = useMemo(() => {
        if (isLoading || !courses || !user || !isStudent) {
            return (
                <div className="px-3 space-y-2">
                    <div className="h-10 bg-gray-200 dark:bg-slate-700 rounded animate-pulse"></div>
                </div>
            );
        }

        const student = studentUser;
        const enrolledCourses = courses.filter(c => student && student.enrolledCourseIds && student.enrolledCourseIds.includes(c.id));

        if (enrolledCourses.length === 0) {
            return <p className={`px-3 text-sm text-red-500 ${isSidebarOpen ? 'block' : 'hidden'}`}>No tienes cursos matriculados.</p>;
        }
        
        return enrolledCourses.map(course => (
            <CourseLink 
                key={course.id} 
                to={generateCourseLevelPath(course.id)} 
                label={course.name} 
                isSidebarOpen={isSidebarOpen} 
                onItemClick={onItemClick}
            />
        ));
    }, [isLoading, courses, user, isSidebarOpen, onItemClick]);

    const sidebarWidth = {
        open: 'w-64',
        collapsed: 'w-20',
        closed: 'w-64',
    }[sidebarState];

    const transformClass = sidebarState === 'closed' ? '-translate-x-full' : 'translate-x-0';

    return (
        <>
            {/* Increased z-index to z-[100] to overlap bottom nav, modals, and other overlays on mobile */}
            <aside className={`sidebar-container bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-50 border-r border-gray-200 dark:border-slate-700 shadow-lg flex flex-col fixed h-full z-[100] transition-all duration-300 ${sidebarWidth} ${transformClass} overflow-y-auto pb-28 md:pb-4`}>
                <div className="flex items-center justify-center p-3 pt-[calc(0.75rem+env(safe-area-inset-top,0px))] border-b border-gray-200 dark:border-slate-700 min-h-[4rem] flex-shrink-0 overflow-hidden">
                    {isSidebarOpen ? (
                        <div className="bg-white rounded p-1 flex items-center justify-center inline-flex">
                            <img 
                                src={OFFICIAL_LOGO_PATH} 
                                alt="AulaInfinity" 
                                className="h-9 w-auto object-contain" 
                                referrerPolicy="no-referrer"
                                onError={(e) => handleImageError(e, 'full')}
                            />
                        </div>
                    ) : (
                        <div className="bg-white rounded p-1 flex items-center justify-center inline-flex">
                            <img 
                                src={OFFICIAL_ICON_PATH} 
                                alt="AulaInfinity Icon" 
                                className="w-8 h-8 object-contain" 
                                referrerPolicy="no-referrer"
                                onError={(e) => handleImageError(e, 'icon')}
                            />
                        </div>
                    )}
                </div>

                <nav ref={navRef} className="flex-1 px-3 py-4 space-y-2 overflow-y-auto flex flex-col">
                    <NavItem to={ROUTES.DASHBOARD} icon={<DashboardIcon className="w-6 h-6" />} label={isTeacher ? t('sidebar.teacherDashboard') : t('sidebar.dashboard')} isSidebarOpen={isSidebarOpen} onItemClick={onItemClick} />

                    {isStudent && streakCount > 0 && (
                        <div 
                            title={t('sidebar.studyStreakDays', { count: streakCount })}
                            className={`mx-1 my-2 p-2.5 rounded-xl border border-orange-200/65 dark:border-amber-950/25 bg-orange-50/40 dark:bg-amber-950/10 flex items-center gap-2.5 select-none ${isSidebarOpen ? 'justify-start' : 'justify-center bg-transparent border-transparent'}`}
                        >
                            <div className="relative w-6 h-6 flex-shrink-0 flex items-center justify-center">
                                <Flame className="w-5 h-5 text-orange-500 fill-orange-500/80 filter drop-shadow animate-pulse" />
                                <span className="absolute -top-0.5 -right-0.5 flex h-1.5 w-1.5">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-orange-500"></span>
                                </span>
                            </div>
                            {isSidebarOpen && (
                                <div className="flex-1 min-w-0">
                                    <p className="text-[11px] font-bold text-orange-900 dark:text-amber-500 uppercase tracking-wider leading-none">{t('sidebar.studyStreakTitle')}</p>
                                    <p className="text-xs font-semibold text-orange-850 dark:text-amber-300 mt-0.5">
                                        {t('sidebar.studyStreakDays', { count: streakCount })} 🔥
                                    </p>
                                </div>
                            )}
                        </div>
                    )}

                    {!isTeacher && (
                        <>
                            <NavItem to={ROUTES.PROGRESS} icon={<ChartBarIcon className="w-6 h-6" />} label={t('sidebar.myProgress')} isSidebarOpen={isSidebarOpen} onItemClick={onItemClick} />
                            <NavItem to={ROUTES.AGENDA} icon={<CalendarIcon className="w-6 h-6" />} label={t('sidebar.myAgenda')} isSidebarOpen={isSidebarOpen} onItemClick={onItemClick} />
                        </>
                    )}
                    
                    <div className="pt-4">
                        <p className={`px-3 pb-2 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase transition-opacity duration-200 ${isSidebarOpen ? 'block' : 'hidden'}`}>
                            {isTeacher ? t('sidebar.availableCourses') : t('sidebar.myCourses')}
                        </p>
                        {isTeacher ? teacherCourseLinks : courseLinks}
                    </div>
                    
                    <div className="pt-4">
                        <p className={`px-3 pb-2 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase transition-opacity duration-200 ${isSidebarOpen ? 'block' : 'hidden'}`}>
                            {isTeacher ? t('sidebar.teacherFunctions') : t('sidebar.tools')}
                        </p>
                        {!isTeacher ? (
                            <>
                                {(isAdmin || ((appConfig?.aiEnabled !== false) && ((user as any)?.aiEnabled !== false))) && (
                                    <NavItem to={ROUTES.TUTOR_IA} icon={<SparklesIcon className="w-6 h-6 text-amber-500 dark:text-amber-400" />} label={t('sidebar.aiTutor')} isSidebarOpen={isSidebarOpen} onItemClick={onItemClick} />
                                )}
                                <NavItem to={ROUTES.STUDY_GROUPS} icon={<UserGroupIcon className="w-6 h-6 text-pink-500 dark:text-pink-400" />} label={t('sidebar.studyGroups')} isSidebarOpen={isSidebarOpen} onItemClick={onItemClick} state={{ activeChatType: 'group' }} />
                                <NavItem to={ROUTES.STUDENT_CHAT} icon={<ChatBubbleLeftRightIcon className="w-6 h-6 text-indigo-500 dark:text-indigo-400" />} label={t('sidebar.studentChat')} isSidebarOpen={isSidebarOpen} onItemClick={onItemClick} badgeCount={unreadPeerCount} />
                                <NavItem to={ROUTES.CHAT} icon={<ChatBubbleLeftRightIcon className="w-6 h-6" />} label={t('sidebar.adminChat')} isSidebarOpen={isSidebarOpen} onItemClick={onItemClick} badgeCount={unreadSupportCount} />
                                <NavItem to={ROUTES.TUTORING} icon={<VideoCameraIcon className="w-6 h-6" />} label={t('sidebar.tutoring')} isSidebarOpen={isSidebarOpen} onItemClick={onItemClick} />
                                <NavItem to={ROUTES.REQUEST} icon={<LightBulbIcon className="w-6 h-6" />} label={t('sidebar.requests')} isSidebarOpen={isSidebarOpen} onItemClick={onItemClick} />
                            </>
                        ) : (
                            <>
                                <NavItem 
                                    to={ROUTES.TEACHER_CONTENT} 
                                    icon={<FolderOpenIcon className="w-6 h-6" />} 
                                    label={t('sidebar.content')} 
                                    isSidebarOpen={isSidebarOpen} 
                                    onItemClick={onItemClick} 
                                />
                                <NavItem 
                                    to={ROUTES.CHAT} 
                                    icon={<ChatBubbleLeftRightIcon className="w-6 h-6" />} 
                                    label={t('sidebar.doubtsInbox')} 
                                    isSidebarOpen={isSidebarOpen} 
                                    onItemClick={onItemClick} 
                                    badgeCount={unreadConversationsCount}
                                />
                                <NavItem 
                                    to={ROUTES.TUTORING} 
                                    icon={<VideoCameraIcon className="w-6 h-6" />} 
                                    label={t('sidebar.tutoringManagement')} 
                                    isSidebarOpen={isSidebarOpen} 
                                    onItemClick={onItemClick} 
                                    badgeCount={pendingTutoringRequestsCount}
                                />
                                <NavItem 
                                    to={ROUTES.REQUEST} 
                                    icon={<LightBulbIcon className="w-6 h-6" />} 
                                    label={t('sidebar.studentRequests')} 
                                    isSidebarOpen={isSidebarOpen} 
                                    onItemClick={onItemClick} 
                                    badgeCount={pendingTopicRequestsCount}
                                />
                                <NavItem 
                                    to={ROUTES.AGENDA} 
                                    icon={<CalendarIcon className="w-6 h-6 text-indigo-500 dark:text-indigo-400" />} 
                                    label={t('sidebar.tutoringAgenda')} 
                                    isSidebarOpen={isSidebarOpen} 
                                    onItemClick={onItemClick} 
                                />
                                <NavItem 
                                    to={ROUTES.TEACHER_STUDENTS} 
                                    icon={<Users className="w-6 h-6" />} 
                                    label={t('sidebar.studentManagement')} 
                                    isSidebarOpen={isSidebarOpen} 
                                    onItemClick={onItemClick} 
                                />
                            </>
                        )}
                    </div>
                    
                    <div className="mt-auto pt-4 border-t border-gray-200 dark:border-slate-700 flex-shrink-0">
                    {isStudent && (
                        <div className={`mx-1 mb-4 transition-all duration-300 ${isSidebarOpen ? 'px-1' : 'flex justify-center'}`}>
                            {isSidebarOpen ? (
                                <div className="p-3.5 bg-gradient-to-br from-indigo-50/60 to-slate-50/40 dark:from-indigo-950/20 dark:to-slate-800/40 rounded-xl border border-indigo-100/60 dark:border-indigo-900/30 shadow-sm">
                                    <div className="flex items-center justify-between mb-2">
                                        <div className="flex items-center gap-1.5 text-xs font-bold text-slate-500 dark:text-slate-450">
                                            <span>🪙</span>
                                            <span>{t('sidebar.myWallet')}</span>
                                        </div>
                                        <span className="text-xs font-black text-indigo-700 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 px-2 py-0.5 rounded-full">
                                            {studentUser?.creditsBalance ?? 0} {studentUser?.creditsBalance === 1 ? 'Infinity' : 'Infinitys'}
                                        </span>
                                    </div>
                                    <NavLink 
                                        to={ROUTES.PAYMENT} 
                                        onClick={onItemClick}
                                        className="block text-center bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold py-1.5 px-3 rounded-lg text-xs transition-colors shadow-sm"
                                    >
                                        {t('sidebar.acquireInfinitys')}
                                    </NavLink>
                                </div>
                            ) : (
                                <NavLink 
                                    to={ROUTES.PAYMENT} 
                                    onClick={onItemClick}
                                    title={`${t('sidebar.myWallet')}: ${studentUser?.creditsBalance ?? 0} Infinitys`}
                                    className="flex items-center justify-center w-10 h-10 rounded-full bg-amber-500/10 text-amber-500 border border-amber-500/20 hover:scale-105 transition-all shadow-sm"
                                >
                                    <span className="font-extrabold text-xs">🪙{studentUser?.creditsBalance ?? 0}</span>
                                </NavLink>
                            )}
                        </div>
                    )}
                    {isTeacher && !teacherUser?.isApprovedForTutoring && (
                        <div className={`p-3 rounded-xl bg-amber-50 dark:bg-amber-950/20 text-amber-800 dark:text-amber-400 border border-amber-200 dark:border-amber-900/40 mb-4 ${isSidebarOpen ? 'block' : 'hidden'}`}>
                            <h4 className="font-extrabold text-xs flex items-center gap-1">
                                <span>⚠️</span>
                                <span>{t('sidebar.noGreenLight')}</span>
                            </h4>
                            <p className="text-[11px] font-medium leading-relaxed mt-1">
                                {t('sidebar.noGreenLightDesc')}
                            </p>
                        </div>
                    )}
                    {isStudent && !studentUser?.isSubscribed && (
                        <div className={`p-3 rounded-lg bg-gradient-to-r from-green-400 to-blue-500 text-white mb-4 ${isSidebarOpen ? 'block' : 'hidden'}`}>
                            <h4 className="font-bold">{t('sidebar.premiumCtaTitle')}</h4>
                            <p className="text-sm mt-1">{t('sidebar.premiumCtaText')}</p>
                            <NavLink to={ROUTES.PAYMENT} onClick={onItemClick} className="mt-3 block text-center bg-white text-primary font-bold py-1.5 px-3 rounded-md text-sm hover:bg-gray-100">
                                {t('sidebar.premiumCtaButton')}
                            </NavLink>
                        </div>
                    )}
                    <NavItem 
                        to={ROUTES.ACCOUNT} 
                        icon={
                            user && 'avatar' in user && user.avatar ? (
                                <img 
                                    src={user.avatar} 
                                    alt="Avatar" 
                                    className="w-6 h-6 rounded-full object-cover border border-slate-300 dark:border-slate-600 block min-w-[24px]" 
                                    referrerPolicy="no-referrer"
                                />
                            ) : (
                                <UserCircleIcon className="w-6 h-6" />
                            )
                        } 
                        label={t('sidebar.myAccount')} 
                        isSidebarOpen={isSidebarOpen} 
                        onItemClick={onItemClick} 
                    />
                    <button
                        onClick={() => {
                            onItemClick();
                            setIsLogoutModalOpen(true);
                        }}
                        aria-label={t('sidebar.logout') || 'Cerrar sesión'}
                        className={`flex items-center p-3 my-1 rounded-lg transition-all duration-200 w-full text-slate-700 dark:text-slate-300 hover:bg-red-100 dark:hover:bg-red-900/50 hover:text-red-700 dark:hover:text-red-300 outline-none focus:ring-2 focus:ring-red-500/20 ${!isSidebarOpen ? 'justify-center' : ''}`}
                    >
                        <div className="w-6 h-6 flex-shrink-0 flex items-center justify-center">
                            <LogoutIcon className="w-6 h-6" />
                        </div>
                        {isSidebarOpen ? (
                            <span className="ml-4 transition-all duration-200 whitespace-nowrap opacity-100 font-sans tracking-wide">
                                {t('sidebar.logout')}
                            </span>
                        ) : (
                            <span className="w-0 overflow-hidden opacity-0 pointer-events-none"></span>
                        )}
                    </button>
                </div>
            </nav>
        </aside>
            <ConfirmationModal
                isOpen={isLogoutModalOpen}
                onClose={() => setIsLogoutModalOpen(false)}
                onConfirm={handleLogout}
                title={t('sidebar.confirmLogoutTitle')}
                description={t('sidebar.confirmLogoutDesc')}
                confirmText={t('sidebar.logout')}
                isDestructive
            />
        </>
    );
};
