import { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Phone, Mic, CheckCircle, AlertTriangle, AudioLines, PhoneOff, RotateCcw, Clock } from 'lucide-react';
import { customerApi, invoiceApi } from '../../services/api';

export interface RecoveryCustomer {
    id: number | string;
    name: string;
    amount: number;
    days: number;
    phone: string;
    risk?: 'LOW' | 'MEDIUM' | 'HIGH';
    nextCallDate?: number;
    recoveryStatus?: string;
}

const LiveCallModal = ({ customer, isOpen, onClose, onResult }: { customer: RecoveryCustomer | null, isOpen: boolean, onClose: () => void, onResult: (res: any) => void }) => {
    const [status, setStatus] = useState<'connecting' | 'active' | 'completed' | 'failed'>('connecting');
    const [transcript, setTranscript] = useState<Array<{ role: 'assistant' | 'user' | 'system'; text: string }>>([]);
    const [insight, setInsight] = useState('Booting multilingual voice workflow...');
    const [callDuration, setCallDuration] = useState(0);
    const [lastUpdate, setLastUpdate] = useState<string>('');
    const [activeInvoiceId, setActiveInvoiceId] = useState<string>('');
    const [sessionStartedAtIso, setSessionStartedAtIso] = useState<string>('');
    const timerRef = useRef<number | null>(null);
    const hasTriggeredCallRef = useRef(false);
    const onResultRef = useRef(onResult);

    useEffect(() => {
        onResultRef.current = onResult;
    }, [onResult]);

    const formatDuration = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    useEffect(() => {
        if (isOpen && customer) {
            setCallDuration(0);
            timerRef.current = window.setInterval(() => {
                setCallDuration(prev => prev + 1);
            }, 1000);
        }

        return () => {
            if (timerRef.current) {
                clearInterval(timerRef.current);
                timerRef.current = null;
            }
        };
    }, [isOpen, customer]);

    const handleRetry = async () => {
        if (!customer) return;
        hasTriggeredCallRef.current = true;
        
        setStatus('connecting');
        setTranscript([
            { role: 'system', text: 'Retrying voice call...' },
            { role: 'assistant', text: `Re-initiating call to ${customer.phone}` }
        ]);
        setInsight('Retrying call connection...');

        try {
            const res = await invoiceApi.recoverNow(customer.id.toString());
            setActiveInvoiceId(String(res.data?.invoiceId || ''));
            setSessionStartedAtIso(new Date().toISOString());
            setStatus('active');
            setTranscript(prev => [
                ...prev,
                { role: 'assistant', text: 'Call re-initiated. Waiting for response...' },
                { role: 'system', text: `Status: ${res.data?.callStatus || 'queued'}` }
            ]);
            setInsight('Call is active. Awaiting customer response...');
            setLastUpdate(new Date().toLocaleTimeString());
        } catch (error: any) {
            setStatus('failed');
            setInsight('Call retry failed. Please check Twilio configuration.');
            setTranscript(prev => [
                ...prev,
                { role: 'system', text: `Error: ${error?.response?.data?.message || error.message}` }
            ]);
        }
    };

    useEffect(() => {
        let timer: number | undefined;

        const run = async () => {
            if (!isOpen || !customer) return;
            if (hasTriggeredCallRef.current) return;
            hasTriggeredCallRef.current = true;

            setStatus('connecting');
            setTranscript([
                { role: 'system', text: '🎯 Voice Intelligence Engine initializing...' },
                { role: 'assistant', text: `Preparing call to ${customer.phone}` }
            ]);
            setInsight('Connecting to Twilio Voice API...');

            timer = window.setTimeout(() => setStatus('active'), 900);

            try {
                const res = await invoiceApi.recoverNow(customer.id.toString());
                setActiveInvoiceId(String(res.data?.invoiceId || ''));
                setSessionStartedAtIso(new Date().toISOString());
                setTranscript((prev) => [
                    ...prev,
                    { role: 'assistant', text: '📞 Call initiated via Twilio. Waiting for live speech...' },
                    { role: 'system', text: `Delivery status: ${res.data?.callStatus || 'queued'}` }
                ]);
                setInsight('🤖 AI Agent is live on call. Listening for customer response...');
                setLastUpdate(new Date().toLocaleTimeString());

                await customerApi.update(customer.id.toString(), {
                    recoveryStatus: 'Busy',
                    recoveryNotes: 'Live call started from Recovery Console.'
                });

                setTranscript((prev) => [
                    ...prev,
                    { role: 'system', text: '✅ Call connected. Customer response will be analyzed via Deepgram and saved automatically.' }
                ]);
                onResultRef.current({ status: 'initiated', promiseDate: '' });
            } catch (error: any) {
                setStatus('failed');
                setInsight('❌ Call failed. Check Twilio credentials and BACKEND_URL in .env');
                setTranscript((prev) => [
                    ...prev,
                    { role: 'system', text: `Error: ${error?.response?.data?.message || error.message || 'Unknown error'}` }
                ]);
            }
        };

        run();

        return () => {
            if (timer) window.clearTimeout(timer);
        };
    }, [isOpen, customer]);

    useEffect(() => {
        if (!isOpen) {
            hasTriggeredCallRef.current = false;
            setActiveInvoiceId('');
            setSessionStartedAtIso('');
        }
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen || !activeInvoiceId || status !== 'active') return;

        const interval = window.setInterval(async () => {
            try {
                const response = await invoiceApi.getRecoveryState(activeInvoiceId, sessionStartedAtIso || undefined);
                const state = response.data;

                if (state.negotiationStage) {
                    const partialText = state.negotiationPartialAmountNow
                        ? ` | Partial now: ₹${state.negotiationPartialAmountNow}`
                        : '';
                    const remainingText = typeof state.negotiationRemainingAmount === 'number'
                        ? ` | Remaining: ₹${state.negotiationRemainingAmount}`
                        : '';
                    const languageText = state.negotiationLanguage
                        ? ` | Lang: ${String(state.negotiationLanguage).toUpperCase()}`
                        : '';
                    const sourceText = state.negotiationLanguageSource
                        ? ` | Source: ${state.negotiationLanguageSource}`
                        : '';
                    const lockText = state.customerVoiceLanguageLocked
                        ? ' | Locked'
                        : '';
                    const fallbackText = state.negotiationFallbackMode && state.negotiationFallbackMode !== 'none'
                        ? ` | Fallback: ${state.negotiationFallbackMode}`
                        : '';
                    setInsight(`Stage: ${state.negotiationStage} | Turns: ${state.negotiationTurns || 0}${partialText}${remainingText}${languageText}${sourceText}${lockText}${fallbackText}`);
                }

                const transcriptLog = state.latestTranscriptLog;
                if (transcriptLog) {
                    setTranscript((prev) => {
                        const exists = prev.some((entry) => entry.text === transcriptLog);
                        if (exists) return prev;
                        return [...prev, { role: 'user', text: transcriptLog }];
                    });
                }

                if (state.negotiationStatus === 'completed' || state.hasTranscriptSince) {
                    setStatus('completed');
                    setInsight(state.negotiationSummary || `Call processed. Intent: ${state.lastIntent || 'UNKNOWN'} | Status: ${state.invoiceStatus || 'updated'}`);
                    setLastUpdate(new Date().toLocaleTimeString());
                    onResultRef.current({
                        status: 'success',
                        promiseDate: state.promisedDate
                            ? new Date(state.promisedDate).toLocaleDateString(
                                state.negotiationLanguage === 'hi' ? 'hi-IN' : state.negotiationLanguage === 'te' ? 'te-IN' : 'en-IN'
                            )
                            : 'Captured',
                    });
                    window.clearInterval(interval);
                }
            } catch {
                // Keep polling silently to avoid noisy toasts while call is in progress.
            }
        }, 3500);

        return () => window.clearInterval(interval);
    }, [isOpen, activeInvoiceId, sessionStartedAtIso, status]);

    if (!isOpen || !customer) return null;

    const statusColors = {
        connecting: 'from-amber-600 to-orange-700',
        active: 'from-emerald-600 to-teal-700',
        completed: 'from-blue-600 to-indigo-700',
        failed: 'from-rose-600 to-red-700'
    };

    const statusIcons = {
        connecting: <Phone className="animate-pulse" size={40} />,
        active: <AudioLines className="animate-pulse" size={40} />,
        completed: <CheckCircle size={40} />,
        failed: <AlertTriangle size={40} />
    };

    return (
        <AnimatePresence>
            <div className="fixed inset-0 bg-black/80 backdrop-blur-xl z-[100] flex items-center justify-center p-4">
                <motion.div
                    initial={{ scale: 0.92, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.92, opacity: 0 }}
                    className={`bg-gradient-to-br ${statusColors[status]} w-full max-w-lg rounded-3xl overflow-hidden border border-white/10 shadow-2xl`}
                >
                    <div className="p-6 text-center border-b border-white/10">
                        <div className="relative">
                            <div className="w-24 h-24 rounded-full mx-auto flex items-center justify-center mb-4 bg-white/10 border border-white/20">
                                <div className="text-white">
                                    {statusIcons[status]}
                                </div>
                                {status === 'active' && (
                                    <div className="absolute inset-0 border-4 border-white/30 rounded-full animate-ping" />
                                )}
                            </div>
                            {status === 'active' && (
                                <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 bg-red-500 text-white px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1">
                                    <span className="w-2 h-2 bg-white rounded-full animate-pulse" />
                                    LIVE
                                </div>
                            )}
                        </div>
                        
                        <h2 className="text-2xl font-black text-white tracking-tight">{customer.name}</h2>
                        <p className="text-white/70 font-semibold text-sm mt-1">Recovery Call · ₹{customer.amount.toLocaleString()}</p>
                        
                        {status === 'active' && (
                            <div className="mt-3 inline-flex items-center gap-2 bg-black/30 px-4 py-2 rounded-full">
                                <Clock size={14} className="text-white/70" />
                                <span className="text-white font-mono text-sm">{formatDuration(callDuration)}</span>
                            </div>
                        )}
                    </div>

                    <div className="p-4 border-b border-white/10 bg-black/20">
                        <div className="flex items-center justify-between">
                            <p className="text-xs uppercase tracking-widest text-white/50 font-bold">AI Status</p>
                            {lastUpdate && (
                                <p className="text-xs text-white/30">Last update: {lastUpdate}</p>
                            )}
                        </div>
                        <p className="text-sm text-white/90 leading-relaxed mt-1">{insight}</p>
                    </div>

                    <div className="h-64 bg-black/30 p-4 overflow-y-auto space-y-3 custom-scrollbar">
                        {status === 'active' && (
                            <div className="flex justify-center py-2">
                                <div className="flex gap-1">
                                    <span className="w-2 h-2 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                                    <span className="w-2 h-2 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                                    <span className="w-2 h-2 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                                </div>
                            </div>
                        )}
                        {transcript.map((t, i) => (
                            <motion.div 
                                key={`${t.role}-${i}`} 
                                initial={{ opacity: 0, y: 8 }} 
                                animate={{ opacity: 1, y: 0 }}
                                className="text-sm"
                            >
                                <span className={`text-[10px] font-black uppercase tracking-wider ${t.role === 'assistant' ? 'text-emerald-300' : t.role === 'user' ? 'text-cyan-300' : 'text-amber-300'}`}>
                                    {t.role === 'system' ? '⚡ SYSTEM' : t.role === 'assistant' ? '🤖 AI AGENT' : '👤 CUSTOMER'}
                                </span>
                                <p className="text-white/90 mt-1">{t.text}</p>
                            </motion.div>
                        ))}
                    </div>

                    <div className="p-4 bg-black/25 flex gap-3">
                        {status === 'failed' ? (
                            <>
                                <button
                                    onClick={handleRetry}
                                    className="flex-1 bg-amber-500 hover:bg-amber-600 text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all"
                                >
                                    <RotateCcw size={18} />
                                    Retry Call
                                </button>
                                <button
                                    onClick={onClose}
                                    className="flex-1 bg-white/10 hover:bg-white/15 text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all"
                                >
                                    <PhoneOff size={18} />
                                    Close
                                </button>
                            </>
                        ) : (
                            <button
                                onClick={onClose}
                                className="flex-1 bg-white/10 hover:bg-white/15 text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all"
                            >
                                {status === 'completed' ? <CheckCircle size={18} /> : <Phone size={18} />}
                                {status === 'completed' ? 'Done' : 'End Call'}
                            </button>
                        )}
                        <div className={`p-3 rounded-xl border border-white/20 flex items-center justify-center ${status === 'active' ? 'bg-red-500/20' : 'bg-white/10'}`}>
                            {status === 'active' ? (
                                <Mic size={18} className="animate-pulse text-red-300" />
                            ) : (
                                <Mic size={18} className="text-white/50" />
                            )}
                        </div>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
};

export default LiveCallModal;
