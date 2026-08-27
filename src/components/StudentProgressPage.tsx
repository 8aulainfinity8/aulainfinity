import React, { useContext, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import * as api from '../services/api';
import { auth } from '../services/firebase';
import { AuthContext } from '../contexts/AuthContext';
import { StudentProgressContext } from '../contexts/StudentProgressContext';
import { badgesData } from '../data/badges';
import type { StudentUser, CourseLevel, StudentAnswer, Badge } from '../types';
import { jsPDF } from 'jspdf';
import { FileDown } from 'lucide-react';
// FIX: Imported the missing 'QuestionMarkCircleIcon' to resolve the 'Cannot find name' error.
import { TrophyIcon, ChartBarIcon, CheckCircleIcon, VideoCameraIcon, AcademicCapIcon, LightBulbIcon, BookOpenIcon, QuestionMarkCircleIcon } from './icons';
import { EmptyState } from './ui/EmptyState';
import { Badge as UiBadge } from './ui';
import { useI18n } from '../hooks/useI18n';

// A local map to render badge icons dynamically from their string names.
const badgeIconMap: { [key: string]: React.FC<any> } = {
    AcademicCapIcon,
    LightBulbIcon,
    BookOpenIcon,
    TrophyIcon,
    CheckCircleIcon,
    ChartBarIcon,
};

const StatCard: React.FC<{ icon: React.ReactNode; label: string; value: string | number; }> = ({ icon, label, value }) => (
    <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-lg flex items-center">
        {icon}
        <div className="ml-4">
            <p className="text-3xl font-bold text-slate-900 dark:text-slate-50">{value}</p>
            <p className="text-slate-600 dark:text-slate-400">{label}</p>
        </div>
    </div>
);

const BadgeCard: React.FC<{ badge: Badge, earned: boolean }> = ({ badge, earned }) => {
    const BadgeIcon = badgeIconMap[badge.icon] || TrophyIcon;
    return (
        <div className={`p-6 rounded-2xl shadow-lg text-center transition-all duration-300 transform ${
            earned 
                ? 'bg-gradient-to-br from-amber-400 to-yellow-500 text-white border-2 border-amber-300 shadow-yellow-500/30' 
                : 'bg-white dark:bg-slate-800'
        }`}>
            <div className={`relative inline-block p-4 rounded-full mb-4 ${
                earned ? 'bg-white/20' : 'bg-gray-100 dark:bg-slate-700'
            }`}>
                <BadgeIcon className={`w-10 h-10 ${
                    earned ? 'text-white' : 'text-gray-400 dark:text-slate-500'
                }`} />
                {earned && (
                    <div className="absolute inset-0 rounded-full animate-ping-slow bg-white/30" style={{ animationDuration: '2s' }}></div>
                )}
            </div>
            <h3 className={`text-xl font-bold ${
                earned ? 'text-white' : 'text-slate-900 dark:text-slate-100'
            }`}>{badge.name}</h3>
            <p className={`mt-2 text-sm ${
                earned ? 'text-yellow-100' : 'text-slate-600 dark:text-slate-400'
            }`}>{badge.description}</p>
        </div>
    );
};

const QuizResultCard: React.FC<{ answer: StudentAnswer, quizName: string }> = ({ answer, quizName }) => {
    const percentage = Math.round((answer.score / answer.totalQuestions) * 100);
    let badgeVariant: 'success' | 'danger' | 'primary' = 'success';
    if (percentage < 60) badgeVariant = 'danger';
    else if (percentage < 85) badgeVariant = 'primary';

    return (
        <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl shadow-xl border border-slate-100 dark:border-slate-700/80 transition-all hover:shadow-premium-hover">
            <div className="flex items-start justify-between gap-2">
                <p className="font-bold text-slate-900 dark:text-slate-100 font-display">{quizName}</p>
                <UiBadge variant={badgeVariant} size="sm" dot>{percentage}%</UiBadge>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Realizado: {new Date(answer.timestamp).toLocaleDateString()}</p>
            <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-100 dark:border-slate-700/60 text-xs font-medium text-slate-600 dark:text-slate-300">
                <span>Puntuación obtenida</span>
                <strong className="text-slate-900 dark:text-slate-100">{answer.score} de {answer.totalQuestions} correctas</strong>
            </div>
        </div>
    );
};


export const StudentProgressPage: React.FC = () => {
    const { t } = useI18n();
    const { user } = useContext(AuthContext);
    const { watchedVideos } = useContext(StudentProgressContext);
    
    const { data: courses, isLoading: coursesLoading } = useQuery<CourseLevel[]>({ 
        queryKey: ['courses'], 
        queryFn: api.fetchCourses,
        enabled: !!user && !!user.id && !!auth.currentUser,
    });
    const { data: studentAnswers, isLoading: answersLoading } = useQuery<StudentAnswer[]>({
        queryKey: ['studentAnswers', user?.id],
        queryFn: () => api.fetchStudentAnswers(user!.id),
        enabled: !!user && !!user.id && !!auth.currentUser,
    });
    
    const enrolledCourses = useMemo(() => {
        if (!user || user.role !== 'student' || !courses) return [];
        const student = user as StudentUser;
        return courses.filter(c => student.enrolledCourseIds && student.enrolledCourseIds.includes(c.id));
    }, [user, courses]);

    const totalVideosInCourse = useMemo(() => {
        if (!enrolledCourses) return 0;
        return enrolledCourses.reduce((courseSum, course) => {
            return courseSum + (course.subjects || []).reduce((subjectSum, subject) => {
                const directVideos = subject.videos?.length || 0;
                const blockVideos = subject.blocks?.reduce((blockSum, block) => blockSum + (block.videos?.length || 0), 0) || 0;
                return subjectSum + directVideos + blockVideos;
            }, 0);
        }, 0);
    }, [enrolledCourses]);

    const overallProgress = totalVideosInCourse > 0 ? Math.round((watchedVideos.length / totalVideosInCourse) * 100) : 0;
    
    const averageQuizScore = useMemo(() => {
        if (!studentAnswers || studentAnswers.length === 0) return 0;
        const totalScore = studentAnswers.reduce((sum, ans) => sum + (ans.score / ans.totalQuestions), 0);
        return Math.round((totalScore / studentAnswers.length) * 100);
    }, [studentAnswers]);

    const allBadges = useMemo(() => {
        if (!user || !courses || !studentAnswers) return [];
        return badgesData.map(badge => ({
            ...badge,
            earned: badge.criteria(user as StudentUser, courses, studentAnswers)
        }));
    }, [user, courses, studentAnswers]);
    
    const earnedBadges = allBadges.filter(b => b.earned);
    const unearnedBadges = allBadges.filter(b => !b.earned);

    // Dynamic video ID map to display proper quiz names
    const videoMap = useMemo(() => {
        const map = new Map<string, string>();
        if (!enrolledCourses) return map;
        enrolledCourses.forEach(course => {
            (course.subjects || []).forEach(subject => {
                subject.videos?.forEach(video => {
                    map.set(video.id, video.title);
                });
                subject.blocks?.forEach(block => {
                    block.videos?.forEach(video => {
                        map.set(video.id, video.title);
                    });
                });
            });
        });
        return map;
    }, [enrolledCourses]);

    // Recomendaciones del Asesor IA de Alto Rendimiento
    const intelligentRecommendations = useMemo(() => {
        const recommendations = [];

        // 1. Recomendación por Quiz con bajo rendimiento (< 75%)
        if (studentAnswers && studentAnswers.length > 0) {
            const lowScores = studentAnswers
                .map(ans => ({ ...ans, scorePct: (ans.score / ans.totalQuestions) * 100 }))
                .filter(ans => ans.scorePct < 75)
                .sort((a, b) => a.scorePct - b.scorePct); // Del peor al mejor score

            if (lowScores.length > 0) {
                const targetedQuiz = lowScores[0];
                const videoTitle = videoMap.get(targetedQuiz.videoId) || `Vídeo ${targetedQuiz.videoId}`;
                recommendations.push({
                    type: 'quiz_review',
                    title: 'Repaso de Contenidos Clave',
                    description: `Has obtenido un ${Math.round(targetedQuiz.scorePct)}% en el quiz de "${videoTitle}". Te recomendamos volver a ver la clase explicativa antes de volver a evaluarte para asentar conocimientos esenciales.`,
                    benefit: 'Incrementar tu calificación media académica',
                    status: 'Revisión recomendada'
                });
            }
        }

        // 2. Recomendación de avance de plan según progreso por asignaturas
        if (enrolledCourses && enrolledCourses.length > 0) {
            let selectedSubjectName = "";
            let lowestProgPercent = 101;

            enrolledCourses.forEach(course => {
                (course.subjects || []).forEach(subject => {
                    const totalSubVideos = subject.videos?.length || 0;
                    const watchedSubVideos = subject.videos?.filter(v => watchedVideos.includes(v.id)).length || 0;
                    const progressVal = totalSubVideos > 0 ? Math.round((watchedSubVideos / totalSubVideos) * 100) : 0;

                    if (progressVal < lowestProgPercent && progressVal < 100) {
                        lowestProgPercent = progressVal;
                        selectedSubjectName = `${course.name} - ${subject.name}`;
                    }
                });
            });

            if (selectedSubjectName) {
                recommendations.push({
                    type: 'subject_progress',
                    title: 'Planificación e Impulso de Asignaturas',
                    description: `La asignatura de "${selectedSubjectName}" cuenta con un avance del ${lowestProgPercent}%. Dedicarle 20 minutos hoy a ver el siguiente contenido afianzará tu constancia semanal.`,
                    benefit: 'Finalizar a tiempo las asignaturas prioritarias',
                    status: 'Objetivo de estudio'
                });
            }
        }

        // 3. Recomendación por gamificación (Siguiente insignia a desbloquear)
        if (unearnedBadges && unearnedBadges.length > 0) {
            const nextBadge = unearnedBadges[0];
            recommendations.push({
                type: 'gamification',
                title: 'Próximo Logro Académico',
                description: `Estás muy cerca de conseguir la insignia especial "${nextBadge.name}". Para ganarla, necesitas: ${nextBadge.description.toLowerCase()}`,
                benefit: 'Incrementar tu colección de insignias de honor',
                status: 'Siguiente logro'
            });
        }

        return recommendations;
    }, [studentAnswers, enrolledCourses, watchedVideos, videoMap, unearnedBadges]);

    const [isExporting, setIsExporting] = useState(false);

    const handleExportPDF = () => {
        setIsExporting(true);
        try {
            const doc = new jsPDF({
                orientation: 'portrait',
                unit: 'mm',
                format: 'a4'
            });

            const pageWidth = doc.internal.pageSize.getWidth();
            const pageHeight = doc.internal.pageSize.getHeight();
            const margin = 20;
            const contentWidth = pageWidth - (margin * 2);
            let currentY = 15;

            const writeText = (text: string, x: number, y: number, size: number, style: 'normal' | 'bold' | 'italic' = 'normal', color: [number, number, number] = [30, 41, 59], align: 'left' | 'center' | 'right' = 'left') => {
                doc.setFont('helvetica', style);
                doc.setFontSize(size);
                doc.setTextColor(color[0], color[1], color[2]);
                doc.text(text, x, y, { align });
            };

            const writeWrappedText = (text: string, x: number, y: number, maxWidth: number, size: number, style: 'normal' | 'bold' | 'italic' = 'normal', color: [number, number, number] = [30, 41, 59]): number => {
                doc.setFont('helvetica', style);
                doc.setFontSize(size);
                doc.setTextColor(color[0], color[1], color[2]);
                const lines = doc.splitTextToSize(text, maxWidth);
                doc.text(lines, x, y);
                return lines.length * (size * 0.35 + 1.5);
            };

            const checkPageOverflow = (neededHeight: number) => {
                if (currentY + neededHeight > pageHeight - 20) {
                    doc.addPage();
                    currentY = 20;
                    doc.setFillColor(79, 70, 229);
                    doc.rect(0, 0, pageWidth, 10, 'F');
                    writeText('AULA INFINITY - EXPEDIENTE ACADÉMICO', margin, 7, 8, 'bold', [255, 255, 255]);
                    writeText(`Estudiante: ${user?.name}`, pageWidth - margin, 7, 8, 'normal', [255, 255, 255], 'right');
                    currentY = 25;
                }
            };

            // Header Banner
            doc.setFillColor(79, 70, 229);
            doc.rect(0, 0, pageWidth, 42, 'F');

            writeText('AULA INFINITY', margin, 18, 24, 'bold', [255, 255, 255]);
            writeText('Plataforma Virtual de Aprendizaje de Alto Rendimiento', margin, 24, 11, 'normal', [255, 255, 255]);
            
            const localDate = new Date().toLocaleDateString('es-ES', {
                year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit'
            });
            writeText(`Expediente emitido el: ${localDate}`, pageWidth - margin, 18, 9, 'normal', [199, 210, 254], 'right');
            writeText('RESUMEN DE PROGRESO DE ESTUDIANTE', pageWidth - margin, 24, 11, 'bold', [255, 255, 255], 'right');

            currentY = 55;

            // Student profile section
            doc.setDrawColor(226, 232, 240);
            doc.setFillColor(248, 250, 252);
            doc.rect(margin, currentY, contentWidth, 32, 'FD');

            writeText('DATOS DEL ALUMNO', margin + 6, currentY + 8, 10, 'bold', [79, 70, 229]);
            writeText(`Nombre: ${user?.name}`, margin + 6, currentY + 16, 11, 'bold', [15, 23, 42]);
            writeText(`Email: ${user?.email}`, margin + 6, currentY + 23, 10, 'normal', [71, 85, 105]);

            const coursesNames = enrolledCourses.map(c => c.name).join(', ') || 'Sin cursos matriculados';
            writeText('PROGRAMAS DE ESTUDIO', margin + 100, currentY + 8, 10, 'bold', [79, 70, 229]);
            writeText('Cursos activos:', margin + 100, currentY + 16, 9, 'normal', [100, 116, 139]);
            writeWrappedText(coursesNames, margin + 100, currentY + 22, contentWidth - 106, 10, 'bold', [15, 23, 42]);

            currentY += 45;

            // Core KPI Grid
            checkPageOverflow(30);
            const kpiWidth = (contentWidth - 9) / 4;
            const kpis = [
                { val: `${overallProgress}%`, tag: 'Progreso Curso', color: [79, 70, 229] },
                { val: `${watchedVideos.length} / ${totalVideosInCourse}`, tag: 'Vídeos Vistos', color: [14, 165, 233] },
                { val: `${averageQuizScore}%`, tag: 'Nota Media Quizzes', color: [34, 197, 94] },
                { val: `${earnedBadges.length} / ${allBadges.length}`, tag: 'Insignias', color: [245, 158, 11] },
            ];

            kpis.forEach((kpi, idx) => {
                const kpiX = margin + (idx * (kpiWidth + 3));
                doc.setFillColor(248, 250, 252);
                doc.setDrawColor(226, 232, 240);
                doc.rect(kpiX, currentY, kpiWidth, 24, 'FD');

                doc.setFillColor(kpi.color[0], kpi.color[1], kpi.color[2]);
                doc.rect(kpiX, currentY, kpiWidth, 1.5, 'F');

                writeText(kpi.val, kpiX + (kpiWidth / 2), currentY + 11, 14, 'bold', [15, 23, 42], 'center');
                writeText(kpi.tag, kpiX + (kpiWidth / 2), currentY + 18, 8, 'normal', [71, 85, 105], 'center');
            });

            currentY += 35;

            // Videos and Subjects progress
            checkPageOverflow(40);
            writeText('PROGRESO POR ASIGNATURA Y VÍDEOS', margin, currentY, 14, 'bold', [79, 70, 229]);
            currentY += 6;
            doc.setDrawColor(79, 70, 229);
            doc.setLineWidth(0.5);
            doc.line(margin, currentY, pageWidth - margin, currentY);
            currentY += 6;

            if (enrolledCourses.length === 0) {
                writeText('El alumno no tiene progreso registrado en ninguna asignatura.', margin, currentY, 10, 'italic', [100, 116, 139]);
                currentY += 10;
            } else {
                enrolledCourses.forEach(course => {
                    checkPageOverflow(15);
                    writeText(`Curso: ${course.name}`, margin, currentY, 11, 'bold', [15, 23, 42]);
                    currentY += 6;

                    (course.subjects || []).forEach(subject => {
                        let totalSubjectVideos = subject.videos?.length || 0;
                        let watchedSubjectVideosObj = subject.videos?.filter(v => watchedVideos.includes(v.id)) || [];
                        let watchedSubjectVideos = watchedSubjectVideosObj.length;

                        const blockVideos = subject.blocks?.flatMap(b => b.videos || []) || [];
                        totalSubjectVideos += blockVideos.length;
                        const watchedBlockVideos = blockVideos.filter(v => watchedVideos.includes(v.id)).length;
                        watchedSubjectVideos += watchedBlockVideos;

                        const subjectPercent = totalSubjectVideos > 0 ? Math.round((watchedSubjectVideos / totalSubjectVideos) * 100) : 0;

                        checkPageOverflow(20);
                        doc.setFillColor(252, 251, 255);
                        doc.setDrawColor(238, 235, 254);
                        doc.rect(margin, currentY, contentWidth, 12, 'FD');

                        writeText(subject.name, margin + 4, currentY + 8, 9, 'bold', [15, 23, 42]);
                        
                        const barWidth = 40;
                        const barX = pageWidth - margin - barWidth - 32;
                        doc.setFillColor(226, 232, 240);
                        doc.rect(barX, currentY + 4.5, barWidth, 3, 'F');
                        doc.setFillColor(79, 70, 229);
                        doc.rect(barX, currentY + 4.5, (subjectPercent / 100) * barWidth, 3, 'F');

                        writeText(`${subjectPercent}%`, barX + barWidth + 4, currentY + 7.5, 9, 'bold', [79, 70, 229]);
                        writeText(`(${watchedSubjectVideos}/${totalSubjectVideos} vistos)`, barX - 18, currentY + 7.5, 8, 'normal', [100, 116, 139], 'right');

                        currentY += 16;
                    });
                });
            }

            // Quizzes Section
            currentY += 4;
            checkPageOverflow(40);
            writeText('DESEMPEÑO EN EVALUACIONES Y QUIZZES', margin, currentY, 14, 'bold', [79, 70, 229]);
            currentY += 6;
            doc.setDrawColor(79, 70, 229);
            doc.setLineWidth(0.5);
            doc.line(margin, currentY, pageWidth - margin, currentY);
            currentY += 6;

            if (!studentAnswers || studentAnswers.length === 0) {
                writeText('El estudiante no ha completado ninguna evaluación interactiva todavía.', margin, currentY, 10, 'italic', [100, 116, 139]);
                currentY += 12;
            } else {
                doc.setFillColor(241, 245, 249);
                doc.rect(margin, currentY, contentWidth, 8, 'F');
                writeText('Evaluación / Vídeo', margin + 4, currentY + 5.5, 8.5, 'bold', [71, 85, 105]);
                writeText('Fecha', margin + 95, currentY + 5.5, 8.5, 'bold', [71, 85, 105]);
                writeText('Aciertos', margin + 130, currentY + 5.5, 8.5, 'bold', [71, 85, 105], 'right');
                writeText('Calificación', pageWidth - margin - 4, currentY + 5.5, 8.5, 'bold', [71, 85, 105], 'right');
                
                currentY += 10;

                studentAnswers.forEach((ans, idx) => {
                    checkPageOverflow(12);

                    const titleText = videoMap.get(ans.videoId) || `Quiz del vídeo ${ans.videoId}`;
                    const scoreText = `${ans.score} / ${ans.totalQuestions}`;
                    const percentText = `${Math.round((ans.score / ans.totalQuestions) * 100)}%`;
                    const dateText = new Date(ans.timestamp).toLocaleDateString('es-ES');

                    if (idx % 2 === 1) {
                        doc.setFillColor(248, 250, 252);
                        doc.rect(margin, currentY - 2, contentWidth, 8, 'F');
                    }

                    writeWrappedText(titleText, margin + 4, currentY + 3.5, 85, 8.5, 'normal', [15, 23, 42]);
                    writeText(dateText, margin + 95, currentY + 3.5, 8.5, 'normal', [71, 85, 105]);
                    writeText(scoreText, margin + 130, currentY + 3.5, 8.5, 'normal', [71, 85, 105], 'right');
                    
                    const percentNum = (ans.score / ans.totalQuestions) * 100;
                    const percentColor: [number, number, number] = percentNum >= 80 ? [22, 101, 52] : percentNum >= 50 ? [217, 119, 6] : [185, 28, 28];
                    writeText(percentText, pageWidth - margin - 4, currentY + 3.5, 9, 'bold', percentColor, 'right');

                    currentY += 8;
                });
            }

            // Badges Section
            currentY += 6;
            checkPageOverflow(40);
            writeText('INSIGNIAS Y LOGROS OBTENIDOS', margin, currentY, 14, 'bold', [245, 158, 11]);
            currentY += 6;
            doc.setDrawColor(245, 158, 11);
            doc.setLineWidth(0.5);
            doc.line(margin, currentY, pageWidth - margin, currentY);
            currentY += 6;

            if (earnedBadges.length === 0) {
                writeText('¡Sigue estudiando para desbloquear insignias y reconocimientos de excelencia!', margin, currentY, 10, 'italic', [100, 116, 139]);
                currentY += 12;
            } else {
                earnedBadges.forEach(badge => {
                    checkPageOverflow(18);

                    doc.setFillColor(254, 253, 247);
                    doc.setDrawColor(253, 230, 138);
                    doc.rect(margin, currentY, contentWidth, 14, 'FD');

                    doc.setFillColor(245, 158, 11);
                    doc.rect(margin, currentY, 1.5, 14, 'F');

                    writeText(`⭐  ${badge.name}`, margin + 5, currentY + 5.5, 9.5, 'bold', [180, 83, 9]);
                    writeText(badge.description, margin + 5, currentY + 11, 8.5, 'italic', [120, 53, 4]);

                    currentY += 18;
                });
            }

            // Footer
            checkPageOverflow(40);
            currentY = Math.max(currentY + 10, pageHeight - 45);
            
            doc.setDrawColor(226, 232, 240);
            doc.setLineWidth(0.5);
            doc.line(margin, currentY, pageWidth - margin, currentY);
            
            // Dibujar sutil sello holográfico digital oficial
            const sealX = pageWidth - margin - 15;
            const sealY = currentY + 12;
            doc.setDrawColor(79, 70, 229); // color indigo
            doc.setFillColor(248, 250, 252);
            doc.setLineWidth(0.4);
            doc.circle(sealX, sealY, 11, 'FD'); // círculo exterior
            doc.setDrawColor(245, 158, 11); // color dorado
            doc.setLineWidth(0.35);
            doc.circle(sealX, sealY, 9, 'D'); // círculo interior dorado
            
            // Icono central del Sello Símbolo
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(10);
            doc.setTextColor(217, 119, 6);
            doc.text('★', sealX, sealY + 3.2, { align: 'center' });
            
            // Textos descriptivos de certificación oficial
            writeText('Firmado Digitalmente por la Dirección de Estudios', margin, currentY + 6, 8, 'bold', [71, 85, 105]);
            writeText('Consejo Académico de Aula Infinity', margin, currentY + 10, 7.5, 'normal', [100, 116, 139]);
            writeText('Sello Verificador Oficial AulaInfinity', pageWidth - margin - 30, currentY + 6, 8, 'italic', [100, 116, 139], 'right');
            writeText('Este es un reporte académico oficial con certificación en blockchain simulada para protección y validez institucional.', margin, currentY + 15, 7, 'normal', [148, 163, 184]);

            const sanitizedStudentName = user?.name ? user.name.toLowerCase().replace(/\s+/g, '_') : 'estudiante';
            doc.save(`expediente_academico_${sanitizedStudentName}.pdf`);
        } catch (err) {
            console.error('Error generating/exporting academic PDF report:', err);
        } finally {
            setIsExporting(false);
        }
    };

    if (coursesLoading || answersLoading) {
        return <div>{t('progress.loadingProgress')}</div>
    }

    if (!user || user.role !== 'student') {
        return <div>{t('progress.errorLoading')}</div>
    }

    return (
        <div className="space-y-12 animate-slide-in-up">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-5">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-50">{t('progress.title')}</h1>
                    <p className="text-lg text-slate-600 dark:text-slate-400">{t('progress.subtitle')}</p>
                </div>
                <button
                    onClick={handleExportPDF}
                    disabled={isExporting}
                    className="inline-flex items-center justify-center px-4 py-2.5 bg-primary hover:bg-primary/90 text-white dark:text-slate-950 font-semibold rounded-lg shadow-sm hover:shadow transition-all duration-200 select-none cursor-pointer text-sm gap-2 self-start sm:self-center disabled:opacity-50 disabled:cursor-not-allowed"
                    aria-label={t('progress.exportPdf')}
                >
                    <FileDown className="w-4 h-4" />
                    {isExporting ? t('progress.generatingPdf') : t('progress.exportPdf')}
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCard icon={<ChartBarIcon className="w-8 h-8 text-indigo-500"/>} label={t('progress.courseProgress')} value={`${overallProgress}%`} />
                <StatCard icon={<VideoCameraIcon className="w-8 h-8 text-blue-500"/>} label={t('progress.videosWatched')} value={watchedVideos.length} />
                <StatCard icon={<CheckCircleIcon className="w-8 h-8 text-green-500"/>} label={t('progress.quizAvg')} value={`${averageQuizScore}%`} />
                <StatCard icon={<TrophyIcon className="w-8 h-8 text-yellow-500"/>} label={t('progress.badgesEarned')} value={earnedBadges.length} />
            </div>

            {/* Asesor de Rendimiento Inteligente IA */}
            <div className="bg-gradient-to-br from-indigo-50 to-violet-50 dark:from-slate-800/40 dark:to-slate-900/60 p-6 sm:p-8 rounded-2xl border border-indigo-100/60 dark:border-indigo-950/40 shadow-sm">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-indigo-600 dark:bg-indigo-500 rounded-xl text-white shadow-md shadow-indigo-500/10">
                            <LightBulbIcon className="w-6 h-6" />
                        </div>
                        <div>
                            <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-50 flex items-center gap-2">
                                {t('progress.aiAdvisorTitle')}
                            </h2>
                            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400">{t('progress.aiAdvisorDesc')}</p>
                        </div>
                    </div>
                    <span className="self-start sm:self-center bg-indigo-100/80 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 font-bold text-xs uppercase px-3 py-1.5 rounded-full tracking-wider border border-indigo-200/50 dark:border-indigo-900/40 select-none">
                        {t('progress.realTimeAnalysis')}
                    </span>
                </div>

                {intelligentRecommendations.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {intelligentRecommendations.map((rec, index) => (
                            <div 
                                key={rec.type + index}
                                className="bg-white dark:bg-slate-800 p-5 rounded-xl border border-slate-100 dark:border-slate-700/50 shadow-sm hover:shadow transition-shadow flex flex-col justify-between group"
                            >
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between">
                                        <span className={`text-[10px] font-extrabold uppercase tracking-wider px-2.5 py-1 rounded-md border ${
                                            rec.type === 'quiz_review'
                                                ? 'bg-red-50 text-red-600 border-red-105 dark:bg-red-955/20 dark:text-red-400 dark:border-red-900/30' 
                                                : rec.type === 'subject_progress'
                                                ? 'bg-blue-50 text-blue-600 border-blue-105 dark:bg-blue-955/20 dark:text-blue-400 dark:border-blue-900/30'
                                                : 'bg-amber-50 text-amber-600 border-amber-105 dark:bg-amber-955/20 dark:text-amber-400 dark:border-amber-900/30'
                                        }`}>
                                            {rec.status}
                                        </span>
                                        <span className="text-xs text-slate-400 dark:text-slate-500 font-mono">Recomendación #{index+1}</span>
                                    </div>
                                    <h4 className="font-bold text-slate-900 dark:text-slate-50 text-base group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                                        {rec.title}
                                    </h4>
                                    <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                                        {rec.description}
                                    </p>
                                </div>
                                <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-700/50 text-xs text-indigo-600 dark:text-indigo-400 font-medium flex items-center gap-1.5">
                                    <span className="text-slate-400 font-normal">Objetivo:</span> {rec.benefit}
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="bg-white dark:bg-slate-800 p-6 rounded-xl border text-center text-slate-600 dark:text-slate-400">
                        ✨ ¡Sobresaliente! Has completado con éxito todo tu itinerario académico y mantienes un promedio de quizzes inmaculado. ¡Sigue así!
                    </div>
                )}
            </div>

            <div>
                <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-50 mb-4">{t('progress.unlockedBadges')}</h2>
                {earnedBadges.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {earnedBadges.map(badge => (
                            <BadgeCard key={badge.id} badge={badge} earned={true} />
                        ))}
                    </div>
                ) : (
                    <div className="text-center py-12 bg-white dark:bg-slate-800 rounded-xl border dark:border-slate-700">
                        <p className="text-slate-600 dark:text-slate-400">{t('progress.noBadges')}</p>
                    </div>
                )}
            </div>
            
            <div>
                <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-50 mb-4">{t('progress.nextChallenges')}</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {unearnedBadges.map(badge => (
                        <BadgeCard key={badge.id} badge={badge} earned={false} />
                    ))}
                </div>
            </div>

            <div>
                <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-50 mb-4">{t('progress.quizResults')}</h2>
                 {studentAnswers && studentAnswers.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {studentAnswers.map(answer => {
                            const videoTitle = videoMap.get(answer.videoId);
                            const quizName = videoTitle ? `Quiz: ${videoTitle}` : `Quiz del vídeo ${answer.videoId}`;
                            return <QuizResultCard key={answer.quizId + answer.timestamp} answer={answer} quizName={quizName} />
                        })}
                    </div>
                ) : (
                    <div className="text-center py-12 bg-white dark:bg-slate-800 rounded-xl border dark:border-slate-700">
                        <EmptyState 
                            icon={<QuestionMarkCircleIcon />}
                            title={t('progress.noQuizzesTitle')}
                            description={t('progress.noQuizzesDesc')}
                            size="small"
                        />
                    </div>
                )}
            </div>
        </div>
    );
};