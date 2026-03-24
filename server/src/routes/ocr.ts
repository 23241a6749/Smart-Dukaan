import express from 'express';
import { auth } from '../middleware/auth.js';

const router = express.Router();

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';

interface OcrLineItem {
    productName: string;
    quantity: number;
    unitPrice: number;
    totalAmount: number;
    unit?: string;
}

interface OcrResult {
    items: OcrLineItem[];
    subtotal: number;
    tax: number;
    discount: number;
    totalAmount: number;
    invoiceNumber?: string;
    billDate?: string;
    storeName?: string;
    rawText?: string;
}

async function callOpenAIVision(model: string, imageInput: { url: string }, prompt: string): Promise<any> {
    const response = await fetch(`${OPENAI_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${OPENAI_API_KEY}`
        },
        body: JSON.stringify({
            model: model,
            messages: [
                {
                    role: 'user',
                    content: [
                        { type: 'text', text: prompt },
                        {
                            type: 'image_url',
                            image_url: imageInput
                        }
                    ]
                }
            ],
            max_tokens: 2000,
            response_format: { type: 'json_object' }
        })
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`OpenAI API error: ${error}`);
    }

    return response.json();
}

router.post('/scan-bill', auth, async (req, res) => {
    try {
        const { imageBase64, imageUrl } = req.body;

        if (!imageBase64 && !imageUrl) {
            res.status(400).json({ message: 'Either imageBase64 or imageUrl is required' });
            return;
        }

        let imageInputUrl: string;
        
        if (imageUrl) {
            imageInputUrl = imageUrl;
        } else if (imageBase64) {
            // Handle both data URL format and raw base64
            imageInputUrl = imageBase64.startsWith('data:') 
                ? imageBase64 
                : `data:image/jpeg;base64,${imageBase64}`;
        } else {
            res.status(400).json({ message: 'Invalid image data' });
            return;
        }

        const prompt = `You are an expert at analyzing Indian retail bills and receipts. 
Your task is to extract ALL line items from the bill image and return a clean JSON response.

## Output Format (STRICT JSON):
{
  "items": [
    {
      "productName": "exact product name from bill",
      "quantity": number,
      "unitPrice": number,
      "totalAmount": number,
      "unit": "pc/kg/ltr/etc or leave empty"
    }
  ],
  "subtotal": number,
  "tax": number,
  "discount": number,
  "totalAmount": number,
  "invoiceNumber": "invoice/bill number if visible",
  "billDate": "date if visible in DD/MM/YYYY format",
  "storeName": "store name if visible"
}

## Important Rules:
1. Extract EVERY single line item from the bill - don't miss any
2. If quantity is not explicitly written, assume quantity = 1
3. Calculate unitPrice = totalAmount / quantity
4. All monetary values should be numbers (not strings)
5. If tax is not visible, set tax to 0
6. If discount is not visible, set discount to 0
7. For products with variant sizes (e.g., "1L", "500ml"), include that in productName
8. Look for Hindi/Telugu text and translate product names to English where possible
9. Total Amount should be the FINAL amount to pay (after tax and discounts)
10. If totalAmount is not explicitly shown, calculate: subtotal + tax - discount

Return ONLY valid JSON, no other text.`;

        console.log('[OCR] Processing bill with GPT-4o Mini...');
        
        const result = await callOpenAIVision('gpt-4o-mini', { url: imageInputUrl }, prompt);
        
        const content = result.choices?.[0]?.message?.content;
        
        if (!content) {
            res.status(500).json({ message: 'Failed to get OCR response' });
            return;
        }

        try {
            const parsed = JSON.parse(content) as OcrResult;
            
            // Validate and clean the response
            const cleanResult: OcrResult = {
                items: Array.isArray(parsed.items) ? parsed.items.map(item => ({
                    productName: item.productName || 'Unknown Item',
                    quantity: Math.max(1, Number(item.quantity) || 1),
                    unitPrice: Number(item.unitPrice) || 0,
                    totalAmount: Number(item.totalAmount) || 0,
                    unit: item.unit || ''
                })) : [],
                subtotal: Number(parsed.subtotal) || 0,
                tax: Number(parsed.tax) || 0,
                discount: Number(parsed.discount) || 0,
                totalAmount: Number(parsed.totalAmount) || 0,
                invoiceNumber: parsed.invoiceNumber || '',
                billDate: parsed.billDate || '',
                storeName: parsed.storeName || ''
            };

            console.log(`[OCR] Scanned bill with ${cleanResult.items.length} items, total: ₹${cleanResult.totalAmount}`);

            res.json(cleanResult);
        } catch (parseError) {
            console.error('[OCR] Parse error:', parseError);
            res.status(500).json({ message: 'Failed to parse OCR response' });
        }

    } catch (error: any) {
        console.error('[OCR] Error:', error);
        res.status(500).json({ 
            message: error.message || 'OCR processing failed',
            error: error.toString()
        });
    }
});

// Fallback endpoint with GPT-4o for complex bills
router.post('/scan-bill/advanced', auth, async (req, res) => {
    try {
        const { imageBase64, imageUrl } = req.body;

        if (!imageBase64 && !imageUrl) {
            res.status(400).json({ message: 'Either imageBase64 or imageUrl is required' });
            return;
        }

        let imageInputUrl: string;
        
        if (imageUrl) {
            imageInputUrl = imageUrl;
        } else if (imageBase64) {
            imageInputUrl = imageBase64.startsWith('data:') 
                ? imageBase64 
                : `data:image/jpeg;base64,${imageBase64}`;
        } else {
            res.status(400).json({ message: 'Invalid image data' });
            return;
        }

        const prompt = `You are an expert at analyzing complex Indian retail bills, invoices, and receipts from Kirana stores, supermarkets, and retail shops.

Analyze this bill thoroughly and extract ALL information. This may include:
- Multiple page receipts
- Handwritten amounts
- Hindi/Telugu mixed with English
- Faded or low-quality images

## Output Format:
{
  "items": [
    {
      "productName": "exact product name from bill",
      "quantity": number,
      "unitPrice": number, 
      "totalAmount": number,
      "unit": "pc/kg/ltr/box/pack/etc"
    }
  ],
  "subtotal": number,
  "tax": number,
  "cgst": number,
  "sgst": number,
  "igst": number,
  "discount": number,
  "roundOff": number,
  "totalAmount": number,
  "invoiceNumber": "bill/invoice number",
  "billDate": "date in DD/MM/YYYY",
  "storeName": "store/shop name",
  "customerName": "customer name if available",
  "paymentMode": "cash/card/UPI if visible"
}

Extract EVERY line item. Be careful with:
- HSN codes (don't confuse with product names)
- Tax breakdowns (CGST, SGST, IGST)
- Free items (show qty but 0 price)
- Buy-one-get-one offers
- Item bundles

Return ONLY valid JSON.`;

        console.log('[OCR Advanced] Processing bill with GPT-4o...');
        
        const result = await callOpenAIVision('gpt-4o', { url: imageInputUrl }, prompt);
        
        const content = result.choices?.[0]?.message?.content;
        
        if (!content) {
            res.status(500).json({ message: 'Failed to get OCR response' });
            return;
        }

        const parsed = JSON.parse(content);
        
        res.json({
            ...parsed,
            model: 'gpt-4o'
        });

    } catch (error: any) {
        console.error('[OCR Advanced] Error:', error);
        res.status(500).json({ 
            message: error.message || 'OCR processing failed',
            error: error.toString()
        });
    }
});

export { router as ocrRouter };
