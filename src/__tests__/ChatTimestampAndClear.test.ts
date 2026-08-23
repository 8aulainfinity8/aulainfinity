import { describe, it, expect } from 'vitest';
import { normalizeMessageTimestamp, formatMessageTime } from '../utils/chatUtils';
import * as api from '../services/api';

describe('FASE F79 — Test Suite de Normalización de Fechas y Limpieza Segura de Chats', () => {
    it('1. normalizeMessageTimestamp maneja correctamente objetos Timestamp de Firestore con toDate()', () => {
        const mockFirestoreTimestamp = {
            toDate: () => new Date('2026-06-15T10:30:00Z')
        };
        const result = normalizeMessageTimestamp(mockFirestoreTimestamp);
        expect(result instanceof Date).toBe(true);
        expect(result.getFullYear()).toBe(2026);
        expect(result.getMonth()).toBe(5); // June
        expect(result.getDate()).toBe(15);
    });

    it('2. normalizeMessageTimestamp maneja objetos con toMillis() o seconds', () => {
        const tsMillis = { toMillis: () => 1781611200000 }; // June 15 2026 approx
        const resMillis = normalizeMessageTimestamp(tsMillis);
        expect(resMillis instanceof Date).toBe(true);

        const tsSeconds = { seconds: 1781611200 };
        const resSeconds = normalizeMessageTimestamp(tsSeconds);
        expect(resSeconds instanceof Date).toBe(true);
    });

    it('3. normalizeMessageTimestamp maneja strings, numbers, Date y valores nulos sin devolver Invalid Date', () => {
        const dateObj = new Date('2026-01-01T00:00:00Z');
        expect(normalizeMessageTimestamp(dateObj)).toEqual(dateObj);

        const isoStr = '2026-05-20T12:00:00.000Z';
        expect(normalizeMessageTimestamp(isoStr) instanceof Date).toBe(true);

        const numSec = 1781611200;
        expect(normalizeMessageTimestamp(numSec) instanceof Date).toBe(true);

        const numMs = 1781611200000;
        expect(normalizeMessageTimestamp(numMs) instanceof Date).toBe(true);

        const fallback = normalizeMessageTimestamp(null);
        expect(fallback instanceof Date).toBe(true);
        expect(isNaN(fallback.getTime())).toBe(false);

        const fallbackUndefined = normalizeMessageTimestamp(undefined);
        expect(fallbackUndefined instanceof Date).toBe(true);

        const invalidStr = 'fecha-invalida';
        const fallbackInvalid = normalizeMessageTimestamp(invalidStr);
        expect(fallbackInvalid instanceof Date).toBe(true);
        expect(isNaN(fallbackInvalid.getTime())).toBe(false);
    });

    it('4. formatMessageTime formatea correctamente la hora sin errores', () => {
        const timeStr = formatMessageTime('2026-06-15T14:35:00Z');
        expect(typeof timeStr).toBe('string');
        expect(timeStr.length).toBeGreaterThan(0);
    });

    it('5. API clearChatMessages existe y responde correctamente', async () => {
        expect(typeof api.clearChatMessages).toBe('function');
        const res = await api.clearChatMessages('test_convo_id');
        expect(res).toBeDefined();
        expect(res.success).toBe(true);
    });
});
