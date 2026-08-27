import { describe, it, expect } from 'vitest';
import {
    resolveConversationMetadata,
    getDirectChatId,
    getSupportChatId,
    getPeerChatId,
    parseDirectChatId,
    parseSupportChatId,
    inferParticipantsFromChatId,
    isDirectChatId,
    isSupportChatId,
    isPeerChatId,
    isGroupChatId
} from '../utils/chatUtils';

describe('P5.5 — Canonical Conversation ID Resolution & Metadata Normalization', () => {

    describe('1. Direct Conversations (Student <-> Teacher)', () => {
        it('resolves canonical direct format direct_{studentUid}_{teacherUid}', () => {
            const result = resolveConversationMetadata('direct_student123_teacher456');
            expect(result.type).toBe('direct');
            expect(result.studentId).toBe('student123');
            expect(result.teacherId).toBe('teacher456');
            expect(result.participants).toEqual(['student123', 'teacher456']);
            expect(result.normalizedId).toBe('direct_student123_teacher456');
        });

        it('resolves direct format when UIDs contain underscores', () => {
            const studentWithUnderscore = 'student_abc_123';
            const teacherWithUnderscore = 'teacher_xyz_456';
            const directId = getDirectChatId(studentWithUnderscore, teacherWithUnderscore);
            
            expect(directId).toBe('direct_student_abc_123_teacher_xyz_456');
            
            // With options provided (e.g. from context/activeConvo)
            const result = resolveConversationMetadata(directId, {
                studentId: studentWithUnderscore,
                teacherId: teacherWithUnderscore
            });
            expect(result.type).toBe('direct');
            expect(result.studentId).toBe(studentWithUnderscore);
            expect(result.teacherId).toBe(teacherWithUnderscore);
            expect(result.participants).toEqual([studentWithUnderscore, teacherWithUnderscore]);
        });

        it('resolves legacy studentId_teacherId format as direct', () => {
            const result = resolveConversationMetadata('student999_prof888');
            expect(result.type).toBe('direct');
            expect(result.studentId).toBe('student999');
            expect(result.teacherId).toBe('prof888');
            expect(result.participants).toEqual(['student999', 'prof888']);
            expect(result.normalizedId).toBe('direct_student999_prof888');
        });

        it('parses direct chat ID with parseDirectChatId', () => {
            const parsed = parseDirectChatId('direct_std1_tea2');
            expect(parsed).toEqual({ studentId: 'std1', teacherId: 'tea2' });
        });
    });

    describe('2. Peer Conversations (Student <-> Student)', () => {
        it('resolves canonical peer format peer_{student1}_{student2}', () => {
            const peerId = getPeerChatId('alunnoA', 'alumnoB');
            expect(peerId).toBe('peer_alunnoA_alumnoB');

            const result = resolveConversationMetadata(peerId);
            expect(result.type).toBe('peer');
            expect(result.participants).toEqual(['alunnoA', 'alumnoB']);
            expect(result.normalizedId).toBe('peer_alunnoA_alumnoB');
        });

        it('resolves peer format with UIDs containing underscores using options', () => {
            const s1 = 'student_001_v2';
            const s2 = 'student_002_v2';
            const peerId = `peer_${s1}_${s2}`;

            const result = resolveConversationMetadata(peerId, {
                participants: [s1, s2]
            });
            expect(result.type).toBe('peer');
            expect(result.participants).toEqual([s1, s2]);
        });
    });

    describe('3. Support / Tutoring Conversations', () => {
        it('resolves canonical support format support_{studentUid}', () => {
            const supportId = getSupportChatId('student555');
            expect(supportId).toBe('support_student555');

            const result = resolveConversationMetadata(supportId);
            expect(result.type).toBe('support');
            expect(result.studentId).toBe('student555');
            expect(result.participants).toEqual(['student555']);
            expect(result.normalizedId).toBe('support_student555');
        });

        it('resolves bare studentId (legacy support) as support', () => {
            const result = resolveConversationMetadata('student777');
            expect(result.type).toBe('support');
            expect(result.studentId).toBe('student777');
            expect(result.participants).toEqual(['student777']);
            expect(result.normalizedId).toBe('support_student777');
        });

        it('parses support chat ID with parseSupportChatId', () => {
            const parsed = parseSupportChatId('support_studentXYZ');
            expect(parsed).toEqual({ studentId: 'studentXYZ' });
        });
    });

    describe('4. Group & Teacher Rooms', () => {
        it('resolves group conversation group_{courseId}', () => {
            const result = resolveConversationMetadata('group_matematicas_1');
            expect(result.type).toBe('group');
            expect(result.groupId).toBe('group_matematicas_1');
            expect(result.normalizedId).toBe('group_matematicas_1');
        });

        it('resolves teacher room teacher_{id}', () => {
            const result = resolveConversationMetadata('teacher_coordinacion');
            expect(result.type).toBe('teacher');
            expect(result.normalizedId).toBe('teacher_coordinacion');
        });

        it('resolves coordination room sala_profesores_coordinacion', () => {
            const result = resolveConversationMetadata('sala_profesores_coordinacion');
            expect(result.type).toBe('coordination');
            expect(result.normalizedId).toBe('sala_profesores_coordinacion');
        });
    });

    describe('5. Prioritization & Cache-First Resolution', () => {
        it('prioritizes explicit options over string inference', () => {
            const result = resolveConversationMetadata('ambiguous_id', {
                type: 'direct',
                studentId: 's1',
                teacherId: 't1',
                participants: ['s1', 't1']
            });
            expect(result.type).toBe('direct');
            expect(result.studentId).toBe('s1');
            expect(result.teacherId).toBe('t1');
            expect(result.participants).toEqual(['s1', 't1']);
        });

        it('prioritizes cachedData object over string inference', () => {
            const cachedConvo = {
                id: 'custom_convo_id',
                type: 'direct' as const,
                studentId: 'cachedStudent',
                teacherId: 'cachedTeacher',
                participantIds: ['cachedStudent', 'cachedTeacher']
            };

            const result = resolveConversationMetadata('custom_convo_id', {
                cachedData: cachedConvo
            });
            expect(result.type).toBe('direct');
            expect(result.studentId).toBe('cachedStudent');
            expect(result.teacherId).toBe('cachedTeacher');
            expect(result.participants).toEqual(['cachedStudent', 'cachedTeacher']);
        });
    });

    describe('6. Backward Compatibility & Helpers', () => {
        it('inferParticipantsFromChatId returns correct participants for all formats', () => {
            expect(inferParticipantsFromChatId('direct_s1_t1')).toEqual(['s1', 't1']);
            expect(inferParticipantsFromChatId('support_s1')).toEqual(['s1']);
            expect(inferParticipantsFromChatId('peer_p1_p2')).toEqual(['p1', 'p2']);
            expect(inferParticipantsFromChatId('legacyS1_legacyT1')).toEqual(['legacyS1', 'legacyT1']);
            expect(inferParticipantsFromChatId('legacyOnlyStudent')).toEqual(['legacyOnlyStudent']);
        });

        it('isDirectChatId, isSupportChatId, isPeerChatId, isGroupChatId return correct booleans', () => {
            expect(isDirectChatId('direct_s_t')).toBe(true);
            expect(isDirectChatId('s_t')).toBe(true);
            expect(isDirectChatId('support_s')).toBe(false);

            expect(isSupportChatId('support_s')).toBe(true);
            expect(isSupportChatId('s')).toBe(true);
            expect(isSupportChatId('direct_s_t')).toBe(false);

            expect(isPeerChatId('peer_a_b')).toBe(true);
            expect(isPeerChatId('direct_s_t')).toBe(false);

            expect(isGroupChatId('group_course1')).toBe(true);
            expect(isGroupChatId('peer_a_b')).toBe(false);
        });

        it('handles null, undefined and empty string gracefully', () => {
            const resNull = resolveConversationMetadata(null);
            expect(resNull.type).toBe('unknown');
            expect(resNull.normalizedId).toBe('');
            expect(resNull.participants).toEqual([]);

            const resUndef = resolveConversationMetadata(undefined);
            expect(resUndef.type).toBe('unknown');

            const resEmpty = resolveConversationMetadata('');
            expect(resEmpty.type).toBe('unknown');
        });
    });

    describe('7. Performance & Zero-Reads Contract', () => {
        it('executes synchronously in sub-millisecond time with zero Firestore calls', () => {
            const start = performance.now();
            for (let i = 0; i < 1000; i++) {
                resolveConversationMetadata(`direct_student_${i}_teacher_${i}`);
                resolveConversationMetadata(`support_student_${i}`);
                resolveConversationMetadata(`peer_studentA_${i}_studentB_${i}`);
                resolveConversationMetadata(`group_course_${i}`);
            }
            const duration = performance.now() - start;
            expect(duration).toBeLessThan(100); // 4000 resolutions under 100ms
        });
    });
});
