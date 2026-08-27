const auth = { currentUser: { uid: 'teacher123' } };
const conversationId = 'direct_student456_teacher123';
const studentId = 'student456';

const cleanConvoId = (conversationId || '').replace(/^direct_/, '').replace(/^support_/, '').replace(/^peer_/, '');
const cleanStudentId = (studentId || '').replace(/^direct_/, '').replace(/^support_/, '').replace(/^peer_/, '') || cleanConvoId.split('_')[0];
const teacherUid = auth.currentUser?.uid;

const rawTargetIds = [
    conversationId,
    `direct_${cleanConvoId}`,
    `support_${cleanConvoId}`,
    `peer_${cleanConvoId}`,
    `support_${cleanStudentId}`,
    `direct_${cleanStudentId}`,
    cleanStudentId,
    cleanConvoId
];

if (teacherUid && cleanStudentId) {
    rawTargetIds.push(`direct_${cleanStudentId}_${teacherUid}`);
    rawTargetIds.push(`direct_${teacherUid}_${cleanStudentId}`);
    rawTargetIds.push(`${cleanStudentId}_${teacherUid}`);
    rawTargetIds.push(`${teacherUid}_${cleanStudentId}`);
}

const targetIds = Array.from(new Set(rawTargetIds.filter(Boolean)));
console.log(targetIds);
