import "server-only";
import { GoogleGenAI } from "@google/genai";

export interface GeminiPart {
  text?: string;
  inlineData?: { mimeType: string; data: string };
}

export interface GeminiCall {
  system: string;
  parts: GeminiPart[];
  thinkingBudget?: number;
  temperature?: number;
}

export class GeminiError extends Error {
  constructor(
    message: string,
    readonly code: "NO_KEY" | "QUOTA" | "UPSTREAM" | "BAD_JSON",
  ) {
    super(message);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function modelName(): string {
  return process.env.GEMINI_MODEL || "gemini-2.5-flash";
}

function parseJson(text: string): unknown {
  const t = text.trim();
  try {
    return JSON.parse(t);
  } catch {
    const fenced = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced) return JSON.parse(fenced[1]);
    const a = t.indexOf("{");
    const b = t.lastIndexOf("}");
    if (a >= 0 && b > a) return JSON.parse(t.slice(a, b + 1));
    throw new Error("not JSON");
  }
}

/** One JSON-mode generateContent call with retry on rate limits / transient errors. */
export async function callGemini(call: GeminiCall): Promise<{ json: unknown; usage: { promptTokens?: number; outputTokens?: number } }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new GeminiError("GEMINI_API_KEY is not set on the server", "NO_KEY");
  const ai = new GoogleGenAI({ apiKey });
  const model = modelName();
  const supportsThinking = /2\.5|3/.test(model);

  let lastErr = "";
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await ai.models.generateContent({
        model,
        contents: [{ role: "user", parts: call.parts }],
        config: {
          systemInstruction: call.system,
          responseMimeType: "application/json",
          temperature: call.temperature ?? 0.2,
          maxOutputTokens: 32000,
          ...(supportsThinking && call.thinkingBudget !== undefined
            ? { thinkingConfig: { thinkingBudget: call.thinkingBudget } }
            : {}),
        },
      });
      const text = res.text ?? "";
      let json: unknown;
      try {
        json = parseJson(text);
      } catch {
        lastErr = "model returned invalid JSON";
        if (attempt < 3) continue;
        throw new GeminiError(lastErr, "BAD_JSON");
      }
      return {
        json,
        usage: {
          promptTokens: res.usageMetadata?.promptTokenCount,
          outputTokens: res.usageMetadata?.candidatesTokenCount,
        },
      };
    } catch (e: any) {
      if (e instanceof GeminiError) throw e;
      const status = Number(e?.status ?? e?.code ?? 0);
      const msg = String(e?.message ?? e);
      lastErr = msg;
      const transient = status === 429 || status === 500 || status === 503 || /RESOURCE_EXHAUSTED|UNAVAILABLE|overloaded/i.test(msg);
      if (!transient || attempt === 3) {
        throw new GeminiError(msg.slice(0, 400), status === 429 || /RESOURCE_EXHAUSTED/.test(msg) ? "QUOTA" : "UPSTREAM");
      }
      await sleep(2000 * 2 ** attempt);
    }
  }
  throw new GeminiError(lastErr || "Gemini call failed", "UPSTREAM");
}
