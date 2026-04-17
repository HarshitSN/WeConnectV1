import test from "node:test";
import assert from "node:assert/strict";

import { parseStepAnswer } from "@/lib/voice-agent/engine";
import {
  isLikelyOwnerName,
  normalizeOwnerName,
  parseEmployeeRange,
  parseNaicsCodes,
  parseOwnerDetails,
  parseRevenueRange,
  parseUnspscCodes,
  suggestNaicsMatches,
  suggestUnspscMatches,
} from "@/lib/voice-agent/normalizers";
import type { RegistrationState } from "@/types";

function baseState(overrides: Partial<RegistrationState> = {}): RegistrationState {
  return {
    business_name: "",
    women_owned: null,
    country: "",
    us_citizen: null,
    webank_certified: null,
    visa_type: "",
    naics_codes: [],
    unspsc_codes: [],
    designations: [],
    additional_certs: "",
    business_description: "",
    ein: "",
    address: "",
    num_employees: "",
    revenue_range: "",
    ownership_structure: [{ name: "", gender: "female", percent: 0 }],
    cert_type: undefined,
    payment_complete: false,
    ...overrides,
  };
}

test("normalizeOwnerName strips noisy trailing connector fragments", () => {
  assert.equal(normalizeOwnerName("The full name is Priya Malhotra and her"), "Priya Malhotra");
  assert.equal(normalizeOwnerName("name is Priya Malhotra is the"), "Priya Malhotra");
});

test("parseOwnerDetails isolates owner name from sentence-style response", () => {
  const details = parseOwnerDetails(
    "The full name is Priya Malhotra and her gender is female and the ownership is 100 percent.",
  );
  assert.deepEqual(details, { name: "Priya Malhotra", gender: "female", percent: 100 });
});

test("owner sentence with noisy prefixes keeps only clean name", () => {
  const details = parseOwnerDetails(
    "Owner one is Harshit Malik and the ownership is 100% and he is a male.",
  );
  assert.equal(details.name, "Harshit Malik");
  assert.equal(details.gender, "male");
  assert.equal(details.percent, 100);
  assert.equal(isLikelyOwnerName(details.name), true);
});

test("owner_add_more moves forward when total is 100 and user says yes", () => {
  const result = parseStepAnswer(
    { stepId: "owner_add_more", ownerIndex: 0 },
    "yes",
    baseState({ ownership_structure: [{ name: "Priya Malhotra", gender: "female", percent: 100 }] }),
  );
  assert.equal(result.ok, true);
  assert.equal(result.next.stepId, "num_employees");
});

test("owner_add_more moves forward when total is 100 and user says continue", () => {
  const result = parseStepAnswer(
    { stepId: "owner_add_more", ownerIndex: 0 },
    "continue",
    baseState({ ownership_structure: [{ name: "Priya Malhotra", gender: "female", percent: 100 }] }),
  );
  assert.equal(result.ok, true);
  assert.equal(result.next.stepId, "num_employees");
});

test("owner_add_more keeps user in ownership when total is 100 and user says edit", () => {
  const result = parseStepAnswer(
    { stepId: "owner_add_more", ownerIndex: 0 },
    "edit",
    baseState({ ownership_structure: [{ name: "Priya Malhotra", gender: "female", percent: 100 }] }),
  );
  assert.equal(result.ok, false);
  assert.equal(result.next.stepId, "owner_add_more");
  assert.match(result.clarification ?? "", /continue\/yes to move on, or say edit/i);
});

test("owner_add_more adds a new owner when total is below 100 and user says yes", () => {
  const result = parseStepAnswer(
    { stepId: "owner_add_more", ownerIndex: 0 },
    "yes",
    baseState({ ownership_structure: [{ name: "Priya Malhotra", gender: "female", percent: 60 }] }),
  );
  assert.equal(result.ok, true);
  assert.equal(result.next.stepId, "owner_details");
  assert.equal(result.next.ownerIndex, 1);
  assert.equal(result.ownershipUpdate?.length, 2);
});

test("owner_add_more blocks completion when total is below 100 and user says no", () => {
  const result = parseStepAnswer(
    { stepId: "owner_add_more", ownerIndex: 0 },
    "no",
    baseState({ ownership_structure: [{ name: "Priya Malhotra", gender: "female", percent: 60 }] }),
  );
  assert.equal(result.ok, false);
  assert.equal(result.next.stepId, "owner_add_more");
  assert.match(result.clarification ?? "", /must total 100 percent/i);
});

test("existing yes/no steps still parse explicit yes/no responses", () => {
  const womenOwned = parseStepAnswer({ stepId: "women_owned" }, "no", baseState());
  assert.equal(womenOwned.ok, true);
  assert.equal(womenOwned.updates?.women_owned, false);
  assert.equal(womenOwned.next.stepId, "country");

  const usCitizen = parseStepAnswer({ stepId: "us_citizen" }, "yes", baseState({ country: "United States" }));
  assert.equal(usCitizen.ok, true);
  assert.equal(usCitizen.updates?.us_citizen, true);
  assert.equal(usCitizen.next.stepId, "webank_certified");

  const webank = parseStepAnswer({ stepId: "webank_certified" }, "no", baseState());
  assert.equal(webank.ok, true);
  assert.equal(webank.updates?.webank_certified, false);
  assert.equal(webank.next.stepId, "naics_codes");
});

test("naics parser maps natural language logistics to transportation sector", () => {
  const direct = parseNaicsCodes("We run a logistics and warehousing company for cross-border shipping.");
  assert.equal(direct[0], "48-49");

  const ranked = suggestNaicsMatches("We handle freight logistics and warehousing.");
  assert.equal(ranked[0]?.code, "48-49");
});

test("unspsc parser maps office furniture and supplies language", () => {
  const direct = parseUnspscCodes("We supply office furniture and daily office supplies.");
  assert.ok(direct.includes("44000000") || direct.includes("56000000"));

  const ranked = suggestUnspscMatches("Our products include desks, chairs, and office supplies.");
  const codes = ranked.map((r) => r.code);
  assert.ok(codes.includes("44000000") || codes.includes("56000000"));
});

test("naics step auto-accepts high confidence natural language", () => {
  const result = parseStepAnswer(
    { stepId: "naics_codes" },
    "Our company provides transportation and warehousing services.",
    baseState(),
  );
  assert.equal(result.ok, true);
  assert.equal(result.next.stepId, "unspsc_codes");
  assert.equal(result.updates?.naics_codes?.[0], "48-49");
});

test("naics step asks for confirmation on medium confidence matches", () => {
  const result = parseStepAnswer(
    { stepId: "naics_codes" },
    "We do technical work for client teams.",
    baseState(),
  );
  assert.equal(result.ok, false);
  assert.equal(result.next.stepId, "naics_codes");
  assert.match(result.clarification ?? "", /say yes to confirm|which one is closest/i);
});

test("naics step offers top choices on low confidence response", () => {
  const result = parseStepAnswer(
    { stepId: "naics_codes" },
    "We do many different things across projects.",
    baseState(),
  );
  assert.equal(result.ok, false);
  assert.equal(result.next.stepId, "naics_codes");
  assert.match(result.clarification ?? "", /which one is closest/i);
});

test("naics step still accepts direct numeric code input", () => {
  const result = parseStepAnswer(
    { stepId: "naics_codes" },
    "54",
    baseState(),
  );
  assert.equal(result.ok, true);
  assert.equal(result.updates?.naics_codes?.[0], "54");
});

test("employee mapping handles natural intervals and approximate values", () => {
  assert.equal(parseEmployeeRange("between 500 to 1000"), "501-1000");
  assert.equal(parseEmployeeRange("around 900 employees"), "501-1000");
  assert.equal(parseEmployeeRange("more than 1000"), "1000+");
});

test("revenue mapping handles natural million and k variants", () => {
  assert.equal(parseRevenueRange("5 to 25 million"), "$5M–$25M");
  assert.equal(parseRevenueRange("25 mil rahe hain"), "$25M+");
  assert.equal(parseRevenueRange("100k to 500k"), "$100K–$500K");
});

test("owner_details step stores clean owner name from noisy response", () => {
  const result = parseStepAnswer(
    { stepId: "owner_details", ownerIndex: 0 },
    "Owner one is Harshit Malik and the ownership is 100% and he is a male.",
    baseState({ ownership_structure: [{ name: "", gender: "female", percent: 0 }] }),
  );
  assert.equal(result.ok, true);
  assert.equal(result.ownershipUpdate?.[0].name, "Harshit Malik");
});
