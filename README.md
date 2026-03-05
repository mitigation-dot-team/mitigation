# 🛡️ MergeShield — PR Risk Analysis GitHub Action

MergeShield is now part of Mitigation dot Team.

Calculates a **risk score (0–10)** for each Pull Request using objective heuristics plus optional contextual analysis with LLMs. This is not a code reviewer — it provides **risk visibility for CTOs and tech leads**.

## ✨ Features

- **API key required** — plan validation before any analysis
- **Automatic heuristic analysis**: PR size, critical files, migrations, security, infra
- **Optional LLM contextual analysis**: functional impact, side-effects, API contract issues
- **Multi-provider LLM**: OpenAI, Claude (Anthropic), Azure OpenAI
- **Automatic PR comment** with score, justification, and recommendations (smart upsert)
- **Configurable check**: fail CI if risk exceeds a threshold
- **Webhook notifications** to integrate with external systems (Premium plan)
- **Internal reporting** to the MergeShield dashboard (Premium plan)

## 📊 Risk Score

| Score | Level | Meaning |
|-------|-------|---------|
| 0–4 | 🟢 Low | Low-risk changes, safe to merge |
| 5–8 | 🟡 Medium | Requires careful review |
| 9–10 | 🔴 High | High risk — thorough review required |

## 🔑 Plans

| Feature | Starter | Premium |
|---------|---------|---------|
| Repositories | 1 | 5 |
| LLM provider | OpenAI | OpenAI, Claude, Azure |
| Custom models | ✗ | ✓ |
| Webhook | ✗ | ✓ |
| Internal reporting | ✗ | ✓ |

Get your API key at [https://mergeshield.dev](https://mergeshield.dev).

## 🚀 Quick Start

### Basic usage (heuristics only)

```yaml
name: MergeShield
on:
  pull_request:
    types: [opened, synchronize, reopened]

permissions:
  pull-requests: write
  contents: read

jobs:
  risk-analysis:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: tu-org/mergeshield-action@v1
        with:
          mergeshield-api-key: ${{ secrets.MERGESHIELD_API_KEY }}
          github-token: ${{ secrets.GITHUB_TOKEN }}
```

### Full usage (heuristics + LLM)

```yaml
      - uses: tu-org/mergeshield-action@v1
        with:
          mergeshield-api-key: ${{ secrets.MERGESHIELD_API_KEY }}
          github-token: ${{ secrets.GITHUB_TOKEN }}
          llm-provider: "openai"
          llm-api-key: ${{ secrets.OPENAI_API_KEY }}
          enable-llm: "true"
          risk-threshold: "7"
```

### With webhook and multiple providers (Premium)

```yaml
      - uses: tu-org/mergeshield-action@v1
        with:
          mergeshield-api-key: ${{ secrets.MERGESHIELD_API_KEY }}
          github-token: ${{ secrets.GITHUB_TOKEN }}
          llm-provider: "claude"
          llm-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
          enable-llm: "true"
          webhook-url: ${{ secrets.WEBHOOK_URL }}
          webhook-secret: ${{ secrets.WEBHOOK_SECRET }}
```

## ⚙️ Inputs

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `mergeshield-api-key` | ✅ | — | MergeShield API key for plan validation |
| `github-token` | ✅ | — | GitHub token to access the API |
| `llm-provider` | ❌ | `"openai"` | LLM provider: `openai`, `claude`, `azure` |
| `llm-api-key` | ❌ | `""` | API key for the selected LLM provider |
| `llm-model` | ❌ | `""` | Model to use (provider default if empty) |
| `enable-llm` | ❌ | `"false"` | Enable LLM contextual analysis |
| `risk-threshold` | ❌ | `"7"` | Score threshold to fail the check (0–10) |
| `webhook-url` | ❌ | `""` | URL to send analysis results (Premium) |
| `webhook-secret` | ❌ | `""` | HMAC secret to sign the webhook payload |
| `internal-reporter-url` | ❌ | `""` | Internal MergeShield reporter URL (Premium) |
| `internal-reporter-secret` | ❌ | `""` | HMAC secret for internal reporter (Premium) |
| `openai-api-key` | ❌ | `""` | **DEPRECATED** — use `llm-api-key` instead |

## 📤 Outputs

| Output | Description |
|--------|-------------|
| `risk-score` | Final risk score (0–10) |
| `risk-level` | Level: `low`, `medium`, `high` |
| `heuristic-score` | Heuristic analysis score (0–10) |
| `llm-score` | LLM analysis score (empty if LLM disabled) |
| `llm-justification` | LLM justification text |

### Using outputs in later steps

```yaml
      - uses: tu-org/mergeshield-action@v1
        id: mergeshield
        with:
          mergeshield-api-key: ${{ secrets.MERGESHIELD_API_KEY }}
          github-token: ${{ secrets.GITHUB_TOKEN }}

      - name: Check risk
        run: |
          echo "Risk: ${{ steps.mergeshield.outputs.risk-score }}"
          echo "Level: ${{ steps.mergeshield.outputs.risk-level }}"
```

## 🔍 Heuristic Rules

| Rule | Max Score | What it detects |
|------|-----------|-----------------|
| `pr_size` | +3 | Large PRs (>200, >500, >1000 lines) |
| `file_count` | +2 | Many files changed (>15, >30) |
| `migrations` | +2 | Database migration/schema files |
| `infrastructure` | +2 | Changes in Terraform, Docker, CI/CD |
| `security` | +2 | Auth, token, secrets, `.env` files |
| `api_contracts` | +2 | OpenAPI, protobuf, GraphQL schemas |
| `deletion_ratio` | +1 | High deletion ratio (>70%) |
| `config_files` | +1 | `package.json`, `tsconfig`, `webpack`, etc. |
| `missing_description` | +1 | PR without description or too short |

The heuristic score is the sum of rules, capped at 10.

## 🤖 LLM Analysis

When `enable-llm: "true"`, the LLM evaluates:

1. **Functional impact** — Which features are affected?
2. **Side-effects** — Could it break something non-obvious?
3. **Security** — Data exposure or vulnerabilities?
4. **API contracts** — Is compatibility broken?
5. **Performance** — N+1 queries, memory leaks?
6. **Reversibility** — Is rollback straightforward?

**Final score formula:** `Math.round((heuristic * 0.4 + llm * 0.6) * 10) / 10`

If LLM is disabled or fails, only the heuristic score is used.

### Supported providers

| Provider | `llm-provider` | Default model | Plan |
|----------|---------------|---------------|------|
| OpenAI | `openai` | `gpt-4o-mini` | Starter + Premium |
| Anthropic | `claude` | `claude-3-5-sonnet-20241022` | Premium |
| Azure OpenAI | `azure` | `gpt-4o-mini` | Premium |

See [LLM_PROVIDERS.md](LLM_PROVIDERS.md) for detailed configuration.

## 🔔 Webhooks

When `webhook-url` is configured, MergeShield sends a payload signed with HMAC-SHA256 in the `X-MergeShield-Signature` header. See [WEBHOOK.md](WEBHOOK.md) for payload format and validation examples.

## 🏗️ Project structure

```
├── action.yml                     # GitHub Action definition
├── index.ts                       # Entrypoint — main orchestrator
├── dist/
│   └── index.js                   # Compiled output (generated by npm run build)
├── src/
│   ├── heuristics.ts              # Heuristic rules engine
│   ├── llm-analyzer.ts            # Multi-provider LLM integration
│   ├── plan-validator.ts          # API key and plan validation
│   ├── formatter.ts               # Markdown comment generator
│   ├── webhook-notifier.ts        # Webhook notifier with HMAC
│   ├── internal-reporter.ts       # Internal reporting to dashboard
│   └── types.ts                   # Central TypeScript types
├── package.json
└── README.md
```

## 🛠️ Development

```bash
npm run build   # TypeScript → dist/index.js (required before each commit)
npm run test    # Run tests with Node test runner
npm run lint    # ESLint on src/ and index.ts
```

## 📝 Example generated comment

> ## 🟡 MergeShield — Risk Score: 6.2/10 (MEDIUM RISK)
>
> ### 📊 PR statistics
> | Metric | Value |
> |--------|-------|
> | Lines added | +523 |
> | Lines removed | -89 |
> | Files changed | 12 |
>
> ### 🔍 Heuristic analysis
> • Large PR: 612 lines changed (>500)
> • Migration/DB files detected: `db/migrations/003_add_users.sql`
> • Configuration files modified: `package.json`

## 📄 License

MIT
