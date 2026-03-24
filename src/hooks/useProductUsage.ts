import { useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';

export interface ProductUsageMeta {
    lastUsedAt: number; // epoch ms
    usageCount: number;
}

type UsageMap = Record<string, ProductUsageMeta>; // keyed by productId

const STORAGE_KEY_PREFIX = 'product_usage_';
const RECENT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function getStorageKey(userId: string | undefined) {
    return `${STORAGE_KEY_PREFIX}${userId || 'guest'}`;
}

function readMap(userId: string | undefined): UsageMap {
    try {
        const raw = localStorage.getItem(getStorageKey(userId));
        return raw ? JSON.parse(raw) : {};
    } catch {
        return {};
    }
}

function writeMap(userId: string | undefined, map: UsageMap) {
    try {
        localStorage.setItem(getStorageKey(userId), JSON.stringify(map));
    } catch {
        // ignore storage quota errors
    }
}

export function useProductUsage() {
    const { user } = useAuth();
    const userId = user?.id;

    /**
     * Call this after a successful billing transaction.
     * Accepts an array of { _id } objects (cart items).
     */
    const recordUsage = useCallback(
        (cartItems: Array<{ _id?: string }>) => {
            const map = readMap(userId);
            const now = Date.now();

            cartItems.forEach(item => {
                if (!item._id) return;
                const prev = map[item._id];
                map[item._id] = {
                    lastUsedAt: now,
                    usageCount: (prev?.usageCount ?? 0) + 1,
                };
            });

            writeMap(userId, map);
        },
        [userId],
    );

    /**
     * Returns a stable usage map. Re-read from localStorage when needed.
     * Consumers should call this inside useMemo or similar.
     */
    const getUsageMap = useCallback((): UsageMap => {
        return readMap(userId);
    }, [userId]);

    /**
   * Returns a single flat array sorted by LRU:
   * - Products used within RECENT_WINDOW_MS come first, newest-used first.
   * - Remaining products follow, sorted A→Z by name.
   */
    const sortProducts = useCallback(
        <T extends { _id?: string; name: string }>(products: T[]): T[] => {
            const map = readMap(userId);
            const cutoff = Date.now() - RECENT_WINDOW_MS;

            const recent: T[] = [];
            const other: T[] = [];

            products.forEach(p => {
                const meta = p._id ? map[p._id] : undefined;
                if (meta && meta.lastUsedAt >= cutoff) {
                    recent.push(p);
                } else {
                    other.push(p);
                }
            });

            recent.sort((a, b) => {
                const ta = a._id ? (map[a._id]?.lastUsedAt ?? 0) : 0;
                const tb = b._id ? (map[b._id]?.lastUsedAt ?? 0) : 0;
                return tb - ta;
            });

            other.sort((a, b) => a.name.localeCompare(b.name));

            return [...recent, ...other];
        },
        [userId],
    );

    return { recordUsage, getUsageMap, sortProducts };
}
