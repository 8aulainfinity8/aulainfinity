/**
 * Centralized identity and routing utilities for Chat in AulaInfinity.
 * Canonical direct chat format: direct_<studentUid>_<teacherUid>
 */

export interface ResolvedConversation {
  type: 'direct' | 'peer' | 'support' | 'group' | 'teacher' | 'coordination' | 'legacy' | 'unknown';
  participants: string[];
  studentId: string | null;
  teacherId: string | null;
  courseId?: string | null;
  groupId?: string | null;
  isValid: boolean;
  normalizedId: string;
}

export interface ResolveConversationOptions {
  cachedData?: any;
  studentId?: string;
  teacherId?: string;
  participants?: string[];
  type?: 'direct' | 'peer' | 'support' | 'group' | 'teacher' | 'coordination' | 'legacy' | string;
  currentUserId?: string | null;
}

export function resolveUserUid(user: any): string {
  if (!user) return '';
  if (typeof user === 'string') return user.replace(/^direct_/, '').replace(/^peer_/, '').trim();
  return (user.uid || user.firebaseUid || user.id || '').toString().trim();
}

/**
 * Returns canonical direct chatId for 1:1 Student <-> Teacher conversation
 * Format: direct_<studentUid>_<teacherUid>
 */
export function getDirectChatId(studentUid: string, teacherUid: string): string {
  if (!studentUid || !teacherUid) return '';
  const cleanStudent = studentUid.replace(/^direct_/, '').replace(/^peer_/, '').trim();
  const cleanTeacher = teacherUid.replace(/^direct_/, '').replace(/^peer_/, '').trim();
  if (!cleanStudent || !cleanTeacher) return '';
  return `direct_${cleanStudent}_${cleanTeacher}`;
}

/**
 * Returns canonical support chatId for a student
 * Format: support_<studentUid>
 */
export function getSupportChatId(studentUid: string): string {
  if (!studentUid) return '';
  const cleanStudent = studentUid.replace(/^support_/, '').replace(/^direct_/, '').trim();
  if (!cleanStudent) return '';
  return `support_${cleanStudent}`;
}

/**
 * Returns canonical peer chatId for 2 students
 * Format: peer_<student1Uid>_<student2Uid>
 */
export function getPeerChatId(student1Uid: string, student2Uid: string): string {
  if (!student1Uid || !student2Uid) return '';
  const clean1 = student1Uid.replace(/^peer_/, '').trim();
  const clean2 = student2Uid.replace(/^peer_/, '').trim();
  if (!clean1 || !clean2) return '';
  return `peer_${clean1}_${clean2}`;
}

/**
 * Canonical metadata resolver for any conversation ID in AulaInfinity.
 * Prioritizes cached/explicit metadata, then canonical schemas, and falls back to legacy normalizations.
 * Zero Firestore reads triggered.
 */
export function resolveConversationMetadata(
  conversationId: string | null | undefined,
  options?: ResolveConversationOptions
): ResolvedConversation {
  if (!conversationId || typeof conversationId !== 'string' || !conversationId.trim()) {
    return {
      type: 'unknown',
      participants: options?.participants || [],
      studentId: options?.studentId || null,
      teacherId: options?.teacherId || null,
      courseId: null,
      groupId: null,
      isValid: false,
      normalizedId: ''
    };
  }

  const rawId = conversationId.trim();

  const isLegacySupport = /^[a-zA-Z0-9-]+$/.test(rawId);
  const isLegacyDirect = rawId.includes('_') && !rawId.includes('direct_') && !rawId.includes('peer_') && !rawId.includes('support_') && !rawId.includes('group_') && !rawId.includes('teacher_');

  // Priority 1: If cachedData provided and has structured fields
  const cached = options?.cachedData;
  if (cached) {
    const defaultFallbackType = isLegacySupport ? 'support' : (isLegacyDirect ? 'direct' : 'direct');
    const cachedType = options?.type || cached.type || (rawId.startsWith('direct_') ? 'direct' : rawId.startsWith('peer_') ? 'peer' : rawId.startsWith('support_') ? 'support' : rawId.startsWith('group_') ? 'group' : defaultFallbackType);
    const cachedParticipants = options?.participants || cached.participants || cached.participantIds || [];
    const cachedStudentId = options?.studentId || cached.studentId || null;
    const cachedTeacherId = options?.teacherId || cached.teacherId || null;
    const cachedCourseId = cached.courseId || null;
    const cachedGroupId = cached.groupId || (rawId.startsWith('group_') ? rawId : null);

    if (cachedType && (cachedParticipants.length > 0 || cachedStudentId || cachedTeacherId || cachedCourseId)) {
      let resolvedNormalizedId = rawId;
      if (cachedType === 'support' && isLegacySupport) {
        resolvedNormalizedId = `support_${rawId}`;
      } else if (cachedType === 'direct' && isLegacyDirect) {
        const parts = rawId.split('_').filter(Boolean);
        if (parts.length === 2 && /^[a-zA-Z0-9-]+$/.test(parts[0]) && /^[a-zA-Z0-9-]+$/.test(parts[1])) {
          resolvedNormalizedId = `direct_${parts[0]}_${parts[1]}`;
        }
      }

      return {
        type: cachedType,
        participants: Array.from(new Set(cachedParticipants.filter(Boolean))),
        studentId: cachedStudentId,
        teacherId: cachedTeacherId,
        courseId: cachedCourseId,
        groupId: cachedGroupId,
        isValid: true,
        normalizedId: resolvedNormalizedId
      };
    }
  }

  // Priority 2: Explicit options
  if (options?.type && (options?.participants?.length || options?.studentId || options?.teacherId)) {
    let resolvedNormalizedId = rawId;
    if (options.type === 'support' && isLegacySupport) {
      resolvedNormalizedId = `support_${rawId}`;
    } else if (options.type === 'direct' && isLegacyDirect) {
      const parts = rawId.split('_').filter(Boolean);
      if (parts.length === 2 && /^[a-zA-Z0-9-]+$/.test(parts[0]) && /^[a-zA-Z0-9-]+$/.test(parts[1])) {
        resolvedNormalizedId = `direct_${parts[0]}_${parts[1]}`;
      }
    }

    return {
      type: options.type as any,
      participants: Array.from(new Set((options.participants || [options.studentId, options.teacherId]).filter(Boolean) as string[])),
      studentId: options.studentId || null,
      teacherId: options.teacherId || null,
      courseId: null,
      groupId: rawId.startsWith('group_') ? rawId : null,
      isValid: true,
      normalizedId: resolvedNormalizedId
    };
  }

  // Priority 3: Deterministic canonical formats

  // 1. Direct: direct_{student}_{teacher}
  if (rawId.startsWith('direct_')) {
    const clean = rawId.slice('direct_'.length).trim();
    if (!clean) {
      return {
        type: 'direct',
        participants: options?.participants || [],
        studentId: null,
        teacherId: null,
        courseId: null,
        groupId: null,
        isValid: false,
        normalizedId: rawId
      };
    }

    let studentId: string | null = null;
    let teacherId: string | null = null;

    if (options?.studentId && options?.teacherId) {
      studentId = options.studentId;
      teacherId = options.teacherId;
    } else if (options?.participants && options.participants.length >= 2) {
      studentId = options.participants[0] || null;
      teacherId = options.participants[1] || null;
    } else if (clean.includes('_teacher_')) {
      const splitIndex = clean.indexOf('_teacher_');
      studentId = clean.slice(0, splitIndex) || null;
      teacherId = clean.slice(splitIndex + 1) || null;
    } else {
      const parts = clean.split('_');
      if (parts.length === 2) {
        studentId = parts[0] || null;
        teacherId = parts[1] || null;
      } else if (parts.length > 2) {
        const mid = Math.floor(parts.length / 2);
        studentId = parts.slice(0, mid).join('_') || null;
        teacherId = parts.slice(mid).join('_') || null;
      } else {
        studentId = parts[0] || null;
      }
    }

    const rawParts = clean.split('_').filter(Boolean);
    const hasExplicitPair = Boolean((options?.studentId && options?.teacherId) || (options?.participants && options.participants.length >= 2));
    const participants = options?.participants || (hasExplicitPair 
      ? Array.from(new Set([studentId, teacherId].filter(Boolean) as string[]))
      : Array.from(new Set([studentId, teacherId, ...rawParts].filter(Boolean) as string[])));
    return {
      type: 'direct',
      participants,
      studentId: options?.studentId || studentId,
      teacherId: options?.teacherId || teacherId,
      courseId: null,
      groupId: null,
      isValid: true,
      normalizedId: rawId
    };
  }

  // 2. Peer: peer_{student1}_{student2}
  if (rawId.startsWith('peer_')) {
    const clean = rawId.slice('peer_'.length).trim();
    const parts = options?.participants || (clean ? clean.split('_').filter(Boolean) : []);
    return {
      type: 'peer',
      participants: Array.from(new Set(parts)),
      studentId: parts[0] || null,
      teacherId: null,
      courseId: null,
      groupId: null,
      isValid: parts.length > 0,
      normalizedId: rawId
    };
  }

  // 3. Support: support_{student}
  if (rawId.startsWith('support_')) {
    const clean = rawId.slice('support_'.length).trim();
    const studentId = options?.studentId || clean || null;
    return {
      type: 'support',
      participants: options?.participants || (studentId ? [studentId] : []),
      studentId,
      teacherId: null,
      courseId: null,
      groupId: null,
      isValid: Boolean(studentId),
      normalizedId: rawId
    };
  }

  // 4. Group: group_{courseId}
  if (rawId.startsWith('group_')) {
    const clean = rawId.slice('group_'.length).trim();
    return {
      type: 'group',
      participants: options?.participants || [],
      studentId: null,
      teacherId: null,
      courseId: clean || null,
      groupId: rawId,
      isValid: Boolean(clean),
      normalizedId: rawId
    };
  }

  // 5. Teacher: teacher_{teacherId}
  if (rawId.startsWith('teacher_')) {
    const clean = rawId.slice('teacher_'.length).trim();
    return {
      type: 'teacher',
      participants: clean ? [clean] : [],
      studentId: null,
      teacherId: clean || null,
      courseId: null,
      groupId: null,
      isValid: Boolean(clean),
      normalizedId: rawId
    };
  }

  // 6. Coordination: sala_profesores_coordinacion
  if (rawId === 'sala_profesores_coordinacion') {
    return {
      type: 'coordination',
      participants: options?.participants || [],
      studentId: null,
      teacherId: null,
      courseId: null,
      groupId: null,
      isValid: true,
      normalizedId: rawId
    };
  }

  // 7. Legacy Format 1: student_teacher (contains underscore, 2 alphanumeric segments, no known prefix)
  if (rawId.includes('_')) {
    const parts = rawId.split('_').filter(Boolean);
    if (parts.length === 2 && /^[a-zA-Z0-9-]+$/.test(parts[0]) && /^[a-zA-Z0-9-]+$/.test(parts[1])) {
      const studentId = parts[0];
      const teacherId = parts[1];
      return {
        type: 'direct',
        participants: [studentId, teacherId],
        studentId,
        teacherId,
        courseId: null,
        groupId: null,
        isValid: true,
        normalizedId: `direct_${studentId}_${teacherId}`
      };
    }
  }

  // 8. Legacy Format 2: simple student ID (alphanumeric, no underscore)
  if (/^[a-zA-Z0-9-]+$/.test(rawId)) {
    return {
      type: 'support',
      participants: [rawId],
      studentId: rawId,
      teacherId: null,
      courseId: null,
      groupId: null,
      isValid: true,
      normalizedId: `support_${rawId}`
    };
  }

  // 9. Unknown / malformed
  return {
    type: 'unknown',
    participants: options?.participants || [],
    studentId: null,
    teacherId: null,
    courseId: null,
    groupId: null,
    isValid: false,
    normalizedId: rawId
  };
}

export function isDirectChatId(chatId: string | null | undefined): boolean {
  return resolveConversationMetadata(chatId).type === 'direct';
}

export function isSupportChatId(chatId: string | null | undefined): boolean {
  return resolveConversationMetadata(chatId).type === 'support';
}

export function isPeerChatId(chatId: string | null | undefined): boolean {
  return resolveConversationMetadata(chatId).type === 'peer';
}

export function isGroupChatId(chatId: string | null | undefined): boolean {
  return resolveConversationMetadata(chatId).type === 'group';
}

export function parseSupportChatId(chatId: string | null | undefined): { studentId: string | null } {
  const resolved = resolveConversationMetadata(chatId);
  return { studentId: resolved.studentId };
}

/**
 * Returns canonical participant list for 1:1 Student <-> Teacher conversation
 */
export function getDirectChatParticipants(studentUid: string, teacherUid: string): string[] {
  const cleanStudent = studentUid.replace(/^direct_/, '').replace(/^peer_/, '').trim();
  const cleanTeacher = teacherUid.replace(/^direct_/, '').replace(/^peer_/, '').trim();
  const list: string[] = [];
  if (cleanStudent) list.push(cleanStudent);
  if (cleanTeacher && cleanTeacher !== cleanStudent) list.push(cleanTeacher);
  return list;
}

/**
 * Parses participants from canonical direct chatId
 */
export function parseDirectChatId(chatId: string | null | undefined): { studentId: string | null; teacherId: string | null } {
  const resolved = resolveConversationMetadata(chatId);
  return { studentId: resolved.studentId, teacherId: resolved.teacherId };
}

/**
 * Infiere los IDs de participantes a partir del identificador determinista del chat
 */
export function inferParticipantsFromChatId(chatId: string, currentUserId?: string | null): string[] {
  const resolved = resolveConversationMetadata(chatId, { currentUserId });
  const set = new Set(resolved.participants);
  if (currentUserId) {
    set.add(currentUserId.trim());
  }
  return Array.from(set);
}

export function normalizeMessageTimestamp(timestamp: any): Date {
  if (!timestamp) {
    return new Date();
  }
  if (timestamp instanceof Date) {
    return isNaN(timestamp.getTime()) ? new Date() : timestamp;
  }
  if (typeof timestamp.toDate === 'function') {
    try {
      const d = timestamp.toDate();
      if (d instanceof Date && !isNaN(d.getTime())) return d;
    } catch {
      // fallback
    }
  }
  if (typeof timestamp.toMillis === 'function') {
    try {
      const ms = timestamp.toMillis();
      const d = new Date(ms);
      if (!isNaN(d.getTime())) return d;
    } catch {
      // fallback
    }
  }
  if (typeof timestamp === 'object' && timestamp !== null && typeof timestamp.seconds === 'number') {
    const d = new Date(timestamp.seconds * 1000);
    if (!isNaN(d.getTime())) return d;
  }
  if (typeof timestamp === 'number') {
    const ms = timestamp < 1e12 ? timestamp * 1000 : timestamp;
    const d = new Date(ms);
    if (!isNaN(d.getTime())) return d;
  }
  if (typeof timestamp === 'string') {
    const d = new Date(timestamp);
    if (!isNaN(d.getTime())) return d;
  }
  return new Date();
}

export function formatMessageTime(timestamp: any): string {
  const date = normalizeMessageTimestamp(timestamp);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

