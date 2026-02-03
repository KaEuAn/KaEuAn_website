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

    const apiKey = process.env.SERVER_GEMINI_API_KEY;
    console.log("Function invoked. Checking for API Key...");
    if (!apiKey) {
        console.error("CRITICAL ERROR: SERVER_GEMINI_API_KEY is not set in environment variables!");
        return new Response(JSON.stringify({ error: "Server misconfiguration: API KEY MISSING" }), { status: 500 });
    } else {
        console.log("API Key found (length: " + apiKey.length + "). Proceeding with analysis.");
    }

    try {
        const body = await req.json() as { text: string; language: string; isThinkingMode: boolean };
        const { text, language, isThinkingMode } = body;

        if (!text) {
            return new Response(JSON.stringify({ error: "Text is required" }), { status: 400 });
        }

        const ai = new GoogleGenAI({ apiKey });
        const modelName = isThinkingMode ? 'gemini-2.5-pro' : 'gemini-2.5-flash';

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

    } catch (error) {
        console.error("Error processing request:", error);
        return new Response(JSON.stringify({ error: "Internal Server Error" }), { status: 500 });
    }
};
