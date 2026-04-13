# User Guide — SDLC Guardian Agents

A practical guide to using the SDLC Guardian pipeline. Learn the workflow, the prompts, and how ideas become production code.

---

## The Workflow

Everything follows this path:

```
💡 Idea → 📋 Ticket → 🌿 Branch → 👨‍💻 Code → 🧑‍🔬 Test → 🔍 Review → 🚀 Merge
```

You describe what you want. The Guardians handle the rest.

### Step by Step

| Step | What happens | Who does it | Your prompt |
|------|-------------|-------------|-------------|
| 1. **Idea** | You describe what you want | You | *"I want to add user file uploads"* |
| 2. **Specification** | PO Guardian researches, asks questions, writes a ticket | PO Guardian | *(automatic — orchestrator invokes PO)* |
| 3. **Approval** | You review the full spec, answer open questions, confirm | You | *"Looks good, proceed"* or *"Change X to Y"* |
| 4. **Implementation** | Developer Guardian creates a branch, writes tests first, implements | Dev Guardian | *(automatic — orchestrator invokes Dev)* |
| 5. **Testing** | You test the implementation in the worktree | You | *"Looks good"* or *"The button doesn't work when..."* |
| 6. **Review** | QA + Security + Privacy + Code Review Guardians review in parallel | 4 Guardians | *(automatic — orchestrator invokes all four)* |
| 7. **Fix** | Developer fixes any critical/high findings | Dev Guardian | *(automatic if findings exist)* |
| 8. **Merge** | PR created, CI passes, you approve the merge | You | *"Merge it"* |

---

## How to Prompt

### Starting a feature

Just describe what you want in natural language. The orchestrator handles the pipeline.

```
I want to add a REST API endpoint for user profile photos.
Users should be able to upload a photo (max 5MB, JPEG/PNG only),
and retrieve it via a public URL.
```

The orchestrator will:
1. Notice there's no ticket → invoke PO Guardian
2. PO Guardian asks you clarifying questions (auth? storage? resize?)
3. PO Guardian creates an issue (GitHub or Azure DevOps) with the full 18-section spec
4. Orchestrator presents the spec to you for approval
5. After you approve → Developer Guardian builds it

### Reporting a bug

```
There's a bug in the login flow. When a user enters a wrong password
three times, the account locks but the error message still says
"Invalid password" instead of "Account locked."
```

Same pipeline — PO Guardian specs the fix, Dev Guardian implements it.

### Requesting a review

```
Review the code in this repo for security issues.
```

The orchestrator invokes the Security Guardian, which runs Semgrep, Gitleaks, and manual review.

### Checking for privacy/compliance issues

```
Check this code for PII leaks in logging.
```

```
Run a HIPAA compliance review on the patient module.
```

The orchestrator invokes the Privacy Guardian, which classifies data by sensitivity tier (PHI → PII → quasi-identifiers) and checks GDPR, HIPAA, and CCPA compliance.

### Asking for tests

```
Write integration tests for the payment module.
```

The orchestrator invokes the QA Guardian, which traces tests to acceptance criteria.

---

## What to expect at each stage

### PO Guardian — Specification

The PO Guardian will:
- **Ask you questions** — don't expect it to assume. It asks about auth, deployment, accessibility, data sensitivity, etc.
- **Classify your app type** — frontend, API, full-stack, CLI, etc. This determines which quality concerns apply.
- **Check project documentation** — if README or ARCHITECTURE.md is missing, it offers to create them with you.
- **Decompose large requests** — breaks big features into modules, then components, then tickets. You approve the decomposition before it details anything.
- **Create an issue** — the spec lives in the issue tracker (GitHub Issues, Azure DevOps Work Items, etc.), not in a markdown file.

**Example interaction:**
```
You: I want to build a real-time chat feature.

PO: Before I spec this out, I need to clarify a few things:
    1. Authentication — who can chat? Logged-in users only?
    2. Persistence — are messages stored? For how long?
    3. Scale — how many concurrent users?
    4. This is a large feature. I'd break it into:
       - Module 1: WebSocket server + message routing
       - Module 2: Message persistence + history API
       - Module 3: Chat UI components
       Should I detail Module 1 first?

You: Yes, logged-in users only, store for 30 days, expect 500 concurrent.
     Start with Module 1.
```

### Developer Guardian — Implementation

The Developer Guardian will:
- Create a **git worktree** on a feature branch (isolated from your work)
- Write **unit tests first** (TDD — failing tests before code)
- **Implement** the minimum code to pass the tests
- **Run all tests** before handing off
- Report the **worktree path, branch name, and run/test commands**

**You'll see a handoff like:**
```
Developer Guardian — Implementation Complete

Worktree: /tmp/dev-guardian-1712345678
Branch: feature/issue-42-user-uploads
Run: npm test
Start: npm run dev

Files changed: 6
Tests: 14 written, all passing

Assumptions:
- Used S3 for storage (no preference in ticket — used existing pattern)
- Max file size 5MB enforced at middleware level

Open Questions:
- Should we generate thumbnails? (deferred to follow-up ticket)
```

### UAT Checkpoint — Your Turn to Test

After the Developer Guardian finishes, you get a chance to test:

```
Orchestrator: Implementation is ready. The worktree is at /tmp/dev-guardian-1712345678
              on branch feature/issue-42-user-uploads.

              Would you like to test before the review pipeline?
              - Yes — I'll wait while you test
              - Skip — proceed to reviews

You: Yes
(you test, find an issue)

You: The upload works but there's no file type validation on the server side.
(Developer Guardian pair-fixes, you test again)

You: Looks good now.
```

### Review Gate — QA + Security + Privacy + Code Review

After UAT, four Guardians review in parallel:

- **QA Guardian** — writes integration/E2E tests, runs them, reports coverage gaps
- **Security Guardian** — runs Semgrep + Gitleaks + manual review, reports OWASP findings
- **Privacy Guardian** — detects PII/PHI leaks, checks GDPR/HIPAA/CCPA compliance, audits logging hygiene
- **Code Review Guardian** — runs linters + dual-model review (two AI models independently)

All four must complete. Critical/high findings → Developer fixes before merge.

### Merge

Once all reviews pass:
```
Orchestrator: All 4 Guardians reviewed. Results:
              - QA: 8 tests written, all passing, no gaps
              - Security: 0 critical, 0 high, 2 medium (noted for later)
              - Privacy: 0 findings (no PII/PHI in scope)
              - Code Review: 1 medium (rename suggestion), 2 info

              Ready to merge. Proceed?

You: Merge it.
```

---

## Using the Operator

The Operator is a task runner for operational chores — screenshots, reports, health checks, errands, and housekeeping. It is NOT a Guardian. It runs tasks and saves results to `~/.copilot/reports/`.

### Screenshots

```
Take a screenshot of https://grafana.mycompany.com/d/main
```

The Operator navigates to the URL via Playwright MCP, captures a full-page screenshot, and saves it:
```
Operator: Screenshot saved to ~/.copilot/reports/grafana-dashboard-2026-04-05-083015.png
```

**Requires Playwright MCP** — see [PREREQUISITES.md](PREREQUISITES.md) §7 for setup. Without it, the Operator reports the gap and suggests installation.

### Reports

```
Summarize all Guardian findings from this week.
```

The Operator queries the session store, aggregates findings by severity and Guardian, and writes a markdown report:
```
Operator: Report saved to ~/.copilot/reports/weekly-recap-2026-04-05-170030.md

# Weekly Recap — 2026-04-05
## Summary
3 sessions with Guardian activity this week.
## Results
| Severity | Count |
|----------|-------|
| Critical | 0     |
| High     | 2     |
| Medium   | 5     |
...
```

### Health Checks

```
Check the health endpoint at https://staging.myapp.com/health
```

The Operator makes an HTTP request, records the status code and response time, and writes a brief note:
```
Operator: Health check complete.
  Status: 200 OK
  Response time: 0.342s
  Report: ~/.copilot/reports/health-check-2026-04-05-120000.md
```

### Housekeeping

```
List all git worktrees older than 7 days.
```

The Operator lists worktrees, identifies stale ones, and reports — it asks before removing anything:
```
Operator: Found 3 worktrees older than 7 days:
  /tmp/dev-guardian-1712000000 — branch: feature/old-thing (12 days)
  /tmp/dev-guardian-1712100000 — branch: fix/stale-bug (9 days)
  /tmp/dev-guardian-1712200000 — branch: experiment/poc (8 days)

Should I remove these? (This is a MEDIUM-risk action — local only, reversible.)
```

### Craig + Operator

Craig can schedule any Operator task. The routing works automatically — Craig sends a prompt, the orchestrator infers the Operator, and the Operator runs in the background.

**Example: Morning dashboard screenshots**

```yaml
# ~/.copilot/craig.config.yaml
schedule:
  morning_dashboard: 0 8 * * 1-5
prompts:
  morning_dashboard: >
    Take a screenshot of the Grafana dashboard at
    https://grafana.mycompany.com/d/main and save it to the
    reports directory with today's date.
```

Every weekday at 8 AM, Craig triggers the Operator to capture the dashboard. You get a notification when it's done.

**Example: Weekly Guardian recap**

```yaml
schedule:
  weekly_recap: 0 17 * * 5
prompts:
  weekly_recap: >
    Query the session store for all Guardian findings from this
    week. Generate a weekly recap with total findings by severity,
    top 3 recurring patterns, and which Guardians ran.
```

Every Friday at 5 PM, the Operator summarizes the week's Guardian activity.

**Example: Periodic health checks**

```yaml
schedule:
  staging_health: 0 */6 * * *
prompts:
  staging_health: >
    Check the health endpoint at https://staging.myapp.com/health.
    If non-200, take a screenshot and write an incident note.
```

Every 6 hours, the Operator pings your staging health endpoint.

### Report Output

All Operator output lives in `~/.copilot/reports/`:

```
~/.copilot/reports/
├── grafana-dashboard-2026-04-05-083015.png
├── weekly-recap-2026-04-05-170030.md
├── health-check-2026-04-05-120000.md
├── health-check-2026-04-05-180000.md
└── housekeeping-2026-04-06-200015.md
```

Files are never overwritten — the HHmmss timestamp ensures uniqueness.

---

## Craig — Scheduled Tasks

Craig is a lightweight scheduler that runs inside your CLI session. It sends prompts at configured times — the CLI agent does the work.

### Getting started

```
craig enable                    # Activate scheduler for this session
craig status                    # Show current schedule and last runs
```

### Scheduling tasks

```
# Natural language — the agent translates to tool calls
Craig, schedule a security scan every Monday at 8 AM.
Craig, run a dependency check every Friday at noon.
Craig, check for open PRs without reviews every 2 hours.
Craig, run a tech debt audit once next Wednesday at 10 AM.
```

### Schedule formats

| Format | Meaning | Example |
|--------|---------|---------|
| `0 8 * * 1` | Cron (recurring) | Every Monday 8 AM |
| `0 */2 * * *` | Cron (recurring) | Every 2 hours |
| `once:2026-04-10T14:00` | One-shot (fires once, auto-removes) | April 10 at 2 PM |
| `on_push` | Event-driven (not yet implemented) | On merge to main |

### Managing schedules

```
Craig, show me the schedule.           # craig_status
Craig, remove the tech debt audit.     # craig_schedule_remove
Craig, change security scan to 9 AM.   # craig_schedule_update
Craig, run the security scan now.      # craig_run
Craig, disable scheduled tasks.        # craig_disable
```

### How Craig works

1. Craig's extension loads when you start the CLI
2. You say "craig enable" → scheduler starts in THIS session only
3. When a task is due, Craig sends a structured prompt to your session
4. The agent queues it as a todo and works on it when ready
5. Craig's config (`~/.copilot/craig.config.yaml`) persists schedules across sessions

Craig does NOT run in the background. When you close the CLI, Craig stops. Open a new session and "craig enable" to resume.

### Example config

```yaml
# ~/.copilot/craig.config.yaml
repo: .
schedule:
  security_scan: 0 8 * * 1
  coverage_scan: 0 9 * * *
  tech_debt_audit: 0 10 * * 5
  pr_monitor: 0 */2 * * *
prompts:
  pr_monitor: Check open PRs in this repo. Flag any PR older than 3 days without a review.
```

Tasks with no custom prompt use Craig's built-in defaults (security scan, coverage scan, etc.).

---

## Side-Notes — Learning from Reviews

The Guardians learn from past reviews. When a review Guardian (Security, Code Review, or QA) spots a recurring pattern, it proposes a **side-note** — a short advisory that gets added to the relevant Guardian's memory.

### What are side-notes?

Side-notes are short markdown bullets stored in `~/.copilot/instructions/{guardian-name}.notes.md`. Each Guardian reads its own notes file before starting work. Notes are advisory — they add awareness, not rules.

Example notes file (`~/.copilot/instructions/dev-guardian.notes.md`):
```markdown
# dev-guardian — Advisory Notes

<!-- Learned patterns from past reviews. Guardians read this file at startup. -->

- Always use parameterized queries in the repository layer — SQL injection flagged 4x
- Keep service classes under 200 lines — extract helpers early
- Include error-path unit tests for every new API endpoint
```

### How proposals work

1. A review Guardian finishes its review
2. It queries past sessions for recurring patterns (same finding, 2+ times)
3. If found, it adds an **Improvement Cycle Proposals** table to its handoff report
4. The orchestrator presents the proposal to you
5. **You decide** — approve, modify, or reject

```
### Improvement Cycle Proposals

| Note For | Proposed Addition | Evidence |
|----------|------------------|----------|
| dev-guardian | "Use parameterized queries in repository layer" | Flagged 4x (sessions abc, def, ghi, jkl) |
```

If you approve, the note is appended to the Guardian's `.notes.md` file. Next time that Guardian runs, it reads the note and pays extra attention.

### Managing notes

- **View notes:** Open any `~/.copilot/instructions/*.notes.md` file
- **Edit notes:** They're plain markdown — edit freely with any text editor
- **Prune notes:** Guardians suggest pruning when a file exceeds ~20 items
- **Delete notes:** Remove any bullet you no longer need
- **Uninstall safe:** `package.sh --uninstall` never removes notes files

### What notes are NOT

- ❌ Not mandatory rules — Guardians treat them as "also pay attention to"
- ❌ Not auto-generated — every note requires your explicit approval
- ❌ Not overrides — notes cannot contradict base Guardian instructions
- ❌ Not auto-loaded by Copilot CLI — they use `.notes.md`, not `.instructions.md`

---

## Tips

### Let the pipeline work
Don't try to skip steps. If you say "just code it," the orchestrator will still invoke the PO Guardian first. The spec ensures the Developer Guardian builds the right thing.

### Answer PO's questions
The better you answer, the better the spec. Vague answers → vague tickets → rework later.

### Test during UAT
The UAT checkpoint is your chance to catch issues before 3 Guardians review it. Finding a bug during UAT is faster than finding it during review → fix → re-review.

### Use Craig for routine tasks
Security scans, dependency checks, and tech debt audits should run on a schedule, not when you remember to ask.

### Check past sessions
The CLI remembers everything. Ask:
```
What did Craig find last week?
What security issues were found in the last session?
Show me the PO ticket for the chat feature.
```

---

## Troubleshooting

### Verify your setup

Run the doctor command to check all prerequisites in one pass:

```bash
./package.sh --doctor
```

This checks:
- **Core requirements** — Git, GitHub CLI, Copilot CLI
- **Security Guardian tools** — Semgrep, Gitleaks, Trivy
- **Code Review Guardian tools** — ESLint, Ruff, Pylint, Clippy, dotnet, Checkstyle
- **Platform Guardian tools** — kubectl, kube-bench, kube-score, Polaris, kubeaudit, Helm
- **Delivery Guardian tools** — k6, Azure CLI
- **Dependency auditors** — pip-audit, Bandit, Safety, cargo-audit, cargo-deny
- **Guardian files** — all agent, instruction, skill, and extension files installed to `~/.copilot/`

Each tool shows ✅ (installed with version) or ⚠️ (missing with install command). Core requirements show ❌ if missing — these must be installed for Guardians to work.

### Common issues

| Problem | Fix |
|---------|-----|
| Guardian fails with "command not found" | Run `./package.sh --doctor` to find what's missing |
| Guardian files not found | Run `./package.sh --install` to install them |
| Semgrep/Gitleaks not found | Install via `brew install semgrep gitleaks` (see PREREQUISITES.md) |
| eslint/ruff not found | Install per-language tools for your project (see PREREQUISITES.md) |
| Operator can't take screenshots | Install Playwright MCP (see PREREQUISITES.md §7) |
| Reports directory missing | The Operator creates `~/.copilot/reports/` automatically |
