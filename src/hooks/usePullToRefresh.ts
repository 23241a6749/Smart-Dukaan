import { useRef, useState, useCallback, useEffect } from 'react';

const THRESHOLD = 70;   // px of pull needed to trigger refresh
const MAX_PULL = 130; // px cap (slightly higher for more elastic feel)

interface Options {
    onRefresh: () => Promise<void> | void;
    /** element to watch for scrollTop (defaults to nearest scroll parent) */
    scrollRef?: React.RefObject<HTMLElement | null>;
    disabled?: boolean;
}

export interface PullToRefreshState {
    pullY: number;          // current pull distance (0 → MAX_PULL)
    isRefreshing: boolean;
    isTriggered: boolean;   // pull past threshold but not yet released
}

export function usePullToRefresh({ onRefresh, scrollRef, disabled = false }: Options) {
    const [state, setState] = useState<PullToRefreshState>({ pullY: 0, isRefreshing: false, isTriggered: false });
    const startY = useRef(0);
    const startX = useRef(0);
    const pulling = useRef(false);
    const isRefreshing = useRef(false);
    const canPull = useRef(false);

    const getScrollContainer = useCallback(() => {
        if (scrollRef?.current) return scrollRef.current;
        // Search for nearest scrollable parent in the DOM if we are on a browser
        // In this app, it's mostly the 'main' element in MainLayout.
        return document.querySelector('main') || document.documentElement;
    }, [scrollRef]);

    const getScrollTop = useCallback(() => {
        const container = getScrollContainer();
        if (container === document.documentElement) {
            return window.scrollY || document.documentElement.scrollTop;
        }
        return container.scrollTop;
    }, [getScrollContainer]);

    const onTouchStart = useCallback((e: TouchEvent) => {
        if (disabled || isRefreshing.current) return;

        const scrollTop = getScrollTop();
        if (scrollTop > 0) {
            canPull.current = false;
            return;
        }

        canPull.current = true;
        startY.current = e.touches[0].clientY;
        startX.current = e.touches[0].clientX;
        pulling.current = false; // Haven't started "pulling" the UI yet, just tracking potential
    }, [disabled, getScrollTop]);

    const onTouchMove = useCallback((e: TouchEvent) => {
        if (!canPull.current || isRefreshing.current) return;

        const currentY = e.touches[0].clientY;
        const currentX = e.touches[0].clientX;
        const deltaY = currentY - startY.current;
        const deltaX = currentX - startX.current;

        // If scrolling up or side-to-side, cancel pull eligibility
        if (!pulling.current) {
            if (deltaY < 0 || Math.abs(deltaX) > Math.abs(deltaY)) {
                canPull.current = false;
                return;
            }
            if (deltaY > 5) { // Small buffer before showing pull intent
                pulling.current = true;
            }
        }

        if (pulling.current) {
            // Check scroll top again to be safe (case where JS/Momentum scroll moves it)
            if (getScrollTop() > 0) {
                pulling.current = false;
                canPull.current = false;
                setState(s => ({ ...s, pullY: 0, isTriggered: false }));
                return;
            }

            // Rubber-band effect: non-linear resistance
            // Using a log-like scale: dampened = constant * log(1 + deltaY/scale)
            // Or simpler power scale for "bubbly" feel
            const dampened = Math.min(deltaY * 0.45, MAX_PULL);

            setState({ pullY: dampened, isRefreshing: false, isTriggered: dampened >= THRESHOLD });

            // Prevent native scroll/overscroll while pulling
            if (e.cancelable) e.preventDefault();
        }
    }, [getScrollTop]);

    const onTouchEnd = useCallback(async () => {
        if (!pulling.current) {
            canPull.current = false;
            return;
        }

        const { pullY } = state;
        pulling.current = false;
        canPull.current = false;

        if (pullY < THRESHOLD || isRefreshing.current) {
            setState({ pullY: 0, isRefreshing: false, isTriggered: false });
            return;
        }

        isRefreshing.current = true;
        // Snap to trigger height while loading
        setState({ pullY: THRESHOLD, isRefreshing: true, isTriggered: true });

        try {
            await onRefresh();
        } finally {
            isRefreshing.current = false;
            // Smoothly snap back
            setState({ pullY: 0, isRefreshing: false, isTriggered: false });
        }
    }, [state, onRefresh]);

    useEffect(() => {
        // We attach to window to catch gestures even if they drift outside the container
        // but we check the container's scroll top
        const opts: AddEventListenerOptions = { passive: false };

        window.addEventListener('touchstart', onTouchStart as EventListener, opts);
        window.addEventListener('touchmove', onTouchMove as EventListener, opts);
        window.addEventListener('touchend', onTouchEnd as EventListener);

        return () => {
            window.removeEventListener('touchstart', onTouchStart as EventListener);
            window.removeEventListener('touchmove', onTouchMove as EventListener);
            window.removeEventListener('touchend', onTouchEnd as EventListener);
        };
    }, [onTouchStart, onTouchMove, onTouchEnd]);

    return state;
}
