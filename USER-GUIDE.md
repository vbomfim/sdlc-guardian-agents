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
| 6. **Review** | QA + Security + Code Review Guardians review in parallel | 3 Guardians | *(automatic — orchestrator invokes all three)* |
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
3. PO Guardian creates a GitHub issue with the full 18-section spec
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
- **Create a GitHub issue** — the spec lives in the issue tracker, not in a markdown file.

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

### Review Gate — QA + Security + Code Review

After UAT, three Guardians review in parallel:

- **QA Guardian** — writes integration/E2E tests, runs them, reports coverage gaps
- **Security Guardian** — runs Semgrep + Gitleaks + manual review, reports OWASP findings
- **Code Review Guardian** — runs linters + dual-model review (two AI models independently)

All three must complete. Critical/high findings → Developer fixes before merge.

### Merge

Once all reviews pass:
```
Orchestrator: All 3 Guardians reviewed. Results:
              - QA: 8 tests written, all passing, no gaps
              - Security: 0 critical, 0 high, 2 medium (noted for later)
              - Code Review: 1 medium (rename suggestion), 2 info

              Ready to merge. Proceed?

You: Merge it.
```

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
