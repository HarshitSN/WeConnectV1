import { afterEach, describe, expect, it, vi } from "vitest";
import type { RegistryCompany } from "./types";

type MockOutcome =
  | { type: "text"; text: string }
  | { type: "error"; message: string };

async function loadGeminiModule(outcomes: Record<string, MockOutcome> = {}) {
  vi.resetModules();
  vi.doMock("@google/generative-ai", () => {
    class MockGoogleGenerativeAI {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      constructor(_key: string) {}
      getGenerativeModel({ model }: { model: string }) {
        return {
          generateContent: async () => {
            const outcome = outcomes[model];
            if (!outcome) {
              throw new Error(`no mock outcome for model: ${model}`);
            }
            if (outcome.type === "error") {
              throw new Error(outcome.message);
            }
            return {
              response: {
                text: () => outcome.text,
              },
            };
          },
        };
      }
    }
    return { GoogleGenerativeAI: MockGoogleGenerativeAI };
  });
  return import("./gemini");
}

const baseCompany: RegistryCompany = {
  id: "co_1",
  companyName: "StatusNeo",
  aliases: [],
  websiteUrl: "https://statusneo.com",
  jurisdiction: "India",
  registrySnippet: "Sample registry record",
  primaryOwner: "Jane Owner",
  ownershipFemalePct: 60,
  directors: ["Jane Owner"],
  riskFlags: [],
};

const savedEnv = {
  GEMINI_API_KEY: process.env.GEMINI_API_KEY,
  GEMINI_MODEL: process.env.GEMINI_MODEL,
  GEMINI_MODEL_FALLBACKS: process.env.GEMINI_MODEL_FALLBACKS,
};

afterEach(() => {
  process.env.GEMINI_API_KEY = savedEnv.GEMINI_API_KEY;
  process.env.GEMINI_MODEL = savedEnv.GEMINI_MODEL;
  process.env.GEMINI_MODEL_FALLBACKS = savedEnv.GEMINI_MODEL_FALLBACKS;
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.resetModules();
});

describe("Gemini fallback parsing", () => {
  it("classifies common Gemini error reasons and quota subtype", async () => {
    const gemini = await loadGeminiModule();
    expect(gemini.extractGeminiFallbackReason(new Error("429 rate limit exceeded"))).toBe("quota");
    expect(gemini.extractGeminiFallbackReason(new Error("403 forbidden"))).toBe("permission");
    expect(gemini.extractGeminiFallbackReason(new Error("model not found 404"))).toBe("model_not_found");
    expect(gemini.extractGeminiFallbackReason(new Error("invalid api key"))).toBe("api_key_invalid");
    expect(gemini.extractGeminiFallbackReason(new Error("ENOTFOUND upstream"))).toBe("network");

    const meta = gemini.extractGeminiFallbackMeta(
      new Error("429 RESOURCE_EXHAUSTED model overloaded retry in 2 s"),
    );
    expect(meta.reason).toBe("quota");
    expect(meta.quotaSubtype).toBe("capacity");
    expect(meta.retryAfterSec).toBe(2);
  });
});

describe("Gemini model ordering", () => {
  it("auto-appends safe fallback defaults when env fallbacks are empty", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    process.env.GEMINI_MODEL = "gemini-2.5-flash";
    delete process.env.GEMINI_MODEL_FALLBACKS;
    const gemini = await loadGeminiModule();
    expect(gemini.getGeminiModelOrder()).toEqual([
      "gemini-2.5-flash",
      "gemini-2.0-flash",
      "gemini-2.0-flash-lite",
    ]);
  });

  it("preserves explicit fallback order and de-duplicates entries", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    process.env.GEMINI_MODEL = "gemini-2.5-flash";
    process.env.GEMINI_MODEL_FALLBACKS = "gemini-2.5-flash, gemini-2.0-flash-lite, gemini-2.0-flash-lite";
    const gemini = await loadGeminiModule();
    expect(gemini.getGeminiModelOrder()).toEqual(["gemini-2.5-flash", "gemini-2.0-flash-lite"]);
  });
});

describe("Gemini runtime fallback behavior", () => {
  it("uses secondary model when primary model hits quota in vision flow", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    process.env.GEMINI_MODEL = "gemini-2.5-flash";
    process.env.GEMINI_MODEL_FALLBACKS = "gemini-2.0-flash";
    const gemini = await loadGeminiModule({
      "gemini-2.5-flash": { type: "error", message: "429 RESOURCE_EXHAUSTED retry in 1 s" },
      "gemini-2.0-flash": {
        type: "text",
        text: JSON.stringify({
          matchesPrimaryOwner: true,
          nameGuess: "Jane Owner",
          confidence: 91,
        }),
      },
    });

    const res = await gemini.runVision(baseCompany, "abcd", "video/webm");
    expect(res.quotaFallback).toBe(false);
    expect(res.fallbackMeta?.attemptedModels).toEqual(["gemini-2.5-flash", "gemini-2.0-flash"]);
    expect(res.fallbackMeta?.selectedModel).toBe("gemini-2.0-flash");
  });

  it("moves from vision_id directly to voice_attestation in local fallback logic", async () => {
    process.env.GEMINI_API_KEY = "";
    const gemini = await loadGeminiModule();
    const turn = await gemini.runAgentTurn(baseCompany, "vision_id", [], []);
    expect(turn.nextStage).toBe("voice_attestation");
    expect(turn.assistantText.toLowerCase()).toContain("daily operations");
  });

  it("falls back to demo when all models fail in agent flow", async () => {
    vi.useFakeTimers();
    process.env.GEMINI_API_KEY = "test-key";
    process.env.GEMINI_MODEL = "gemini-2.5-flash";
    process.env.GEMINI_MODEL_FALLBACKS = "gemini-2.0-flash";
    const gemini = await loadGeminiModule({
      "gemini-2.5-flash": { type: "error", message: "429 RESOURCE_EXHAUSTED retry in 1 s" },
      "gemini-2.0-flash": { type: "error", message: "429 quota exceeded retry in 2 s" },
    });

    const turnPromise = gemini.runAgentTurn(baseCompany, "discovered", [], []);
    await vi.runAllTimersAsync();
    const turn = await turnPromise;
    expect(turn.quotaFallback).toBe(true);
    expect(turn.fallbackReason).toBe("quota");
    expect(turn.fallbackSubtype).toBe("quota");
    expect(turn.assistantText.length).toBeGreaterThan(0);
  });
});
