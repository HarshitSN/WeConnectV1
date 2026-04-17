This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## WEC-Guardian POC

Copy [`.env.example`](./.env.example) to `.env.local`.

Required for LLM flow:
- `GEMINI_API_KEY` (Google AI Studio)
- `GEMINI_MODEL` (optional, defaults to `gemini-2.5-flash`)
- `GEMINI_MODEL_FALLBACKS` (optional comma-separated fallback order, tried before demo fallback; if unset, built-in safe defaults are used)

Required for Bedrock company discovery:
- `AWS_BEARER_TOKEN_BEDROCK` (bearer token for Bedrock runtime call path)
- `CLAUDE_MODEL` (Claude Sonnet model id, e.g. `us.anthropic.claude-sonnet-4-5-20250929-v1:0`)
- `BEDROCK_AWS_REGION` (optional, defaults to `us-east-1`)
- Backward-compatible aliases are still accepted: `BEDROCK_CLAUDE_MODEL_ID` and standard AWS credential chain.

Optional for chain anchoring (Base Sepolia):
- `CHAIN_MODE` (`demo`, `auto`, `real`)
- `CHAIN_RPC_URL` (Base Sepolia RPC URL)
- `CHAIN_PRIVATE_KEY` (0x-prefixed signer key; use funded testnet wallet only)
- `CHAIN_ID` (defaults to `84532`)
- `CHAIN_CONTRACT_ADDRESS` (optional; if set, anchoring uses contract call path)

Discovery behavior:
- Static KB lookup runs first.
- If KB has no match, discovery calls AWS Bedrock Claude with native web-search enabled.
- No fallback provider is used; Bedrock errors are surfaced in the discovery response `fallbackReason`.
- For top web candidates, the app fetches public page text and extracts structured hints (country, owner/founder, industry, employee/revenue signals) for richer prefill.
- Discovery now applies deterministic candidate scoring and lets users pick among top matches when confidence is low.
- ID video checks include confidence-aware gating; low confidence keeps the flow in retry mode.
- Certificate verification page includes provenance summary (discovery provider + vision pass/fail).
- Certificate provenance now includes anchoring mode (`real` or `demo`) and fallback reason in auto mode.
- Terminal logs show Bedrock search status (`BEDROCK_WEB_SEARCH`).
- Gemini calls now try model fallbacks (if configured) before entering demo mode.

Chain anchoring behavior:
- `CHAIN_MODE=demo`: always generate simulated tx hash (no RPC call).
- `CHAIN_MODE=auto`: attempt Base Sepolia transaction and confirmation; if config/provider/send fails, fallback to simulated hash.
- `CHAIN_MODE=real`: require Base Sepolia transaction success; failures bubble up as anchoring errors.
- With `CHAIN_CONTRACT_ADDRESS` set, the app calls `anchorVerification(...)` on contract (contract-call path).
- Without it, app anchors by sending signed digest in tx calldata (tx-data path).

Admin ops:
- `/admin` now includes a Demo Health panel (Gemini config, chain config validity, latest cert anchor mode/path).
- `/admin` includes a "Run registry watcher tick" control to simulate scheduled registry deltas and auto-revoke eligible active certificates.

Deploy to Vercel with the same variables. Use **Chrome** over **HTTPS** for camera + Web Speech API.

Routes: `/` user flow, `/admin` terminal + revoke, `/demo` split-screen, `/verify/[certId]` public check.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
