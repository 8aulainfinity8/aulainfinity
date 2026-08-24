import React, { useState, useEffect, useRef, useCallback, useContext, useMemo } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import * as api from '../services/api';
import type { Conversation, StudentPeerConversation } from '../types';
import { DashboardIcon, CalendarIcon, SparklesIcon, MenuIcon, ChartBarIcon, UsersIcon, UserIcon, ChatBubbleLeftRightIcon } from './icons';
import { ROUTES } from '../constants/routes';
import { AuthContext } from '../contexts/AuthContext';
import { useAuthorization } from '../hooks/useAuthorization';
import { AdminNotificationContext } from '../contexts/AdminNotificationContext';
import { StudentNotificationContext } from '../contexts/StudentNotificationContext';
import { AppConfigContext } from '../contexts/AppConfigContext';
import { useI18n } from '../hooks/useI18n';

interface MobileBottomNavProps {
    onMenuClick: () => void;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = React.memo(({ onMenuClick }) => {
    const location = useLocation();
    const [isDimmed, setIsDimmed] = useState(false);
    const [isWhiteboardActive, setIsWhiteboardActive] = useState(false);
    const timeoutRef = useRef<NodeJS.Timeout | null>(null);
    const isHoveredRef = useRef(false);

    // Detect if Whiteboard is open/active in DOM to completely hide bottom nav on mobile
    useEffect(() => {
        const checkWhiteboard = () => {
            const wb = document.querySelector('#whiteboard-container') || document.body.classList.contains('whiteboard-active');
            setIsWhiteboardActive(!!wb);
        };

        checkWhiteboard();
        const observer = new MutationObserver(checkWhiteboard);
        observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
        return () => observer.disconnect();
    }, []);

    const resetTimer = useCallback(() => {
        setIsDimmed(false);
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
        }
        if (isHoveredRef.current) return;
        
        timeoutRef.current = setTimeout(() => {
            if (!isHoveredRef.current) {
                setIsDimmed(true);
            }
        }, 2500); // Se difumina tras 2.5 segundos de inactividad
    }, []);

    useEffect(() => {
        resetTimer();

        const handleActivity = () => {
            resetTimer();
        };

        window.addEventListener('scroll', handleActivity, { passive: true });
        window.addEventListener('mousemove', handleActivity, { passive: true });
        window.addEventListener('touchstart', handleActivity, { passive: true });
        window.addEventListener('keydown', handleActivity, { passive: true });

        return () => {
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
            window.removeEventListener('scroll', handleActivity);
            window.removeEventListener('mousemove', handleActivity);
            window.removeEventListener('touchstart', handleActivity);
            window.removeEventListener('keydown', handleActivity);
        };
    }, [resetTimer]);

    const handleMouseEnter = () => {
        isHoveredRef.current = true;
        setIsDimmed(false);
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };

    const handleMouseLeave = () => {
        isHoveredRef.current = false;
        resetTimer();
    };

    const { user, isTeacher, isAdmin } = useAuthorization();
    const { t } = useI18n();
    const { appConfig } = useContext(AppConfigContext);
    const { unreadConversationsCount = 0, unreadGroupCount = 0, pendingTutoringRequestsCount = 0, pendingTopicRequestsCount = 0 } = useContext(AdminNotificationContext) || {};
    const studentNotifications = useContext(StudentNotificationContext);
    const totalTeacherBadge = unreadConversationsCount + unreadGroupCount + pendingTutoringRequestsCount + pendingTopicRequestsCount;

    const unreadSupportCount = studentNotifications?.unreadSupportCount ?? 0;
    const unreadPeerCount = studentNotifications?.unreadPeerCount ?? 0;
    const unreadStudentTotal = studentNotifications?.unreadStudentTotal ?? 0;

    const isAiAllowed = isAdmin || ((appConfig?.aiEnabled !== false) && ((user as any)?.aiEnabled !== false));

    let navItems = [];
    if (isAdmin) {
        navItems = [
            { 
                to: ROUTES.DASHBOARD, 
                icon: <DashboardIcon className="w-5 h-5 sm:w-6 h-6 transition-transform group-hover:scale-110" />, 
                label: t('mobileNav.home') 
            },
            { 
                to: ROUTES.ADMIN_CHAT, 
                icon: <ChatBubbleLeftRightIcon className="w-5 h-5 sm:w-6 h-6 transition-transform group-hover:scale-110 text-emerald-400" />, 
                label: t('mobileNav.doubts') 
            },
            { 
                to: ROUTES.ACCOUNT, 
                icon: <UserIcon className="w-5 h-5 sm:w-6 h-6 transition-transform group-hover:scale-110" />, 
                label: t('mobileNav.account') 
            },
        ];
    } else if (isTeacher) {
        navItems = [
            { 
                to: ROUTES.DASHBOARD, 
                icon: <DashboardIcon className="w-5 h-5 sm:w-6 h-6 transition-transform group-hover:scale-110" />, 
                label: t('mobileNav.home') 
            },
            { 
                to: ROUTES.CHAT, 
                icon: <ChatBubbleLeftRightIcon className="w-5 h-5 sm:w-6 h-6 transition-transform group-hover:scale-110 text-emerald-400" />, 
                label: t('mobileNav.doubts') 
            },
            { 
                to: ROUTES.ACCOUNT, 
                icon: <UserIcon className="w-5 h-5 sm:w-6 h-6 transition-transform group-hover:scale-110" />, 
                label: t('mobileNav.account') 
            },
        ];
    } else {
        navItems = [
            { 
                to: ROUTES.DASHBOARD, 
                icon: <DashboardIcon className="w-5 h-5 sm:w-6 h-6 transition-transform group-hover:scale-110" />, 
                label: t('mobileNav.home') 
            },
            { 
                to: ROUTES.CHAT, 
                icon: <ChatBubbleLeftRightIcon className="w-5 h-5 sm:w-6 h-6 transition-transform group-hover:scale-110 text-emerald-400" />, 
                label: t('mobileNav.doubts') 
            },
            { 
                to: ROUTES.STUDENT_CHAT, 
                icon: <UsersIcon className="w-5 h-5 sm:w-6 h-6 transition-transform group-hover:scale-110 text-indigo-400" />, 
                label: t('mobileNav.peers') 
            },
            ...(isAiAllowed ? [{ 
                to: ROUTES.TUTOR_IA, 
                icon: <SparklesIcon className="w-5 h-5 sm:w-6 h-6 transition-transform group-hover:scale-110" />, 
                label: t('sidebar.aiTutor') 
            }] : []),
            { 
                to: ROUTES.PROGRESS, 
                icon: <ChartBarIcon className="w-5 h-5 sm:w-6 h-6 transition-transform group-hover:scale-110" />, 
                label: t('mobileNav.progress') 
            },
        ];
    }

    if (isWhiteboardActive) {
        return null;
    }

    return (
        <nav 
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            className={`md:hidden fixed bottom-2 left-1/2 -translate-x-1/2 z-40 max-w-[95vw] sm:max-w-xl md:max-w-2xl w-full transition-all duration-700 ease-in-out ${
                isDimmed 
                    ? 'opacity-25 dark:opacity-30 scale-95 blur-[0.2px]' 
                    : 'opacity-100 scale-100 blur-none'
            }`}
        >
            <div className="bg-slate-900/90 dark:bg-slate-950/90 border border-slate-800/80 shadow-[0_15px_30px_-5px_rgba(0,0,0,0.6)] backdrop-blur-md px-2 sm:px-3 py-1 rounded-2xl flex items-center justify-around gap-1 text-white/70 transition-all duration-300">
                {navItems.map((item) => {
                    const isActive = location.pathname === item.to || (item.to !== ROUTES.DASHBOARD && location.pathname.startsWith(item.to));
                    return (
                        <NavLink
                            key={item.to}
                            to={item.to}
                            className={`relative flex flex-col items-center p-1 sm:p-1.5 rounded-xl transition-all duration-200 group flex-1 min-w-0 max-w-[72px] sm:max-w-none pointer-events-auto ${
                                isActive 
                                    ? 'text-primary bg-primary/10 font-bold scale-105' 
                                    : 'hover:text-white hover:bg-white/5 font-normal'
                            }`}
                        >
                            <div className="relative scale-90 sm:scale-100">
                                {item.icon}
                                {item.to === ROUTES.STUDENT_CHAT && unreadPeerCount > 0 && (
                                    <span className="absolute -top-1.5 -right-1.5 bg-rose-500 text-white text-[8px] font-black rounded-full h-3.5 w-3.5 flex items-center justify-center border border-slate-900 animate-pulse shadow-md">
                                        {unreadPeerCount > 9 ? '9+' : unreadPeerCount}
                                    </span>
                                )}
                                {item.to === ROUTES.CHAT && (
                                    (isTeacher ? unreadConversationsCount : unreadSupportCount) > 0
                                ) && (
                                    <span className="absolute -top-1.5 -right-1.5 bg-emerald-500 text-white text-[8px] font-black rounded-full h-3.5 w-3.5 flex items-center justify-center border border-slate-900 animate-pulse shadow-md">
                                        {isTeacher 
                                            ? (unreadConversationsCount > 9 ? '9+' : unreadConversationsCount)
                                            : (unreadSupportCount > 9 ? '9+' : unreadSupportCount)
                                        }
                                    </span>
                                )}
                                {item.to === ROUTES.ADMIN_CHAT && unreadConversationsCount > 0 && (
                                    <span className="absolute -top-1.5 -right-1.5 bg-emerald-500 text-white text-[8px] font-black rounded-full h-3.5 w-3.5 flex items-center justify-center border border-slate-900 animate-pulse shadow-md">
                                        {unreadConversationsCount > 9 ? '9+' : unreadConversationsCount}
                                    </span>
                                )}
                            </div>
                            <span className="text-[8px] sm:text-[10px] font-semibold mt-0.5 text-center truncate w-full">
                                {item.label}
                            </span>
                        </NavLink>
                    );
                })}
                <button
                    onClick={onMenuClick}
                    aria-label="Abrir menú de navegación"
                    className="relative flex flex-col items-center p-1 sm:p-1.5 rounded-xl transition-all duration-200 group flex-1 min-w-0 max-w-[72px] sm:max-w-none text-white hover:text-white hover:bg-white/5 font-normal pointer-events-auto"
                >
                    <div className="relative scale-90 sm:scale-100">
                        <MenuIcon className="w-5 h-5 sm:w-6 h-6 transition-transform group-hover:scale-110" />
                        {isTeacher && totalTeacherBadge > 0 && (
                            <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[8px] font-black rounded-full h-3.5 w-3.5 flex items-center justify-center border border-slate-900 animate-pulse shadow-md">
                                {totalTeacherBadge > 9 ? '9+' : totalTeacherBadge}
                            </span>
                        )}
                        {!isTeacher && unreadStudentTotal > 0 && (
                            <span className="absolute -top-1.5 -right-1.5 bg-rose-500 text-white text-[8px] font-black rounded-full h-3.5 w-3.5 flex items-center justify-center border border-slate-900 animate-pulse shadow-md">
                                {unreadStudentTotal > 9 ? '9+' : unreadStudentTotal}
                            </span>
                        )}
                    </div>
                    <span className="text-[8px] sm:text-[10px] font-semibold mt-0.5 text-center truncate w-full">{t('mobileNav.menu')}</span>
                </button>
            </div>
        </nav>
    );
});

MobileBottomNav.displayName = 'MobileBottomNav';
