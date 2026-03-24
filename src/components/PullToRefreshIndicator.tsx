import React from 'react';

interface Props {
    pullY: number;
    isRefreshing: boolean;
    isTriggered: boolean;
}

/**
 * Bubbly pull-to-refresh indicator.
 * Renders as an absolutely-positioned element that slides down from the top.
 */
const PullToRefreshIndicator: React.FC<Props> = ({ pullY, isRefreshing, isTriggered }) => {
    const visible = pullY > 0 || isRefreshing;
    if (!visible) return null;

    // Progress 0→1 across the pull range
    const progress = Math.min(pullY / 72, 1);

    // Translate the pill down with the pull
    const translateY = isRefreshing ? 12 : pullY * 0.6;

    // Scale from 0.4 → 1 as user pulls
    const scale = isRefreshing ? 1 : 0.4 + progress * 0.6;

    // Bubble color: green when triggered, amber while still pulling
    const bg = isTriggered || isRefreshing ? '#16a34a' : '#f59e0b';
    const ring = isTriggered || isRefreshing ? 'rgba(22,163,74,0.25)' : 'rgba(245,158,11,0.2)';

    return (
        <div
            className="absolute left-0 right-0 flex justify-center pointer-events-none z-50"
            style={{ top: 0 }}
            aria-hidden="true"
        >
            {/* Ripple ring */}
            {(isTriggered || isRefreshing) && (
                <div
                    className="absolute rounded-full animate-ping-slow"
                    style={{
                        width: 52,
                        height: 52,
                        background: ring,
                        transform: `translateY(${translateY + 2}px) scale(${scale})`,
                        transition: 'transform 0.25s cubic-bezier(0.34,1.56,0.64,1)',
                    }}
                />
            )}

            {/* Main bubble */}
            <div
                style={{
                    transform: `translateY(${translateY}px) scale(${scale})`,
                    transition: isRefreshing
                        ? 'transform 0.35s cubic-bezier(0.34,1.56,0.64,1)'
                        : 'transform 0.1s linear',
                    opacity: Math.max(0.2, progress),
                    willChange: 'transform',
                }}
            >
                <div
                    className="w-12 h-12 rounded-full flex items-center justify-center shadow-lg"
                    style={{
                        background: bg,
                        boxShadow: `0 4px 20px ${ring}, 0 0 0 3px white`,
                        transition: 'background 0.2s ease',
                    }}
                >
                    {isRefreshing ? (
                        /* Spinning arc */
                        <svg className="w-5 h-5 text-white animate-spin" viewBox="0 0 24 24" fill="none">
                            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.3" />
                            <path
                                d="M12 2a10 10 0 0 1 10 10"
                                stroke="currentColor"
                                strokeWidth="3"
                                strokeLinecap="round"
                            />
                        </svg>
                    ) : (
                        /* Arrow */
                        <svg
                            className="w-5 h-5 text-white"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            style={{
                                transform: `rotate(${isTriggered ? 180 : 0}deg)`,
                                transition: 'transform 0.3s cubic-bezier(0.34,1.56,0.64,1)',
                            }}
                        >
                            <line x1="12" y1="5" x2="12" y2="19" />
                            <polyline points="19 12 12 19 5 12" />
                        </svg>
                    )}
                </div>

                {/* Label */}
                <div
                    className="text-center mt-1.5 text-[10px] font-black uppercase tracking-widest transition-all"
                    style={{ color: bg, opacity: progress }}
                >
                    {isRefreshing ? 'Refreshing' : isTriggered ? 'Release!' : 'Pull'}
                </div>
            </div>
        </div>
    );
};

export default PullToRefreshIndicator;
