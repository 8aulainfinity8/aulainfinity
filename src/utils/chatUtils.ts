/**
 * Centralized identity and routing utilities for Chat in AulaInfinity.
 * Canonical direct chat format: direct_<studentUid>_<teacherUid>
 */

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

export function isDirectChatId(chatId: string | null | undefined): boolean {
  if (!chatId) return false;
  return typeof chatId === 'string' && chatId.startsWith('direct_');
}

export function isSupportChatId(chatId: string | null | undefined): boolean {
  if (!chatId) return false;
  return typeof chatId === 'string' && chatId.startsWith('support_');
}

export function parseSupportChatId(chatId: string | null | undefined): { studentId: string | null } {
  if (!chatId || typeof chatId !== 'string' || !chatId.startsWith('support_')) {
    return { studentId: null };
  }
  const clean = chatId.slice('support_'.length).trim();
  return { studentId: clean || null };
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
  if (!chatId || typeof chatId !== 'string' || !chatId.startsWith('direct_')) {
    return { studentId: null, teacherId: null };
  }
  const clean = chatId.slice('direct_'.length).trim();
  if (!clean) return { studentId: null, teacherId: null };

  if (clean.includes('_teacher_')) {
    const splitIndex = clean.indexOf('_teacher_');
    return {
      studentId: clean.slice(0, splitIndex) || null,
      teacherId: clean.slice(splitIndex + 1) || null
    };
  }

  const parts = clean.split('_');
  if (parts.length === 2) {
    return {
      studentId: parts[0] || null,
      teacherId: parts[1] || null
    };
  }

  if (parts.length > 2) {
    // Check if teacher prefix or student prefix exists
    const mid = Math.floor(parts.length / 2);
    return {
      studentId: parts.slice(0, mid).join('_') || null,
      teacherId: parts.slice(mid).join('_') || null
    };
  }

  return { studentId: parts[0] || null, teacherId: null };
}

/**
 * Infiere los IDs de participantes a partir del identificador determinista del chat
 */
export function inferParticipantsFromChatId(chatId: string, currentUserId?: string | null): string[] {
  const set = new Set<string>();

  if (!chatId) {
    if (currentUserId) set.add(currentUserId.trim());
    return Array.from(set);
  }

  if (chatId.startsWith('support_')) {
    const parsed = parseSupportChatId(chatId);
    if (parsed.studentId) set.add(parsed.studentId);
    return Array.from(set);
  }

  if (chatId.startsWith('direct_')) {
    const parsed = parseDirectChatId(chatId);
    if (parsed.studentId) set.add(parsed.studentId);
    if (parsed.teacherId) set.add(parsed.teacherId);

    const withoutPrefix = chatId.slice('direct_'.length);
    const parts = withoutPrefix.split('_');
    if (parts[0]) set.add(parts[0].trim());
    if (parts[1]) set.add(parts[1].trim());

    return Array.from(set);
  }

  if (chatId.startsWith('peer_')) {
    const withoutPrefix = chatId.slice('peer_'.length);
    const parts = withoutPrefix.split('_');
    if (parts[0]) set.add(parts[0].trim());
    if (parts[1]) set.add(parts[1].trim());

    return Array.from(set);
  }

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

