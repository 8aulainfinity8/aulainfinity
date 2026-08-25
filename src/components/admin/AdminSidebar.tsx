import React, { useContext, useState, useMemo } from 'react';
// FIX: Combined and corrected react-router-dom imports.
import { NavLink, useNavigate, useLocation } from 'react-router-dom';

import { AuthContext } from '../../contexts/AuthContext';
import { NewCommentsContext } from '../../contexts/NewCommentsContext';
import { AdminNotificationContext } from '../../contexts/AdminNotificationContext';
import { useAuthorization } from '../../hooks/useAuthorization';
import {
    DashboardIcon,
    UsersIcon,
    FolderOpenIcon,
    ChartBarIcon,
    LightBulbIcon,
    VideoCameraIcon,
    CogIcon,
    LogoutIcon,
    UserCircleIcon,
    WifiIcon,
    ChatBubbleLeftRightIcon,
    CreditCardIcon,
    CalendarIcon
// FIX: Corrected import path.
} from '../icons';
// FIX: Corrected import path.
import { ROUTES } from '../../constants/routes';
import { ConfirmationModal } from '../ConfirmationModal';
import { useI18n } from '../../hooks/useI18n';
import { OFFICIAL_LOGO_PATH, OFFICIAL_ICON_PATH, handleImageError } from '../../constants/branding';

interface AdminSidebarProps {
  sidebarState: 'open' | 'collapsed' | 'closed';
  onItemClick: () => void;
}

const NavItem: React.FC<{ 
    to: string; 
    icon: React.ReactNode; 
    label: string; 
    isSidebarOpen: boolean, 
    badgeCount?: number; 
    customActive?: boolean;
    onItemClick: () => void; 
}> = React.memo(({ to, icon, label, isSidebarOpen, badgeCount, customActive, onItemClick }) => (
    <NavLink
        to={to}
        end
        onClick={() => {
            if (to === ROUTES.ADMIN_CHAT) {
                console.log(`[F110.30] [ADMIN_CHAT_ROUTE_START] | timestamp: ${performance.now()}`);
            }
            onItemClick();
        }}
        aria-label={label}
        className={({ isActive }) => {
            const active = customActive !== undefined ? customActive : isActive;
            return `flex items-center justify-between p-3 my-1 rounded-lg transition-colors duration-200 ${
            active
                ? 'bg-primary text-white shadow-md font-bold'
                : 'text-slate-700 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-slate-100'
            }`;
        }}
    >
        <div className={`flex items-center ${!isSidebarOpen ? 'w-full justify-center' : ''}`}>
            <div className="relative">
                {icon}
                {badgeCount !== undefined && badgeCount > 0 && !isSidebarOpen && (
                    <span className="absolute -top-0.5 -right-0.5 block h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white dark:ring-slate-800"></span>
                )}
            </div>
            <span className={`transition-all duration-200 whitespace-nowrap ${isSidebarOpen ? 'ml-4 opacity-100' : 'ml-0 w-0 opacity-0'}`}>{label}</span>
        </div>
        {badgeCount !== undefined && badgeCount > 0 && isSidebarOpen && (
             <span className="bg-red-500 text-white text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center">
                {badgeCount > 9 ? '9+' : badgeCount}
            </span>
        )}
    </NavLink>
));


export const AdminSidebar: React.FC<AdminSidebarProps> = ({ sidebarState, onItemClick }) => {
  const { logout } = useContext(AuthContext);
  const { isTeacher } = useAuthorization();
  const { t } = useI18n();
  const { newCommentsCount } = useContext(NewCommentsContext);
  const { 
    newUsersCount, 
    newSubscriptionsCount, 
    pendingTopicRequestsCount, 
    pendingTutoringRequestsCount, 
    unreadConversationsCount, 
    newStudentsCount, 
    newTeachersCount,
    acknowledgeNewStudents,
    acknowledgeNewTeachers,
    acknowledgeNewSubscriptions
  } = useContext(AdminNotificationContext);
  const navigate = useNavigate();
  const location = useLocation();
  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);
  const [expandedSections, setExpandedSections] = useState({
      academia: true,
      comunidad: true,
      control: true,
      sistema: false,
  });

  const isStudentsActive = useMemo(() => {
    if (location.pathname !== ROUTES.ADMIN_USERS) return false;
    const params = new URLSearchParams(location.search);
    return params.get('view') !== 'teachers';
  }, [location]);

  const isTeachersActive = useMemo(() => {
    if (location.pathname === ROUTES.ADMIN_TEACHER_APPROVAL) return true;
    if (location.pathname !== ROUTES.ADMIN_USERS) return false;
    const params = new URLSearchParams(location.search);
    return params.get('view') === 'teachers';
  }, [location]);

  const toggleSection = (section: 'academia' | 'comunidad' | 'control' | 'sistema') => {
      setExpandedSections(prev => ({
          ...prev,
          [section]: !prev[section]
      }));
  };

  const badgeCountsByRoute = useMemo(() => ({
      [ROUTES.ADMIN_DASHBOARD]: newSubscriptionsCount,
      [ROUTES.ADMIN_USERS]: newUsersCount,
      [ROUTES.ADMIN_CHAT]: unreadConversationsCount,
      [ROUTES.ADMIN_REQUESTS]: pendingTopicRequestsCount,
      [ROUTES.ADMIN_TUTORING]: pendingTutoringRequestsCount,
      [ROUTES.ADMIN_COMMENTS]: newCommentsCount,
      [ROUTES.ADMIN_SUBSCRIPTION]: newSubscriptionsCount,
  }), [
      newSubscriptionsCount, 
      newUsersCount, 
      unreadConversationsCount, 
      pendingTopicRequestsCount, 
      pendingTutoringRequestsCount, 
      newCommentsCount
  ]);

  const handleLogout = () => {
    logout();
    navigate(ROUTES.LOGIN);
  };

  const isSidebarOpen = sidebarState === 'open';

  const sidebarWidth = {
      open: 'w-64',
      collapsed: 'w-20',
      closed: 'w-64',
  }[sidebarState];

  const transformClass = sidebarState === 'closed' ? '-translate-x-full' : 'translate-x-0';

  return (
    <>
        <aside className={`sidebar-container bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-50 border-r border-gray-200 dark:border-slate-700 shadow-lg flex flex-col fixed h-full z-[100] transition-all duration-300 ${sidebarWidth} ${transformClass} overflow-y-auto pb-28 md:pb-4`}>
            <div className="flex items-center justify-between p-3 border-b border-gray-200 dark:border-slate-700 min-h-[4rem] flex-shrink-0">
                {isSidebarOpen ? (
                    <div className="flex items-center justify-between w-full">
                        <div className="bg-white rounded p-1 flex items-center justify-center inline-flex">
                            <img 
                                src={OFFICIAL_LOGO_PATH} 
                                alt="AulaInfinity" 
                                className="h-9 w-auto object-contain" 
                                referrerPolicy="no-referrer"
                                onError={(e) => handleImageError(e, 'full')}
                            />
                        </div>
                        <span className="text-xs font-semibold px-2 py-0.5 bg-primary/10 text-primary rounded-full uppercase tracking-wider">
                            {isTeacher ? t('roles.teacher') : t('roles.admin')}
                        </span>
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

            <nav className="flex-1 px-3 py-4 space-y-4 overflow-y-auto flex flex-col scrollbar-thin scrollbar-thumb-slate-200">
                {/* General Link */}
                <div className="space-y-1">
                    <NavItem to={ROUTES.ADMIN_DASHBOARD} icon={<DashboardIcon className="w-5 h-5" />} label={t('adminSidebar.mainDashboard')} isSidebarOpen={isSidebarOpen} badgeCount={badgeCountsByRoute[ROUTES.ADMIN_DASHBOARD]} onItemClick={onItemClick} />
                </div>

                {/* Section: Academia */}
                <div className="space-y-1">
                    {isSidebarOpen ? (
                        <button
                            onClick={() => toggleSection('academia')}
                            aria-expanded={expandedSections.academia}
                            aria-label="Sección Academia"
                            className="w-full flex items-center justify-between px-3 py-1.5 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider hover:text-slate-700 dark:hover:text-slate-300 transition-colors duration-200 text-left"
                        >
                            <span>{t('adminSidebar.sectionAcademia')}</span>
                            <span className="text-[8px] opacity-70">
                                {expandedSections.academia ? '▲' : '▼'}
                            </span>
                        </button>
                    ) : (
                        <div className="border-b border-slate-100 dark:border-slate-700/40 my-2" />
                    )}
                    {(!isSidebarOpen || expandedSections.academia) && (
                        <div className="space-y-0.5 transition-all duration-200">
                            <NavItem to={ROUTES.ADMIN_CONTENT} icon={<FolderOpenIcon className="w-5 h-5" />} label={t('adminSidebar.content')} isSidebarOpen={isSidebarOpen} onItemClick={onItemClick} />
                            
                            {isSidebarOpen && (
                                <div className="pl-4 space-y-1 my-1 border-l-2 border-slate-100 dark:border-slate-700/60 ml-5 animate-fade-in">
                                    {!isTeacher && (
                                        <button 
                                            onClick={() => {
                                                onItemClick();
                                                navigate(ROUTES.ADMIN_CONTENT, { state: { openModal: 'add-level' } });
                                            }}
                                            className="flex items-center w-full p-2 text-[11px] font-bold text-slate-650 dark:text-slate-400 hover:text-primary hover:bg-slate-50 dark:hover:bg-slate-750 rounded-md transition-all duration-200"
                                        >
                                            <span className="mr-2 text-xs text-primary">＋</span> {t('adminSidebar.newLevel')}
                                        </button>
                                    )}
                                    <button 
                                        onClick={() => {
                                            onItemClick();
                                            navigate(ROUTES.ADMIN_CONTENT, { state: { openModal: 'add-subject' } });
                                        }}
                                        className="flex items-center w-full p-2 text-[11px] font-bold text-slate-650 dark:text-slate-400 hover:text-primary hover:bg-slate-50 dark:hover:bg-slate-750 rounded-md transition-all duration-200"
                                    >
                                        <span className="mr-2 text-xs text-primary">＋</span> {t('adminSidebar.newSubject')}
                                    </button>
                                    <button 
                                        onClick={() => {
                                            onItemClick();
                                            navigate(ROUTES.ADMIN_CONTENT, { state: { openModal: 'add-video' } });
                                        }}
                                        className="flex items-center w-full p-2 text-[11px] font-bold text-slate-650 dark:text-slate-400 hover:text-primary hover:bg-slate-50 dark:hover:bg-slate-750 rounded-md transition-all duration-200"
                                    >
                                        <span className="mr-2 text-xs text-primary">＋</span> {t('adminSidebar.newLesson')}
                                    </button>
                                    <button 
                                        onClick={() => {
                                            onItemClick();
                                            navigate(ROUTES.ADMIN_CONTENT, { state: { openModal: 'add-block' } });
                                        }}
                                        className="flex items-center w-full p-2 text-[11px] font-bold text-slate-650 dark:text-slate-400 hover:text-primary hover:bg-slate-50 dark:hover:bg-slate-750 rounded-md transition-all duration-200"
                                    >
                                        <span className="mr-2 text-xs text-primary">＋</span> {t('adminSidebar.newBlock')}
                                    </button>
                                </div>
                            )}

                            <NavItem to={ROUTES.ADMIN_PROGRESS} icon={<ChartBarIcon className="w-5 h-5" />} label={t('adminSidebar.studentProgress')} isSidebarOpen={isSidebarOpen} onItemClick={onItemClick} />
                        </div>
                    )}
                </div>

                {/* Section: Comunidad */}
                <div className="space-y-1">
                    {isSidebarOpen ? (
                        <button
                            onClick={() => toggleSection('comunidad')}
                            aria-expanded={expandedSections.comunidad}
                            aria-label="Sección Comunidad"
                            className="w-full flex items-center justify-between px-3 py-1.5 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider hover:text-slate-700 dark:hover:text-slate-300 transition-colors duration-200 text-left"
                        >
                            <span>{t('adminSidebar.sectionCommunity')}</span>
                            <span className="text-[8px] opacity-70">
                                {expandedSections.comunidad ? '▲' : '▼'}
                            </span>
                        </button>
                    ) : (
                        <div className="border-b border-slate-100 dark:border-slate-700/40 my-2" />
                    )}
                    {(!isSidebarOpen || expandedSections.comunidad) && (
                        <div className="space-y-0.5">
                            <NavItem to={ROUTES.ADMIN_CHAT} icon={<ChatBubbleLeftRightIcon className="w-5 h-5" />} label={t('adminSidebar.supportChats')} isSidebarOpen={isSidebarOpen} badgeCount={badgeCountsByRoute[ROUTES.ADMIN_CHAT]} onItemClick={onItemClick} />
                            <NavItem to={ROUTES.ADMIN_AGENDA} icon={<CalendarIcon className="w-5 h-5 text-indigo-500 dark:text-indigo-400" />} label={t('adminSidebar.generalAgenda')} isSidebarOpen={isSidebarOpen} onItemClick={onItemClick} />
                            <NavItem to={ROUTES.ADMIN_TUTORING} icon={<VideoCameraIcon className="w-5 h-5" />} label={t('adminSidebar.tutoring1on1')} isSidebarOpen={isSidebarOpen} badgeCount={badgeCountsByRoute[ROUTES.ADMIN_TUTORING]} onItemClick={onItemClick} />
                            <NavItem to={ROUTES.ADMIN_REQUESTS} icon={<LightBulbIcon className="w-5 h-5" />} label={t('adminSidebar.topicSuggestions')} isSidebarOpen={isSidebarOpen} badgeCount={badgeCountsByRoute[ROUTES.ADMIN_REQUESTS]} onItemClick={onItemClick} />
                            <NavItem to={ROUTES.ADMIN_COMMENTS} icon={<ChatBubbleLeftRightIcon className="w-5 h-5" />} label={t('adminSidebar.topicComments')} isSidebarOpen={isSidebarOpen} badgeCount={badgeCountsByRoute[ROUTES.ADMIN_COMMENTS]} onItemClick={onItemClick} />
                        </div>
                    )}
                </div>

                {/* Section: Control de Accesos */}
                {!isTeacher && (
                    <div className="space-y-1">
                        {isSidebarOpen ? (
                            <button
                                onClick={() => toggleSection('control')}
                                aria-expanded={expandedSections.control}
                                aria-label="Sección Control y Personal"
                                className="w-full flex items-center justify-between px-3 py-1.5 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider hover:text-slate-700 dark:hover:text-slate-300 transition-colors duration-200 text-left"
                            >
                                <span>{t('adminSidebar.sectionControl')}</span>
                                <span className="text-[8px] opacity-70">
                                    {expandedSections.control ? '▲' : '▼'}
                                </span>
                            </button>
                        ) : (
                            <div className="border-b border-slate-100 dark:border-slate-700/40 my-2" />
                        )}
                        {(!isSidebarOpen || expandedSections.control) && (
                            <div className="space-y-0.5">
                                <NavItem to={`${ROUTES.ADMIN_USERS}?view=students`} icon={<UsersIcon className="w-5 h-5" />} label={t('adminSidebar.studentManagement')} isSidebarOpen={isSidebarOpen} badgeCount={newStudentsCount} customActive={isStudentsActive} onItemClick={() => {
                                    acknowledgeNewStudents();
                                    onItemClick();
                                }} />
                                <NavItem to={`${ROUTES.ADMIN_USERS}?view=teachers`} icon={<UserCircleIcon className="w-5 h-5" />} label={t('adminSidebar.teacherManagement')} isSidebarOpen={isSidebarOpen} badgeCount={newTeachersCount} customActive={isTeachersActive} onItemClick={() => {
                                    acknowledgeNewTeachers();
                                    onItemClick();
                                }} />
                                <NavItem to={ROUTES.ADMIN_SUBSCRIPTION} icon={<CreditCardIcon className="w-5 h-5" />} label={t('adminSidebar.plansFinances')} isSidebarOpen={isSidebarOpen} badgeCount={badgeCountsByRoute[ROUTES.ADMIN_SUBSCRIPTION]} onItemClick={() => {
                                    acknowledgeNewSubscriptions();
                                    onItemClick();
                                }} />
                            </div>
                        )}
                    </div>
                )}

                {/* Section: Configuración */}
                {!isTeacher && (
                    <div className="space-y-1">
                        {isSidebarOpen ? (
                            <button
                                onClick={() => toggleSection('sistema')}
                                aria-expanded={expandedSections.sistema}
                                aria-label="Sección Sistema"
                                className="w-full flex items-center justify-between px-3 py-1.5 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider hover:text-slate-700 dark:hover:text-slate-300 transition-colors duration-200 text-left"
                            >
                                <span>{t('adminSidebar.sectionSystem')}</span>
                                <span className="text-[8px] opacity-70">
                                    {expandedSections.sistema ? '▲' : '▼'}
                                </span>
                            </button>
                        ) : (
                            <div className="border-b border-slate-100 dark:border-slate-700/40 my-2" />
                        )}
                        {(!isSidebarOpen || expandedSections.sistema) && (
                            <div className="space-y-0.5">
                                <NavItem to={ROUTES.ADMIN_SETTINGS} icon={<CogIcon className="w-5 h-5" />} label={t('adminSidebar.generalSettings')} isSidebarOpen={isSidebarOpen} onItemClick={onItemClick} />
                                <NavItem to={ROUTES.ADMIN_CONNECTION} icon={<WifiIcon className="w-5 h-5" />} label={t('adminSidebar.serverApi')} isSidebarOpen={isSidebarOpen} onItemClick={onItemClick} />
                            </div>
                        )}
                    </div>
                )}
            
                <div className="mt-auto pt-4 border-t border-gray-200 dark:border-slate-700">
                 <button
                    onClick={() => {
                        onItemClick();
                        setIsLogoutModalOpen(true);
                    }}
                    aria-label={t('sidebar.logout') || 'Cerrar sesión'}
                    className={`flex items-center p-3 w-full rounded-lg transition-colors duration-200 text-slate-700 dark:text-slate-300 hover:bg-red-100 dark:hover:bg-red-900/50 hover:text-red-700 dark:hover:text-red-300 ${!isSidebarOpen ? 'justify-center' : ''}`}
                >
                    <LogoutIcon className="w-6 h-6" />
                    <span className={`transition-all duration-200 whitespace-nowrap ${isSidebarOpen ? 'ml-4 opacity-100' : 'ml-0 w-0 opacity-0'}`}>{t('sidebar.logout')}</span>
                </button>
            </div>
            </nav>
        </aside>
        <ConfirmationModal
            isOpen={isLogoutModalOpen}
            onClose={() => setIsLogoutModalOpen(false)}
            onConfirm={handleLogout}
            title={t('adminSidebar.confirmLogoutTitle')}
            description={t('adminSidebar.confirmLogoutDesc')}
            confirmText={t('sidebar.logout')}
            isDestructive
        />
    </>
  );
};