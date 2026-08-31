import type { Video } from '../types';

// Helper to resolve deterministic or explicit video difficulty level
export const getVideoDifficulty = (video: Video): 'Básico' | 'Intermedio' | 'Avanzado' => {
    if (video.difficulty) {
        const diff = video.difficulty.toLowerCase();
        if (diff === 'fácil' || diff === 'básico' || diff === 'basico') return 'Básico';
        if (diff === 'medio' || diff === 'intermedio') return 'Intermedio';
        if (diff === 'difícil' || diff === 'dificil' || diff === 'avanzado') return 'Avanzado';
    }
    // Deterministic fallback based on id hash so it's consistent for the user
    let hash = 0;
    const str = (video.id || '') + (video.title || '');
    for (let i = 0; i < str.length; i++) {
        hash = (hash << 5) - hash + str.charCodeAt(i);
        hash |= 0; // Convert to 32bit integer
    }
    const absHash = Math.abs(hash);
    const mod = absHash % 3;
    if (mod === 0) return 'Básico';
    if (mod === 1) return 'Intermedio';
    return 'Avanzado';
};
