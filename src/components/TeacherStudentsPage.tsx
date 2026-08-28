import React, { useContext, useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AuthContext } from '../contexts/AuthContext';
import { useI18n } from '../hooks/useI18n';
import { ROUTES } from '../constants/routes';
import * as api from '../services/api';
import { auth } from '../services/firebase';
import type { StudentUser, CourseLevel } from '../types';
import { getDirectChatId, resolveUserUid } from '../utils/chatUtils';
import { motion, AnimatePresence } from 'motion/react';
import {
  Users,
  Search,
  Filter,
  CheckCircle,
  MessageSquare,
  Award,
  AlertCircle,
  Trash2,
  UserPlus,
  ChevronRight,
  Info,
  X,
  ExternalLink,
  ShieldCheck,
  Video,
  Sparkles,
  Plus,
  Minus,
  FileText,
  Clock,
  Phone,
  Mail,
  Sliders
} from 'lucide-react';
import { Card, CardTitle, CardDescription, Badge, Button, EmptyState, Skeleton } from './ui';

export const TeacherStudentsPage: React.FC = () => {
  const { t } = useI18n();
  const { user } = useContext(AuthContext);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: appConfig } = useQuery({
    queryKey: ['appConfig'],
    queryFn: api.fetchAppConfig,
    enabled: !!user && !!user.id && user.id === auth?.currentUser?.uid,
  });

  const aiEnabledGlobally = appConfig?.aiEnabled !== false;
  const videosEnabledGlobally = appConfig?.videosEnabled !== false;

  // Guard: if not teacher or admin, redirect or show error
  const isAdmin = user?.role === 'admin';
  const isTeacher = user?.role === 'teacher';
  const hasAccess = isTeacher || isAdmin;
  const isApprovedTeacher = isTeacher ? (user as any).isApprovedForTutoring !== false : true;
  const isPermittedToInteract = isAdmin || isApprovedTeacher;
  const teacherId = user?.id || '';

  // Local States
  const [activeTab, setActiveTab] = useState<'my-students' | 'all-students'>('my-students');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLevel, setSelectedLevel] = useState<string>('all');
  const [selectedStudent, setSelectedStudent] = useState<StudentUser | null>(null);

  // States for student edits in details drawer/modal
  const [notesText, setNotesText] = useState('');
  const [creditsVal, setCreditsVal] = useState<number>(0);
  const [aiEnabled, setAiEnabled] = useState(true);
  const [videosEnabled, setVideosEnabled] = useState(true);

  // Success / Error Feedback Banner State
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Queries
  const { data: students = [], isLoading: isLoadingStudents, refetch: refetchStudents } = useQuery<StudentUser[]>({
    queryKey: ['users'],
    queryFn: api.fetchUsers,
    enabled: !!user && !!user.id && user.id === auth?.currentUser?.uid && user.role === 'teacher' && hasAccess,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const { data: courseLevels = [] } = useQuery<CourseLevel[]>({
    queryKey: ['course-levels'],
    queryFn: api.fetchCourses,
    enabled: !!user && !!user.id && user.id === auth?.currentUser?.uid && hasAccess,
  });

  // Automatically show selected student details when user update happens or selected student changes
  useEffect(() => {
    if (selectedStudent) {
      // Find fresh copy in query list
      const freshStudent = students.find(s => s.id === selectedStudent.id);
      if (freshStudent) {
        setNotesText(freshStudent.adminNotes || '');
        setCreditsVal(freshStudent.creditsBalance || 0);
        setAiEnabled(freshStudent.aiEnabled !== false);
        setVideosEnabled(freshStudent.videosEnabled !== false);
      }
    }
  }, [selectedStudent, students]);

  // Show a brief feedback message
  const triggerFeedback = (type: 'success' | 'error', message: string) => {
    setFeedback({ type, message });
    setTimeout(() => {
      setFeedback(null);
    }, 4000);
  };

  // Mutaciones
  const assignMutation = useMutation({
    mutationFn: async ({ studentId, teachId }: { studentId: string; teachId: string | null }) => {
      return api.assignStudentTeacher(studentId, teachId);
    },
    onSuccess: (data, variables) => {
      queryClient.setQueryData<StudentUser[]>(['students-list'], (old = []) => {
        return old.map(s => {
          if (s.id === data.id || s.id === variables.studentId) {
            return {
              ...s,
              assignedTeacherId: variables.teachId || undefined,
              assignedTeacherName: variables.teachId ? data.assignedTeacherName : undefined,
            };
          }
          return s;
        });
      });
      queryClient.setQueryData<any[]>(['conversations'], (old = []) => {
        return old.map(c => {
          if (c.id === variables.studentId || c.studentId === variables.studentId) {
            return {
              ...c,
              teacherId: variables.teachId || null,
              teacherName: variables.teachId ? c.teacherName : null,
            };
          }
          return c;
        });
      });
      queryClient.invalidateQueries({ queryKey: ['students-list'] });
      if (user?.id) queryClient.invalidateQueries({ queryKey: ['conversations', user.id] });
      triggerFeedback('success', variables.teachId ? `Has añadido a ${data.name} a tu lista de alumnos.` : `Has desvinculado a ${data.name} de tu lista.`);
    },
    onError: () => {
      triggerFeedback('error', 'Error al actualizar la asignación del alumno.');
    }
  });

  const permissionsMutation = useMutation({
    mutationFn: async ({ studentId, ai, video }: { studentId: string; ai: boolean; video: boolean }) => {
      return api.updateUserPermissions(studentId, 'student', { aiEnabled: ai, videosEnabled: video });
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['students-list'] });
      triggerFeedback('success', `Permisos de ${data.name} actualizados correctamente.`);
    },
    onError: () => {
      triggerFeedback('error', 'Error al guardar los permisos.');
    }
  });

  const notesMutation = useMutation({
    mutationFn: async ({ studentId, notes }: { studentId: string; notes: string }) => {
      return api.updateStudentNotes(studentId, notes);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['students-list'] });
      triggerFeedback('success', 'Observaciones guardadas con éxito.');
    },
    onError: () => {
      triggerFeedback('error', 'Error al guardar las observaciones.');
    }
  });

  const creditsMutation = useMutation({
    mutationFn: async ({ studentId, credits }: { studentId: string; credits: number }) => {
      return api.updateStudentCredits(studentId, credits);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['students-list'] });
      triggerFeedback('success', `Saldo de créditos actualizado a ${data.creditsBalance ?? 0} Infinitys.`);
    },
    onError: () => {
      triggerFeedback('error', 'Error al modificar los créditos.');
    }
  });

  // Helper variables for assign action feedback
  const [teachIdState, setTeachIdState] = useState<boolean>(true);

  // Actions handlers
  const handleAssignToMe = (studentId: string) => {
    if (!isPermittedToInteract) {
      triggerFeedback('error', 'Tu cuenta no tiene luz verde de administración para interactuar.');
      return;
    }
    setTeachIdState(true);
    assignMutation.mutate({ studentId, teachId: teacherId });
  };

  const handleUnassign = (studentId: string) => {
    if (!isPermittedToInteract) {
      triggerFeedback('error', 'Tu cuenta no tiene luz verde de administración para interactuar.');
      return;
    }
    setTeachIdState(false);
    assignMutation.mutate({ studentId, teachId: null });
    if (selectedStudent?.id === studentId) {
      setSelectedStudent(null);
    }
  };

  const handleSaveNotes = () => {
    if (!selectedStudent) return;
    if (!isPermittedToInteract) {
      triggerFeedback('error', 'Tu cuenta no tiene luz verde de administración para interactuar.');
      return;
    }
    notesMutation.mutate({ studentId: selectedStudent.id, notes: notesText });
  };

  const handleSavePermissions = (newAi: boolean, newVideo: boolean) => {
    if (!selectedStudent || !isAdmin) return;
    setAiEnabled(newAi);
    setVideosEnabled(newVideo);
    permissionsMutation.mutate({ studentId: selectedStudent.id, ai: newAi, video: newVideo });
  };

  const handleUpdateCredits = (newVal: number) => {
    if (!selectedStudent || !isAdmin) return;
    const bounded = Math.max(0, newVal);
    setCreditsVal(bounded);
    creditsMutation.mutate({ studentId: selectedStudent.id, credits: bounded });
  };

  // Filter students
  const filteredStudents = useMemo(() => {
    return students.filter(student => {
      // Role filter (double check, all should be students anyway)
      if (student.role !== 'student') return false;

      // Tab filter
      if (activeTab === 'my-students' && student.assignedTeacherId !== teacherId) return false;

      // Level filter
      if (selectedLevel !== 'all' && !student.enrolledCourseIds?.includes(selectedLevel)) return false;

      // Search query
      if (searchQuery.trim() !== '') {
        const query = searchQuery.toLowerCase();
        const matchesName = student.name.toLowerCase().includes(query);
        const matchesEmail = student.email.toLowerCase().includes(query);
        const matchesPhone = student.phone?.toLowerCase().includes(query);
        return matchesName || matchesEmail || matchesPhone;
      }

      return true;
    });
  }, [students, activeTab, selectedLevel, searchQuery, teacherId]);

  if (!hasAccess) {
    return (
      <div className="p-8 max-w-4xl mx-auto text-center" id="teacher-students-forbidden">
        <div className="bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-400 p-6 rounded-2xl border border-red-200 dark:border-red-900 shadow-sm">
          <AlertCircle className="w-12 h-12 mx-auto mb-4" />
          <h2 className="text-xl font-bold mb-2">Acceso Restringido</h2>
          <p className="text-sm">Esta sección está disponible únicamente para profesores o administradores autorizados de AulaInfinity.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto" id="teacher-students-management-dashboard">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-3">
            <Users className="w-8 h-8 text-primary" />
            {t('teacherStudents.title')}
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-450 mt-1.5">
            {t('teacherStudents.subtitle')}
          </p>
        </div>

        {/* Quick Tabs */}
        <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl self-start md:self-center">
          <button
            onClick={() => { setActiveTab('my-students'); setSelectedStudent(null); }}
            className={`px-4 py-2 text-xs font-bold rounded-lg transition-all ${
              activeTab === 'my-students'
                ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-800'
            }`}
          >
            Mis Alumnos ({students.filter(s => s.assignedTeacherId === teacherId).length})
          </button>
          <button
            onClick={() => { setActiveTab('all-students'); setSelectedStudent(null); }}
            className={`px-4 py-2 text-xs font-bold rounded-lg transition-all ${
              activeTab === 'all-students'
                ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-800'
            }`}
          >
            Buscar Alumnos ({students.length})
          </button>
        </div>
      </div>

      {/* Floating feedback alert */}
      <AnimatePresence>
        {feedback && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            className={`fixed top-6 right-6 z-50 flex items-center gap-3 px-5 py-4 rounded-xl shadow-lg border text-sm max-w-md ${
              feedback.type === 'success'
                ? 'bg-emerald-50 dark:bg-emerald-950/90 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                : 'bg-red-50 dark:bg-red-950/90 text-red-800 dark:text-red-300 border-red-200 dark:border-red-800'
            }`}
          >
            {feedback.type === 'success' ? (
              <CheckCircle className="w-5 h-5 text-emerald-500 flex-shrink-0" />
            ) : (
              <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
            )}
            <span className="font-medium">{feedback.message}</span>
            <button aria-label="Cerrar mensaje" onClick={() => setFeedback(null)} className="ml-auto text-slate-400 hover:text-slate-600 cursor-pointer">
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Unapproved Teacher Alert Banner */}
      {!isPermittedToInteract && (
        <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/60 rounded-2xl p-5 mb-8 flex items-start gap-4 animate-fade-in" id="teacher-unapproved-warning-banner">
          <Clock className="w-6 h-6 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0 animate-pulse" />
          <div className="space-y-1">
            <h4 className="font-extrabold text-amber-800 dark:text-amber-400 text-sm">
              Acceso de Interacción Restringido — Pendiente de Luz Verde
            </h4>
            <p className="text-xs text-amber-700/90 dark:text-amber-300/85 leading-relaxed">
              Tu cuenta de profesor aún no ha sido activada ("luz verde") por la administración. Puedes navegar y visualizar las fichas de los alumnos, pero las opciones para elegir nuevos alumnos, desvincularlos o añadir observaciones académicas están temporalmente desactivadas.
            </p>
          </div>
        </div>
      )}

      {/* Main Content Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Side: Students List */}
        <div className={`lg:col-span-7 space-y-6 ${selectedStudent ? 'hidden lg:block' : 'block'}`}>
          {/* Filter Bar */}
          <div className="bg-white dark:bg-slate-850 p-4 rounded-2xl border border-slate-150 dark:border-slate-800 shadow-sm flex flex-col sm:flex-row gap-3">
            {/* Search Input */}
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar alumno por nombre, email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
              {searchQuery && (
                <button
                  aria-label="Limpiar búsqueda"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Level Filter */}
            <div className="relative min-w-[160px]">
              <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <select
                value={selectedLevel}
                onChange={(e) => setSelectedLevel(e.target.value)}
                className="w-full pl-9 pr-8 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-primary/20 appearance-none"
              >
                <option value="all">Todos los Cursos</option>
                {courseLevels.map((lvl) => (
                  <option key={lvl.id} value={lvl.id}>
                    {lvl.name}
                  </option>
                ))}
              </select>
              <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                <ChevronRight className="w-4 h-4 rotate-90" />
              </div>
            </div>
          </div>

          {/* Students Grid/List */}
          {isLoadingStudents ? (
            <div className="flex flex-col items-center justify-center py-20 bg-white dark:bg-slate-850 border border-slate-150 dark:border-slate-800 rounded-2xl">
              <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin mb-4"></div>
              <p className="text-sm text-slate-500">Cargando base de datos de alumnos...</p>
            </div>
          ) : filteredStudents.length === 0 ? (
            <div className="text-center py-16 bg-white dark:bg-slate-850 border border-slate-150 dark:border-slate-800 rounded-2xl">
              <Users className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <h3 className="text-base font-bold text-slate-800 dark:text-slate-200">No se encontraron alumnos</h3>
              <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                {activeTab === 'my-students'
                  ? 'Todavía no has elegido ningún alumno para dar tutoría. ¡Haz clic en "Buscar Alumnos" para añadir algunos!'
                  : 'Prueba a cambiar los filtros de búsqueda o el curso escolar.'}
              </p>
            </div>
          ) : (
            <div className="space-y-3.5">
              {filteredStudents.map((student) => {
                const isSelected = selectedStudent?.id === student.id;
                const isMyStudent = student.assignedTeacherId === teacherId;
                const hasOtherTeacher = student.assignedTeacherId && student.assignedTeacherId !== teacherId;
                
                // Get level names
                const enrolledLevelNames = courseLevels
                  .filter(l => student.enrolledCourseIds?.includes(l.id))
                  .map(l => l.name)
                  .join(', ') || 'Sin curso';

                return (
                  <div
                    key={student.id}
                    onClick={() => setSelectedStudent(student)}
                    className={`p-4 rounded-2xl border cursor-pointer transition-all ${
                      isSelected
                        ? 'bg-indigo-50/50 dark:bg-indigo-950/20 border-primary dark:border-indigo-500/80 shadow-md ring-1 ring-primary'
                        : 'bg-white dark:bg-slate-850 hover:bg-slate-50/60 dark:hover:bg-slate-800 border-slate-150 dark:border-slate-800 shadow-xs'
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      {/* Avatar */}
                      <div className="relative flex-shrink-0">
                        {student.avatar ? (
                          <img
                            src={student.avatar}
                            alt={student.name}
                            referrerPolicy="no-referrer"
                            className="w-12 h-12 rounded-xl object-cover border-2 border-white dark:border-slate-800 shadow-sm"
                          />
                        ) : (
                          <div className="w-12 h-12 rounded-xl bg-indigo-500/10 dark:bg-indigo-400/10 text-primary dark:text-indigo-400 font-bold flex items-center justify-center text-lg shadow-sm">
                            {student.name.charAt(0).toUpperCase()}
                          </div>
                        )}
                        {isMyStudent && (
                          <span className="absolute -bottom-1 -right-1 bg-emerald-500 text-white p-0.5 rounded-full ring-2 ring-white dark:ring-slate-850 shadow-xs">
                            <CheckCircle className="w-3.5 h-3.5" />
                          </span>
                        )}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="font-bold text-slate-800 dark:text-slate-100 text-sm sm:text-base truncate">
                            {student.name}
                          </h4>
                          {isMyStudent && (
                            <span className="text-[10px] bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 font-extrabold uppercase px-2 py-0.5 rounded-md flex-shrink-0">
                              Asignado
                            </span>
                          )}
                        </div>
                        
                        <p className="text-xs text-slate-500 dark:text-slate-400 truncate flex items-center gap-1.5">
                          <span className="font-medium text-indigo-600 dark:text-indigo-400">
                            {enrolledLevelNames}
                          </span>
                          •
                          <span className="truncate">{student.email}</span>
                        </p>
                      </div>

                      {/* Actions Column */}
                      <div className="flex items-center gap-2.5" onClick={(e) => e.stopPropagation()}>
                        {isMyStudent ? (
                          <button
                            onClick={() => handleUnassign(student.id)}
                            disabled={!isPermittedToInteract}
                            className="p-2 text-rose-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/20 rounded-xl transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                            title={isPermittedToInteract ? "Desvincular Alumno" : "Requiere aprobación (luz verde)"}
                          >
                            <Trash2 className="w-4.5 h-4.5" />
                          </button>
                        ) : hasOtherTeacher ? (
                          <div className="text-[10px] text-slate-400 dark:text-slate-500 font-medium italic select-none">
                            Tutor: {student.assignedTeacherName}
                          </div>
                        ) : (
                          <button
                            onClick={() => handleAssignToMe(student.id)}
                            disabled={!isPermittedToInteract}
                            className="flex items-center gap-1 px-3 py-1.5 bg-primary hover:bg-primary-dark text-white rounded-xl text-xs font-bold transition shadow-xs disabled:opacity-50 disabled:cursor-not-allowed"
                            title={isPermittedToInteract ? "Elegir Alumno" : "Requiere aprobación (luz verde)"}
                          >
                            <UserPlus className="w-3.5 h-3.5" />
                            <span>Elegir</span>
                          </button>
                        )}
                        <ChevronRight className="w-4.5 h-4.5 text-slate-400" />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Side: Detail Drawer / Panel */}
        <div className="lg:col-span-5">
          <AnimatePresence mode="wait">
            {selectedStudent ? (
              <motion.div
                key={selectedStudent.id}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="bg-white dark:bg-slate-850 rounded-2xl border border-slate-150 dark:border-slate-800 shadow-md p-6 sticky top-6 space-y-6"
                id="selected-student-detail-panel"
              >
                {/* Panel Close for Mobile */}
                <div className="flex justify-between items-center pb-4 border-b border-slate-100 dark:border-slate-800">
                  <span className="text-xs font-black uppercase text-indigo-600 dark:text-indigo-400 tracking-wider">
                    Ficha de Seguimiento
                  </span>
                  <button
                    onClick={() => setSelectedStudent(null)}
                    className="p-1.5 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-750 text-slate-500 dark:text-slate-400 rounded-lg transition"
                  >
                    <X className="w-4.5 h-4.5" />
                  </button>
                </div>

                {/* Profile Summary */}
                <div className="flex gap-4 items-start">
                  {selectedStudent.avatar ? (
                    <img
                      src={selectedStudent.avatar}
                      alt={selectedStudent.name}
                      referrerPolicy="no-referrer"
                      className="w-16 h-16 rounded-2xl object-cover shadow-sm border border-slate-100 dark:border-slate-700"
                    />
                  ) : (
                    <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 dark:bg-indigo-400/10 text-primary dark:text-indigo-400 font-black flex items-center justify-center text-2xl shadow-sm">
                      {selectedStudent.name.charAt(0).toUpperCase()}
                    </div>
                  )}

                  <div className="space-y-1 min-w-0">
                    <h3 className="text-lg font-black text-slate-900 dark:text-white leading-tight truncate">
                      {selectedStudent.name}
                    </h3>
                    <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                      Curso: <span className="text-indigo-600 dark:text-indigo-400 font-bold">{
                        courseLevels
                          .filter(l => selectedStudent.enrolledCourseIds?.includes(l.id))
                          .map(l => l.name)
                          .join(', ') || 'Sin curso asignado'
                      }</span>
                    </p>
                    <p className="text-xs text-slate-400 dark:text-slate-500 flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" />
                      Registro: {new Date(selectedStudent.registrationDate).toLocaleDateString('es-ES')}
                    </p>
                  </div>
                </div>

                {/* Contact Data */}
                <div className="grid grid-cols-2 gap-3 bg-slate-50 dark:bg-slate-900/40 p-3 rounded-xl border border-slate-100 dark:border-slate-800 text-xs">
                  <div className="space-y-0.5 min-w-0">
                    <span className="text-[10px] text-slate-400 font-bold uppercase flex items-center gap-1">
                      <Mail className="w-3 h-3" /> Email
                    </span>
                    <p className="font-medium text-slate-700 dark:text-slate-300 truncate" title={selectedStudent.email}>
                      {selectedStudent.email}
                    </p>
                  </div>
                  <div className="space-y-0.5 min-w-0">
                    <span className="text-[10px] text-slate-400 font-bold uppercase flex items-center gap-1">
                      <Phone className="w-3 h-3" /> Teléfono
                    </span>
                    <p className="font-medium text-slate-700 dark:text-slate-300 truncate">
                      {selectedStudent.phone || 'No registrado'}
                    </p>
                  </div>
                </div>

                {/* Quick Shortcuts */}
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    onClick={() => {
                      const sUid = resolveUserUid(selectedStudent);
                      const tUid = resolveUserUid(user);
                      const directId = getDirectChatId(sUid, tUid);
                      navigate(`${ROUTES.CHAT}?studentId=${sUid}`, { state: { activeChatType: 'peer', activeConvoId: directId } });
                    }}
                    className="flex items-center justify-center gap-1.5 py-2 px-3 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/30 dark:hover:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 rounded-xl text-xs font-bold border border-indigo-100 dark:border-indigo-900 transition"
                  >
                    <MessageSquare className="w-4 h-4" />
                    <span>Chat</span>
                  </button>

                  <button
                    onClick={() => {
                      // Navigate to Tutoring schedule or open digital board
                      navigate(`${ROUTES.TUTORING}`);
                    }}
                    className="flex items-center justify-center gap-1.5 py-2 px-3 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-350 rounded-xl text-xs font-bold border border-slate-200 dark:border-slate-700 transition"
                  >
                    <Video className="w-4 h-4" />
                    <span>Pizarra / Tutoría</span>
                  </button>
                </div>

                {/* Credits Manager */}
                <div className="p-4 bg-amber-50/30 dark:bg-amber-950/10 border border-amber-100/60 dark:border-amber-900/30 rounded-xl space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <span className="text-xs font-extrabold text-amber-800 dark:text-amber-400 uppercase tracking-wide flex items-center gap-1.5 flex-wrap">
                        <Award className="w-4 h-4 text-amber-550" /> Monedero de Infinitys
                        {!isAdmin && (
                          <span className="inline-flex items-center gap-1 text-[9px] font-black bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 border border-rose-150 dark:border-rose-900/30 px-1.5 py-0.5 rounded-md uppercase">
                            <ShieldCheck className="w-3 h-3" /> Solo Admin
                          </span>
                        )}
                      </span>
                      <p className="text-[10px] text-amber-650 dark:text-amber-400/80">
                        {isAdmin ? 'Otorga créditos para reservar tutorías premium.' : 'Créditos acumulados para reservar tutorías premium.'}
                      </p>
                    </div>
                    <span className="text-base font-black text-amber-700 dark:text-amber-400 bg-amber-100/60 dark:bg-amber-950/40 px-3 py-1 rounded-full shrink-0">
                      {creditsVal} {creditsVal === 1 ? 'Infinity' : 'Infinitys'}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      aria-label="Reducir créditos"
                      onClick={() => handleUpdateCredits(creditsVal - 1)}
                      className="p-2 bg-white dark:bg-slate-800 hover:bg-slate-50 border border-slate-200 dark:border-slate-700 rounded-xl transition text-slate-600 dark:text-slate-300 disabled:opacity-50 shadow-xs cursor-pointer"
                      disabled={!isAdmin || creditsVal <= 0}
                    >
                      <Minus className="w-4 h-4" />
                    </button>
                    <input
                      type="number"
                      value={creditsVal}
                      disabled={!isAdmin}
                      onChange={(e) => handleUpdateCredits(parseInt(e.target.value) || 0)}
                      className="flex-1 min-w-0 text-center py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-850 dark:text-white disabled:opacity-75 disabled:bg-slate-50 dark:disabled:bg-slate-900 disabled:cursor-not-allowed"
                      min="0"
                    />
                    <button
                      aria-label="Añadir créditos"
                      onClick={() => handleUpdateCredits(creditsVal + 1)}
                      className="p-2 bg-white dark:bg-slate-800 hover:bg-slate-50 border border-slate-200 dark:border-slate-700 rounded-xl transition text-slate-600 dark:text-slate-300 disabled:opacity-50 shadow-xs cursor-pointer"
                      disabled={!isAdmin}
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Permissions Toggles */}
                <div className="space-y-3.5 border-t border-b border-slate-100 dark:border-slate-800 py-4.5">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-black text-slate-700 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                      <Sliders className="w-4 h-4 text-slate-500" /> Permisos Escolares
                    </h4>
                    {!isAdmin && (
                      <span className="inline-flex items-center gap-1 text-[9px] font-black bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 border border-rose-150 dark:border-rose-900/30 px-1.5 py-0.5 rounded-md uppercase">
                        <ShieldCheck className="w-3 h-3" /> Solo Admin
                      </span>
                    )}
                  </div>

                  <div className="space-y-3">
                    {/* AI Permission */}
                    <div className="flex items-center justify-between p-2.5 bg-slate-50/50 dark:bg-slate-900/20 rounded-xl border border-slate-100 dark:border-slate-800">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Sparkles className="w-4.5 h-4.5 text-amber-500 flex-shrink-0" />
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-slate-800 dark:text-slate-200">Asistente IA Tutor</p>
                          <p className="text-[10px] text-slate-400 truncate">Habilitar resolución de dudas con IA</p>
                        </div>
                      </div>
                      <button
                        aria-label="Alternar Asistente IA"
                        onClick={() => handleSavePermissions(!aiEnabled, videosEnabled)}
                        disabled={!isAdmin || !aiEnabledGlobally}
                        title={!aiEnabledGlobally ? "La IA está desactivada globalmente" : (!isAdmin ? "Solo el administrador puede cambiar permisos" : "")}
                        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none disabled:opacity-60 disabled:cursor-not-allowed ${
                          aiEnabledGlobally && aiEnabled ? 'bg-primary' : 'bg-slate-300 dark:bg-slate-700'
                        }`}
                      >
                        <span
                          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                            aiEnabledGlobally && aiEnabled ? 'translate-x-5' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </div>

                    {/* Videos/Lessons Permission */}
                    <div className="flex items-center justify-between p-2.5 bg-slate-50/50 dark:bg-slate-900/20 rounded-xl border border-slate-100 dark:border-slate-800">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Video className="w-4.5 h-4.5 text-indigo-500 flex-shrink-0" />
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-slate-800 dark:text-slate-200">Videolecciones y Quizzes</p>
                          <p className="text-[10px] text-slate-400 truncate">Permitir acceso a clases multimedia</p>
                        </div>
                      </div>
                      <button
                        aria-label="Alternar acceso a videos"
                        onClick={() => handleSavePermissions(aiEnabled, !videosEnabled)}
                        disabled={!isAdmin || !videosEnabledGlobally}
                        title={!videosEnabledGlobally ? "El acceso a vídeos está desactivado globalmente" : (!isAdmin ? "Solo el administrador puede cambiar permisos" : "")}
                        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none disabled:opacity-60 disabled:cursor-not-allowed ${
                          videosEnabledGlobally && videosEnabled ? 'bg-primary' : 'bg-slate-300 dark:bg-slate-700'
                        }`}
                      >
                        <span
                          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                            videosEnabledGlobally && videosEnabled ? 'translate-x-5' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Follow-up Notes (adminNotes) */}
                <div className="space-y-2.5">
                  <div className="flex justify-between items-center">
                    <label className="text-xs font-black text-slate-700 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                      <FileText className="w-4 h-4" /> Observaciones y Seguimiento
                    </label>
                    <span className="text-[10px] text-slate-400 italic">Solo visible para ti</span>
                  </div>

                  {!isPermittedToInteract && (
                    <p className="text-[10px] text-amber-600 dark:text-amber-400/80 bg-amber-500/5 px-2.5 py-1.5 rounded-lg border border-amber-500/10">
                      ⚠️ Guardado deshabilitado. Requiere luz verde del admin.
                    </p>
                  )}

                  <textarea
                    value={notesText}
                    onChange={(e) => setNotesText(e.target.value)}
                    disabled={!isPermittedToInteract}
                    placeholder="Escribe comentarios, áreas de mejora o un plan de estudio personalizado..."
                    rows={4}
                    className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs text-slate-800 dark:text-slate-150 focus:outline-none focus:ring-2 focus:ring-primary/20 placeholder-slate-400 resize-none font-sans disabled:opacity-75 disabled:cursor-not-allowed"
                  />

                  <button
                    onClick={handleSaveNotes}
                    disabled={notesMutation.isPending || !isPermittedToInteract}
                    className="w-full flex items-center justify-center gap-1.5 py-2 bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:hover:bg-slate-200 dark:text-slate-950 text-white rounded-xl text-xs font-bold transition shadow-xs disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {notesMutation.isPending ? 'Guardando...' : 'Guardar Observaciones'}
                  </button>
                </div>
              </motion.div>
            ) : (
              <div className="hidden lg:flex flex-col items-center justify-center h-[400px] border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl p-6 text-center text-slate-400">
                <Users className="w-10 h-10 mb-2.5 text-slate-300" />
                <p className="text-xs font-bold">Ningún alumno seleccionado</p>
                <p className="text-[11px] text-slate-400 mt-1 max-w-xs leading-normal">
                  Selecciona un alumno de la lista izquierda para consultar su ficha, ajustar créditos, habilitar la IA o añadir notas académicas.
                </p>
              </div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
};
