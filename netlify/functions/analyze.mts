import { GoogleGenAI, Type } from "@google/genai";
import type { Context, Request } from "@netlify/functions";

// Define schema locally since we can't easily share types between root and submodule without complex build steps
const responseSchema = {
    type: Type.OBJECT,
    properties: {
        biases: {
            type: Type.ARRAY,
            description: "A list of cognitive biases found in the text.",
            items: {
                type: Type.OBJECT,
                properties: {
                    phrase: {
                        type: Type.STRING,
                        description: "The exact, verbatim phrase from the text that shows the bias. It must be a substring of the original text.",
                    },
                    biasName: {
                        type: Type.STRING,
                        description: "The name of the cognitive bias.",
                    },
                    explanation: {
                        type: Type.STRING,
                        description: "A detailed but concise explanation of this cognitive bias and why the phrase is an example of it.",
                    },
                },
                required: ["phrase", "biasName", "explanation"],
            },
        },
        strengths: {
            type: Type.ARRAY,
            description: "A list of phrases that are objective, well-reasoned, or clearly stated.",
            items: {
                type: Type.OBJECT,
                properties: {
                    phrase: {
                        type: Type.STRING,
                        description: "The exact, verbatim phrase from the text that is clear, objective, or well-reasoned.",
                    },
                    endorsement: {
                        type: Type.STRING,
                        description: "A brief, encouraging explanation of why this phrase is good (e.g., 'Clear and objective statement', 'Well-supported argument').",
                    },
                },
                required: ["phrase", "endorsement"],
            },
        }
    }
};

export default async (req: Request, context: Context) => {
    if (req.method !== "POST") {
        return new Response("Method Not Allowed", { status: 405 });
    }

    const rawKey = process.env.SERVER_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
    const apiKey = rawKey?.trim();

    console.log("Function invoked. Environment check...");
    
    if (!apiKey) {
        console.error("DEBUG: (SERVER_)GEMINI_API_KEY is undefined or empty.");
        return new Response(JSON.stringify({ error: "Server misconfiguration: API KEY MISSING" }), { status: 500 });
    }

    const maskedKey = apiKey.length > 8 
        ? `${apiKey.substring(0, 4)}...${apiKey.substring(apiKey.length - 4)}`
        : "***";
    console.log(`DEBUG: API Key detected (Length: ${apiKey.length}, Masked: ${maskedKey})`);

    try {
        const body = await req.json() as { text: string; language: string; isThinkingMode: boolean };
        const { text, language, isThinkingMode } = body;

        if (!text) {
            return new Response(JSON.stringify({ error: "Text is required" }), { status: 400 });
        }

        const ai = new GoogleGenAI({ 
            apiKey,
            baseUrl: "https://generativelanguage.googleapis.com"
        });

        // Use 'models/' prefix which is standard for the generative language API
        const modelName = isThinkingMode ? 'models/gemini-3.1-pro' : 'models/gemini-3-flash';
        console.log(`DEBUG: Target Model: ${modelName}`);

        const prompt = `Analyze the following text. Identify phrases demonstrating cognitive biases AND phrases that are strengths (e.g., objective, well-reasoned, clear).
For each bias, provide the exact phrase, bias name, and a clear explanation.
For each strength, provide the exact phrase and a brief, encouraging endorsement.

Text to analyze:
"${text}"`;

        const result = await ai.models.generateContent({
            model: modelName,
            contents: prompt,
            config: {
                systemInstruction: `You are an expert in psychology, linguistics, and constructive feedback. Your task is to detect cognitive biases and identify textual strengths. Respond in valid JSON format according to the provided schema. All explanations and endorsements should be in ${language || 'en'}. If no biases or strengths are found, return empty arrays for both.`,
                responseMimeType: "application/json",
                responseSchema: responseSchema,
                ...(isThinkingMode && { thinkingConfig: { thinkingBudget: 32768 } }),
            },
        });

        return new Response(result.text, {
            headers: { "Content-Type": "application/json" }
        });

    } catch (error: any) {
        console.error("DEBUG: Full Error Object:", JSON.stringify(error, null, 2));
        const errorMessage = error?.message || (typeof error === 'string' ? error : "Internal Server Error");
        return new Response(JSON.stringify({ 
            error: errorMessage,
            details: error?.statusText || error?.name || "Check backend logs for full stack trace"
        }), { status: 500 });
    }
};
