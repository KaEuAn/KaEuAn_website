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

        const ai = new GoogleGenAI({ 
            apiKey,
            baseUrl: "https://generativelanguage.googleapis.com/v1beta" // Use v1beta for better compatibility with new models
        });

        const targetModel = isThinkingMode ? 'models/gemini-3.1-pro' : 'models/gemini-1.5-flash';
        console.log(`DEBUG: Analysis attempt with ${targetModel}`);

        const result = await ai.models.generateContent({
            model: targetModel,
            contents: text,
            config: {
                systemInstruction: `Analyze for cognitive biases and strengths. Result in JSON. Language: ${language || 'en'}.`,
                responseMimeType: "application/json",
                responseSchema: responseSchema,
            },
        });

        return new Response(result.text, { headers: { "Content-Type": "application/json" } });

    } catch (error: any) {
        // Force extraction of hidden error properties
        const diagnostics = {
            message: error?.message,
            status: error?.status,
            reason: error?.reason,
            details: error?.details,
            name: error?.name
        };
        console.error("DEBUG: Detailed Error Object:", JSON.stringify(diagnostics, null, 2));
        
        return new Response(JSON.stringify({ 
            error: diagnostics.message || "Request failed",
            details: diagnostics
        }), { status: 500 });
    }
};
