import React, { useState, useRef, useEffect } from 'react';
import { Camera, Check, Loader2, X, Scan, Save, Plus, History, FileText, Calendar } from 'lucide-react';
import Tesseract from 'tesseract.js';
import * as pdfjsLib from 'pdfjs-dist';
import { supplierBillApi } from '../../services/api';

// Worker configuration for PDF.js
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

interface LineItem {
    id: string;
    productName: string;
    quantity: number;
    unit: string;
    totalAmount: number;
    costPrice: number; // Read-only, calculated
    sellingPrice: number; // Editable
    isMatched?: boolean; // From backend response
    matchScore?: number;
}

export const SupplierBillPage: React.FC = () => {
    const [file, setFile] = useState<File | null>(null);
    const [_previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [progress, setProgress] = useState(0);
    const [statusText, setStatusText] = useState('');
    const [lineItems, setLineItems] = useState<LineItem[]>([]);
    const [processingResult, setProcessingResult] = useState<any | null>(null);
    const [showScanner, setShowScanner] = useState(true);
    const [activeTab, setActiveTab] = useState<'scan' | 'manual' | 'history'>('scan');
    const [history, setHistory] = useState<any[]>([]);

    const [selectedBill, setSelectedBill] = useState<any | null>(null);

    useEffect(() => {
        if (activeTab === 'history') {
            loadHistory();
        }
    }, [activeTab]);

    const loadHistory = async () => {
        try {
            const res = await supplierBillApi.getHistory();
            setHistory(res.data);
        } catch (err) {
            console.error('Failed to load history', err);
        }
    };

    const handleManualAdd = () => {
        const newItem: LineItem = {
            id: Math.random().toString(36).substr(2, 9),
            productName: '',
            quantity: 1,
            unit: 'pc',
            totalAmount: 0,
            costPrice: 0,
            sellingPrice: 0
        };
        setLineItems(prev => [...prev, newItem]);
        setShowScanner(false);
    };

    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            handleFile(e.target.files[0]);
        }
    };

    const handleFile = async (selectedFile: File) => {
        setFile(selectedFile);
        setShowScanner(false);

        // Preview
        if (selectedFile.type.startsWith('image/')) {
            const url = URL.createObjectURL(selectedFile);
            setPreviewUrl(url);
            processImage(url);
        } else if (selectedFile.type === 'application/pdf') {
            setPreviewUrl(null); // No preview for PDF yet (or render first page)
            processPdf(selectedFile);
        }
    };

    const processImage = async (url: string) => {
        setIsProcessing(true);
        setStatusText('Initializing OCR...');
        setProgress(0);

        try {
            const result = await Tesseract.recognize(
                url,
                'eng',
                {
                    logger: m => {
                        if (m.status === 'recognizing text') {
                            setProgress(Math.round(m.progress * 100));
                            setStatusText(`Scanning... ${Math.round(m.progress * 100)}%`);
                        } else {
                            setStatusText(m.status);
                        }
                    }
                }
            );

            parseBillText(result.data.text);
        } catch (err) {
            console.error('OCR Error', err);
            alert('Failed to scan image');
        } finally {
            setIsProcessing(false);
        }
    };

    const processPdf = async (pdfFile: File) => {
        setIsProcessing(true);
        setStatusText('Processing PDF...');

        try {
            const arrayBuffer = await pdfFile.arrayBuffer();
            const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
            const page = await pdf.getPage(1); // Only first page for now

            const viewport = page.getViewport({ scale: 2 });
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            canvas.height = viewport.height;
            canvas.width = viewport.width;

            if (context) {
                await page.render({ canvasContext: context, viewport } as any).promise;
                const imageUrl = canvas.toDataURL('image/png');
                setPreviewUrl(imageUrl);
                await processImage(imageUrl);
            }
        } catch (err) {
            console.error('PDF Error', err);
            alert('Failed to process PDF');
            setIsProcessing(false);
        }
    };

    const parseBillText = (text: string) => {
        // Basic Parsing Logic for standard formats
        // Looking for lines with: [Name] [Qty] [Unit]? [Price]? [Total]
        // Regex is tricky, so we'll use heuristic line iteration

        const lines = text.split('\n');
        const items: LineItem[] = [];

        const qtyRegex = /(\d+(\.\d+)?)\s*(kg|g|gm|ltr|litre|ml|pc|pcs|pkt|packet)/i;

        lines.forEach((line) => {
            // Cleaning
            const cleanLine = line.trim();
            if (cleanLine.length < 5) return;

            // Skip header lines
            if (/total|subtotal|gst|tax|amount/i.test(cleanLine) && cleanLine.length < 20) return;

            // Try to find quantity+unit
            const qtyMatch = cleanLine.match(qtyRegex);

            // Try to find prices (assuming last number is total)
            const numbers = cleanLine.match(/(\d+(\.\d+)?)/g)?.map(Number) || [];

            if (qtyMatch && numbers.length >= 2) {
                // High confidence line
                const quantity = parseFloat(qtyMatch[1]);
                const unit = qtyMatch[3];
                const totalAmount = numbers[numbers.length - 1]; // Assume last number is total matching bill convention

                // Construct Name: Everything before quantity?
                const namePart = cleanLine.substring(0, qtyMatch.index).trim();

                if (namePart && totalAmount > 0) {
                    const cost = totalAmount / quantity;
                    items.push({
                        id: Math.random().toString(36).substr(2, 9),
                        productName: namePart,
                        quantity,
                        unit,
                        totalAmount,
                        costPrice: Math.round(cost),
                        sellingPrice: Math.round(cost * 1.05) // Default 5%
                    });
                }
            }
        });

        if (items.length === 0) {
            alert("Could not automatically detect items. Please add manually.");
        }
        setLineItems(items);
    };

    const handleUpdateItem = (id: string, field: keyof LineItem, value: any) => {
        setLineItems(prev => prev.map(item => {
            if (item.id === id) {
                const updated = { ...item, [field]: value };
                if (field === 'totalAmount' || field === 'quantity') {
                    updated.costPrice = updated.quantity > 0 ? Math.round(updated.totalAmount / updated.quantity) : 0;
                }
                return updated;
            }
            return item;
        }));
    };

    const handleRemoveItem = (id: string) => {
        setLineItems(prev => prev.filter(i => i.id !== id));
    };

    const handleProcessBill = async () => {
        setIsProcessing(true);
        setStatusText('Updating Inventory...');
        try {
            const payload = {
                lineItems: lineItems.map(i => ({
                    productName: i.productName,
                    quantity: i.quantity,
                    unit: i.unit,
                    totalAmount: i.totalAmount,
                    customSellingPrice: i.sellingPrice
                }))
            };

            const res = await supplierBillApi.process(payload);
            setProcessingResult(res.data);
            setLineItems([]);
            setFile(null);
            setPreviewUrl(null);
        } catch (err) {
            console.error(err);
            alert('Failed to process bill');
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-8 pb-48">
            <div className="flex flex-col md:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    <div className="bg-blue-100 dark:bg-blue-900/30 p-4 rounded-2xl text-blue-600 dark:text-blue-400">
                        <Scan size={32} />
                    </div>
                    <div>
                        <h2 className="text-3xl md:text-3xl font-black text-gray-900 dark:text-white tracking-tight">Supplier Bills</h2>
                        <p className="text-gray-500 font-medium text-sm md:text-base">Digitize bills, update stock & track history</p>
                    </div>
                </div>

                <div className="flex bg-gray-100 dark:bg-gray-800 p-1 rounded-xl">
                    <button
                        onClick={() => { setActiveTab('scan'); setShowScanner(true); }}
                        className={`px-6 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'scan' ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 hover:text-gray-900 dark:hover:text-gray-300'}`}
                    >
                        Scan
                    </button>
                    <button
                        onClick={() => { setActiveTab('manual'); if (lineItems.length === 0) handleManualAdd(); }}
                        className={`px-6 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'manual' ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 hover:text-gray-900 dark:hover:text-gray-300'}`}
                    >
                        Manual
                    </button>
                    <button
                        onClick={() => setActiveTab('history')}
                        className={`px-6 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'history' ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 hover:text-gray-900 dark:hover:text-gray-300'}`}
                    >
                        History
                    </button>
                </div>
            </div>

            {activeTab === 'history' ? (
                <div className="space-y-4">
                    {history.length === 0 ? (
                        <div className="text-center py-20 text-gray-400">
                            <History size={48} className="mx-auto mb-4 opacity-30" />
                            <p className="font-medium">No history found</p>
                        </div>
                    ) : (
                        <div className="grid gap-4">
                            {history.map((bill) => (
                                <div onClick={() => setSelectedBill(bill)} key={bill._id} className="bg-white dark:bg-gray-800 p-6 rounded-2xl border border-gray-100 dark:border-gray-700 hover:border-blue-200 transition-colors flex items-center justify-between group cursor-pointer">
                                    <div className="flex items-center gap-4">
                                        <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-xl text-blue-600 dark:text-blue-400">
                                            <FileText size={24} />
                                        </div>
                                        <div>
                                            <div className="font-bold text-gray-900 dark:text-white text-lg">Bill processed</div>
                                            <div className="flex items-center gap-4 text-sm text-gray-500 mt-1">
                                                <span className="flex items-center gap-1"><Calendar size={14} /> {new Date(bill.date).toLocaleDateString()}</span>
                                                <span>•</span>
                                                <span>{bill.itemCount} items</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <div className="font-black text-xl text-gray-900 dark:text-white">₹{bill.totalAmount.toLocaleString()}</div>
                                        <div className="text-primary-green text-xs font-bold uppercase tracking-wider mt-1">Processed</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            ) : (
                <>
                    {/* Reuse existing Processing/Result UI */}

                    {processingResult ? (
                        <div className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/10 dark:to-emerald-900/10 border border-green-100 dark:border-green-800 rounded-[2.5rem] p-6 md:p-10 animate-in slide-in-from-bottom duration-500 shadow-xl shadow-green-500/5">
                            <div className="flex flex-col md:flex-row items-start md:items-center gap-5 mb-8">
                                <div className="bg-green-500 text-white p-4 rounded-2xl shadow-lg shadow-green-500/30"><Check size={32} strokeWidth={3} /></div>
                                <div>
                                    <h3 className="text-2xl md:text-3xl font-black text-gray-900 dark:text-white">Processed Successfully</h3>
                                    <p className="text-green-700 dark:text-green-400 font-bold">Inventory updated for {processingResult.results.length} items</p>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {processingResult.results.map((res: any, i: number) => (
                                    <div key={i} className="bg-white dark:bg-gray-800 p-5 rounded-2xl border border-gray-100 dark:border-gray-700 flex justify-between items-center shadow-sm">
                                        <div>
                                            <div className="font-black text-gray-900 dark:text-white text-lg">{res.match || res.input.productName}</div>
                                            <div className="text-xs font-bold flex gap-2 mt-1 flex-wrap">
                                                <span className={`px-2 py-0.5 rounded-lg uppercase tracking-wider ${res.action === 'created' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'}`}>
                                                    {res.action === 'created' ? 'NEW' : 'STOCK ADDED'}
                                                </span>
                                                {res.priceUpdate && (
                                                    <span className="text-orange-600 bg-orange-50 px-2 py-0.5 rounded-lg">₹{res.priceUpdate.old} → ₹{res.priceUpdate.new}</span>
                                                )}
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <div className="font-black text-2xl text-gray-900 dark:text-white pb-1">+{res.input.quantity}</div>
                                            <div className="text-xs text-gray-400 font-black uppercase tracking-wider">{res.input.unit}</div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <button
                                onClick={() => { setProcessingResult(null); setShowScanner(true); }}
                                className="mt-10 w-full bg-gray-900 dark:bg-white text-white dark:text-black py-5 rounded-3xl font-black text-xl shadow-2xl hover:scale-[1.01] transition-transform"
                            >
                                Scan Another Bill
                            </button>
                        </div>
                    ) : (
                        <>
                            {activeTab === 'scan' && showScanner && (
                                <div
                                    className="border-4 border-dashed border-gray-200 dark:border-gray-700 rounded-[3rem] p-8 md:p-16 text-center bg-gray-50 dark:bg-gray-800/50 hover:bg-white dark:hover:bg-gray-800 hover:border-blue-400 dark:hover:border-blue-500 transition-all cursor-pointer group relative overflow-hidden"
                                    onClick={() => fileInputRef.current?.click()}
                                >
                                    <div className="absolute inset-0 bg-blue-50/50 dark:bg-blue-900/10 opacity-0 group-hover:opacity-100 transition-opacity" />
                                    <input
                                        type="file"
                                        ref={fileInputRef}
                                        className="hidden"
                                        accept="image/*,application/pdf"
                                        capture="environment"
                                        onChange={handleFileChange}
                                    />
                                    <div className="relative z-10">
                                        <div className="w-20 h-20 md:w-28 md:h-28 bg-white dark:bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-6 md:mb-8 shadow-xl shadow-blue-100 dark:shadow-none group-hover:scale-110 transition-transform duration-300">
                                            <Camera size={40} className="text-blue-500 dark:text-blue-400 md:w-12 md:h-12" />
                                        </div>
                                        <h3 className="text-2xl md:text-3xl font-black text-gray-900 dark:text-white mb-2 md:mb-3">Tap to Scan Bill</h3>
                                        <p className="text-gray-500 dark:text-gray-400 font-bold text-sm md:text-lg">Support Camera, Image & PDF</p>
                                    </div>
                                </div>
                            )}

                            {isProcessing && (
                                <div className="bg-white dark:bg-gray-800 rounded-[2.5rem] p-12 shadow-2xl border border-gray-100 dark:border-gray-700 text-center">
                                    <Loader2 className="animate-spin mx-auto text-primary-green mb-6" size={64} />
                                    <h3 className="text-2xl font-black text-gray-900 dark:text-white mb-2">{statusText}</h3>
                                    <p className="text-gray-400 font-medium mb-8">Processing with OCR AI...</p>
                                    <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-4 overflow-hidden">
                                        <div className="bg-primary-green h-full transition-all duration-300 ease-out" style={{ width: `${progress}%` }}></div>
                                    </div>
                                </div>
                            )}

                            {(!isProcessing && lineItems.length > 0 && (activeTab === 'manual' || (activeTab === 'scan' && file))) && (
                                <div className="bg-white dark:bg-gray-800 rounded-[2.5rem] shadow-2xl overflow-hidden border border-gray-100 dark:border-gray-700 animate-in fade-in duration-500">
                                    <div className="p-6 md:p-8 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center bg-gray-50/50 dark:bg-gray-900/50">
                                        <div>
                                            <h3 className="text-xl md:text-2xl font-black text-gray-900 dark:text-white">
                                                {activeTab === 'manual' ? 'Enter Items' : 'Review Items'}
                                            </h3>
                                            <p className="text-gray-500 font-medium text-sm">{lineItems.length} items</p>
                                        </div>
                                        <button
                                            onClick={() => {
                                                setLineItems([]);
                                                setShowScanner(true);
                                                setFile(null);
                                                setPreviewUrl(null);
                                            }}
                                            className="bg-red-50 text-red-500 hover:bg-red-100 px-4 py-2 rounded-xl font-bold text-xs uppercase tracking-wider transition-colors"
                                        >
                                            Clear All
                                        </button>
                                    </div>
                                    <div className="overflow-x-auto custom-scrollbar">
                                        <table className="w-full text-left min-w-[800px]">
                                            <thead className="bg-gray-50 dark:bg-gray-900/50 text-xs uppercase text-gray-400 font-bold border-b border-gray-100 dark:border-gray-700">
                                                <tr>
                                                    <th className="p-4 md:p-6 w-[30%] tracking-wider">Product</th>
                                                    <th className="p-4 md:p-6 w-[10%] tracking-wider text-center">Qty</th>
                                                    <th className="p-4 md:p-6 w-[10%] tracking-wider text-center">Unit</th>
                                                    <th className="p-4 md:p-6 w-[15%] tracking-wider text-right">Total</th>
                                                    <th className="p-4 md:p-6 w-[15%] tracking-wider text-right">Cost/Unit</th>
                                                    <th className="p-4 md:p-6 w-[20%] tracking-wider">Sell/Unit</th>
                                                    <th className="p-4 md:p-6 w-[5%]"></th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-100 dark:divide-gray-700 text-sm">
                                                {lineItems.map(item => (
                                                    <tr key={item.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors group">
                                                        <td className="p-4 md:p-6">
                                                            <input
                                                                value={item.productName}
                                                                onChange={(e) => handleUpdateItem(item.id, 'productName', e.target.value)}
                                                                className="w-full bg-transparent font-black text-gray-900 dark:text-white text-base md:text-lg outline-none border-b-2 border-transparent focus:border-primary-green placeholder-gray-300 transition-all"
                                                                placeholder="Name"
                                                            />
                                                        </td>
                                                        <td className="p-4 md:p-6 text-center">
                                                            <input
                                                                type="number"
                                                                value={item.quantity}
                                                                onChange={(e) => handleUpdateItem(item.id, 'quantity', parseFloat(e.target.value))}
                                                                className="w-16 bg-transparent outline-none font-bold text-gray-700 dark:text-gray-300 text-base text-center"
                                                            />
                                                        </td>
                                                        <td className="p-4 md:p-6 text-center">
                                                            <input
                                                                value={item.unit}
                                                                onChange={(e) => handleUpdateItem(item.id, 'unit', e.target.value)}
                                                                className="w-16 bg-gray-100 dark:bg-gray-900 rounded-lg px-2 py-1 outline-none text-gray-500 font-bold text-xs uppercase tracking-wider text-center"
                                                            />
                                                        </td>
                                                        <td className="p-4 md:p-6 text-right">
                                                            <span className="text-gray-400 mr-1">₹</span>
                                                            <input
                                                                type="number"
                                                                value={item.totalAmount}
                                                                onChange={(e) => handleUpdateItem(item.id, 'totalAmount', parseFloat(e.target.value))}
                                                                className="w-20 bg-transparent outline-none font-black text-gray-900 dark:text-white text-lg text-right"
                                                            />
                                                        </td>
                                                        <td className="p-4 md:p-6 text-right">
                                                            <div className="text-gray-400 font-bold text-lg">
                                                                ₹{item.costPrice}
                                                            </div>
                                                        </td>
                                                        <td className="p-4 md:p-6">
                                                            <div className="relative group-focus-within:scale-105 transition-transform max-w-[120px]">
                                                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-bold">₹</span>
                                                                <input
                                                                    type="number"
                                                                    value={item.sellingPrice}
                                                                    onChange={(e) => handleUpdateItem(item.id, 'sellingPrice', parseFloat(e.target.value))}
                                                                    className="w-full pl-7 bg-yellow-50 dark:bg-yellow-900/20 border-2 border-yellow-100 dark:border-yellow-900/50 rounded-xl py-2 focus:border-yellow-400 outline-none font-black text-gray-900 dark:text-white text-lg shadow-sm"
                                                                />
                                                            </div>
                                                        </td>
                                                        <td className="p-4 md:p-6 text-center">
                                                            <button onClick={() => handleRemoveItem(item.id)} className="p-2 hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-300 hover:text-red-500 rounded-full transition-colors">
                                                                <X size={20} />
                                                            </button>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                    <div className="p-6 md:p-8 bg-gray-50 dark:bg-gray-900/50 border-t border-gray-100 dark:border-gray-700 flex justify-between items-center sticky bottom-0 z-10">
                                        <button
                                            onClick={handleManualAdd}
                                            className="text-blue-600 font-bold flex items-center gap-2 hover:bg-blue-50 dark:hover:bg-blue-900/20 px-4 py-2 rounded-xl transition-colors"
                                        >
                                            <Plus size={20} /> Add Item
                                        </button>
                                        <button
                                            onClick={handleProcessBill}
                                            className="bg-primary-green hover:brightness-110 text-white px-8 md:px-10 py-3 md:py-4 rounded-2xl font-black text-lg md:text-xl shadow-xl shadow-primary-green/30 flex items-center justify-center gap-3 transform active:scale-95 transition-all"
                                        >
                                            <Save size={24} /> PROCESS
                                        </button>
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </>
            )}

            {/* Bill Details Modal */}
            {selectedBill && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white dark:bg-gray-800 rounded-[2rem] w-full max-w-2xl max-h-[80vh] flex flex-col shadow-2xl animate-in zoom-in-95 duration-200">
                        <div className="p-6 md:p-8 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center">
                            <div>
                                <h3 className="text-2xl font-black text-gray-900 dark:text-white">Bill Details</h3>
                                <div className="flex gap-3 text-sm text-gray-500 mt-1 font-medium">
                                    <span className="flex items-center gap-1"><Calendar size={14} /> {new Date(selectedBill.date).toLocaleDateString()}</span>
                                    <span>•</span>
                                    <span>{selectedBill.itemCount} items</span>
                                </div>
                            </div>
                            <button
                                onClick={() => setSelectedBill(null)}
                                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"
                            >
                                <X size={24} className="text-gray-500" />
                            </button>
                        </div>

                        <div className="overflow-y-auto custom-scrollbar p-6 md:p-8 space-y-4">
                            <div className="grid gap-3">
                                {selectedBill.items.map((item: any, idx: number) => (
                                    <div key={idx} className="flex justify-between items-center bg-gray-50 dark:bg-gray-900/50 p-4 rounded-xl">
                                        <div>
                                            <div className="font-bold text-gray-900 dark:text-white">{item.productName}</div>
                                            <div className="text-xs text-gray-500 flex gap-2 mt-1">
                                                <span className="bg-gray-200 dark:bg-gray-700 px-1.5 py-0.5 rounded text-gray-700 dark:text-gray-300 font-bold uppercase text-[10px]">{item.unit}</span>
                                                <span className="font-medium">Qty: {item.quantity}</span>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <div className="font-black text-gray-900 dark:text-white">₹{item.totalAmount}</div>
                                            <div className="text-xs text-gray-500">CP: ₹{item.costPrice} | SP: ₹{item.sellingPrice}</div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="p-6 md:p-8 border-t border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/50 rounded-b-[2rem] flex justify-between items-center">
                            <span className="text-gray-500 font-bold">Total Amount</span>
                            <span className="text-2xl font-black text-gray-900 dark:text-white">₹{selectedBill.totalAmount.toLocaleString()}</span>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
