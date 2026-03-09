import OpenAI from 'openai';

const isOR = (process.env.OPENAI_API_KEY || '').startsWith('sk-or');
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY || 'dummy_key_for_build',
    ...(isOR ? { baseURL: "https://openrouter.ai/api/v1" } : {})
});

export type Intent = 'PAYMENT_PROMISED' | 'EXTENSION_REQUESTED' | 'DISPUTE' | 'UNKNOWN';

export async function classifyIntent(messageBody: string): Promise<Intent> {
    const systemPrompt = `You are a debt collection assistant intent classifier.
    Read the following incoming customer message and classify its intent.
    You MUST respond with exactly one of these strings, and absolutely nothing else:
    PAYMENT_PROMISED
    EXTENSION_REQUESTED
    DISPUTE
    UNKNOWN

    If they explicitly promise to pay soon (e.g. "I will pay tomorrow", "Paying shortly", "Sent the money"): PAYMENT_PROMISED
    If they ask for more time or a delay (e.g. "Can I pay next week?", "Need a few days"): EXTENSION_REQUESTED
    If they disagree with the bill (e.g. "I already paid this!", "This amount is wrong"): DISPUTE
    If it's anything else, generic, or unintelligible: UNKNOWN
    `;

    try {
        if (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== 'dummy_key_for_build') {
            const response = await openai.chat.completions.create({
                model: isOR ? 'openai/gpt-4o-mini' : 'gpt-4o-mini',
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: messageBody }
                ],
                max_tokens: 10,
                temperature: 0.1,
            });

            const rawIntent = response.choices[0].message?.content?.trim().toUpperCase() || 'UNKNOWN';

            if (['PAYMENT_PROMISED', 'EXTENSION_REQUESTED', 'DISPUTE', 'UNKNOWN'].includes(rawIntent)) {
                return rawIntent as Intent;
            }
            return 'UNKNOWN';

        } else {
            // Local fallback logic if API key isn't present
            const lowerMsg = messageBody.toLowerCase();
            if (lowerMsg.includes('pay') || lowerMsg.includes('sent') || lowerMsg.includes('done')) {
                if (lowerMsg.includes('wait') || lowerMsg.includes('next') || lowerMsg.includes('later')) {
                    return 'EXTENSION_REQUESTED';
                }
                return 'PAYMENT_PROMISED';
            }
            if (lowerMsg.includes('wrong') || lowerMsg.includes('already') || lowerMsg.includes('mistake')) {
                return 'DISPUTE';
            }
            return 'UNKNOWN';
        }
    } catch (error) {
        console.error('Intent Classification Error:', error);
        return 'UNKNOWN';
    }
}
