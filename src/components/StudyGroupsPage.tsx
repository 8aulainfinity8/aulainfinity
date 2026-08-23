import React from 'react';
import { StudentChatPage } from './StudentChatPage';

/**
 * StudyGroupsPage — Unificado con StudentChatPage (Fase F76)
 * Proporciona acceso directo al canal de Grupos de Estudio / Cursos
 * respaldado exclusivamente por Firestore en tiempo real sin bots ni simulaciones.
 */
export const StudyGroupsPage: React.FC = () => {
    return <StudentChatPage initialTab="group" />;
};
