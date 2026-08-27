import React, { useState } from 'react';
import { UserCircle, MessageSquare, HelpCircle, Headphones, GraduationCap, Users } from 'lucide-react';
import type { Conversation } from '../../types';
import { useI18n } from '../../hooks/useI18n';
import { getDirectChatId, resolveUserUid } from '../../utils/chatUtils';

export interface ActiveChannel {
    type: 'support' | 'teacher';
    teacher?: any;
    convoId?: string;
}

interface ChatListProps {
    conversations: Conversation[];
    teachers: any[];
    activeChannel: ActiveChannel;
    onSelectChannel: (channel: ActiveChannel) => void;
    showOnMobile: boolean;
    studentId: string;
}

export const ChatList: React.FC<ChatListProps> = ({ conversations, teachers, activeChannel, onSelectChannel, showOnMobile, studentId }) => {
    const { t } = useI18n();
    const [filterTab, setFilterTab] = useState<'all' | 'teachers' | 'support'>('all');

    const unreadSupport = conversations?.some(c => (c.type === 'support' || c.id.startsWith('support_')) && c.unreadByStudent) || false;

    const unreadTeachersCount = (teachers || []).filter((t: any) => {
        const teacherUid = resolveUserUid(t);
        const canonicalConvoId = getDirectChatId(studentId, teacherUid);
        const legacyConvoId = `${studentId}_${t.id}`;
        return conversations?.some(c => (c.id === canonicalConvoId || c.id === legacyConvoId || c.teacherId === teacherUid) && c.unreadByStudent);
    }).length;

    const extraDirectConvos = (conversations || []).filter(c => {
        if (c.type !== 'direct' && !c.id.startsWith('direct_')) return false;
        const matchedByTeacherList = (teachers || []).some(t => {
            const tUid = resolveUserUid(t);
            return c.id === getDirectChatId(studentId, tUid) || c.id === `${studentId}_${t.id}` || c.teacherId === tUid;
        });
        return !matchedByTeacherList;
    });

    const supportConvos = (conversations || []).filter(c => c.type === 'support' || c.id.startsWith('support_'));

    return (
        <div className={`w-full md:w-1/3 max-w-[360px] border-r dark:border-slate-700 bg-white dark:bg-slate-800 flex-col flex-shrink-0 min-w-0 overflow-hidden ${showOnMobile ? 'flex' : 'hidden md:flex'}`}>
            <div className="p-4 border-b dark:border-slate-700 font-sans">
                <h2 className="text-lg font-extrabold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                    <MessageSquare className="w-5 h-5 text-indigo-500 dark:text-indigo-400" />
                    <span>{t('chat.title')}</span>
                </h2>
                <p className="text-xs text-slate-500 mt-1 dark:text-slate-400">{t('chat.subtitle')}</p>

                {/* Filter Tabs */}
                <div className="flex gap-1 mt-3 p-1 bg-slate-100 dark:bg-slate-700/50 rounded-xl overflow-x-auto scrollbar-none">
                    <button
                        onClick={() => setFilterTab('all')}
                        className={`flex-1 py-1.5 px-2 text-[11px] font-bold rounded-lg transition-all cursor-pointer whitespace-nowrap ${
                            filterTab === 'all'
                                ? 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 shadow-sm'
                                : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                        }`}
                    >
                        Todos
                    </button>
                    <button
                        onClick={() => setFilterTab('teachers')}
                        className={`flex-1 py-1.5 px-2 text-[11px] font-bold rounded-lg transition-all cursor-pointer whitespace-nowrap flex items-center justify-center gap-1 ${
                            filterTab === 'teachers'
                                ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-sm'
                                : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                        }`}
                    >
                        <span>Profesores</span>
                        {(unreadTeachersCount > 0 || extraDirectConvos.some(c => c.unreadByStudent)) && (
                             <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse"></span>
                        )}
                    </button>
                    <button
                        onClick={() => setFilterTab('support')}
                        className={`flex-1 py-1.5 px-2 text-[11px] font-bold rounded-lg transition-all cursor-pointer whitespace-nowrap flex items-center justify-center gap-1 ${
                            filterTab === 'support'
                                ? 'bg-white dark:bg-slate-800 text-amber-600 dark:text-amber-400 shadow-sm'
                                : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                        }`}
                    >
                        <span>Soporte</span>
                        {unreadSupport && (
                            <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
                        )}
                    </button>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-2 font-sans space-y-4">
                {/* 1. CHAT PROFESORES (ENLACE ALUMNO-PROFESOR / POR ALUMNOS) */}
                {(filterTab === 'all' || filterTab === 'teachers') && (
                    <div>
                        <div className="px-3 py-1.5 text-[11px] font-extrabold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider flex items-center justify-between">
                            <span className="flex items-center gap-1.5">
                                <GraduationCap className="w-3.5 h-3.5" />
                                Chat Profesores (Directo 1 a 1)
                            </span>
                            <span className="text-[10px] bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 px-1.5 py-0.5 rounded-md font-bold">
                                {(teachers?.length || 0) + extraDirectConvos.length}
                            </span>
                        </div>

                        <div className="space-y-1 mt-1">
                            {teachers && teachers.length > 0 ? (
                                teachers.map((t: any) => {
                                    const teacherUid = resolveUserUid(t);
                                    const canonicalConvoId = getDirectChatId(studentId, teacherUid);
                                    const legacyConvoId = `${studentId}_${t.id}`;
                                    const convo = conversations?.find(c => c.id === canonicalConvoId || c.id === legacyConvoId || c.teacherId === teacherUid);
                                    const unread = convo?.unreadByStudent || conversations?.some(c => (c.id === canonicalConvoId || c.id === legacyConvoId) && c.unreadByStudent) || false;
                                    const isSelected = activeChannel.type === 'teacher' && (
                                        activeChannel.convoId ? activeChannel.convoId === (convo?.id || canonicalConvoId) : resolveUserUid(activeChannel.teacher) === teacherUid
                                    );

                                    return (
                                        <button
                                            key={t.id}
                                            onClick={() => onSelectChannel({ type: 'teacher', teacher: t, convoId: convo?.id || canonicalConvoId })}
                                            className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all cursor-pointer border ${
                                                isSelected 
                                                    ? 'bg-indigo-50 dark:bg-indigo-950/40 border-indigo-300 dark:border-indigo-700 text-indigo-900 dark:text-indigo-100 shadow-sm' 
                                                    : 'border-transparent hover:bg-slate-50 dark:hover:bg-slate-700/50 text-slate-700 dark:text-slate-300'
                                            }`}
                                        >
                                            <div className="relative shrink-0">
                                                {t.profileImage ? (
                                                    <img src={t.profileImage} alt={t.name} className="w-10 h-10 rounded-full object-cover border-2 border-white dark:border-slate-800 shadow-sm" />
                                                ) : (
                                                    <div className="w-10 h-10 rounded-full bg-indigo-100 dark:bg-indigo-900/60 text-indigo-600 dark:text-indigo-300 flex items-center justify-center font-bold text-sm">
                                                        {t.name?.[0] || 'P'}
                                                    </div>
                                                )}
                                                {unread && (
                                                    <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 bg-rose-500 border-2 border-white dark:border-slate-800 rounded-full animate-bounce"></span>
                                                )}
                                            </div>
                                            <div className="text-left flex-1 min-w-0">
                                                <div className="flex items-center justify-between gap-1">
                                                    <p className="font-extrabold truncate text-xs sm:text-sm">Prof. {t.name}</p>
                                                    <span className="text-[9px] font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-100/80 dark:bg-indigo-900/40 px-1.5 py-0.5 rounded">
                                                        1:1
                                                    </span>
                                                </div>
                                                <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                                                    {convo?.lastMessageText || t.category || 'Chat directo alumno-profesor'}
                                                </p>
                                            </div>
                                        </button>
                                    );
                                })
                            ) : null}

                            {extraDirectConvos.map(c => {
                                const isSelected = activeChannel.type === 'teacher' && activeChannel.convoId === c.id;
                                const unread = c.unreadByStudent;
                                const name = c.teacherName || 'Administrador / Docente';

                                return (
                                    <button
                                        key={c.id}
                                        onClick={() => onSelectChannel({ type: 'teacher', teacher: { id: c.teacherId || 'admin', name }, convoId: c.id })}
                                        className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all cursor-pointer border ${
                                            isSelected 
                                                ? 'bg-indigo-50 dark:bg-indigo-950/40 border-indigo-300 dark:border-indigo-700 text-indigo-900 dark:text-indigo-100 shadow-sm' 
                                                : 'border-transparent hover:bg-slate-50 dark:hover:bg-slate-700/50 text-slate-700 dark:text-slate-300'
                                        }`}
                                    >
                                        <div className="relative shrink-0">
                                            <div className="w-10 h-10 rounded-full bg-indigo-100 dark:bg-indigo-900/60 text-indigo-600 dark:text-indigo-300 flex items-center justify-center font-bold text-sm">
                                                {name[0] || 'A'}
                                            </div>
                                            {unread && (
                                                <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 bg-rose-500 border-2 border-white dark:border-slate-800 rounded-full animate-bounce"></span>
                                            )}
                                        </div>
                                        <div className="text-left flex-1 min-w-0">
                                            <div className="flex items-center justify-between gap-1">
                                                <p className="font-extrabold truncate text-xs sm:text-sm">{name}</p>
                                                <span className="text-[9px] font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-100/80 dark:bg-indigo-900/40 px-1.5 py-0.5 rounded">
                                                    Directo
                                                </span>
                                            </div>
                                            <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                                                {c.lastMessageText || 'Mensaje directo'}
                                            </p>
                                        </div>
                                    </button>
                                );
                            })}

                            {(!teachers || teachers.length === 0) && extraDirectConvos.length === 0 && (
                                <div className="p-3 text-center text-xs text-slate-400 italic">
                                    No hay profesores disponibles actualmente.
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* 3. CANAL DE ASISTENCIA Y SOPORTE TÉCNICO */}
                {(filterTab === 'all' || filterTab === 'support') && (
                    <div className={filterTab === 'all' ? 'pt-2 border-t dark:border-slate-700' : ''}>
                        <div className="px-3 py-1.5 text-[11px] font-extrabold text-amber-600 dark:text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                            <Headphones className="w-3.5 h-3.5" />
                            Canal de Asistencia y Soporte
                        </div>
                        <div className="mt-1 space-y-1">
                            {supportConvos.length > 0 ? (
                                supportConvos.map(c => {
                                    const isSelected = activeChannel.type === 'support' && (
                                        activeChannel.convoId ? activeChannel.convoId === c.id : true
                                    );
                                    const unread = c.unreadByStudent;

                                    return (
                                        <button
                                            key={c.id}
                                            onClick={() => onSelectChannel({ type: 'support', convoId: c.id })}
                                            className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all cursor-pointer border ${
                                                isSelected 
                                                    ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-700 text-amber-900 dark:text-amber-100 shadow-sm' 
                                                    : 'border-transparent hover:bg-slate-50 dark:hover:bg-slate-700/50 text-slate-700 dark:text-slate-300'
                                            }`}
                                        >
                                            <div className="relative shrink-0">
                                                <div className="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900/60 text-amber-600 dark:text-amber-300 flex items-center justify-center font-bold">
                                                    <Headphones className="w-5 h-5" />
                                                </div>
                                                {unread && (
                                                    <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 bg-rose-500 border-2 border-white dark:border-slate-800 rounded-full animate-bounce"></span>
                                                )}
                                            </div>
                                            <div className="text-left flex-1 min-w-0">
                                                <div className="flex items-center justify-between gap-1">
                                                    <p className="font-extrabold truncate text-xs sm:text-sm">Soporte Técnico</p>
                                                    <span className="text-[9px] font-bold text-amber-600 dark:text-amber-400 bg-amber-100/80 dark:bg-indigo-900/40 px-1.5 py-0.5 rounded">
                                                        Ayuda
                                                    </span>
                                                </div>
                                                <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                                                    {c.lastMessageText || 'Plataforma, accesos y ayuda administrativa'}
                                                </p>
                                            </div>
                                        </button>
                                    );
                                })
                            ) : (
                                <button
                                    onClick={() => onSelectChannel({ type: 'support', convoId: `support_${studentId}` })}
                                    className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all cursor-pointer border ${
                                        activeChannel.type === 'support' 
                                            ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-700 text-amber-900 dark:text-amber-100 shadow-sm' 
                                            : 'border-transparent hover:bg-slate-50 dark:hover:bg-slate-700/50 text-slate-700 dark:text-slate-300'
                                    }`}
                                >
                                    <div className="relative shrink-0">
                                        <div className="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900/60 text-amber-600 dark:text-amber-300 flex items-center justify-center font-bold">
                                            <Headphones className="w-5 h-5" />
                                        </div>
                                        {unreadSupport && (
                                            <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 bg-rose-500 border-2 border-white dark:border-slate-800 rounded-full animate-bounce"></span>
                                        )}
                                    </div>
                                    <div className="text-left flex-1 min-w-0">
                                        <div className="flex items-center justify-between gap-1">
                                            <p className="font-extrabold truncate text-xs sm:text-sm">Soporte Técnico</p>
                                            <span className="text-[9px] font-bold text-amber-600 dark:text-amber-400 bg-amber-100/80 dark:bg-indigo-900/40 px-1.5 py-0.5 rounded">
                                                Ayuda
                                            </span>
                                        </div>
                                        <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                                            Plataforma, accesos y ayuda administrativa
                                        </p>
                                    </div>
                                </button>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};


