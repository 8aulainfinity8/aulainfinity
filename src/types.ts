import type { FC, SVGProps } from 'react';

// This file defines all the core data structures used throughout the application.

export interface StudentUser {
  id: string;
  uid?: string;
  firebaseUid?: string;
  name: string;
  email: string;
  role: 'student';
  watchedVideos: string[];
  favoriteVideos?: string[];
  completedVideoIds?: string[];
  unlockedRewardIds?: string[];
  unlockedBadgeIds?: string[];
  password?: string; // Should not be sent to client, but here for mock data
  isSubscribed: boolean;
  registrationDate: string; // ISO string
  enrolledCourseIds: string[];
  phone: string;
  avatar?: string;
  subscriptionPeriod?: 'monthly' | 'annual';
  assignedTeacherId?: string;
  assignedTeacherName?: string;
  creditsBalance?: number; // Credits balance for booking individual tutoring sessions and premium actions
  aiEnabled?: boolean;
  videosEnabled?: boolean;
  canInitiateCalls?: boolean; // Default false for students (can receive calls, but cannot initiate unless admin enables it)
  canInitiateWhiteboard?: boolean; // Default false for students (can join whiteboards, but cannot initiate unless admin enables it)
  adminNotes?: string;
}

export interface AdminUser {
  id:string;
  uid?: string;
  firebaseUid?: string;
  username: string;
  role: 'admin';
  password?: string;
  email?: string;
  name?: string;
  favoriteVideos?: string[];
}

export interface TeacherUser {
  id: string;
  uid?: string;
  firebaseUid?: string;
  name: string;
  email: string;
  role: 'teacher';
  password?: string;
  phone: string;
  avatar?: string;
  category: string; // The category of subjects they teach (e.g. "Matemáticas" or "Física y Química")
  status?: 'available' | 'in-class' | 'do-not-disturb';
  isApprovedForTutoring?: boolean; // Added isApprovedForTutoring
  subjects?: string[]; // Added subjects
  levels?: string[]; // Added levels
  schedules?: string[]; // Added available schedules
  taughtCourseIds?: string[]; // IDs of CourseLevels assigned by Admin
  coursesTaughtIds?: string[]; // Alias for backward compatibility
  aiEnabled?: boolean;
  videosEnabled?: boolean;
  canEditContent?: boolean;
  favoriteVideos?: string[];
}

export type AnyUser = StudentUser | AdminUser | TeacherUser;

export interface Resource {
  name: string;
  url: string;
}

export interface YouTubeLink {
  title: string;
  youtubeId?: string;
  videoUrl?: string; // Firebase Storage video URL
  videoFileName?: string; // Original name of uploaded video file
}

export interface Video {
  id: string;
  title: string;
  description: string;
  youtubeLinks: YouTubeLink[];
  topic: string; // For AI context
  resources?: Resource[];
  createdAt: string; // ISO string
  page?: number;
  difficulty?: 'Básico' | 'Intermedio' | 'Avanzado' | 'fácil' | 'medio' | 'difícil';
}

export interface VideoBlock {
  id: string;
  name: string;
  videos: Video[];
}

export interface Subject {
  id: string;
  name: string;
  icon: string; // Icon name e.g., 'MathIcon'
  videos: Video[];
  blocks?: VideoBlock[];
  createdAt: string; // ISO string
}

export interface CourseLevel {
  id: string;
  name: string;
  subjects: Subject[];
  createdAt: string; // ISO string
}

export interface Comment {
  id: string;
  videoId: string;
  author: {
    id: string;
    name: string;
  };
  text: string;
  timestamp: string; // ISO string
  isRead?: boolean;
}

export interface AppConfig {
    bizumNumber: string;
    subscriptionPrice: number;
    tutoringSchedule: {
        day: string;
        time: string;
        subject: string;
    }[];
    supportEmail: string;
    aiEnabled?: boolean;
    videosEnabled?: boolean;
    subscriptionsEnabled?: boolean;
    aiModelSelected?: string;
    aiTutorInstruction?: string;
    aiQuizExplanations?: boolean;
    tutoringPrice?: number;
    supportPhone?: string;
    registrationsOpen?: boolean;
    whatsappMode?: 'direct' | 'twilio' | 'meta' | 'evolution' | 'firebase_queue' | 'greenapi';
    twilioAccountSid?: string;
    twilioAuthToken?: string;
    twilioWhatsappFrom?: string;
    metaPhoneNumberId?: string;
    metaAccessToken?: string;
    evolutionInstanceUrl?: string;
    evolutionApiKey?: string;
    greenapiIdInstance?: string;
    greenapiApiTokenInstance?: string;
    greenapiApiUrl?: string;
    webrtcStunServers?: string;
    webrtcUseTurn?: boolean;
    webrtcTurnUrl?: string;
    webrtcTurnUsername?: string;
    webrtcTurnCredential?: string;
}

// FIX: Added ApiKeysConfig to resolve an import error in data/apiKeys.ts.
export interface ApiKeysConfig {
    geminiApiKey: string;
}

export interface TopicRequest {
    id: string;
    studentId: string;
    studentName: string;
    topic: string;
    details: string;
    subjectId?: string;
    timestamp: string; // ISO string
    status: 'pending' | 'completed';
    seenByAdmin?: boolean;
    seenByTeacher?: boolean;
}

export interface TutoringRequest {
    id: string;
    studentId: string;
    studentName: string;
    subject: string;
    details: string;
    timestamp: string; // ISO string
    status: 'pending' | 'confirmed' | 'completed';
    teacherId?: string; // Added teacherId
    teacherName?: string; // Added teacherName
    rating?: number; // 1-5
    feedback?: string;
    date?: string; // YYYY-MM-DD
    time?: string; // HH:MM
    whatsappSent?: boolean;
    proposedDate?: string;
    proposedTime?: string;
    proposedDetails?: string;
    modificationStatus?: 'pending' | 'accepted' | 'rejected';
    modificationRequestedBy?: 'student' | 'teacher';
    teacherApproved?: boolean; // Added for double-visto-bueno flow
    adminApproved?: boolean; // Added for double-visto-bueno flow
    sessionSummary?: string; // Summary of topics covered during the session
    sharedResources?: { title: string; url: string }[]; // Resources shared by the teacher
    meetingLink?: string; // Virtual room link (Zoom, Meet, WhatsApp etc)
    isVoiceCall?: boolean; // If true, use in-app VoiceGroupCall instead of external link
    seenByAdmin?: boolean;
    seenByTeacher?: boolean;
    seenByStudent?: boolean;
}

export interface ExamEvent {
  id: string;
  studentId: string;
  title: string;
  date: string; // YYYY-MM-DD
  time?: string; // HH:MM
  whatsappSent?: boolean;
  subjectId: string;
  videoIds: string[];
  studyPlan?: {
    text: string;
    completedDays: string[]; // Array of date strings 'YYYY-MM-DD'
  };
  quiz?: {
    questions: {
      text: string;
      options: string[];
      correctAnswerIndex: number;
      explanation?: string;
    }[];
    answers: { [questionIndex: number]: number };
    score?: number;
  };
}

export interface Question {
    id: string;
    text: string;
    options: string[];
    correctAnswerIndex: number;
    explanation?: string;
    diagram?: {
        type: 'geometry' | 'plot' | 'circuit' | 'forces' | 'atoms';
        data?: any;
    };
}

export interface Quiz {
    id: string;
    videoId: string;
    questions: Question[];
}

export interface StudentAnswer {
    studentId: string;
    videoId: string;
    quizId: string;
    answers: { [questionId: string]: number }; // questionId -> selectedOptionIndex
    score: number;
    totalQuestions: number;
    timestamp: string; // ISO string
}

export interface ChatMessage {
    role: 'user' | 'model';
    text: string;
    image?: string; // data URL for display
}

// For creating new items
export type NewCourseLevelData = Pick<CourseLevel, 'name'>;
export type NewSubjectData = Pick<Subject, 'name' | 'icon'>;
export type NewVideoData = Omit<Video, 'id' | 'createdAt'>;
export type NewQuestionData = Omit<Question, 'id'>;
export type NewQuizData = { videoId: string; questions: NewQuestionData[] };
export type NewVideoBlockData = Pick<VideoBlock, 'name'>;

export interface Badge {
  id: string;
  name: string;
  description: string;
  icon: string; // Icon name
  criteria: (user: StudentUser, allCourses: CourseLevel[], studentAnswers: StudentAnswer[]) => boolean;
}

// --- NEW: Chat Types ---
export interface Attachment {
  name: string;
  url: string; // raw base64 or data URL
  type: string; // mimeType (e.g., 'image/png', 'application/pdf')
  size?: number; // size in bytes
}

export interface DirectMessage {
  id: string;
  conversationId: string;
  senderId: string; // 'admin' or studentId or teacherId
  senderRole: 'admin' | 'student' | 'teacher';
  senderName?: string;
  text: string;
  timestamp: string;
  attachments?: Attachment[];
  participants?: string[];
}

export interface Conversation {
  id: string; // e.g. studentId or studentId_teacherId
  studentId: string;
  studentName: string;
  teacherId?: string; // If conversation is with a specific teacher, otherwise Admin support
  teacherName?: string;
  lastMessageText: string;
  lastMessageTimestamp: string;
  unreadByAdmin: boolean;
  unreadByTeacher?: boolean;
  unreadByStudent?: boolean;
  type?: 'support' | 'direct' | 'peer' | 'group' | string;
  status?: 'open' | 'pending' | 'resolved' | 'closed' | string;
  closed?: boolean;
  closedBy?: string;
  closedAt?: string;
}

// Student peer-to-peer chat interfaces (similar to WhatsApp)
export interface StudentFriend {
  id: string;
  name: string;
  email: string;
  phone: string;
  avatar?: string;
}

export interface StudentPeerConversation {
  id: string; // unique ID generated for the room, e.g., peer_student1_student2
  participantIds: string[]; // [studentId1, studentId2]
  lastMessageText: string;
  lastMessageTimestamp: string;
  unreadByStudentId: { [studentId: string]: boolean };
}

export interface StudentPeerMessage {
  id: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  text: string;
  timestamp: string;
  isRead?: boolean;
  attachments?: Attachment[];
  participants?: string[];
}

// Course-wide group chat interfaces
export interface CourseGroupMessage {
  id: string;
  courseId: string;
  senderId: string;
  senderName: string;
  text: string;
  timestamp: string;
  isRead?: boolean;
  attachments?: Attachment[];
  participants?: string[];
}

// Recording Types for whiteboard and audio
export interface RecordingStroke {
  id: string;
  points: { x: number; y: number }[];
  color: string;
  size: number;
  type: string;
}

export interface RecordingDoc {
  id: string;
  name: string;
  url: string;
  x: number;
  y: number;
  width: number;
  height: number;
  scale: number;
}

export interface RecordingFrame {
  offsetMs: number;
  strokes: RecordingStroke[];
  boardDocs: RecordingDoc[];
}

export interface ClassRecording {
  id: string;
  courseId: string;
  title: string;
  createdAt: string; // ISO String
  durationMs: number;
  recordedBy: string; // teacher's name
  frames: RecordingFrame[];
  audioUrl?: string; // base64, Storage url or local
}

export interface CourseGroupConversation {
  id: string; // courseId
  name: string; // e.g. "Grupo 2º Bachillerato Ciencias"
  lastMessageText: string;
  lastMessageTimestamp: string;
  enrolledStudentsCount: number;
  unreadByUserId?: { [userId: string]: boolean };
}

// FIX: Added IconComponentType to resolve type errors in iconMap.ts.
export type IconComponentType = FC<SVGProps<SVGSVGElement>>;

export interface InfinityTransaction {
  id: string;
  studentId: string;
  amount: number;
  type: 'earn' | 'spend';
  description: string;
  timestamp: string; // ISO string
}

export interface AIQueryLog {
  id: string;
  studentId: string;
  studentName: string;
  queryText: string;
  responseText: string;
  category: string; // e.g. "Matemáticas", "Física", "Sintaxis"
  vibe: string; // 'socratic' | 'explanatory' | 'ebau' | 'general'
  timestamp: string; // ISO string
}

export interface StudentPayment {
  id: string;
  studentId: string;
  studentName: string;
  amount: number; // in EUR (€)
  date: string; // ISO string
  concept: string; // e.g., "Suscripción Premium Mensual", "Compra de créditos"
  method: 'Tarjeta' | 'Transferencia' | 'Efectivo' | 'Bizum';
  invoiceNumber: string;
  status?: 'pending' | 'approved' | 'rejected' | 'completed';
  itemType?: 'subscription' | 'credits';
  itemQuantity?: number;
  billingPeriod?: 'monthly' | 'annual';
}

export interface StudentExpense {
  id: string;
  studentId: string;
  studentName: string;
  amount: number; // in credits or EUR
  unit: 'credits' | 'eur';
  date: string; // ISO string
  concept: string; // e.g., "Clase de Matemáticas", "Uso de IA"
}

export interface TeacherPayment {
  id: string;
  teacherId: string;
  teacherName: string;
  studentId: string;
  studentName: string;
  classConcept: string; // e.g. "Clase de Matemáticas"
  classPrice: number; // Price of the class paid by the student in EUR
  percentage: number; // percentage of payment for the teacher, e.g. 80%
  amount: number; // payment amount in EUR, calculated/introduced manually
  date: string; // ISO string
  method: 'Tarjeta' | 'Transferencia' | 'Efectivo' | 'Bizum';
  invoiceNumber: string;
}


