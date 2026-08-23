// This file simulates a backend database and its access logic.
// It is the single source of truth for all data operations.
// The `api.ts` service will call functions from this module.

import {
    StudentUser, AdminUser, TeacherUser, AnyUser, CourseLevel, Subject, Video, Comment, AppConfig,
    TopicRequest, TutoringRequest, ExamEvent, Quiz, StudentAnswer,
    NewCourseLevelData, NewSubjectData, NewVideoData,
    Conversation, DirectMessage, VideoBlock, NewVideoBlockData, NewQuizData,
    NewQuestionData, StudentPeerConversation, StudentPeerMessage, StudentFriend,
    CourseGroupMessage, CourseGroupConversation, Attachment, InfinityTransaction, AIQueryLog,
    StudentPayment, StudentExpense, TeacherPayment
} from '../types';

// Importing the raw data arrays. These are mutated directly by this module.
import { usersData } from '../data/users';
import { adminUserData } from '../data/admins';
import { teachersData } from '../data/teachers';
import { coursesData } from '../data/courses';
import { commentsData } from '../data/comments';
import { appConfigData } from '../data/appConfig';
import { apiKeysData } from '../data/apiKeys';
import { topicRequestsData } from '../data/requests';
import { tutoringRequestsData } from '../data/tutoringRequests';
import { agendaData } from '../data/agenda';
import { quizzesData } from '../data/quizzes';
import { studentAnswersData } from '../data/studentAnswers';
import { conversationsData, directMessagesData } from '../data/directMessages';

import { eventEmitter } from './eventService';
export { eventEmitter };
export const closedSupportConversationIds: Set<string> = new Set();
export const isConversationClosed = (convoId: string, studentId?: string): boolean => {
    if (!convoId && !studentId) return false;
    const cleanConvoId = (convoId || '').replace(/^direct_/, '');
    const cleanStudentId = (studentId || '').replace(/^direct_/, '') || cleanConvoId.split('_')[0];
    return closedSupportConversationIds.has(convoId) ||
           closedSupportConversationIds.has(`direct_${convoId}`) ||
           closedSupportConversationIds.has(cleanConvoId) ||
           closedSupportConversationIds.has(`direct_${cleanConvoId}`) ||
           (!!cleanStudentId && (
               closedSupportConversationIds.has(cleanStudentId) ||
               closedSupportConversationIds.has(`direct_${cleanStudentId}`)
           ));
};

export function parseConversationParticipants(conversationId: string | null | undefined): { studentId: string | null; teacherId: string | null } {
    if (!conversationId) return { studentId: null, teacherId: null };
    const clean = conversationId.replace(/^direct_/, '').replace(/^peer_/, '');
    
    for (const student of (usersData as any[] || [])) {
        if (!student.id) continue;
        if (clean === student.id) {
            return { studentId: student.id, teacherId: null };
        }
        if (clean.startsWith(student.id + '_')) {
            const remainder = clean.slice(student.id.length + 1);
            const teacher = (teachersData || []).find(t => t.id === remainder) || (usersData as any[] || []).find(u => u.id === remainder && u.role === 'teacher');
            if (teacher) {
                return { studentId: student.id, teacherId: teacher.id };
            }
            return { studentId: student.id, teacherId: remainder };
        }
    }

    for (const teacher of (teachersData || [])) {
        if (!teacher.id) continue;
        if (clean.startsWith(teacher.id + '_')) {
            const remainder = clean.slice(teacher.id.length + 1);
            return { studentId: remainder, teacherId: teacher.id };
        }
    }

    const parts = clean.split('_');
    if (parts.length <= 1) {
        return { studentId: clean, teacherId: null };
    }
    return {
        studentId: parts[0],
        teacherId: parts.slice(1).join('_')
    };
}
import * as geminiService from './geminiService';
import {
    syncAddAgendaEventToFirestore,
    syncUpdateAgendaEventToFirestore,
    syncDeleteAgendaEventFromFirestore,
    syncPostCommentToFirestore,
    syncUpdateCommentInFirestore,
    syncMarkCommentAsReadInFirestore,
    syncDeleteCommentFromFirestore,
    syncSubmitTopicRequestToFirestore,
    syncUpdateTopicRequestStatusInFirestore,
    syncDeleteTopicRequestFromFirestore,
    syncSubmitStudentAnswerToFirestore,
    syncAddInfinityTransactionToFirestore,
    syncUserToFirestore,
    syncStudentPaymentToFirestore,
    syncStudentExpenseToFirestore,
    syncSubmitTutoringRequestToFirestore,
    syncUserSeenStatesToFirestore,
    syncMarkPeerConversationAsReadInFirestore
} from './firestoreSync';

export let infinityTransactionsData: InfinityTransaction[] = [
    {
        id: 'tx_init_student1',
        studentId: 'student1',
        amount: 5,
        type: 'earn',
        description: 'Regalo de bienvenida de AulaInfinity 🎁',
        timestamp: '2024-05-15T10:05:00Z'
    },
    {
        id: 'tx_buy_student1',
        studentId: 'student1',
        amount: 5,
        type: 'earn',
        description: 'Compra de Paquete de Plata de Infinitys 🪙',
        timestamp: '2024-05-20T14:30:00Z'
    },
    {
        id: 'tx_tut_math_student1',
        studentId: 'student1',
        amount: -1,
        type: 'spend',
        description: 'Reserva de Tutoría de Matemáticas con Prof. María G.',
        timestamp: '2024-05-25T16:00:00Z'
    },
    {
        id: 'tx_tut_phys_student1',
        studentId: 'student1',
        amount: -1,
        type: 'spend',
        description: 'Reserva de Tutoría de Física con Prof. Carlos D.',
        timestamp: '2024-05-28T11:00:00Z'
    },
    {
        id: 'tx_init_student2',
        studentId: 'student2',
        amount: 5,
        type: 'earn',
        description: 'Regalo de bienvenida de AulaInfinity 🎁',
        timestamp: '2024-06-20T11:35:00Z'
    },
    {
        id: 'tx_tut1_student2',
        studentId: 'student2',
        amount: -1,
        type: 'spend',
        description: 'Reserva de Tutoría de Física',
        timestamp: '2024-06-21T10:00:00Z'
    },
    {
        id: 'tx_tut2_student2',
        studentId: 'student2',
        amount: -1,
        type: 'spend',
        description: 'Reserva de Tutoría de Química',
        timestamp: '2024-06-22T12:00:00Z'
    },
    {
        id: 'tx_tut3_student2',
        studentId: 'student2',
        amount: -1,
        type: 'spend',
        description: 'Reserva de Tutoría de Álgebra',
        timestamp: '2024-06-23T15:00:00Z'
    },
    {
        id: 'tx_tut4_student2',
        studentId: 'student2',
        amount: -1,
        type: 'spend',
        description: 'Reserva de Tutoría de Geometría',
        timestamp: '2024-06-24T17:00:00Z'
    },
    {
        id: 'tx_tut5_student2',
        studentId: 'student2',
        amount: -1,
        type: 'spend',
        description: 'Reserva de Tutoría de Cálculo',
        timestamp: '2024-06-25T09:00:00Z'
    },
    {
        id: 'tx_init_student3',
        studentId: 'student3',
        amount: 5,
        type: 'earn',
        description: 'Regalo de bienvenida de AulaInfinity 🎁',
        timestamp: '2024-07-01T15:05:00Z'
    },
    {
        id: 'tx_quiz_student3',
        studentId: 'student3',
        amount: 1,
        type: 'earn',
        description: 'Cuestionario de Biología completado con éxito 📝',
        timestamp: '2024-07-02T10:20:00Z'
    },
    {
        id: 'tx_tut1_student3',
        studentId: 'student3',
        amount: -1,
        type: 'spend',
        description: 'Reserva de Tutoría de Biología',
        timestamp: '2024-07-03T11:00:00Z'
    },
    {
        id: 'tx_tut2_student3',
        studentId: 'student3',
        amount: -1,
        type: 'spend',
        description: 'Reserva de Tutoría de Geografía',
        timestamp: '2024-07-04T12:00:00Z'
    },
    {
        id: 'tx_tut3_student3',
        studentId: 'student3',
        amount: -1,
        type: 'spend',
        description: 'Reserva de Tutoría de Historia',
        timestamp: '2024-07-05T16:00:00Z'
    },
    {
        id: 'tx_init_student4',
        studentId: 'student4',
        amount: 5,
        type: 'earn',
        description: 'Regalo de bienvenida de AulaInfinity 🎁',
        timestamp: '2024-04-05T09:05:00Z'
    }
];

export let studentPaymentsData: StudentPayment[] = [
    {
        id: 'pay_1',
        studentId: 'student1',
        studentName: 'Lucía G.',
        amount: 30,
        date: '2024-05-15T10:15:00Z',
        concept: 'Suscripción Premium Mensual',
        method: 'Tarjeta',
        invoiceNumber: 'FAC-2024-001'
    },
    {
        id: 'pay_2',
        studentId: 'student1',
        studentName: 'Lucía G.',
        amount: 15,
        date: '2024-05-20T14:35:00Z',
        concept: 'Compra de 5 créditos',
        method: 'Bizum',
        invoiceNumber: 'FAC-2024-002'
    },
    {
        id: 'pay_3',
        studentId: 'student1',
        studentName: 'Lucía G.',
        amount: 30,
        date: '2024-06-15T10:30:00Z',
        concept: 'Suscripción Premium Mensual',
        method: 'Tarjeta',
        invoiceNumber: 'FAC-2024-003'
    },
    {
        id: 'pay_4',
        studentId: 'student2',
        studentName: 'Carlos M.',
        amount: 10,
        date: '2024-06-20T11:45:00Z',
        concept: 'Matrícula de curso ESO 4º',
        method: 'Efectivo',
        invoiceNumber: 'FAC-2024-004'
    },
    {
        id: 'pay_5',
        studentId: 'student3',
        studentName: 'Sofía R.',
        amount: 15,
        date: '2024-07-01T15:10:00Z',
        concept: 'Compra de 3 créditos',
        method: 'Bizum',
        invoiceNumber: 'FAC-2024-005'
    },
    {
        id: 'pay_6',
        studentId: 'student4',
        studentName: 'Nuevo Estudiante',
        amount: 20,
        date: '2024-04-05T09:15:00Z',
        concept: 'Compra de 5 créditos',
        method: 'Bizum',
        invoiceNumber: 'FAC-2024-006'
    }
];

export let teacherPaymentsData: TeacherPayment[] = [
    {
        id: 'tpay_1',
        teacherId: 'teacher2',
        teacherName: 'Marta Robles',
        studentId: 'student1',
        studentName: 'Lucía G.',
        classConcept: 'Tutoría de Matemáticas (2º Bachillerato)',
        classPrice: 25,
        percentage: 80,
        amount: 20,
        date: '2026-06-25T17:00:00Z',
        method: 'Transferencia',
        invoiceNumber: 'PAG-2026-001'
    },
    {
        id: 'tpay_2',
        teacherId: 'teacher1',
        teacherName: 'Carlos Vega',
        studentId: 'student2',
        studentName: 'Carlos M.',
        classConcept: 'Clase de Física y Química',
        classPrice: 20,
        percentage: 80,
        amount: 16,
        date: '2026-06-28T10:30:00Z',
        method: 'Bizum',
        invoiceNumber: 'PAG-2026-002'
    }
];

export let studentExpensesData: StudentExpense[] = [
    {
        id: 'exp_1',
        studentId: 'student1',
        studentName: 'Lucía G.',
        amount: 1,
        unit: 'credits',
        date: '2024-05-25T16:00:00Z',
        concept: 'Reserva de Tutoría de Matemáticas con Prof. María G.'
    },
    {
        id: 'exp_2',
        studentId: 'student1',
        studentName: 'Lucía G.',
        amount: 1,
        unit: 'credits',
        date: '2024-05-28T11:00:00Z',
        concept: 'Reserva de Tutoría de Física con Prof. Carlos D.'
    },
    {
        id: 'exp_3',
        studentId: 'student1',
        studentName: 'Lucía G.',
        amount: 10,
        unit: 'eur',
        date: '2024-06-02T18:00:00Z',
        concept: 'Compra de Material PDF Sintaxis'
    },
    {
        id: 'exp_4',
        studentId: 'student2',
        studentName: 'Carlos M.',
        amount: 1,
        unit: 'credits',
        date: '2024-06-21T10:00:00Z',
        concept: 'Reserva de Tutoría de Física'
    },
    {
        id: 'exp_5',
        studentId: 'student2',
        studentName: 'Carlos M.',
        amount: 1,
        unit: 'credits',
        date: '2024-06-22T12:00:00Z',
        concept: 'Reserva de Tutoría de Química'
    },
    {
        id: 'exp_6',
        studentId: 'student2',
        studentName: 'Carlos M.',
        amount: 1,
        unit: 'credits',
        date: '2024-06-23T15:00:00Z',
        concept: 'Reserva de Tutoría de Álgebra'
    },
    {
        id: 'exp_7',
        studentId: 'student2',
        studentName: 'Carlos M.',
        amount: 1,
        unit: 'credits',
        date: '2024-06-24T17:00:00Z',
        concept: 'Reserva de Tutoría de Geometría'
    },
    {
        id: 'exp_8',
        studentId: 'student2',
        studentName: 'Carlos M.',
        amount: 1,
        unit: 'credits',
        date: '2024-06-25T09:00:00Z',
        concept: 'Reserva de Tutoría de Cálculo'
    },
    {
        id: 'exp_9',
        studentId: 'student3',
        studentName: 'Sofía R.',
        amount: 1,
        unit: 'credits',
        date: '2024-07-03T11:00:00Z',
        concept: 'Reserva de Tutoría de Biología'
    },
    {
        id: 'exp_10',
        studentId: 'student3',
        studentName: 'Sofía R.',
        amount: 1,
        unit: 'credits',
        date: '2024-07-04T12:00:00Z',
        concept: 'Reserva de Tutoría de Geografía'
    },
    {
        id: 'exp_11',
        studentId: 'student3',
        studentName: 'Sofía R.',
        amount: 1,
        unit: 'credits',
        date: '2024-07-05T16:00:00Z',
        concept: 'Reserva de Tutoría de Historia'
    }
];

export const dbFetchStudentPayments = (studentId?: string): StudentPayment[] => {
    if (studentId) {
        return studentPaymentsData.filter(p => p.studentId === studentId)
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }
    return studentPaymentsData.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
};

export const dbFetchStudentExpenses = (studentId?: string): StudentExpense[] => {
    if (studentId) {
        return studentExpensesData.filter(e => e.studentId === studentId)
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }
    return studentExpensesData.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
};

export const dbCreateStudentPayment = (data: {
    studentId: string;
    amount: number;
    concept: string;
    method: 'Tarjeta' | 'Transferencia' | 'Efectivo' | 'Bizum';
    date?: string;
    status?: 'pending' | 'approved' | 'rejected' | 'completed';
    itemType?: 'subscription' | 'credits';
    itemQuantity?: number;
    billingPeriod?: 'monthly' | 'annual';
}): StudentPayment => {
    const student = usersData.find(u => u.id === data.studentId);
    if (!student) throw new Error('Estudiante no encontrado');
    
    const invoicePrefix = 'FAC-' + new Date().getFullYear() + '-';
    const invoiceNum = invoicePrefix + String(studentPaymentsData.length + 1).padStart(3, '0');
    
    const newPayment: StudentPayment = {
        id: `pay_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
        studentId: data.studentId,
        studentName: student.name,
        amount: data.amount,
        date: data.date || new Date().toISOString(),
        concept: data.concept,
        method: data.method,
        invoiceNumber: invoiceNum,
        status: data.status || 'completed',
        itemType: data.itemType,
        itemQuantity: data.itemQuantity,
        billingPeriod: data.billingPeriod
    };
    
    studentPaymentsData.push(newPayment);
    syncStudentPaymentToFirestore(newPayment).catch(console.error);
    eventEmitter.emit('student-payment-created', newPayment);
    eventEmitter.emit('student-payments-updated', newPayment);
    return newPayment;
};

export const dbApproveStudentPayment = (paymentId: string): { payment: StudentPayment; updatedUser?: StudentUser } => {
    const payIndex = studentPaymentsData.findIndex(p => p.id === paymentId);
    if (payIndex === -1) throw new Error('Pago no encontrado');
    
    const payment = studentPaymentsData[payIndex];
    payment.status = 'approved';
    if (payment.concept.includes('[Pendiente Bizum]')) {
        payment.concept = payment.concept.replace('[Pendiente Bizum]', '[Bizum Aprobado]');
    } else if (payment.concept.includes('[Pendiente]')) {
        payment.concept = payment.concept.replace('[Pendiente]', '[Aprobado]');
    }

    let updatedUser: StudentUser | undefined;
    const student = usersData.find(u => u.id === payment.studentId);
    if (student) {
        if (payment.itemType === 'subscription' || payment.concept.toLowerCase().includes('suscripción')) {
            updatedUser = dbToggleSubscriptionStatus(payment.studentId, payment.billingPeriod || 'monthly');
        } else {
            const quantity = payment.itemQuantity || 5;
            updatedUser = dbAddCredits(payment.studentId, quantity);
        }
    }

    studentPaymentsData[payIndex] = payment;
    syncStudentPaymentToFirestore(payment).catch(console.error);
    eventEmitter.emit('student-payment-created', payment);
    eventEmitter.emit('student-payments-updated', payment);
    return { payment, updatedUser };
};

export const dbRejectStudentPayment = (paymentId: string): StudentPayment => {
    const payIndex = studentPaymentsData.findIndex(p => p.id === paymentId);
    if (payIndex === -1) throw new Error('Pago no encontrado');

    const payment = studentPaymentsData[payIndex];
    payment.status = 'rejected';
    if (payment.concept.includes('[Pendiente Bizum]')) {
        payment.concept = payment.concept.replace('[Pendiente Bizum]', '[Bizum Rechazado]');
    } else if (payment.concept.includes('[Pendiente]')) {
        payment.concept = payment.concept.replace('[Pendiente]', '[Rechazado]');
    }

    studentPaymentsData[payIndex] = payment;
    syncStudentPaymentToFirestore(payment).catch(console.error);
    eventEmitter.emit('student-payments-updated', payment);
    return payment;
};

export const dbCreateStudentExpense = (data: {
    studentId: string;
    amount: number;
    unit: 'credits' | 'eur';
    concept: string;
    date?: string;
}): StudentExpense => {
    const student = usersData.find(u => u.id === data.studentId);
    if (!student) throw new Error('Estudiante no encontrado');
    
    const newExpense: StudentExpense = {
        id: `exp_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
        studentId: data.studentId,
        studentName: student.name,
        amount: data.amount,
        unit: data.unit,
        date: data.date || new Date().toISOString(),
        concept: data.concept
    };
    
    studentExpensesData.push(newExpense);
    syncStudentExpenseToFirestore(newExpense).catch(console.error);
    return newExpense;
};

export const dbFetchTeacherPayments = (teacherId?: string): TeacherPayment[] => {
    if (teacherId) {
        return teacherPaymentsData.filter(p => p.teacherId === teacherId)
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }
    return teacherPaymentsData.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
};

export const dbCreateTeacherPayment = (data: {
    teacherId: string;
    studentId: string;
    classConcept: string;
    classPrice: number;
    percentage: number;
    amount: number;
    method: 'Tarjeta' | 'Transferencia' | 'Efectivo' | 'Bizum';
    date?: string;
}): TeacherPayment => {
    const teacher = teachersData.find(t => t.id === data.teacherId);
    if (!teacher) throw new Error('Profesor no encontrado');
    const student = usersData.find(s => s.id === data.studentId);
    if (!student) throw new Error('Estudiante no encontrado');

    const paymentNum = 'PAG-' + new Date().getFullYear() + '-' + String(teacherPaymentsData.length + 1).padStart(3, '0');

    const newPayment: TeacherPayment = {
        id: `tpay_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
        teacherId: data.teacherId,
        teacherName: teacher.name,
        studentId: data.studentId,
        studentName: student.name,
        classConcept: data.classConcept,
        classPrice: data.classPrice,
        percentage: data.percentage,
        amount: data.amount,
        date: data.date || new Date().toISOString(),
        method: data.method,
        invoiceNumber: paymentNum
    };

    teacherPaymentsData.push(newPayment);
    eventEmitter.emit('teacher-payment-created', newPayment);
    return newPayment;
};

export const dbResetFinancialRecords = (resetBalances: boolean = true) => {
    studentPaymentsData.length = 0;
    studentExpensesData.length = 0;
    teacherPaymentsData.length = 0;
    infinityTransactionsData.length = 0;
    if (resetBalances) {
        usersData.forEach(u => {
            if (u.role === 'student') {
                u.creditsBalance = 0;
                eventEmitter.emit('user-update', u);
            }
        });
    }
    eventEmitter.emit('payments-reset');
    eventEmitter.emit('expenses-reset');
    eventEmitter.emit('teacher-payments-reset');
};


// --- AUTH ---

export const normalizeAnyUser = <T extends AnyUser>(user: T | undefined): T | undefined => {
    if (!user) return undefined;
    if (user.role === 'admin') return { ...user, favoriteVideos: Array.isArray((user as any).favoriteVideos) ? (user as any).favoriteVideos : [] };
    if (user.role === 'teacher') {
        const t = user as any;
        const taughtList = Array.isArray(t.taughtCourseIds) && t.taughtCourseIds.length > 0 
            ? t.taughtCourseIds 
            : (Array.isArray(t.coursesTaughtIds) && t.coursesTaughtIds.length > 0 ? t.coursesTaughtIds : (Array.isArray(t.levels) ? t.levels : []));
        const levelsList = Array.isArray(t.levels) && t.levels.length > 0 ? t.levels : taughtList;
        return {
            ...t,
            taughtCourseIds: taughtList,
            coursesTaughtIds: taughtList,
            schedules: Array.isArray(t.schedules) ? t.schedules : [],
            subjects: Array.isArray(t.subjects) ? t.subjects : [],
            levels: levelsList,
            favoriteVideos: Array.isArray(t.favoriteVideos) ? t.favoriteVideos : [],
        };
    }
    const u = user as any;
    return {
        ...u,
        watchedVideos: Array.isArray(u.watchedVideos) ? u.watchedVideos : [],
        favoriteVideos: Array.isArray(u.favoriteVideos) ? u.favoriteVideos : [],
        enrolledCourseIds: Array.isArray(u.enrolledCourseIds) ? u.enrolledCourseIds : [],
        completedVideoIds: Array.isArray(u.completedVideoIds) ? u.completedVideoIds : [],
        unlockedRewardIds: Array.isArray(u.unlockedRewardIds) ? u.unlockedRewardIds : [],
        unlockedBadgeIds: Array.isArray(u.unlockedBadgeIds) ? u.unlockedBadgeIds : [],
        registrationDate: u.registrationDate || new Date().toISOString(),
    };
};

export const dbAuthenticateStudent = (email: string, password: string): AnyUser | undefined => {
    const emailLower = email.trim().toLowerCase();
    const admin = adminUserData.find(a => a.email?.toLowerCase() === emailLower && a.password === password);
    if (admin) return normalizeAnyUser(admin);
    const teacher = teachersData.find(t => t.email?.toLowerCase() === emailLower && t.password === password);
    if (teacher) return normalizeAnyUser(teacher);
    const user = usersData.find(u => u.email?.toLowerCase() === emailLower && u.password === password);
    return normalizeAnyUser(user);
};

export const dbFindUserByEmail = (email: string): AnyUser | undefined => {
    const emailLower = email.trim().toLowerCase();
    const admin = adminUserData.find(a => a.email?.toLowerCase() === emailLower);
    if (admin) return normalizeAnyUser(admin);
    const teacher = teachersData.find(t => t.email?.toLowerCase() === emailLower);
    if (teacher) return normalizeAnyUser(teacher);
    const user = usersData.find(u => u.email?.toLowerCase() === emailLower);
    return normalizeAnyUser(user);
};

export const dbUpdateUserPassword = (email: string, newPassword: string): void => {
    const emailLower = email.trim().toLowerCase();
    const admin = adminUserData.find(a => a.email?.toLowerCase() === emailLower);
    if (admin) { admin.password = newPassword; return; }
    const teacher = teachersData.find(t => t.email?.toLowerCase() === emailLower);
    if (teacher) { teacher.password = newPassword; return; }
    const user = usersData.find(u => u.email?.toLowerCase() === emailLower);
    if (user) { user.password = newPassword; }
};

export const dbAuthenticateAdmin = (username: string, password: string): AdminUser | undefined => {
    return adminUserData.find(a => a.username === username && a.password === password);
};

export const dbRegisterStudent = (data: { name: string; email: string; password?: string; enrolledCourseIds: string[]; phone: string }): StudentUser => {
    if (usersData.some(u => u.email === data.email)) {
        throw new Error('Este correo electrónico ya está en uso.');
    }
    const newUser: StudentUser = {
        id: `student${usersData.length + 1}`,
        name: data.name,
        email: data.email,
        password: data.password,
        role: 'student',
        watchedVideos: [],
        isSubscribed: false,
        registrationDate: new Date().toISOString(),
        enrolledCourseIds: data.enrolledCourseIds,
        phone: data.phone,
        creditsBalance: 5, // 5 welcome credits for booking classes
    };
    usersData.push(newUser);
    eventEmitter.emit('user-update', newUser); // Emit user update event
    return newUser;
};

export const dbRegisterTeacher = (data: { 
    name: string; 
    email: string; 
    password?: string; 
    phone: string; 
    category: string;
    subjects?: string[];
    levels?: string[];
    schedules?: string[];
}): TeacherUser => {
    if (teachersData.some(t => t.email === data.email) || usersData.some(u => u.email === data.email)) {
        throw new Error('Este correo electrónico ya está en uso.');
    }
    const newTeacher: TeacherUser = {
        id: `teacher${teachersData.length + 1}`,
        name: data.name,
        email: data.email,
        password: data.password || 'password123',
        role: 'teacher',
        phone: data.phone,
        avatar: `https://api.dicebear.com/8.x/avataaars/svg?seed=${encodeURIComponent(data.name)}`,
        category: data.category,
        isApprovedForTutoring: false, // Pending admin approval
        subjects: data.subjects || [],
        levels: data.levels || [],
        schedules: data.schedules || [],
    };
    teachersData.push(newTeacher);
    eventEmitter.emit('user-update', newTeacher); // Emit user update event
    return newTeacher;
};


// Track deleted user IDs/emails to prevent re-adding deleted teachers or students
export const deletedUserKeys = new Set<string>();
export const deletedCommentIds = new Set<string>();
export const deletedTopicRequestIds = new Set<string>();
export const deletedTutoringRequestIds = new Set<string>();
export const deletedAgendaIds = new Set<string>();
export const deletedCourseIds = new Set<string>();

export const markUserAsDeleted = (idVal?: string, email?: string) => {
    if (idVal) deletedUserKeys.add(idVal);
    if (email) deletedUserKeys.add(email.toLowerCase());
};

export const restoreUserFromDeleted = (idVal?: string, email?: string) => {
    if (idVal) deletedUserKeys.delete(idVal);
    if (email) deletedUserKeys.delete(email.toLowerCase());
};

export const isUserDeleted = (idVal?: string, email?: string): boolean => {
    if (idVal && deletedUserKeys.has(idVal)) return true;
    if (email && deletedUserKeys.has(email.toLowerCase())) return true;
    return false;
};

export const markItemAsDeleted = (idVal: string, type: string) => {
    if (!idVal) return;
    const lowerType = (type || '').toLowerCase();
    if (lowerType === 'user' || lowerType === 'teacher' || lowerType === 'student' || lowerType === 'admin') {
        markUserAsDeleted(idVal);
        dbPurgeUserFromMemory(idVal);
    } else if (lowerType === 'comment') {
        deletedCommentIds.add(idVal);
        const idx = commentsData.findIndex(c => c.id === idVal);
        if (idx > -1) {
            const [deleted] = commentsData.splice(idx, 1);
            eventEmitter.emit('comment-deleted', deleted || { id: idVal });
        }
    } else if (lowerType === 'topic_request' || lowerType === 'request' || lowerType === 'sugerencia') {
        deletedTopicRequestIds.add(idVal);
        const idx = topicRequestsData.findIndex(r => r.id === idVal);
        if (idx > -1) {
            const [deleted] = topicRequestsData.splice(idx, 1);
            eventEmitter.emit('request-deleted', deleted || { id: idVal });
        }
    } else if (lowerType === 'tutoring') {
        deletedTutoringRequestIds.add(idVal);
        const idx = tutoringRequestsData.findIndex(r => r.id === idVal);
        if (idx > -1) {
            const [deleted] = tutoringRequestsData.splice(idx, 1);
            eventEmitter.emit('tutoring-deleted', deleted || { id: idVal });
        }
    } else if (lowerType === 'agenda') {
        deletedAgendaIds.add(idVal);
        const idx = agendaData.findIndex(a => a.id === idVal);
        if (idx > -1) agendaData.splice(idx, 1);
    } else if (lowerType === 'course' || lowerType === 'level') {
        deletedCourseIds.add(idVal);
    }
};

// --- USERS ---

export const dbFetchUsers = (): StudentUser[] => 
    usersData
        .filter(u => !isUserDeleted(u.id, u.email) && !isUserDeleted((u as any).uid) && !isUserDeleted((u as any).firebaseUid))
        .map(u => normalizeAnyUser({ ...u }) as StudentUser);

export const dbFetchTeachers = (): TeacherUser[] => 
    teachersData
        .filter(t => !isUserDeleted(t.id, t.email) && !isUserDeleted((t as any).uid) && !isUserDeleted((t as any).firebaseUid))
        .map(t => normalizeAnyUser({ ...t }) as TeacherUser);

export const dbCreateTeacher = (data: { name: string; email: string; password?: string; phone: string; category: string }): TeacherUser => {
    if (teachersData.some(t => t.email === data.email) || usersData.some(u => u.email === data.email)) {
        throw new Error('Este correo electrónico ya está en uso.');
    }
    const newTeacher: TeacherUser = {
        id: `teacher${teachersData.length + 1}`,
        name: data.name,
        email: data.email,
        password: data.password || 'password123',
        role: 'teacher',
        phone: data.phone,
        avatar: `https://api.dicebear.com/8.x/avataaars/svg?seed=${encodeURIComponent(data.name)}`,
        category: data.category
    };
    teachersData.push(newTeacher);
    return newTeacher;
};

export const dbUpdateTeacherApproval = (teacherId: string, isApprovedForTutoring: boolean): TeacherUser => {
    const teacher = teachersData.find(t => t.id === teacherId);
    if (!teacher) throw new Error('Profesor no encontrado');
    teacher.isApprovedForTutoring = isApprovedForTutoring;
    eventEmitter.emit('user-update', teacher);
    return teacher;
};

export const dbUpdateTeacherDetails = (teacherId: string, data: {
    isApprovedForTutoring?: boolean;
    subjects?: string[];
    levels?: string[];
    schedules?: string[];
    category?: string;
    aiEnabled?: boolean;
    videosEnabled?: boolean;
    canEditContent?: boolean;
    taughtCourseIds?: string[];
    coursesTaughtIds?: string[];
}): TeacherUser => {
    const teacher = teachersData.find(t => t.id === teacherId);
    if (!teacher) throw new Error('Profesor no encontrado');
    
    if (data.isApprovedForTutoring !== undefined) {
        teacher.isApprovedForTutoring = data.isApprovedForTutoring;
    }
    if (data.subjects !== undefined) {
        teacher.subjects = data.subjects;
    }
    if (data.levels !== undefined) {
        teacher.levels = data.levels;
    }
    if (data.schedules !== undefined) {
        teacher.schedules = data.schedules;
    }
    if (data.category !== undefined) {
        teacher.category = data.category;
    }
    if (data.aiEnabled !== undefined) {
        teacher.aiEnabled = data.aiEnabled;
    }
    if (data.videosEnabled !== undefined) {
        teacher.videosEnabled = data.videosEnabled;
    }
    if (data.canEditContent !== undefined) {
        teacher.canEditContent = data.canEditContent;
    }
    if (data.taughtCourseIds !== undefined || data.coursesTaughtIds !== undefined) {
        const list = data.taughtCourseIds || data.coursesTaughtIds || [];
        teacher.taughtCourseIds = list;
        teacher.coursesTaughtIds = list;
    }
    
    eventEmitter.emit('user-update', teacher);
    return teacher;
};

export const dbFindUserAnywhere = (idVal: string): AnyUser | null => {
    if (!idVal) return null;
    const matchFn = (u: any) => u && (u.id === idVal || u.uid === idVal || u.firebaseUid === idVal || (u.email && u.email.toLowerCase() === idVal.toLowerCase()));
    return teachersData.find(matchFn) || usersData.find(matchFn) || adminUserData.find(matchFn) || null;
};

export const dbPurgeUserFromMemory = (idVal: string): AnyUser | null => {
    let deletedObj: any = null;
    if (!idVal) return null;
    const matchFn = (u: any) => u && (u.id === idVal || u.uid === idVal || u.firebaseUid === idVal || (u.email && u.email.toLowerCase() === idVal.toLowerCase()));
    
    let idx;
    while ((idx = teachersData.findIndex(matchFn)) !== -1) {
        const [del] = teachersData.splice(idx, 1);
        if (!deletedObj) deletedObj = del;
    }
    while ((idx = usersData.findIndex(matchFn)) !== -1) {
        const [del] = usersData.splice(idx, 1);
        if (!deletedObj) deletedObj = del;
    }
    while ((idx = adminUserData.findIndex(matchFn)) !== -1) {
        const [del] = adminUserData.splice(idx, 1);
        if (!deletedObj) deletedObj = del;
    }

    const targetKeys = Array.from(new Set([
        idVal,
        deletedObj?.id,
        deletedObj?.uid,
        deletedObj?.firebaseUid,
        deletedObj?.email
    ].filter((k): k is string => Boolean(k))));

    targetKeys.forEach(k => {
        if (k) {
            deletedUserKeys.add(k);
            if (k.includes('@')) deletedUserKeys.add(k.toLowerCase());
        }
    });

    if (targetKeys.length > 0) {
        const isMatchKey = (str?: string) => {
            if (!str) return false;
            return targetKeys.some(k => str === k || str.includes(k) || (str.includes('@') && k.includes('@') && str.toLowerCase() === k.toLowerCase()));
        };

        // 1. Purge support/tutoring conversations
        for (let i = conversationsData.length - 1; i >= 0; i--) {
            const c = conversationsData[i];
            if (isMatchKey(c.studentId) || isMatchKey(c.teacherId) || isMatchKey(c.id)) {
                conversationsData.splice(i, 1);
            }
        }

        // 2. Purge direct messages
        for (let i = directMessagesData.length - 1; i >= 0; i--) {
            const m = directMessagesData[i];
            if (isMatchKey(m.senderId) || isMatchKey(m.conversationId)) {
                directMessagesData.splice(i, 1);
            }
        }

        // 3. Purge student peer conversations
        for (let i = studentPeerConversationsData.length - 1; i >= 0; i--) {
            const c = studentPeerConversationsData[i];
            if (c.participantIds.some(p => isMatchKey(p)) || isMatchKey(c.id)) {
                studentPeerConversationsData.splice(i, 1);
            }
        }

        // 4. Purge student peer messages
        for (let i = studentPeerMessagesData.length - 1; i >= 0; i--) {
            const m = studentPeerMessagesData[i];
            if (isMatchKey(m.senderId) || isMatchKey(m.conversationId)) {
                studentPeerMessagesData.splice(i, 1);
            }
        }

        // 5. Purge teacher messages
        for (let i = teacherMessagesData.length - 1; i >= 0; i--) {
            const m = teacherMessagesData[i];
            if (isMatchKey(m.senderId) || isMatchKey((m as any).teacherId) || isMatchKey((m as any).studentId) || isMatchKey(m.conversationId)) {
                teacherMessagesData.splice(i, 1);
            }
        }

        // 6. Purge friend connections
        for (let i = studentFriendsData.length - 1; i >= 0; i--) {
            const f = studentFriendsData[i];
            if (isMatchKey(f.studentId) || isMatchKey(f.friendId)) {
                studentFriendsData.splice(i, 1);
            }
        }

        // 7. Unassign teacher from any assigned students
        usersData.forEach(s => {
            if (s.assignedTeacherId && isMatchKey(s.assignedTeacherId)) {
                s.assignedTeacherId = undefined;
                s.assignedTeacherName = undefined;
            }
        });
    }

    if (deletedObj) {
        eventEmitter.emit('user-deleted', deletedObj);
        eventEmitter.emit('user-deleted', deletedObj.id);
        if (deletedObj.uid) eventEmitter.emit('user-deleted', deletedObj.uid);
        if (deletedObj.firebaseUid) eventEmitter.emit('user-deleted', deletedObj.firebaseUid);
        eventEmitter.emit('message-update');
        eventEmitter.emit('peer-message-update');
        eventEmitter.emit('teacher-message-update');
    } else {
        // Quietly ignore if not found in local memory to avoid console warning spam during multi-user FirestoreSync
    }
    return deletedObj;
};

export const dbDeleteTeacher = (teacherId: string): { teacherId: string } => {
    dbPurgeUserFromMemory(teacherId);
    return { teacherId };
};

export const dbUpdateUserPermissions = (userId: string, role: 'student' | 'teacher' | 'admin', permissions: { aiEnabled?: boolean; videosEnabled?: boolean; canInitiateCalls?: boolean; canInitiateWhiteboard?: boolean }): AnyUser => {
    let targetUser = (role === 'student' ? usersData.find(u => u.id === userId) : null)
        || (role === 'teacher' ? teachersData.find(t => t.id === userId) : null)
        || (role === 'admin' ? adminUserData.find(a => a.id === userId) : null)
        || usersData.find(u => u.id === userId)
        || teachersData.find(t => t.id === userId)
        || adminUserData.find(a => a.id === userId);

    if (!targetUser) throw new Error('Usuario no encontrado');
    if (permissions.aiEnabled !== undefined) {
        (targetUser as any).aiEnabled = appConfigData.aiEnabled === false ? false : permissions.aiEnabled;
    }
    if (permissions.videosEnabled !== undefined) {
        (targetUser as any).videosEnabled = appConfigData.videosEnabled === false ? false : permissions.videosEnabled;
    }
    if (permissions.canInitiateCalls !== undefined) {
        (targetUser as any).canInitiateCalls = permissions.canInitiateCalls;
    }
    if (permissions.canInitiateWhiteboard !== undefined) {
        (targetUser as any).canInitiateWhiteboard = permissions.canInitiateWhiteboard;
    }
    eventEmitter.emit('user-update', targetUser);
    return targetUser;
};

export const dbUpdateStudentNotes = (studentId: string, notes: string): StudentUser => {
    const student = usersData.find(u => u.id === studentId);
    if (!student) throw new Error('Estudiante no encontrado');
    student.adminNotes = notes;
    eventEmitter.emit('user-update', student);
    return student;
};

export const dbUpdateStudentCredits = (studentId: string, credits: number): StudentUser => {
    const student = usersData.find(u => u.id === studentId);
    if (!student) throw new Error('Estudiante no encontrado');
    student.creditsBalance = credits;
    eventEmitter.emit('user-update', student);
    return student;
};

export const dbToggleSubscriptionStatus = (studentId: string, period?: 'monthly' | 'annual'): StudentUser => {
    const user = usersData.find(u => u.id === studentId);
    if (!user) throw new Error('User not found');
    const wasSubscribed = user.isSubscribed;
    
    if (appConfigData.subscriptionsEnabled === false && (period || !wasSubscribed)) {
        user.isSubscribed = false;
        delete user.subscriptionPeriod;
        throw new Error('Las suscripciones están desactivadas globalmente en Ajustes Generales.');
    }

    if (period) {
        user.isSubscribed = true;
        user.subscriptionPeriod = period;
    } else {
        user.isSubscribed = !user.isSubscribed;
        if (user.isSubscribed) {
            user.subscriptionPeriod = 'monthly';
        } else {
            delete user.subscriptionPeriod;
        }
    }
    
    // Only emit and log payment if it's a *new* subscription
    if (user.isSubscribed && !wasSubscribed) {
        const cost = user.subscriptionPeriod === 'annual' ? 240 : 30;
        const concept = `Suscripción Premium ${user.subscriptionPeriod === 'annual' ? 'Anual' : 'Mensual'}`;
        dbCreateStudentPayment({
            studentId,
            amount: cost,
            concept,
            method: 'Tarjeta'
        });
    }
    eventEmitter.emit('subscription-update', user);
    eventEmitter.emit('user-update', user);
    return user;
};

export const dbAddCredits = (studentId: string, amount: number): StudentUser => {
    const user = usersData.find(u => u.id === studentId);
    if (!user) throw new Error('User not found');
    user.creditsBalance = (user.creditsBalance || 0) + amount;
    
    const wasSubscribed = user.isSubscribed;
    user.isSubscribed = true;
    user.subscriptionPeriod = 'monthly'; // Gives full premium access
    
    const newTx: InfinityTransaction = {
        id: `tx_buy_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
        studentId,
        amount,
        type: 'earn',
        description: `Adquisición de paquete de ${amount} ${amount === 1 ? 'Infinity' : 'Infinitys'} + ¡3 Meses Premium Incluidos! 🌟🪙`,
        timestamp: new Date().toISOString()
    };
    infinityTransactionsData.push(newTx);
    syncAddInfinityTransactionToFirestore(newTx);

    dbCreateStudentPayment({
        studentId,
        amount: amount * 3, // €3 per credit package rate
        concept: `Adquisición de ${amount} créditos + Bono Premium`,
        method: 'Tarjeta'
    });

    if (!wasSubscribed) {
        eventEmitter.emit('subscription-update', user);
    }
    eventEmitter.emit('user-update', user);
    return user;
};

export const dbDeductCredits = (studentId: string, amount: number): StudentUser => {
    const user = usersData.find(u => u.id === studentId);
    if (!user) throw new Error('User not found');
    const currentBalance = user.creditsBalance || 0;
    if (currentBalance <= 0) throw new Error('El alumno ya tiene 0 créditos');
    const deductAmount = Math.min(currentBalance, Math.max(1, amount));
    user.creditsBalance = currentBalance - deductAmount;

    const newTx: InfinityTransaction = {
        id: `tx_ded_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
        studentId,
        amount: -deductAmount,
        type: 'spend',
        description: `Ajuste manual de créditos (-${deductAmount} ${deductAmount === 1 ? 'Infinity' : 'Infinitys'})`,
        timestamp: new Date().toISOString()
    };
    infinityTransactionsData.push(newTx);
    syncAddInfinityTransactionToFirestore(newTx);

    dbCreateStudentExpense({
        studentId,
        amount: deductAmount,
        unit: 'credits',
        concept: `Ajuste administrativo: reducción de ${deductAmount} créditos`
    });

    eventEmitter.emit('user-update', user);
    return user;
};

export const dbFetchInfinityTransactions = (studentId: string): InfinityTransaction[] => {
    return infinityTransactionsData.filter(tx => tx.studentId === studentId)
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
};

export const dbDeleteUser = (userId: string): { userId: string } => {
    dbPurgeUserFromMemory(userId);
    return { userId };
};

export const dbAssignUserRoleByEmail = (data: { email: string; role: 'student' | 'teacher'; category?: string }): { success: boolean; message: string; user: AnyUser } => {
    const emailLower = data.email.trim().toLowerCase();
    
    // Check if the user is an admin to protect them
    const isAdmin = adminUserData.some(a => a.email?.toLowerCase() === emailLower);
    if (isAdmin) {
        throw new Error('No se puede cambiar el rol de un administrador.');
    }

    const studentIndex = usersData.findIndex(u => u.email.toLowerCase() === emailLower);
    const teacherIndex = teachersData.findIndex(t => t.email.toLowerCase() === emailLower);
    const targetCategory = data.category || 'General';

    if (data.role === 'teacher') {
        if (teacherIndex !== -1) {
            const teacher = teachersData[teacherIndex];
            if (data.category) {
                teacher.category = data.category;
            }
            return { success: true, message: `El usuario ya es profesor. Especialidad actualizada a: ${teacher.category}`, user: teacher };
        }

        if (studentIndex !== -1) {
            const student = usersData[studentIndex];
            usersData.splice(studentIndex, 1);
            
            const newTeacher: TeacherUser = {
                id: `teacher${teachersData.length + 1}`,
                name: student.name,
                email: student.email,
                password: student.password || 'password123',
                role: 'teacher',
                phone: student.phone || '',
                avatar: `https://api.dicebear.com/8.x/avataaars/svg?seed=${encodeURIComponent(student.name)}`,
                category: targetCategory
            };
            teachersData.push(newTeacher);
            
            eventEmitter.emit('user-update', newTeacher);
            return { success: true, message: `Rol actualizado con éxito: ${student.name} ahora es Profesor.`, user: newTeacher };
        } else {
            const baseName = emailLower.split('@')[0];
            const name = baseName.charAt(0).toUpperCase() + baseName.slice(1);
            const newTeacher: TeacherUser = {
                id: `teacher${teachersData.length + 1}`,
                name: name,
                email: emailLower,
                password: 'password123',
                role: 'teacher',
                phone: '',
                avatar: `https://api.dicebear.com/8.x/avataaars/svg?seed=${encodeURIComponent(name)}`,
                category: targetCategory
            };
            teachersData.push(newTeacher);
            return { success: true, message: `Profesor registrado con éxito como nuevo usuario.`, user: newTeacher };
        }
    } else {
        if (studentIndex !== -1) {
            return { success: true, message: 'El usuario ya cuenta con el rol de Estudiante.', user: usersData[studentIndex] };
        }

        if (teacherIndex !== -1) {
            const teacher = teachersData[teacherIndex];
            teachersData.splice(teacherIndex, 1);
            
            const newStudent: StudentUser = {
                id: `student${usersData.length + 1}`,
                name: teacher.name,
                email: teacher.email,
                password: teacher.password || 'password123',
                role: 'student',
                watchedVideos: [],
                isSubscribed: false,
                registrationDate: new Date().toISOString(),
                enrolledCourseIds: [],
                phone: teacher.phone || '',
            };
            usersData.push(newStudent);
            
            eventEmitter.emit('user-update', newStudent);
            return { success: true, message: `Rol actualizado con éxito: ${teacher.name} ahora es Estudiante.`, user: newStudent };
        } else {
            const baseName = emailLower.split('@')[0];
            const name = baseName.charAt(0).toUpperCase() + baseName.slice(1);
            const newStudent: StudentUser = {
                id: `student${usersData.length + 1}`,
                name: name,
                email: emailLower,
                password: 'password123',
                role: 'student',
                watchedVideos: [],
                isSubscribed: false,
                registrationDate: new Date().toISOString(),
                enrolledCourseIds: [],
                phone: '',
            };
            usersData.push(newStudent);
            eventEmitter.emit('user-update', newStudent);
            return { success: true, message: `Estudiante registrado con éxito como nuevo usuario.`, user: newStudent };
        }
    }
};

export const dbChangeStudentPassword = (studentId: string, current: string, newPass: string): StudentUser => {
    const user = usersData.find(u => u.id === studentId);
    if (!user || user.password !== current) {
        throw new Error('La contraseña actual es incorrecta.');
    }
    user.password = newPass;
    return user;
};

export const dbChangeAdminPassword = ({ currentPassword, newPassword }: { currentPassword: string, newPassword: string }): void => {
    const admin = adminUserData[0];
    if (admin.password !== currentPassword) {
        throw new Error('La contraseña actual es incorrecta.');
    }
    admin.password = newPassword;
};

// FIX: Added missing function dbRequestAdminPasswordRecovery
export const dbRequestAdminPasswordRecovery = async (email: string): Promise<void> => {
    console.log(`Password recovery requested for admin with email (simulated): ${email}`);
    // In a real scenario, this would trigger an email. Here we just resolve.
    return Promise.resolve();
};

// FIX: Added missing function dbRequestPasswordRecovery for students
export const dbRequestPasswordRecovery = async (email: string): Promise<void> => {
    console.log(`Password recovery requested for student with email (simulated): ${email}`);
    return Promise.resolve();
};


export const dbUpdateStudentCourse = (studentId: string, newCourseIds: string[]): StudentUser => {
    const user = usersData.find(u => u.id === studentId);
    if (!user) throw new Error('Usuario no encontrado');
    user.enrolledCourseIds = newCourseIds;
    eventEmitter.emit('user-update', user);
    return user;
};

export const dbResetStudentProgress = (studentId: string): StudentUser => {
    const user = usersData.find(u => u.id === studentId);
    if (!user) throw new Error('Usuario no encontrado');
    user.watchedVideos = [];
    eventEmitter.emit('user-update', user);
    return JSON.parse(JSON.stringify(user));
};

export const dbAdminResetStudentPassword = (studentId: string, newPassword: string): StudentUser => {
    const user = usersData.find(u => u.id === studentId);
    if (!user) throw new Error('Usuario no encontrado');
    user.password = newPassword;
    eventEmitter.emit('user-update', user);
    return JSON.parse(JSON.stringify(user));
};

export const dbAddWatchedVideo = (studentId: string, videoId: string): StudentUser => {
    const user = usersData.find(u => u.id === studentId);
    if (!user) throw new Error('User not found');
    
    if (!user.watchedVideos.includes(videoId)) {
        user.watchedVideos.push(videoId);
        eventEmitter.emit('user-update', user);
    }
    
    // Return a deep copy to simulate getting fresh data from a server
    return JSON.parse(JSON.stringify(user));
};

export const dbToggleFavoriteVideo = (userId: string, videoId: string): AnyUser => {
    const user = usersData.find(u => u.id === userId || (u as any).uid === userId || (u as any).firebaseUid === userId) ||
                 teachersData.find(t => t.id === userId || (t as any).uid === userId || (t as any).firebaseUid === userId) ||
                 adminUserData.find(a => a.id === userId || (a as any).uid === userId || (a as any).firebaseUid === userId);
    if (!user) throw new Error('User not found');
    
    if (!Array.isArray((user as any).favoriteVideos)) {
        (user as any).favoriteVideos = [];
    }
    
    if ((user as any).favoriteVideos.includes(videoId)) {
        (user as any).favoriteVideos = (user as any).favoriteVideos.filter((id: string) => id !== videoId);
    } else {
        (user as any).favoriteVideos.push(videoId);
    }
    
    eventEmitter.emit('user-update', user);
    
    return JSON.parse(JSON.stringify(user));
};


// --- CONTENT ---

export const dbFetchCourses = (): CourseLevel[] => JSON.parse(JSON.stringify(coursesData));

export const dbAddLevel = (levelData: NewCourseLevelData): CourseLevel => {
    const newLevel: CourseLevel = {
        id: `level_${Date.now()}`,
        name: levelData.name,
        subjects: [],
        createdAt: new Date().toISOString(),
    };
    coursesData.push(newLevel);
    eventEmitter.emit('courses-updated', newLevel);
    return newLevel;
};

export const dbUpdateLevel = (levelId: string, levelData: NewCourseLevelData): CourseLevel => {
    const level = coursesData.find(l => l.id === levelId);
    if (!level) throw new Error('Level not found');
    level.name = levelData.name;
    eventEmitter.emit('courses-updated', level);
    return level;
};

export const dbDeleteLevel = (levelId: string): void => {
    const index = coursesData.findIndex(l => l.id === levelId);
    if (index > -1) {
        coursesData.splice(index, 1);
        eventEmitter.emit('courses-updated');
    }
};

export const dbAddSubject = (levelId: string, subjectData: NewSubjectData): Subject => {
    const level = coursesData.find(l => l.id === levelId);
    if (!level) throw new Error('Level not found');
    const newSubject: Subject = {
        id: `subject_${Date.now()}`,
        name: subjectData.name,
        icon: subjectData.icon,
        videos: [],
        createdAt: new Date().toISOString(),
    };
    level.subjects.push(newSubject);
    eventEmitter.emit('courses-updated', newSubject);
    return newSubject;
};

export const dbUpdateSubject = (levelId: string, subjectId: string, subjectData: NewSubjectData): Subject => {
    const level = coursesData.find(l => l.id === levelId);
    const subject = level?.subjects.find(s => s.id === subjectId);
    if (!subject) throw new Error('Subject not found');
    subject.name = subjectData.name;
    subject.icon = subjectData.icon;
    eventEmitter.emit('courses-updated', subject);
    return subject;
};

export const dbDeleteSubject = (levelId: string, subjectId: string): void => {
    const level = coursesData.find(l => l.id === levelId);
    if (level) {
        level.subjects = level.subjects.filter(s => s.id !== subjectId);
        eventEmitter.emit('courses-updated');
    }
};

export const dbAddVideo = (levelId: string, subjectId: string, videoData: NewVideoData, blockId?: string): Video => {
    const subject = coursesData.find(l => l.id === levelId)?.subjects.find(s => s.id === subjectId);
    if (!subject) throw new Error('Subject not found');

    const newVideo: Video = { ...videoData, id: `video_${Date.now()}`, createdAt: new Date().toISOString() };
    
    if (blockId) {
        const block = subject.blocks?.find(b => b.id === blockId);
        if (!block) throw new Error('Block not found');
        block.videos.push(newVideo);
    } else {
        if (!subject.videos) subject.videos = [];
        subject.videos.push(newVideo);
    }
    eventEmitter.emit('video-added', newVideo);
    eventEmitter.emit('courses-updated', newVideo);
    return newVideo;
};

export const dbAddVideos = (levelId: string, subjectId: string, videosData: NewVideoData[], blockId?: string): Video[] => {
    const subject = coursesData.find(l => l.id === levelId)?.subjects.find(s => s.id === subjectId);
    if (!subject) throw new Error('Subject not found');
    
    const newVideos: Video[] = videosData.map((videoData, i) => ({
        ...videoData,
        id: `video_${Date.now()}_${i}`,
        createdAt: new Date().toISOString(),
    }));

    if (blockId) {
        const block = subject.blocks?.find(b => b.id === blockId);
        if (!block) throw new Error('Block not found');
        block.videos.push(...newVideos);
    } else {
        if (!subject.videos) subject.videos = [];
        subject.videos.push(...newVideos);
    }
    newVideos.forEach(v => eventEmitter.emit('video-added', v));
    eventEmitter.emit('courses-updated', newVideos);
    return newVideos;
};


export const dbUpdateVideo = (levelId: string, subjectId: string, videoId: string, videoData: NewVideoData, blockId?: string): Video => {
    const subject = coursesData.find(l => l.id === levelId)?.subjects.find(s => s.id === subjectId);
    if (!subject) throw new Error('Subject not found');
    
    let videoList = blockId ? subject.blocks?.find(b => b.id === blockId)?.videos : subject.videos;
    const videoIndex = videoList?.findIndex(v => v.id === videoId);
    
    if (!videoList || videoIndex === undefined || videoIndex === -1) throw new Error('Video not found');
    
    videoList[videoIndex] = { ...videoList[videoIndex], ...videoData };
    eventEmitter.emit('courses-updated', videoList[videoIndex]);
    return videoList[videoIndex];
};

export const dbDeleteVideo = (levelId: string, subjectId: string, videoId: string, blockId?: string): void => {
    const subject = coursesData.find(l => l.id === levelId)?.subjects.find(s => s.id === subjectId);
    if (subject) {
        if (blockId) {
            const block = subject.blocks?.find(b => b.id === blockId);
            if (block) block.videos = block.videos.filter(v => v.id !== videoId);
        } else {
            subject.videos = subject.videos.filter(v => v.id !== videoId);
        }
        eventEmitter.emit('courses-updated');
    }
};

export const dbAddBlock = (levelId: string, subjectId: string, blockData: NewVideoBlockData): VideoBlock => {
    const subject = coursesData.find(l => l.id === levelId)?.subjects.find(s => s.id === subjectId);
    if (!subject) throw new Error('Subject not found');
    if (!subject.blocks) subject.blocks = [];
    const newBlock: VideoBlock = { id: `block_${Date.now()}`, name: blockData.name, videos: [] };
    subject.blocks.push(newBlock);
    eventEmitter.emit('courses-updated', newBlock);
    return newBlock;
};

export const dbUpdateBlock = (levelId: string, subjectId: string, blockId: string, blockData: NewVideoBlockData): VideoBlock => {
    const block = coursesData.find(l => l.id === levelId)?.subjects.find(s => s.id === subjectId)?.blocks?.find(b => b.id === blockId);
    if (!block) throw new Error('Block not found');
    block.name = blockData.name;
    eventEmitter.emit('courses-updated', block);
    return block;
};

export const dbDeleteBlock = (levelId: string, subjectId: string, blockId: string): void => {
    const subject = coursesData.find(l => l.id === levelId)?.subjects.find(s => s.id === subjectId);
    if (subject?.blocks) {
        subject.blocks = subject.blocks.filter(b => b.id !== blockId);
        eventEmitter.emit('courses-updated');
    }
};


// --- COMMENTS ---

export const dbFetchComments = (videoId: string): Comment[] => commentsData.filter(c => c.videoId === videoId && !deletedCommentIds.has(c.id));
export const dbFetchAllComments = (): Comment[] => commentsData.filter(c => !deletedCommentIds.has(c.id));

export const dbPostComment = (videoId: string, commentData: { author: { id: string; name: string; }, text: string }): Comment => {
    const newComment: Comment = {
        id: `c${Date.now()}`,
        videoId,
        ...commentData,
        timestamp: new Date().toISOString(),
    };
    commentsData.push(newComment);
    eventEmitter.emit('comment-update', newComment);
    syncPostCommentToFirestore(newComment);
    return newComment;
};

export const dbUpdateComment = (commentId: string, text: string): Comment => {
    const comment = commentsData.find(c => c.id === commentId);
    if (!comment) throw new Error('Comment not found');
    comment.text = text;
    eventEmitter.emit('comment-update', comment);
    syncUpdateCommentInFirestore(commentId, text);
    return comment;
};

export const dbMarkCommentAsRead = (commentId: string): Comment => {
    let comment = commentsData.find(c => c.id === commentId);
    if (!comment) {
        comment = {
            id: commentId,
            videoId: '',
            author: { id: '', name: 'Usuario' },
            text: '',
            timestamp: new Date().toISOString(),
            isRead: true
        };
        commentsData.push(comment);
    } else {
        comment.isRead = true;
    }
    eventEmitter.emit('comment-update', comment);
    syncMarkCommentAsReadInFirestore(commentId);
    return comment;
};

export const dbDeleteComment = (commentId: string): { commentId: string } => {
    markItemAsDeleted(commentId, 'comment');
    syncDeleteCommentFromFirestore(commentId);
    return { commentId };
};

// --- CONFIG ---

export const dbFetchAppConfig = (): AppConfig => {
    if (appConfigData.bizumNumber === undefined) appConfigData.bizumNumber = '600 000 000';
    if (appConfigData.aiEnabled === undefined) appConfigData.aiEnabled = true;
    if (appConfigData.videosEnabled === undefined) appConfigData.videosEnabled = true;
    if (appConfigData.subscriptionsEnabled === undefined) appConfigData.subscriptionsEnabled = true;
    if (appConfigData.aiModelSelected === undefined) appConfigData.aiModelSelected = 'gemini-1.5-flash';
    if (appConfigData.aiTutorInstruction === undefined) appConfigData.aiTutorInstruction = 'Eres un tutor socrático, paciente y experto. Explicas temas complejos con metáforas y creas problemas de práctica adicionales para ayudar.';
    if (appConfigData.aiQuizExplanations === undefined) appConfigData.aiQuizExplanations = true;
    if (appConfigData.whatsappMode === undefined) appConfigData.whatsappMode = 'direct';
    if (appConfigData.twilioAccountSid === undefined) appConfigData.twilioAccountSid = '';
    if (appConfigData.twilioAuthToken === undefined) appConfigData.twilioAuthToken = '';
    if (appConfigData.twilioWhatsappFrom === undefined) appConfigData.twilioWhatsappFrom = '';
    if (appConfigData.metaPhoneNumberId === undefined) appConfigData.metaPhoneNumberId = '';
    if (appConfigData.metaAccessToken === undefined) appConfigData.metaAccessToken = '';
    if (appConfigData.evolutionInstanceUrl === undefined) appConfigData.evolutionInstanceUrl = '';
    if (appConfigData.evolutionApiKey === undefined) appConfigData.evolutionApiKey = '';
    if (appConfigData.greenapiIdInstance === undefined) appConfigData.greenapiIdInstance = '';
    if (appConfigData.greenapiApiTokenInstance === undefined) appConfigData.greenapiApiTokenInstance = '';
    if (appConfigData.greenapiApiUrl === undefined) appConfigData.greenapiApiUrl = '';
    return appConfigData;
};
export const dbUpdateAppConfig = (newConfig: AppConfig): AppConfig => {
    Object.assign(appConfigData, newConfig);

    if (appConfigData.aiEnabled === false) {
        usersData.forEach(u => { (u as any).aiEnabled = false; });
        teachersData.forEach(t => { (t as any).aiEnabled = false; });
    }

    if (appConfigData.videosEnabled === false) {
        usersData.forEach(u => { (u as any).videosEnabled = false; });
        teachersData.forEach(t => { (t as any).videosEnabled = false; });
    }

    if (appConfigData.subscriptionsEnabled === false) {
        usersData.forEach(u => {
            if (u.role === 'student' || !u.role) {
                (u as StudentUser).isSubscribed = false;
                delete (u as StudentUser).subscriptionPeriod;
            }
        });
    }

    usersData.forEach(u => eventEmitter.emit('user-update', u));
    teachersData.forEach(t => eventEmitter.emit('user-update', t));
    eventEmitter.emit('app-config-updated', appConfigData);
    return appConfigData;
};

// --- REQUESTS & TUTORING ---

export let userSeenStates: {
    seenStudentUserIds?: string[];
    seenTeacherUserIds?: string[];
    knownSubscriberIds?: string[];
    knownPaymentIds?: string[];
    seenCommentIds?: string[];
} = {};

export const dbFetchUserSeenStates = () => userSeenStates;

export const dbSyncUserSeenStates = (stateData: Partial<typeof userSeenStates>) => {
    userSeenStates = { ...userSeenStates, ...stateData };
    eventEmitter.emit('user-seen-states-updated', userSeenStates);
    syncUserSeenStatesToFirestore(stateData).catch(console.error);
};

export const dbMarkTopicRequestsAsSeen = (role: 'admin' | 'teacher'): void => {
    let updated = false;
    topicRequestsData.forEach(req => {
        if (role === 'admin' && !req.seenByAdmin) {
            req.seenByAdmin = true;
            updated = true;
            syncSubmitTopicRequestToFirestore(req).catch(console.error);
        } else if (role === 'teacher' && !req.seenByTeacher) {
            req.seenByTeacher = true;
            updated = true;
            syncSubmitTopicRequestToFirestore(req).catch(console.error);
        }
    });
    if (updated) {
        eventEmitter.emit('request-update', null);
    }
};

export const dbMarkTutoringRequestsAsSeen = (role: 'admin' | 'teacher' | 'student', userId?: string): void => {
    let updated = false;
    tutoringRequestsData.forEach(req => {
        if (role === 'admin' && !req.seenByAdmin) {
            req.seenByAdmin = true;
            updated = true;
            syncSubmitTutoringRequestToFirestore(req).catch(console.error);
        } else if (role === 'teacher' && !req.seenByTeacher) {
            req.seenByTeacher = true;
            updated = true;
            syncSubmitTutoringRequestToFirestore(req).catch(console.error);
        } else if (role === 'student' && req.studentId === userId && req.seenByStudent === false) {
            req.seenByStudent = true;
            updated = true;
            syncSubmitTutoringRequestToFirestore(req).catch(console.error);
        }
    });
    if (updated) {
        eventEmitter.emit('tutoring-update', null);
    }
};

export const dbFetchTopicRequests = (): TopicRequest[] => topicRequestsData.filter(r => !deletedTopicRequestIds.has(r.id));
export const dbSubmitTopicRequest = (data: Omit<TopicRequest, 'id' | 'timestamp' | 'status'>): TopicRequest => {
    const newRequest: TopicRequest = { ...data, id: `req${Date.now()}`, timestamp: new Date().toISOString(), status: 'pending' };
    topicRequestsData.push(newRequest);
    eventEmitter.emit('request-update', newRequest);
    syncSubmitTopicRequestToFirestore(newRequest);
    return newRequest;
};
export const dbUpdateTopicRequestStatus = (requestId: string, status: 'pending' | 'completed'): TopicRequest => {
    const request = topicRequestsData.find(r => r.id === requestId);
    if (!request) throw new Error('Request not found');
    request.status = status;
    eventEmitter.emit('request-update', request);
    syncUpdateTopicRequestStatusInFirestore(requestId, status);
    return request;
};
export const dbDeleteTopicRequest = (requestId: string): void => {
    markItemAsDeleted(requestId, 'topic_request');
    syncDeleteTopicRequestFromFirestore(requestId);
};

export const dbFetchTutoringRequests = (): TutoringRequest[] => {
    return tutoringRequestsData.filter(r => {
        if (deletedTutoringRequestIds.has(r.id)) return false;
        const tid = r.teacherId;
        if (tid && tid !== 'first_available' && deletedUserKeys.has(tid)) {
            return false;
        }
        return true;
    });
};
const getOrCreateTutoringRequest = (requestId: string): TutoringRequest => {
    let request = tutoringRequestsData.find(r => r.id === requestId);
    if (!request) {
        request = {
            id: requestId,
            studentId: 'student_1',
            studentName: 'Alumno',
            subject: 'Tutoría',
            details: 'Tutoría reservada',
            status: 'pending',
            teacherApproved: false,
            adminApproved: false,
            date: new Date().toISOString().split('T')[0],
            time: '12:00',
            timestamp: new Date().toISOString()
        };
        tutoringRequestsData.push(request);
    }
    return request;
};

export const dbSubmitTutoringRequest = (data: Omit<TutoringRequest, 'id' | 'timestamp' | 'status'>): TutoringRequest => {
    // Find the student user to check/deduct credits
    let student: StudentUser = usersData.find(u => u.id === data.studentId) as StudentUser;
    if (!student) {
        student = dbFindUserAnywhere(data.studentId) as StudentUser;
    }
    if (!student) {
        student = {
            id: data.studentId,
            name: data.studentName || 'Estudiante',
            email: '',
            role: 'student',
            creditsBalance: 5
        } as StudentUser;
        usersData.push(student);
    }

    const credits = student.creditsBalance ?? 5;
    if (credits < 1) {
        student.creditsBalance = 1;
    }

    // Deduct 1 credit
    student.creditsBalance = Math.max(0, (student.creditsBalance || 1) - 1);

    const newTx = {
        id: `tx_tut_${Date.now()}`,
        studentId: data.studentId,
        amount: -1,
        type: 'spend' as const,
        description: `Reserva de Tutoría de ${data.subject}`,
        timestamp: new Date().toISOString()
    };
    infinityTransactionsData.push(newTx);
    syncAddInfinityTransactionToFirestore(newTx).catch(console.error);
    syncUserToFirestore(student, 'student').catch(console.error);

    const newRequest: TutoringRequest = { 
        ...data, 
        id: `treq${Date.now()}`, 
        timestamp: new Date().toISOString(), 
        status: 'pending',
        teacherApproved: false,
        adminApproved: false
    };
    tutoringRequestsData.push(newRequest);
    eventEmitter.emit('user-update', student); // Emit user-update to notify about the new credit balance
    eventEmitter.emit('tutoring-update', newRequest);
    return newRequest;
};
export const dbApproveTutoringRequest = (requestId: string, role: 'teacher' | 'admin', teacherId?: string): TutoringRequest => {
    const request = getOrCreateTutoringRequest(requestId);
    
    if (role === 'teacher') {
        request.teacherApproved = true;
        if (teacherId) {
            request.teacherId = teacherId;
            const teacher = teachersData.find(t => t.id === teacherId);
            if (teacher) {
                request.teacherName = teacher.name;
            }
        }
        // Once student requested and teacher approved, tutoring is confirmed by both
        request.status = 'confirmed';
        request.adminApproved = true;
    } else if (role === 'admin') {
        request.adminApproved = true;
        request.status = 'confirmed';
    }
    
    eventEmitter.emit('tutoring-update', request);
    return request;
};
export const dbUpdateTutoringRequestStatus = (requestId: string, status: 'pending' | 'confirmed' | 'completed', teacherId?: string): TutoringRequest => {
    const request = getOrCreateTutoringRequest(requestId);
    request.status = status;
    if (teacherId) {
        request.teacherId = teacherId;
        const teacher = teachersData.find(t => t.id === teacherId);
        if (teacher) {
            request.teacherName = teacher.name;
        }
    }
    if (status === 'confirmed') {
        request.teacherApproved = true;
        request.adminApproved = true;
    }
    eventEmitter.emit('tutoring-update', request);
    return request;
};
export const dbRequestTutoringModification = (
    requestId: string, 
    proposedDate: string, 
    proposedTime: string, 
    proposedDetails: string, 
    requesterRole: 'student' | 'teacher'
): TutoringRequest => {
    const request = getOrCreateTutoringRequest(requestId);
    request.proposedDate = proposedDate;
    request.proposedTime = proposedTime;
    request.proposedDetails = proposedDetails;
    request.modificationRequestedBy = requesterRole;
    request.modificationStatus = 'pending';

    // When modified, return to pending status until verified by teacher and admin
    request.status = 'pending';
    request.teacherApproved = false;
    request.adminApproved = false;
    request.whatsappSent = false;

    eventEmitter.emit('tutoring-update', request);
    return request;
};
export const dbRespondToTutoringModification = (
    requestId: string, 
    action: 'accept' | 'reject',
    responderRole?: 'teacher' | 'admin'
): TutoringRequest => {
    const request = getOrCreateTutoringRequest(requestId);
    
    if (action === 'accept') {
        if (request.proposedDate) request.date = request.proposedDate;
        if (request.proposedTime) request.time = request.proposedTime;
        if (request.proposedDetails) request.details = request.proposedDetails;
        request.modificationStatus = 'accepted';

        request.teacherApproved = true;
        request.adminApproved = true;
        request.status = 'confirmed';
    } else {
        request.modificationStatus = 'rejected';
    }
    
    // Clear proposed values after resolution
    request.proposedDate = undefined;
    request.proposedTime = undefined;
    request.proposedDetails = undefined;
    request.modificationRequestedBy = undefined;
    
    eventEmitter.emit('tutoring-update', request);
    return request;
};
export const dbUpdateTutoringDetails = (
    requestId: string,
    updates: Partial<Pick<TutoringRequest, 'meetingLink' | 'isVoiceCall' | 'sessionSummary' | 'date' | 'time' | 'teacherId'>>,
    byRole?: 'student' | 'teacher' | 'admin'
): TutoringRequest => {
    const request = getOrCreateTutoringRequest(requestId);
    
    if (updates.meetingLink !== undefined) request.meetingLink = updates.meetingLink;
    if (updates.isVoiceCall !== undefined) request.isVoiceCall = updates.isVoiceCall;
    if (updates.sessionSummary !== undefined) request.sessionSummary = updates.sessionSummary;
    if (updates.date !== undefined) request.date = updates.date;
    if (updates.time !== undefined) request.time = updates.time;
    if (updates.teacherId !== undefined) {
        request.teacherId = updates.teacherId;
        const teacher = teachersData.find(t => t.id === updates.teacherId);
        if (teacher) {
            request.teacherName = teacher.name;
        } else if (updates.teacherId === 'first_available') {
            request.teacherName = undefined;
        }
    }

    if (byRole === 'student' || (updates.date || updates.time)) {
        request.status = 'pending';
        request.teacherApproved = false;
        request.adminApproved = false;
        request.whatsappSent = false;
    }
    
    eventEmitter.emit('tutoring-update', request);
    return request;
};
export const dbUpdateTutoringWhatsappSent = (requestId: string): TutoringRequest => {
    const request = getOrCreateTutoringRequest(requestId);
    request.whatsappSent = true;
    eventEmitter.emit('tutoring-update', request);
    return request;
};
export const dbRateTutoringRequest = (requestId: string, rating: number, feedback: string): TutoringRequest => {
    const request = getOrCreateTutoringRequest(requestId);
    request.rating = rating;
    request.feedback = feedback;
    eventEmitter.emit('tutoring-update', request);
    return request;
};
export const dbDeleteTutoringRequest = (requestId: string): void => {
    const deletedRequest = tutoringRequestsData.find(r => r.id === requestId);
    if (deletedRequest && deletedRequest.status !== 'completed') {
        const student = usersData.find(u => u.id === deletedRequest.studentId);
        if (student) {
            student.creditsBalance = (student.creditsBalance || 0) + 1;
            
            const newTx = {
                id: `tx_ref_${Date.now()}`,
                studentId: deletedRequest.studentId,
                amount: 1,
                type: 'earn' as const,
                description: `Reembolso por cancelación de Tutoría de ${deletedRequest.subject} ↩️`,
                timestamp: new Date().toISOString()
            };
            infinityTransactionsData.push(newTx);
            syncAddInfinityTransactionToFirestore(newTx).catch(console.error);
            syncUserToFirestore(student, 'student').catch(console.error);

            eventEmitter.emit('user-update', student);
        }
    }
    markItemAsDeleted(requestId, 'tutoring');
};

// --- AGENDA, QUIZZES, ANSWERS ---

export const dbFetchAgendaEvents = (studentId: string): ExamEvent[] => agendaData.filter(e => e.studentId === studentId && !deletedAgendaIds.has(e.id));
export const dbAddAgendaEvent = (eventData: Omit<ExamEvent, 'id'>): ExamEvent => {
    const newEvent: ExamEvent = { ...eventData, id: `exam${Date.now()}` };
    agendaData.push(newEvent);
    syncAddAgendaEventToFirestore(newEvent);
    return newEvent;
};
export const dbUpdateAgendaEvent = (eventId: string, eventData: Omit<ExamEvent, 'id' | 'studentId'>): ExamEvent => {
    const eventIndex = agendaData.findIndex(e => e.id === eventId);
    if (eventIndex === -1) throw new Error('Event not found');
    agendaData[eventIndex] = { ...agendaData[eventIndex], ...eventData };
    syncUpdateAgendaEventToFirestore(eventId, agendaData[eventIndex]);
    return agendaData[eventIndex];
};
export const dbDeleteAgendaEvent = (eventId: string): void => {
    markItemAsDeleted(eventId, 'agenda');
    syncDeleteAgendaEventFromFirestore(eventId);
};

export const dbFetchQuizByVideoId = (videoId: string): Quiz | null => quizzesData.find(q => q.videoId === videoId) || null;
export const dbSaveQuiz = (quizData: NewQuizData): Quiz => {
    const existingIndex = quizzesData.findIndex(q => q.videoId === quizData.videoId);
    const newQuiz: Quiz = {
        id: existingIndex > -1 ? quizzesData[existingIndex].id : `quiz_${Date.now()}`,
        videoId: quizData.videoId,
        questions: quizData.questions.map((q, i) => ({ ...q, id: `q_${Date.now()}_${i}` }))
    };
    if (existingIndex > -1) {
        quizzesData[existingIndex] = newQuiz;
    } else {
        quizzesData.push(newQuiz);
    }
    return newQuiz;
};

export const dbFetchStudentAnswers = (studentId: string): StudentAnswer[] => studentAnswersData.filter(sa => sa.studentId === studentId);
export const dbFetchAllStudentAnswers = (): StudentAnswer[] => studentAnswersData;
export const dbSubmitStudentAnswer = (answerData: Omit<StudentAnswer, 'timestamp'>): StudentAnswer => {
    const newAnswer: StudentAnswer = { ...answerData, timestamp: new Date().toISOString() };
    studentAnswersData.push(newAnswer);
    syncSubmitStudentAnswerToFirestore(newAnswer);
    return newAnswer;
};

// --- CHAT ---

const purgeOldMessages = () => {
    const threshold = 48 * 60 * 60 * 1000; // 48 hours
    const now = Date.now();
    const filterFn = (m: { timestamp?: string }) => {
        if (!m.timestamp) return true;
        const t = new Date(m.timestamp).getTime();
        return isNaN(t) || (now - t < threshold);
    };

    if (directMessagesData) {
        for (let i = directMessagesData.length - 1; i >= 0; i--) {
            if (!filterFn(directMessagesData[i])) directMessagesData.splice(i, 1);
        }
    }
    if (studentPeerMessagesData) {
        for (let i = studentPeerMessagesData.length - 1; i >= 0; i--) {
            if (!filterFn(studentPeerMessagesData[i])) studentPeerMessagesData.splice(i, 1);
        }
    }
    if (courseGroupMessagesData) {
        for (let i = courseGroupMessagesData.length - 1; i >= 0; i--) {
            if (!filterFn(courseGroupMessagesData[i])) courseGroupMessagesData.splice(i, 1);
        }
    }
    if (teacherMessagesData) {
        for (let i = teacherMessagesData.length - 1; i >= 0; i--) {
            if (!filterFn(teacherMessagesData[i])) teacherMessagesData.splice(i, 1);
        }
    }
};

export const dbFetchConversations = (): Conversation[] => {
    purgeOldMessages();

    // Collect set of student IDs that have direct tutoring conversations (studentId_teacherId)
    const studentsWithDirectTutoring = new Set<string>();
    (directMessagesData || []).forEach(m => {
        if (m.conversationId && m.conversationId.includes('_')) {
            const parts = m.conversationId.replace(/^direct_/, '').split('_');
            if (parts[0]) studentsWithDirectTutoring.add(parts[0]);
        }
    });
    (conversationsData || []).forEach(c => {
        const cleanId = c.id.replace(/^direct_/, '');
        if (cleanId.includes('_')) {
            const parts = cleanId.split('_');
            if (parts[0]) studentsWithDirectTutoring.add(parts[0]);
            if (c.studentId) studentsWithDirectTutoring.add(c.studentId);
        }
    });

    // 0. Purge any conversation that is closed or belongs to a non-existent student or has bogus 'direct' studentId
    for (let i = conversationsData.length - 1; i >= 0; i--) {
        const c = conversationsData[i];
        const cleanId = (c.id || '').replace(/^direct_/, '');
        const studentId = c.studentId || cleanId.split('_')[0];
        
        if (studentId === 'direct' || isConversationClosed(c.id, studentId) || isConversationClosed(cleanId, studentId)) {
            conversationsData.splice(i, 1);
            continue;
        }
        const studentExists = (usersData || []).some(u => u.id === studentId || u.id === c.id || u.id === cleanId || (u as any).uid === studentId || u.email === studentId);
        if (!studentExists) {
            conversationsData.splice(i, 1);
            continue;
        }
    }

    // 1. Ensure all students have a general Support/Admin conversation entry (id: support_<studentId>) if not closed
    (usersData || []).forEach(u => {
        const isStudentRole = u.role === 'student' || !(u as any).role;
        if (isStudentRole && u.id && u.id !== 'direct') {
            const supportId = `support_${u.id}`;
            const isClosed = isConversationClosed(supportId) || isConversationClosed(u.id);
            const exists = conversationsData.some(c => c.id === supportId || c.id === u.id || c.id.replace(/^direct_/, '') === u.id);
            if (!exists && !isClosed) {
                const newConvo: Conversation = {
                    id: supportId,
                    studentId: u.id,
                    studentName: u.name,
                    lastMessageText: 'Canal de dudas y asistencia del estudiante',
                    lastMessageTimestamp: u.registrationDate || new Date().toISOString(),
                    unreadByAdmin: false,
                    unreadByTeacher: false,
                    unreadByStudent: false
                };
                conversationsData.push(newConvo);
            }
        }
    });

    // 2. Scan directMessagesData to find any other conversationIds that are studentId_teacherId
    // and ensure they exist in conversationsData as separate Teacher direct chats
    const rawConvoIds = Array.from(new Set((directMessagesData || []).map(m => m.conversationId).filter(Boolean)));
    rawConvoIds.forEach(rawId => {
        const cleanId = rawId.replace(/^direct_/, '');
        if (cleanId.includes('_')) {
            const { studentId, teacherId } = parseConversationParticipants(cleanId);

            if (studentId && studentId !== 'direct') {
                const student = (usersData || []).find(u => u.id === studentId || u.id.replace(/^direct_/, '') === studentId);
                const teacher = teacherId ? ((teachersData || []).find(t => t.id === teacherId) || (usersData || []).find(u => u.id === teacherId)) : undefined;
                const isClosed = isConversationClosed(cleanId, studentId) || isConversationClosed(rawId, studentId);
                const exists = conversationsData.some(c => c.id.replace(/^direct_/, '') === cleanId);

                if (student && !isClosed && !exists) {
                    conversationsData.push({
                        id: cleanId,
                        studentId: studentId!,
                        studentName: student.name,
                        teacherId: teacherId || undefined,
                        teacherName: teacher ? teacher.name : undefined,
                        lastMessageText: 'Conversación directa de tutoría',
                        lastMessageTimestamp: new Date().toISOString(),
                        unreadByAdmin: false,
                        unreadByTeacher: false,
                        unreadByStudent: false
                    });
                }
            }
        }
    });

    // 3. Keep names and assigned teacher updated from user/student profiles
    conversationsData.forEach(c => {
        const cleanId = c.id.replace(/^direct_/, '');
        const parts = cleanId.split('_');
        const studentId = c.studentId && c.studentId !== 'direct' ? c.studentId : parts[0];
        const student = (usersData || []).find(u => u.id === studentId || u.id.replace(/^direct_/, '') === studentId);
        if (student) {
            if (student.name) {
                c.studentName = student.name;
            }
            if (!cleanId.includes('_')) {
                // Support convo: track assigned teacher for metadata display
                if (student.assignedTeacherId) {
                    c.teacherId = student.assignedTeacherId;
                    const teacher = (teachersData || []).find(t => t.id === student.assignedTeacherId) || (usersData || []).find(u => u.id === student.assignedTeacherId);
                    c.teacherName = student.assignedTeacherName || (teacher ? teacher.name : undefined) || student.assignedTeacherId;
                } else {
                    c.teacherId = undefined;
                    c.teacherName = undefined;
                }
            } else {
                // Teacher direct convo: track specific teacher name
                const teacherId = parts[1];
                const teacher = (teachersData || []).find(t => t.id === teacherId) || (usersData || []).find(u => u.id === teacherId);
                if (teacher) {
                    c.teacherName = teacher.name;
                }
            }
        }
    });

    // 4. Ensure lastMessageText and lastMessageTimestamp reflect actual messages in directMessagesData
    conversationsData.forEach(c => {
        const cleanId = c.id.replace(/^direct_/, '');
        const msgs = (directMessagesData || []).filter(m => {
            if (!m.conversationId) return false;
            const mCleanId = m.conversationId.replace(/^direct_/, '');
            return m.conversationId === c.id || mCleanId === cleanId;
        });
        if (msgs.length > 0) {
            const newest = msgs.reduce((latest, current) => {
                return new Date(current.timestamp).getTime() > new Date(latest.timestamp).getTime() ? current : latest;
            }, msgs[0]);
            if (newest) {
                c.lastMessageText = newest.text;
                c.lastMessageTimestamp = newest.timestamp;
            }
        }
    });

    // 5. Deduplicate conversations so each student/teacher chat is unique
    const uniqueConvoMap = new Map<string, Conversation>();
    conversationsData.forEach(c => {
        const canonicalKey = c.id.replace(/^direct_/, '');
        c.id = canonicalKey; // enforce clean canonical ID
        if (!uniqueConvoMap.has(canonicalKey)) {
            uniqueConvoMap.set(canonicalKey, c);
        } else {
            const existing = uniqueConvoMap.get(canonicalKey)!;
            if (new Date(c.lastMessageTimestamp || 0).getTime() > new Date(existing.lastMessageTimestamp || 0).getTime()) {
                uniqueConvoMap.set(canonicalKey, c);
            }
        }
    });
    const deduplicatedConversations = Array.from(uniqueConvoMap.values());
    conversationsData.length = 0;
    conversationsData.push(...deduplicatedConversations);

    return JSON.parse(JSON.stringify(conversationsData));
};

export const dbFetchMessages = (conversationId: string): DirectMessage[] => {
    const cleanId = (conversationId || '').replace(/^direct_/, '').replace(/^peer_/, '');
    const isTeacherChat = cleanId.includes('_');

    const filtered = (directMessagesData || []).filter(m => {
        if (!m.conversationId) return false;
        const mCleanId = m.conversationId.replace(/^direct_/, '').replace(/^peer_/, '');
        const mIsTeacherChat = mCleanId.includes('_');

        if (isTeacherChat) {
            return m.conversationId === conversationId || mCleanId === cleanId || m.conversationId === `direct_${cleanId}` || m.conversationId === `peer_${cleanId}`;
        } else {
            if (mIsTeacherChat) return false;
            return m.conversationId === conversationId || mCleanId === cleanId || m.conversationId === `direct_${cleanId}`;
        }
    });
    filtered.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    return JSON.parse(JSON.stringify(filtered));
};

export const dbSendMessage = (messageData: Omit<DirectMessage, 'id' | 'timestamp'>): DirectMessage => {
    const cleanId = (messageData.conversationId || '').replace(/^direct_/, '').replace(/^peer_/, '');
    closedSupportConversationIds.delete(messageData.conversationId);
    closedSupportConversationIds.delete(cleanId);
    closedSupportConversationIds.delete(`direct_${cleanId}`);

    const newMessage: DirectMessage = { ...messageData, id: `msg${Date.now()}`, timestamp: new Date().toISOString() };
    directMessagesData.push(newMessage);
    eventEmitter.emit('message-update', newMessage);
    return JSON.parse(JSON.stringify(newMessage));
};

export const dbEditMessage = (messageId: string, text: string): DirectMessage => {
    const msg = directMessagesData.find(m => m.id === messageId);
    if (!msg) {
        throw new Error('Mensaje no encontrado');
    }
    msg.text = text;
    
    // Update lastMessage on the strict conversation if applicable
    const convo = conversationsData.find(c => c.id === msg.conversationId);
    if (convo) {
        const convoMsgs = directMessagesData.filter(m => m.conversationId === msg.conversationId);
        if (convoMsgs.length > 0) {
            const newest = convoMsgs.reduce((latest, current) => {
                return new Date(current.timestamp).getTime() > new Date(latest.timestamp).getTime() ? current : latest;
            }, convoMsgs[0]);
            if (newest && newest.id === msg.id) {
                convo.lastMessageText = text;
            }
        }
    }
    eventEmitter.emit('message-update', msg);
    return JSON.parse(JSON.stringify(msg));
};

export const dbDeleteMessage = (messageId: string): { success: boolean; conversationId: string } => {
    const index = directMessagesData.findIndex(m => m.id === messageId);
    if (index === -1) {
        throw new Error('Mensaje no encontrado');
    }
    const msg = directMessagesData[index];
    const conversationId = msg.conversationId;
    directMessagesData.splice(index, 1);
    
    const convo = conversationsData.find(c => c.id === conversationId);
    if (convo) {
        const convoMsgs = directMessagesData.filter(m => m.conversationId === conversationId);
        if (convoMsgs.length > 0) {
            const newest = convoMsgs.reduce((latest, current) => {
                return new Date(current.timestamp).getTime() > new Date(latest.timestamp).getTime() ? current : latest;
            }, convoMsgs[0]);
            convo.lastMessageText = newest.text;
            convo.lastMessageTimestamp = newest.timestamp;
        } else {
            convo.lastMessageText = 'Sin mensajes';
        }
    }
    eventEmitter.emit('message-update', { id: messageId, deleted: true, conversationId } as any);
    return { success: true, conversationId };
};

export const dbClearChatMessages = (conversationId: string): { success: boolean; clearedCount: number } => {
    if (!conversationId) return { success: false, clearedCount: 0 };
    const cleanId = conversationId.replace(/^direct_/, '').replace(/^peer_/, '');
    let clearedCount = 0;
    for (let i = directMessagesData.length - 1; i >= 0; i--) {
        const m = directMessagesData[i];
        const mConvoId = (m.conversationId || '').replace(/^direct_/, '').replace(/^peer_/, '');
        if (m.conversationId === conversationId || mConvoId === cleanId || mConvoId.includes(cleanId)) {
            directMessagesData.splice(i, 1);
            clearedCount++;
        }
    }
    const convo = conversationsData.find(c => c.id === conversationId || c.id.replace(/^direct_/, '') === cleanId);
    if (convo) {
        convo.lastMessageText = 'Chat limpiado';
        convo.lastMessageTimestamp = new Date().toISOString();
    }
    eventEmitter.emit('messages-cleared', { conversationId });
    return { success: true, clearedCount };
};

export const dbMarkConversationAsRead = (conversationId: string, role?: string): void => {
    const convo = conversationsData.find(c => c.id === conversationId);
    if (convo) {
        if (role === 'teacher') {
            convo.unreadByTeacher = false;
        } else if (role === 'student') {
            convo.unreadByStudent = false;
        } else {
            convo.unreadByAdmin = false;
        }
    }
    eventEmitter.emit('message-update', { conversationId, read: true });
};

export const dbCloseSupportConversation = (conversationId: string, studentId: string, closedBy: string = 'teacher'): void => {
    const cleanConvoId = (conversationId || '').replace(/^direct_/, '');
    const cleanStudentId = (studentId || '').replace(/^direct_/, '') || cleanConvoId.split('_')[0];

    const allStudentConvoIds = new Set<string>([
        conversationId,
        studentId,
        cleanConvoId,
        cleanStudentId,
        `direct_${cleanConvoId}`,
        `direct_${cleanStudentId}`
    ].filter(Boolean));

    // 1. Delete matching chat messages from directMessagesData
    for (let i = directMessagesData.length - 1; i >= 0; i--) {
        const mConvoId = (directMessagesData[i].conversationId || '').replace(/^direct_/, '');
        const mSenderId = directMessagesData[i].senderId;

        let shouldDelete = false;
        if (
            allStudentConvoIds.has(directMessagesData[i].conversationId) ||
            mConvoId === cleanConvoId ||
            mConvoId === cleanStudentId ||
            mConvoId.startsWith(`${cleanStudentId}_`) ||
            mSenderId === cleanStudentId
        ) {
            shouldDelete = true;
        }

        if (shouldDelete) {
            directMessagesData.splice(i, 1);
        }
    }

    // 2. Delete all conversation entries for this student/convo so they do not reappear
    for (let i = conversationsData.length - 1; i >= 0; i--) {
        const cCleanId = conversationsData[i].id.replace(/^direct_/, '');
        const cStudentId = conversationsData[i].studentId;
        if (
            allStudentConvoIds.has(conversationsData[i].id) ||
            cCleanId === cleanConvoId ||
            cCleanId === cleanStudentId ||
            cCleanId.startsWith(`${cleanStudentId}_`) ||
            cStudentId === cleanStudentId
        ) {
            conversationsData.splice(i, 1);
        }
    }

    // 3. Delete matching tutoring requests for this student or conversation
    for (let i = tutoringRequestsData.length - 1; i >= 0; i--) {
        const req = tutoringRequestsData[i];
        if (
            allStudentConvoIds.has(req.id) ||
            req.studentId === cleanStudentId ||
            req.studentId === studentId
        ) {
            tutoringRequestsData.splice(i, 1);
        }
    }

    if (conversationId) closedSupportConversationIds.add(conversationId);
    if (studentId) closedSupportConversationIds.add(studentId);
    if (cleanConvoId) closedSupportConversationIds.add(cleanConvoId);
    if (cleanStudentId) closedSupportConversationIds.add(cleanStudentId);

    eventEmitter.emit('message-update', { conversationId, closed: true });
    eventEmitter.emit('direct-message-update', { conversationId, closed: true });
    eventEmitter.emit('tutoring-request-update', { conversationId, closed: true });
};

export const dbAssignConversation = (conversationId: string, teacherId: string | null): Conversation => {
    const studentId = conversationId.replace('direct_', '');
    const teacher = teacherId ? (teachersData.find(t => t.id === teacherId) || usersData.find(u => u.id === teacherId)) : null;

    const targetConvos = conversationsData.filter(c => 
        c.id === conversationId || 
        c.id === studentId || 
        c.id === `direct_${studentId}` || 
        c.studentId === studentId
    );

    if (targetConvos.length > 0) {
        targetConvos.forEach(c => {
            c.teacherId = teacher ? teacher.id : (null as any);
            c.teacherName = teacher ? teacher.name : (null as any);
        });
    }

    const student = usersData.find(u => u.id === studentId || u.id === conversationId || targetConvos.some(tc => tc.studentId === u.id));
    if (student) {
        if (teacher) {
            student.assignedTeacherId = teacher.id;
            student.assignedTeacherName = teacher.name;
        } else {
            student.assignedTeacherId = null as any;
            student.assignedTeacherName = null as any;
        }
        eventEmitter.emit('user-update', student);
    }
    eventEmitter.emit('message-update', {} as any);
    return targetConvos[0] || conversationsData.find(c => c.id === conversationId)!;
};

export const dbAssignStudentTeacher = (studentId: string, teacherId: string | null): StudentUser => {
    const student = usersData.find(u => u.id === studentId || u.email === studentId || (u as any).uid === studentId);
    if (!student) {
        throw new Error('Estudiante no encontrado');
    }
    const matchingStudents = usersData.filter(u => 
        u.id === student.id || 
        (u as any).uid === (student as any).uid || 
        (u.email && student.email && u.email.toLowerCase() === student.email.toLowerCase())
    );

    const teacher = teacherId ? (teachersData.find(t => t.id === teacherId) || usersData.find(u => u.id === teacherId)) : null;

    matchingStudents.forEach(s => {
        s.assignedTeacherId = teacher ? teacher.id : (null as any);
        s.assignedTeacherName = teacher ? teacher.name : (null as any);
    });

    const matchingConvos = conversationsData.filter(c => 
        c.id === studentId || 
        c.id === `direct_${studentId}` || 
        c.studentId === student.id || 
        (student.email && c.id?.includes(student.email))
    );

    matchingConvos.forEach(convo => {
        convo.teacherId = teacher ? teacher.id : (null as any);
        convo.teacherName = teacher ? teacher.name : (null as any);
    });

    eventEmitter.emit('user-update', student);
    eventEmitter.emit('message-update', {} as any);
    return student;
};

// --- AI INTEGRATIONS (simulated via geminiService) ---

export const summarizeTopicWithAI = async (videoTitle: string, videoDescription: string): Promise<string> => {
    const prompt = `Resume en puntos clave el siguiente tema de un vídeo educativo titulado "${videoTitle}". Descripción: "${videoDescription}". El resumen debe ser claro, conciso y fácil de entender para un estudiante.`;
    return geminiService.getSimpleResponse(prompt);
};

export const generatePracticeQuestionWithAI = async (topic: string, difficulty: 'fácil' | 'medio' | 'difícil', levelId: string, subjectId: string): Promise<{ question: string }> => {
    const prompt = `Genera una pregunta de práctica de dificultad ${difficulty} sobre el tema "${topic}" para un estudiante de nivel académico "${levelId}" en la asignatura "${subjectId}". La pregunta debe ser clara y relevante. No incluyas la respuesta.`;
    const question = await geminiService.getSimpleResponse(prompt);
    return { question };
};

export const generatePracticeAnswerWithAI = async (question: string, topic: string, levelId: string, subjectId: string): Promise<{ answer: string }> => {
    const prompt = `Proporciona una respuesta detallada y una explicación para la siguiente pregunta: "${question}". El tema es "${topic}" para un estudiante de nivel académico "${levelId}" en la asignatura "${subjectId}".`;
    const answer = await geminiService.getSimpleResponse(prompt);
    return { answer };
};

export const searchYouTubeVideosWithAI = async (query: string): Promise<{ title: string, videoId: string }[]> => {
    return geminiService.searchYouTubeVideosFromAI(query);
};

export const searchVideosWithAI = async (query: string, allVideos: any[]): Promise<{ relevantVideoIds: string[] }> => {
    const videoCatalog = allVideos.map(v => ({ id: v.id, title: v.title, description: v.description, topic: v.topic })).slice(0, 100); // Limit context size
    const prompt = `Dado el siguiente catálogo de vídeos en formato JSON: ${JSON.stringify(videoCatalog)}\n\n¿Qué vídeos son más relevantes para la siguiente consulta de búsqueda del usuario?: "${query}"\n\nDevuelve solo una lista de los IDs de los vídeos más relevantes en formato JSON, como {"relevantVideoIds": ["id1", "id2"]}. No incluyas nada más en tu respuesta.`;
    const response = await geminiService.getSimpleResponse(prompt);
    try {
        const jsonString = response.replace(/```json|```/g, '').trim();
        return JSON.parse(jsonString);
    } catch (e) {
        console.error("Failed to parse video search results:", e);
        return { relevantVideoIds: [] };
    }
};

export async function* generateStudyPlanWithAIStream(event: ExamEvent, videos: Video[]): AsyncGenerator<string> {
    const videoTopics = videos.map(v => v.topic).join(', ');
    const prompt = `Crea un plan de estudio detallado para un examen de "${event.title}" que es el ${event.date}. El estudiante necesita estudiar los siguientes temas: ${videoTopics}. El plan debe ser realista, dividido por días, y proporcionar consejos de estudio. Formatea la respuesta en Markdown, con un encabezado claro para cada día como "Día 1 (YYYY-MM-DD): Título del día".`;
    // Simulate streaming for mock environment
    try {
        const response = await geminiService.getSimpleResponse(prompt);
        const chunks = response.match(/.{1,20}/g) || [];
        for (const chunk of chunks) {
            await new Promise(res => setTimeout(res, 50));
            yield chunk;
        }
    } catch (error) {
        yield 'Error al generar el plan de estudio.';
    }
}

export const generateQuizWithAI = async (topic: string): Promise<{ questions: NewQuestionData[] }> => {
    return geminiService.generateQuizFromAI(topic);
};

export const generateReinforcementPlanWithAI = async (videoId: string, quizId: string, answer: StudentAnswer): Promise<string> => {
    const quiz = quizzesData.find(q => q.id === quizId);
    if (!quiz) return "No se encontró el quiz para generar el plan.";
    
    const incorrectQuestions = quiz.questions.filter((q, index) => {
        const questionId = q.id;
        const studentAnswerIndex = answer.answers[questionId];
        const correctAnswerIndex = q.correctAnswerIndex - 1;
        return studentAnswerIndex !== correctAnswerIndex;
    });

    if (incorrectQuestions.length === 0) return "¡Felicidades! Has respondido todo correctamente. No necesitas un plan de refuerzo para este tema.";

    const topicsToReinforce = incorrectQuestions.map(q => `Pregunta: "${q.text}", Explicación: "${q.explanation}"`).join('\n');
    const prompt = `Un estudiante ha fallado las siguientes preguntas en un quiz sobre el vídeo con ID "${videoId}":\n${topicsToReinforce}\n\nGenera un plan de refuerzo conciso y práctico en Markdown. Sugiere qué conceptos clave repasar y proporciona un pequeño ejercicio práctico para afianzar el conocimiento.`;
    return geminiService.getSimpleResponse(prompt);
};

// --- STUDENT PEER CHAT (WHATSAPP-STYLE) ---

// Friendship table: who is friends with whom (bidirectional)
export let studentFriendsData: { studentId: string; friendId: string }[] = [
    // Pre-populate some connections
    { studentId: 'student1', friendId: 'student2' },
    { studentId: 'student2', friendId: 'student1' },
    { studentId: 'student1', friendId: 'student3' },
    { studentId: 'student3', friendId: 'student1' },
];

export let studentPeerConversationsData: StudentPeerConversation[] = [
    {
        id: 'peer_student1_student2',
        participantIds: ['student1', 'student2'],
        lastMessageText: '¡Hola Carlos! ¿Pudiste resolver el ejercicio de hoy?',
        lastMessageTimestamp: new Date(Date.now() - 3600000).toISOString(),
        unreadByStudentId: { student2: true, student1: false }
    }
];

export let studentPeerMessagesData: StudentPeerMessage[] = [
    {
        id: 'pmsg_1',
        conversationId: 'peer_student1_student2',
        senderId: 'student1',
        senderName: 'Lucía G.',
        text: '¡Hola Carlos! ¿Pudiste resolver el ejercicio de hoy?',
        timestamp: new Date(Date.now() - 3600000).toISOString()
    }
];

export const dbFetchStudentFriends = (studentId: string): StudentFriend[] => {
    const friendsList: StudentFriend[] = [];
    const student = usersData.find(u => u.id === studentId);
    if (student && student.assignedTeacherId) {
        const teacher = (teachersData || []).find(t => t.id === student.assignedTeacherId) || (usersData || []).find(u => u.id === student.assignedTeacherId);
        if (teacher) {
            friendsList.push({
                id: `${studentId}_${teacher.id}`,
                name: `Tutor: ${teacher.name}`,
                email: teacher.email,
                phone: teacher.phone || '',
                avatar: `https://api.dicebear.com/8.x/initials/svg?seed=${teacher.name}`
            });
        }
    }

    // Get all friendIds for studentId
    const friendRelations = studentFriendsData.filter(f => f.studentId === studentId);
    friendRelations.forEach(rel => {
        const friend = usersData.find(u => u.id === rel.friendId);
        if (friend) {
            friendsList.push({
                id: friend.id,
                name: friend.name,
                email: friend.email,
                phone: friend.phone,
                avatar: `https://api.dicebear.com/8.x/initials/svg?seed=${friend.name}`
            });
        }
    });
    return friendsList;
};

export const dbAddFriendByContact = (studentId: string, emailOrPhone: string): StudentFriend => {
    const cleanContact = emailOrPhone.trim().toLowerCase();
    
    // Find matching student
    const friend = usersData.find(u => {
        if (u.role !== 'student') return false;
        const uEmail = (u.email || '').trim().toLowerCase();
        const uPhone = (u.phone || '').trim().replace(/\s+/g, '');
        const searchPhone = cleanContact.replace(/\s+/g, '');
        return uEmail === cleanContact || uPhone === searchPhone;
    });

    if (!friend) {
        throw new Error('No se encontró ningún alumno con ese correo electrónico o teléfono.');
    }

    if (friend.id === studentId) {
        throw new Error('No puedes añadirte a ti mismo como amigo.');
    }

    // Check if relation already exists
    const alreadyConnected = studentFriendsData.some(f => f.studentId === studentId && f.friendId === friend.id);
    if (!alreadyConnected) {
        // Add mutual friendship
        studentFriendsData.push({ studentId, friendId: friend.id });
        studentFriendsData.push({ studentId: friend.id, friendId: studentId });
    }

    // Always ensure a conversation exists between them
    const convoId = `peer_${[studentId, friend.id].sort().join('_')}`;
    const hasConvo = studentPeerConversationsData.some(c => c.id === convoId);
    if (!hasConvo) {
        studentPeerConversationsData.push({
            id: convoId,
            participantIds: [studentId, friend.id],
            lastMessageText: '¡Habéis conectado! Saluda a tu amigo.',
            lastMessageTimestamp: new Date().toISOString(),
            unreadByStudentId: { [studentId]: false, [friend.id]: false }
        });
    }

    return {
        id: friend.id,
        name: friend.name,
        email: friend.email,
        phone: friend.phone,
        avatar: `https://api.dicebear.com/8.x/initials/svg?seed=${friend.name}`
    };
};

export const dbFetchPeerConversations = (studentId: string): StudentPeerConversation[] => {
    const student = usersData.find(u => u.id === studentId);
    if (student && student.assignedTeacherId) {
        const teacher = (teachersData || []).find(t => t.id === student.assignedTeacherId) || (usersData || []).find(u => u.id === student.assignedTeacherId);
        if (teacher) {
            const teacherConvoId = `${studentId}_${teacher.id}`;
            const exists = studentPeerConversationsData.some(c => c.id === teacherConvoId || c.id.includes(teacher.id));
            if (!exists) {
                studentPeerConversationsData.push({
                    id: teacherConvoId,
                    participantIds: [studentId, teacher.id],
                    lastMessageText: 'Chat 1 a 1 con tu profesor tutor asignado',
                    lastMessageTimestamp: new Date().toISOString(),
                    unreadByStudentId: { [studentId]: false }
                });
            }
        }
    }

    // Ensure all connected friends have a conversation entry in studentPeerConversationsData
    studentFriendsData.forEach(f => {
        if (f.studentId === studentId || f.friendId === studentId) {
            const otherId = f.studentId === studentId ? f.friendId : f.studentId;
            const convoId = `peer_${[studentId, otherId].sort().join('_')}`;
            const exists = studentPeerConversationsData.some(c => c.id === convoId);
            if (!exists) {
                studentPeerConversationsData.push({
                    id: convoId,
                    participantIds: [studentId, otherId],
                    lastMessageText: '¡Habéis conectado! Saluda a tu amigo.',
                    lastMessageTimestamp: new Date().toISOString(),
                    unreadByStudentId: { [studentId]: false, [otherId]: false }
                });
            }
        }
    });

    // Purge peer conversations where any participant is no longer registered in usersData
    for (let i = studentPeerConversationsData.length - 1; i >= 0; i--) {
        const c = studentPeerConversationsData[i];
        const allParticipantsRegistered = c.participantIds.every(pId =>
            (usersData || []).some(u => u.id === pId || (u as any).uid === pId || u.email === pId)
        );
        if (!allParticipantsRegistered) {
            studentPeerConversationsData.splice(i, 1);
        }
    }
    // Deduplicate peer conversations so each pair/group has strictly 1 conversation
    const uniquePeerMap = new Map<string, StudentPeerConversation>();
    studentPeerConversationsData.forEach(c => {
        const key = [...c.participantIds].sort().join('_');
        if (!uniquePeerMap.has(key)) {
            uniquePeerMap.set(key, c);
        } else {
            const existing = uniquePeerMap.get(key)!;
            if (new Date(c.lastMessageTimestamp || 0).getTime() > new Date(existing.lastMessageTimestamp || 0).getTime()) {
                uniquePeerMap.set(key, c);
            }
        }
    });
    const deduplicatedPeer = Array.from(uniquePeerMap.values());
    studentPeerConversationsData.length = 0;
    studentPeerConversationsData.push(...deduplicatedPeer);

    return studentPeerConversationsData.filter(c => c.participantIds.includes(studentId));
};

export const dbFetchPeerMessages = (conversationId: string): StudentPeerMessage[] => {
    return studentPeerMessagesData.filter(m => m.conversationId === conversationId);
};

export const dbSendPeerMessage = (messageData: { conversationId: string; senderId: string; text: string; attachments?: Attachment[] }): StudentPeerMessage => {
    const sender = usersData.find(u => u.id === messageData.senderId);
    const senderName = sender ? sender.name : 'Usuario';
    
    const convoIndex = studentPeerConversationsData.findIndex(c => c.id === messageData.conversationId);
    const participants = convoIndex > -1 ? studentPeerConversationsData[convoIndex].participantIds : [];

    const newMessage: StudentPeerMessage = {
        id: `pmsg_${Date.now()}`,
        conversationId: messageData.conversationId,
        senderId: messageData.senderId,
        senderName,
        text: messageData.text,
        timestamp: new Date().toISOString(),
        isRead: false,
        attachments: messageData.attachments,
        participants
    };
    
    studentPeerMessagesData.push(newMessage);

    // Update conversation properties
    if (convoIndex > -1) {
        const convo = studentPeerConversationsData[convoIndex];
        convo.lastMessageText = messageData.text;
        convo.lastMessageTimestamp = newMessage.timestamp;
        
        // Mark as unread for other participant(s)
        convo.participantIds.forEach(pId => {
            if (pId !== messageData.senderId) {
                convo.unreadByStudentId[pId] = true;
            }
        });
    } else {
        // Fallback or dynamic creation if conversation was deleted
        const parts = messageData.conversationId.replace('peer_', '').split('_');
        const unreadBy: { [id: string]: boolean } = {};
        parts.forEach(p => {
            unreadBy[p] = p !== messageData.senderId;
        });
        studentPeerConversationsData.push({
            id: messageData.conversationId,
            participantIds: parts,
            lastMessageText: messageData.text,
            lastMessageTimestamp: newMessage.timestamp,
            unreadByStudentId: unreadBy
        });
    }

    eventEmitter.emit('peer-message-update', newMessage);
    return newMessage;
};

export const dbMarkPeerConversationAsRead = (conversationId: string, studentId: string): void => {
    const convo = studentPeerConversationsData.find(c => c.id === conversationId);
    if (convo) {
        if (!convo.unreadByStudentId) convo.unreadByStudentId = {};
        convo.unreadByStudentId[studentId] = false;
        syncMarkPeerConversationAsReadInFirestore(conversationId, studentId).catch(console.error);
    }
    // Mark peer messages not sent by standard studentId as read
    studentPeerMessagesData.forEach(m => {
        if (m.conversationId === conversationId && m.senderId !== studentId) {
            m.isRead = true;
        }
    });
    eventEmitter.emit('peer-message-update', { conversationId, studentId, read: true });
};

export const dbDeletePeerConversation = (conversationId: string): { success: boolean } => {
    const idx = studentPeerConversationsData.findIndex(c => c.id === conversationId);
    if (idx > -1) {
        studentPeerConversationsData.splice(idx, 1);
    }
    // Also remove associated messages
    for (let i = studentPeerMessagesData.length - 1; i >= 0; i--) {
        if (studentPeerMessagesData[i].conversationId === conversationId) {
            studentPeerMessagesData.splice(i, 1);
        }
    }
    // Also remove friendship if any
    const parts = conversationId.replace('peer_', '').split('_');
    if (parts.length === 2) {
        for (let i = studentFriendsData.length - 1; i >= 0; i--) {
            const f = studentFriendsData[i];
            if ((f.studentId === parts[0] && f.friendId === parts[1]) || (f.studentId === parts[1] && f.friendId === parts[0])) {
                studentFriendsData.splice(i, 1);
            }
        }
    }
    eventEmitter.emit('peer-message-update', { conversationId, deleted: true });
    return { success: true };
};

export const dbSearchStudents = (studentId: string, searchVal: string): (StudentFriend & { isConnected: boolean })[] => {
    const cleanSearchVal = searchVal.trim().toLowerCase();
    if (!cleanSearchVal) return [];

    return usersData
        .filter(u => {
            if (u.role !== 'student' || u.id === studentId) return false;
            const uName = (u.name || '').trim().toLowerCase();
            const uEmail = (u.email || '').trim().toLowerCase();
            const uPhone = (u.phone || '').trim().replace(/\s+/g, '');
            const searchPhone = cleanSearchVal.replace(/\s+/g, '');
            return uName.includes(cleanSearchVal) || uEmail.includes(cleanSearchVal) || uPhone.includes(searchPhone);
        })
        .map(u => {
            const isConnected = studentFriendsData.some(f => f.studentId === studentId && f.friendId === u.id);
            return {
                id: u.id,
                name: u.name,
                email: u.email,
                phone: u.phone,
                avatar: `https://api.dicebear.com/8.x/initials/svg?seed=${u.name}`,
                isConnected
            };
        });
};

// --- STUDENT COURSE GROUP CHATS ---

export let courseGroupMessagesData: CourseGroupMessage[] = [];

export const dbFetchCourseGroupConversations = (studentId: string): CourseGroupConversation[] => {
    const student = usersData.find(u => u.id === studentId);
    const teacher = teachersData.find(t => t.id === studentId);
    const admin = adminUserData.find(a => a.id === studentId);

    let enrolledCourseIds: string[] = [];
    if (student) {
        enrolledCourseIds = student.enrolledCourseIds || [];
    } else if (teacher) {
        enrolledCourseIds = coursesData.map(c => c.id);
    } else {
        enrolledCourseIds = coursesData.map(c => c.id);
    }
    
    return enrolledCourseIds.map(courseId => {
        // Find course name
        const course = coursesData.find(c => c.id === courseId);
        const courseName = course ? `Grupo ${course.name}` : `Grupo de Curso (${courseId})`;

        // Get count of students enrolled in this course
        const enrolledStudentsCount = usersData.filter(u => u.enrolledCourseIds?.includes(courseId)).length;

        // Get last message in this group
        const groupMessages = courseGroupMessagesData.filter(m => m.courseId === courseId);
        const lastMsg = groupMessages.length > 0 
            ? groupMessages[groupMessages.length - 1] 
            : null;

        return {
            id: courseId,
            name: courseName,
            lastMessageText: lastMsg ? `${lastMsg.senderName}: ${lastMsg.text}` : 'Aún no hay mensajes. ¡Escribe el primero!',
            lastMessageTimestamp: lastMsg ? lastMsg.timestamp : (student?.registrationDate || new Date().toISOString()),
            enrolledStudentsCount
        };
    }).sort((a, b) => new Date(b.lastMessageTimestamp).getTime() - new Date(a.lastMessageTimestamp).getTime());
};

export const dbFetchCourseGroupMessages = (courseId: string): CourseGroupMessage[] => {
    return courseGroupMessagesData.filter(m => m.courseId === courseId);
};

export const dbSendCourseGroupMessage = (messageData: { courseId: string; senderId: string; text: string; attachments?: Attachment[] }): CourseGroupMessage => {
    const sender = usersData.find(u => u.id === messageData.senderId) || teachersData.find(t => t.id === messageData.senderId) || adminUserData.find(a => a.id === messageData.senderId);
    const senderName = sender && sender.name ? sender.name : 'Usuario';
    const newMessage: CourseGroupMessage = {
        id: `gmsg_${Date.now()}`,
        courseId: messageData.courseId,
        senderId: messageData.senderId,
        senderName,
        text: messageData.text,
        timestamp: new Date().toISOString(),
        attachments: messageData.attachments
    };

    courseGroupMessagesData.push(newMessage);

    // Emit live group message event so real-time updates are pushed automatically
    eventEmitter.emit('group-message-update', newMessage);

    return newMessage;
};

export const dbFetchClassmatesOfSameLevel = (studentId: string): (StudentFriend & { isConnected: boolean; courseNames: string[] })[] => {
    const student = usersData.find(u => u.id === studentId);
    const enrolledCourseIds = student?.enrolledCourseIds || [];

    return usersData
        .filter(u => u.role === 'student' && u.id !== studentId)
        .map(u => {
            const isConnected = studentFriendsData.some(f => f.studentId === studentId && f.friendId === u.id);
            const sharedCourseIds = u.enrolledCourseIds?.filter(id => enrolledCourseIds.includes(id)) || [];
            const courseNames = u.enrolledCourseIds && u.enrolledCourseIds.length > 0 ? u.enrolledCourseIds.map(courseId => {
                const course = coursesData.find(c => c.id === courseId);
                return course ? course.name : courseId;
            }) : ['Comunidad General'];

            return {
                id: u.id,
                name: u.name,
                email: u.email,
                phone: u.phone || '',
                avatar: `https://api.dicebear.com/8.x/initials/svg?seed=${encodeURIComponent(u.name)}`,
                isConnected,
                courseNames,
                sharedCount: sharedCourseIds.length
            };
        })
        .sort((a, b) => b.sharedCount - a.sharedCount);
};

// --- STUDENT AI INQUIRIES LOGS (Estadísticas de dudas de la IA) ---
export let aiQueryLogsData: AIQueryLog[] = [
    {
        id: 'q1',
        studentId: 'student1',
        studentName: 'Mateo Fernández',
        queryText: '¿Cómo calculo el dominio de una función racional con raíz en el denominador?',
        responseText: 'Para calcular el dominio, primero debemos garantizar que el radicando sea estrictamente mayor que cero (ya que no se puede dividir entre cero ni calcular raíces cuadradas de números negativos).',
        category: 'Matemáticas',
        vibe: 'socratic',
        timestamp: '2026-06-25T10:15:00Z'
    },
    {
        id: 'q2',
        studentId: 'student2',
        studentName: 'Sofía Martínez',
        queryText: '¿Cuál es la diferencia entre un enlace iónico y un enlace covalente polar?',
        responseText: 'En el enlace iónico hay transferencia completa de electrones de un átomo a otro debido a una gran diferencia de electronegatividad, mientras que en el enlace covalente polar los electrones se comparten desigualmente.',
        category: 'Física y Química',
        vibe: 'explanatory',
        timestamp: '2026-06-26T14:30:00Z'
    },
    {
        id: 'q3',
        studentId: 'student3',
        studentName: 'Carlos Ruiz',
        queryText: '¿Cómo identificar el sujeto omitido o tácito en oraciones de selectividad?',
        responseText: 'Para identificar el sujeto omitido, fíjate en la desinencia verbal (persona y número) del verbo principal. Por ejemplo, en "Llegamos tarde", la primera persona del plural nos indica que el sujeto es "Nosotros".',
        category: 'Lengua y Literatura',
        vibe: 'ebau',
        timestamp: '2026-06-27T09:45:00Z'
    },
    {
        id: 'q4',
        studentId: 'student1',
        studentName: 'Mateo Fernández',
        queryText: '¿Me das un truco para aprender las reglas de derivación?',
        responseText: '¡Claro! El mejor truco es asociarlas con operaciones visuales. Por ejemplo, en la regla de la potencia, el exponente "baja multiplicando" y disminuye en uno.',
        category: 'Matemáticas',
        vibe: 'explanatory',
        timestamp: '2026-06-27T18:20:00Z'
    },
    {
        id: 'q5',
        studentId: 'student4',
        studentName: 'Elena Gómez',
        queryText: '¿Qué es una disolución amortiguadora o tampón y cómo funciona en química?',
        responseText: 'Una disolución tampón resiste cambios drásticos en el pH cuando se añaden pequeñas cantidades de ácidos o bases. Consiste típicamente en un ácido débil y su base conjugada.',
        category: 'Física y Química',
        vibe: 'ebau',
        timestamp: '2026-06-28T08:10:00Z'
    }
];

export const dbLogAIQuery = (studentId: string, queryText: string, responseText: string, category: string, vibe: string): AIQueryLog => {
    const student = usersData.find(u => u.id === studentId);
    const studentName = student ? student.name : 'Estudiante';
    const newLog: AIQueryLog = {
        id: `aiq_${Date.now()}`,
        studentId,
        studentName,
        queryText,
        responseText,
        category,
        vibe,
        timestamp: new Date().toISOString()
    };
    aiQueryLogsData.push(newLog);
    return newLog;
};

export const dbFetchAIQueries = (): AIQueryLog[] => {
    return aiQueryLogsData;
};

// --- CHATS DE PROFESORES Y MODERACIÓN (ADMINISTRACIÓN DE CANALES) ---

export interface TeacherMessage {
    id: string;
    conversationId?: string;
    senderId: string;
    senderName: string;
    text: string;
    timestamp: string;
    attachments?: Attachment[];
}

export let teacherMessagesData: TeacherMessage[] = [
    {
        id: 'tmsg_1',
        conversationId: 'sala_profesores_coordinacion',
        senderId: 'admin1',
        senderName: 'Soporte AulaInfinity',
        text: '¡Bienvenidos a la Sala de Coordinación de Profesores! Aquí los docentes y administradores podréis planificar vuestras clases, coordinar tutorías grupales y debatir aspectos del temario.',
        timestamp: new Date(Date.now() - 3600000 * 24).toISOString()
    },
    {
        id: 'tmsg_2',
        conversationId: 'sala_profesores_coordinacion',
        senderId: 'teacher1',
        senderName: 'Prof. Marcos',
        text: '¡Estupendo! Esta sala nos irá genial para dejar avisos rápidos sobre las dudas más repetidas que estamos viendo en la pestaña "Dudas Directas".',
        timestamp: new Date(Date.now() - 3600000 * 5).toISOString()
    }
];

export const dbFetchTeacherMessages = (conversationId?: string): TeacherMessage[] => {
    if (conversationId === 'ALL') return teacherMessagesData;
    const targetId = conversationId || 'sala_profesores_coordinacion';
    return teacherMessagesData.filter(m => {
        const msgConvoId = m.conversationId || 'sala_profesores_coordinacion';
        return msgConvoId === targetId;
    });
};

export const dbSendTeacherMessage = (messageData: { conversationId?: string; senderId: string; senderName: string; text: string; attachments?: Attachment[] }): TeacherMessage => {
    const targetId = messageData.conversationId || 'sala_profesores_coordinacion';
    const newMessage: TeacherMessage = {
        id: `tmsg_${Date.now()}`,
        conversationId: targetId,
        senderId: messageData.senderId,
        senderName: messageData.senderName,
        text: messageData.text,
        timestamp: new Date().toISOString(),
        attachments: messageData.attachments
    };
    teacherMessagesData.push(newMessage);
    eventEmitter.emit('teacher-message-update', newMessage);
    return newMessage;
};

export const dbEditTeacherMessage = (messageId: string, text: string): TeacherMessage => {
    const msg = teacherMessagesData.find(m => m.id === messageId);
    if (!msg) throw new Error('Mensaje de profesor no encontrado');
    msg.text = text;
    eventEmitter.emit('teacher-message-update', msg);
    return msg;
};

export const dbDeleteTeacherMessage = (messageId: string): { success: boolean } => {
    const idx = teacherMessagesData.findIndex(m => m.id === messageId);
    if (idx === -1) throw new Error('Mensaje de profesor no encontrado');
    teacherMessagesData.splice(idx, 1);
    return { success: true };
};

// Peer Moderation extra helpers
export const dbEditPeerMessage = (messageId: string, text: string): StudentPeerMessage => {
    const msg = studentPeerMessagesData.find(m => m.id === messageId);
    if (!msg) throw new Error('Mensaje de estudiante no encontrado');
    msg.text = text;
    eventEmitter.emit('peer-message-update', msg);
    return msg;
};

export const dbDeletePeerMessage = (messageId: string): { success: boolean; conversationId: string } => {
    const idx = studentPeerMessagesData.findIndex(m => m.id === messageId);
    if (idx === -1) throw new Error('Mensaje de estudiante no encontrado');
    const msg = studentPeerMessagesData[idx];
    const conversationId = msg.conversationId;
    studentPeerMessagesData.splice(idx, 1);
    
    // Update conversation if needed
    const convo = studentPeerConversationsData.find(c => c.id === conversationId);
    if (convo) {
        const remaining = studentPeerMessagesData.filter(m => m.conversationId === conversationId);
        if (remaining.length > 0) {
            const newest = remaining.reduce((latest, current) => {
                return new Date(current.timestamp).getTime() > new Date(latest.timestamp).getTime() ? current : latest;
            }, remaining[0]);
            convo.lastMessageText = newest.text;
            convo.lastMessageTimestamp = newest.timestamp;
        } else {
            convo.lastMessageText = 'Sin mensajes (moderado)';
        }
    }
    return { success: true, conversationId };
};

export { 
    usersData, 
    usersData as studentsData, 
    adminUserData, 
    adminUserData as adminsData, 
    teachersData, 
    coursesData, 
    commentsData, 
    appConfigData,
    apiKeysData,
    topicRequestsData, 
    tutoringRequestsData, 
    agendaData, 
    quizzesData, 
    studentAnswersData, 
    conversationsData, 
    directMessagesData 
};




