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

        const targetModel = isThinkingMode ? 'gemini-2.5-pro' : 'gemini-2.5-flash';
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${targetModel}:generateContent?key=${apiKey}`;

        console.log(`DEBUG: Analysis starting with ${targetModel} (v1beta)...`);

        const response = await fetch(apiUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                contents: [{ parts: [{ text: `Analyze for cognitive biases and strengths. Result in JSON. Language: ${language || 'en'}. Text: ${text}` }] }],
                generationConfig: {
                    response_mime_type: "application/json",
                    response_schema: responseSchema
                }
            })
        });

        const data = await response.json() as any;

        if (!response.ok) {
            console.error("DEBUG: API Error:", JSON.stringify(data, null, 2));
            throw new Error(data.error?.message || `HTTP ${response.status}`);
        }

        const resultText = data.candidates?.[0]?.content?.parts?.[0]?.text || JSON.stringify(data);
        return new Response(resultText, { headers: { "Content-Type": "application/json" } });

    } catch (error: any) {
        const diagnostics = {
            message: error?.message,
            name: error?.name
        };
        console.error("DEBUG: Fatal Error:", JSON.stringify(diagnostics, null, 2));
        
        return new Response(JSON.stringify({ 
            error: diagnostics.message || "Execution Failed",
            details: diagnostics
        }), { status: 500 });
    }
};
