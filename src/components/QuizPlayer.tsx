import React, { useState, useMemo, useContext, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { auth } from '../services/firebase';
import { motion } from 'motion/react';
import * as api from '../services/api';
import type { Quiz, Question, StudentAnswer } from '../types';
import { Spinner } from './ui/Spinner';
import { Button } from './ui/Button';
import { QuizDiagram } from './QuizDiagram';
import { QuestionMarkCircleIcon, CheckCircleIcon, XCircleIcon, TrophyIcon, SparklesIcon, CloseIcon } from './icons';
import { AuthContext } from '../contexts/AuthContext';
import { marked } from 'marked';

type QuizState = 'start' | 'playing' | 'results';
type AnswerState = {
    selectedOption: number | null;
    isCorrect: boolean | null;
};

const MarkdownContent: React.FC<{ content: string }> = React.memo(({ content }) => {
    const processedContent = useMemo(() => {
        let text = content;
        
        // Block math formulas ($...$$)
        text = text.replace(/\$\$\s*([\s\S]*?)\s*\$\$/g, (_, equation) => {
            return `<div class="math-block my-3 p-3.5 border-l-4 border-indigo-600 dark:border-indigo-500 bg-slate-100/80 dark:bg-slate-950/40 rounded-r-xl font-serif italic text-center text-base tracking-wide shadow-sm select-all text-slate-800 dark:text-slate-100 leading-relaxed font-semibold">${equation}</div>`;
        });
        
        // Inline math formulas ($...$)
        text = text.replace(/(?<!\$)\$\s*([^$\n]+?)\s*\$(?!\$)/g, (_, inlineEquation) => {
            return `<span class="math-inline font-serif italic font-semibold text-sm bg-slate-100/90 dark:bg-slate-900/50 px-1.5 py-0.5 rounded text-indigo-600 dark:text-indigo-400 select-all mx-0.5">${inlineEquation}</span>`;
        });
        
        return text;
    }, [content]);

    const html = useMemo(() => {
        return marked.parse(processedContent, { gfm: true, breaks: true }) as any;
    }, [processedContent]);

    return (
        <div 
            className="prose dark:prose-invert max-w-none prose-p:my-2 prose-ul:my-2 prose-ol:my-2 text-sm text-slate-700 dark:text-slate-350" 
            dangerouslySetInnerHTML={{ __html: html }} 
        />
    );
});

const InlineMarkdown: React.FC<{ content: string }> = React.memo(({ content }) => {
    const processedContent = useMemo(() => {
        let text = content;
        text = text.replace(/\$\$\s*([\s\S]*?)\s*\$\$/g, (_, equation) => {
            return ` <span class="font-serif italic text-indigo-605 dark:text-indigo-400 font-semibold select-all">${equation}</span> `;
        });
        text = text.replace(/(?<!\$)\$\s*([^$\n]+?)\s*\$(?!\$)/g, (_, inlineEquation) => {
            return `<span class="math-inline font-serif italic font-semibold text-sm bg-indigo-50/50 dark:bg-indigo-950/25 px-1.5 py-0.5 rounded text-indigo-650 dark:text-indigo-300 select-all mx-0.5">${inlineEquation}</span>`;
        });
        return text;
    }, [content]);

    const html = useMemo(() => {
        return marked.parseInline(processedContent) as any;
    }, [processedContent]);

    return <span dangerouslySetInnerHTML={{ __html: html }} />;
});

const ReinforcementPlanModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    planText: string | null;
    isLoading: boolean;
}> = ({ isOpen, onClose, planText, isLoading }) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-2xl flex flex-col" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center p-6 border-b dark:border-slate-700">
                    <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 flex items-center"><SparklesIcon className="w-6 h-6 mr-2 text-primary"/>Plan de Refuerzo con IA</h2>
                    <button onClick={onClose} className="p-1 rounded-full hover:bg-gray-200 dark:hover:bg-slate-700">
                        <CloseIcon className="w-6 h-6" />
                    </button>
                </div>
                <div className="p-6 overflow-y-auto max-h-[60vh] min-h-[20rem] flex items-center justify-center">
                    {isLoading ? (
                        <div className="text-center">
                            <Spinner className="w-10 h-10 mx-auto text-primary" />
                            <p className="mt-4 text-slate-600 dark:text-slate-300">La IA está creando tu plan...</p>
                        </div>
                    ) : (
                        planText && <MarkdownContent content={planText} />
                    )}
                </div>
                 <div className="flex justify-end p-4 bg-gray-50 dark:bg-slate-800/50 rounded-b-xl">
                    <Button variant="secondary" onClick={onClose}>Cerrar</Button>
                </div>
            </div>
        </div>
    );
};

export const QuizPlayer: React.FC<{ videoId: string }> = ({ videoId }) => {
    const { user } = useContext(AuthContext);
    const { data: quiz, isLoading, isError } = useQuery<Quiz | null>({
        queryKey: ['quiz', videoId],
        queryFn: () => api.fetchQuizByVideoId(videoId),
    });

    const [quizState, setQuizState] = useState<QuizState>('start');
    const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
    const [answers, setAnswers] = useState<AnswerState[]>([]);
    const [isSubmitted, setIsSubmitted] = useState(false);
    const [latestAnswer, setLatestAnswer] = useState<StudentAnswer | null>(null);
    const [isPlanModalOpen, setIsPlanModalOpen] = useState(false);
    const [planText, setPlanText] = useState<string | null>(null);
    const [showConfetti, setShowConfetti] = useState(false);
    const [mode, setMode] = useState<'practice' | 'exam'>('practice');
    const [isQuestionChecked, setIsQuestionChecked] = useState(false);
    const [shouldBounce, setShouldBounce] = useState(false);

    const { data: pastAnswers, refetch: refetchAnswers } = useQuery<StudentAnswer[]>({
        queryKey: ['studentAnswers', user?.id],
        queryFn: () => user ? api.fetchStudentAnswers(user.id) : Promise.resolve([]),
        enabled: !!user && !!user.id && user.id === auth?.currentUser?.uid,
    });

    const quizAttempts = useMemo(() => {
        if (!pastAnswers || !quiz) return [];
        return pastAnswers
            .filter(ans => ans.quizId === quiz.id || ans.videoId === videoId)
            .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    }, [pastAnswers, quiz, videoId]);

    const confettiParticles = useMemo(() => {
        const colors = [
            'bg-red-500', 'bg-blue-500', 'bg-yellow-500', 'bg-green-500', 
            'bg-pink-500', 'bg-purple-500', 'bg-amber-500', 'bg-indigo-500'
        ];
        return Array.from({ length: 65 }).map((_, i) => ({
            id: i,
            x: Math.random() * 100,
            delay: Math.random() * 2,
            duration: 2 + Math.random() * 2.5,
            color: colors[Math.floor(Math.random() * colors.length)]
        }));
    }, []);

    const totalQuestions = quiz?.questions.length ?? 0;
    const score = useMemo(() => answers.filter(a => a.isCorrect).length, [answers]);
    
    const submitAnswerMutation = useMutation({
        mutationFn: (answerData: Omit<StudentAnswer, 'timestamp'>) => api.submitStudentAnswer(answerData),
        onSuccess: () => {
            console.log("Quiz results saved successfully.");
            refetchAnswers();
        },
        onError: (error) => {
            console.error("Failed to save quiz results:", error);
        }
    });

    useEffect(() => {
        if (quizState === 'results' && !isSubmitted && user && user.role === 'student' && quiz) {
            setIsSubmitted(true); // Prevent re-submission for the same attempt
            const answerPayload: { [questionId: string]: number } = {};
            quiz.questions.forEach((q, index) => {
                const answer = answers[index];
                if (answer?.selectedOption !== null && answer?.selectedOption !== undefined) {
                    answerPayload[q.id] = answer.selectedOption;
                }
            });

            const fullAnswerData: Omit<StudentAnswer, 'timestamp'> = {
                studentId: user.id,
                videoId: videoId,
                quizId: quiz.id,
                answers: answerPayload,
                score: score,
                totalQuestions: totalQuestions,
            };
            
            setLatestAnswer({ ...fullAnswerData, timestamp: new Date().toISOString() });
            submitAnswerMutation.mutate(fullAnswerData);

            // Trigger Perfect Confetti celebration if they got 100%!
            if (score === totalQuestions && totalQuestions > 0) {
                setShowConfetti(true);
                const timer = setTimeout(() => {
                    setShowConfetti(false);
                }, 8500);
                return () => clearTimeout(timer);
            }
        } else if (quizState !== 'results') {
            setShowConfetti(false);
        }
    }, [quizState, isSubmitted, user, quiz, answers, score, totalQuestions, videoId, submitAnswerMutation]);
    
    const reinforcementPlanMutation = useMutation({
        mutationFn: () => {
            if (!latestAnswer) throw new Error("No hay respuestas para generar un plan.");
            return api.generateReinforcementPlanWithAI(videoId, quiz!.id, latestAnswer);
        },
        onSuccess: (data) => {
            setPlanText(data);
        },
        onError: (error) => {
            setPlanText(`Error al generar el plan: ${error.message}`);
        }
    });

    const handleGeneratePlan = () => {
        setIsPlanModalOpen(true);
        reinforcementPlanMutation.mutate();
    };

    const resetQuiz = () => {
        setQuizState('playing');
        setCurrentQuestionIndex(0);
        setAnswers(Array(totalQuestions).fill({ selectedOption: null, isCorrect: null }));
        setIsSubmitted(false);
        setLatestAnswer(null);
        setIsQuestionChecked(false);
    };

    const handleSelectOption = (optionIndex: number) => {
        if (mode === 'practice' && isQuestionChecked) return; // Don't allow changing answer after check
        
        const currentQuestion = quiz!.questions[currentQuestionIndex];
        const isCorrect = optionIndex === (currentQuestion.correctAnswerIndex - 1);

        setAnswers(prev => {
            const newAnswers = [...prev];
            newAnswers[currentQuestionIndex] = { selectedOption: optionIndex, isCorrect };
            return newAnswers;
        });

        // If selecting a correct option (e.g. in exam mode or interactive click), trigger premium bounce feedback
        if (isCorrect) {
            setShouldBounce(true);
            setTimeout(() => setShouldBounce(false), 700);
        }
    };
    
    const handleCheckAnswer = () => {
        const currentQuestion = quiz!.questions[currentQuestionIndex];
        const selectedAnswer = answers[currentQuestionIndex]?.selectedOption;
        
        if (selectedAnswer === null || selectedAnswer === undefined) return;
        
        const isCorrect = selectedAnswer === (currentQuestion.correctAnswerIndex - 1);
        setAnswers(prev => {
            const newAnswers = [...prev];
            newAnswers[currentQuestionIndex] = { ...newAnswers[currentQuestionIndex], isCorrect };
            return newAnswers;
        });
        setIsQuestionChecked(true);

        // If check validates as correct, trigger elastic bounce feedback
        if (isCorrect) {
            setShouldBounce(true);
            setTimeout(() => setShouldBounce(false), 700);
        }
    };
    
    const handleNextQuestion = () => {
        if (currentQuestionIndex < totalQuestions - 1) {
            setCurrentQuestionIndex(prev => prev + 1);
            setIsQuestionChecked(false);
        } else {
            setQuizState('results');
        }
    };
    
    if (isLoading) return <div className="p-4 text-center">Cargando quiz...</div>;
    if (isError) return <div className="p-4 text-center text-red-500">Error al cargar el quiz.</div>;
    if (!quiz || totalQuestions === 0) return null; // No quiz for this video

    const currentQuestion = quiz.questions[currentQuestionIndex];
    const currentAnswerState = answers[currentQuestionIndex];
    const isAnswerChecked = mode === 'practice' && isQuestionChecked;

    // --- RENDER STATES ---

    if (quizState === 'start') {
        return (
            <div className="bg-white dark:bg-slate-800 p-8 rounded-xl shadow-lg text-center">
                <QuestionMarkCircleIcon className="w-16 h-16 mx-auto text-primary" />
                <h3 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-4">Pon a prueba lo aprendido</h3>
                <p className="text-slate-600 dark:text-slate-400 mt-2">Responde {totalQuestions} preguntas para afianzar tus conocimientos.</p>

                {/* Selección Dinámica de Modo de Práctica o Examen */}
                <div className="mt-6 max-w-md mx-auto border dark:border-slate-700/80 rounded-xl p-4 bg-slate-50 dark:bg-slate-900/40 text-left">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 block mb-3">Modo de Evaluación</span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <button
                            onClick={() => setMode('practice')}
                            className={`flex flex-col p-3 rounded-lg border-2 text-left transition-all outline-none select-none cursor-pointer ${
                                mode === 'practice'
                                    ? 'border-primary bg-primary/5 text-slate-900 dark:text-slate-100'
                                    : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-600 text-slate-600 dark:text-slate-400'
                            }`}
                        >
                            <span className="font-bold text-sm flex items-center gap-1.5">
                                📖 Modo Práctica
                            </span>
                            <span className="text-[11px] leading-snug text-slate-500 dark:text-slate-400 mt-1">
                                Feedback inmediato con explicaciones detalladas y animaciones de progreso pregunta a pregunta.
                            </span>
                        </button>
                        <button
                            onClick={() => setMode('exam')}
                            className={`flex flex-col p-3 rounded-lg border-2 text-left transition-all outline-none select-none cursor-pointer ${
                                mode === 'exam'
                                    ? 'border-primary bg-primary/5 text-slate-900 dark:text-slate-100'
                                    : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-600 text-slate-600 dark:text-slate-400'
                            }`}
                        >
                            <span className="font-bold text-sm flex items-center gap-1.5">
                                📝 Modo Examen
                            </span>
                            <span className="text-[11px] leading-snug text-slate-500 dark:text-slate-400 mt-1">
                                Simulación real sin spoilers. Comprueba tus aciertos, errores y explicaciones al final del quiz.
                            </span>
                        </button>
                    </div>
                </div>

                <Button onClick={resetQuiz} className="mt-6">Empezar Quiz</Button>

                {/* Historial de Intentos Detallado */}
                {quizAttempts.length > 0 && (
                    <div id="quiz-history-section" className="mt-8 border-t dark:border-slate-700 pt-6 text-left">
                        <h4 className="font-bold text-slate-900 dark:text-slate-100 mb-4 flex items-center gap-2 text-base">
                            <span>📊</span> Historial de Intentos de Práctica ({quizAttempts.length})
                        </h4>
                        <div className="space-y-2.5 max-h-[220px] overflow-y-auto pr-2">
                            {quizAttempts.map((attempt, index) => {
                                const attemptDate = new Date(attempt.timestamp);
                                const isPerfect = attempt.score === attempt.totalQuestions;
                                const scorePercent = Math.round((attempt.score / attempt.totalQuestions) * 100);
                                
                                return (
                                    <div 
                                        key={index}
                                        id={`quiz-attempt-row-${index}`}
                                        className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 bg-slate-50 dark:bg-slate-900/40 rounded-lg text-sm border dark:border-slate-700/80 gap-2"
                                    >
                                        <div className="flex flex-col">
                                            <div className="flex items-center gap-2">
                                                <span className="font-semibold text-slate-800 dark:text-slate-200">
                                                    Intento #{quizAttempts.length - index}
                                                </span>
                                                {isPerfect && (
                                                    <span className="bg-green-150 text-green-700 dark:bg-green-950/50 dark:text-green-400 text-[10px] font-extrabold px-1.5 py-0.5 rounded uppercase tracking-wider">
                                                        Perfecto 🌟
                                                    </span>
                                                )}
                                            </div>
                                            <span className="text-xs text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-1">
                                                <span>🕒</span> {attemptDate.toLocaleDateString('es-ES')} {attemptDate.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <span className={`inline-block px-3 py-1 rounded-full font-bold text-xs ${
                                                isPerfect 
                                                    ? 'bg-green-100 text-green-800 dark:bg-green-950/40 dark:text-green-400' 
                                                    : scorePercent >= 75 
                                                        ? 'bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-400' 
                                                        : 'bg-amber-100 text-amber-800 dark:bg-amber-955/40 dark:text-amber-400'
                                            }`}>
                                                Nota: {attempt.score} / {attempt.totalQuestions} ({scorePercent}%)
                                            </span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>
        );
    }
    
    if (quizState === 'results') {
        const percentage = Math.round((score / totalQuestions) * 100);
        const needsReinforcement = percentage < 75 && latestAnswer;
        const isPerfect = score === totalQuestions;

        return (
            <div className="bg-white dark:bg-slate-800 p-8 rounded-xl shadow-lg text-center relative overflow-hidden">
                {/* Visual Perfect Confetti Celebration Cascades */}
                {showConfetti && (
                    <div id="confetti-container" className="absolute inset-0 pointer-events-none overflow-hidden z-10">
                        {confettiParticles.map((p) => (
                            <motion.div
                                key={p.id}
                                initial={{ y: -30, x: `${p.x}%`, scale: Math.random() * 0.4 + 0.6, rotate: 0 }}
                                animate={{ 
                                    y: 450, 
                                    rotate: 360 * 2.5,
                                    x: `${p.x + (Math.sin(p.id) * 14)}%` 
                                }}
                                transition={{ 
                                    duration: p.duration, 
                                    delay: p.delay, 
                                    ease: "easeOut",
                                    repeat: 1
                                }}
                                className={`absolute w-3 h-3 rounded-sm ${p.color}`}
                            />
                        ))}
                    </div>
                )}

                {isPerfect ? (
                    <motion.div
                        initial={{ scale: 0.3, rotate: -15, opacity: 0 }}
                        animate={{ scale: 1, rotate: 0, opacity: 1 }}
                        transition={{ type: "spring", stiffness: 200, damping: 12 }}
                    >
                        <TrophyIcon className="w-24 h-24 mx-auto text-yellow-500 filter drop-shadow-md animate-bounce" />
                    </motion.div>
                ) : (
                    <TrophyIcon className="w-20 h-20 mx-auto text-yellow-500" />
                )}

                {isPerfect ? (
                    <h3 className="text-3xl font-extrabold text-green-600 dark:text-green-400 mt-4 flex items-center justify-center gap-2">
                        <span>🎉 ¡PUNTUACIÓN PERFECTA! 🎉</span>
                    </h3>
                ) : (
                    <h3 className="text-3xl font-bold text-slate-900 dark:text-slate-100 mt-4">¡Quiz Completado!</h3>
                )}
                <p className="text-lg text-slate-600 dark:text-slate-400 mt-2">Tu puntuación:</p>
                <p className="text-5xl font-bold text-primary my-4">{percentage}%</p>
                <p className="text-slate-800 dark:text-slate-200">Has acertado {score} de {totalQuestions} preguntas.</p>
                
                {needsReinforcement && (
                    <div className="mt-8 p-4 bg-blue-50 dark:bg-blue-900/40 border-l-4 border-blue-400 rounded-r-lg text-left">
                        <h4 className="font-bold text-blue-800 dark:text-blue-300 flex items-center"><SparklesIcon className="w-5 h-5 mr-2"/>¿Necesitas ayuda?</h4>
                        <p className="text-blue-700 dark:text-blue-300 mt-1 text-sm">
                          Parece que hay algunos conceptos que podemos repasar. ¡Usa la IA para generar un plan de refuerzo personalizado!
                        </p>
                        <Button onClick={handleGeneratePlan} className="mt-4">
                          Generar Plan de Refuerzo
                        </Button>
                    </div>
                )}

                {/* Detalle de preguntas y respuestas para revisión */}
                <div className="mt-8 pt-6 border-t dark:border-slate-700 text-left">
                    <h4 className="font-bold text-slate-800 dark:text-slate-150 mb-4 flex items-center gap-2 text-base">
                        <span>📝</span> Revisión de Preguntas ({mode === 'practice' ? 'Modo Práctica' : 'Modo Examen'})
                    </h4>
                    <div className="space-y-4 max-h-[350px] overflow-y-auto pr-1">
                        {quiz.questions.map((q, qIdx) => {
                            const studentAns = answers[qIdx];
                            const isCorrect = studentAns?.isCorrect;
                            const isSkipped = studentAns?.selectedOption === null || studentAns?.selectedOption === undefined;
                            
                            return (
                                <div key={q.id} className="p-4 rounded-lg bg-slate-50 dark:bg-slate-900/30 border dark:border-slate-750/80">
                                    <div className="flex items-start justify-between gap-3">
                                        <span className="font-medium text-slate-900 dark:text-slate-100 text-sm">
                                            <span className="font-bold">{qIdx + 1}.</span> <InlineMarkdown content={q.text} />
                                        </span>
                                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider shrink-0 ${
                                            isCorrect 
                                                ? 'bg-green-100 text-green-800 dark:bg-green-950/50 dark:text-green-400' 
                                                : 'bg-red-105 text-red-800 dark:bg-red-955/50 dark:text-red-400'
                                        }`}>
                                            {isCorrect ? 'Correcta' : 'Incorrecta'}
                                        </span>
                                    </div>
                                    
                                    <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                                        Tu respuesta: <span className="font-semibold text-slate-700 dark:text-slate-300">
                                            {isSkipped ? 'Ninguna' : <InlineMarkdown content={q.options[studentAns.selectedOption!]} />}
                                        </span>
                                    </div>
                                    {q.explanation ? (
                                        <div className="mt-3 p-3 bg-blue-50/50 dark:bg-blue-950/20 rounded text-xs border-l-2 border-blue-400 text-blue-800 dark:text-blue-300">
                                            <span className="font-bold block mb-1">Explicación:</span> 
                                            <MarkdownContent content={q.explanation} />
                                        </div>
                                    ) : (
                                        <div className="mt-3 p-3 bg-slate-100/50 dark:bg-slate-800/40 rounded text-xs text-slate-500 dark:text-slate-400">
                                            Respuesta correcta: <span className="font-semibold"><InlineMarkdown content={q.options[q.correctAnswerIndex - 1]} /></span>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
                
                <Button onClick={() => setQuizState('start')} className="mt-8">Volver a intentar</Button>

                 <ReinforcementPlanModal
                    isOpen={isPlanModalOpen}
                    onClose={() => setIsPlanModalOpen(false)}
                    planText={planText}
                    isLoading={reinforcementPlanMutation.isPending}
                 />
            </div>
        );
    }

    return (
        <div className={`quiz-container bg-white dark:bg-slate-800 p-6 rounded-xl shadow-lg transition-transform duration-200 ${shouldBounce ? 'correct-bounce' : ''}`}>
            <div className="flex justify-between items-center mb-2">
                <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100">Pregunta {currentQuestionIndex + 1} de {totalQuestions}</h3>
                <div className="w-1/3 bg-gray-200 dark:bg-slate-700 rounded-full h-2.5 overflow-hidden">
                    <motion.div 
                        className="bg-primary h-2.5 rounded-full"
                        initial={{ width: 0 }}
                        animate={{ width: `${((currentQuestionIndex + 1) / totalQuestions) * 100}%` }}
                        transition={{ duration: 0.45, ease: "easeOut" }}
                    />
                </div>
            </div>

            {/* Mapa de progreso animado superior */}
            <div className="flex flex-wrap gap-1.5 justify-start items-center mb-6">
                {Array.from({ length: totalQuestions }).map((_, idx) => {
                    const isCurrent = idx === currentQuestionIndex;
                    const ans = answers[idx];
                    let dotColor = "bg-slate-100 dark:bg-slate-700 border border-transparent text-slate-600 dark:text-slate-450";
                    
                    if (ans?.selectedOption !== null && ans?.selectedOption !== undefined) {
                        if (mode === 'practice') {
                            if (ans.isCorrect === true) {
                                dotColor = "bg-green-500 text-white";
                            } else if (ans.isCorrect === false) {
                                dotColor = "bg-red-500 text-white";
                            } else {
                                dotColor = "bg-amber-400 border border-amber-500 text-slate-900";
                            }
                        } else {
                            // In exam mode, they've answered, so show a progress color to confirm saved status
                            dotColor = "bg-primary text-white border border-primary-dark";
                        }
                    }

                    return (
                        <div key={idx} className="relative">
                            <motion.div
                                className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold ${dotColor} ${isCurrent ? 'ring-2 ring-primary ring-offset-2 dark:ring-offset-slate-800' : ''}`}
                                animate={isCurrent ? { scale: [1, 1.25, 1] } : {}}
                                transition={{ duration: 0.3 }}
                            >
                                {mode === 'practice' && ans?.isCorrect !== null && ans?.isCorrect !== undefined ? (
                                    ans.isCorrect ? '✓' : '✗'
                                ) : (
                                    idx + 1
                                )}
                            </motion.div>
                        </div>
                    );
                })}
                <span className="text-[10px] font-bold uppercase tracking-wider bg-slate-100 dark:bg-slate-900/50 px-2.5 py-1 rounded text-slate-500 dark:text-slate-400 ml-auto whitespace-nowrap">
                    {mode === 'practice' ? '📖 Modo Práctica' : '📝 Modo Examen'}
                </span>
            </div>

            <div className="text-lg text-slate-850 dark:text-slate-100 min-h-[4rem] mb-2 font-medium">
                <MarkdownContent content={currentQuestion.text} />
            </div>

            <QuizDiagram diagram={currentQuestion.diagram} />

            <div className="mt-6 space-y-3">
                {currentQuestion.options.map((option, index) => {
                    const isSelected = currentAnswerState?.selectedOption === index;
                    const isCorrectAnswer = index === (currentQuestion.correctAnswerIndex - 1);
                    let optionClass = 'bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-200';
                    
                    if (isAnswerChecked) {
                        if (isCorrectAnswer) {
                            optionClass = 'bg-green-100 dark:bg-green-905/30 text-green-800 dark:text-green-300 border-green-500';
                        } else if (isSelected) {
                            optionClass = 'bg-red-100 dark:bg-red-955/30 text-red-800 dark:text-red-350 border-red-500';
                        }
                    } else if (isSelected) {
                        optionClass = 'bg-primary/20 border-primary text-primary-dark dark:text-primary-light';
                    }

                    return (
                        <button
                            key={index}
                            onClick={() => handleSelectOption(index)}
                            disabled={isAnswerChecked}
                            className={`w-full text-left p-4 rounded-lg border-2 transition-colors flex items-center justify-between ${optionClass} ${!isAnswerChecked && 'cursor-pointer'}`}
                        >
                            <span className="flex-1 pr-4 font-normal"><InlineMarkdown content={option} /></span>
                            {isAnswerChecked && isCorrectAnswer && <CheckCircleIcon className="w-6 h-6 text-green-600 shrink-0" />}
                            {isAnswerChecked && isSelected && !isCorrectAnswer && <XCircleIcon className="w-6 h-6 text-red-600 shrink-0" />}
                        </button>
                    );
                })}
            </div>

            {isAnswerChecked && currentQuestion.explanation && (
                <motion.div 
                    initial={{ opacity: 0, y: 15, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ duration: 0.45, ease: "easeOut" }}
                    className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/40 border-l-4 border-blue-405 rounded-r-lg"
                >
                    <h4 className="font-bold text-blue-800 dark:text-blue-350 flex items-center gap-1.5 mb-1.5">💡 Explicación Detallada:</h4>
                    <div className="text-blue-700 dark:text-blue-300">
                        <MarkdownContent content={currentQuestion.explanation} />
                    </div>
                </motion.div>
            )}

            <div className="mt-8 flex justify-between items-center sm:flex-row flex-col gap-4">
                {mode === 'practice' ? (
                    <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 text-center sm:text-left">
                        {isQuestionChecked ? (
                            currentAnswerState?.isCorrect ? (
                                <span className="text-green-600 dark:text-green-400 flex items-center gap-1">
                                    <span>✨</span> ¡Perfecto! Respuesta correcta.
                                </span>
                            ) : (
                                <span className="text-red-500 dark:text-red-400 flex items-center gap-1">
                                    <span>❌</span> Respuesta incorrecta.
                                </span>
                            )
                        ) : (
                            <span>Selecciona una opción y compruébala para ver la explicación.</span>
                        )}
                    </div>
                ) : (
                    <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 text-center sm:text-left">
                        {currentAnswerState?.selectedOption !== null && currentAnswerState?.selectedOption !== undefined ? (
                            <span className="text-primary flex items-center gap-1">
                                <span>✍️</span> Opción seleccionada. Haz clic en "Siguiente" para continuar.
                            </span>
                        ) : (
                            <span>Selecciona una opción para avanzar.</span>
                        )}
                    </div>
                )}
                
                <div className="flex gap-2 ml-auto w-full sm:w-auto justify-end">
                    {mode === 'practice' ? (
                        isQuestionChecked ? (
                            <Button onClick={handleNextQuestion}>
                                {currentQuestionIndex < totalQuestions - 1 ? 'Siguiente Pregunta' : 'Ver Resultados'}
                            </Button>
                        ) : (
                            <Button 
                                onClick={handleCheckAnswer} 
                                disabled={currentAnswerState?.selectedOption === null || currentAnswerState?.selectedOption === undefined}
                            >
                                Comprobar
                            </Button>
                        )
                    ) : (
                        <Button 
                            onClick={handleNextQuestion} 
                            disabled={currentAnswerState?.selectedOption === null || currentAnswerState?.selectedOption === undefined}
                        >
                            {currentQuestionIndex < totalQuestions - 1 ? 'Siguiente Pregunta' : 'Ver Resultados'}
                        </Button>
                    )}
                </div>
            </div>
        </div>
    );
};
