import { MOCK_ASSESSORS, NAICS_CODES, UNSPSC_CODES } from "@/lib/constants";
import type { AgentParseResult, ConversationPointer, ConversationStepId, OwnershipEntry, RegistrationState } from "@/types";
import {
  isLikelyOwnerName,
  isUSCountry,
  normalizeBusinessName,
  normalizeCountry,
  normalizeOwnerName,
  parseAssessorId,
  parseCertType,
  parseDesignations,
  parseEmployeeRange,
  parseOwnerDetails,
  parseRevenueRange,
  suggestNaicsMatches,
  suggestUnspscMatches,
  parseVisaType,
  parseYesNo,
} from "@/lib/voice-agent/normalizers";

export function getNextQuestion(pointer: ConversationPointer, state: RegistrationState): string {
  const total = state.ownership_structure.reduce((sum, e) => sum + Number(e.percent || 0), 0);
  const ownerIndex = pointer.ownerIndex ?? 0;
  switch (pointer.stepId) {
    case "business_name":
      return "Let us get started with the basics. What is your registered business name?";
    case "women_owned":
      return "Thanks. Is your business at least 51 percent owned by women?";
    case "country":
      return "Great. Which country is your business based in today?";
    case "us_citizen":
      return "Quick check: are you a US citizen or green card holder?";
    case "visa_type":
      return "Thanks for clarifying. What visa type should I record, like H-1B, L-1, O-1, E-2, TN, F-1 OPT, or other?";
    case "webank_certified":
      return "Are you currently certified by WEBank?";
    case "naics_codes":
      return "Now tell me about your industry in plain language, like what your business does day to day. I will map it to NAICS for you.";
    case "unspsc_codes":
      return "Perfect. What products or services do you mainly offer? I will map those to UNSPSC categories.";
    case "designations":
      return "Do you want to add any business designations, such as Small Business, Women-Led, Minority-Owned, or Veteran-Owned? You can also say none.";
    case "owner_details":
      return `Let us capture owner ${ownerIndex + 1}. Please share their full name, gender, and ownership percentage.`;
    case "owner_add_more":
      return total < 100
        ? `We are at ${total} percent ownership so far. Should we add another owner?`
        : "Ownership totals 100 percent, which is perfect. Ready to move on?";
    case "num_employees":
      return "Quick one: about how many employees do you have right now? I will map it for you.";
    case "revenue_range":
      return "Got it. What is your approximate annual revenue? You can say it naturally, and I will map the bracket.";
    case "additional_certs":
      return "Do you already hold any additional certifications? Say them naturally, or say none.";
    case "business_description":
      return "Tell me a little more about your business. A sentence or two on your products or services is perfect.";
    case "cert_type":
      return "Last step on certification path selection: would you like self certification or digital certification?";
    case "assessor": {
      const names = MOCK_ASSESSORS.map((a) => a.name).join(", ");
      return `Would you like to pick an assessor? Your options are: ${names}. Or say skip.`;
    }
    case "done":
      return "You're all done! 🎉 Review the form below, finish payment, and hit submit.";
    default:
      return "Let's keep going!";
  }
}

export const SECTION_NAMES = ["Business", "Location", "Industry", "Ownership", "Profile", "Certification"] as const;

export function getSectionIndex(stepId: ConversationStepId): number {
  switch (stepId) {
    case "business_name":
    case "women_owned":
      return 0;
    case "country":
    case "us_citizen":
    case "visa_type":
    case "webank_certified":
      return 1;
    case "naics_codes":
    case "unspsc_codes":
    case "designations":
      return 2;
    case "owner_details":
    case "owner_add_more":
      return 3;
    case "num_employees":
    case "revenue_range":
    case "additional_certs":
    case "business_description":
      return 4;
    case "cert_type":
    case "assessor":
    case "done":
      return 5;
    default:
      return 0;
  }
}

export function initialPointer(): ConversationPointer {
  return { stepId: "business_name", ownerIndex: 0 };
}

function pointer(stepId: ConversationStepId, ownerIndex?: number): ConversationPointer {
  return { stepId, ownerIndex };
}

function nextAfterCountry(state: RegistrationState): ConversationPointer {
  return isUSCountry(state.country) ? pointer("us_citizen") : pointer("naics_codes");
}

function ownerTotal(entries: OwnershipEntry[]): number {
  return entries.reduce((sum, e) => sum + Number(e.percent || 0), 0);
}

function ensureOwner(entries: OwnershipEntry[], ownerIndex: number): OwnershipEntry[] {
  const next = [...entries];
  if (!next[ownerIndex]) {
    next[ownerIndex] = { name: "", gender: "female", percent: 0 };
  }
  return next;
}

function formatChoiceLine(prefix: "NAICS" | "UNSPSC", code: string, label: string, index: number): string {
  return `${index}) ${label} (${prefix} ${code})`;
}

function getTopChoicesText(
  prefix: "NAICS" | "UNSPSC",
  matches: Array<{ code: string; label: string }>,
): string {
  return matches
    .slice(0, 3)
    .map((m, idx) => formatChoiceLine(prefix, m.code, m.label, idx + 1))
    .join("; ");
}

export function parseStepAnswer(
  pointerState: ConversationPointer,
  answer: string,
  state: RegistrationState,
): AgentParseResult {
  const step = pointerState.stepId;
  const ownerIndex = pointerState.ownerIndex ?? 0;
  const safeAnswer = answer.trim();

  if (!safeAnswer && step !== "additional_certs") {
    return {
      ok: false,
      confidence: 0,
      confirmation: "I did not catch that clearly.",
      clarification: "Could you say that once more?",
      next: pointerState,
    };
  }

  switch (step) {
    case "business_name": {
      const businessName = normalizeBusinessName(safeAnswer);
      if (businessName.length < 2) {
        return { ok: false, confidence: 0.2, confirmation: "That sounded a bit short for a business name.", clarification: "Please share your full registered business name.", next: pointer("business_name") };
      }
      const displayName = businessName.replace(/\.$/,"");
      return {
        ok: true,
        confidence: 0.95,
        updates: { business_name: businessName },
        confirmation: `Great, I have ${displayName}.`,
        next: pointer("women_owned"),
      };
    }
    case "women_owned": {
      const parsed = parseYesNo(safeAnswer);
      if (parsed === null) {
        return { ok: false, confidence: 0.3, confirmation: "I want to make sure I capture this correctly.", clarification: "Please say yes or no.", next: pointer("women_owned") };
      }
      return {
        ok: true,
        confidence: 0.92,
        updates: { women_owned: parsed },
        confirmation: parsed ? "Perfect, marked as women-owned." : "Understood, I have noted that.",
        next: pointer("country"),
      };
    }
    case "country": {
      const country = normalizeCountry(safeAnswer);
      const merged = { ...state, country };
      return {
        ok: true,
        confidence: 0.9,
        updates: { country },
        confirmation: `Thanks, recorded as ${country}.`,
        next: nextAfterCountry(merged),
      };
    }
    case "us_citizen": {
      const parsed = parseYesNo(safeAnswer);
      if (parsed === null) {
        return { ok: false, confidence: 0.3, confirmation: "I missed that response.", clarification: "Please answer yes or no for US citizen or green card holder.", next: pointer("us_citizen") };
      }
      return {
        ok: true,
        confidence: 0.9,
        updates: { us_citizen: parsed },
        confirmation: parsed ? "Great, marked as US citizen or green card holder." : "Thanks, I will capture visa details next.",
        next: parsed ? pointer("webank_certified") : pointer("visa_type"),
      };
    }
    case "visa_type": {
      const visa = parseVisaType(safeAnswer);
      if (!visa) {
        return { ok: false, confidence: 0.35, confirmation: "I could not map that visa type confidently.", clarification: "Please say one of H-1B, L-1, O-1, E-2, TN, F-1 OPT, or other.", next: pointer("visa_type") };
      }
      return {
        ok: true,
        confidence: 0.86,
        updates: { visa_type: visa },
        confirmation: `Great, I noted ${visa}.`,
        next: pointer("webank_certified"),
      };
    }
    case "webank_certified": {
      const parsed = parseYesNo(safeAnswer);
      if (parsed === null) {
        return { ok: false, confidence: 0.3, confirmation: "I want to confirm this cleanly.", clarification: "Please answer yes or no for WEBank certification.", next: pointer("webank_certified") };
      }
      return {
        ok: true,
        confidence: 0.9,
        updates: { webank_certified: parsed },
        confirmation: parsed ? "Excellent, WEBank certification recorded." : "Thanks, no WEBank certification recorded.",
        next: pointer("naics_codes"),
      };
    }
    case "naics_codes": {
      const matches = suggestNaicsMatches(safeAnswer);
      const best = matches[0];
      if (!best) {
        return {
          ok: false,
          confidence: 0.25,
          confirmation: "Thanks, I need a bit more detail to map your industry.",
          clarification: "Tell me what your business primarily does, and I will suggest the closest NAICS options.",
          next: pointer("naics_codes"),
        };
      }
      if (best.score >= 0.82) {
        const codes = [best.code];
        return {
          ok: true,
          confidence: 0.88,
          updates: { naics_codes: Array.from(new Set([...(state.naics_codes ?? []), ...codes])) },
          confirmation: `Great fit. I mapped that to ${best.label} (NAICS ${best.code}).`,
          next: pointer("unspsc_codes"),
        };
      }
      if (best.score >= 0.5) {
        return {
          ok: false,
          confidence: 0.68,
          confirmation: `I think this matches ${best.label} (NAICS ${best.code}).`,
          clarification: `Does that sound right? Say yes to confirm, or no and I will suggest alternatives. Options: ${getTopChoicesText("NAICS", matches)}.`,
          next: pointer("naics_codes"),
        };
      }
      const topChoices = getTopChoicesText("NAICS", matches);
      return {
        ok: false,
        confidence: 0.45,
        confirmation: "I found a few likely NAICS matches.",
        clarification: `Which one is closest? ${topChoices}. You can say the option number or the industry name.`,
        next: pointer("naics_codes"),
      };
    }
    case "unspsc_codes": {
      const matches = suggestUnspscMatches(safeAnswer);
      const best = matches[0];
      if (!best) {
        return {
          ok: false,
          confidence: 0.25,
          confirmation: "Thanks, I need a bit more detail to map your products or services.",
          clarification: "Describe your main products or services, and I will suggest the closest UNSPSC categories.",
          next: pointer("unspsc_codes"),
        };
      }
      if (best.score >= 0.82) {
        const codes = [best.code];
        return {
          ok: true,
          confidence: 0.88,
          updates: { unspsc_codes: Array.from(new Set([...(state.unspsc_codes ?? []), ...codes])) },
          confirmation: `Perfect. I mapped that to ${best.label} (UNSPSC ${best.code}).`,
          next: pointer("designations"),
        };
      }
      if (best.score >= 0.5) {
        return {
          ok: false,
          confidence: 0.68,
          confirmation: `I think this aligns with ${best.label} (UNSPSC ${best.code}).`,
          clarification: `Should I use that? Say yes to confirm, or no and I will suggest alternatives. Options: ${getTopChoicesText("UNSPSC", matches)}.`,
          next: pointer("unspsc_codes"),
        };
      }
      const topChoices = getTopChoicesText("UNSPSC", matches);
      return {
        ok: false,
        confidence: 0.45,
        confirmation: "I found a few likely UNSPSC matches.",
        clarification: `Which one fits best? ${topChoices}. You can say the option number or the category name.`,
        next: pointer("unspsc_codes"),
      };
    }
    case "designations": {
      if (["none", "skip", "no"].includes(safeAnswer.toLowerCase())) {
        return {
          ok: true,
          confidence: 0.95,
          updates: { designations: [] },
          confirmation: "No problem, we will keep designations empty for now.",
          next: pointer("owner_details", 0),
        };
      }
      const des = parseDesignations(safeAnswer);
      if (!des.length) {
        return {
          ok: false,
          confidence: 0.3,
          confirmation: "I could not confidently map those designations.",
          clarification: "Please say a designation like Small Business, Women-Led, Minority-Owned, or say none.",
          next: pointer("designations"),
        };
      }
      return {
        ok: true,
        confidence: 0.82,
        updates: { designations: Array.from(new Set([...(state.designations ?? []), ...des])) },
        confirmation: `Great, I added ${des.join(", ")}.`,
        next: pointer("owner_details", 0),
      };
    }
    case "owner_details": {
      const details = parseOwnerDetails(safeAnswer);
      const entries = ensureOwner(state.ownership_structure, ownerIndex);
      
      let clarification = "";
      if (details.name.length < 2 && !entries[ownerIndex].name) {
        clarification += "Please state their full name. ";
      } else if (details.name.length >= 2) {
        entries[ownerIndex].name = details.name;
      }

      if (!details.gender && !entries[ownerIndex].gender) {
        clarification += "Please include their gender (female, male, non-binary, or other). ";
      } else if (details.gender) {
        entries[ownerIndex].gender = details.gender;
      }

      if (!details.percent && !entries[ownerIndex].percent) {
        clarification += "Please include their ownership percentage. ";
      } else if (details.percent) {
        entries[ownerIndex].percent = details.percent;
      }
      
      const total = ownerTotal(entries);
      if (clarification) {
        return {
          ok: false,
          confidence: 0.5,
          ownershipUpdate: entries,
          confirmation: "Thanks, I still need a little more detail.",
          clarification: clarification.trim(),
          next: pointer("owner_details", ownerIndex),
        };
      }

      if (details.name && !isLikelyOwnerName(details.name)) {
        return {
          ok: false,
          confidence: 0.35,
          ownershipUpdate: entries,
          confirmation: "I want to confirm the owner name before saving.",
          clarification: "Please say only the owner full name, gender, and ownership percent once more.",
          next: pointer("owner_details", ownerIndex),
        };
      }
      
      if (total > 100) {
        return {
          ok: false,
          confidence: 0.6,
          ownershipUpdate: entries,
          confirmation: `The ownership total is ${total} percent, which is above 100.`,
          clarification: "Please adjust their percentage so total is 100.",
          next: pointer("owner_details", ownerIndex),
        };
      }
      return {
        ok: true,
        confidence: 0.9,
        ownershipUpdate: entries,
        confirmation: `Perfect, recorded ${entries[ownerIndex].name} at ${entries[ownerIndex].percent} percent (${entries[ownerIndex].gender}).`,
        next: pointer("owner_add_more", ownerIndex),
      };
    }
    case "owner_add_more": {
      const total = ownerTotal(state.ownership_structure);
      const lower = safeAnswer.toLowerCase();
      const wantsEdit = /\b(edit|change|modify|update|fix|correct)\b/.test(lower);
      const choice = parseYesNo(safeAnswer);

      if (total >= 100) {
        if (wantsEdit || choice === false || choice === null) {
          return {
            ok: false,
            confidence: 0.8,
            confirmation: "Ownership already totals 100 percent.",
            clarification: "Say continue/yes to move on, or say edit to modify current owners.",
            next: pointer("owner_add_more", ownerIndex),
          };
        }
        return {
          ok: true,
          confidence: 0.92,
          confirmation: "Ownership section done — great work!",
          next: pointer("num_employees"),
        };
      }

      if (total < 100 && choice === false) {
        return {
          ok: false,
          confidence: 0.75,
          confirmation: `Current ownership total is ${total} percent.`,
          clarification: "Ownership must total 100 percent. Say yes to add another owner or adjust existing percentages.",
          next: pointer("owner_add_more", ownerIndex),
        };
      }

      if (choice === true) {
        const nextIndex = state.ownership_structure.length;
        const entries: OwnershipEntry[] = [...state.ownership_structure, { name: "", gender: "female", percent: 0 }];
        return {
          ok: true,
          confidence: 0.9,
          ownershipUpdate: entries,
          confirmation: `Adding owner ${nextIndex + 1}.`,
          next: pointer("owner_details", nextIndex),
        };
      }

      if (choice === null && total < 100) {
        return {
          ok: false,
          confidence: 0.3,
          confirmation: "I did not catch whether that was yes or no.",
          clarification: `Current total is ${total} percent. Say yes to add another owner.`,
          next: pointer("owner_add_more", ownerIndex),
        };
      }

      return {
        ok: true,
        confidence: 0.92,
        confirmation: "Ownership section done — great work!",
        next: pointer("num_employees"),
      };
    }
    case "num_employees": {
      const range = parseEmployeeRange(safeAnswer);
      if (!range) {
        return { ok: false, confidence: 0.35, confirmation: "I could not map that employee count yet.", clarification: "Please share an approximate number or range, for example around 120 or between 500 and 1000.", next: pointer("num_employees") };
      }
      return {
        ok: true,
        confidence: 0.85,
        updates: { num_employees: range },
        confirmation: `Great, I recorded ${range} employees.`,
        next: pointer("revenue_range"),
      };
    }
    case "revenue_range": {
      const range = parseRevenueRange(safeAnswer);
      if (!range) {
        return { ok: false, confidence: 0.35, confirmation: "I could not map that revenue value yet.", clarification: "Please share an approximate annual revenue like 400k, 2 million, or 5 to 25 million.", next: pointer("revenue_range") };
      }
      return {
        ok: true,
        confidence: 0.85,
        updates: { revenue_range: range },
        confirmation: `Thanks, I noted ${range}.`,
        next: pointer("additional_certs"),
      };
    }
    case "additional_certs": {
      const lower = safeAnswer.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
      const value = ["none", "skip", "no", "nine"].includes(lower) ? "" : safeAnswer;
      return {
        ok: true,
        confidence: 0.9,
        updates: { additional_certs: value },
        confirmation: value ? "Great, I saved those certifications." : "No additional certifications noted.",
        next: pointer("business_description"),
      };
    }
    case "business_description": {
      if (safeAnswer.length < 30) {
        return {
          ok: false,
          confidence: 0.5,
          confirmation: "Thanks, I need a little more detail there.",
          clarification: "Please provide at least thirty characters describing your products or services.",
          next: pointer("business_description"),
        };
      }
      return {
        ok: true,
        confidence: 0.85,
        updates: { business_description: safeAnswer },
        confirmation: "Excellent, that description is saved.",
        next: pointer("cert_type"),
      };
    }
    case "cert_type": {
      const cert = parseCertType(safeAnswer);
      if (!cert) {
        return { ok: false, confidence: 0.4, confirmation: "I could not map that certification path yet.", clarification: "Please say self certification or digital certification.", next: pointer("cert_type") };
      }
      return {
        ok: true,
        confidence: 0.9,
        updates: { cert_type: cert },
        confirmation: `${cert === "self" ? "Self" : "Digital"} certification selected.`,
        next: pointer("assessor"),
      };
    }
    case "assessor": {
      const id = parseAssessorId(safeAnswer);
      if (id === null) {
        return { ok: false, confidence: 0.4, confirmation: "I could not match that assessor name.", clarification: `Please pick a listed assessor name or say skip.`, next: pointer("assessor") };
      }
      const chosen = id ? MOCK_ASSESSORS.find((a) => a.id === id)?.name ?? "selected assessor" : "No assessor selected";
      return {
        ok: true,
        confidence: 0.88,
        assessorId: id,
        confirmation: id ? `Selected assessor: ${chosen}.` : chosen,
        next: pointer("done"),
        done: true,
      };
    }
    case "done": {
      return {
        ok: true,
        confidence: 1,
        confirmation: "Voice flow already completed.",
        next: pointer("done"),
        done: true,
      };
    }
    default:
      return {
        ok: false,
        confidence: 0,
        confirmation: "Unsupported step.",
        clarification: "Please retry.",
        next: pointerState,
      };
  }
}
