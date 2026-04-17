import { afterEach, describe, expect, it, vi } from "vitest";
import { scoreCandidate, searchCompanyOnWeb } from "./web-search";

describe("web-search", () => {
  const originalFetch = global.fetch;
  const originalBearerToken = process.env.AWS_BEARER_TOKEN_BEDROCK;
  const originalRegion = process.env.BEDROCK_AWS_REGION;
  const originalAwsRegion = process.env.AWS_REGION;
  const originalModel = process.env.BEDROCK_CLAUDE_MODEL_ID;
  const originalClaudeModel = process.env.CLAUDE_MODEL;

  afterEach(() => {
    global.fetch = originalFetch;
    if (originalBearerToken === undefined) delete process.env.AWS_BEARER_TOKEN_BEDROCK;
    else process.env.AWS_BEARER_TOKEN_BEDROCK = originalBearerToken;
    if (originalRegion === undefined) delete process.env.BEDROCK_AWS_REGION;
    else process.env.BEDROCK_AWS_REGION = originalRegion;
    if (originalAwsRegion === undefined) delete process.env.AWS_REGION;
    else process.env.AWS_REGION = originalAwsRegion;
    if (originalModel === undefined) delete process.env.BEDROCK_CLAUDE_MODEL_ID;
    else process.env.BEDROCK_CLAUDE_MODEL_ID = originalModel;
    if (originalClaudeModel === undefined) delete process.env.CLAUDE_MODEL;
    else process.env.CLAUDE_MODEL = originalClaudeModel;
    vi.restoreAllMocks();
  });

  it("prioritizes authoritative Indian domains over aggregators", () => {
    const q = "Reliance Industries";
    const authority = scoreCandidate(q, {
      title: "Reliance Industries Limited shareholding",
      snippet: "Official filing",
      url: "https://www.nseindia.com/get-quotes/equity?symbol=RELIANCE",
      domain: "www.nseindia.com",
    });
    const aggregator = scoreCandidate(q, {
      title: "Reliance Industries - profile",
      snippet: "Professional profile",
      url: "https://www.linkedin.com/company/reliance",
      domain: "www.linkedin.com",
    });

    expect(authority).toBeGreaterThan(aggregator);
  });

  it("normalizes Bedrock response into candidates", async () => {
    process.env.CLAUDE_MODEL = "us.anthropic.claude-sonnet-4-5-20250929-v1:0";
    process.env.AWS_BEARER_TOKEN_BEDROCK = "test-token";
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          content: [
            {
              type: "text",
              text: JSON.stringify({
                candidates: [
                  {
                    title: "Reliance Industries Limited",
                    snippet: "Official corporate profile",
                    url: "https://www.ril.com",
                    source: "bedrock_claude",
                  },
                ],
              }),
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    const out = await searchCompanyOnWeb("Reliance Industries");

    expect(out.provider).toBe("aws_bedrock_claude");
    expect(out.candidates[0]?.domain).toBe("www.ril.com");
    expect(out.fallbackReason).toBeUndefined();
  });

  it("returns missing-config reason when AWS config is missing", async () => {
    delete process.env.AWS_BEARER_TOKEN_BEDROCK;
    delete process.env.BEDROCK_CLAUDE_MODEL_ID;
    delete process.env.CLAUDE_MODEL;

    const out = await searchCompanyOnWeb("Reliance Industries");

    expect(out.provider).toBe("aws_bedrock_claude");
    expect(out.candidates).toEqual([]);
    expect(out.fallbackReason).toBe("BEDROCK_MISSING_CONFIG");
  });

  it("sends only Bedrock invoke request with bearer token", async () => {
    process.env.CLAUDE_MODEL = "us.anthropic.claude-sonnet-4-5-20250929-v1:0";
    process.env.AWS_BEARER_TOKEN_BEDROCK = "test-token";
    process.env.BEDROCK_AWS_REGION = "us-east-1";
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          content: [
            {
              type: "text",
              text: JSON.stringify({
                candidates: [
                  {
                    title: "StatusNeo",
                    snippet: "AI transformation partner",
                    url: "https://statusneo.com",
                  },
                ],
              }),
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    await searchCompanyOnWeb("StatusNeo");

    const bedrockRequestInit = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
    const requestBody = JSON.parse(String(bedrockRequestInit?.body ?? "{}")) as {
      messages?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
      anthropic_version?: string;
    };
    const headers = bedrockRequestInit?.headers as Record<string, string> | undefined;

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0] ?? "")).toContain("/model/us.anthropic.claude-sonnet-4-5-20250929-v1%3A0/invoke");
    expect(headers?.authorization).toBe("Bearer test-token");
    expect(requestBody.anthropic_version).toBe("bedrock-2023-05-31");
    expect(requestBody.messages?.[0]?.content?.[0]?.type).toBe("text");
  });
});
