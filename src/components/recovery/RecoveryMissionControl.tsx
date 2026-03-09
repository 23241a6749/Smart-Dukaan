import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Phone, CheckCircle, X, Calendar,
    Mic, ShieldCheck, TrendingUp, Loader2, Zap
} from 'lucide-react';
import { customerApi } from '../../services/api';

const RecoveryMissionControl = ({ isOpen, onClose, customers }: { isOpen: boolean, onClose: () => void, customers: any[] }) => {
    const [queue, setQueue] = useState<any[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isProcessing, setIsProcessing] = useState(false);
    const [completed, setCompleted] = useState(false);
    const [stats, setStats] = useState({ promised: 0, failed: 0 });

    // HUD STATES
    const [aiState, setAiState] = useState<'idle' | 'dialing' | 'speaking' | 'listening' | 'processing' | 'completed'>('idle');
    const [transcript, setTranscript] = useState<any[]>([]);
    const [extractedData, setExtractedData] = useState<any>(null);

    const scrollRef = useRef<HTMLDivElement>(null);
    const [isOpenPrev, setIsOpenPrev] = useState(false);

    // HELPER: Convert natural language date to timestamp
    const calculatePromiseDate = (dateStr: string) => {
        const now = new Date();
        const str = dateStr.toLowerCase();

        // Handle numeric days (e.g., "2 days", "after 3 days")
        const dayMatch = str.match(/(\d+)\s*day/);
        if (dayMatch) {
            const days = parseInt(dayMatch[1]);
            return now.getTime() + (days * 24 * 60 * 60 * 1000);
        }

        // Handle variations
        if (str.includes('repu') || str.includes('repo') || str.includes('tomorrow') || str.includes('rep'))
            return now.getTime() + (1 * 24 * 60 * 60 * 1000);

        if (str.includes('next week') || str.includes('week'))
            return now.getTime() + (7 * 24 * 60 * 60 * 1000);

        if (str.includes('2 day') || str.includes('two day'))
            return now.getTime() + (2 * 24 * 60 * 60 * 1000);

        if (str.includes('3 day') || str.includes('three day'))
            return now.getTime() + (3 * 24 * 60 * 60 * 1000);

        return now.getTime() + (1 * 24 * 60 * 60 * 1000); // Default to tomorrow
    };

    const updateCustomerPromise = async (customerId: string, dateStr: string) => {
        try {
            const nextDate = calculatePromiseDate(dateStr);
            await customerApi.update(customerId.toString(), {
                nextCallDate: nextDate,
                recoveryStatus: 'Promised',
                recoveryNotes: `Mission Control: ${dateStr}`
            });
        } catch (err) { console.error(err); }
    };

    useEffect(() => {
        if (isOpen && !isOpenPrev && customers.length > 0) {
            const timer = setTimeout(() => {
                setQueue(customers.map((c, i) => ({ ...c, status: 'pending', isReal: i === 0 })));
                setCurrentIndex(0);
                setIsProcessing(false);
                setCompleted(false);
                setStats({ promised: 0, failed: 0 });
                setAiState('idle');
                setTranscript([]);
                setExtractedData(null);
            }, 0);
            return () => clearTimeout(timer);
        }
        setIsOpenPrev(isOpen);
    }, [isOpen, customers, isOpenPrev]);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [transcript]);

    const startBatch = () => {
        setIsProcessing(true);
        processStep(0);
    };

    const processStep = async (index: number) => {
        if (index >= queue.length) {
            setCompleted(true);
            setIsProcessing(false);
            setAiState('completed');
            return;
        }

        setCurrentIndex(index);
        updateStatus(queue[index].id, 'calling');
        const current = queue[index];

        if (current.isReal) {
            setAiState('dialing');
            setTranscript(prev => [...prev, { role: 'system', text: `Initiating secure link to ${current.phone}...` }]);

            try {
                // REAL SIMULATION based on user request
                setTimeout(() => {
                    setAiState('speaking');
                    setTranscript(prev => [...prev, { role: 'ai', text: `Namaskaram ${current.name} garu, mee ₹${current.amount} pending undi, eppudu pay chestaru?` }]);

                    setTimeout(() => {
                        setAiState('listening');
                        // Simulation of "after 2 days"
                        setTranscript(prev => [...prev, { role: 'user', text: "Namaste andi, currently funds levu, 2 days tharvatha pay chesthanu." }]);

                        setTimeout(() => {
                            setAiState('processing');
                            setExtractedData({ type: 'promise', date: '2 Days', confidence: 99 });
                            setTranscript(prev => [...prev, { role: 'system', text: "INTENT: [PROMISE_FUTURE] | TARGET: [2_DAYS]" }]);

                            setTimeout(() => {
                                setAiState('speaking');
                                setTranscript(prev => [...prev, { role: 'ai', text: "Sare andi, Note cheskunnanu. Dhanyavadhalu." }]);

                                setTimeout(() => {
                                    finishStep(current.id, 'promised', '2 days', index);
                                }, 1500);
                            }, 2000);
                        }, 2000);
                    }, 3000);
                }, 2000);

            } catch {
                setAiState('idle');
                finishStep(current.id, 'failed', '', index);
            }
        } else {
            // FAST SIMULATION FOR OTHERS
            setAiState('processing');
            setTimeout(() => {
                // If odd ID, simulate failure/no-response (Stay in Action queue)
                // If even ID, simulate promise (Move to Scheduled)
                // Handle Mongo ObjectID (hex string) or numeric ID
                let isSuccess = false;
                const idStr = current.id.toString();
                const lastChar = idStr.slice(-1);
                if (!isNaN(parseInt(lastChar))) {
                    isSuccess = parseInt(lastChar) % 2 === 0;
                } else {
                    isSuccess = idStr.charCodeAt(idStr.length - 1) % 2 === 0;
                }

                const result = isSuccess ? 'promised' : 'failed';
                finishStep(current.id, result, isSuccess ? 'next week' : '', index);
            }, 1500);
        }
    };

    const updateStatus = (id: string, status: string) => {
        setQueue(prev => prev.map(c => c.id === id ? { ...c, status } : c));
    };

    const finishStep = async (id: string, result: string, dateStr: string, index: number) => {
        updateStatus(id, result);

        // ONLY update database if customer actually PROMISED
        // If they said no, or didn't lift, we keep them in 'Action Required' (failed)
        if (result === 'promised' && dateStr) {
            await updateCustomerPromise(id, dateStr);
            setStats(prev => ({ ...prev, promised: prev.promised + (queue[index]?.amount || 0) }));
        } else {
            // If failed, we DO NOT update nextCallDate. 
            // Thus, customer stays in actionQueue because nextCallDate is null or in the past.
            setStats(prev => ({ ...prev, failed: prev.failed + 1 }));
            // Optional: Mark recoveryStatus as 'Call Again' in DB
            await customerApi.update(id.toString(), { recoveryStatus: 'Call Again' });
        }

        if (index + 1 < queue.length) {
            processStep(index + 1);
        } else {
            setCompleted(true);
            setIsProcessing(false);
            setAiState('completed');
        }
    };

    if (!isOpen) return null;

    const currentCall = queue[currentIndex] || customers[0];

    // If no customers are available, don't crash the HUD
    if (!currentCall) return null;

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/95 backdrop-blur-2xl p-4">
            <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="w-full max-w-6xl h-[90vh] bg-[#050505] rounded-[2.5rem] border border-white/10 shadow-[0_0_50px_rgba(0,0,0,0.5)] overflow-hidden flex flex-col md:flex-row relative"
            >
                {/* Background Grid */}
                <div className="absolute inset-0 bg-grid-dark opacity-20 pointer-events-none"></div>

                {/* --- LEFT PANEL: THE QUEUE --- */}
                <div className="w-full md:w-1/3 border-r border-white/5 flex flex-col bg-white/[0.02] backdrop-blur-md relative z-10">
                    <div className="p-8 border-b border-white/5">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-blue-600/20 rounded-lg">
                                <ShieldCheck className="text-blue-500" size={20} />
                            </div>
                            <div>
                                <h2 className="text-lg font-black text-white tracking-tight">Recovery HUD</h2>
                                <div className="flex items-center gap-2 mt-1 text-[10px] font-black text-blue-500/60 uppercase tracking-widest">
                                    <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse"></span>
                                    AI Agent Online
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
                        <AnimatePresence mode="popLayout">
                            {queue.map((customer, idx) => (
                                <motion.div
                                    key={customer.id}
                                    layout
                                    initial={{ opacity: 0, x: -20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    className={`p-5 rounded-[1.5rem] border transition-all relative overflow-hidden ${idx === currentIndex && isProcessing
                                        ? 'bg-blue-600/10 border-blue-500/50 shadow-[0_0_20px_rgba(59,130,246,0.15)]'
                                        : customer.status === 'promised'
                                            ? 'bg-green-500/5 border-green-500/20 opacity-80'
                                            : 'bg-white/[0.03] border-white/5 opacity-40'
                                        }`}
                                >
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <h3 className="font-bold text-white text-sm">{customer.name}</h3>
                                            <p className="text-[10px] font-mono text-gray-500 mt-1 uppercase tracking-tighter">
                                                ID: REC-{customer.id}-SEC
                                            </p>
                                        </div>
                                        <div className="text-right">
                                            <span className="text-sm font-black text-white block">₹{(customer.amount || 0).toLocaleString()}</span>
                                            {customer.status === 'promised' && <CheckCircle size={14} className="text-green-500 ml-auto mt-1" />}
                                        </div>
                                    </div>

                                    {idx === currentIndex && isProcessing && (
                                        <div className="mt-4 h-1 bg-white/5 rounded-full overflow-hidden">
                                            <motion.div
                                                className="h-full bg-blue-500"
                                                animate={{ width: ['0%', '100%'] }}
                                                transition={{ duration: 10, repeat: Infinity }}
                                            />
                                        </div>
                                    )}
                                </motion.div>
                            ))}
                        </AnimatePresence>
                    </div>

                    <div className="p-8 border-t border-white/5 bg-black/20">
                        <div className="flex justify-between items-center mb-6">
                            <div>
                                <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Active Promises</p>
                                <p className="text-2xl font-black text-green-400">₹{stats.promised.toLocaleString()}</p>
                            </div>
                            <TrendingUp className="text-green-500/30" size={32} />
                        </div>
                        {!isProcessing && !completed ? (
                            <button onClick={startBatch} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-black py-5 rounded-2xl flex items-center justify-center gap-3 transition-all animate-neon">
                                <Zap size={20} fill="white" /> INITIALIZE LOOP
                            </button>
                        ) : (
                            <button onClick={onClose} className="w-full bg-white/5 hover:bg-white/10 text-white py-5 rounded-2xl font-black transition-all">
                                {completed ? "TERMINATE LINK" : "PROCESSING..."}
                            </button>
                        )}
                    </div>
                </div>

                {/* --- RIGHT PANEL: LIVE OPS --- */}
                <div className="flex-1 flex flex-col relative z-20 overflow-hidden">

                    {/* Top Bar: Current Target */}
                    <div className="p-8 flex justify-between items-end border-b border-white/5 bg-gradient-to-b from-white/[0.02] to-transparent">
                        <div>
                            <p className="text-[10px] font-black text-blue-500 uppercase tracking-[0.3em] mb-2">Current Target</p>
                            <h1 className="text-4xl font-black text-white tracking-tight">{currentCall.name}</h1>
                        </div>
                        <div className="text-right">
                            <p className="text-[10px] font-black text-red-500 uppercase tracking-widest mb-1">Risk Assessment</p>
                            <div className="flex items-center gap-2">
                                <div className="h-1.5 w-24 bg-white/5 rounded-full overflow-hidden">
                                    <div className="h-full bg-red-500 w-[85%]" />
                                </div>
                                <span className="text-sm font-black text-white">HIGH</span>
                            </div>
                        </div>
                    </div>

                    {/* Center: The AI Visualizer (HUD Central) */}
                    <div className="flex-1 flex flex-col items-center justify-center relative">
                        {/* THE ORB */}
                        <div className={`relative w-64 h-64 flex items-center justify-center transition-all duration-700 ${aiState === 'speaking' ? 'scale-110' :
                            aiState === 'listening' ? 'scale-105' : 'scale-100'
                            }`}>
                            {/* Outer Glows */}
                            <div className={`absolute inset-0 rounded-full blur-[60px] transition-colors duration-1000 ${aiState === 'speaking' ? 'bg-blue-600/30' :
                                aiState === 'listening' ? 'bg-green-500/20' :
                                    aiState === 'processing' ? 'bg-purple-600/20' : 'bg-white/5'
                                }`} />

                            <div className="z-10 bg-black w-56 h-56 rounded-full flex items-center justify-center border border-white/10 relative overflow-hidden shadow-[inset_0_0_40px_rgba(255,255,255,0.05)]">
                                {/* SCANNING LINE */}
                                {aiState === 'dialing' && (
                                    <motion.div
                                        animate={{ top: ['-10%', '110%'] }}
                                        transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
                                        className="absolute left-0 right-0 h-0.5 bg-blue-500/50 shadow-[0_0_10px_#3b82f6] z-0"
                                    />
                                )}

                                {/* VISUALIZER BARS */}
                                {(aiState === 'speaking' || aiState === 'listening') && (
                                    <div className="flex gap-2 items-center h-16 relative z-20">
                                        {[...Array(8)].map((_, i) => (
                                            <motion.div
                                                key={i}
                                                className={`siri-bar ${aiState === 'listening' ? 'bg-green-500' : ''}`}
                                                animate={{ height: [10, 60, 20, 70, 10], opacity: [0.5, 1, 0.5] }}
                                                transition={{ repeat: Infinity, duration: 0.6, delay: i * 0.08 }}
                                            />
                                        ))}
                                    </div>
                                )}

                                {aiState === 'dialing' && <Phone size={48} className="text-blue-500 animate-pulse relative z-20" />}
                                {aiState === 'processing' && <Loader2 size={48} className="text-purple-500 animate-spin relative z-20" />}
                                {aiState === 'completed' && <CheckCircle size={64} className="text-green-500 relative z-20" />}
                                {aiState === 'idle' && <Mic size={48} className="text-gray-700 relative z-20" />}
                            </div>
                        </div>

                        <div className="mt-12 text-center pointer-events-none">
                            <p className="text-white font-black text-xl tracking-[0.2em] uppercase">
                                {aiState === 'dialing' ? 'Establishing Uplink...' :
                                    aiState === 'speaking' ? 'AI Transmission Active' :
                                        aiState === 'listening' ? 'Intercepting Voice...' :
                                            aiState === 'processing' ? 'Analyzing Linguistics...' :
                                                aiState === 'completed' ? 'Mission Success' : 'System Standby'}
                            </p>
                            <p className="text-gray-500 text-[10px] font-mono mt-2 tracking-widest uppercase">
                                Subsystem: GRAMIN-LINK-V2 // ENCRYPTION: AES-256
                            </p>
                        </div>
                    </div>

                    {/* Extracted Data Floating HUD (Dynamic) */}
                    <AnimatePresence>
                        {extractedData && (
                            <motion.div
                                initial={{ y: 100, opacity: 0 }}
                                animate={{ y: 0, opacity: 1 }}
                                exit={{ y: 50, opacity: 0 }}
                                className="absolute bottom-44 left-1/2 -translate-x-1/2 w-full px-8 max-w-lg"
                            >
                                <div className="bg-white/5 backdrop-blur-2xl border border-green-500/30 p-6 rounded-[2rem] shadow-2xl flex items-center gap-6 relative overflow-hidden group">
                                    <div className="absolute inset-0 bg-green-500/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                                    <div className="bg-green-500/10 text-green-500 p-4 rounded-2xl border border-green-500/20">
                                        <Calendar size={28} />
                                    </div>
                                    <div className="flex-1">
                                        <p className="text-[10px] font-black text-green-500 uppercase tracking-widest mb-1">Intent Classified</p>
                                        <p className="text-2xl font-black text-white">{extractedData.date} Promise</p>
                                        <div className="flex items-center gap-2 mt-2">
                                            <div className="h-1 w-full bg-white/5 rounded-full">
                                                <div className="h-full bg-green-500 w-[98%]" />
                                            </div>
                                            <span className="text-[10px] font-black text-gray-500">{extractedData.confidence}%</span>
                                        </div>
                                    </div>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Bottom: Console Log (Transcript) */}
                    <div className="h-44 bg-black/40 border-t border-white/5 p-6 overflow-hidden relative group">
                        <div className="absolute top-0 left-0 w-full h-10 bg-gradient-to-b from-black/40 to-transparent pointer-events-none z-10" />
                        <div ref={scrollRef} className="h-full overflow-y-auto space-y-2 font-mono text-[11px] custom-scrollbar scroll-smooth">
                            {transcript.map((line, i) => (
                                <motion.div
                                    initial={{ opacity: 0, x: -10 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    key={i}
                                    className="flex gap-4"
                                >
                                    <span className="text-gray-700">[{new Date().toLocaleTimeString([], { hour12: false })}]</span>
                                    <span className={`${line.role === 'ai' ? 'text-blue-400' :
                                        line.role === 'user' ? 'text-green-400 font-bold' :
                                            'text-purple-400'
                                        }`}>
                                        {line.role?.toUpperCase() || 'SYS'}: {line.text}
                                    </span>
                                </motion.div>
                            ))}
                            <div className="text-blue-500/50 animate-pulse">_</div>
                        </div>
                    </div>

                    {/* Exit Button */}
                    <button onClick={onClose} className="absolute top-8 right-8 p-3 bg-white/5 hover:bg-white/10 rounded-2xl text-white/40 hover:text-white transition-all border border-white/5">
                        <X size={20} />
                    </button>
                </div>
            </motion.div>
        </div>
    );
};

export default RecoveryMissionControl;
