import { NAICS_CODES, UNSPSC_CODES } from "@/lib/constants";
import { ConversationPointer, RegistrationState } from "@/types";
import { getNextQuestion } from "@/lib/voice-agent/engine";

export type LLMBrainResult =
  | { action: "answered"; responseText: string }
  | { action: "extracted"; extractedValue: string };

const SYSTEM_PROMPT = `You are the backend intelligence for a conversational voice agent handling business registrations.
Your job is to understand User input that the deterministic engine struggled to parse.
You will be provided:
- CURRENT_QUESTION: The prompt the user recently heard.
- STEP_ID: The internal ID of the current form field.
- CONTEXT: Lists of valid values or formats for the current step.
- HISTORY: Recent conversation to assist with referential answers like 'Yes, the first one'.

Your goal is one of two actions:
1. If the user provided a definitive answer but it's phrased poorly (e.g. "We sell pizza"), you must deduce the actual code/value (e.g. "72") and return {"action": "extracted", "extractedValue": "selected_code"}.
2. If the user asks a question, is confused, or goes off-topic, provide a helpful and conversational guide using the CONTEXT. Return {"action": "answered", "responseText": "Your conversational response here."}.

CRITICAL GUARDRAILS:
- Do NOT let the user talk about unrelated topics. Politely redirect them to the CURRENT_QUESTION.
- If you use "answered", the text must be conversational, friendly, and short (under 2 sentences) because it will be spoken by a TTS engine.
- For NAICS/UNSPSC steps, prefer conversational clarification and suggestion first; only ask for direct code as a last resort.
- If CONTEXT includes suggested candidates, use them to ask a crisp confirmation question.
- If uncertain, provide top options in plain words and ask the user to pick one.
- For owner_details, extract in this normalized format: "Name is <full name>, gender is <female|male|non_binary|other>, ownership is <number> percent".
- For num_employees and revenue_range, extractedValue must be one of the exact internal buckets from CONTEXT.

RETURN JSON EXCLUSIVELY. Do NOT wrap in \`\`\`json blocks. Just raw JSON conforming to this schema:
{
  "action": "extracted" | "answered",
  "extractedValue"?: "string",
  "responseText"?: "string"
}`;

function latestSuggestionContext(
  stepId: ConversationPointer["stepId"],
  history?: { role: string; text: string }[],
): string {
  if (!history?.length || (stepId !== "naics_codes" && stepId !== "unspsc_codes")) return "";
  const tag = stepId === "naics_codes" ? "NAICS" : "UNSPSC";
  const assistantTexts = history.filter((h) => h.role === "assistant").map((h) => h.text).reverse();
  for (const text of assistantTexts) {
    const matches = Array.from(text.matchAll(new RegExp(`[123]\\)\\s*([^()]+?)\\s*\\(${tag}\\s+([0-9-]+)\\)`, "gi")));
    if (matches.length > 0) {
      const compact = matches.slice(0, 3).map((m, i) => `${i + 1}) ${m[1].trim()} (${tag} ${m[2]})`).join("; ");
      return `Recent suggested ${tag} options: ${compact}`;
    }
    const single = text.match(new RegExp(`\\(${tag}\\s+([0-9-]+)\\)`, "i"));
    if (single) {
      return `Recent suggested ${tag} code: ${single[1]}`;
    }
  }
  return "";
}

export async function processWithBrain(
  pointer: ConversationPointer,
  state: RegistrationState,
  userAnswer: string,
  history?: { role: string; text: string }[]
): Promise<LLMBrainResult | null> {
  const model = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";
  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey) {
    console.warn("GROQ_API_KEY is not set. Brain is disabled.");
    return null;
  }

  const currentQuestion = getNextQuestion(pointer, state);
  let contextStr = "No additional context.";

  if (pointer.stepId === "naics_codes") {
    const list = NAICS_CODES.map((c) => c.code + " - " + c.label).join("\n");
    contextStr = "Valid NAICS Codes (Code - Label):\n" + list;
  } else if (pointer.stepId === "unspsc_codes") {
    const list = UNSPSC_CODES.slice(0, 50).map((c) => c.code + " - " + c.label).join("\n");
    contextStr = "Valid UNSPSC Categories:\n" + list + "\n... (truncated)";
  } else if (pointer.stepId === "owner_details") {
    contextStr = "Owner extraction format: Name is <full name>, gender is <female|male|non_binary|other>, ownership is <number> percent";
  } else if (pointer.stepId === "num_employees") {
    contextStr = "Valid Employee Buckets: 1-10, 11-50, 51-200, 201-500, 501-1000, 1000+";
  } else if (pointer.stepId === "revenue_range") {
    contextStr = "Valid Revenue Buckets: Under $100K, $100K–$500K, $500K–$1M, $1M–$5M, $5M–$25M, $25M+";
  } else if (pointer.stepId === "cert_type") {
    contextStr = "Valid Certification Types: self, digital";
  }

  let historyStr = "No recent history available.";
  if (history && history.length > 0) {
    historyStr = history.map(h => `${h.role === "assistant" ? "Assistant" : "User"}: ${h.text}`).join("\n");
  }
  const suggestionContext = latestSuggestionContext(pointer.stepId, history);

  const userMessage = `RECENT CHAT HISTORY:
${historyStr}

CURRENT_QUESTION: "${currentQuestion}"
STEP_ID: "${pointer.stepId}"
CONTEXT:
${contextStr}
${suggestionContext ? "\n" + suggestionContext : ""}

USER_ANSWER: "${userAnswer}"`;

  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userMessage }
        ],
        temperature: 0.2,
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      const e = await response.text();
      console.error("Groq API error:", response.status, e);
      return null;
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) return null;

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      return null;
    }

    if (parsed.action === "answered" && typeof parsed.responseText === "string") {
      return { action: "answered", responseText: parsed.responseText };
    }
    if (parsed.action === "extracted" && typeof parsed.extractedValue === "string") {
      return { action: "extracted", extractedValue: parsed.extractedValue };
    }

    return null;
  } catch (error) {
    console.error("LLMBrain error:", error);
    return null;
  }
}
