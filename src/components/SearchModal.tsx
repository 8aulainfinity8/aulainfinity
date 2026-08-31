import React, { useEffect, useMemo, useState, useRef, useContext } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import * as api from '../services/api';
import type { CourseLevel, Video } from '../types';
import { generateVideoPath } from '../constants/routes';
import { EmptyState } from './ui/EmptyState';
import { getVideoDifficulty } from '../utils/courseUtils';
import { AuthContext } from '../contexts/AuthContext';
import { filterCoursesForTeacher } from '../utils/teacherPermissions';
import { 
    Search, 
    X, 
    Play, 
    Sparkles, 
    Cpu, 
    Zap, 
    CornerDownLeft, 
    Clock, 
    ArrowRight,
    SearchCode,
    Highlighter
} from 'lucide-react';

// Help to strip Spanish diacritics / accents for seamless searching
const normalizeText = (text: string): string => {
    return text
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
};

// Highlighting wrapper for searched text
const HighlightedText: React.FC<{ text: string; query: string }> = ({ text, query }) => {
    if (!query || !query.trim()) return <span>{text}</span>;

    const normalizedQuery = normalizeText(query);
    const normalizedTextStr = normalizeText(text);
    
    // Find matching positions in normalized space but slice the original string
    const queryLength = normalizedQuery.length;
    let lastIndex = 0;
    const parts: React.ReactNode[] = [];

    while (true) {
        const index = normalizedTextStr.indexOf(normalizedQuery, lastIndex);
        if (index === -1) {
            parts.push(text.substring(lastIndex));
            break;
        }

        // Add prefix
        parts.push(text.substring(lastIndex, index));
        // Add highlighted segment (case-preserved from original text)
        parts.push(
            <mark key={index} className="bg-amber-100 text-amber-950 font-semibold rounded-sm px-0.5 dark:bg-amber-950/70 dark:text-amber-200">
                {text.substring(index, index + queryLength)}
            </mark>
        );
        lastIndex = index + queryLength;
    }

    return <>{parts}</>;
};

const AIResponseLoader: React.FC = () => {
    const messages = [
        "Analizando tu consulta temática...",
        "Buscando con el Tutor IA en toda la videoteca...",
        "Filtrando recursos por relevancia pedagógica...",
        "Optimizando resultados conceptuales...",
    ];
    const [currentMessage, setCurrentMessage] = useState(messages[0]);

    useEffect(() => {
        let index = 0;
        const interval = setInterval(() => {
            index = (index + 1) % messages.length;
            setCurrentMessage(messages[index]);
        }, 2200);
        return () => clearInterval(interval);
    }, []);

    return (
        <div className="text-center p-12 flex flex-col items-center justify-center space-y-4">
            <div className="relative">
                <div className="w-16 h-16 rounded-full border-4 border-indigo-100 dark:border-indigo-950/40 border-t-indigo-600 dark:border-t-indigo-400 animate-spin" />
                <Sparkles className="w-6 h-6 text-indigo-500 absolute inset-0 m-auto animate-pulse" />
            </div>
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-300 animate-pulse">{currentMessage}</p>
        </div>
    );
};

const VideoResultCard: React.FC<{ 
    video: Video & { levelName: string; subjectName: string }; 
    query: string;
    onSelect: () => void 
}> = ({ video, query, onSelect }) => {
    const difficulty = getVideoDifficulty(video);

    return (
        <Link 
            to={generateVideoPath(video.id)} 
            onClick={onSelect}
            aria-label={`Ver lección: ${video.title}, de ${video.subjectName} (${video.levelName})`}
            className="block p-4 rounded-xl border border-slate-205 dark:border-slate-750 bg-slate-50/50 dark:bg-slate-900/10 hover:bg-white dark:hover:bg-slate-800 hover:shadow-md hover:border-indigo-300 dark:hover:border-indigo-900/40 transition-all duration-200 group"
        >
            <div className="flex items-start gap-4">
                <div className="flex-shrink-0 p-3 bg-indigo-50 dark:bg-indigo-950/40 rounded-xl text-indigo-600 dark:text-indigo-400 group-hover:bg-indigo-600 group-hover:text-white transition-colors duration-200">
                    <Play className="w-5 h-5" />
                </div>
                <div className="flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-bold text-indigo-650 dark:text-indigo-400 uppercase tracking-wide bg-indigo-50 dark:bg-indigo-950/30 px-2 py-0.5 rounded">
                            {video.subjectName}
                        </span>
                        <span className="text-[10px] text-slate-500 font-medium">
                            {video.levelName}
                        </span>
                        <span className={`px-2 py-0.5 text-[9px] font-bold rounded uppercase tracking-wider ${
                            difficulty === 'Básico' 
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-100 dark:bg-emerald-950/20 dark:text-emerald-400 dark:border-emerald-900/10'
                            : difficulty === 'Intermedio'
                            ? 'bg-amber-50 text-amber-700 border border-amber-100 dark:bg-amber-950/20 dark:text-amber-400 dark:border-amber-900/10'
                            : 'bg-rose-50 text-rose-700 border border-rose-100 dark:bg-rose-950/20 dark:text-rose-400 dark:border-rose-900/10'
                        }`}>
                            {difficulty}
                        </span>
                    </div>
                    
                    <h3 className="text-base font-bold text-slate-900 dark:text-slate-50 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                        <HighlightedText text={video.title} query={query} />
                    </h3>
                    
                    <p className="text-sm text-slate-600 dark:text-slate-400 line-clamp-2">
                        <HighlightedText text={video.description} query={query} />
                    </p>
                </div>
                
                <div className="self-center p-1.5 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-100 dark:bg-slate-700 rounded-lg">
                    <ArrowRight className="w-4 h-4 text-slate-500 dark:text-slate-300" />
                </div>
            </div>
        </Link>
    );
};

export const SearchModal: React.FC<{ isOpen: boolean; initialQuery: string; onClose: () => void }> = ({ isOpen, initialQuery, onClose }) => {
    const { user } = useContext(AuthContext);
    const [query, setQuery] = useState(initialQuery);
    const [searchMode, setSearchMode] = useState<'instant' | 'ai'>('instant');
    const inputRef = useRef<HTMLInputElement>(null);

    const { data: courses, isLoading: coursesLoading } = useQuery<CourseLevel[]>({
        queryKey: ['courses'],
        queryFn: api.fetchCourses
    });

    const accessibleCourses = useMemo(() => {
        if (!courses) return [];
        if (user?.role === 'teacher') {
            return filterCoursesForTeacher(courses, user);
        }
        return courses;
    }, [courses, user]);

    const allVideosWithContext = useMemo(() => {
        if (!accessibleCourses) return [];
        return accessibleCourses.flatMap(level => 
            (level.subjects || []).flatMap(subject => 
                [...(subject.videos || []), ...(subject.blocks || []).flatMap(b => b.videos)].map(video => ({
                    ...video,
                    levelName: level.name,
                    subjectName: subject.name
                }))
            )
        );
    }, [accessibleCourses]);

    // Gemini-powered AI search mutation
    const searchMutation = useMutation<{ relevantVideoIds: string[] }, Error, string>({
        mutationFn: (searchQuery: string) => api.searchVideosWithAI(searchQuery, allVideosWithContext),
    });

    // Keyboard Listeners
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onClose();
            }
        };
        if (isOpen) {
            window.addEventListener('keydown', handleKeyDown);
            setTimeout(() => inputRef.current?.focus(), 80);
        }
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    // Sync input field value when modal is triggered with an initial header query
    useEffect(() => {
        setQuery(initialQuery);
        if (initialQuery && initialQuery.trim() !== '') {
            // If they searched via form from Header, let's auto run AI if they hit Enter
            if (searchMode === 'ai' && allVideosWithContext.length > 0) {
                searchMutation.mutate(initialQuery);
            }
        } else {
            searchMutation.reset();
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, initialQuery, allVideosWithContext]);

    // Handle Form submission for AI search, or simply trigger standard filters
    const handleSearchSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const trimmed = query.trim();
        if (!trimmed) return;

        if (searchMode === 'ai') {
            searchMutation.mutate(trimmed);
        }
    };

    // Click hot suggestions
    const handleTagClick = (tag: string) => {
        setQuery(tag);
        inputRef.current?.focus();
        if (searchMode === 'ai') {
            searchMutation.mutate(tag);
        }
    };

    // Perform highly optimized, real-time local search on client-side
    const instantResults = useMemo(() => {
        const normalizedQuery = normalizeText(query);
        if (!normalizedQuery || normalizedQuery.length < 2) return [];

        return allVideosWithContext.filter(video => {
            const titleMatch = normalizeText(video.title || '').includes(normalizedQuery);
            const descMatch = normalizeText(video.description || '').includes(normalizedQuery);
            return titleMatch || descMatch;
        });
    }, [query, allVideosWithContext]);

    // Resolve which results list to render based on user path
    const resultsToRender = useMemo(() => {
        if (searchMode === 'ai') {
            if (!searchMutation.data?.relevantVideoIds) return [];
            const videoMap = new Map(allVideosWithContext.map(v => [v.id, v]));
            return searchMutation.data.relevantVideoIds
                .map(id => videoMap.get(id))
                .filter((v): v is Video & { levelName: string; subjectName: string } => !!v);
        } else {
            return instantResults;
        }
    }, [searchMode, instantResults, searchMutation.data, allVideosWithContext]);

    const showSuggestionPill = query.length < 2 && searchMode === 'instant';

    // Popular academic searches
    const hotTopics = [
        "Sintaxis",
        "Matrices",
        "Límites",
        "Derivadas",
        "Integrales",
        "Química Orgánica",
        "Fuerzas libres",
        "Probabilidad"
    ];

    if (!isOpen) return null;

    return (
        <div 
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-start justify-center p-4 pt-[10vh] animate-fadeIn"
            onClick={onClose}
            aria-modal="true"
            role="dialog"
        >
            <div 
                className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-3xl flex flex-col border border-slate-100 dark:border-slate-700/60 overflow-hidden"
                onClick={e => e.stopPropagation()}
            >
                {/* Search Bar / Mode Selector in Header */}
                <div className="flex flex-col border-b dark:border-slate-700">
                    <div className="flex items-center p-4">
                        <form onSubmit={handleSearchSubmit} className="relative flex-1">
                            <input
                                ref={inputRef}
                                type="search"
                                value={query}
                                onChange={(e) => {
                                    setQuery(e.target.value);
                                    if (searchMode === 'ai' && e.target.value === '') {
                                        searchMutation.reset();
                                    }
                                }}
                                aria-label="Introducir palabras clave para buscar videos"
                                placeholder={
                                    searchMode === 'instant' 
                                        ? "Busca un título, tema o concepto (mínimo 2 letras)..." 
                                        : "Escribe una pregunta para buscar conceptos de forma avanzada..."
                                }
                                className="w-full pl-11 pr-20 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all text-sm text-slate-900 dark:text-slate-50"
                            />
                            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-400">
                                <Search className="h-5 w-5" />
                            </div>

                            {/* UI Badge for enter action key */}
                            <div className="absolute inset-y-0 right-3 flex items-center gap-1.5 pointer-events-none">
                                {searchMode === 'ai' && query.trim() && (
                                    <span className="flex items-center text-[10px] uppercase font-bold text-indigo-550 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200/40 px-1.5 py-0.5 rounded animate-pulse">
                                        <CornerDownLeft className="w-3 h-3 mr-0.5" />
                                        Enter
                                    </span>
                                )}
                                <kbd className="hidden sm:inline-flex items-center text-[10px] font-mono text-slate-400 bg-white dark:bg-slate-800 border dark:border-slate-700 px-1.5 py-0.5 rounded shadow-sm">
                                    ESC
                                </kbd>
                            </div>
                        </form>
                        <button 
                            onClick={onClose} 
                            className="p-2.5 ml-3 rounded-xl hover:bg-slate-105 dark:hover:bg-slate-700/80 hover:text-red-500 transition-all cursor-pointer text-slate-400"
                            title="Cerrar"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    {/* Mode Selector */}
                    <div className="flex px-4 border-t dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/30">
                        <button
                            type="button"
                            onClick={() => {
                                setSearchMode('instant');
                                searchMutation.reset();
                            }}
                            className={`flex items-center gap-2 py-3 px-4 border-b-2 text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer ${
                                searchMode === 'instant'
                                    ? 'border-indigo-600 text-indigo-600 dark:border-indigo-550 dark:text-indigo-400'
                                    : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-350'
                            }`}
                        >
                            <Zap className="w-4 h-4" />
                            <span>Búsqueda Instantánea</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => setSearchMode('ai')}
                            className={`flex items-center gap-2 py-3 px-4 border-b-2 text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer ${
                                searchMode === 'ai'
                                    ? 'border-indigo-600 text-indigo-600 dark:border-indigo-550 dark:text-indigo-400'
                                    : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-350'
                            }`}
                        >
                            <Sparkles className="w-4 h-4" />
                            <span>Semántica con IA</span>
                            <span className="bg-indigo-100 text-indigo-755 dark:bg-indigo-950 dark:text-indigo-305 text-[9px] font-black px-1.5 py-0.25 rounded-full uppercase tracking-widest leading-none scale-90">
                                PRO
                            </span>
                        </button>
                    </div>
                </div>

                {/* Main Results Board */}
                <div className="p-6 max-h-[60vh] overflow-y-auto space-y-6">
                    {/* Suggestions Area */}
                    {showSuggestionPill && (
                        <div className="space-y-3">
                            <span className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest flex items-center">
                                <SearchCode className="w-4 h-4 mr-1.5 text-indigo-400" />
                                Temas más buscados en la academia
                            </span>
                            <div className="flex flex-wrap gap-2">
                                {hotTopics.map(topic => (
                                    <button
                                        key={topic}
                                        onClick={() => handleTagClick(topic)}
                                        className="text-xs font-medium text-slate-700 hover:text-indigo-700 dark:text-slate-300 dark:hover:text-indigo-400 bg-slate-100 hover:bg-slate-200 dark:bg-slate-750 dark:hover:bg-slate-700 px-3.5 py-1.5 rounded-xl border border-slate-200/50 dark:border-slate-700/50 transition-all duration-150 cursor-pointer active:scale-95"
                                    >
                                        {topic}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* AI Loading State */}
                    {searchMode === 'ai' && searchMutation.isPending && (
                        <AIResponseLoader />
                    )}

                    {/* Results Render */}
                    {!searchMutation.isPending && resultsToRender.length > 0 && (
                        <div className="space-y-4">
                            <div className="flex items-center justify-between text-xs font-bold text-slate-450 dark:text-slate-500">
                                <span className="uppercase tracking-wider">
                                    {searchMode === 'instant' ? 'Coincidencias instantáneas' : 'Análisis temático con IA'}
                                </span>
                                <span>{resultsToRender.length} {resultsToRender.length === 1 ? 'resultado' : 'resultados'}</span>
                            </div>
                            <div className="space-y-3">
                                {resultsToRender.map(video => (
                                    <VideoResultCard 
                                        key={video.id} 
                                        video={video} 
                                        query={query} 
                                        onSelect={onClose} 
                                    />
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Search Feedback: Empty results */}
                    {!searchMutation.isPending && !coursesLoading && query.trim() !== '' && resultsToRender.length === 0 && (
                        <div className="flex flex-col items-center justify-center py-8 text-center">
                            <EmptyState
                                icon={<Search className="w-12 h-12 text-slate-400 animate-bounce" />}
                                title={
                                    searchMode === 'ai' 
                                        ? 'Tutor IA: No se encontraron relaciones conceptuales' 
                                        : 'Sin coincidencias para "' + query + '"'
                                }
                                description={
                                    searchMode === 'ai'
                                        ? 'Prueba reformulando tu consulta con palabras clave más generales o materias tradicionales.'
                                        : 'Asegúrate de haber ingresado más de 2 caracteres, o cambia el término para buscar en títulos o descripciones.'
                                }
                            />
                            {searchMode === 'instant' && (
                                <button
                                    onClick={() => setSearchMode('ai')}
                                    className="mt-4 inline-flex items-center gap-2 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 dark:bg-indigo-950/40 dark:text-indigo-300 font-bold px-4 py-2 rounded-xl transition-all cursor-pointer text-xs"
                                >
                                    <Sparkles className="w-4 h-4" />
                                    <span>Intentar búsqueda semántica avanzada por IA</span>
                                </button>
                            )}
                        </div>
                    )}

                    {/* Initial State / Waiting guidance */}
                    {!searchMutation.isPending && !query.trim() && (
                        <div className="flex flex-col items-center justify-center py-6 text-center text-slate-400 dark:text-slate-500 space-y-2">
                            <Clock className="w-9 h-9 opacity-50" />
                            <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300">Explorador de recursos activo</h4>
                            <p className="text-xs max-w-sm">
                                {searchMode === 'instant' 
                                    ? "Empieza a escribir el tema que estás estudiando para encontrar clases de apoyo y resoluciones de examen al instante."
                                    : "Escribe una pregunta conceptual o duda matemática, y nuestro Tutor IA te recomendará los vídeos relevantes."
                                }
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
