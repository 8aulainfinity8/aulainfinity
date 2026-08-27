import React, { useState, useMemo, useContext, useEffect, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as api from '../../services/api';
import type { StudentUser, CourseLevel, TeacherUser } from '../../types';
import { ChevronLeftIcon, CheckCircleIcon, XCircleIcon, SearchIcon, TrashIcon, PencilIcon, CloseIcon, UsersIcon, LockClosedIcon, DownloadIcon, ChatBubbleLeftRightIcon, SparklesIcon, VideoCameraIcon, EyeIcon, CreditCardIcon } from '../icons';
import { NotificationContext } from '../../contexts/NotificationContext';
import { AdminNotificationContext } from '../../contexts/AdminNotificationContext';
import { AppConfigContext } from '../../contexts/AppConfigContext';
import { AuthContext } from '../../contexts/AuthContext';
import { auth } from '../../services/firebase';
import { useNavigate, useLocation } from 'react-router-dom';
import { ROUTES } from '../../constants/routes';
import { ConfirmationModal } from '../ConfirmationModal';
import { useDebounce } from '../../hooks/useDebounce';
import { Button } from '../ui/Button';
import { useBackNavigation } from '../../hooks/useBackNavigation';
import { FailureState } from '../ui/FailureState';
import { EmptyState } from '../ui/EmptyState';
import { AdminTeacherApprovalPage } from './AdminTeacherApprovalPage';
import { AdminCommunicationModal } from './AdminCommunicationModal';
import { GraduationCap, Phone, PhoneCall, Mic, ShieldAlert, PenTool } from 'lucide-react';

const UserRowSkeleton = () => (
    <div className="p-4 border-b border-gray-200 dark:border-slate-700 animate-pulse lg:grid lg:grid-cols-12 lg:px-6 lg:py-4 lg:items-center min-w-full lg:min-w-[1150px]">
        {/* Mobile Skeleton */}
        <div className="lg:hidden">
            <div className="flex items-center mb-4">
                <div className="flex-shrink-0 h-10 w-10 rounded-full bg-gray-200 dark:bg-slate-700"></div>
                <div className="ml-4 space-y-2">
                    <div className="h-4 bg-gray-200 dark:bg-slate-700 rounded w-24"></div>
                    <div className="h-3 bg-gray-200 dark:bg-slate-700 rounded w-32"></div>
                </div>
            </div>
            <div className="space-y-2">
                <div className="h-4 bg-gray-200 dark:bg-slate-700 rounded w-full"></div>
                <div className="h-4 bg-gray-200 dark:bg-slate-700 rounded w-3/4"></div>
            </div>
            <div className="mt-4 pt-4 border-t dark:border-slate-600">
                <div className="h-8 bg-gray-200 dark:bg-slate-700 rounded-md w-32"></div>
            </div>
        </div>
        {/* Desktop Skeleton */}
        <div className="hidden lg:col-span-3 lg:flex lg:items-center">
            <div className="flex-shrink-0 h-10 w-10 rounded-full bg-gray-200 dark:bg-slate-700"></div>
            <div className="ml-4 space-y-2">
                <div className="h-4 bg-gray-200 dark:bg-slate-700 rounded w-24"></div>
                <div className="h-3 bg-gray-200 dark:bg-slate-700 rounded w-32"></div>
            </div>
        </div>
        <div className="hidden lg:block col-span-2"><div className="h-4 bg-gray-200 dark:bg-slate-700 rounded w-20"></div></div>
        <div className="hidden lg:block col-span-1"><div className="h-6 bg-gray-200 dark:bg-slate-700 rounded w-20"></div></div>
        <div className="hidden lg:block col-span-2"><div className="h-6 bg-gray-200 dark:bg-slate-700 rounded w-24"></div></div>
        <div className="hidden lg:block col-span-2"><div className="h-10 bg-gray-200 dark:bg-slate-700 rounded-xl w-full"></div></div>
        <div className="hidden lg:block col-span-2"><div className="h-8 bg-gray-200 dark:bg-slate-700 rounded-md w-32 ml-auto"></div></div>
    </div>
);


const ChangeCoursesModal: React.FC<{
    user: StudentUser;
    courses: CourseLevel[];
    onClose: () => void;
    onSave: (newCourseIds: string[]) => void;
    isSaving: boolean;
}> = ({ user, courses, onClose, onSave, isSaving }) => {
    const [selectedCourseIds, setSelectedCourseIds] = useState(user.enrolledCourseIds);

    const handleCheckboxChange = (courseId: string) => {
        setSelectedCourseIds(prev =>
            prev.includes(courseId)
                ? prev.filter(id => id !== courseId)
                : [...prev, courseId]
        );
    };

    const handleSave = () => {
        onSave(selectedCourseIds);
    };

    return (
        <div className="fixed inset-0 bg-black/60 z-[9999] flex items-center justify-center p-4 animate-fade-in" onClick={onClose}>
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-lg animate-scale-in" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center p-4 border-b dark:border-slate-700">
                    <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">Cambiar cursos de {user.name}</h3>
                    <button onClick={onClose} className="p-1 rounded-full hover:bg-gray-200 dark:hover:bg-slate-700">
                        <CloseIcon className="w-5 h-5" />
                    </button>
                </div>
                <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
                    <p className="text-sm text-slate-600 dark:text-slate-400">Selecciona los cursos en los que el estudiante estará matriculado.</p>
                    <div className="space-y-2">
                        {courses.map(course => (
                            <label key={course.id} className="flex items-center p-3 rounded-md hover:bg-gray-100 dark:hover:bg-slate-700 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={selectedCourseIds.includes(course.id)}
                                    onChange={() => handleCheckboxChange(course.id)}
                                    className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                                />
                                <span className="ml-3 text-slate-900 dark:text-slate-100">{course.name}</span>
                            </label>
                        ))}
                    </div>
                </div>
                <div className="flex justify-end gap-3 p-4 bg-gray-50 dark:bg-slate-800/50 rounded-b-xl">
                    <Button variant="secondary" onClick={onClose}>Cancelar</Button>
                    <Button onClick={handleSave} isLoading={isSaving}>Guardar Cambios</Button>
                </div>
            </div>
        </div>
    );
};

const CreateUserModal: React.FC<{
    courses: CourseLevel[];
    onClose: () => void;
    onSave: (data: { name: string; email: string; password?: string; enrolledCourseIds: string[]; phone: string; isSubscribed: boolean }) => void;
    isSaving: boolean;
}> = ({ courses, onClose, onSave, isSaving }) => {
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [phone, setPhone] = useState('');
    const [selectedCourseIds, setSelectedCourseIds] = useState<string[]>([]);
    const [isSubscribed, setIsSubscribed] = useState(false);
    const [error, setError] = useState('');

    const handleCheckboxChange = (courseId: string) => {
        setSelectedCourseIds(prev =>
            prev.includes(courseId)
                ? prev.filter(id => id !== courseId)
                : [...prev, courseId]
        );
    };

    const handleSave = () => {
        if (!name || !email) {
            setError('El nombre y el correo electrónico son obligatorios.');
            return;
        }
        if (!email.includes('@')) {
            setError('Introduce un correo electrónico válido.');
            return;
        }
        onSave({
            name,
            email,
            password: password || '123456',
            enrolledCourseIds: selectedCourseIds,
            phone: phone || 'No especificado',
            isSubscribed,
        });
    };

    return (
        <div className="fixed inset-0 bg-black/60 z-[9999] flex items-center justify-center p-4 animate-fade-in" onClick={onClose}>
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-lg animate-scale-in" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center p-4 border-b dark:border-slate-700">
                    <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">Crear Nuevo Estudiante</h3>
                    <button onClick={onClose} className="p-1 rounded-full hover:bg-gray-200 dark:hover:bg-slate-700">
                        <CloseIcon className="w-5 h-5" />
                    </button>
                </div>
                <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
                    {error && (
                        <div className="p-3 bg-red-100 border border-red-200 text-red-700 text-sm rounded">
                            {error}
                        </div>
                    )}
                    <div>
                        <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">Nombre Completo *</label>
                        <input
                            type="text"
                            value={name}
                            onChange={e => { setName(e.target.value); setError(''); }}
                            className="w-full px-3 py-2 bg-white dark:bg-slate-700 border border-gray-300 dark:border-slate-600 rounded-md text-slate-900 dark:text-slate-100 focus:ring-primary focus:border-primary focus:outline-none"
                            placeholder="Ej: Juan Pérez"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">Correo Electrónico *</label>
                        <input
                            type="email"
                            value={email}
                            onChange={e => { setEmail(e.target.value); setError(''); }}
                            className="w-full px-3 py-2 bg-white dark:bg-slate-700 border border-gray-300 dark:border-slate-600 rounded-md text-slate-900 dark:text-slate-100 focus:ring-primary focus:border-primary focus:outline-none"
                            placeholder="Ej: juan.perez@email.com"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">Contraseña (Mínimo 6 caracteres)</label>
                        <input
                            type="password"
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            className="w-full px-3 py-2 bg-white dark:bg-slate-700 border border-gray-300 dark:border-slate-600 rounded-md text-slate-900 dark:text-slate-100 focus:ring-primary focus:border-primary focus:outline-none"
                            placeholder="Dejar vacío para usar '123456'"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">Teléfono</label>
                        <input
                            type="tel"
                            value={phone}
                            onChange={e => setPhone(e.target.value)}
                            className="w-full px-3 py-2 bg-white dark:bg-slate-700 border border-gray-300 dark:border-slate-600 rounded-md text-slate-900 dark:text-slate-100 focus:ring-primary focus:border-primary focus:outline-none"
                            placeholder="Ej: 600123456"
                        />
                    </div>

                    <div className="pt-2">
                        <label className="flex items-center cursor-pointer">
                            <input
                                type="checkbox"
                                checked={isSubscribed}
                                onChange={e => setIsSubscribed(e.target.checked)}
                                className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                            />
                            <span className="ml-3 text-sm font-semibold text-slate-900 dark:text-slate-100">Activar Suscripción Premium inmediatamente</span>
                        </label>
                    </div>

                    <div className="pt-2 border-t dark:border-slate-700">
                        <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Matricular en Cursos:</label>
                        <div className="grid grid-cols-1 gap-1 max-h-40 overflow-y-auto border border-gray-200 dark:border-slate-600 rounded p-2">
                            {courses.map(course => (
                                <label key={course.id} className="flex items-center p-1.5 rounded hover:bg-gray-100 dark:hover:bg-slate-700 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={selectedCourseIds.includes(course.id)}
                                        onChange={() => handleCheckboxChange(course.id)}
                                        className="h-3.5 w-3.5 rounded border-gray-300 text-primary focus:ring-primary"
                                    />
                                    <span className="ml-2 text-xs text-slate-900 dark:text-slate-100">{course.name}</span>
                                </label>
                            ))}
                        </div>
                    </div>
                </div>
                <div className="flex justify-end gap-3 p-4 bg-gray-50 dark:bg-slate-800/50 rounded-b-xl border-t dark:border-slate-700">
                    <Button variant="secondary" onClick={onClose}>Cancelar</Button>
                    <Button onClick={handleSave} isLoading={isSaving}>Crear Estudiante</Button>
                </div>
            </div>
        </div>
    );
};

const AssignRoleByEmailModal: React.FC<{
    onClose: () => void;
    onSave: (data: { email: string; role: 'student' | 'teacher'; category?: string }) => void;
    isSaving: boolean;
}> = ({ onClose, onSave, isSaving }) => {
    const [email, setEmail] = useState('');
    const [role, setRole] = useState<'student' | 'teacher'>('student');
    const [category, setCategory] = useState('');
    const [error, setError] = useState('');

    const handleSave = () => {
        if (!email) {
            setError('El correo electrónico es obligatorio.');
            return;
        }
        if (!email.includes('@')) {
            setError('Introduce un correo electrónico válido.');
            return;
        }
        if (role === 'teacher' && !category) {
            setError('La especialidad/categoría es obligatoria para el rol de Profesor.');
            return;
        }
        onSave({
            email,
            role,
            category: role === 'teacher' ? category : undefined
        });
    };

    return (
        <div className="fixed inset-0 bg-black/60 z-[9999] flex items-center justify-center p-4 animate-fade-in" onClick={onClose}>
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-md dialog-container" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center p-4 border-b dark:border-slate-700">
                    <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">🔄 Asignar / Cambiar Rol por Email</h3>
                    <button onClick={onClose} className="p-1 rounded-full hover:bg-gray-200 dark:hover:bg-slate-700">
                        <CloseIcon className="w-5 h-5" />
                    </button>
                </div>
                <div className="p-6 space-y-4">
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                        Ingresa un correo electrónico para cambiar su rol a Estudiante o Profesor. Si el usuario no existe, se creará un perfil nuevo automáticamente con la contraseña por defecto <code className="bg-slate-100 dark:bg-slate-900 px-1 py-0.5 rounded font-mono">password123</code>.
                    </p>
                    {error && (
                        <div className="p-3 bg-red-50 dark:bg-red-900/30 text-red-500 dark:text-red-400 text-sm rounded-md border border-red-200 dark:border-red-900/50">
                            {error}
                        </div>
                    )}
                    <div className="space-y-1">
                        <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Correo Electrónico *</label>
                        <input
                            type="email"
                            value={email}
                            onChange={e => { setEmail(e.target.value); setError(''); }}
                            placeholder="usuario@ejemplo.com"
                            className="bg-gray-50 dark:bg-slate-700 dark:border-slate-600 block w-full border border-gray-300 rounded-md py-2 px-3 text-slate-950 dark:text-slate-50 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary text-sm"
                        />
                    </div>
                    <div className="space-y-1">
                        <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Nuevo Rol *</label>
                        <select
                            value={role}
                            onChange={e => { setRole(e.target.value as 'student' | 'teacher'); setError(''); }}
                            className="bg-gray-50 dark:bg-slate-700 dark:border-slate-600 block w-full border border-gray-300 rounded-md py-2 px-3 text-slate-950 dark:text-slate-50 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary text-sm"
                        >
                            <option value="student">Estudiante (Alumno)</option>
                            <option value="teacher">Profesor (Profe)</option>
                        </select>
                    </div>
                    {role === 'teacher' && (
                        <div className="space-y-1 animate-slide-in-up">
                            <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Especialidad de Profesor *</label>
                            <input
                                type="text"
                                value={category}
                                onChange={e => { setCategory(e.target.value); setError(''); }}
                                placeholder="Ej. Matemáticas, Física, Programación..."
                                className="bg-gray-50 dark:bg-slate-700 dark:border-slate-600 block w-full border border-gray-300 rounded-md py-2 px-3 text-slate-950 dark:text-slate-50 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary text-sm"
                            />
                        </div>
                    )}
                </div>
                <div className="flex justify-end gap-3 p-4 bg-gray-50 dark:bg-slate-800/50 rounded-b-xl border-t dark:border-slate-700">
                    <Button variant="secondary" onClick={onClose}>Cancelar</Button>
                    <Button onClick={handleSave} isLoading={isSaving}>Establecer Rol</Button>
                </div>
            </div>
        </div>
    );
};

const BulkChangeCoursesModal: React.FC<{
    selectedCount: number;
    courses: CourseLevel[];
    onClose: () => void;
    onSave: (newCourseIds: string[]) => void;
    isSaving: boolean;
}> = ({ selectedCount, courses, onClose, onSave, isSaving }) => {
    const [selectedCourseIds, setSelectedCourseIds] = useState<string[]>([]);

    const handleCheckboxChange = (courseId: string) => {
        setSelectedCourseIds(prev =>
            prev.includes(courseId)
                ? prev.filter(id => id !== courseId)
                : [...prev, courseId]
        );
    };

    const handleSave = () => {
        onSave(selectedCourseIds);
    };

    return (
        <div className="fixed inset-0 bg-black/60 z-[9999] flex items-center justify-center p-4 animate-fade-in" onClick={onClose}>
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-lg animate-scale-in" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center p-4 border-b dark:border-slate-700">
                    <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">Matricular {selectedCount} estudiantes</h3>
                    <button onClick={onClose} className="p-1 rounded-full hover:bg-gray-200 dark:hover:bg-slate-700">
                        <CloseIcon className="w-5 h-5" />
                    </button>
                </div>
                <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
                    <p className="text-sm text-slate-600 dark:text-slate-400">Selecciona los cursos en los que deseas matricular en lote a los estudiantes seleccionados.</p>
                    <div className="space-y-2">
                        {courses.map(course => (
                            <label key={course.id} className="flex items-center p-3 rounded-md hover:bg-gray-100 dark:hover:bg-slate-700 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={selectedCourseIds.includes(course.id)}
                                    onChange={() => handleCheckboxChange(course.id)}
                                    className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary focus:ring-2 cursor-pointer"
                                />
                                <span className="ml-3 text-slate-900 dark:text-slate-100">{course.name}</span>
                            </label>
                        ))}
                    </div>
                </div>
                <div className="flex justify-end gap-3 p-4 bg-gray-50 dark:bg-slate-800/50 rounded-b-xl">
                    <Button variant="secondary" onClick={onClose}>Cancelar</Button>
                    <Button onClick={handleSave} isLoading={isSaving}>Aplicar en lote</Button>
                </div>
            </div>
        </div>
    );
};


const ResetPasswordModal: React.FC<{
    user: StudentUser;
    onClose: () => void;
    onSave: (password: string) => void;
    isSaving: boolean;
}> = ({ user, onClose, onSave, isSaving }) => {
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');

    const handleSave = () => {
        if (!password || password.length < 6) {
            setError('La contraseña debe tener al menos 6 caracteres.');
            return;
        }
        onSave(password);
    };

    return (
        <div className="fixed inset-0 bg-black/60 z-[9999] flex items-center justify-center p-4 animate-fade-in" onClick={onClose}>
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-sm animate-scale-in" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center p-4 border-b dark:border-slate-700">
                    <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">Restablecer Contraseña</h3>
                    <button onClick={onClose} className="p-1 rounded-full hover:bg-gray-200 dark:hover:bg-slate-700">
                        <CloseIcon className="w-5 h-5" />
                    </button>
                </div>
                <div className="p-6 space-y-4">
                    <p className="text-sm text-slate-600 dark:text-slate-400">
                        Introduce una nueva contraseña para <strong>{user.name}</strong>.
                    </p>
                    {error && (
                        <div className="p-2 bg-red-100 border border-red-200 text-red-700 text-xs rounded">
                            {error}
                        </div>
                    )}
                    <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Nueva Contraseña *</label>
                        <input
                            type="password"
                            value={password}
                            onChange={e => { setPassword(e.target.value); setError(''); }}
                            className="w-full px-3 py-2 bg-white dark:bg-slate-700 border border-gray-300 dark:border-slate-600 rounded-md text-slate-900 dark:text-slate-100 focus:ring-primary focus:border-primary focus:outline-none"
                            placeholder="Mínimo 6 caracteres"
                        />
                    </div>
                </div>
                <div className="flex justify-end gap-3 p-4 bg-gray-50 dark:bg-slate-800/50 rounded-b-xl border-t dark:border-slate-700">
                    <Button variant="secondary" onClick={onClose}>Cancelar</Button>
                    <Button onClick={handleSave} isLoading={isSaving}>Guardar Contraseña</Button>
                </div>
            </div>
        </div>
    );
};

interface UserRowProps {
    user: StudentUser;
    courseNames: string;
    onToggleSubscription: (userId: string, period?: 'monthly' | 'annual') => void;
    isSubscriptionPending: boolean;
    onEditCourse: (user: StudentUser) => void;
    onResetPassword: (user: StudentUser) => void;
    onDelete: (user: StudentUser) => void;
    isSelected?: boolean;
    onSelectToggle?: (userId: string) => void;
    teachers: TeacherUser[];
    onAssignTeacher: (studentId: string, teacherId: string | null) => void;
    hasUnread?: boolean;
    convoId?: string;
    onViewChat?: (convoId: string) => void;
    onUpdatePermissions: (userId: string, role: 'student' | 'teacher', permissions: { aiEnabled?: boolean; videosEnabled?: boolean; canInitiateCalls?: boolean; canInitiateWhiteboard?: boolean }) => void;
    onViewDetail: (user: StudentUser) => void;
    isNew?: boolean;
    aiEnabledGlobally: boolean;
    videosEnabledGlobally: boolean;
    subscriptionsEnabledGlobally: boolean;
    onOpenCommunication?: (recipient: { type: 'specific'; userId: string; userType: 'student' | 'teacher' }, tab?: 'message' | 'test_whatsapp') => void;
}

const UserRow: React.FC<UserRowProps> = React.memo(({
    user,
    courseNames,
    onToggleSubscription,
    isSubscriptionPending,
    onEditCourse,
    onResetPassword,
    onDelete,
    isSelected = false,
    onSelectToggle,
    teachers,
    onAssignTeacher,
    hasUnread = false,
    convoId,
    onViewChat,
    onUpdatePermissions,
    onViewDetail,
    isNew = false,
    aiEnabledGlobally,
    videosEnabledGlobally,
    subscriptionsEnabledGlobally,
    onOpenCommunication,
}) => {
    const navigate = useNavigate();
    return (
        <div
            className={`admin-table-row lg:grid lg:grid-cols-12 lg:items-center min-w-full lg:min-w-[1150px] gap-2 ${
                isSelected ? 'bg-indigo-50/50 dark:bg-indigo-950/20 border-l-2 border-primary' : ''
            }`}
        >
            {/* User Info */}
            <div className="lg:col-span-3 flex items-center mb-2 lg:mb-0 min-w-0">
                <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => onSelectToggle?.(user.id)}
                    className="mr-3 h-4 w-4 rounded border-gray-300 dark:border-slate-600 text-primary focus:ring-primary focus:ring-2 cursor-pointer"
                />
                <img loading="lazy" width="40" height="40" className="h-10 w-10 rounded-full object-cover bg-gray-200 animate-fade-in flex-shrink-0" src={`https://api.dicebear.com/8.x/initials/svg?seed=${user.name}`} alt={`Avatar de ${user.name}`} />
                <div className="ml-4 truncate flex-1 min-w-0">
                    <div 
                        onClick={() => onViewDetail(user)}
                        className="text-sm font-bold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer animate-fade-in flex items-center gap-1.5 min-w-0" 
                        title="Ver Expediente Completo"
                    >
                        <span className="truncate">{user.name}</span>
                        {isNew && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-black bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400">
                                NUEVO 🔴
                            </span>
                        )}
                        {hasUnread && (
                            <span className="relative flex h-2 w-2 flex-shrink-0" title="Mensaje sin leer">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                            </span>
                        )}
                    </div>
                    <div className="text-sm text-slate-500 dark:text-slate-400 truncate" title={user.email}>{user.email}</div>
                    <div className="text-sm text-slate-400 dark:text-slate-500 truncate lg:hidden" title={user.phone}>{user.phone}</div>
                </div>
            </div>

            {/* Details for Mobile (Card View) */}
            <div className="space-y-3 lg:hidden text-sm">
                <div className="bg-slate-50/70 dark:bg-slate-800/50 p-3 rounded-xl border border-slate-200/70 dark:border-slate-700/60 space-y-2">
                    <div className="admin-table-mobile-field">
                        <span className="admin-table-mobile-label">Registro:</span>
                        <span className="text-slate-600 dark:text-slate-400 font-medium">{new Date(user.registrationDate).toLocaleDateString()}</span>
                    </div>
                    <div className="admin-table-mobile-field">
                        <span className="admin-table-mobile-label">Cursos:</span>
                        <span className="text-slate-800 dark:text-slate-100 font-semibold text-right max-w-[200px] truncate" title={courseNames}>{courseNames}</span>
                    </div>
                    <div className="admin-table-mobile-field">
                        <span className="admin-table-mobile-label">Profesor / Tutor:</span>
                        <select
                            value={user.assignedTeacherId || ''}
                            onChange={(e) => onAssignTeacher(user.id, e.target.value || null)}
                            className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg text-xs py-1 px-2 focus:outline-none focus:ring-1 focus:ring-primary font-medium text-slate-700 dark:text-slate-200 outline-none cursor-pointer"
                        >
                            <option value="">Sin tutor</option>
                            {teachers?.map(t => (
                                <option key={t.id} value={t.id}>{t.name}</option>
                            ))}
                        </select>
                    </div>
                    <div className="admin-table-mobile-field">
                        <span className="admin-table-mobile-label">Suscripción:</span>
                        {!subscriptionsEnabledGlobally ? (
                            <span className="text-xs text-rose-600 dark:text-rose-400 font-extrabold uppercase bg-rose-50 dark:bg-rose-950/20 px-2 py-0.5 rounded border border-rose-200 dark:border-rose-900/30">
                                🛑 Desactivado (Global)
                            </span>
                        ) : (
                            <select
                                value={user.isSubscribed ? (user.subscriptionPeriod || 'monthly') : 'free'}
                                onChange={(e) => {
                                    const val = e.target.value;
                                    if (val === 'free') {
                                        if (user.isSubscribed) {
                                            onToggleSubscription(user.id, undefined);
                                        }
                                    } else {
                                        onToggleSubscription(user.id, val as 'monthly' | 'annual');
                                    }
                                }}
                                disabled={isSubscriptionPending}
                                className={`bg-white dark:bg-slate-800 border rounded-lg text-xs py-1 px-2 focus:outline-none focus:ring-1 outline-none cursor-pointer font-bold ${
                                    user.isSubscribed
                                        ? user.subscriptionPeriod === 'annual'
                                            ? 'border-indigo-400 text-indigo-600 dark:text-indigo-400'
                                            : 'border-emerald-400 text-emerald-600 dark:text-emerald-400'
                                        : 'border-gray-200 dark:border-slate-700 text-slate-500 dark:text-slate-400'
                                }`}
                            >
                                <option value="free">🛑 Gratuito</option>
                                <option value="monthly">💎 Mensual</option>
                                <option value="annual">⭐ Anual</option>
                            </select>
                        )}
                    </div>
                </div>

                {/* Mobile Permissions Section */}
                <div className="bg-slate-50/90 dark:bg-slate-850 p-3 rounded-xl border border-slate-200 dark:border-slate-700/80 space-y-2">
                    <div className="flex items-center justify-between">
                        <span className="text-[11px] font-black uppercase tracking-wider text-slate-600 dark:text-slate-400">
                            Permisos y Accesos
                        </span>
                        <span className="text-[10px] text-slate-400 dark:text-slate-500">Toca para alternar</span>
                    </div>

                    <div className="grid grid-cols-2 gap-1.5">
                        {/* IA Permission */}
                        <button
                            type="button"
                            onClick={() => onUpdatePermissions(user.id, 'student', {
                                aiEnabled: !(user.aiEnabled !== false),
                                videosEnabled: user.videosEnabled !== false,
                                canInitiateCalls: user.canInitiateCalls === true,
                                canInitiateWhiteboard: user.canInitiateWhiteboard === true
                            })}
                            disabled={!aiEnabledGlobally}
                            className={`p-2 text-xs font-bold rounded-lg border flex items-center justify-between gap-1 transition-all cursor-pointer ${
                                !aiEnabledGlobally
                                    ? 'bg-slate-100 text-slate-400 border-slate-200 dark:bg-slate-800/40 opacity-60 cursor-not-allowed'
                                    : user.aiEnabled !== false
                                        ? 'bg-amber-500/10 text-amber-800 dark:text-amber-300 border-amber-300/80 dark:border-amber-700/60'
                                        : 'bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700'
                            }`}
                        >
                            <span className="flex items-center gap-1.5">
                                <SparklesIcon className="w-3.5 h-3.5 text-amber-500" />
                                <span>IA Tutor</span>
                            </span>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded font-black ${
                                user.aiEnabled !== false ? 'bg-amber-500 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                            }`}>
                                {user.aiEnabled !== false ? 'ON' : 'OFF'}
                            </span>
                        </button>

                        {/* Videos Permission */}
                        <button
                            type="button"
                            onClick={() => onUpdatePermissions(user.id, 'student', {
                                aiEnabled: user.aiEnabled !== false,
                                videosEnabled: !(user.videosEnabled !== false),
                                canInitiateCalls: user.canInitiateCalls === true,
                                canInitiateWhiteboard: user.canInitiateWhiteboard === true
                            })}
                            disabled={!videosEnabledGlobally}
                            className={`p-2 text-xs font-bold rounded-lg border flex items-center justify-between gap-1 transition-all cursor-pointer ${
                                !videosEnabledGlobally
                                    ? 'bg-slate-100 text-slate-400 border-slate-200 dark:bg-slate-800/40 opacity-60 cursor-not-allowed'
                                    : user.videosEnabled !== false
                                        ? 'bg-blue-500/10 text-blue-800 dark:text-blue-300 border-blue-300/80 dark:border-blue-700/60'
                                        : 'bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700'
                            }`}
                        >
                            <span className="flex items-center gap-1.5">
                                <VideoCameraIcon className="w-3.5 h-3.5 text-blue-500" />
                                <span>Vídeos</span>
                            </span>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded font-black ${
                                user.videosEnabled !== false ? 'bg-blue-500 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                            }`}>
                                {user.videosEnabled !== false ? 'ON' : 'OFF'}
                            </span>
                        </button>

                        {/* Calls Permission */}
                        <button
                            type="button"
                            onClick={() => onUpdatePermissions(user.id, 'student', {
                                aiEnabled: user.aiEnabled !== false,
                                videosEnabled: user.videosEnabled !== false,
                                canInitiateCalls: !(user.canInitiateCalls === true),
                                canInitiateWhiteboard: user.canInitiateWhiteboard === true
                            })}
                            className={`p-2 text-xs font-bold rounded-lg border flex items-center justify-between gap-1 transition-all cursor-pointer ${
                                user.canInitiateCalls
                                    ? 'bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 border-emerald-300/80 dark:border-emerald-700/60'
                                    : 'bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700'
                            }`}
                        >
                            <span className="flex items-center gap-1.5">
                                <Phone className="w-3.5 h-3.5 text-emerald-600" />
                                <span>Llamadas</span>
                            </span>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded font-black ${
                                user.canInitiateCalls ? 'bg-emerald-600 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                            }`}>
                                {user.canInitiateCalls ? 'Inicia' : 'Recibe'}
                            </span>
                        </button>

                        {/* Whiteboard Permission */}
                        <button
                            type="button"
                            onClick={() => onUpdatePermissions(user.id, 'student', {
                                aiEnabled: user.aiEnabled !== false,
                                videosEnabled: user.videosEnabled !== false,
                                canInitiateCalls: user.canInitiateCalls === true,
                                canInitiateWhiteboard: !(user.canInitiateWhiteboard === true)
                            })}
                            className={`p-2 text-xs font-bold rounded-lg border flex items-center justify-between gap-1 transition-all cursor-pointer ${
                                user.canInitiateWhiteboard
                                    ? 'bg-purple-500/10 text-purple-800 dark:text-purple-300 border-purple-300/80 dark:border-purple-700/60'
                                    : 'bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700'
                            }`}
                        >
                            <span className="flex items-center gap-1.5">
                                <PenTool className="w-3.5 h-3.5 text-purple-600" />
                                <span>Pizarra</span>
                            </span>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded font-black ${
                                user.canInitiateWhiteboard ? 'bg-purple-600 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                            }`}>
                                {user.canInitiateWhiteboard ? 'Inicia' : 'Recibe'}
                            </span>
                        </button>
                    </div>
                </div>
                
                {/* Mobile Actions Section */}
                <div className="space-y-2">
                    <button
                        type="button"
                        onClick={() => onViewDetail(user)}
                        className="w-full py-2 px-3 text-xs font-bold rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white flex items-center justify-center gap-2 shadow-sm transition-all"
                    >
                        <EyeIcon className="w-4 h-4" />
                        <span>Ver Expediente Académico Completo</span>
                    </button>

                    <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
                        {convoId && onViewChat && (
                            <button
                                type="button"
                                onClick={() => onViewChat(convoId)}
                                className={`py-2 px-1.5 text-[11px] font-bold rounded-lg flex flex-col items-center justify-center gap-1 border transition-all ${
                                    hasUnread
                                        ? 'bg-red-100 dark:bg-red-950/50 text-red-700 dark:text-red-300 border-red-300 animate-pulse'
                                        : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:bg-indigo-50'
                                }`}
                            >
                                <ChatBubbleLeftRightIcon className="w-4 h-4 text-indigo-600" />
                                <span>Chat</span>
                            </button>
                        )}
                        {onOpenCommunication && (
                            <button
                                type="button"
                                onClick={() => onOpenCommunication({ type: 'specific', userId: user.id, userType: 'student' }, 'message')}
                                className="py-2 px-1.5 text-[11px] font-bold rounded-lg bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 flex flex-col items-center justify-center gap-1 hover:bg-indigo-50 transition-all"
                            >
                                <span className="text-base leading-none">💌</span>
                                <span>Mensaje</span>
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={() => onEditCourse(user)}
                            className="py-2 px-1.5 text-[11px] font-bold rounded-lg bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 flex flex-col items-center justify-center gap-1 hover:bg-blue-50 transition-all"
                        >
                            <PencilIcon className="w-4 h-4 text-blue-600" />
                            <span>Cursos</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => onResetPassword(user)}
                            className="py-2 px-1.5 text-[11px] font-bold rounded-lg bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 flex flex-col items-center justify-center gap-1 hover:bg-amber-50 transition-all"
                        >
                            <LockClosedIcon className="w-4 h-4 text-amber-600" />
                            <span>Clave</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => navigate(`${ROUTES.ADMIN_SUBSCRIPTION}?studentId=${user.id}`)}
                            className="py-2 px-1.5 text-[11px] font-bold rounded-lg bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 flex flex-col items-center justify-center gap-1 hover:bg-emerald-50 transition-all"
                        >
                            <CreditCardIcon className="w-4 h-4 text-emerald-600" />
                            <span>Finanzas</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => onDelete(user)}
                            className="py-2 px-1.5 text-[11px] font-bold rounded-lg bg-white dark:bg-slate-800 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-900/40 flex flex-col items-center justify-center gap-1 hover:bg-rose-50 transition-all"
                        >
                            <TrashIcon className="w-4 h-4" />
                            <span>Eliminar</span>
                        </button>
                    </div>
                </div>
            </div>
            
            {/* Details for Desktop (Table View) */}
            <div className="hidden lg:block col-span-2 text-sm text-slate-800 dark:text-slate-200 font-medium truncate pr-2" title={courseNames}>
                {courseNames}
            </div>
            <div className="hidden lg:block col-span-1 text-sm min-w-0 pr-1">
                <select
                    value={user.assignedTeacherId || ''}
                    onChange={(e) => onAssignTeacher(user.id, e.target.value || null)}
                    className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg text-xs py-1.5 px-2 focus:outline-none focus:ring-1 focus:ring-primary font-medium text-slate-750 dark:text-slate-200 outline-none cursor-pointer w-full max-w-[120px] truncate"
                    title="Asignar profesor o tutor"
                >
                    <option value="">Sin tutor</option>
                    {teachers?.map(t => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                </select>
            </div>
            <div className="hidden lg:block col-span-2 text-sm px-1 min-w-0">
                {!subscriptionsEnabledGlobally ? (
                    <span className="text-[11px] text-rose-600 dark:text-rose-400 font-black uppercase bg-rose-50 dark:bg-rose-950/20 px-2.5 py-1 rounded-lg border border-rose-200 dark:border-rose-900/30 text-center inline-block whitespace-nowrap" title="Las suscripciones están desactivadas globalmente">
                        🛑 Off
                    </span>
                ) : (
                    <div className="flex items-center min-w-0">
                        <select
                            value={user.isSubscribed ? (user.subscriptionPeriod || 'monthly') : 'free'}
                            onChange={(e) => {
                                const val = e.target.value;
                                if (val === 'free') {
                                    if (user.isSubscribed) {
                                        onToggleSubscription(user.id, undefined);
                                    }
                                } else {
                                    onToggleSubscription(user.id, val as 'monthly' | 'annual');
                                }
                            }}
                            disabled={isSubscriptionPending}
                            className={`bg-white dark:bg-slate-800 border rounded-lg text-xs py-1.5 px-2 focus:outline-none focus:ring-1 focus:ring-primary outline-none cursor-pointer w-full max-w-[130px] font-bold shadow-2xs transition-all ${
                                user.isSubscribed
                                    ? user.subscriptionPeriod === 'annual'
                                        ? 'border-indigo-400 text-indigo-700 dark:text-indigo-300 bg-indigo-50/40 dark:bg-indigo-950/30'
                                        : 'border-emerald-400 text-emerald-700 dark:text-emerald-300 bg-emerald-50/40 dark:bg-emerald-950/30'
                                    : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                            }`}
                        >
                            <option value="free">🛑 Gratuito</option>
                            <option value="monthly">💎 Mensual</option>
                            <option value="annual">⭐ Anual</option>
                        </select>
                    </div>
                )}
            </div>
            
            {/* Permissions IA, Videos, Calls & Whiteboard Column */}
            <div className="hidden lg:block col-span-2 text-sm px-1 min-w-0">
                <div className="flex flex-col gap-1 bg-slate-50/90 dark:bg-slate-900/70 p-1.5 rounded-xl border border-slate-200/80 dark:border-slate-800">
                    {/* Row 1: IA & Videos */}
                    <div className="grid grid-cols-2 gap-1 min-w-0">
                        <button
                            type="button"
                            onClick={() => onUpdatePermissions(user.id, 'student', {
                                aiEnabled: !(user.aiEnabled !== false),
                                videosEnabled: user.videosEnabled !== false,
                                canInitiateCalls: user.canInitiateCalls === true,
                                canInitiateWhiteboard: user.canInitiateWhiteboard === true
                            })}
                            disabled={!aiEnabledGlobally}
                            className={`px-1.5 py-1 text-[11px] font-bold rounded-lg border flex items-center justify-between gap-1 transition-all cursor-pointer shadow-2xs min-w-0 ${
                                !aiEnabledGlobally
                                    ? 'bg-slate-100 text-slate-400 border-slate-200 dark:bg-slate-800/40 dark:text-slate-600 dark:border-slate-800 cursor-not-allowed opacity-60'
                                    : user.aiEnabled !== false
                                        ? 'bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-300/80 dark:border-amber-700/60 hover:bg-amber-500/25'
                                        : 'bg-white dark:bg-slate-800 text-slate-400 dark:text-slate-500 border-slate-200 dark:border-slate-700 hover:text-slate-700 dark:hover:text-slate-300'
                            }`}
                            title={!aiEnabledGlobally ? "La IA está desactivada globalmente en Ajustes" : user.aiEnabled !== false ? "IA Activada (Clic para desactivar)" : "IA Desactivada (Clic para habilitar)"}
                        >
                            <div className="flex items-center gap-1 min-w-0 truncate">
                                <SparklesIcon className="w-3 h-3 text-amber-500 flex-shrink-0" />
                                <span className="truncate">IA</span>
                            </div>
                            <span className={`text-[9px] px-1 py-0.5 rounded font-black flex-shrink-0 leading-none ${
                                !aiEnabledGlobally
                                    ? 'bg-slate-200 text-slate-500 dark:bg-slate-700'
                                    : user.aiEnabled !== false
                                        ? 'bg-amber-500 text-white dark:bg-amber-400 dark:text-slate-950'
                                        : 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
                            }`}>
                                {!aiEnabledGlobally ? 'OFF' : user.aiEnabled !== false ? 'ON' : 'OFF'}
                            </span>
                        </button>

                        <button
                            type="button"
                            onClick={() => onUpdatePermissions(user.id, 'student', {
                                aiEnabled: user.aiEnabled !== false,
                                videosEnabled: !(user.videosEnabled !== false),
                                canInitiateCalls: user.canInitiateCalls === true,
                                canInitiateWhiteboard: user.canInitiateWhiteboard === true
                            })}
                            disabled={!videosEnabledGlobally}
                            className={`px-1.5 py-1 text-[11px] font-bold rounded-lg border flex items-center justify-between gap-1 transition-all cursor-pointer shadow-2xs min-w-0 ${
                                !videosEnabledGlobally
                                    ? 'bg-slate-100 text-slate-400 border-slate-200 dark:bg-slate-800/40 dark:text-slate-600 dark:border-slate-800 cursor-not-allowed opacity-60'
                                    : user.videosEnabled !== false
                                        ? 'bg-blue-500/15 text-blue-800 dark:text-blue-300 border-blue-300/80 dark:border-blue-700/60 hover:bg-blue-500/25'
                                        : 'bg-white dark:bg-slate-800 text-slate-400 dark:text-slate-500 border-slate-200 dark:border-slate-700 hover:text-slate-700 dark:hover:text-slate-300'
                            }`}
                            title={!videosEnabledGlobally ? "Los vídeos están desactivados globalmente en Ajustes" : user.videosEnabled !== false ? "Vídeos Activados (Clic para desactivar)" : "Vídeos Desactivados (Clic para habilitar)"}
                        >
                            <div className="flex items-center gap-1 min-w-0 truncate">
                                <VideoCameraIcon className="w-3 h-3 text-blue-500 flex-shrink-0" />
                                <span className="truncate">Vídeo</span>
                            </div>
                            <span className={`text-[9px] px-1 py-0.5 rounded font-black flex-shrink-0 leading-none ${
                                !videosEnabledGlobally
                                    ? 'bg-slate-200 text-slate-500 dark:bg-slate-700'
                                    : user.videosEnabled !== false
                                        ? 'bg-blue-600 text-white'
                                        : 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
                            }`}>
                                {!videosEnabledGlobally ? 'OFF' : user.videosEnabled !== false ? 'ON' : 'OFF'}
                            </span>
                        </button>
                    </div>

                    {/* Row 2: Llamadas & Pizarra */}
                    <div className="grid grid-cols-2 gap-1 min-w-0">
                        <button
                            type="button"
                            onClick={() => onUpdatePermissions(user.id, 'student', {
                                aiEnabled: user.aiEnabled !== false,
                                videosEnabled: user.videosEnabled !== false,
                                canInitiateCalls: !(user.canInitiateCalls === true),
                                canInitiateWhiteboard: user.canInitiateWhiteboard === true
                            })}
                            className={`px-1.5 py-1 text-[11px] font-bold rounded-lg border flex items-center justify-between gap-1 transition-all cursor-pointer shadow-2xs min-w-0 ${
                                user.canInitiateCalls
                                    ? 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 border-emerald-300/80 dark:border-emerald-700/60 hover:bg-emerald-500/25'
                                    : 'bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:border-slate-300'
                            }`}
                            title={user.canInitiateCalls ? "📞 Puede INICIAR llamadas de voz (Clic para pasar a Solo Recibir)" : "🔒 Solo puede RECIBIR llamadas (Clic para autorizar iniciar)"}
                        >
                            <div className="flex items-center gap-1 min-w-0 truncate">
                                <Phone className="w-3 h-3 text-emerald-600 flex-shrink-0" />
                                <span className="truncate">Voz</span>
                            </div>
                            <span className={`text-[9px] px-1 py-0.5 rounded font-black flex-shrink-0 leading-none ${
                                user.canInitiateCalls
                                    ? 'bg-emerald-600 text-white'
                                    : 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
                            }`}>
                                {user.canInitiateCalls ? 'Inicia' : 'Recibe'}
                            </span>
                        </button>

                        <button
                            type="button"
                            onClick={() => onUpdatePermissions(user.id, 'student', {
                                aiEnabled: user.aiEnabled !== false,
                                videosEnabled: user.videosEnabled !== false,
                                canInitiateCalls: user.canInitiateCalls === true,
                                canInitiateWhiteboard: !(user.canInitiateWhiteboard === true)
                            })}
                            className={`px-1.5 py-1 text-[11px] font-bold rounded-lg border flex items-center justify-between gap-1 transition-all cursor-pointer shadow-2xs min-w-0 ${
                                user.canInitiateWhiteboard
                                    ? 'bg-purple-500/15 text-purple-800 dark:text-purple-300 border-purple-300/80 dark:border-purple-700/60 hover:bg-purple-500/25'
                                    : 'bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:border-slate-300'
                            }`}
                            title={user.canInitiateWhiteboard ? "🎨 Puede INICIAR pizarras digitales (Clic para pasar a Solo Recibir)" : "🔒 Solo puede RECIBIR pizarras (Clic para autorizar iniciar)"}
                        >
                            <div className="flex items-center gap-1 min-w-0 truncate">
                                <PenTool className="w-3 h-3 text-purple-600 flex-shrink-0" />
                                <span className="truncate">Pizarra</span>
                            </div>
                            <span className={`text-[9px] px-1 py-0.5 rounded font-black flex-shrink-0 leading-none ${
                                user.canInitiateWhiteboard
                                    ? 'bg-purple-600 text-white'
                                    : 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
                            }`}>
                                {user.canInitiateWhiteboard ? 'Inicia' : 'Recibe'}
                            </span>
                        </button>
                    </div>
                </div>
            </div>
            
            {/* Actions Column */}
            <div className="hidden lg:flex col-span-2 text-sm font-medium items-center justify-end gap-1.5 px-1">
                <div className="flex items-center gap-1 bg-slate-50/80 dark:bg-slate-900/60 p-1.5 rounded-xl border border-slate-200/70 dark:border-slate-800/80 flex-wrap justify-end">
                    {/* Primary Action: Expediente */}
                    <button
                        type="button"
                        onClick={() => onViewDetail(user)}
                        className="p-1.5 px-2 text-xs font-bold rounded-lg transition-all bg-indigo-600 hover:bg-indigo-700 text-white flex items-center gap-1 shadow-xs cursor-pointer"
                        title={`Ver expediente académico de ${user.name}`}
                    >
                        <EyeIcon className="w-3.5 h-3.5" />
                        <span className="hidden xl:inline text-[11px]">Ficha</span>
                    </button>

                    {/* Chat button */}
                    {convoId && onViewChat && (
                        <button
                            type="button"
                            onClick={() => onViewChat(convoId)}
                            className={`p-1.5 text-xs font-bold rounded-lg transition-all border relative cursor-pointer ${
                                hasUnread 
                                ? 'bg-red-500 text-white border-red-600 animate-pulse shadow-xs' 
                                : 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 border-slate-200 dark:border-slate-700'
                            }`}
                            title="Abrir chat directo con el alumno"
                        >
                            <ChatBubbleLeftRightIcon className="w-3.5 h-3.5" />
                            {hasUnread && (
                                <span className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full ring-2 ring-white dark:ring-slate-900 animate-ping" />
                            )}
                        </button>
                    )}

                    {/* Direct communication modal button */}
                    {onOpenCommunication && (
                        <button
                            type="button"
                            onClick={() => onOpenCommunication({ type: 'specific', userId: user.id, userType: 'student' }, 'message')}
                            className="p-1.5 text-xs font-bold rounded-lg transition-all bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-indigo-50 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 cursor-pointer"
                            title={`Enviar Email o WhatsApp a ${user.name}`}
                        >
                            <span className="text-xs leading-none">💌</span>
                        </button>
                    )}

                    {/* Manage enrolled courses */}
                    <button
                        type="button"
                        onClick={() => onEditCourse(user)}
                        className="p-1.5 text-xs font-bold rounded-lg transition-all bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-blue-50 dark:hover:bg-blue-950/40 hover:text-blue-600 border border-slate-200 dark:border-slate-700 cursor-pointer"
                        title="Matricular o cambiar cursos asignados"
                    >
                        <PencilIcon className="w-3.5 h-3.5" />
                    </button>

                    {/* Reset password */}
                    <button
                        type="button"
                        onClick={() => onResetPassword(user)}
                        className="p-1.5 text-xs font-bold rounded-lg transition-all bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-amber-50 dark:hover:bg-amber-950/40 hover:text-amber-600 border border-slate-200 dark:border-slate-700 cursor-pointer"
                        title="Cambiar o restablecer contraseña"
                    >
                        <LockClosedIcon className="w-3.5 h-3.5" />
                    </button>

                    {/* Billing & accounting */}
                    <button
                        type="button"
                        onClick={() => navigate(`${ROUTES.ADMIN_SUBSCRIPTION}?studentId=${user.id}`)}
                        className="p-1.5 text-xs font-bold rounded-lg transition-all bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 hover:text-emerald-600 border border-slate-200 dark:border-slate-700 cursor-pointer"
                        title="Gestionar planes, pagos y contabilidad del alumno"
                    >
                        <CreditCardIcon className="w-3.5 h-3.5" />
                    </button>

                    {/* Delete user */}
                    <button
                        type="button"
                        onClick={() => onDelete(user)}
                        className="p-1.5 text-xs font-bold rounded-lg transition-all bg-white dark:bg-slate-800 text-slate-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 hover:text-rose-600 hover:border-rose-200 dark:hover:border-rose-900 border border-slate-200 dark:border-slate-700 cursor-pointer"
                        title="Eliminar este estudiante"
                    >
                        <TrashIcon className="w-3.5 h-3.5" />
                    </button>
                </div>
            </div>
        </div>
    );
});
UserRow.displayName = 'UserRow';

interface StudentDetailDrawerProps {
    student: StudentUser;
    onClose: () => void;
    courses: CourseLevel[];
    teachers: TeacherUser[];
    conversations: any[];
    onViewChat: (studentId: string) => void;
}

const StudentDetailDrawer: React.FC<StudentDetailDrawerProps> = ({
    student,
    onClose,
    courses,
    teachers,
    conversations,
    onViewChat,
}) => {
    const queryClient = useQueryClient();
    const { addToast } = useContext(NotificationContext);
    const { appConfig } = useContext(AppConfigContext);
    const aiEnabledGlobally = appConfig?.aiEnabled !== false;
    const videosEnabledGlobally = appConfig?.videosEnabled !== false;
    const navigate = useNavigate();
    const [notes, setNotes] = useState(student.adminNotes || '');

    const convertToTeacherMutation = useMutation({
        mutationFn: () => api.assignUserRoleByEmail({ email: student.email, role: 'teacher', category: 'General' }),
        onSuccess: (res) => {
            queryClient.invalidateQueries({ queryKey: ['users'] });
            queryClient.invalidateQueries({ queryKey: ['teachers'] });
            addToast(res.message || `Estudiante convertido a profesor correctamente.`, 'success');
            onClose();
        },
        onError: (err: any) => {
            addToast(err?.message || 'Error al cambiar el rol del usuario.', 'error');
        }
    });

    const videoTitleMap = useMemo(() => {
        const map = new Map<string, string>();
        courses.forEach(course => {
            course.subjects?.forEach(subject => {
                subject.videos?.forEach(v => {
                    map.set(v.id, `${subject.name}: ${v.title}`);
                });
                subject.blocks?.forEach(block => {
                    block.videos?.forEach(bv => {
                        map.set(bv.id, `${subject.name} (${block.name}): ${bv.title}`);
                    });
                });
            });
        });
        return map;
    }, [courses]);

    const getVideoTitle = (videoId: string) => {
        return videoTitleMap.get(videoId) || `Evaluación (${videoId})`;
    };

    const { data: answers, isLoading: answersLoading } = useQuery({
        queryKey: ['student-answers', student.id],
        queryFn: () => api.fetchStudentAnswers(student.id),
        enabled: !!student.id && !!auth.currentUser,
    });

    const updateNotesMutation = useMutation({
        mutationFn: (newNotes: string) => api.updateStudentNotes(student.id, newNotes),
        onSuccess: (updatedStudent) => {
            queryClient.invalidateQueries({ queryKey: ['users'] });
            addToast(`Notas académicas de ${updatedStudent.name} actualizadas.`, 'success');
        },
        onError: () => {
            addToast('Error al actualizar las notas.', 'error');
        }
    });

    const handleSaveNotes = () => {
        updateNotesMutation.mutate(notes);
    };

    const studentCourses = student.enrolledCourseIds
        .map(id => courses.find(c => c.id === id))
        .filter(Boolean);

    const tutor = teachers.find(t => t.id === student.assignedTeacherId);
    const hasUnread = conversations?.find(c => c.studentId === student.id)?.unreadByAdmin;

    // Calculate progress
    const totalVideos = studentCourses.reduce((acc, c) => {
        let count = 0;
        c?.subjects?.forEach(s => {
            s.blocks?.forEach(b => {
                count += b.videos?.length || 0;
            });
            count += s.videos?.length || 0;
        });
        return acc + count;
    }, 0);

    const watchedCount = student.watchedVideos?.length || 0;
    const progressPercent = totalVideos > 0 ? Math.round((watchedCount / totalVideos) * 100) : 0;

    return (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[9999] flex justify-end animate-fade-in" onClick={onClose}>
            <div 
                className="w-full max-w-xl bg-white dark:bg-slate-900 h-full flex flex-col shadow-2xl relative animate-slide-in overflow-hidden"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="p-6 border-b border-gray-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 flex justify-between items-center">
                    <div className="flex items-center gap-3">
                        <img 
                            className="h-12 w-12 rounded-full border border-slate-200 bg-white shadow-sm" 
                            src={`https://api.dicebear.com/8.x/initials/svg?seed=${student.name}`} 
                            alt={student.name} 
                        />
                        <div>
                            <h3 className="font-black text-xl text-slate-800 dark:text-white leading-tight">{student.name}</h3>
                            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-0.5">{student.email}</p>
                        </div>
                    </div>
                    <button 
                        onClick={onClose}
                        className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-755 text-slate-500 hover:text-slate-700 transition"
                    >
                        <CloseIcon className="w-5 h-5" />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {/* Role conversion action */}
                    <div className="bg-indigo-50/60 dark:bg-indigo-950/20 p-4 rounded-xl border border-indigo-100 dark:border-indigo-900/40 flex items-center justify-between">
                        <div>
                            <h4 className="text-xs font-black text-indigo-900 dark:text-indigo-300 uppercase tracking-wider">Gestión de Rol de Usuario</h4>
                            <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">Convierte este estudiante en profesor para asignarle categoría y permisos docentes.</p>
                        </div>
                        <button
                            onClick={() => {
                                if (window.confirm(`¿Estás seguro de convertir a ${student.name} en Profesor? Su expediente pasará a la sección de profesores.`)) {
                                    convertToTeacherMutation.mutate();
                                }
                            }}
                            disabled={convertToTeacherMutation.isPending}
                            className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm cursor-pointer whitespace-nowrap"
                        >
                            🔄 Cambiar a Profesor
                        </button>
                    </div>

                    {/* General Metadata Info */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="bg-slate-50 dark:bg-slate-800 p-3.5 rounded-xl border border-gray-100 dark:border-slate-700/60">
                            <span className="text-[10px] uppercase font-bold text-slate-400 dark:text-slate-500 tracking-wider">Teléfono</span>
                            <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 mt-0.5">{student.phone || 'No registrado'}</p>
                        </div>
                        <div className="bg-slate-50 dark:bg-slate-800 p-3.5 rounded-xl border border-gray-100 dark:border-slate-700/60">
                            <span className="text-[10px] uppercase font-bold text-slate-400 dark:text-slate-500 tracking-wider">Fecha Registro</span>
                            <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 mt-0.5">{new Date(student.registrationDate).toLocaleDateString()}</p>
                        </div>
                        <div className="bg-slate-50 dark:bg-slate-800 p-3.5 rounded-xl border border-gray-100 dark:border-slate-700/60 flex flex-col justify-between">
                            <div>
                                <span className="text-[10px] uppercase font-bold text-slate-400 dark:text-slate-500 tracking-wider">Suscripción</span>
                                <p className="text-sm font-bold mt-0.5">
                                    {student.isSubscribed ? (
                                        <span className="text-emerald-600 dark:text-emerald-400">Premium ({student.subscriptionPeriod === 'annual' ? 'Anual' : 'Mensual'})</span>
                                    ) : (
                                        <span className="text-slate-500">Gratuito (No suscrito)</span>
                                    )}
                                </p>
                            </div>
                            <button
                                onClick={() => {
                                    onClose();
                                    navigate(`${ROUTES.ADMIN_SUBSCRIPTION}?studentId=${student.id}`);
                                }}
                                className="mt-2 text-left text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-350 transition-colors flex items-center gap-1"
                            >
                                💳 Ver Finanzas →
                            </button>
                        </div>
                        <div className="bg-slate-50 dark:bg-slate-800 p-3.5 rounded-xl border border-gray-100 dark:border-slate-700/60">
                            <span className="text-[10px] uppercase font-bold text-slate-400 dark:text-slate-500 tracking-wider">Tutor Asignado</span>
                            <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 mt-0.5">{tutor ? tutor.name : 'Sin tutor'}</p>
                        </div>
                    </div>

                    {/* Permisos y Capacidades del Alumno */}
                    <div className="bg-slate-50 dark:bg-slate-800/80 p-4 rounded-xl border border-slate-200 dark:border-slate-700/80 space-y-3">
                        <div className="flex items-center justify-between">
                            <h4 className="text-xs font-black text-slate-800 dark:text-slate-100 uppercase tracking-wider flex items-center gap-1.5">
                                <ShieldAlert className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                                Permisos y Capacidades del Estudiante
                            </h4>
                            <span className="text-[11px] text-slate-400 font-medium">Sincronización en tiempo real</span>
                        </div>

                        {/* IA Assistant */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200 dark:border-slate-800 gap-3 shadow-2xs">
                            <div className="flex items-start gap-2.5">
                                <div className="p-2 rounded-lg bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 mt-0.5">
                                    <SparklesIcon className="w-4 h-4" />
                                </div>
                                <div>
                                    <p className="text-xs font-bold text-slate-800 dark:text-slate-200">Asistente IA Tutor Infinity</p>
                                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                                        {!aiEnabledGlobally 
                                            ? '🛑 Desactivado globalmente por el administrador general en Ajustes.' 
                                            : student.aiEnabled !== false 
                                                ? 'Permitido: El estudiante puede interactuar con el tutor de IA inteligente.' 
                                                : 'Restringido: El estudiante no tiene acceso al asistente de IA.'}
                                    </p>
                                </div>
                            </div>
                            <button
                                type="button"
                                disabled={!aiEnabledGlobally}
                                onClick={() => {
                                    const nextVal = !(student.aiEnabled !== false);
                                    api.updateUserPermissions(student.id, 'student', {
                                        aiEnabled: nextVal,
                                        videosEnabled: student.videosEnabled !== false,
                                        canInitiateCalls: student.canInitiateCalls === true,
                                        canInitiateWhiteboard: student.canInitiateWhiteboard === true
                                    }).then(() => {
                                        queryClient.invalidateQueries({ queryKey: ['users'] });
                                        addToast(`Acceso a IA actualizado para ${student.name}.`, 'success');
                                    }).catch(() => {
                                        addToast('Error al actualizar permisos de IA.', 'error');
                                    });
                                }}
                                className={`px-3 py-1.5 text-xs font-bold rounded-lg border transition-all cursor-pointer whitespace-nowrap ${
                                    !aiEnabledGlobally
                                        ? 'bg-slate-100 text-slate-400 border-slate-200 dark:bg-slate-800 cursor-not-allowed opacity-60'
                                        : student.aiEnabled !== false
                                            ? 'bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-700'
                                            : 'bg-slate-100 text-slate-600 border-slate-300 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700'
                                }`}
                            >
                                {!aiEnabledGlobally ? '🛑 Global Off' : student.aiEnabled !== false ? '✨ IA Activa' : '🔒 IA Bloqueada'}
                            </button>
                        </div>

                        {/* Video Lessons */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200 dark:border-slate-800 gap-3 shadow-2xs">
                            <div className="flex items-start gap-2.5">
                                <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 mt-0.5">
                                    <VideoCameraIcon className="w-4 h-4" />
                                </div>
                                <div>
                                    <p className="text-xs font-bold text-slate-800 dark:text-slate-200">Acceso a Videoclases y Clases Grabadas</p>
                                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                                        {!videosEnabledGlobally 
                                            ? '🛑 Desactivado globalmente por el administrador en Ajustes.' 
                                            : student.videosEnabled !== false 
                                                ? 'Permitido: El estudiante puede ver todos los vídeos y grabaciones de sus cursos.' 
                                                : 'Restringido: Acceso a reproducción de vídeos bloqueado.'}
                                    </p>
                                </div>
                            </div>
                            <button
                                type="button"
                                disabled={!videosEnabledGlobally}
                                onClick={() => {
                                    const nextVal = !(student.videosEnabled !== false);
                                    api.updateUserPermissions(student.id, 'student', {
                                        aiEnabled: student.aiEnabled !== false,
                                        videosEnabled: nextVal,
                                        canInitiateCalls: student.canInitiateCalls === true,
                                        canInitiateWhiteboard: student.canInitiateWhiteboard === true
                                    }).then(() => {
                                        queryClient.invalidateQueries({ queryKey: ['users'] });
                                        addToast(`Acceso a vídeos actualizado para ${student.name}.`, 'success');
                                    }).catch(() => {
                                        addToast('Error al actualizar permisos de vídeos.', 'error');
                                    });
                                }}
                                className={`px-3 py-1.5 text-xs font-bold rounded-lg border transition-all cursor-pointer whitespace-nowrap ${
                                    !videosEnabledGlobally
                                        ? 'bg-slate-100 text-slate-400 border-slate-200 dark:bg-slate-800 cursor-not-allowed opacity-60'
                                        : student.videosEnabled !== false
                                            ? 'bg-blue-500/15 text-blue-800 dark:text-blue-300 border-blue-300 dark:border-blue-700'
                                            : 'bg-slate-100 text-slate-600 border-slate-300 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700'
                                }`}
                            >
                                {!videosEnabledGlobally ? '🛑 Global Off' : student.videosEnabled !== false ? '📹 Vídeos Activos' : '🔒 Vídeos Bloqueados'}
                            </button>
                        </div>

                        {/* Voice Calls */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200 dark:border-slate-800 gap-3 shadow-2xs">
                            <div className="flex items-start gap-2.5">
                                <div className="p-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 mt-0.5">
                                    <Phone className="w-4 h-4" />
                                </div>
                                <div>
                                    <p className="text-xs font-bold text-slate-800 dark:text-slate-200">Permiso para Iniciar Llamadas de Voz</p>
                                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                                        {student.canInitiateCalls 
                                            ? 'Permitido: El alumno puede realizar e iniciar llamadas directas.' 
                                            : 'Modo seguro: El alumno solo puede recibir llamadas creadas por un profesor o tutor.'}
                                    </p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => {
                                    const nextVal = !(student.canInitiateCalls === true);
                                    api.updateUserPermissions(student.id, 'student', {
                                        aiEnabled: student.aiEnabled !== false,
                                        videosEnabled: student.videosEnabled !== false,
                                        canInitiateCalls: nextVal,
                                        canInitiateWhiteboard: student.canInitiateWhiteboard === true
                                    }).then(() => {
                                        queryClient.invalidateQueries({ queryKey: ['users'] });
                                        addToast(`Permiso de llamadas actualizado para ${student.name}.`, 'success');
                                    }).catch(() => {
                                        addToast('Error al actualizar permisos.', 'error');
                                    });
                                }}
                                className={`px-3 py-1.5 text-xs font-bold rounded-lg border transition-all cursor-pointer whitespace-nowrap ${
                                    student.canInitiateCalls
                                        ? 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700'
                                        : 'bg-slate-100 text-slate-600 border-slate-300 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700'
                                }`}
                            >
                                {student.canInitiateCalls ? '📞 Puede Iniciar' : '🔒 Solo Recibir'}
                            </button>
                        </div>

                        {/* Digital Whiteboard */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200 dark:border-slate-800 gap-3 shadow-2xs">
                            <div className="flex items-start gap-2.5">
                                <div className="p-2 rounded-lg bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400 mt-0.5">
                                    <PenTool className="w-4 h-4" />
                                </div>
                                <div>
                                    <p className="text-xs font-bold text-slate-800 dark:text-slate-200">Permiso para Iniciar Pizarra Digital</p>
                                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                                        {student.canInitiateWhiteboard 
                                            ? 'Permitido: El alumno puede abrir pizarras interactivas de dibujo.' 
                                            : 'Modo seguro: El alumno solo puede unirse a pizarras creadas por un profesor.'}
                                    </p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => {
                                    const nextVal = !(student.canInitiateWhiteboard === true);
                                    api.updateUserPermissions(student.id, 'student', {
                                        aiEnabled: student.aiEnabled !== false,
                                        videosEnabled: student.videosEnabled !== false,
                                        canInitiateCalls: student.canInitiateCalls === true,
                                        canInitiateWhiteboard: nextVal
                                    }).then(() => {
                                        queryClient.invalidateQueries({ queryKey: ['users'] });
                                        addToast(`Permiso de pizarra actualizado para ${student.name}.`, 'success');
                                    }).catch(() => {
                                        addToast('Error al actualizar permisos.', 'error');
                                    });
                                }}
                                className={`px-3 py-1.5 text-xs font-bold rounded-lg border transition-all cursor-pointer whitespace-nowrap ${
                                    student.canInitiateWhiteboard
                                        ? 'bg-purple-500/15 text-purple-800 dark:text-purple-300 border-purple-300 dark:border-purple-700'
                                        : 'bg-slate-100 text-slate-600 border-slate-300 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700'
                                }`}
                            >
                                {student.canInitiateWhiteboard ? '🎨 Puede Iniciar' : '🔒 Solo Recibir'}
                            </button>
                        </div>
                    </div>

                    {/* Progress watched videos */}
                    <div className="bg-slate-50 dark:bg-slate-800 p-4 rounded-xl border border-gray-100 dark:border-slate-700/60">
                        <div className="flex justify-between items-center mb-2">
                            <span className="text-xs font-bold text-slate-700 dark:text-slate-200">Progreso del Plan de Estudio</span>
                            <span className="text-xs font-mono font-black text-indigo-600 dark:text-indigo-400">{progressPercent}% ({watchedCount} de {totalVideos} videos)</span>
                        </div>
                        <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2">
                            <div className="bg-indigo-600 h-2 rounded-full transition-all duration-300" style={{ width: `${progressPercent}%` }}></div>
                        </div>
                    </div>

                    {/* Private Admin Notes */}
                    <div className="bg-amber-50/40 dark:bg-amber-950/10 p-5 rounded-xl border border-amber-100/60 dark:border-amber-900/20">
                        <div className="flex items-center gap-1.5 mb-2.5">
                            <span className="text-sm font-bold text-amber-800 dark:text-amber-400 flex items-center gap-1.5">
                                📝 Notas de Seguimiento Internas (Privadas)
                            </span>
                        </div>
                        <textarea
                            value={notes}
                            onChange={e => setNotes(e.target.value)}
                            placeholder="Añade notas privadas para el seguimiento académico del alumno (ej. dificultades, fortalezas, llamadas telefónicas realizadas)..."
                            className="w-full h-24 p-3 bg-white dark:bg-slate-800 border border-amber-200 dark:border-amber-900/30 rounded-lg text-sm text-slate-700 dark:text-slate-300 focus:ring-1 focus:ring-amber-500 focus:border-amber-500 outline-none resize-none placeholder-slate-400"
                        />
                        <div className="flex justify-end mt-2">
                            <Button 
                                onClick={handleSaveNotes}
                                isLoading={updateNotesMutation.isPending}
                                className="bg-amber-600 hover:bg-amber-700 text-white border-transparent text-xs py-1.5 font-bold"
                            >
                                Guardar Notas
                            </Button>
                        </div>
                    </div>

                    {/* Quiz / Cuestionarios Historial */}
                    <div>
                        <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100 mb-3 flex items-center gap-1.5">
                            🏆 Calificaciones de Evaluaciones y Quizzes
                        </h4>
                        {answersLoading ? (
                            <div className="flex justify-center py-4">
                                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary"></div>
                            </div>
                        ) : answers && answers.length > 0 ? (
                            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                                {answers.map((ans, idx) => {
                                    const percent = Math.round((ans.score / ans.totalQuestions) * 100);
                                    const isApproved = percent >= 60;
                                    return (
                                        <div key={idx} className="bg-white dark:bg-slate-800 p-3 rounded-lg border border-gray-150 dark:border-slate-700 flex justify-between items-center text-xs">
                                            <div>
                                                <p className="font-bold text-slate-700 dark:text-slate-200 truncate max-w-[280px]" title={getVideoTitle(ans.videoId)}>
                                                    {getVideoTitle(ans.videoId)}
                                                </p>
                                                <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
                                                    📅 {new Date(ans.timestamp).toLocaleDateString()} a las {new Date(ans.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                </p>
                                            </div>
                                            <div className="text-right">
                                                <span className={`inline-block font-mono font-black text-sm ${isApproved ? 'text-emerald-600' : 'text-red-500'}`}>
                                                    {percent}%
                                                </span>
                                                <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
                                                    {ans.score}/{ans.totalQuestions} aciertos
                                                </p>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <div className="p-6 bg-slate-50 dark:bg-slate-800/50 rounded-xl text-center border border-dashed border-gray-250 dark:border-slate-700">
                                <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">El alumno aún no ha completado ningún cuestionario.</p>
                            </div>
                        )}
                    </div>

                    {/* Chat and Quick actions */}
                    <div>
                        <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100 mb-3">
                            💬 Canal de Tutoría
                        </h4>
                        <div className="p-4 bg-indigo-50/35 dark:bg-slate-800/45 rounded-xl border border-indigo-100/50 dark:border-slate-700 flex justify-between items-center">
                            <div>
                                <p className="text-xs font-bold text-slate-700 dark:text-slate-200">Mensajería en tiempo real</p>
                                <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 font-medium">
                                    {hasUnread ? '🔴 Tienes consultas pendientes sin leer de este estudiante' : 'Al día con las consultas del estudiante'}
                                </p>
                            </div>
                            <Button
                                onClick={() => onViewChat(student.id)}
                                className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs py-1.5 px-3 font-semibold"
                            >
                                Ir al Chat
                            </Button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export const AdminUsersPage: React.FC = () => {
    const { user } = useContext(AuthContext);
    const queryClient = useQueryClient();
    const navigate = useNavigate();
    const location = useLocation();
    const handleBack = useBackNavigation('/admin/dashboard');
    const { addToast } = useContext(NotificationContext);
    const { acknowledgeNewUsers, acknowledgeNewSubscriptions, conversations, acknowledgeNewStudents, acknowledgeNewTeachers } = useContext(AdminNotificationContext);
    const { appConfig } = useContext(AppConfigContext);
    const [isMobile, setIsMobile] = useState(false);

    const aiEnabledGlobally = appConfig?.aiEnabled !== false;
    const videosEnabledGlobally = appConfig?.videosEnabled !== false;
    const subscriptionsEnabledGlobally = appConfig?.subscriptionsEnabled !== false;

    // Fast O(1) lookups
    const conversationsMap = useMemo(() => {
        const map = new Map<string, any>();
        conversations?.forEach(c => {
            map.set(c.studentId, c);
        });
        return map;
    }, [conversations]);

    // Determine initial viewMode based on URL query parameter (?view=teachers)
    const initialViewMode = useMemo(() => {
        const params = new URLSearchParams(location.search);
        return params.get('view') === 'teachers' ? 'teachers' : 'students';
    }, [location.search]);

    const [viewMode, setViewMode] = useState<'students' | 'teachers'>(initialViewMode);
    const [isCommunicationModalOpen, setIsCommunicationModalOpen] = useState<boolean>(false);
    const [communicationRecipient, setCommunicationRecipient] = useState<{ type: 'specific'; userId: string; userType: 'student' | 'teacher' } | null>(null);
    const [communicationTab, setCommunicationTab] = useState<'message' | 'test_whatsapp'>('message');

    const handleOpenCommunication = useCallback((recipient?: { type: 'specific'; userId: string; userType: 'student' | 'teacher' } | null, tab: 'message' | 'test_whatsapp' = 'message') => {
        setCommunicationRecipient(recipient || null);
        setCommunicationTab(tab);
        setIsCommunicationModalOpen(true);
    }, []);

    // Synchronize viewMode state when URL query parameter changes (e.g., via sidebar navigation click)
    useEffect(() => {
        const params = new URLSearchParams(location.search);
        const mode = params.get('view') === 'teachers' ? 'teachers' : 'students';
        if (mode !== viewMode) {
            setViewMode(mode);
        }
    }, [location.search, viewMode]);

    const handleViewModeChange = (mode: 'students' | 'teachers') => {
        setViewMode(mode);
        navigate(`?view=${mode}`, { replace: true });
    };

    const initialSeenStudentIds = useMemo(() => {
        try {
            return JSON.parse(localStorage.getItem('seenStudentUserIds') || '[]');
        } catch (e) {
            return [];
        }
    }, []);
    
    useEffect(() => {
        const checkMobile = () => setIsMobile(window.innerWidth < 1024);
        checkMobile();
        window.addEventListener('resize', checkMobile);
        return () => window.removeEventListener('resize', checkMobile);
    }, []);

    const [searchTerm, setSearchTerm] = useState('');
    const [selectedCourseFilter, setSelectedCourseFilter] = useState('all');
    const [selectedSubFilter, setSelectedSubFilter] = useState('all');
    const [selectedTeacherFilter, setSelectedTeacherFilter] = useState('all');
    const [selectedNotificationFilter, setSelectedNotificationFilter] = useState('all');
    const debouncedSearchTerm = useDebounce(searchTerm, 300);
    const parentRef = useRef<HTMLDivElement>(null);

    // Dialog control states
    const [userToDelete, setUserToDelete] = useState<StudentUser | null>(null);
    const [userToEditCourse, setUserToEditCourse] = useState<StudentUser | null>(null);
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [userToResetPassword, setUserToResetPassword] = useState<StudentUser | null>(null);
    const [selectedStudentForDetail, setSelectedStudentForDetail] = useState<StudentUser | null>(null);

    // States
    const [isRoleChangeModalOpen, setIsRoleChangeModalOpen] = useState(false);

    // Bulk selection states
    const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
    const [isBulkCourseEditOpen, setIsBulkCourseEditOpen] = useState(false);
    const [isBulkDeleteOpen, setIsBulkDeleteOpen] = useState(false);
    const [isBulkSubmitting, setIsBulkSubmitting] = useState(false);
    const [isSyncingFirebase, setIsSyncingFirebase] = useState(false);

    // Query elements (must be declared before they are used in any useCallbacks or effects)
    const { data: users, isLoading: usersLoading, isError: usersError, refetch: refetchUsers } = useQuery<StudentUser[]>({
        queryKey: ['users'],
        queryFn: api.fetchUsers,
        enabled: !!user && !!user.id && !!auth.currentUser,
    });

    const { data: courses, isLoading: coursesLoading } = useQuery<CourseLevel[]>({
        queryKey: ['courses'],
        queryFn: api.fetchCourses,
        enabled: !!user && !!user.id && !!auth.currentUser,
    });

    const { data: teachers, isLoading: teachersLoading, refetch: refetchTeachers } = useQuery<TeacherUser[]>({
        queryKey: ['teachers'],
        queryFn: api.fetchTeachers,
        enabled: !!user && !!user.id && !!auth.currentUser,
    });
    
    const isLoading = usersLoading || coursesLoading;

    // Fast O(1) lookups
    const courseMap = useMemo(() => {
        const map = new Map<string, string>();
        courses?.forEach(c => {
            map.set(c.id, c.name);
        });
        return map;
    }, [courses]);

    const seenStudentIdsSet = useMemo(() => {
        return new Set<string>(initialSeenStudentIds);
    }, [initialSeenStudentIds]);

    const videoTitleMap = useMemo(() => {
        const map = new Map<string, string>();
        if (!courses) return map;
        courses.forEach(course => {
            course.subjects?.forEach(subject => {
                subject.videos?.forEach(v => {
                    map.set(v.id, `${subject.name}: ${v.title}`);
                });
                subject.blocks?.forEach(block => {
                    block.videos?.forEach(bv => {
                        map.set(bv.id, `${subject.name} (${block.name}): ${bv.title}`);
                    });
                });
            });
        });
        return map;
    }, [courses]);

    const assignRoleByEmailMutation = useMutation({
        mutationFn: (data: { email: string; role: 'student' | 'teacher'; category?: string }) => api.assignUserRoleByEmail(data),
        onSuccess: (res) => {
            queryClient.invalidateQueries({ queryKey: ['users'] });
            queryClient.invalidateQueries({ queryKey: ['teachers'] });
            setIsRoleChangeModalOpen(false);
            addToast(res.message, 'success');
        },
        onError: (err: any) => {
            addToast(err?.message || 'Error al asignar el rol por email.', 'error');
        }
    });

    const assignStudentTeacherMutation = useMutation({
        mutationFn: (data: { studentId: string; teacherId: string | null }) => api.assignStudentTeacher(data.studentId, data.teacherId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['users'] });
            queryClient.invalidateQueries({ queryKey: ['conversations'] });
            addToast('Tutor asignado con éxito.', 'success');
        },
        onError: () => {
            addToast('Error al asignar el tutor.', 'error');
        }
    });

    const handleAssignStudentTutor = useCallback((studentId: string, teacherId: string | null) => {
        assignStudentTeacherMutation.mutate({ studentId, teacherId });
    }, [assignStudentTeacherMutation]);

    // Derived live management stats
    const stats = useMemo(() => {
        const totalS = users?.length || 0;
        const premiumS = users?.filter(u => u.isSubscribed).length || 0;
        const freeS = totalS - premiumS;
        const unassignedS = users?.filter(u => !u.assignedTeacherId).length || 0;
        const totalT = teachers?.length || 0;
        
        let unreadChatCount = 0;
        if (conversations) {
            unreadChatCount = conversations.filter(c => c.unreadByAdmin).length;
        }

        return {
            totalS,
            premiumS,
            freeS,
            unassignedS,
            totalT,
            unreadChatCount
        };
    }, [users, teachers, conversations]);

    // Derived filtered users list
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
            
            const matchesTeacher = selectedTeacherFilter === 'all' ||
                                  (selectedTeacherFilter === 'none' && !user.assignedTeacherId) ||
                                  user.assignedTeacherId === selectedTeacherFilter;
            
            const convo = conversationsMap.get(user.id);
            const matchesNotification = selectedNotificationFilter === 'all' ||
                                        (selectedNotificationFilter === 'unread' && convo?.unreadByAdmin);

            return matchesSearch && matchesCourse && matchesSub && matchesTeacher && matchesNotification;
        });
    }, [users, debouncedSearchTerm, selectedCourseFilter, selectedSubFilter, selectedTeacherFilter, selectedNotificationFilter, conversationsMap]);

    const acknowledgeStudentsRef = useRef(acknowledgeNewStudents);
    const acknowledgeTeachersRef = useRef(acknowledgeNewTeachers);
    const acknowledgeSubscriptionsRef = useRef(acknowledgeNewSubscriptions);
    const acknowledgeUsersRef = useRef(acknowledgeNewUsers);

    useEffect(() => {
        acknowledgeStudentsRef.current = acknowledgeNewStudents;
    }, [acknowledgeNewStudents]);

    useEffect(() => {
        acknowledgeTeachersRef.current = acknowledgeNewTeachers;
    }, [acknowledgeNewTeachers]);

    useEffect(() => {
        acknowledgeSubscriptionsRef.current = acknowledgeNewSubscriptions;
    }, [acknowledgeNewSubscriptions]);

    useEffect(() => {
        acknowledgeUsersRef.current = acknowledgeNewUsers;
    }, [acknowledgeNewUsers]);

    const [hasAcknowledgedStudents, setHasAcknowledgedStudents] = useState(false);
    const [hasAcknowledgedTeachers, setHasAcknowledgedTeachers] = useState(false);

    // Reset acknowledgement flags when viewMode changes
    useEffect(() => {
        setHasAcknowledgedStudents(false);
        setHasAcknowledgedTeachers(false);
    }, [viewMode]);

    // Reset when users or teachers data updates so any new entry is marked seen if currently active
    useEffect(() => {
        setHasAcknowledgedStudents(false);
    }, [users]);

    useEffect(() => {
        setHasAcknowledgedTeachers(false);
    }, [teachers]);

    useEffect(() => {
        if (viewMode === 'students' && users && users.length > 0 && !hasAcknowledgedStudents) {
            acknowledgeStudentsRef.current();
            acknowledgeSubscriptionsRef.current();
            acknowledgeUsersRef.current();
            setHasAcknowledgedStudents(true);
        }
    }, [viewMode, users, hasAcknowledgedStudents]);

    useEffect(() => {
        if (viewMode === 'teachers' && teachers && teachers.length > 0 && !hasAcknowledgedTeachers) {
            acknowledgeTeachersRef.current();
            setHasAcknowledgedTeachers(true);
        }
    }, [viewMode, teachers, hasAcknowledgedTeachers]);

    // Clear selection when filters change to avoid accidental operations
    useEffect(() => {
        setSelectedUserIds([]);
    }, [selectedCourseFilter, selectedSubFilter, selectedTeacherFilter, selectedNotificationFilter, debouncedSearchTerm]);

    const handleSelectRow = useCallback((userId: string) => {
        setSelectedUserIds(prev =>
            prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
        );
    }, []);

    const handleSelectAllToggle = useCallback(() => {
        if (!filteredUsers) return;
        if (selectedUserIds.length === filteredUsers.length) {
            setSelectedUserIds([]);
        } else {
            setSelectedUserIds(filteredUsers.map(u => u.id));
        }
    }, [selectedUserIds, filteredUsers]);

    const handleBulkToggleSubscription = async () => {
        if (selectedUserIds.length === 0) return;
        setIsBulkSubmitting(true);
        try {
            for (const uid of selectedUserIds) {
                await api.toggleSubscriptionStatus(uid);
            }
            queryClient.invalidateQueries({ queryKey: ['users'] });
            addToast(`Suscripción actualizada para ${selectedUserIds.length} estudiantes con éxito.`, 'success');
            setSelectedUserIds([]);
        } catch (error) {
            addToast('Error al actualizar las suscripciones en lote.', 'error');
        } finally {
            setIsBulkSubmitting(false);
        }
    };

    const handleBulkUpdateCourses = async (newCourseIds: string[]) => {
        if (selectedUserIds.length === 0) return;
        setIsBulkSubmitting(true);
        try {
            for (const uid of selectedUserIds) {
                await api.updateStudentCourse(uid, newCourseIds);
            }
            queryClient.invalidateQueries({ queryKey: ['users'] });
            addToast('Matriculación actualizada en lote con éxito.', 'success');
            setSelectedUserIds([]);
            setIsBulkCourseEditOpen(false);
        } catch (error) {
            addToast('Error al matricular alumnos en lote.', 'error');
        } finally {
            setIsBulkSubmitting(false);
        }
    };

    const handleBulkDelete = async () => {
        if (selectedUserIds.length === 0) return;
        setIsBulkSubmitting(true);
        try {
            for (const uid of selectedUserIds) {
                await api.deleteUser(uid);
            }
            queryClient.invalidateQueries({ queryKey: ['users'] });
            addToast('Estudiantes seleccionados eliminados con éxito.', 'success');
            setSelectedUserIds([]);
        } catch (error) {
            addToast('Error al eliminar estudiantes en lote.', 'error');
        } finally {
            setIsBulkDeleteOpen(false);
            setIsBulkSubmitting(false);
        }
    };

    const handleBulkUpdatePermissions = async (perms: { 
        aiEnabled?: boolean; 
        videosEnabled?: boolean;
        canInitiateCalls?: boolean;
        canInitiateWhiteboard?: boolean;
    }) => {
        if (selectedUserIds.length === 0) return;
        setIsBulkSubmitting(true);
        try {
            for (const uid of selectedUserIds) {
                const user = filteredUsers.find(u => u.id === uid);
                if (user) {
                    const aiEnabled = perms.aiEnabled !== undefined ? perms.aiEnabled : (user.aiEnabled !== false);
                    const videosEnabled = perms.videosEnabled !== undefined ? perms.videosEnabled : (user.videosEnabled !== false);
                    const canInitiateCalls = perms.canInitiateCalls !== undefined ? perms.canInitiateCalls : (user.canInitiateCalls === true);
                    const canInitiateWhiteboard = perms.canInitiateWhiteboard !== undefined ? perms.canInitiateWhiteboard : (user.canInitiateWhiteboard === true);
                    await api.updateUserPermissions(uid, 'student', { 
                        aiEnabled, 
                        videosEnabled,
                        canInitiateCalls,
                        canInitiateWhiteboard
                    });
                }
            }
            queryClient.invalidateQueries({ queryKey: ['users'] });
            addToast('Permisos de alumnos actualizados en lote con éxito.', 'success');
            setSelectedUserIds([]);
        } catch (error) {
            addToast('Error al actualizar permisos en lote.', 'error');
        } finally {
            setIsBulkSubmitting(false);
        }
    };


    const handleExportCSV = () => {
        if (!filteredUsers || filteredUsers.length === 0) {
            addToast('No hay usuarios para exportar.', 'error');
            return;
        }
        
        const headers = ['Nombre', 'Email', 'Telefono', 'Fecha Registro', 'Cursos Inscritos', 'Suscripcion'];
        const csvRows = [headers.join(',')];
        
        filteredUsers.forEach(user => {
            const courseNames = user.enrolledCourseIds.map(id => courseMap.get(id) || id).join('; ');
            
            const regDateText = new Date(user.registrationDate).toLocaleDateString();
            const subscriptionText = user.isSubscribed ? 'Premium' : 'Gratuito';
            
            const row = [
                `"${user.name.replace(/"/g, '""')}"`,
                `"${user.email.replace(/"/g, '""')}"`,
                `"${user.phone || ''}"`,
                `"${regDateText}"`,
                `"${courseNames.replace(/"/g, '""')}"`,
                subscriptionText
            ];
            csvRows.push(row.join(','));
        });
        
        const csvContent = "\uFEFF" + csvRows.join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `lista_estudiantes_aulainfinity_${new Date().toISOString().slice(0, 10)}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        addToast('Lista de estudiantes exportada en CSV.', 'success');
    };

    const subscriptionMutation = useMutation<StudentUser, Error, { studentId: string; period?: 'monthly' | 'annual' }>({
        mutationFn: ({ studentId, period }) => api.toggleSubscriptionStatus(studentId, period),
        onSuccess: (updatedUser) => {
            queryClient.invalidateQueries({ queryKey: ['users'] });
            const action = updatedUser.isSubscribed
                ? `Premium (${updatedUser.subscriptionPeriod === 'annual' ? 'Anual' : 'Mensual'})`
                : 'Gratuito';
            addToast(`Suscripción actualizada a ${action} para ${updatedUser.name}.`, 'success');
        },
        onError: () => {
            addToast('Error al cambiar el estado de la suscripción.', 'error');
        }
    });

    const deleteUserMutation = useMutation<{ userId: string }, Error, string>({
        mutationFn: api.deleteUser,
        onSuccess: () => {
            addToast(`Usuario eliminado con éxito.`, 'success');
            queryClient.invalidateQueries({ queryKey: ['users'] });
            queryClient.invalidateQueries({ queryKey: ['teachers'] });
            queryClient.invalidateQueries({ queryKey: ['students'] });
            queryClient.invalidateQueries({ queryKey: ['tutoringRequests'] });
            queryClient.invalidateQueries({ queryKey: ['conversations'] });
            queryClient.invalidateQueries({ queryKey: ['peer-conversations'] });
            queryClient.invalidateQueries({ queryKey: ['messages'] });
            queryClient.invalidateQueries({ queryKey: ['teacher-messages'] });
            setUserToDelete(null);
        },
        onError: (err: Error) => {
            addToast(`Error al eliminar el usuario: ${err.message}`, 'error');
            setUserToDelete(null);
        },
        onSettled: () => {
            setUserToDelete(null);
        }
    });

    const updatePermissionsMutation = useMutation<any, Error, { userId: string; role: 'student' | 'teacher'; aiEnabled?: boolean; videosEnabled?: boolean; canInitiateCalls?: boolean; canInitiateWhiteboard?: boolean }>({
        mutationFn: ({ userId, role, aiEnabled, videosEnabled, canInitiateCalls, canInitiateWhiteboard }) => api.updateUserPermissions(userId, role, { aiEnabled, videosEnabled, canInitiateCalls, canInitiateWhiteboard }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['users'] });
            addToast('Permisos actualizados con éxito.', 'success');
        },
        onError: (err: Error) => {
            addToast(`Error al actualizar permisos: ${err.message}`, 'error');
        }
    });

    const updateCourseMutation = useMutation({
        mutationFn: (data: { studentId: string, newCourseIds: string[] }) => api.updateStudentCourse(data.studentId, data.newCourseIds),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['users'] });
            addToast('Cursos del estudiante actualizados con éxito.', 'success');
            setUserToEditCourse(null);
        },
        onError: (err: Error) => {
            addToast(`Error al actualizar los cursos: ${err.message}`, 'error');
        }
    });

    const createUserMutation = useMutation({
        mutationFn: async (data: { name: string; email: string; password?: string; enrolledCourseIds: string[]; phone: string; isSubscribed: boolean }) => {
            const registered = await api.registerStudent({
                name: data.name,
                email: data.email,
                password: data.password,
                enrolledCourseIds: data.enrolledCourseIds,
                phone: data.phone,
            });
            if (data.isSubscribed) {
                await api.toggleSubscriptionStatus(registered.id);
            }
            return registered;
        },
        onSuccess: (newUser) => {
            queryClient.invalidateQueries({ queryKey: ['users'] });
            addToast(`Estudiante ${newUser.name} creado con éxito.`, 'success');
            setIsCreateModalOpen(false);
        },
        onError: (err: Error) => {
            addToast(`Error al crear estudiante: ${err.message}`, 'error');
        }
    });

    const resetPasswordMutation = useMutation({
        mutationFn: (data: { studentId: string, newPassword: string }) => api.adminResetStudentPassword(data.studentId, data.newPassword),
        onSuccess: (updatedUser) => {
            addToast(`Contraseña de ${updatedUser.name} actualizada correctamente.`, 'success');
            setUserToResetPassword(null);
        },
        onError: (err: Error) => {
            addToast(`Error al cambiar la contraseña: ${err.message}`, 'error');
        }
    });

    const handleToggleSubscription = useCallback((studentId: string, period?: 'monthly' | 'annual') => {
        subscriptionMutation.mutate({ studentId, period });
    }, [subscriptionMutation]);

    const handleViewChat = useCallback((id: string) => {
        navigate(`${ROUTES.ADMIN_CHAT}?studentId=${id}`, { state: { activeChatType: 'private' } });
    }, [navigate]);

    const handleUpdatePermissions = useCallback((userId: string, role: 'student' | 'teacher', permissions: { aiEnabled?: boolean; videosEnabled?: boolean; canInitiateCalls?: boolean; canInitiateWhiteboard?: boolean }) => {
        updatePermissionsMutation.mutate({ userId, role, ...permissions });
    }, [updatePermissionsMutation]);

    const handleSetUserToDelete = useCallback((u: StudentUser) => {
        setUserToDelete(u);
    }, []);

    const handleSetUserToEditCourse = useCallback((u: StudentUser) => {
        setUserToEditCourse(u);
    }, []);

    const handleSetUserToResetPassword = useCallback((u: StudentUser) => {
        setUserToResetPassword(u);
    }, []);

    const confirmDelete = () => {
        if (userToDelete) {
            deleteUserMutation.mutate(userToDelete.id);
        }
    };

    if (usersError) {
        return <FailureState message="No se pudieron cargar los datos de los usuarios." onRetry={() => refetchUsers()} />;
    }

    return (
        <div className="space-y-6">
            {/* Elegant Unified Header - matching system style */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-100 dark:border-slate-800/60 pb-5">
                <div>
                    <h1 className="text-2xl md:text-3xl font-black tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
                        🔑 Control y Personal
                    </h1>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                        Gestiona los perfiles de alumnos y personal docente, autoriza tutorías, accesos de IA, vídeos y estados de suscripción.
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-2.5">
                    <button
                        type="button"
                        onClick={handleBack}
                        className="flex items-center px-4 py-2.5 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 font-bold rounded-xl hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors duration-200 text-xs sm:text-sm shadow-2xs cursor-pointer"
                    >
                        <ChevronLeftIcon className="w-4 h-4 mr-1.5" />
                        Volver
                    </button>
                    <button
                        type="button"
                        onClick={async () => {
                            setIsSyncingFirebase(true);
                            try {
                                await api.fetchUsers();
                                await api.fetchTeachers();
                                await refetchUsers();
                                await refetchTeachers();
                                addToast('Estudiantes y profesores sincronizados con Firebase exitosamente.', 'success');
                            } catch (err) {
                                addToast('Error al sincronizar con Firebase.', 'error');
                            } finally {
                                setIsSyncingFirebase(false);
                            }
                        }}
                        disabled={isSyncingFirebase}
                        className="px-4 py-2.5 bg-sky-600 hover:bg-sky-700 active:bg-sky-800 text-white font-black rounded-xl text-xs sm:text-sm transition flex items-center gap-2 shadow-2xs cursor-pointer disabled:opacity-50"
                        title="Sincronizar y cargar alumnos directamente desde Firebase"
                    >
                        <span>{isSyncingFirebase ? '🔄 Sincronizando...' : '⚡ Sincronizar Firebase'}</span>
                    </button>
                </div>
            </div>

            {/* Navigation Tabs */}
            <div className="flex border-b border-slate-100 dark:border-slate-800/60 gap-6">
                <button
                    onClick={() => handleViewModeChange('students')}
                    className={`pb-3 text-sm font-black border-b-2 transition-all duration-200 flex items-center gap-2 relative cursor-pointer ${
                        viewMode === 'students' 
                            ? 'border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400' 
                            : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
                    }`}
                >
                    <UsersIcon className="w-4 h-4 text-indigo-500" />
                    Gestión de Alumnos
                    <span className="ml-1.5 px-2 py-0.5 text-xs font-bold rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                        {stats.totalS}
                    </span>
                </button>
                <button
                    onClick={() => handleViewModeChange('teachers')}
                    className={`pb-3 text-sm font-black border-b-2 transition-all duration-200 flex items-center gap-2 relative cursor-pointer ${
                        viewMode === 'teachers' 
                            ? 'border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400' 
                            : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
                    }`}
                >
                    <GraduationCap className="w-4 h-4 text-indigo-500" />
                    Gestión de Profesores
                    <span className="ml-1.5 px-2 py-0.5 text-xs font-bold rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                        {teachers?.length || 0}
                    </span>
                </button>
            </div>

            {viewMode === 'students' ? (
                <div className="space-y-6 animate-fade-in">
                    {/* Panel de Estadísticas Interactivas Directas */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        <div 
                            onClick={() => {
                                setSelectedTeacherFilter('all');
                                setSelectedNotificationFilter('all');
                                setSelectedCourseFilter('all');
                                setSelectedSubFilter('all');
                            }}
                            className="bg-gradient-to-br from-indigo-50 to-white dark:from-slate-800/40 dark:to-slate-800 p-5 rounded-2xl border border-indigo-100 dark:border-slate-700 shadow-2xs hover:shadow-md hover:border-indigo-200 transition duration-200 cursor-pointer group"
                        >
                            <div className="flex justify-between items-start">
                                <div>
                                    <p className="text-xs uppercase font-extrabold text-indigo-600/80 dark:text-indigo-400 tracking-wider mb-1">Total Alumnos</p>
                                    <h3 className="text-3xl font-black text-slate-800 dark:text-slate-100 tracking-tight group-hover:text-indigo-700 dark:group-hover:text-indigo-400 transition-colors">{stats.totalS}</h3>
                                </div>
                                <span className="p-2 bg-indigo-100 dark:bg-slate-700 text-indigo-700 dark:text-indigo-400 rounded-lg text-lg">💡</span>
                            </div>
                            <div className="mt-3 flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400 font-medium">
                                <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> {stats.premiumS} Premium</span>
                                <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span> {stats.freeS} Gratis</span>
                            </div>
                        </div>

                        <div 
                            onClick={() => {
                                setSelectedTeacherFilter('none');
                                setSelectedNotificationFilter('all');
                            }}
                            className={`bg-gradient-to-br p-5 rounded-2xl border transition duration-200 cursor-pointer group ${
                                stats.unassignedS > 0
                                ? 'from-amber-50 to-white dark:from-amber-95/20 dark:to-slate-800 border-amber-200 dark:border-amber-900 hover:border-amber-300 hover:shadow-md'
                                : 'from-slate-50 to-white dark:from-slate-800/40 dark:to-slate-800 border-gray-100 dark:border-slate-700 hover:border-gray-200 hover:shadow-2xs'
                            }`}
                        >
                            <div className="flex justify-between items-start">
                                <div>
                                    <p className="text-xs uppercase font-extrabold text-amber-600 dark:text-amber-400 tracking-wider mb-1">Alumnos sin Tutor</p>
                                    <h3 className={`text-3xl font-black tracking-tight transition-colors ${
                                        stats.unassignedS > 0
                                        ? 'text-amber-700 dark:text-amber-400 group-hover:text-amber-800'
                                        : 'text-slate-850 dark:text-slate-100'
                                    }`}>{stats.unassignedS}</h3>
                                </div>
                                <span className={`p-2 rounded-lg text-lg ${stats.unassignedS > 0 ? 'bg-amber-150 dark:bg-amber-900/40 text-amber-700' : 'bg-slate-150 dark:bg-slate-700'}`}>
                                    {stats.unassignedS > 0 ? '⚠️' : '✅'}
                                </span>
                            </div>
                            <div className="mt-3 text-xs text-slate-500 dark:text-slate-400 font-medium">
                                {stats.unassignedS > 0 ? (
                                    <span className="text-amber-600 dark:text-amber-400 flex items-center gap-1 animate-pulse font-extrabold">🚨 Requiere asignación rápida</span>
                                ) : (
                                    <span className="text-slate-450 dark:text-slate-400">Todos asignados correctamente</span>
                                )}
                            </div>
                        </div>

                        <div 
                            onClick={() => {
                                setSelectedNotificationFilter('unread');
                                setSelectedTeacherFilter('all');
                            }}
                            className={`bg-gradient-to-br p-5 rounded-2xl border transition duration-200 cursor-pointer group ${
                                stats.unreadChatCount > 0
                                ? 'from-red-50 to-white dark:from-red-95/20 dark:to-slate-800 border-red-200 dark:border-red-900 hover:border-red-300 hover:shadow-md'
                                : 'from-slate-50 to-white dark:from-slate-800/40 dark:to-slate-800 border-gray-100 dark:border-slate-700 hover:border-gray-200 hover:shadow-2xs'
                            }`}
                        >
                            <div className="flex justify-between items-start">
                                <div>
                                    <p className="text-xs uppercase font-extrabold text-red-600 dark:text-red-400 tracking-wider mb-1">Interacciones sin leer</p>
                                    <h3 className={`text-3xl font-black tracking-tight transition-colors ${
                                        stats.unreadChatCount > 0
                                        ? 'text-red-600 dark:text-red-400 group-hover:text-red-700'
                                        : 'text-slate-800 dark:text-slate-100'
                                    }`}>{stats.unreadChatCount}</h3>
                                </div>
                                <span className={`p-2 rounded-lg text-lg relative ${stats.unreadChatCount > 0 ? 'bg-red-100 dark:bg-red-900/40 text-red-600' : 'bg-slate-100 dark:bg-slate-700'}`}>
                                    {stats.unreadChatCount > 0 && (
                                        <span className="absolute top-1 right-1 flex h-2.5 w-2.5">
                                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                                            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500"></span>
                                        </span>
                                    )}
                                    💬
                                </span>
                            </div>
                            <div className="mt-3 text-xs text-slate-500 dark:text-slate-400 font-medium">
                                {stats.unreadChatCount > 0 ? (
                                    <span className="text-red-600 dark:text-red-455 font-black animate-pulse">🔴 Mensajes de estudiantes pendientes</span>
                                ) : (
                                    <span>Al día con la tutoría de chats</span>
                                )}
                            </div>
                        </div>

                        <div 
                            className="bg-gradient-to-br from-emerald-50 to-white dark:from-slate-800/40 dark:to-slate-800 p-5 rounded-2xl border border-emerald-100 dark:border-slate-700 shadow-2xs hover:shadow-md hover:border-emerald-200 transition duration-200"
                        >
                            <div className="flex justify-between items-start">
                                <div>
                                    <p className="text-xs uppercase font-extrabold text-emerald-600 dark:text-emerald-400 tracking-wider mb-1">Suscripciones Activas</p>
                                    <h3 className="text-3xl font-black text-slate-800 dark:text-slate-100 tracking-tight">{stats.premiumS}</h3>
                                </div>
                                <span className="p-2 bg-emerald-100 dark:bg-slate-700 text-emerald-700 dark:text-emerald-400 rounded-lg text-lg">👑</span>
                            </div>
                            <div className="mt-3 text-xs text-slate-500 dark:text-slate-400 font-medium">
                                <span>{stats.freeS} Alumnos en plan gratuito</span>
                            </div>
                        </div>
                    </div>
                    
                    {/* Main Student Management Section Card */}
                    <div className="bg-white dark:bg-slate-800/80 p-5 md:p-6 rounded-2xl border border-gray-200 dark:border-slate-700/80 shadow-sm space-y-5">
                        {/* Section Header with Action Buttons neatly placed below statistics */}
                        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 pb-4 border-b border-gray-100 dark:border-slate-700/60">
                            <div>
                                <h2 className="text-lg md:text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                                    <span>👥 Directorio de Alumnos</span>
                                    <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800/50">
                                        {filteredUsers.length} de {users?.length || 0}
                                    </span>
                                </h2>
                                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                                    Gestiona matrículas, tutores asignados, estado de suscripción y permisos de plataforma.
                                </p>
                            </div>

                            {/* Section Action Buttons */}
                            <div className="flex flex-wrap items-center gap-2.5 w-full lg:w-auto">
                                <Button 
                                    onClick={() => setIsCreateModalOpen(true)} 
                                    className="shadow-2xs font-bold text-xs sm:text-sm py-2 px-3.5"
                                >
                                    + Nuevo Estudiante
                                </Button>
                                <Button 
                                    variant="secondary" 
                                    onClick={() => setIsRoleChangeModalOpen(true)} 
                                    className="shadow-2xs border border-gray-200 dark:border-slate-700 font-semibold text-xs sm:text-sm py-2 px-3.5"
                                >
                                    🔄 Asignar Rol por Correo
                                </Button>
                                <button
                                    type="button"
                                    onClick={() => handleOpenCommunication(null, 'message')}
                                    className="px-3.5 py-2 bg-indigo-50 dark:bg-indigo-950/40 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800/60 font-bold rounded-xl text-xs sm:text-sm transition flex items-center gap-1.5 shadow-2xs cursor-pointer"
                                    title="Enviar Correos o WhatsApp a Alumnos"
                                >
                                    <span>💌 Comunicado</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handleOpenCommunication(null, 'test_whatsapp')}
                                    className="px-3.5 py-2 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60 font-bold rounded-xl text-xs sm:text-sm transition flex items-center gap-1.5 shadow-2xs cursor-pointer"
                                    title="Probar y Verificar la integración de WhatsApp"
                                >
                                    <span>🧪 Probar WhatsApp</span>
                                </button>
                                <button
                                    onClick={handleExportCSV}
                                    className="flex items-center justify-center px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-bold rounded-xl shadow-2xs transition text-xs sm:text-sm cursor-pointer"
                                    title="Descargar lista de alumnos en formato CSV"
                                >
                                    <DownloadIcon className="w-4 h-4 mr-1.5" />
                                    Exportar CSV
                                </button>
                            </div>
                        </div>

                        {/* Search and Filters Bar */}
                        <div className="flex flex-col md:flex-row gap-3 justify-between items-stretch md:items-center">
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2.5 w-full">
                                {/* Search input */}
                                <div className="relative">
                                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                        <SearchIcon className="h-4 w-4 text-gray-400" />
                                    </div>
                                    <input
                                        type="text"
                                        placeholder="Buscar por nombre o email..."
                                        value={searchTerm}
                                        onChange={e => setSearchTerm(e.target.value)}
                                        className="block w-full bg-gray-50 dark:bg-slate-700/60 border border-gray-200 dark:border-slate-600 rounded-xl py-2 pl-9 pr-3 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition text-xs sm:text-sm placeholder:text-slate-400"
                                    />
                                </div>

                                {/* Course Filter */}
                                <div>
                                    <select
                                        value={selectedCourseFilter}
                                        onChange={e => setSelectedCourseFilter(e.target.value)}
                                        className="block w-full bg-gray-50 dark:bg-slate-700/60 border border-gray-200 dark:border-slate-600 rounded-xl py-2 px-3 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-xs sm:text-sm cursor-pointer"
                                    >
                                        <option value="all">Todos los Niveles</option>
                                        {courses?.map(course => (
                                            <option key={course.id} value={course.id}>{course.name}</option>
                                        ))}
                                    </select>
                                </div>

                                {/* Subscription Filter */}
                                <div>
                                    <select
                                        value={selectedSubFilter}
                                        onChange={e => setSelectedSubFilter(e.target.value)}
                                        className="block w-full bg-gray-50 dark:bg-slate-700/60 border border-gray-200 dark:border-slate-600 rounded-xl py-2 px-3 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-xs sm:text-sm cursor-pointer"
                                    >
                                        <option value="all">Todas las suscripciones</option>
                                        <option value="active">Premium (Suscriptor)</option>
                                        <option value="inactive">Gratuito (No suscriptor)</option>
                                    </select>
                                </div>

                                {/* Teacher Assignment Filter */}
                                <div>
                                    <select
                                        value={selectedTeacherFilter}
                                        onChange={e => setSelectedTeacherFilter(e.target.value)}
                                        className="block w-full bg-gray-50 dark:bg-slate-700/60 border border-gray-200 dark:border-slate-600 rounded-xl py-2 px-3 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-xs sm:text-sm cursor-pointer"
                                    >
                                        <option value="all">Todos los Tutores</option>
                                        <option value="none">Sin tutor asignado ⚠️</option>
                                        {teachers?.map(teacher => (
                                            <option key={teacher.id} value={teacher.id}>{teacher.name} ({teacher.category})</option>
                                        ))}
                                    </select>
                                </div>

                                {/* Active Interactions/Unread Messages Filter */}
                                <div>
                                    <select
                                        value={selectedNotificationFilter}
                                        onChange={e => setSelectedNotificationFilter(e.target.value)}
                                        className="block w-full bg-gray-50 dark:bg-slate-700/60 border border-gray-200 dark:border-slate-600 rounded-xl py-2 px-3 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-xs sm:text-sm cursor-pointer"
                                    >
                                        <option value="all">Todas las interacciones</option>
                                        <option value="unread">Mensajes sin leer 💬🔴</option>
                                    </select>
                                </div>
                            </div>
                        </div>

                        {/* Clean Table Container - Single natural scrollbar, no nested double scroll */}
                        <div className="admin-table w-full overflow-x-auto border border-gray-200 dark:border-slate-700 rounded-2xl">
                            <div className="admin-table-header min-w-[1150px] lg:grid lg:grid-cols-12 w-full gap-2 items-center">
                                <div className="col-span-3 flex items-center">
                                    <input
                                        type="checkbox"
                                        checked={filteredUsers.length > 0 && selectedUserIds.length === filteredUsers.length}
                                        onChange={handleSelectAllToggle}
                                        className="mr-3 h-4 w-4 rounded border-gray-300 dark:border-slate-600 text-primary focus:ring-primary focus:ring-2 cursor-pointer"
                                    />
                                    <span>Alumno / Contacto</span>
                                </div>
                                <div className="col-span-2">Cursos Matriculados</div>
                                <div className="col-span-1">Profesor / Tutor</div>
                                <div className="col-span-2">Suscripción</div>
                                <div className="col-span-2 text-center">Permisos & Accesos</div>
                                <div className="col-span-2 text-right pr-2">Acciones Rápidas</div>
                            </div>

                            <div className="divide-y divide-gray-100 dark:divide-slate-700/60 w-full min-w-[1150px]">
                                {isLoading ? (
                                    Array.from({ length: 6 }).map((_, i) => <UserRowSkeleton key={i} />)
                                ) : filteredUsers.length > 0 ? (
                                    filteredUsers.map(user => {
                                        const courseNames = user.enrolledCourseIds.map(id => courseMap.get(id)).filter(Boolean).join(', ') || 'Ninguno';
                                        const convo = conversationsMap.get(user.id);
                                        const hasUnread = convo?.unreadByAdmin || false;
                                        const convoId = convo ? convo.id : user.id;
                                        return (
                                            <UserRow
                                                key={user.id}
                                                user={user}
                                                courseNames={courseNames}
                                                onToggleSubscription={handleToggleSubscription}
                                                isSubscriptionPending={subscriptionMutation.isPending}
                                                onEditCourse={handleSetUserToEditCourse}
                                                onResetPassword={handleSetUserToResetPassword}
                                                onDelete={handleSetUserToDelete}
                                                isSelected={selectedUserIds.includes(user.id)}
                                                onSelectToggle={handleSelectRow}
                                                teachers={teachers || []}
                                                onAssignTeacher={handleAssignStudentTutor}
                                                hasUnread={hasUnread}
                                                convoId={convoId}
                                                onViewChat={handleViewChat}
                                                onUpdatePermissions={handleUpdatePermissions}
                                                onViewDetail={setSelectedStudentForDetail}
                                                isNew={!seenStudentIdsSet.has(user.id)}
                                                aiEnabledGlobally={aiEnabledGlobally}
                                                videosEnabledGlobally={videosEnabledGlobally}
                                                subscriptionsEnabledGlobally={subscriptionsEnabledGlobally}
                                                onOpenCommunication={handleOpenCommunication}
                                            />
                                        );
                                    })
                                ) : (
                                    <EmptyState
                                        icon={<UsersIcon />}
                                        title="No se encontraron usuarios"
                                        description="No hay usuarios que coincidan con tu búsqueda. Intenta con otros términos."
                                    />
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="animate-fade-in">
                    <AdminTeacherApprovalPage hideHeader={true} onOpenCommunication={handleOpenCommunication} />
                </div>
            )}

            <ConfirmationModal
                isOpen={!!userToDelete}
                onClose={() => setUserToDelete(null)}
                onConfirm={confirmDelete}
                title="Confirmar eliminación"
                description={`¿Estás seguro de que quieres eliminar al usuario ${userToDelete?.name}? Esta acción es irreversible y se borrarán todos sus datos.`}
                confirmText="Eliminar"
                isDestructive
                isLoading={deleteUserMutation.isPending}
            />

            {userToEditCourse && courses && (
                <ChangeCoursesModal
                    user={userToEditCourse}
                    courses={courses}
                    onClose={() => setUserToEditCourse(null)}
                    onSave={(newCourseIds) => updateCourseMutation.mutate({ studentId: userToEditCourse.id, newCourseIds })}
                    isSaving={updateCourseMutation.isPending}
                />
            )}

            {isCreateModalOpen && courses && (
                <CreateUserModal
                    courses={courses}
                    onClose={() => setIsCreateModalOpen(false)}
                    onSave={(data) => createUserMutation.mutate(data)}
                    isSaving={createUserMutation.isPending}
                />
            )}

            {userToResetPassword && (
                <ResetPasswordModal
                    user={userToResetPassword}
                    onClose={() => setUserToResetPassword(null)}
                    onSave={(newPassword) => resetPasswordMutation.mutate({ studentId: userToResetPassword.id, newPassword })}
                    isSaving={resetPasswordMutation.isPending}
                />
            )}

            {isRoleChangeModalOpen && (
                <AssignRoleByEmailModal
                    onClose={() => setIsRoleChangeModalOpen(false)}
                    onSave={(data) => assignRoleByEmailMutation.mutate(data)}
                    isSaving={assignRoleByEmailMutation.isPending}
                />
            )}

            {/* Barra flotante para acciones en lote */}
            {selectedUserIds.length > 0 && (
                <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-slate-900/95 dark:bg-slate-950/95 text-white py-3.5 px-5 rounded-2xl shadow-2xl flex flex-col lg:flex-row items-center gap-3 z-40 border border-slate-700/80 backdrop-blur animate-fade-in max-w-[95vw] lg:max-w-5xl">
                    <div className="flex items-center gap-2.5 flex-shrink-0">
                        <span className="bg-indigo-600 text-white font-mono text-xs font-black px-2.5 py-1 rounded-full">{selectedUserIds.length}</span>
                        <span className="text-xs font-bold whitespace-nowrap">Alumnos seleccionados</span>
                    </div>
                    <div className="h-px lg:h-6 w-full lg:w-px bg-slate-700/80" />
                    <div className="flex flex-wrap items-center justify-center gap-1.5">
                        <Button
                            variant="secondary"
                            onClick={handleBulkToggleSubscription}
                            isLoading={isBulkSubmitting}
                            className="bg-slate-800 hover:bg-slate-700 text-white border-slate-700 text-xs py-1 px-2.5 font-bold"
                            title="Alternar suscripción premium para los seleccionados"
                        >
                            💎 Suscripción
                        </Button>
                        <Button
                            variant="secondary"
                            onClick={() => setIsBulkCourseEditOpen(true)}
                            isLoading={isBulkSubmitting}
                            className="bg-slate-800 hover:bg-slate-700 text-white border-slate-700 text-xs py-1 px-2.5 font-bold"
                            title="Matricular o cambiar cursos asignados"
                        >
                            📚 Cursos
                        </Button>
                        <Button
                            variant="secondary"
                            onClick={() => {
                                const firstUser = filteredUsers.find(u => selectedUserIds.includes(u.id));
                                const currentAI = firstUser ? (firstUser.aiEnabled !== false) : true;
                                handleBulkUpdatePermissions({ aiEnabled: !currentAI });
                            }}
                            isLoading={isBulkSubmitting}
                            className="bg-slate-800 hover:bg-slate-700 text-amber-300 border-slate-700 text-xs py-1 px-2.5 font-bold"
                            title="Activar o desactivar IA en lote"
                        >
                            ✨ IA
                        </Button>
                        <Button
                            variant="secondary"
                            onClick={() => {
                                const firstUser = filteredUsers.find(u => selectedUserIds.includes(u.id));
                                const currentVideos = firstUser ? (firstUser.videosEnabled !== false) : true;
                                handleBulkUpdatePermissions({ videosEnabled: !currentVideos });
                            }}
                            isLoading={isBulkSubmitting}
                            className="bg-slate-800 hover:bg-slate-700 text-blue-300 border-slate-700 text-xs py-1 px-2.5 font-bold"
                            title="Activar o desactivar Videoclases en lote"
                        >
                            📹 Vídeos
                        </Button>
                        <Button
                            variant="secondary"
                            onClick={() => {
                                const firstUser = filteredUsers.find(u => selectedUserIds.includes(u.id));
                                const currentCalls = firstUser ? (firstUser.canInitiateCalls === true) : false;
                                handleBulkUpdatePermissions({ canInitiateCalls: !currentCalls });
                            }}
                            isLoading={isBulkSubmitting}
                            className="bg-slate-800 hover:bg-slate-700 text-emerald-300 border-slate-700 text-xs py-1 px-2.5 font-bold"
                            title="Alternar permiso de Iniciar Llamadas en lote"
                        >
                            📞 Llamadas
                        </Button>
                        <Button
                            variant="secondary"
                            onClick={() => {
                                const firstUser = filteredUsers.find(u => selectedUserIds.includes(u.id));
                                const currentWhiteboard = firstUser ? (firstUser.canInitiateWhiteboard === true) : false;
                                handleBulkUpdatePermissions({ canInitiateWhiteboard: !currentWhiteboard });
                            }}
                            isLoading={isBulkSubmitting}
                            className="bg-slate-800 hover:bg-slate-700 text-purple-300 border-slate-700 text-xs py-1 px-2.5 font-bold"
                            title="Alternar permiso de Iniciar Pizarra en lote"
                        >
                            🎨 Pizarra
                        </Button>
                        <Button
                            variant="secondary"
                            onClick={() => handleOpenCommunication(null, 'message')}
                            className="bg-indigo-600/80 hover:bg-indigo-600 text-white border-transparent text-xs py-1 px-2.5 font-bold"
                            title="Enviar aviso o comunicado por Email / WhatsApp"
                        >
                            💌 Comunicado
                        </Button>
                        <Button
                            variant="danger"
                            onClick={() => setIsBulkDeleteOpen(true)}
                            isLoading={isBulkSubmitting}
                            className="text-xs py-1 px-2.5 font-bold"
                            title="Eliminar estudiantes seleccionados"
                        >
                            🗑️ Eliminar
                        </Button>
                        <button
                            onClick={() => setSelectedUserIds([])}
                            className="text-xs text-slate-400 hover:text-white underline ml-1 transition-colors font-semibold cursor-pointer"
                        >
                            Cancelar
                        </button>
                    </div>
                </div>
            )}

            {/* Modal de matriculación en lote */}
            {isBulkCourseEditOpen && courses && (
                <BulkChangeCoursesModal
                    selectedCount={selectedUserIds.length}
                    courses={courses}
                    onClose={() => setIsBulkCourseEditOpen(false)}
                    onSave={handleBulkUpdateCourses}
                    isSaving={isBulkSubmitting}
                />
            )}

            {/* Modal de confirmación eliminación en lote */}
            <ConfirmationModal
                isOpen={isBulkDeleteOpen}
                onClose={() => setIsBulkDeleteOpen(false)}
                onConfirm={handleBulkDelete}
                title="Confirmar eliminación en lote"
                description={`¿Estás absolutamente seguro de que deseas eliminar permanentemente a los ${selectedUserIds.length} estudiantes seleccionados? Esta acción es irreversible.`}
                confirmText="Eliminar permanentemente"
                isDestructive
                isLoading={isBulkSubmitting}
            />

            <AdminCommunicationModal
                isOpen={isCommunicationModalOpen}
                onClose={() => setIsCommunicationModalOpen(false)}
                students={users || []}
                teachers={teachers || []}
                initialRecipient={communicationRecipient}
                initialTab={communicationTab}
            />

            {selectedStudentForDetail && (
                <StudentDetailDrawer
                    student={selectedStudentForDetail}
                    onClose={() => setSelectedStudentForDetail(null)}
                    courses={courses || []}
                    teachers={teachers || []}
                    conversations={conversations || []}
                    onViewChat={(studentId) => {
                        setSelectedStudentForDetail(null);
                        navigate(`${ROUTES.ADMIN_CHAT}?studentId=${studentId}`, { state: { activeChatType: 'private' } });
                    }}
                />
            )}
        </div>
    );
};
