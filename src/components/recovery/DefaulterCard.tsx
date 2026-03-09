import { PhoneOutgoing, Clock } from 'lucide-react';

const DefaulterCard = ({ customer, onRecover }: { customer: any, onRecover: (customer: any) => void }) => {
    return (
        <div className="bg-white dark:bg-[#0A0A0A] p-6 rounded-[1.5rem] border border-gray-100 dark:border-white/5 shadow-sm flex items-center justify-between hover:border-blue-500/30 transition-all hover:bg-gray-50 dark:hover:bg-white/[0.02] group">
            <div className="flex items-center gap-5">
                <div className="w-14 h-14 bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-500 rounded-2xl flex items-center justify-center font-black text-xl relative border border-transparent dark:border-red-500/20">
                    {customer.name[0]}
                    {customer.recoveryStatus === 'Promised' && (
                        <div className="absolute -top-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-white dark:border-[#0A0A0A]"></div>
                    )}
                </div>
                <div className="flex flex-col">
                    <div className="flex items-center gap-2">
                        <h3 className="font-black text-gray-900 dark:text-white text-lg tracking-tight">{customer.name}</h3>
                        {customer.recoveryStatus === 'Promised' && (
                            <span className="text-[9px] font-black bg-green-500/10 text-green-500 px-2 py-0.5 rounded-md border border-green-500/20 uppercase tracking-widest">
                                PROMISED
                            </span>
                        )}
                    </div>
                    <p className="text-red-500 dark:text-red-500 text-sm font-black font-mono tracking-tighter">₹{customer.amount.toLocaleString()}</p>

                    {customer.nextCallDate && customer.recoveryStatus === 'Promised' && (
                        <p className="text-[10px] text-gray-400 mt-1 flex items-center gap-1 font-bold font-mono">
                            <Clock size={10} className="text-green-500" /> RE-ENGAGE: {new Date(customer.nextCallDate).toLocaleDateString()}
                        </p>
                    )}

                    {customer.risk && !customer.nextCallDate && (
                        <div className={`text-[9px] font-black px-2 py-0.5 rounded-md w-fit mt-1 border uppercase tracking-widest ${customer.risk === 'HIGH' ? 'bg-red-500/10 text-red-500 border-red-500/20' :
                                customer.risk === 'MEDIUM' ? 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20' :
                                    'bg-green-500/10 text-green-500 border-green-500/20'
                            }`}>
                            {customer.risk} RISK
                        </div>
                    )}
                </div>
            </div>

            <div className="flex items-center gap-6">
                <div className="text-right hidden sm:block">
                    <p className="text-[10px] text-gray-500 font-black uppercase tracking-widest mb-1">Overdue</p>
                    <div className="flex items-center gap-1 text-sm text-gray-700 dark:text-gray-300 font-mono font-bold">
                        <Clock size={14} className="text-gray-400" /> {customer.days}d
                    </div>
                </div>

                <button
                    onClick={() => onRecover(customer)}
                    className={`h-12 px-6 rounded-xl font-black text-xs uppercase tracking-widest flex items-center gap-2 transition-all active:scale-95 shadow-lg border ${customer.recoveryStatus === 'Promised'
                            ? 'bg-green-600/10 border-green-500/30 text-green-500 hover:bg-green-600 hover:text-white'
                            : 'bg-black dark:bg-white text-white dark:text-black border-transparent dark:hover:bg-blue-500 dark:hover:text-white'
                        }`}
                >
                    <PhoneOutgoing size={14} />
                    {customer.recoveryStatus === 'Promised' ? 'RE-CALL' : 'RECOVER'}
                </button>
            </div>
        </div>
    );
};

export default DefaulterCard;
