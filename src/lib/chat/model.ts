import { INTERPRETATION_SCHEMA, systemPrompt, type RawInterpretation } from "./interpret";

export const MODEL_KEY_ENV = "OPENAI_API_KEY";

export function modelConfigured(): boolean {
  return !!process.env[MODEL_KEY_ENV]?.trim();
}

/** Asks an OpenAI-compatible chat model to read the paste. Throws on transport or format errors. */
export async function interpretWithModel(paste: string): Promise<RawInterpretation> {
  const key = process.env[MODEL_KEY_ENV]?.trim();
  if (!key) throw new Error(`${MODEL_KEY_ENV} is not set`);
  const base = (process.env.OPENAI_BASE_URL?.trim() || "https://api.openai.com/v1").replace(/\/$/, "");
  const model = process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";

  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(50_000),
    body: JSON.stringify({
      model,
      temperature: 0,
      response_format: {
        type: "json_schema",
        json_schema: { name: "audit_interpretation", strict: true, schema: INTERPRETATION_SCHEMA },
      },
      messages: [
        { role: "system", content: systemPrompt() },
        { role: "user", content: `Pasted audit report:\n<<<\n${paste}\n>>>` },
      ],
    }),
  });
  if (!res.ok) {
    const detail = (await res.text().catch(() => "")).slice(0, 200);
    throw new Error(`model request failed (${res.status})${detail ? `: ${detail}` : ""}`);
  }
  const data = (await res.json()) as { choices?: { message?: { content?: string; refusal?: string } }[] };
  const msg = data.choices?.[0]?.message;
  if (!msg?.content) throw new Error(msg?.refusal ? `model refused: ${msg.refusal}` : "empty model response");
  const parsed = JSON.parse(msg.content) as RawInterpretation;
  if (!parsed || !Array.isArray(parsed.results)) throw new Error("model response missing results");
  return { ...parsed, unclear: parsed.unclear ?? [], comingSoon: parsed.comingSoon ?? [] };
}
