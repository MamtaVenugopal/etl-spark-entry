# Agent 4 — Delivery and chart visualization

## Delivery sub-phases

Sequential fail-fast inside `DeliveryAgent`:

1. **ProfileAgent** — YData profiling
2. **TestAgent** — structural pytest
3. **PrAgent** — GitHub PR (+ Gate 2)
4. **DeployAgent** — sample table, chart, audit, PDF

## Chart selection (inside Deploy only)

Not a separate worker step or delivery sub-agent.

| Layer | Component | LLM? |
|-------|-----------|------|
| Selection | `ChartSelectionAgent` + [visualization_selection.txt](../../src/prompts/visualization_selection.txt) (primary) · [chart_selection.txt](../../src/prompts/chart_selection.txt) (legacy fallback) | Yes (rules fallback) |
| Data | `build_chart_preview()` | No — acceptance-scoped SQL |
| PDF | `fetch_chart_data()` + matplotlib | No |
| UI | `DeliveryResults.tsx` | No |

## Chart types

`line`, `bar`, `horizontal_bar`, `surface_3d`, `grouped_bar`, `scatter`, `histogram`, `pie`, `donut`

## Environment (backend `.env`)

- `CHART_PROFILE_ENABLED=true` — enable chart profile + preview
- `CHART_SELECTION_USE_LLM=true` — use universal visualization prompt (requires `OPENAI_API_KEY`)

## Evaluation

Chart checks are part of `evaluations.deploy` (`chart_profile`, `chart_preview_rows`).
