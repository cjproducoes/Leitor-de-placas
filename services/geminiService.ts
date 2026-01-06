import { GoogleGenAI, Type, Schema } from "@google/genai";
import { ScanResult } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const MODEL_NAME = "gemini-3-flash-preview";

export const analyzeFrame = async (base64Image: string): Promise<ScanResult> => {
  try {
    const cleanBase64 = base64Image.split(',')[1] || base64Image;

    const responseSchema: Schema = {
      type: Type.OBJECT,
      properties: {
        plates: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: "List of alphanumeric license plate texts found in the image.",
        },
      },
      required: ["plates"],
    };

    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: "image/jpeg",
              data: cleanBase64,
            },
          },
          {
            text: "Detect and read all vehicle license plates in this image. The vehicle might be moving, so the text might be slightly blurred, angled, or low contrast. Focus on extracting the alphanumeric characters accurately despite motion blur. Return the text characters found.",
          },
        ],
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: responseSchema,
        temperature: 0.1,
      },
    });

    const jsonText = response.text;
    
    if (!jsonText || jsonText.trim().startsWith("I") || jsonText.trim().startsWith("Sorry")) {
      return { plates: [] };
    }

    try {
      const result = JSON.parse(jsonText) as ScanResult;
      if (!result || !Array.isArray(result.plates)) {
        return { plates: [] };
      }
      return result;
    } catch (e) {
      console.error("Failed to parse Gemini JSON response", e);
      return { plates: [] };
    }

  } catch (error) {
    console.error("Gemini analysis error:", error);
    return { plates: [] };
  }
};