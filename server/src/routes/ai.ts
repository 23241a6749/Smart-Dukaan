import express from 'express';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { auth } from '../middleware/auth.js';

const router = express.Router();

let geminiModel: any = null;
try {
    if (process.env.GEMINI_API_KEY) {
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        geminiModel = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    }
} catch (e) {
    console.error('Gemini AI init failed in AI router:', e);
}

// Simple in-memory cache for translations (Production should use Redis or DB)
const translationCache = new Map<string, string>();

router.post('/translate', auth, async (req, res) => {
    try {
        const { text, targetLanguage } = req.body;

        if (!text || !targetLanguage) {
            return res.status(400).json({ message: 'Text and targetLanguage are required' });
        }

        if (targetLanguage === 'en') {
            return res.json({ translatedText: text });
        }

        const cacheKey = `${text}_${targetLanguage}`;
        if (translationCache.has(cacheKey)) {
            return res.json({ translatedText: translationCache.get(cacheKey) });
        }

        if (!geminiModel) {
            return res.status(503).json({ message: 'AI Translation service not available' });
        }

        const prompt = `Translate the following text to ${targetLanguage}. 
        Keep the meaning exactly the same. 
        DO NOT translate numbers, currency symbols (like ₹), dates, phone numbers, or product SKUs/IDs.
        Only translate the descriptive text and UI labels.
        Text to translate: "${text}"
        Return ONLY the translated text, nothing else.`;

        const result = await geminiModel.generateContent(prompt);
        const response = await result.response;
        const translatedText = response.text().trim().replace(/^"|"$/g, '');

        translationCache.set(cacheKey, translatedText);

        res.json({ translatedText });
    } catch (err: any) {
        console.error('Translation error:', err.message);
        res.status(500).json({ message: 'Translation failed' });
    }
});

export { router as aiRouter };
