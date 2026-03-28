import { GoogleGenAI, Type } from "@google/genai";
import type { Context, Request } from "@netlify/functions";

const responseSchema = {
    type: Type.OBJECT,
    properties: {
        biases: {
            type: Type.ARRAY,
            description: "A list of cognitive biases found in the text.",
            items: {
                type: Type.OBJECT,
                properties: {
                    phrase: { type: Type.STRING, description: "The exact, verbatim phrase from the text." },
                    biasName: { type: Type.STRING, description: "The name of the cognitive bias." },
                    explanation: { type: Type.STRING, description: "A detailed but concise explanation." },
                },
                required: ["phrase", "biasName", "explanation"],
            },
        },
        strengths: {
            type: Type.ARRAY,
            description: "A list of objective, well-reasoned, or clearly stated phrases.",
            items: {
                type: Type.OBJECT,
                properties: {
                    phrase: { type: Type.STRING, description: "The factual or objective phrase." },
                    endorsement: { type: Type.STRING, description: "Explanation of why this is a strength." },
                },
                required: ["phrase", "endorsement"],
            },
        }
    }
};

export default async (req: Request, context: Context) => {
    console.log("--- LOG START: analyze.mts invoked ---");

    if (req.method !== "POST") {
        return new Response("Method Not Allowed", { status: 405 });
    }

    // Step 1: Resolve API Key
    const rawKey = process.env.SERVER_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
    const apiKey = rawKey?.trim();

    if (!apiKey) {
        console.error("DEBUG ERROR: (SERVER_)GEMINI_API_KEY is missing.");
        return new Response(JSON.stringify({ 
            error: "Server Error: API KEY MISSING",
            details: "Please configure SERVER_GEMINI_API_KEY in the Netlify dashboard."
        }), { status: 500, headers: { "Content-Type": "application/json" } });
    }

    try {
        // Step 2: Parse Request Body
        const bodyText = await req.text();
        console.log(`DEBUG: Request Body Length: ${bodyText.length}`);
        
        let body: any;
        try {
            body = JSON.parse(bodyText);
        } catch (e) {
            console.error("DEBUG ERROR: Failed to parse body as JSON.", bodyText);
            throw new Error("Invalid JSON in request body");
        }

        const { text, language, isThinkingMode } = body;
        if (!text) {
            throw new Error("Missing 'text' in request body");
        }

        const targetModel = isThinkingMode ? 'gemini-2.5-pro' : 'gemini-2.5-flash';
        const version = "v1beta"; // Force v1beta for reliable schema support
        const apiUrl = `https://generativelanguage.googleapis.com/${version}/models/${targetModel}:generateContent?key=${apiKey}`;

        console.log(`DEBUG: Analysis starting with model: ${targetModel} via ${version}...`);

        // Step 3: Fetch from Google API
        const googleResponse = await fetch(apiUrl, {
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

        const data = await googleResponse.json();

        if (!googleResponse.ok) {
            console.error(`DEBUG ERROR: Google API Response (Status: ${googleResponse.status}):`, JSON.stringify(data, null, 2));
            return new Response(JSON.stringify({ 
                error: `Google API Error: ${googleResponse.status}`,
                details: data.error?.message || data 
            }), { status: 500, headers: { "Content-Type": "application/json" } });
        }

        // Step 4: Extract and Return Content
        const resultText = data.candidates?.[0]?.content?.parts?.[0]?.text;
        
        if (!resultText) {
            console.error("DEBUG ERROR: No content in Google API response.", JSON.stringify(data, null, 2));
            throw new Error("Cloud Model returned an empty response.");
        }

        console.log("DEBUG: Successfully parsed response from Google.");
        return new Response(resultText, { headers: { "Content-Type": "application/json" } });

    } catch (error: any) {
        const diagnostics = {
            message: error?.message || "Execution Failed",
            name: error?.name,
            stack: error?.stack?.substring(0, 300) // Truncated stack for safety
        };
        console.error("DEBUG FATAL ERROR:", JSON.stringify(diagnostics, null, 2));
        
        return new Response(JSON.stringify({ 
            error: "Backend Execution Failure",
            details: diagnostics.message,
            diagnostics: diagnostics
        }), { status: 500, headers: { "Content-Type": "application/json" } });
    }
};
