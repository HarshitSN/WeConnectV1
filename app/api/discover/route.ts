import { NextResponse } from "next/server";
import { lookupRegistry, registerDynamicCompany } from "@/lib/registry";
import { mapCompanyToPrefill } from "@/lib/registration";
import { searchCompanyOnWeb } from "@/lib/web-search";
import { enrichCompanyCandidate } from "@/lib/enrichment";
import { resolveCompanyCodes } from "@/lib/code-classification";
import {
  appendTerminal,
  getSession,
  pushMessage,
  setSessionCandidate,
  setSessionCompany,
  setSessionDiscoveryMeta,
  setSessionPaid,
  setSessionRegistration,
  setSessionStage,
} from "@/lib/session-store";

export async function POST(req: Request) {
  const body = (await req.json()) as {
    sessionId?: string;
    query?: string;
    selectedCandidateIndex?: number;
  };
  const sessionId = body.sessionId;
  const query = body.query?.trim() ?? "";
  if (!sessionId) {
    return NextResponse.json({ error: "sessionId required" }, { status: 400 });
  }
  const session = getSession(sessionId);
  if (!session) {
    return NextResponse.json({ error: "session not found" }, { status: 404 });
  }

  appendTerminal(sessionId, `[REGISTRY_SEARCH] QUERY="${query.slice(0, 80)}"`);
  appendTerminal(sessionId, "[FLOW] stage=discovery begin");
  const company = lookupRegistry(query);

  if (!company) {
    appendTerminal(sessionId, "[REGISTRY_SEARCH] NO_MATCH");
    appendTerminal(sessionId, `[GOOGLE_SERP] QUERY="${query.slice(0, 80)} company" via=serpapi`);
    let result: Awaited<ReturnType<typeof searchCompanyOnWeb>> = {
      provider: "duckduckgo",
      candidates: [],
      fallbackReason: "SEARCH_NOT_RUN",
    };
    try {
      result = await searchCompanyOnWeb(query);
    } catch {
      appendTerminal(sessionId, "[WEB_SEARCH] ERROR");
    }
    const candidates = result.candidates;
    if (result.provider === "duckduckgo") {
      appendTerminal(
        sessionId,
        `[WEB_SEARCH_FALLBACK] provider=duckduckgo reason="${result.fallbackReason ?? "unknown"}"`,
      );
      appendTerminal(sessionId, `[WEB_SEARCH] QUERY="${query.slice(0, 80)} company"`);
    } else {
      appendTerminal(sessionId, "[GOOGLE_SERP] MATCH_SOURCE=serpapi");
    }
    if (!candidates.length) {
      appendTerminal(sessionId, "[WEB_SEARCH] NO_MATCH");
      return NextResponse.json({
        ok: false,
        match: null,
        provider: result.provider,
        fallbackReason: result.fallbackReason,
        candidates: [],
        message:
          "No company found from live web search. Try a fuller legal name or include the company website.",
      });
    }
    const pickedIndex = Math.max(0, Math.min(body.selectedCandidateIndex ?? 0, candidates.length - 1));
    const selectedCandidate = candidates[pickedIndex];
    const topForClassification = candidates.slice(0, 3);
    const topEnrichments = await Promise.all(topForClassification.map((c) => enrichCompanyCandidate(c)));
    const best = topEnrichments[pickedIndex] ?? (await enrichCompanyCandidate(selectedCandidate));
    const codeClassification = await resolveCompanyCodes({
      query,
      candidates: topForClassification,
      enrichments: topEnrichments,
    });
    const inferredJurisdiction = selectedCandidate.url ? "Web search result" : "Web source (unverified)";
    const dynamic = registerDynamicCompany({
      companyName: best.legalName || selectedCandidate.title || query,
      aliases: [query],
      websiteUrl: selectedCandidate.url || `https://search.example/${encodeURIComponent(query)}`,
      jurisdiction: inferredJurisdiction,
      registrySnippet: (best.industryHint || selectedCandidate.snippet).slice(0, 140),
      primaryOwner: best.ownerName || "Unknown owner (confirm via voice)",
      ownershipFemalePct: 0,
      directors: [],
      riskFlags: ["web_source_unverified", "ownership_unverified"],
    });
    appendTerminal(
      sessionId,
      `[WEB_SEARCH] MATCH_FOUND provider="${result.provider}" entity="${dynamic.companyName}" url="${dynamic.websiteUrl}"`,
    );
    appendTerminal(
      sessionId,
      `[DISCOVERY_SCORE] selected_score=${selectedCandidate.score ?? 0} low_confidence=${Boolean(result.lowConfidence)} selected_index=${pickedIndex}`,
    );
    appendTerminal(
      sessionId,
      `[CLASSIFICATION] naics_source=${codeClassification.naics.sourceType} naics_conf=${codeClassification.naics.confidence} unspsc_source=${codeClassification.unspsc.sourceType} unspsc_conf=${codeClassification.unspsc.confidence}`,
    );
    const enrichment = mapCompanyToPrefill(dynamic, "web", best, codeClassification);
    const countryRequiresConfirmation = enrichment.countryResolution.source !== "explicit";
    setSessionCompany(sessionId, dynamic.id);
    setSessionCandidate(sessionId, {
      title: selectedCandidate.title,
      url: selectedCandidate.url,
      domain: selectedCandidate.domain,
      score: selectedCandidate.score,
    });
    setSessionDiscoveryMeta(sessionId, {
      provider: result.provider,
      fallbackReason: result.fallbackReason,
      lowConfidence: Boolean(result.lowConfidence),
    });
    setSessionRegistration(sessionId, enrichment.prefill);
    setSessionPaid(sessionId, false);
    setSessionStage(sessionId, "discovered");
    pushMessage(sessionId, {
      role: "system",
      content: `Web match: ${dynamic.companyName} (${dynamic.id})`,
    });
    appendTerminal(sessionId, "[FLOW] stage=discovery complete source=web");
    return NextResponse.json({
      ok: true,
      source: "web",
      provider: result.provider,
      fallbackReason: result.fallbackReason,
      lowConfidence: result.lowConfidence,
      message:
        "No static registry hit, but I found a live web result and prefilled what I could. Please confirm low-confidence fields.",
      match: {
        id: dynamic.id,
        companyName: dynamic.companyName,
        jurisdiction: dynamic.jurisdiction,
        registrySnippet: dynamic.registrySnippet,
        primaryOwner: dynamic.primaryOwner,
        ownershipFemalePct: null,
        ownerPrefillPct: enrichment.prefill.owner_details[0]?.ownershipPct ?? null,
      },
      candidates: candidates.map((c) => ({
        title: c.title,
        snippet: c.snippet,
        url: c.url,
        domain: c.domain,
        score: c.score,
      })),
      enrichmentSummary: {
        legalName: best.legalName,
        country: enrichment.prefill.country,
        ownerName: best.ownerName,
        industryHint: best.industryHint,
      },
      classificationSummary: {
        naics: {
          sourceType: codeClassification.naics.sourceType,
          confidence: codeClassification.naics.confidence,
        },
        unspsc: {
          sourceType: codeClassification.unspsc.sourceType,
          confidence: codeClassification.unspsc.confidence,
        },
      },
      selectedCandidateIndex: pickedIndex,
      ownershipEvidenceConfidence: best.ownerName ? 35 : 0,
      countryRequiresConfirmation,
      prefill: enrichment.prefill,
      fieldConfidence: enrichment.fieldConfidence,
      fieldSource: enrichment.fieldSource,
      evidence: enrichment.evidence,
      missingRequired: enrichment.missingRequired,
    });
  }

  appendTerminal(
    sessionId,
    `[REGISTRY_SEARCH] MATCH_FOUND entity="${company.companyName}" jurisdiction="${company.jurisdiction}"`,
  );
  appendTerminal(
    sessionId,
    `[REGISTRY_PREFILL] primary_owner="${company.primaryOwner}" female_ownership_pct=${company.ownershipFemalePct}`,
  );
  const registryCandidate = {
    title: company.companyName,
    snippet: company.registrySnippet,
    url: company.websiteUrl,
    domain: (() => {
      try {
        return new URL(company.websiteUrl).hostname;
      } catch {
        return undefined;
      }
    })(),
  };
  const best = await enrichCompanyCandidate(registryCandidate);
  const codeClassification = await resolveCompanyCodes({
    query: company.companyName,
    candidates: [registryCandidate],
    enrichments: [best],
  });
  const enrichment = mapCompanyToPrefill(company, "registry", best, codeClassification);

  setSessionCompany(sessionId, company.id);
  setSessionCandidate(sessionId, {
    title: company.companyName,
    url: company.websiteUrl,
    domain: (() => {
      try {
        return new URL(company.websiteUrl).hostname;
      } catch {
        return undefined;
      }
    })(),
    score: 100,
  });
  setSessionDiscoveryMeta(sessionId, {
    provider: "registry",
    fallbackReason: undefined,
    lowConfidence: false,
  });
  setSessionRegistration(sessionId, enrichment.prefill);
  setSessionPaid(sessionId, false);
  setSessionStage(sessionId, "discovered");
  pushMessage(sessionId, {
    role: "system",
    content: `Registry match: ${company.companyName} (${company.id})`,
  });
  appendTerminal(sessionId, "[FLOW] stage=discovery complete source=registry");
  appendTerminal(
    sessionId,
    `[CLASSIFICATION] naics_source=${codeClassification.naics.sourceType} naics_conf=${codeClassification.naics.confidence} unspsc_source=${codeClassification.unspsc.sourceType} unspsc_conf=${codeClassification.unspsc.confidence}`,
  );

  return NextResponse.json({
    ok: true,
    source: "registry",
    match: {
      id: company.id,
      companyName: company.companyName,
      jurisdiction: company.jurisdiction,
      registrySnippet: company.registrySnippet,
      primaryOwner: company.primaryOwner,
      ownershipFemalePct: company.ownershipFemalePct,
      ownerPrefillPct: enrichment.prefill.owner_details[0]?.ownershipPct ?? null,
    },
    ownershipEvidenceConfidence: 90,
    countryRequiresConfirmation: false,
    enrichmentSummary: {
      legalName: best.legalName,
      country: enrichment.prefill.country,
      ownerName: best.ownerName,
      industryHint: best.industryHint,
    },
    classificationSummary: {
      naics: {
        sourceType: codeClassification.naics.sourceType,
        confidence: codeClassification.naics.confidence,
      },
      unspsc: {
        sourceType: codeClassification.unspsc.sourceType,
        confidence: codeClassification.unspsc.confidence,
      },
    },
    prefill: enrichment.prefill,
    fieldConfidence: enrichment.fieldConfidence,
    fieldSource: enrichment.fieldSource,
    evidence: enrichment.evidence,
    missingRequired: enrichment.missingRequired,
    candidates: [],
  });
}
