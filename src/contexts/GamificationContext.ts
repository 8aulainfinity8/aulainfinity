import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import * as api from '../services/api';
import { auth } from '../services/firebase';
import { badgesData } from '../data/badges';
import { AuthContext } from './AuthContext';
import { StudentProgressContext } from './StudentProgressContext';
import { NotificationContext } from './NotificationContext';
import type { StudentUser, CourseLevel, StudentAnswer } from '../types';
import { TrophyIcon } from '../components/icons';

const GAMIFICATION_KEY = 'knownEarnedBadges';

// This context doesn't need to provide anything, it just works in the background.
const GamificationContext = createContext<null>(null);

export const GamificationProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const { user } = useContext(AuthContext);
    const { watchedVideos } = useContext(StudentProgressContext);
    const { addToast } = useContext(NotificationContext);

    // Fetch necessary data
    const { data: courses } = useQuery<CourseLevel[]>({ 
        queryKey: ['courses'], 
        queryFn: api.fetchCourses,
        enabled: !!user && !!user.id && !!auth.currentUser && user.role === 'student',
    });
    const { data: studentAnswers } = useQuery<StudentAnswer[]>({
        queryKey: ['studentAnswers', user?.id],
        queryFn: () => api.fetchStudentAnswers(user!.id),
        enabled: !!user && !!user.id && !!auth.currentUser && user.role === 'student',
    });

    const [knownBadges, setKnownBadges] = useState<Set<string>>(() => {
        try {
            const stored = localStorage.getItem(GAMIFICATION_KEY);
            return stored ? new Set(JSON.parse(stored)) : new Set();
        } catch {
            return new Set();
        }
    });
    
    useEffect(() => {
        if (!user || user.role !== 'student' || !courses || !studentAnswers) {
            return;
        }

        const currentlyEarnedBadges = new Set<string>();
        badgesData.forEach(badge => {
            if (badge.criteria(user as StudentUser, courses, studentAnswers)) {
                currentlyEarnedBadges.add(badge.id);
            }
        });

        const newlyEarnedBadges = [...currentlyEarnedBadges].filter(id => !knownBadges.has(id));

        if (newlyEarnedBadges.length > 0) {
            newlyEarnedBadges.forEach(badgeId => {
                const badge = badgesData.find(b => b.id === badgeId);
                if (badge) {
                    // Show a toast notification
                    const toastIcon = React.createElement(TrophyIcon, { className: "w-6 h-6 text-yellow-500" });
                    addToast(`¡Logro desbloqueado: ${badge.name}!`, 'success', toastIcon);
                }
            });

            // Update known badges state and localStorage
            const newKnownSet = new Set([...knownBadges, ...newlyEarnedBadges]);
            setKnownBadges(newKnownSet);
            localStorage.setItem(GAMIFICATION_KEY, JSON.stringify([...newKnownSet]));
        } else if (currentlyEarnedBadges.size !== knownBadges.size) {
            // This handles the case where the initial `knownBadges` from localStorage might be out of sync
            // but no *new* badges were earned in this cycle. We just sync it silently.
            setKnownBadges(currentlyEarnedBadges);
            localStorage.setItem(GAMIFICATION_KEY, JSON.stringify([...currentlyEarnedBadges]));
        }

    }, [user, watchedVideos, studentAnswers, courses, addToast, knownBadges]);

    // FIX: Replaced JSX with React.createElement to resolve parsing errors in .ts file.
    return React.createElement(GamificationContext.Provider, { value: null }, children);
};