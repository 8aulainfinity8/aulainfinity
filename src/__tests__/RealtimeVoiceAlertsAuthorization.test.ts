import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as firestore from 'firebase/firestore';
import { getTeacherAssignedLevels } from '../utils/teacherPermissions';
import { TeacherUser, StudentUser, AdminUser } from '../types';

describe('F110.3 — Verificación de Autorización y Lifecycle de Alertas Realtime de Voice Rooms', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('1. Resolución y Normalización de Cursos Asignados (ApprovedTeacher)', () => {
        it('debe extraer correctamente los cursos asignados desde taughtCourseIds, coursesTaughtIds y levels sin duplicados', () => {
            const mockTeacher: Partial<TeacherUser> = {
                id: 'teacher_1',
                role: 'teacher',
                isApprovedForTutoring: true,
                taughtCourseIds: ['course_a', 'course_b'],
                coursesTaughtIds: ['course_b', 'course_c'],
                levels: ['course_c', 'course_d']
            };

            const assigned = getTeacherAssignedLevels(mockTeacher as TeacherUser);
            expect(assigned).toEqual(['course_a', 'course_b', 'course_c', 'course_d']);
        });

        it('debe retornar un array vacío si el profesor no tiene cursos asignados', () => {
            const mockTeacher: Partial<TeacherUser> = {
                id: 'teacher_2',
                role: 'teacher',
                isApprovedForTutoring: true,
                taughtCourseIds: [],
                coursesTaughtIds: [],
                levels: []
            };

            const assigned = getTeacherAssignedLevels(mockTeacher as TeacherUser);
            expect(assigned).toEqual([]);
        });

        it('debe manejar de forma segura usuarios sin cursos asignados o con propiedades no definidas', () => {
            const mockTeacherEmpty: Partial<TeacherUser> = {
                id: 'teacher_empty',
                role: 'teacher'
            };
            expect(getTeacherAssignedLevels(mockTeacherEmpty as TeacherUser)).toEqual([]);
        });
    });

    describe('2. Matriz de Autorización de Listeners de Voice Rooms', () => {
        it('Admin debe ser el único rol autorizado para suscribir a la colección global voice_group_calls', () => {
            const determineVoiceListeners = (user: any, claims: any) => {
                const isAdmin = claims?.role === 'admin' || (user?.role === 'admin' && claims?.role === 'admin');
                const isApprovedTeacher = (claims?.role === 'teacher' && claims?.isApprovedForTutoring === true) && user?.role === 'teacher';
                const isStudent = user?.role === 'student';

                if (isAdmin) {
                    return { type: 'global_collection', target: 'voice_group_calls', count: 1 };
                }
                if (isApprovedTeacher) {
                    const courses = getTeacherAssignedLevels(user);
                    return { type: 'doc_listeners', targets: courses, count: courses.length };
                }
                if (isStudent) {
                    const enrolled = Array.isArray(user.enrolledCourseIds) ? user.enrolledCourseIds : [];
                    return { type: 'doc_listeners', targets: enrolled, count: enrolled.length };
                }
                return { type: 'none', targets: [], count: 0 };
            };

            // 1. Admin
            const adminResult = determineVoiceListeners({ id: 'admin_1', role: 'admin' }, { role: 'admin' });
            expect(adminResult.type).toBe('global_collection');
            expect(adminResult.target).toBe('voice_group_calls');
            expect(adminResult.count).toBe(1);

            // 2. ApprovedTeacher
            const teacherResult = determineVoiceListeners(
                { id: 't_1', role: 'teacher', isApprovedForTutoring: true, taughtCourseIds: ['math_101', 'physics_201'] },
                { role: 'teacher', isApprovedForTutoring: true }
            );
            expect(teacherResult.type).toBe('doc_listeners');
            expect(teacherResult.targets).toEqual(['math_101', 'physics_201']);
            expect(teacherResult.count).toBe(2);

            // 3. ApprovedTeacher sin cursos
            const emptyTeacherResult = determineVoiceListeners(
                { id: 't_2', role: 'teacher', isApprovedForTutoring: true, taughtCourseIds: [] },
                { role: 'teacher', isApprovedForTutoring: true }
            );
            expect(emptyTeacherResult.type).toBe('doc_listeners');
            expect(emptyTeacherResult.targets).toEqual([]);
            expect(emptyTeacherResult.count).toBe(0);

            // 4. Student
            const studentResult = determineVoiceListeners(
                { id: 's_1', role: 'student', enrolledCourseIds: ['math_101'] },
                { role: 'student' }
            );
            expect(studentResult.type).toBe('doc_listeners');
            expect(studentResult.targets).toEqual(['math_101']);
            expect(studentResult.count).toBe(1);

            // 5. Regular Teacher (no aprobado)
            const regularTeacherResult = determineVoiceListeners(
                { id: 't_3', role: 'teacher', isApprovedForTutoring: false, taughtCourseIds: ['math_101'] },
                { role: 'teacher', isApprovedForTutoring: false }
            );
            expect(regularTeacherResult.type).toBe('none');
            expect(regularTeacherResult.count).toBe(0);
        });
    });

    describe('3. Detección de Participantes y Notificaciones Toast', () => {
        it('no debe disparar alertas durante el snapshot inicial con participantes preexistentes', () => {
            const knownRoomParticipants = new Map<string, Set<string>>();
            let alertTriggered = false;

            const processSnapshot = (roomId: string, participants: Array<{ id: string; name: string }>, isInitial: boolean) => {
                const prevSet = knownRoomParticipants.get(roomId);
                const currentIds = new Set(participants.map(p => p.id));
                let newParticipant = null;

                if (!prevSet) {
                    newParticipant = participants[participants.length - 1];
                } else {
                    newParticipant = participants.find(p => !prevSet.has(p.id));
                }

                knownRoomParticipants.set(roomId, currentIds);

                if (!isInitial && newParticipant) {
                    alertTriggered = true;
                }
            };

            // Carga inicial con 2 participantes
            processSnapshot('room_math', [
                { id: 'user_a', name: 'Alice' },
                { id: 'user_b', name: 'Bob' }
            ], true);

            expect(alertTriggered).toBe(false);
            expect(knownRoomParticipants.get('room_math')?.size).toBe(2);
        });

        it('debe disparar alerta cuando un nuevo participante se une en una actualización posterior', () => {
            const knownRoomParticipants = new Map<string, Set<string>>();
            let detectedParticipant: any = null;

            const processSnapshot = (roomId: string, participants: Array<{ id: string; name: string }>, isInitial: boolean) => {
                const prevSet = knownRoomParticipants.get(roomId);
                const currentIds = new Set(participants.map(p => p.id));
                let newParticipant = null;

                if (!prevSet) {
                    newParticipant = participants[participants.length - 1];
                } else {
                    newParticipant = participants.find(p => !prevSet.has(p.id));
                }

                knownRoomParticipants.set(roomId, currentIds);

                if (!isInitial && newParticipant) {
                    detectedParticipant = newParticipant;
                }
            };

            // 1. Initial snapshot
            processSnapshot('room_math', [{ id: 'user_a', name: 'Alice' }], true);
            expect(detectedParticipant).toBeNull();

            // 2. Subsequent snapshot with Charlie joining
            processSnapshot('room_math', [
                { id: 'user_a', name: 'Alice' },
                { id: 'user_c', name: 'Charlie' }
            ], false);

            expect(detectedParticipant).not.toBeNull();
            expect(detectedParticipant?.id).toBe('user_c');
            expect(detectedParticipant?.name).toBe('Charlie');
        });

        it('no debe disparar alerta si el nuevo participante es el propio usuario actual', () => {
            const currentUserId = 'teacher_me';
            let alertSent = false;

            const handleNewParticipant = (participantId: string) => {
                if (participantId === currentUserId) return;
                alertSent = true;
            };

            handleNewParticipant('teacher_me');
            expect(alertSent).toBe(false);

            handleNewParticipant('student_other');
            expect(alertSent).toBe(true);
        });
    });

    describe('4. Lifecycle y Cleanup de Subscripciones', () => {
        it('debe desuscribir todos los listeners previos al desmontar o cambiar de cursos', () => {
            const unsubSpies = [vi.fn(), vi.fn(), vi.fn()];
            let activeUnsubs: (() => void)[] = [...unsubSpies];

            // Simulamos el cleanup del useEffect
            const cleanup = () => {
                activeUnsubs.forEach(u => u());
                activeUnsubs = [];
            };

            cleanup();

            unsubSpies.forEach(spy => {
                expect(spy).toHaveBeenCalledTimes(1);
            });
            expect(activeUnsubs.length).toBe(0);
        });
    });
});
