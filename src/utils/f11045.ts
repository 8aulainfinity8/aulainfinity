export function getF11045Meta(instanceId?: string, forceUid?: string) {
    const rawUid = forceUid || (typeof window !== 'undefined' ? (window as any).__FIREBASE_AUTH_UID__ : 'none') || 'none';
    const uidAnon = rawUid !== 'none' && rawUid.length > 8 ? `${rawUid.substring(0,4)}...${rawUid.substring(rawUid.length-4)}` : rawUid;
    const listeners = (typeof window !== 'undefined' ? (window as any).__listenerTracker?.getActiveCount?.() : 0) || 0;
    const ts = Date.now();
    const pathname = typeof window !== 'undefined' ? window.location.pathname : 'server';
    const vis = typeof document !== 'undefined' ? document.visibilityState : 'unknown';
    
    let res = `timestamp: ${ts} | pathname: ${pathname} | visibilityState: ${vis} | uid: ${uidAnon} | listeners: ${listeners}`;
    if (instanceId) {
        res += ` | instanceId: ${instanceId}`;
    }
    return res;
}
