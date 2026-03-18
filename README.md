# 🛡️ MergeShield — PR Risk Analysis GitHub Action

Calcula un **score de riesgo (0–10)** para cada Pull Request usando heurísticas objetivas + análisis contextual con LLM. No es un code reviewer — es **visibilidad de riesgo para CTOs y tech leads**.

## ✨ Features

- **API key requerida** — validación de plan antes de cualquier análisis
- **Análisis heurístico** automático: tamaño del PR, archivos críticos, migraciones, seguridad, infra
- **Análisis LLM contextual** (opcional): impacto funcional, side-effects, contratos API
- **Multi-provider LLM**: OpenAI, Claude (Anthropic), Azure OpenAI
- **Comentario automático** en el PR con score + justificación + recomendaciones (upsert inteligente)
- **Check configurable**: falla el CI si el riesgo supera un threshold
- **Webhook de notificación** para integrar con sistemas externos (plan Premium)
- **Reporte interno** hacia el dashboard de MergeShield (plan Premium)

## 📊 Risk Score

| Score | Nivel | Significado |
|-------|-------|-------------|
| 0–4 | 🟢 Low | Cambios de bajo riesgo, merge seguro |
| 5–8 | 🟡 Medium | Requiere revisión cuidadosa |
| 9–10 | 🔴 High | Alto riesgo — revisión exhaustiva requerida |

## 🔑 Planes

| Funcionalidad | Starter | Premium |
|---------------|---------|---------|
| Repositorios | 1 | 5 |
| Proveedor LLM | OpenAI | OpenAI, Claude, Azure |
| Modelos custom | ✗ | ✓ |
| Webhook | ✗ | ✓ |
| Reporte interno | ✗ | ✓ |

Get your API key at [https://mitigation.team](https://mitigation.team).

## 🚀 Quick Start

### Uso básico (solo heurística)

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

### Uso completo (heurística + LLM)

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

### Con webhook y múltiples proveedores (Premium)

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

| Input | Requerido | Default | Descripción |
|-------|-----------|---------|-------------|
| `mergeshield-api-key` | ✅ | — | API key de MergeShield para validación de plan |
| `github-token` | ✅ | — | Token de GitHub para acceder a la API |
| `llm-provider` | ❌ | `"openai"` | Proveedor LLM: `openai`, `claude`, `azure` |
| `llm-api-key` | ❌ | `""` | API key del proveedor LLM seleccionado |
| `llm-model` | ❌ | `""` | Modelo a usar (default según proveedor) |
| `enable-llm` | ❌ | `"false"` | Activar análisis contextual con LLM |
| `risk-threshold` | ❌ | `"7"` | Score mínimo para fallar el check (0–10) |
| `webhook-url` | ❌ | `""` | URL para enviar resultados del análisis (Premium) |
| `webhook-secret` | ❌ | `""` | Secret HMAC para firmar el payload del webhook |
| `internal-reporter-url` | ❌ | `""` | URL del sistema interno de MergeShield (Premium) |
| `internal-reporter-secret` | ❌ | `""` | Secret HMAC para autenticar con el sistema interno |
| `openai-api-key` | ❌ | `""` | **DEPRECATED** — usar `llm-api-key` en su lugar |

## 📤 Outputs

| Output | Descripción |
|--------|-------------|
| `risk-score` | Score de riesgo final (0–10) |
| `risk-level` | Nivel: `low`, `medium`, `high` |
| `heuristic-score` | Score del análisis heurístico (0–10) |
| `llm-score` | Score del análisis LLM (vacío si LLM está desactivado) |
| `llm-justification` | Justificación del LLM |

### Usar outputs en steps posteriores

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

## 🔍 Reglas Heurísticas

| Regla | Max Score | Qué detecta |
|-------|-----------|--------------|
| `pr_size` | +3 | PRs grandes (>200, >500, >1000 líneas) |
| `file_count` | +2 | Muchos archivos modificados (>15, >30) |
| `migrations` | +2 | Archivos de migración o schema de DB |
| `infrastructure` | +2 | Cambios en Terraform, Docker, CI/CD |
| `security` | +2 | Archivos de auth, tokens, secrets, `.env` |
| `api_contracts` | +2 | OpenAPI, protobuf, GraphQL schemas |
| `deletion_ratio` | +1 | Alto ratio de eliminación (>70%) |
| `config_files` | +1 | `package.json`, `tsconfig`, `webpack`, etc. |
| `missing_description` | +1 | PR sin descripción o muy corta |

El score heurístico es la suma de reglas, **cappado en 10**.

## 🤖 Análisis LLM

Cuando `enable-llm: "true"`, el LLM evalúa:

1. **Impacto funcional** — ¿Qué funcionalidades se afectan?
2. **Side-effects** — ¿Puede romper algo no evidente?
3. **Seguridad** — ¿Exposición de datos o vulnerabilidades?
4. **Contratos API** — ¿Se rompe compatibilidad?
5. **Performance** — ¿N+1 queries, memory leaks?
6. **Reversibilidad** — ¿Se puede hacer rollback fácil?

**Fórmula del score final:** `Math.round((heuristic * 0.4 + llm * 0.6) * 10) / 10`

Si LLM está desactivado o falla, se usa únicamente el score heurístico.

### Proveedores soportados

| Proveedor | `llm-provider` | Modelo por defecto | Plan |
|-----------|---------------|-------------------|------|
| OpenAI | `openai` | `gpt-4o-mini` | Starter + Premium |
| Anthropic | `claude` | `claude-3-5-sonnet-20241022` | Premium |
| Azure OpenAI | `azure` | `gpt-4o-mini` | Premium |

Consulta [LLM_PROVIDERS.md](LLM_PROVIDERS.md) para configuración detallada.

## 🔔 Webhooks

Cuando se configura `webhook-url`, MergeShield envía un payload firmado con HMAC-SHA256 en el header `X-MergeShield-Signature`. Consulta [WEBHOOK.md](WEBHOOK.md) para el formato del payload y ejemplos de validación.

## 🏗️ Estructura del proyecto

```
├── action.yml                     # Definición del GitHub Action
├── index.ts                       # Entrypoint — orquestador principal
├── dist/
│   └── index.js                   # Compilado (generado por npm run build)
├── src/
│   ├── heuristics.ts              # Motor de reglas heurísticas
│   ├── llm-analyzer.ts            # Integración multi-provider LLM
│   ├── plan-validator.ts          # Validación de API key y plan tiers
│   ├── formatter.ts               # Generador de comentario Markdown
│   ├── webhook-notifier.ts        # Notificador webhook con HMAC
│   ├── internal-reporter.ts       # Reporte al sistema interno
│   └── types.ts                   # Tipos TypeScript centrales
├── package.json
└── README.md
```

## 🛠️ Desarrollo

```bash
npm run build   # TypeScript → dist/index.js (requerido antes de cada commit)
npm run test    # Tests con Node test runner
npm run lint    # ESLint en src/ e index.ts
```

## 📝 Ejemplo de comentario generado

> ## 🟡 MergeShield — Risk Score: 6.2/10 (MEDIUM RISK)
>
> ### 📊 Estadísticas del PR
> | Métrica | Valor |
> |---------|-------|
> | Líneas añadidas | +523 |
> | Líneas eliminadas | -89 |
> | Archivos modificados | 12 |
>
> ### 🔍 Análisis Heurístico
> • PR grande: 612 líneas cambiadas (>500)
> • Archivos de migración/DB detectados: `db/migrations/003_add_users.sql`
> • Archivos de configuración modificados: `package.json`

## 📄 License

MIT
