import { getF11045Meta } from "../utils/f11045";
// Global Listener Registry & Diagnostics for F110.37

export interface ListenerRecord {
    id: string;
    source: string;
    path: string;
    type: string;
    group: 'Chat' | 'Notifications' | 'Dashboard' | 'User' | 'Conversations' | 'Messages' | 'Other';
    createdAt: number;
    cleanedAt?: number;
    active: boolean;
}

class ListenerTracker {
    private activeMap = new Map<string, ListenerRecord>();
    private allRecords: ListenerRecord[] = [];
    public totalCreated = 0;
    public totalCleaned = 0;
    public maxActive = 0;

    public register(source: string, path: string, type: string = 'query'): string {
        const id = `lis_${Math.random().toString(36).substring(2, 8)}`;
        const now = performance.now();

        // Categorize into canonical groups
        let group: ListenerRecord['group'] = 'Other';
        const pathLower = path.toLowerCase();
        if (pathLower.includes('/messages') || pathLower.includes('message')) {
            group = 'Messages';
        } else if (pathLower.includes('chat') || pathLower.includes('conversation')) {
            group = 'Conversations';
        } else if (pathLower.includes('user') || pathLower.includes('teacher') || pathLower.includes('student') || pathLower.includes('admin')) {
            group = 'User';
        } else if (pathLower.includes('alert') || pathLower.includes('voice') || pathLower.includes('call') || pathLower.includes('notification')) {
            group = 'Notifications';
        } else if (pathLower.includes('course') || pathLower.includes('agenda') || pathLower.includes('quiz') || pathLower.includes('payment')) {
            group = 'Dashboard';
        }

        const record: ListenerRecord = {
            id,
            source,
            path,
            type,
            group,
            createdAt: now,
            active: true
        };

        this.activeMap.set(id, record);
        this.allRecords.push(record);
        this.totalCreated++;

        const currentActive = this.activeMap.size;
        if (currentActive > this.maxActive) {
            this.maxActive = currentActive;
        }

        console.log(`[F110.45] FIRESTORE_LISTENER_CREATE | ${getF11045Meta()} | listenerId: ${id} | path: ${path} | source: ${source}`);
        console.log(`[F110.37] LISTENER_CREATE | timestamp: ${now.toFixed(1)} | listenerId: ${id} | source: ${source} | path: ${path} | type: ${type} | group: ${group}`);
        console.log(`[F110.37] ACTIVE_LISTENERS | current: ${currentActive} | max: ${this.maxActive}`);

        return id;
    }

    public cleanup(id: string) {
        const record = this.activeMap.get(id);
        const now = performance.now();
        if (record) {
            record.active = false;
            record.cleanedAt = now;
            this.activeMap.delete(id);
            this.totalCleaned++;

            const currentActive = this.activeMap.size;
            console.log(`[F110.45] FIRESTORE_LISTENER_DESTROY | ${getF11045Meta()} | listenerId: ${id} | path: ${record.path}`);
            console.log(`[F110.37] LISTENER_CLEANUP | timestamp: ${now.toFixed(1)} | listenerId: ${id} | path: ${record.path} | source: ${record.source}`);
            console.log(`[F110.37] ACTIVE_LISTENERS | current: ${currentActive} | max: ${this.maxActive}`);
        }
    }

    public getActiveCount(): number {
        return this.activeMap.size;
    }

    public getMaxActive(): number {
        return this.maxActive;
    }

    public getActiveListeners(): ListenerRecord[] {
        return Array.from(this.activeMap.values());
    }

    public dumpTable(): void {
        console.log('=== [F110.37] ACTIVE FIRESTORE LISTENERS TABLE ===');
        const active = this.getActiveListeners();
        console.log(`Total Active: ${active.length} | Max Active: ${this.maxActive} | Total Created: ${this.totalCreated} | Total Cleaned: ${this.totalCleaned}`);
        
        const groups: Record<string, ListenerRecord[]> = {};
        for (const lis of active) {
            if (!groups[lis.group]) groups[lis.group] = [];
            groups[lis.group].push(lis);
        }

        for (const [grp, items] of Object.entries(groups)) {
            console.log(`-- Group [${grp}] (${items.length} listeners):`);
            for (const item of items) {
                console.log(`   listenerId: ${item.id} | source: ${item.source} | path: ${item.path} | active: ${item.active}`);
            }
        }
        console.log('==================================================');
    }
}

export const listenerTracker = new ListenerTracker();

// Expose globally in window for easy runtime inspection & automation
if (typeof window !== 'undefined') {
    (window as any).__listenerTracker = listenerTracker;
    (window as any).__dumpListeners = () => listenerTracker.dumpTable();
}
