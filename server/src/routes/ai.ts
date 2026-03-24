import express, { Request, Response } from 'express';
import OpenAI from 'openai';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { auth } from '../middleware/auth.js';

const router = express.Router();
const uploadDir = 'uploads/';
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
}
const upload = multer({ dest: uploadDir });

let openai: OpenAI | null = null;
try {
    if (process.env.OPENAI_API_KEY) {
        openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY,
        });
    }
} catch (e) {
    console.error('OpenAI init failed in AI router:', e);
}

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

        if (!openai) {
            return res.status(503).json({ message: 'AI Translation service not available' });
        }

        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                {
                    role: "system",
                    content: `You are a professional translator for a Kirana/MSME shop application. 
                    Translate the text to ${targetLanguage}.
                    CONSTRAINTS:
                    - Keep the meaning exactly the same.
                    - DO NOT translate numbers, currency symbols (like ₹), dates, phone numbers, customer names, or transaction IDs.
                    - Only translate descriptive text, product names, categories, and UI labels.
                    - Return ONLY the translated string.`
                },
                {
                    role: "user",
                    content: text
                }
            ],
            temperature: 0,
        });

        const translatedText = response.choices[0].message.content?.trim() || text;
        translationCache.set(cacheKey, translatedText);

        res.json({ translatedText });
    } catch (err: any) {
        console.error('Translation error:', err.message);
        res.status(500).json({ message: 'Translation failed' });
    }
});

router.post('/batch-translate', auth, async (req, res) => {
    try {
        const { texts, targetLanguage } = req.body;

        if (!Array.isArray(texts) || !targetLanguage) {
            return res.status(400).json({ message: 'Texts array and targetLanguage are required' });
        }

        if (targetLanguage === 'en') {
            const result: Record<string, string> = {};
            texts.forEach(t => result[t] = t);
            return res.json({ translations: result });
        }

        const translations: Record<string, string> = {};
        const toTranslate: string[] = [];

        texts.forEach(text => {
            const cacheKey = `${text}_${targetLanguage}`;
            if (translationCache.has(cacheKey)) {
                translations[text] = translationCache.get(cacheKey)!;
            } else {
                toTranslate.push(text);
            }
        });

        if (toTranslate.length === 0) {
            return res.json({ translations });
        }

        if (!openai) {
            return res.status(503).json({ message: 'AI Translation service not available' });
        }

        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                {
                    role: "system",
                    content: `You are a professional translator for a Kirana/MSME shop application. 
                    Translate the provided list of strings into ${targetLanguage}.
                    CONSTRAINTS:
                    - Keep the meaning exactly the same.
                    - DO NOT translate numbers, currency symbols (₹), dates, phone numbers, customer names, or transaction IDs.
                    - Return a JSON object where keys are the original strings and values are the translations.`
                },
                {
                    role: "user",
                    content: JSON.stringify(toTranslate)
                }
            ],
            response_format: { type: "json_object" },
            temperature: 0,
        });

        const content = response.choices[0].message.content;
        if (content) {
            const batchResult = JSON.parse(content);
            // The AI might return an object where keys are the strings.
            // Let's merge them into our translations object and update cache.
            Object.entries(batchResult).forEach(([original, translated]) => {
                const trans = String(translated);
                translations[original] = trans;
                translationCache.set(`${original}_${targetLanguage}`, trans);
            });
        }

        // Ensure all requested texts have an entry (fallback to original if missing)
        texts.forEach(t => {
            if (!translations[t]) translations[t] = t;
        });

        res.json({ translations });
    } catch (err: any) {
        console.error('Batch translation error:', err.message);
        res.status(500).json({ message: 'Batch translation failed' });
    }
});

router.post('/parse-voice-command', auth, async (req, res) => {
    try {
        const { command } = req.body;

        if (!command) {
            return res.status(400).json({ message: 'Command is required' });
        }

        if (!openai) {
            return res.status(503).json({ message: 'AI Parsing service not available' });
        }

        const items = await getParsedItemsFromText(command, openai);
        res.json({ items });
    } catch (err: any) {
        console.error('AI Parsing error:', err.message);
        res.status(500).json({ message: 'AI Parsing failed' });
    }
});

router.post('/process-voice-blob', auth, upload.single('audio'), async (req: any, res: any) => {
    const filePath = req.file?.path;
    let tempWebmPath: string | null = null;

    try {
        if (!filePath || !openai) {
            return res.status(400).json({ message: 'Audio file or AI service unavailable' });
        }

        // Whisper often requires a file extension to correctly detect the codec
        tempWebmPath = `${filePath}.webm`;
        fs.renameSync(filePath, tempWebmPath);

        // 1. Transcribe with Whisper
        const transcription = await openai.audio.transcriptions.create({
            file: fs.createReadStream(tempWebmPath),
            model: "whisper-1",
        });

        const command = transcription.text;
        if (!command || !command.trim()) {
            return res.json({ items: [], transcript: '' });
        }

        // 2. Parse text with GPT
        const items = await getParsedItemsFromText(command, openai);

        res.json({ items, transcript: command });
    } catch (err: any) {
        console.error('Voice blob processing error:', err.message);
        res.status(500).json({ message: 'Voice processing failed' });
    } finally {
        // Clean up temp files
        if (tempWebmPath && fs.existsSync(tempWebmPath)) {
            fs.unlinkSync(tempWebmPath);
        } else if (filePath && fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
    }
});

/**
 * Shared logic to extract items from text command
 */
async function getParsedItemsFromText(command: string, client: OpenAI) {
    const response = await client.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
            {
                role: "system",
                content: `You are an intelligent voice assistant for a Kirana/MSME shop billing application. 
                The user will provide a voice command (potentially in English, Hindi, Tamil, or mixed Hinglish) to add items to their cart.
                Extract the product names, quantities, and units.
                
                CONSTRAINTS:
                - Normalize product names to simple English (e.g., "cheeni" -> "sugar", "doodh" -> "milk").
                - If no quantity is mentioned, assume 1.
                - If a unit is mentioned (kg, l, packet, piece), include it.
                - Search for products in the input string.
                - Return ONLY a JSON array of objects with the key "items".
                - Example Output: {"items": [{"product": "sugar", "quantity": 2, "unit": "kg"}, {"product": "milk", "quantity": 3, "unit": "liter"}]}`
            },
            {
                role: "user",
                content: command
            }
        ],
        response_format: { type: "json_object" },
        temperature: 0,
    });

    const content = response.choices[0].message.content;
    if (content) {
        const result = JSON.parse(content);
        return result.items || result.products || Object.values(result)[0] || [];
    }
    return [];
}

export { router as aiRouter };
