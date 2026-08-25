
import React, { useContext, useState, useRef, useEffect } from 'react';
// FIX: Split react-router-dom imports to resolve export errors.
import { Link, useNavigate } from 'react-router-dom';
import { useIsFetching } from '@tanstack/react-query';
import { AuthContext } from '../contexts/AuthContext';
import { NotificationContext } from '../contexts/NotificationContext';
// FIX: Corrected import path.
import { UserCircleIcon, SearchIcon, ChevronLeftIcon, ChevronRightIcon, LogoutIcon, CogIcon, UserIcon, MenuIcon } from './icons';
// FIX: Corrected import path.
import { ROUTES } from '../constants/routes';
import { SearchModal } from './SearchModal';
import { useI18n } from '../hooks/useI18n';
import { LanguageSwitcher } from './LanguageSwitcher';
import { ThemeToggle } from './ThemeToggle';
import { ThemeContext } from '../contexts/ThemeContext';
import { OFFICIAL_ICON_PATH, handleImageError } from '../constants/branding';

interface HeaderProps {
    toggleSidebar: () => void;
    openSidebar: () => void;
    sidebarState: 'open' | 'collapsed' | 'closed';
}

export const Header: React.FC<HeaderProps> = ({ toggleSidebar, openSidebar, sidebarState }) => {
    const { user, logout } = useContext(AuthContext);
    const { addToast } = useContext(NotificationContext);
    const navigate = useNavigate();
    const [isProfileOpen, setIsProfileOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsProfileOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const { theme } = useContext(ThemeContext);
    const { t } = useI18n();
    const isFetching = useIsFetching({ queryKey: ['userProfile'] });
    const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [submittedQuery, setSubmittedQuery] = useState('');
    
    // Ensure connection mode is set to real by default
    React.useEffect(() => {
        if (typeof window !== 'undefined') {
            localStorage.setItem('connection_mode', 'real');
        }
    }, []);

    // Key combination listener for Ctrl+K or Cmd+K
    React.useEffect(() => {
        const handleGlobalKeyDown = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
                e.preventDefault();
                setSubmittedQuery('');
                setIsSearchModalOpen(true);
            }
        };
        window.addEventListener('keydown', handleGlobalKeyDown);
        return () => window.removeEventListener('keydown', handleGlobalKeyDown);
    }, []);



    const handleSearchSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (searchQuery.trim()) {
            setSubmittedQuery(searchQuery);
            setIsSearchModalOpen(true);
        }
    };
    
    const handleMobileSearchClick = () => {
        setSubmittedQuery('');
        setIsSearchModalOpen(true);
    }

    // Determine the destination based on user role for better UX
    const accountLink = user?.role === 'admin' 
        ? ROUTES.ADMIN_SETTINGS 
        : (user?.role === 'student' || user?.role === 'teacher')
        ? ROUTES.ACCOUNT 
        : '#';
    

    return (
        <>
            <header className="bg-white dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700/80 shadow-sm min-h-[3.5rem] sm:min-h-[4rem] pt-[env(safe-area-inset-top,0px)] py-1 sm:py-2 flex items-center justify-between px-2 sm:px-4 md:px-6 pl-[max(0.5rem,env(safe-area-inset-left))] pr-[max(0.5rem,env(safe-area-inset-right))] w-full max-w-full flex-shrink-0 z-30 sticky top-0 overflow-visible box-border">
                <div className="flex items-center gap-1 sm:gap-2 md:gap-4 flex-shrink-0">
                    {/* Sidebar toggle button (top-left menu button) */}
                    <div className="flex items-center gap-1">
                        {sidebarState === 'collapsed' ? (
                            <>
                                <button
                                    onClick={toggleSidebar}
                                    className="p-1.5 sm:p-2 rounded-full text-slate-800 dark:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary dark:focus:ring-offset-slate-800 cursor-pointer"
                                    aria-label="Cerrar menú lateral"
                                >
                                    <ChevronLeftIcon className="w-5 h-5 sm:w-6 sm:h-6" />
                                </button>
                                <button
                                    onClick={openSidebar}
                                    className="p-1.5 sm:p-2 rounded-full text-slate-800 dark:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary dark:focus:ring-offset-slate-800 cursor-pointer"
                                    aria-label="Abrir menú lateral completamente"
                                >
                                    <ChevronRightIcon className="w-5 h-5 sm:w-6 sm:h-6" />
                                </button>
                            </>
                        ) : (
                            <button
                                onClick={toggleSidebar}
                                className="p-1.5 sm:p-2 rounded-full text-slate-800 dark:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary dark:focus:ring-offset-slate-800 cursor-pointer"
                                aria-label={sidebarState === 'open' ? "Contraer menú lateral" : "Abrir menú lateral"}
                                aria-expanded={sidebarState !== 'closed'}
                            >
                                {sidebarState === 'closed' ? <MenuIcon className="w-5 h-5 sm:w-6 sm:h-6" /> : <ChevronLeftIcon className="w-5 h-5 sm:w-6 sm:h-6" />}
                            </button>
                        )}
                    </div>
                    
                    {/* Logo to anchor brand identity (visible on all screens if sidebar is closed/collapsed) */}
                    <Link to={user?.role === 'admin' ? ROUTES.ADMIN_DASHBOARD : ROUTES.DASHBOARD} aria-label="Ir al inicio de AulaInfinity" className="flex items-center hover:opacity-90 active:scale-95 transition-all flex-shrink-0 min-w-[32px] min-h-[32px]">
                        <div className="bg-white rounded p-1 flex items-center justify-center inline-flex">
                            <img 
                                src={OFFICIAL_ICON_PATH} 
                                alt="AulaInfinity Icon" 
                                width="32"
                                height="32"
                                className="h-8 w-8 sm:h-9 sm:w-9 block object-contain"
                                referrerPolicy="no-referrer"
                                onError={(e) => handleImageError(e, 'icon')}
                            />
                        </div>
                        <span className="ml-2 font-black text-[#0f2a4a] dark:text-white text-sm sm:text-base tracking-tight font-sans hidden sm:inline-block">AulaInfinity</span>
                    </Link>

                    {isFetching > 0 && (
                        <div title={t('header.syncingData')} className="w-3.5 h-3.5 sm:w-5 sm:h-5 border-2 border-primary/50 border-t-primary rounded-full animate-spin flex-shrink-0"></div>
                    )}
                </div>

                <div className="flex items-center gap-1 sm:gap-2 md:gap-3 flex-shrink-0">
                    {user?.role === 'student' && (
                        <>
                            <div 
                                onClick={handleMobileSearchClick}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                        e.preventDefault();
                                        handleMobileSearchClick();
                                    }
                                }}
                                tabIndex={0}
                                role="button"
                                aria-label={t('header.searchPlaceholder')}
                                className="relative hidden md:block group cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary rounded-full"
                            >
                                <div className="w-64 lg:w-96 pl-10 pr-16 py-2 bg-slate-100 dark:bg-slate-700/60 hover:bg-slate-200/50 dark:hover:bg-slate-705 border border-transparent hover:border-slate-300 dark:hover:border-slate-600 rounded-full transition-all text-sm text-slate-400 dark:text-slate-400 select-none flex items-center"
                            >
                                    {t('header.searchPlaceholder')}
                                </div>
                                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-400 group-hover:text-indigo-500 transition-colors">
                                    <SearchIcon className="h-4.5 w-4.5" />
                                </div>
                                <div className="absolute inset-y-0 right-3 flex items-center">
                                    <kbd className="inline-flex items-center text-[10px] font-mono font-bold text-slate-400 dark:text-slate-500 bg-white dark:bg-slate-800 border dark:border-slate-700 px-1.5 py-0.5 rounded shadow-sm">
                                        ⌘K
                                    </kbd>
                                </div>
                            </div>
                            {/* Mobile search button */}
                            <button 
                                onClick={handleMobileSearchClick}
                                className="md:hidden flex items-center justify-center p-1.5 sm:p-2 rounded-full text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 transition-all text-xs select-none"
                                aria-label="Buscar"
                                title="Buscar"
                            >
                                <SearchIcon className="h-5 w-5 text-slate-500 dark:text-slate-400 flex-shrink-0" />
                            </button>
                        </>
                    )}


                    {user?.role === 'student' && (
                        <Link 
                            to={`${ROUTES.PAYMENT}?type=credits`} 
                            className="flex items-center gap-1 px-2 py-1 sm:px-3 sm:py-1.5 rounded-full bg-amber-500/10 hover:bg-amber-500/15 border border-amber-500/20 text-amber-600 dark:text-amber-400 font-extrabold text-xs sm:text-sm hover:scale-105 transition-all shadow-sm flex-shrink-0"
                            title="Tus Infinitys disponibles. Haz clic para ver detalles, historial o comprar más."
                        >
                            <span className="text-xs sm:text-sm">🪙</span>
                            <span className="text-xs sm:text-sm">{(user as any).creditsBalance ?? 0}</span>
                            <span className="text-[10px] uppercase tracking-wide font-black hidden md:inline">Infinitys</span>
                        </Link>
                    )}

                    <ThemeToggle />
                    <LanguageSwitcher />
                    <div className="relative flex items-center" ref={dropdownRef}>
                        {accountLink !== '#' && (
                            <Link 
                                to={accountLink}
                                className="text-slate-800 dark:text-slate-200 font-semibold mr-2 hidden sm:block px-2 py-1 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 hover:text-primary dark:hover:text-indigo-400 transition-colors"
                                title={t('header.myAccount')}
                            >
                                {user && ('name' in user ? user.name : user.username)}
                            </Link>
                        )}
                        <button 
                            onClick={() => setIsProfileOpen(!isProfileOpen)}
                            className="flex items-center p-0.5 sm:p-1 rounded-full hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors cursor-pointer outline-none select-none"
                            aria-expanded={isProfileOpen}
                            aria-label="Menú de usuario"
                        >
                            {accountLink === '#' && (
                                <span className="text-slate-800 dark:text-slate-200 font-semibold mr-2.5 hidden sm:block">
                                    {user && ('name' in user ? user.name : user.username)}
                                </span>
                            )}
                            {user && 'avatar' in user && user.avatar ? (
                                <img src={user.avatar} alt="Avatar" className="w-7 h-7 sm:w-8 sm:h-8 rounded-full object-cover border border-indigo-200/50 dark:border-slate-650" referrerPolicy="no-referrer" />
                            ) : (
                                <UserCircleIcon className="w-7 h-7 sm:w-8 sm:h-8 text-slate-800 dark:text-slate-200" />
                            )}
                        </button>

                        {isProfileOpen && (
                            <div className="absolute right-0 top-full mt-2 w-72 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl py-3 z-50 animate-fade-in text-slate-800 dark:text-slate-200">
                                {/* Header: User info & badge */}
                                <div className="px-4.5 pb-3 border-b border-slate-100 dark:border-slate-700/60">
                                    {accountLink !== '#' ? (
                                        <Link 
                                            to={accountLink}
                                            onClick={() => setIsProfileOpen(false)}
                                            className="text-sm font-black text-slate-900 dark:text-slate-50 truncate hover:text-primary dark:hover:text-indigo-400 block transition-colors"
                                            title={t('header.myAccount')}
                                        >
                                            {user && ('name' in user ? user.name : user.username)}
                                        </Link>
                                    ) : (
                                        <div className="text-sm font-black text-slate-900 dark:text-slate-50 truncate">
                                            {user && ('name' in user ? user.name : user.username)}
                                        </div>
                                    )}
                                    <div className="text-xs text-slate-500 dark:text-slate-400 truncate mb-2">
                                        {user?.email || ''}
                                    </div>
                                    
                                    {/* Role Badge */}
                                    <div className="flex">
                                        {user?.role === 'admin' && (
                                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400">
                                                {t('roles.adminBadge')}
                                            </span>
                                        )}
                                        {user?.role === 'teacher' && (
                                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-purple-500/10 border border-purple-500/20 text-purple-600 dark:text-purple-400">
                                                {t('roles.teacherBadge')}
                                            </span>
                                        )}
                                        {user?.role === 'student' && (
                                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-indigo-500/10 border border-indigo-500/20 text-indigo-600 dark:text-indigo-400">
                                                {t('roles.studentBadge')}
                                            </span>
                                        )}
                                    </div>
                                </div>

                                {/* Menu Items */}
                                <div className="py-1.5 px-2 border-b border-slate-100 dark:border-slate-700/60 space-y-0.5">
                                    {accountLink !== '#' && (
                                        <Link 
                                            to={accountLink} 
                                            onClick={() => setIsProfileOpen(false)}
                                            className="flex items-center gap-2.5 px-3 py-2 text-xs font-bold rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
                                        >
                                            <UserIcon className="w-4 h-4 text-slate-400" />
                                            <span>{t('header.myAccount')}</span>
                                        </Link>
                                    )}
                                    {user?.role === 'admin' && (
                                        <Link 
                                            to={ROUTES.ADMIN_DASHBOARD} 
                                            onClick={() => setIsProfileOpen(false)}
                                            className="flex items-center gap-2.5 px-3 py-2 text-xs font-bold rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
                                        >
                                            <CogIcon className="w-4 h-4 text-slate-400" />
                                            <span>{t('header.controlPanel')}</span>
                                        </Link>
                                    )}
                                </div>

                                {/* Logout Button */}
                                <div className="pt-1.5 px-2">
                                    <button 
                                        onClick={() => {
                                            setIsProfileOpen(false);
                                            logout();
                                            navigate(ROUTES.LOGIN);
                                            addToast(t('header.loggedOut'), 'info');
                                        }}
                                        className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-bold rounded-lg text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/20 transition-colors text-left cursor-pointer"
                                    >
                                        <LogoutIcon className="w-4 h-4" />
                                        <span>{t('sidebar.logout')}</span>
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </header>
            <SearchModal
                isOpen={isSearchModalOpen}
                initialQuery={submittedQuery}
                onClose={() => setIsSearchModalOpen(false)}
            />
        </>
    );
};
