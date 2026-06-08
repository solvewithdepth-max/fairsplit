// /api/parse-receipt.js

export default async function handler(req, res) {
    // 1. Only allow POST requests
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        // Vercel auto-parses JSON, but this safely handles it if it comes as a string
        const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
        const { imageBase64 } = body;

        // Safely grabbing your key from the .env file!
        const apiKey = process.env.GEMINI_API_KEY;

        if (!apiKey) {
            console.error("MISSING API KEY!");
            return res.status(500).json({ error: 'API Key is missing.' });
        }

        // --- UPDATED PROMPT WITH QUANTITY MATCHING RULES ---
        const prompt = `You are an expert OCR AI built for an Indian restaurant bill-splitting application. 
Your job is to read the provided receipt image and extract all the consumable items.

CRITICAL RULES:
1. IGNORE all taxes (CGST, SGST, VAT), service charges, subtotals, totals, tips, and discounts. 
2. IGNORE random numbers, table numbers, waiter names, or restaurant headers.
3. Extract ONLY the names of the food/drink items, their combined final line-item price, and the listed quantity.
4. If an item indicates a quantity greater than 1 (e.g., "2 Peri Peri Fries", "Fries x2", or a Qty column), keep the total final line price in 'price', but extract the exact amount into the 'qty' field. If no quantity is specified, default 'qty' to 1.
5. Categorize every item into one of three strict 'diet' tags:
   - "veg": Vegetarian food items (e.g., Paneer, Dal, Roti, Naan, Rice, Salads, Fries).
   - "nv": Non-Vegetarian food items (e.g., Chicken, Mutton, Fish, Prawns, Egg).
   - "drink": ANY beverage or premium item. This includes all alcohol (Beer, Kingfisher, Whisky, Cocktails, Vodka), mocktails, sodas (Coke, Sprite), milkshakes, and bottled water (Kinley, Bisleri).

OUTPUT FORMAT:
You MUST return a raw, valid JSON array of objects. Each object must have 'name' (string), 'price' (number), 'qty' (number), and 'diet' (string).
Do not include any markdown formatting like \`\`\`json. Just return the raw array.

Example Output:
[
  { "name": "Peri Peri Fries", "price": 500.00, "qty": 2, "diet": "veg" },
  { "name": "Butter Chicken", "price": 450.00, "qty": 1, "diet": "nv" },
  { "name": "Garlic Naan", "price": 160.00, "qty": 2, "diet": "veg" },
  { "name": "Kingfisher Ultra 650ml", "price": 350.00, "qty": 1, "diet": "drink" }
]`;

        // THE FIX: Changed gemini-1.5-flash to gemini-2.5-flash (Preserved from your code)
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{
                    parts: [
                        { text: prompt },
                        // Fixed REST API syntax: inline_data instead of inlineData
                        { inline_data: { mime_type: "image/jpeg", data: imageBase64 } }
                    ]
                }]
            })
        });

        const data = await response.json();

        if (data.error) {
            console.error("GOOGLE API ERROR:", data.error.message);
            return res.status(500).json({ error: `Google AI Error: ${data.error.message}` });
        }

        if (!data.candidates || data.candidates.length === 0) {
            console.error("UNEXPECTED GOOGLE RESPONSE:", data);
            return res.status(500).json({ error: 'AI returned an empty response.' });
        }

        let jsonString = data.candidates[0].content.parts[0].text;
        jsonString = jsonString.replace(/```json/g, '').replace(/```/g, '').trim();

        // Send the clean JSON back to your frontend!
        res.setHeader('Content-Type', 'application/json');
        return res.status(200).send(jsonString);

    } catch (error) {
        console.error("Serverless Function Error:", error);
        return res.status(500).json({ error: 'Failed to process the receipt with AI.' });
    }
}