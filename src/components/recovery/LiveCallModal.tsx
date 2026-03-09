import { useEffect, useState } from 'react';
import Vapi from '@vapi-ai/web';
import { motion, AnimatePresence } from 'framer-motion';
import { Phone, Mic, User, CheckCircle, AlertTriangle } from 'lucide-react';
import { customerApi } from '../../services/api';

// Initialize Vapi with your API key
const vapi = new Vapi('7c654710-662a-4da2-9788-592f15cc2fcc');

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
    const [transcript, setTranscript] = useState<any[]>([]);
    const [sentiment, setSentiment] = useState<'neutral' | 'positive' | 'negative'>('neutral');
    const [callId, setCallId] = useState<string | null>(null);

    // SIMULATION MODE TOGGLE - Set to false for REAL calls via Vapi Phone API
    const useSimulation = false;

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

    const updateCustomerPromise = async (extractedDate: string) => {
        if (!customer?.id) return;

        // Only update if a valid promise date was mentioned
        if (!extractedDate || extractedDate.toLowerCase() === 'none' || extractedDate.toLowerCase() === 'no') {
            await customerApi.update(customer.id.toString(), { recoveryStatus: 'Call Again' });
            return;
        }

        try {
            const nextDate = calculatePromiseDate(extractedDate);
            await customerApi.update(customer.id.toString(), {
                nextCallDate: nextDate,
                recoveryStatus: 'Promised',
                recoveryNotes: `AI Summary: Promised to pay on ${extractedDate}`
            });
            console.log(`✅ Intelligence Loop: Skip calls for ${customer.name} until ${new Date(nextDate).toLocaleDateString()}`);
        } catch (err) {
            console.error('Failed to update promise date:', err);
        }
    };

    useEffect(() => {
        let timer: any;
        if (isOpen && customer) {
            // RESET STATE
            setStatus('connecting');
            setTranscript([]);
            setSentiment('neutral');

            if (useSimulation) {
                // FAKE SIMULATION LOGIC
                timer = setTimeout(() => {
                    setStatus('active');

                    const fakeConvo = [
                        { role: 'assistant', text: `Namaste ${customer.name} ji! Calling from KLink Store.`, delay: 1000 },
                        { role: 'user', text: "Ha bhai bolo, kya hua?", delay: 3000 },
                        { role: 'assistant', text: `Sir, ₹${customer.amount} is pending since ${customer.days} days.`, delay: 5000 },
                        { role: 'user', text: "Arre sorry! I was busy. I will pay tomorrow.", delay: 8500 },
                        { role: 'assistant', text: "Okay sir, noting it for tomorrow. Thanks!", delay: 11000 },
                    ];

                    fakeConvo.forEach(msg => {
                        setTimeout(() => {
                            setTranscript(prev => [...prev, msg]);
                            if (msg.role === 'user') setSentiment('positive');
                        }, msg.delay);
                    });

                    // End Call Simulation
                    setTimeout(() => {
                        endCall('tomorrow');
                    }, 14000);

                }, 1500);

            } else if (customer) {
                // ACTUAL API LOGIC - Make real call
                startCall();
            }
        }
        return () => {
            vapi.stop();
            clearTimeout(timer);
        };
    }, [isOpen]);

    // Format phone number to E.164 (e.g. +91...)
    const formatPhone = (phone: string) => {
        let cleaned = phone.replace(/\D/g, '');
        if (cleaned.length === 10) cleaned = '91' + cleaned;
        return cleaned.startsWith('+') ? cleaned : '+' + cleaned;
    };

    const startCall = async () => {
        if (!customer) return;
        setStatus('connecting');
        const formattedPhone = formatPhone(customer.phone);

        try {
            // Use Vapi's Phone Call API for outbound calls
            const response = await fetch('https://api.vapi.ai/call/phone', {
                method: 'POST',
                headers: {
                    'Authorization': 'Bearer 7c654710-662a-4da2-9788-592f15cc2fcc',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    phoneNumberId: "b1e1b956-6134-41a6-b513-75216615cdf7",
                    customer: {
                        number: formattedPhone,
                        name: customer.name,
                    },
                    assistant: {
                        transcriber: {
                            provider: "deepgram",
                            model: "nova-2",
                            language: "en-IN"
                        },
                        model: {
                            provider: "openai",
                            model: "gpt-4o",
                            messages: [
                                {
                                    role: "system",
                                    content: `You are a Telugu shop assistant calling from 'KLink Store'.
The user might speak in Telugu or English. You must ALWAYS reply in TELUGU.
IMPORTANT:
1. Speak ONLY in Telugu.
2. If they give a date (e.g., tomorrow, Monday, etc.), you MUST use the 'updatePromiseDate' tool.
3. If they say a date, say "Sare, Note cheskunnanu. Thanks!" and hang up.`
                                }
                            ],
                            tools: [
                                {
                                    type: "function",
                                    function: {
                                        name: "updatePromiseDate",
                                        description: "Updates the date when the customer promised to pay.",
                                        parameters: {
                                            type: "object",
                                            properties: {
                                                date: { type: "string", description: "The date mentioned (e.g., 'Tomorrow', 'Next Monday')" },
                                                reason: { type: "string", description: "Reason for delay" }
                                            },
                                            required: ["date"]
                                        }
                                    }
                                }
                            ]
                        },
                        voice: {
                            provider: "11labs",
                            voiceId: "EXAVITQu4vr4xnSDxMaL", // 'Sarah'
                            model: "eleven_multilingual_v2",
                        },
                        firstMessage: `Namaskaram ${customer.name} andi, nenu KLink store nunchi matladutunnanu. Mee ₹${customer.amount} pending undi, eppudu pay chestaru?`,
                    }
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || `API Error: ${response.status}`);
            }

            const callData = await response.json();
            setCallId(callData.id);
            setStatus('active');

            setTranscript([
                { role: 'assistant', text: `📞 Dialing ${formattedPhone}...` },
                { role: 'assistant', text: `Call Status: ${callData.status}` }
            ]);

            // Auto-complete after 60 seconds
            const endTimer = setTimeout(() => {
                if (status === 'active') endCall('tomorrow');
            }, 60000);

            return () => clearTimeout(endTimer);

        } catch (error: any) {
            console.error('❌ Failed to initiate call:', error);
            setStatus('failed');
            setTranscript([{ role: 'assistant', text: `❌ Error: ${error.message}` }]);
            setTimeout(() => onClose(), 5000);
        }
    };

    const endCall = async (reason?: string) => {
        if (callId) {
            try {
                await fetch(`https://api.vapi.ai/call/${callId}/end`, {
                    method: 'POST',
                    headers: { 'Authorization': 'Bearer 7c654710-662a-4da2-9788-592f15cc2fcc' }
                });
            } catch (err) { console.error('Error ending call:', err); }
        }

        // Intelligence Loop: Update DB
        if (status === 'active' || status === 'completed') {
            const extractedReason = typeof reason === 'string' ? reason : 'tomorrow';
            await updateCustomerPromise(extractedReason);
        }

        setStatus('completed');
        onResult({ status: 'success', promiseDate: typeof reason === 'string' ? reason : 'Tomorrow' });
        setTimeout(() => onClose(), 2000);
    };

    if (!isOpen || !customer) return null;

    return (
        <AnimatePresence>
            <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[100] flex items-center justify-center p-4">
                <motion.div
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.9, opacity: 0 }}
                    className="bg-gray-900 w-full max-w-md rounded-3xl overflow-hidden border border-gray-700 shadow-2xl relative"
                >
                    <div className="absolute inset-0 pointer-events-none opacity-20"
                        style={{ backgroundImage: 'linear-gradient(rgba(0, 255, 0, 0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(0, 255, 0, 0.1) 1px, transparent 1px)', backgroundSize: '20px 20px' }}>
                    </div>

                    <div className="p-6 text-center border-b border-gray-800 relative z-10">
                        <div className="w-24 h-24 bg-gradient-to-br from-blue-600 to-purple-700 rounded-full mx-auto flex items-center justify-center mb-4 relative shadow-[0_0_30px_rgba(59,130,246,0.5)]">
                            {status === 'failed' ? <AlertTriangle size={40} className="text-white" /> : <User size={40} className="text-white" />}
                            {status === 'active' && (
                                <div className="absolute inset-0 border-4 border-blue-400 rounded-full animate-ping opacity-50"></div>
                            )}
                        </div>
                        <h2 className="text-2xl font-bold text-white tracking-wide">{customer.name}</h2>
                        <p className="text-blue-400 font-mono text-sm mt-1">RECOVERING ₹{customer.amount} • {status.toUpperCase()}</p>
                    </div>

                    <div className="h-72 bg-black relative p-6 overflow-y-auto space-y-4 font-mono scrollbar-hide">
                        {status === 'active' && (
                            <div className="absolute top-1/2 left-0 right-0 flex justify-center gap-1.5 -translate-y-1/2 opacity-30 pointer-events-none">
                                {[...Array(12)].map((_, i) => (
                                    <motion.div
                                        key={i}
                                        animate={{ height: [10, 60, 10] }}
                                        transition={{ repeat: Infinity, duration: 0.8, delay: i * 0.05, ease: "easeInOut" }}
                                        className="w-1.5 bg-blue-500 rounded-full"
                                    />
                                ))}
                            </div>
                        )}

                        {transcript.map((t, i) => (
                            <motion.div key={i} initial={{ opacity: 0, x: t.role === 'assistant' ? -20 : 20 }} animate={{ opacity: 1, x: 0 }} className={`flex ${t.role === 'assistant' ? 'justify-start' : 'justify-end'}`}>
                                <div className={`max-w-[80%] p-3 rounded-2xl text-sm border ${t.role === 'assistant' ? 'bg-gray-800/80 border-gray-700 text-gray-200 rounded-tl-none' : 'bg-blue-600/90 border-blue-500 text-white rounded-tr-none'}`}>
                                    <span className="text-[10px] opacity-50 block mb-1 uppercase tracking-wider">{t.role === 'assistant' ? 'AI Agent' : 'Customer'}</span>
                                    {t.text}
                                </div>
                            </motion.div>
                        ))}
                    </div>

                    <div className="p-6 bg-gray-900 border-t border-gray-800 relative z-10">
                        <div className="flex justify-between items-center mb-6">
                            <div className="text-[10px] font-bold uppercase text-gray-500 tracking-widest">Sentiment Analysis</div>
                            <div className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-bold border ${sentiment === 'positive' ? 'bg-green-500/10 border-green-500/30 text-green-400' : 'bg-gray-800 border-gray-700 text-gray-400'}`}>
                                {sentiment === 'positive' ? <CheckCircle size={14} /> : <div className="w-2 h-2 bg-gray-400 rounded-full" />}
                                {sentiment.toUpperCase()}
                            </div>
                        </div>

                        <div className="flex gap-4">
                            <button onClick={() => endCall('tomorrow')} className="flex-1 bg-red-600 hover:bg-red-700 text-white py-4 rounded-xl font-bold flex items-center justify-center gap-2 active:scale-95 shadow-lg shadow-red-900/20">
                                <Phone size={20} className="fill-current" /> End Call
                            </button>
                            <div className="bg-gray-800 p-4 rounded-xl text-gray-500 border border-gray-700 flex items-center justify-center">
                                <Mic size={20} className={status === 'active' ? "animate-pulse text-blue-400" : ""} />
                            </div>
                        </div>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
};

export default LiveCallModal;
