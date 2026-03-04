# MergeShield Copilot Instructions

## Architecture Overview

MergeShield is a GitHub Action (entrypoint: `dist/index.js`, compiled from `index.ts`) that scores PR risk 0–10 using heuristics + optional LLM analysis, then posts a comment, optionally reports internally, and fails CI if score ≥ threshold.

### Orchestration flow in `index.ts`
1. Read inputs → `mergeshield-api-key` is **required** (validates against `https://api.mergeshield.dev/v1/validate-key`)
2. `validateApiKey()` + `enforcePlanRestrictions()` — gates features based on plan tier **before** any PR work
3. Fetch PR data via GitHub API (metadata + diff, up to 300 files)
4. `analyzeHeuristics(prData)` → `HeuristicResult`
5. Optional `analyzePRWithLLM(params)` → `LLMAnalysis` (silently skipped on error via `core.warning()`)
6. Combine: `finalScore = Math.round((heuristic * 0.4 + llm * 0.6) * 10) / 10`; heuristic-only if LLM disabled
7. Upsert PR comment — find existing comment by the `COMMENT_MARKER` string, update or create
8. `reportToInternal()` then `notifyWebhook()` (both non-blocking, both gated by plan)
9. `core.setOutput()` + `core.setFailed()` if `finalScore >= riskThreshold`

### Plan tiers (`src/plan-validator.ts`)
| Plan | Repos | Webhook | Reporter | Providers | Custom models |
|------|-------|---------|----------|-----------|---------------|
| `starter` | 1 | ✗ | ✗ | openai only | ✗ |
| `premium` | 5 | ✓ | ✓ | openai, claude, azure | ✓ |

`enforcePlanRestrictions()` **throws** if current repo is not in `allowedRepos`; emits `core.warning()` for configured-but-disabled features (non-blocking).

### Key files
| File | Key Exports |
|------|-------------|
| `index.ts` | `run()` |
| `src/heuristics.ts` | `analyzeHeuristics()`, `CRITICAL_PATTERNS` |
| `src/llm-analyzer.ts` | `analyzePRWithLLM()`, `parseLLMResponse()` |
| `src/plan-validator.ts` | `validateApiKey()`, `enforcePlanRestrictions()` |
| `src/types.ts` | `PRData`, `RuleResult`, `HeuristicResult`, `LLMAnalysis`, `LLMProvider`, `PlanConfig`, `MergeShieldPlan` |
| `src/formatter.ts` | `formatComment()` |
| `src/webhook-notifier.ts` | `notifyWebhook()` — HMAC header: `X-MergeShield-Signature` |
| `src/internal-reporter.ts` | `reportToInternal()` — HMAC header: `X-MergeShield-Reporter-Signature`, 10s timeout |

## Developer Workflows

- `npm run build` — TypeScript → `dist/index.js`; **required before every commit** (action runs dist)
- `npm run test` — Node test runner via tsx, targets `src/__tests__/*.test.ts`
- `npm run lint` — ESLint on `src/` and `index.ts`

### Testing pattern (`src/__tests__/heuristics.test.ts`)
```typescript
const result = analyzeHeuristics(makePR({ additions: 600, deletions: 0 }));
const rule = result.rules.find(r => r.name === "pr_size");
assert.equal(rule?.score, 2); // always test boundary conditions
```

## Key Patterns

### Adding a heuristic rule (`src/heuristics.ts`)
1. Optionally add regex to `CRITICAL_PATTERNS` (case-insensitive, tested via `pattern.test(filename)`)
2. Write `function ruleXyz(pr: PRData): RuleResult`
3. Push to the `RULES` array at bottom of file
4. Add boundary tests in `heuristics.test.ts`

### Adding an LLM provider (`src/llm-analyzer.ts`)
1. Write `async function analyzePRWithXyz(params: LLMAnalysisInput): Promise<LLMAnalysis>`
2. Add `case "xyz":` to factory switch
3. Add `"xyz"` to `LLMProvider` union type in `src/types.ts`
4. Add default model constant; document in `LLM_PROVIDERS.md`

### Adding action inputs
Declare in `action.yml` **and** read in `index.ts` step 1. Use prefix conventions (`llm-*`, `webhook-*`). Apply plan gates (`planConfig.webhookEnabled`, etc.) before using the value downstream. Deprecated inputs use the fallback pattern already in place for `openai-api-key` → `llm-api-key`.

## Score Reference
- Levels: 0–4 = `low`, 5–8 = `medium`, 9–10 = `high`
- Heuristic score: sum of rule scores, capped at 10
- With LLM: `Math.round((heuristic * 0.4 + llm * 0.6) * 10) / 10`
- CI fails when `finalScore >= riskThreshold` (default 7)
