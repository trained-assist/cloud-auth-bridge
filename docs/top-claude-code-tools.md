# Top Tools People Use with Claude Code (2026)

Ranked by popularity. Core "must-have" set: **GitHub + Linear + Filesystem + Playwright + Sentry/Datadog**.

| # | Service | Why | Auth |
|---|---------|-----|------|
| 1 | **GitHub** | PRs, issues, code review, diffs — built into every workflow | OAuth (PAT or OAuth app) |
| 2 | **Filesystem** | Local project read/write (official Anthropic reference server) | Path-based, no auth |
| 3 | **Linear** | Issue tracking → auto-implement → close PRs; described as "prerequisite" | OAuth (browser flow) |
| 4 | **Notion** | Specs, wikis, requirements — Claude reads/writes docs | OAuth |
| 5 | **Supabase** | DB schemas, migrations, queries, Postgres debugging | OAuth or API key |
| 6 | **Figma** | Design-to-code: reads components, tokens, writes annotations | OAuth |
| 7 | **Sentry** | Reads prod error traces → fix bugs, close the loop | OAuth |
| 8 | **Slack** | Channel history, deployment notifications, team workflows | OAuth |
| 9 | **Vercel** | Deployments, build logs, env vars, status monitoring | OAuth |
| 10 | **Playwright** | Claude verifies its own UI changes in a real browser (~30k GitHub stars) | No auth |
| 11 | **Jira / Confluence** | Enterprise issue tracker — Atlassian MCP GA Feb 2026 | OAuth |
| 12 | **PostgreSQL** | Direct DB access, schema inspection, query writing | Connection string |
| 13 | **Datadog** | Logs, metrics, traces — diagnose prod issues from inside Claude | API key |
| 14 | **Stripe** | Charges, customers, subscriptions, refunds for SaaS projects | API key |
| 15 | **Brave Search** | Real-time web search for docs, error messages, current info | API key |
| 16 | **AWS** | S3, Lambda, CloudFormation, EC2 infrastructure management | AWS key / IAM role |
| 17 | **Cloudflare** | Workers, KV, D1, R2, DNS management | API token |
| 18 | **Context7** | Up-to-date library docs — prevents stale API usage | No auth |
| 19 | **Memory** | Persistent context across sessions (official reference server) | No auth |
| 20 | **Docker** | Build, run, inspect containers | Docker socket |

## Auth pattern breakdown
- **OAuth browser-flow**: GitHub, Linear, Notion, Supabase, Figma, Sentry, Slack, Vercel, Jira → user clicks "Connect" once, token stored
- **API key**: Datadog, Stripe, Brave Search, Cloudflare → paste key into config
- **No auth**: Filesystem, Playwright, Context7, Memory
- **Credentials**: PostgreSQL (connection string), AWS (key pair)

## Trend (2026)
Top vendors now ship **hosted remote MCP endpoints** with OAuth. User does `claude mcp add -t http <url>`, browser OAuth handles the rest — no manual token copying. This is exactly the pattern our Chrome extension automates for sites that don't have official MCP.
