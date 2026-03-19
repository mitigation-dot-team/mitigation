# 🛡️ MergeShield — PR Risk Analysis GitHub Action

Calculates a **risk score (0–10)** for each Pull Request using objective heuristics + contextual LLM analysis. It's not a code reviewer — it's **risk visibility for CTOs and tech leads**.

## ✨ Features

- **API key required** — plan validation before any analysis
- **Automatic heuristic analysis**: PR size, critical files, migrations, security, infra
- **Contextual LLM analysis** (optional): functional impact, side-effects, API contracts
- **Multi-provider LLM**: OpenAI, Claude (Anthropic), Azure OpenAI
- **Automatic PR comment** with score + justification + recommendations (smart upsert)
- **Configurable check**: fails CI if risk exceeds a threshold
- **Notification webhook** to integrate with external systems (Premium plan)
- **Internal reporting** to the MergeShield dashboard (Premium plan)

## 📊 Risk Score

| Score | Level | Meaning |
|-------|-------|---------|
| 0–4 | 🟢 Low | Low-risk changes, safe to merge |
| 5–8 | 🟡 Medium | Requires careful review |
| 9–10 | 🔴 High | High risk — exhaustive review required |

## 🔑 Plans

| Feature | Starter | Premium |
|---------|---------|---------|
| Repositories | 1 | 5 |
| LLM Provider | OpenAI | OpenAI, Claude, Azure |
| Custom models | ✗ | ✓ |
| Webhook | ✗ | ✓ |
| Internal reporting | ✗ | ✓ |

Get your API key at [https://mitigation.team](https://mitigation.team).

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
      - uses: mitigation-dot-team/mitigation@v1
        with:
          mergeshield-api-key: ${{ secrets.MERGESHIELD_API_KEY }}
          github-token: ${{ secrets.GITHUB_TOKEN }}
```

### Full usage (heuristics + LLM)

```yaml
      - uses: mitigation-dot-team/mitigation@v1
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
      - uses: mitigation-dot-team/mitigation@v1
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
| `llm-model` | ❌ | `""` | Model to use (defaults to provider default) |
| `enable-llm` | ❌ | `"false"` | Enable contextual LLM analysis |
| `risk-threshold` | ❌ | `"7"` | Minimum score to fail the check (0–10) |
| `webhook-url` | ❌ | `""` | URL to send analysis results to (Premium) |
| `webhook-secret` | ❌ | `""` | HMAC secret to sign the webhook payload |
| `internal-reporter-url` | ❌ | `""` | MergeShield internal system URL (Premium) |
| `internal-reporter-secret` | ❌ | `""` | HMAC secret to authenticate with the internal system |
| `openai-api-key` | ❌ | `""` | **DEPRECATED** — use `llm-api-key` instead |

## 📤 Outputs

| Output | Description |
|--------|-------------|
| `risk-score` | Final risk score (0–10) |
| `risk-level` | Level: `low`, `medium`, `high` |
| `heuristic-score` | Heuristic analysis score (0–10) |
| `llm-score` | LLM analysis score (empty if LLM is disabled) |
| `llm-justification` | LLM justification |

### Using outputs in subsequent steps

```yaml
      - uses: mitigation-dot-team/mitigation@v1
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
| `file_count` | +2 | Many modified files (>15, >30) |
| `migrations` | +2 | DB migration or schema files |
| `infrastructure` | +2 | Changes to Terraform, Docker, CI/CD |
| `security` | +2 | Auth, token, secret, `.env` files |
| `api_contracts` | +2 | OpenAPI, protobuf, GraphQL schemas |
| `deletion_ratio` | +1 | High deletion ratio (>70%) |
| `config_files` | +1 | `package.json`, `tsconfig`, `webpack`, etc. |
| `missing_description` | +1 | PR with no or very short description |

The heuristic score is the sum of all rules, **capped at 10**.

## 🤖 LLM Analysis

When `enable-llm: "true"`, the LLM evaluates:

1. **Functional impact** — What features are affected?
2. **Side-effects** — Could it break something non-obvious?
3. **Security** — Data exposure or vulnerabilities?
4. **API contracts** — Is backwards compatibility broken?
5. **Performance** — N+1 queries, memory leaks?
6. **Reversibility** — Can it be easily rolled back?

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

When `webhook-url` is configured, MergeShield sends a payload signed with HMAC-SHA256 in the `X-MergeShield-Signature` header. See [WEBHOOK.md](WEBHOOK.md) for the payload format and validation examples.

## 🏗️ Project Structure

```
├── action.yml                     # GitHub Action definition
├── index.js                       # Entrypoint — main orchestrator
├── dist/
│   └── index.js                   # Bundle (generated by npm run build)
├── package.json
└── README.md
```

## 🛠️ Development

```bash
npm run build   # Bundle index.js → dist/index.js (required before each commit)
npm run test    # Tests with Node test runner
npm run lint    # ESLint on index.js
```

## 📝 Example generated comment

> ## 🟡 MergeShield — Risk Score: 6.2/10 (MEDIUM RISK)
>
> ### 📊 PR Statistics
> | Metric | Value |
> |--------|-------|
> | Lines added | +523 |
> | Lines removed | -89 |
> | Files modified | 12 |
>
> ### 🔍 Heuristic Analysis
> • Large PR: 612 lines changed (>500)
> • DB migration files detected: `db/migrations/003_add_users.sql`
> • Configuration files modified: `package.json`

## 📄 License

MIT
