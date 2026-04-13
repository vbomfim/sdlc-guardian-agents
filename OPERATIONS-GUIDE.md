# Operations Guide — Craig, Orchestrator, Operator & Playwright

How the automation layer works alongside the Guardian pipeline.

---

## The Two Layers

The SDLC Guardian Agents have two distinct layers:

```
┌─────────────────────────────────────────────────────────────┐
│  QUALITY LAYER (Guardians)                                  │
│  "Is this good enough?"                                     │
│                                                             │
│  PO → Dev → UAT → QA + Security + Privacy + Code Review → Merge  │
│  Triggered by: you asking to build something                │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  OPERATIONS LAYER (Craig + Orchestrator + Operator)         │
│  "Go do this thing."                                        │
│                                                             │
│  Craig → Orchestrator → Operator → Report                   │
│  Triggered by: schedule, or you asking for a task           │
└─────────────────────────────────────────────────────────────┘
```

The Quality Layer reviews and validates. The Operations Layer executes and reports. They don't overlap — the Operator never judges code, and Guardians never take screenshots.

---

## The Three Roles

### Craig — The Scheduler

Craig is a cron-based task scheduler built into the Copilot CLI extensions. It knows **when** to do things but not **how**. It fires prompts on a schedule and hands them to the orchestrator.

**Craig does:**
- Fire tasks on cron schedules (every morning, every Friday, every 6 hours)
- Send prompts to the Copilot CLI session

**Craig does NOT:**
- Execute tasks itself
- Know about Playwright, screenshots, or reports
- Route to specific agents (that's the orchestrator's job)

**Configuration:** `~/.copilot/craig.config.yaml`

```yaml
repo: .
schedule:
  morning_dashboard: 0 8 * * 1-5        # Weekdays at 8am
  weekly_recap: 0 17 * * 5              # Friday at 5pm
  health_check: 0 */6 * * *            # Every 6 hours
  worktree_cleanup: 0 20 * * *         # Daily at 8pm
prompts:
  morning_dashboard: >
    Operator: Take a screenshot of the Grafana dashboard at
    https://grafana.mycompany.com/d/main and save it to the
    reports directory.
  weekly_recap: >
    Operator: Generate a weekly recap of all Guardian findings
    from this week — total by severity, top recurring patterns,
    which Guardians ran, and what shipped.
  health_check: >
    Operator: Check the health endpoint at
    https://staging.myapp.com/health. If non-200, take a
    screenshot and write an incident note.
  worktree_cleanup: >
    Operator: List all git worktrees. Report any older than
    7 days that are not on an active branch.
```

**Enable Craig:**
```
craig enable
```

---

### Orchestrator — The Router

The orchestrator is the default Copilot CLI agent. It reads your prompts (or Craig's prompts) and decides who should handle them. It's the brain that routes work to the right agent.

**Routing logic:**
- "I want to build X" → **PO Guardian** (specification)
- "Review this code" → **Code Review Guardian** (quality)
- "Take a screenshot" → **Operator** (operations)
- Craig fires a scheduled prompt → Orchestrator reads it → routes to **Operator**

The orchestrator recognizes the Operator through:
1. **Trigger words** — "screenshot", "report", "health check", "clean up worktrees", "dashboard"
2. **Explicit prefix** — "Operator: do X" (useful in Craig prompts)
3. **Inference** — the Operator agent has `infer: true`, so the orchestrator matches task descriptions to agent capabilities

**The orchestrator always dispatches the Operator in `mode: "background"`** so your coding session is never blocked.

---

### Operator — The Executor

The Operator is a Copilot CLI agent (not a Guardian) that runs operational tasks. It knows **how** to do things but doesn't decide **when** or **whether** they should be done.

**Five task types:**

| Type | What it does | Tools used |
|------|-------------|------------|
| **Screenshots** | Capture web pages as PNG images | Playwright MCP |
| **Reports** | Aggregate session data into markdown summaries | session_store SQL |
| **Monitoring** | Check health endpoints, record status | curl, Playwright MCP |
| **Errands** | Fetch data, extract metrics, custom tasks | curl, gh CLI, Playwright MCP |
| **Housekeeping** | Clean worktrees, prune branches, check disk | git, bash |

**All results go to `~/.copilot/reports/`** with timestamped filenames:
```
~/.copilot/reports/
  grafana-dashboard-2026-04-05-083015.png
  weekly-recap-2026-04-05-170030.md
  health-check-2026-04-05-120000.md
  housekeeping-2026-04-05-200000.md
```

---

## What Playwright MCP Adds

Playwright MCP is an **optional** browser automation layer. Without it, the Operator still generates reports, runs health checks (via `curl`), manages worktrees, and does errands. With it, the Operator gains **eyes** — it can see web pages.

| Without Playwright | With Playwright |
|-------------------|-----------------|
| Health check: `curl` returns status code + response time | Health check: status code + response time + **screenshot of the error page** |
| Dashboard: not possible | Dashboard: **full-page PNG screenshot** of Grafana/Datadog/etc. |
| Web data: API calls only | Web data: navigate pages, click buttons, fill forms, **extract rendered content** |
| QA Guardian: code-level E2E tests | QA Guardian: **browser-based E2E tests** that click through actual UI |

### Setup

Playwright MCP is configured as an MCP server (not a CLI tool):

**Copilot CLI** — add to `~/.copilot/mcp-config.json`:
```json
{
  "servers": {
    "playwright": {
      "command": "npx",
      "args": ["@playwright/mcp@0.0.28"]
    }
  }
}
```

**VS Code** — add to `.vscode/mcp.json`:
```json
{
  "servers": {
    "playwright": {
      "command": "npx",
      "args": ["@playwright/mcp@0.0.28"]
    }
  }
}
```

Restart Copilot CLI after adding the config. Playwright tools (`browser_navigate`, `browser_take_screenshot`, `browser_click`, etc.) appear in the tool list.

> **Pin to a specific version in production.** Use `@latest` only for evaluation.

### Who Uses Playwright

| Agent | How it uses Playwright |
|-------|----------------------|
| **Operator** | Screenshots, page monitoring, data extraction, visual evidence for health checks |
| **QA Guardian** | Browser-based E2E tests (Step 4b) — clicking through UI to validate acceptance criteria |

Both gracefully degrade when Playwright is unavailable — the Operator skips browser tasks and reports the gap, the QA Guardian skips Step 4b.

---

## The Full Data Flow

### Manual request:

```
You: "Take a screenshot of our staging dashboard"
  ↓
Orchestrator recognizes "screenshot" → dispatches Operator (background)
  ↓
Operator:
  1. Validates URL
  2. Checks Playwright MCP available
  3. browser_navigate → staging dashboard
  4. browser_take_screenshot → PNG
  5. Saves to ~/.copilot/reports/staging-dashboard-2026-04-05-143000.png
  6. Reports back: "Screenshot saved to [path]"
  ↓
You get notified (macOS banner + voice + terminal bell)
```

### Craig-scheduled task:

```
Craig: cron fires at 8am → sends prompt to session
  ↓
Orchestrator reads prompt → recognizes "Operator:" prefix → dispatches Operator (background)
  ↓
Operator executes the task → saves report to ~/.copilot/reports/
  ↓
You get notified when you next open a session (or immediately if session is active)
```

### Combined: operations + quality in one day

```
 8:00  Craig → Operator: morning dashboard screenshot    ← Operations Layer
 8:05  Craig → Operator: staging health check            ← Operations Layer
 9:00  You: "I want to add file upload feature"          ← Quality Layer kicks in
 9:01  Orchestrator → PO Guardian → ticket               │
 9:15  You: "Looks good, implement it"                   │
 9:16  Orchestrator → Dev Guardian → TDD implementation   │
 9:45  UAT checkpoint → you test                         │
10:00  QA + Security + Privacy + Code Review (parallel)     │ (QA uses Playwright for E2E!)
10:15  All pass → merge                                  ← Quality Layer done
12:00  Craig → Operator: midday health check             ← Operations Layer
17:00  Craig → Operator: weekly findings recap            ← Operations Layer
20:00  Craig → Operator: worktree cleanup                ← Operations Layer
```

The two layers work independently. Operations tasks never block your coding. Guardians never do ops tasks.

---

## Practical Examples

### "I want a morning dashboard every weekday"

1. Configure Craig:
   ```yaml
   schedule:
     morning_dashboard: 0 8 * * 1-5
   prompts:
     morning_dashboard: >
       Operator: Take a screenshot of
       https://grafana.mycompany.com/d/main
   ```
2. Enable Craig: `craig enable`
3. Every weekday at 8am, a PNG appears in `~/.copilot/reports/`

### "Show me what the Guardians found this week"

Just ask:
```
Generate a weekly recap of Guardian findings
```

The orchestrator dispatches the Operator, which queries `session_store` and writes a markdown report with findings by severity, recurring patterns, and which Guardians ran.

### "Is staging healthy?"

Just ask:
```
Check the health of https://staging.myapp.com/health
```

The Operator curls the endpoint, records status + latency, and if it's down, takes a Playwright screenshot of the error page as evidence.

### "Clean up old worktrees from last week's reviews"

Just ask:
```
Clean up worktrees older than 7 days
```

The Operator lists all worktrees, reports which are stale, and asks for your confirmation before removing any.

---

## Safety

The Operator follows the same **Command Risk Classification** as all Guardians:

| Risk | Examples | Behavior |
|------|----------|----------|
| **LOW** | `curl`, `git log`, `git worktree list`, screenshots | Execute normally |
| **MEDIUM** | `git branch -d`, file creation in reports/ | Execute, note in report |
| **HIGH** | `rm -rf`, `git push --force`, `gh pr merge` | **Stop and ask you first** |

The Operator also:
- **Never modifies production systems** — it reports, it does not remediate
- **Validates all URLs** — rejects internal IPs, dangerous schemes, and redirects
- **Redacts secrets from reports** — strips tokens, API keys, auth headers
- **Runs in background** — never blocks your coding session

---

## File Structure

```
~/.copilot/
├── craig.config.yaml                    ← Craig schedules
├── instructions/
│   ├── operator.instructions.md         ← Operator delegation rules
│   ├── sdlc-workflow.instructions.md    ← Risk classification + pipeline rules
│   └── *.notes.md                       ← Side-notes (Improvement Cycle)
├── agents/
│   └── operator.agent.md               ← Operator procedures + tool awareness
├── reports/                             ← All Operator output goes here
│   ├── grafana-dashboard-2026-04-05-083015.png
│   ├── weekly-recap-2026-04-05-170030.md
│   └── health-check-2026-04-05-120000.md
└── mcp-config.json                      ← Playwright MCP config (global)
```

---

## Quick Reference

| What you want | What to say or configure |
|---------------|-------------------------|
| One-off screenshot | "Take a screenshot of [URL]" |
| One-off report | "Generate a report of Guardian findings this week" |
| One-off health check | "Check the health of [URL]" |
| Scheduled screenshot | Add to `craig.config.yaml` + `craig enable` |
| Scheduled report | Add to `craig.config.yaml` + `craig enable` |
| Browser E2E tests | Install Playwright MCP → QA Guardian uses it automatically |
| Clean up worktrees | "Clean up old worktrees" |
| Check disk usage | "How much disk space are reports using?" |
| View reports | `ls ~/.copilot/reports/` |
