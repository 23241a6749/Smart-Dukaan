import React, { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import axios from 'axios';

type Language = 'en' | 'hi' | 'te';

// Static keys we still want to keep for convenience + initial load
const staticTranslations = {
    en: {
        billing: 'Billing',
        customers: 'Customers',
        products: 'Products',
        khata: 'Khata',
        inventory: 'Stock',
        payments: 'Payments',
        analytics: 'Analytics',
        toggleTitle: 'Toggle Language',
        tapToAdd: 'Billing',
        viewCart: 'View Cart',
    },
    hi: {
        billing: 'बिलिंग',
        customers: 'ग्राहक',
        products: 'उत्पाद',
        khata: 'खाता',
        inventory: 'स्टॉक',
        payments: 'भुगतान',
        analytics: 'एनालिटिक्स',
        toggleTitle: 'भाषा बदलें',
        tapToAdd: 'बिलिंग',
        viewCart: 'कार्ट देखें',
    },
    te: {
        billing: 'బిల్లింగ్',
        customers: 'ఖాతాదారులు',
        products: 'సరుకులు',
        khata: 'ఖాతా',
        inventory: 'స్టాక్',
        payments: 'చెల్లింపులు',
        analytics: 'విశ్లేషణ',
        toggleTitle: 'భాష మార్చండి',
        tapToAdd: 'బిల్లింగ్',
        viewCart: 'కార్ట్ చూడండి',
    }
};

interface LanguageContextType {
    language: Language;
    setLanguage: (lang: Language) => void;
    t: any; // Dynamic translation proxy or map
    translate: (text: string) => string;
    toggleLanguage: () => void;
    isTranslating: boolean;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [language, setLanguage] = useState<Language>(() => {
        return (localStorage.getItem('preferred_language') as Language) || 'en';
    });
    const [cache, setCache] = useState<Record<string, string>>(() => {
        const saved = localStorage.getItem(`translations_${language}`);
        return saved ? JSON.parse(saved) : {};
    });
    const [isTranslating] = useState(false);

    // Persist language
    useEffect(() => {
        localStorage.setItem('preferred_language', language);
        // Load cache for new language
        const saved = localStorage.getItem(`translations_${language}`);
        setCache(saved ? JSON.parse(saved) : {});
    }, [language]);

    // Save cache updates
    useEffect(() => {
        localStorage.setItem(`translations_${language}`, JSON.stringify(cache));
    }, [cache, language]);

    const translate = (text: string): string => {
        if (!text) return '';
        if (language === 'en') return text;

        // Check local cache
        if (cache[text]) return cache[text];

        // If not in cache, trigger background translation
        // We don't await here to avoid blocking UI
        fetchTranslation(text, language);

        // Fallback to English while translating
        return text;
    };

    const fetchTranslation = async (text: string, targetLang: Language) => {
        if (targetLang === 'en' || cache[text]) return;

        try {
            const token = localStorage.getItem('token');
            if (!token) return;

            const res = await axios.post(`${import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:5001/api'}/ai/translate`, {
                text,
                targetLanguage: targetLang
            }, {
                headers: { Authorization: `Bearer ${token}` }
            });

            const translated = res.data.translatedText;
            if (translated) {
                setCache(prev => ({ ...prev, [text]: translated }));
            }
        } catch (err) {
            console.error('Dynamic translation failed:', err);
        }
    };

    const toggleLanguage = () => {
        setLanguage(prev => {
            if (prev === 'en') return 'hi';
            if (prev === 'hi') return 'te';
            return 'en';
        });
    };

    // Proxy for t.key access (backward compatibility for existing code)
    const tProxy = new Proxy(staticTranslations[language] || staticTranslations.en, {
        get: (target: any, prop: string) => {
            if (prop in target) return target[prop];
            // If key not in static, try to treat it as a string to translate (unlikely for t.key)
            return prop;
        }
    });

    return (
        <LanguageContext.Provider value={{
            language,
            setLanguage,
            t: tProxy,
            translate,
            toggleLanguage,
            isTranslating
        }}>
            {children}
        </LanguageContext.Provider>
    );
};

export const useLanguage = () => {
    const context = useContext(LanguageContext);
    if (!context) throw new Error('useLanguage must be used within a LanguageProvider');
    return context;
};

