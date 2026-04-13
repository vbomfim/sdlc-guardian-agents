# Squad + SDLC Guardian Agents — Integration Guide

How to use Squad's team orchestration with SDLC Guardian Agents' quality pipeline.

---

## What This Integration Does

**Squad** provides team infrastructure — persistent agents, shared decisions, issue triage, parallel dispatch, and watch mode.

**SDLC Guardian Agents** provide quality enforcement — mandatory specification, TDD implementation, 4-Guardian review gate, risk classification.

Together: **a persistent AI team that follows an enforced development pipeline.**

```
Squad (team orchestration + persistence)
  ├─ Coordinator routes work, enforces SDLC gates
  ├─ decisions.md tracks architectural choices
  ├─ Scribe captures learnings silently
  ├─ Ralph watches for issues (optional)
  │
  └─ Guardians plug in as Squad agents
       ├─ PO Guardian → specification
       ├─ Dev Guardian → TDD implementation
       ├─ Security Guardian → OWASP review
       ├─ Privacy Guardian → PII/PHI compliance
       ├─ QA Guardian → integration/E2E testing
       ├─ Code Review Guardian → quality review
       └─ Operator → screenshots, reports, housekeeping
```

---

## How It Overrides Default Squad Personas

By default, `squad init` enters **Init Mode** — it asks what you're building and proposes a team with themed character names from movie universes (Usual Suspects, Star Wars, Futurama, etc.). Each member gets a generic role: Lead, Frontend Dev, Backend Dev, Tester.

**We skip Init Mode entirely.** Instead of letting Squad cast characters, we pre-populate the `.squad/` directory with our Guardian agents. When Squad reads `team.md` and finds roster entries already present, it goes straight to **Team Mode** — using our agents as-is.

| Default Squad | Guardian Integration |
|---------------|---------------------|
| Character names (Keaton, McManus, etc.) | Role names (PO Guardian, Dev Guardian, etc.) |
| Generic roles (Lead, Frontend, Backend, Tester) | Specialized roles with full instruction sets |
| Cast from movie universes | Pre-defined — no casting needed |
| No enforced pipeline | SDLC pipeline in `routing.md` |
| Agents auto-write to `history.md` | Guardians read side-notes (user-approved only) |
| Squad proposes team on first run | Team ready immediately |

The key: **Squad's coordinator reads `routing.md` for how to route work.** We put our SDLC pipeline rules there, and the coordinator follows them.

---

## Setup

### Prerequisites

- [GitHub Copilot CLI](https://docs.github.com/copilot) installed and authenticated
- [SDLC Guardian Agents](https://github.com/vbomfim/sdlc-guardian-agents) installed (`package.sh --install`)
- Node.js 18+ (for Squad CLI)

### Step 1: Install Squad CLI

```bash
npm install -g @bradygaster/squad-cli
```

Or use npx (no global install):
```bash
npx @bradygaster/squad-cli --version
```

### Step 2: Initialize Squad in your project

```bash
cd your-project
git init  # if not already a git repo
squad init
```

This creates the `.squad/` directory and `.github/agents/squad.agent.md`.

### Step 3: Replace the default team with Guardians

After `squad init`, replace the empty team roster and routing with our Guardian setup. Run these commands from your project root:

```bash
# Create Guardian agent directories
mkdir -p .squad/agents/{po-guardian,dev-guardian,security-guardian,privacy-guardian,qa-guardian,code-review-guardian,operator}
```

Then create charter files for each Guardian (see [Charter Templates](#charter-templates) below).

### Step 4: Update team.md

Replace `.squad/team.md` with the Guardian roster:

```markdown
# Squad Team

> [Your project name] — Quality-enforced AI development team

## Coordinator

| Name | Role | Notes |
|------|------|-------|
| Squad | Coordinator | Routes work, enforces SDLC pipeline gates. |

## Members

| Name | Role | Charter | Status |
|------|------|---------|--------|
| PO Guardian | Product Owner — Specification | .squad/agents/po-guardian/charter.md | active |
| Dev Guardian | Developer — TDD Implementation | .squad/agents/dev-guardian/charter.md | active |
| Security Guardian | Security Auditor | .squad/agents/security-guardian/charter.md | active |
| Privacy Guardian | Privacy & Compliance Auditor | .squad/agents/privacy-guardian/charter.md | active |
| QA Guardian | Quality Assurance — Testing | .squad/agents/qa-guardian/charter.md | active |
| Code Review Guardian | Code Quality Auditor | .squad/agents/code-review-guardian/charter.md | active |
| Operator | Task Runner (not a Guardian) | .squad/agents/operator/charter.md | active |
| Scribe | Memory Manager (silent) | .squad/agents/scribe/charter.md | active |

## SDLC Pipeline (MANDATORY)

💡 Idea → 📋 PO Guardian (spec) → 👨‍💻 Dev Guardian (TDD) → 🧑‍🔬 UAT (user tests)
  → 🧪 QA + 🛡️ Security + 🔒 Privacy + 📋 Code Review (parallel) → 🚀 Merge

**No gate may be skipped.** The Coordinator enforces this order.
```

### Step 5: Update routing.md

Replace `.squad/routing.md` with SDLC-enforced routing:

```markdown
# Work Routing

## Routing Table

| Work Type | Route To | Examples |
|-----------|----------|----------|
| Feature request, idea, spec | PO Guardian | "I want to add...", "create a ticket for..." |
| Implementation, coding | Dev Guardian | "implement this", "build the API" |
| Security review | Security Guardian | "review for security issues", "OWASP scan" |
| Privacy review, PII/PHI | Privacy Guardian | "check for PII leaks", "HIPAA compliance" |
| Integration/E2E tests | QA Guardian | "write integration tests", "check coverage" |
| Code quality, linting | Code Review Guardian | "review code quality", "lint" |
| Screenshots, reports, ops | Operator | "take a screenshot", "generate report" |
| Session logging | Scribe | Automatic — never needs routing |

## SDLC Pipeline Enforcement

The Coordinator MUST follow this order for feature/bug work:

1. **Specification** — PO Guardian writes the ticket. No implementation without a spec.
2. **Implementation** — Dev Guardian implements with TDD. Only after PO spec is approved.
3. **UAT** — User tests the implementation. Only after Dev hands off.
4. **Review Gate** — QA + Security + Privacy + Code Review run in parallel. Only after UAT done/skipped.
5. **Merge** — Only after all 4 reviewers pass.

## Rules

1. **Pipeline first** — enforce SDLC gates before routing to implementation
2. **Eager parallelism** — spawn all 4 review Guardians simultaneously at the review gate
3. **Scribe always runs** after substantial work, as background
4. **Operator runs in background** — never blocks the session
5. **No skipping PO** — even well-described bugs need a PO ticket
6. **Risk classification** — all agents follow LOW/MEDIUM/HIGH command rules
```

### Step 6: Launch

```bash
copilot --agent squad
```

Or in yolo mode (auto-approve tool calls):
```bash
copilot --agent squad --yolo
```

Squad will read `team.md`, find the roster, and enter **Team Mode** with all Guardians ready.

---

## Charter Templates

Each Guardian needs a `charter.md` in `.squad/agents/{name}/`. The charter tells Squad who this agent is, what they do, and where their full instructions live.

### Charter structure

```markdown
# {Name} — {Role}

> {One-line personality}

## Identity

- **Name:** {Name}
- **Role:** {Role}
- **Expertise:** {2-3 skills}
- **Style:** {Communication style}

## What I Own

- {Responsibility 1}
- {Responsibility 2}

## Boundaries

**I handle:** {scope}
**I don't handle:** {out of scope — name who does}

## Instructions Reference

Full procedures: `~/.copilot/agents/{name}.agent.md`

## Voice

{1-2 sentences of personality}
```

The charter is a lightweight identity card. The full procedures, scanning steps, and handoff formats live in the Guardian's `.agent.md` file (installed globally by `package.sh --install`). The charter points to it via **Instructions Reference**.

### Available charters

| Agent | Charter path |
|-------|-------------|
| PO Guardian | `.squad/agents/po-guardian/charter.md` |
| Dev Guardian | `.squad/agents/dev-guardian/charter.md` |
| Security Guardian | `.squad/agents/security-guardian/charter.md` |
| Privacy Guardian | `.squad/agents/privacy-guardian/charter.md` |
| QA Guardian | `.squad/agents/qa-guardian/charter.md` |
| Code Review Guardian | `.squad/agents/code-review-guardian/charter.md` |
| Operator | `.squad/agents/operator/charter.md` |

See the `/tmp/squad-guardian-test/.squad/agents/` directory for complete charter examples.

---

## What Squad Adds to the Guardian Workflow

| Capability | Without Squad | With Squad |
|-----------|---------------|------------|
| **Team persistence** | Agents are stateless per-session | Agents have `history.md` that compounds |
| **Shared decisions** | No shared memory between agents | `decisions.md` read by all agents |
| **Issue triage** | Manual — you say "implement issue #X" | Ralph watches and auto-triages |
| **Parallel dispatch** | Orchestrator spawns sub-agents | Coordinator launches all relevant agents simultaneously |
| **Routing** | Trigger words + inference | Explicit routing table + SDLC rules |
| **Context hygiene** | Session compaction only | `squad nap` — compress, prune, archive |
| **Session recovery** | Copilot CLI checkpoints | Squad checkpoint + resume from history |
| **Git-committed state** | Global `~/.copilot/` (not in repo) | `.squad/` committed — anyone who clones gets the team |

---

## What Guardians Add to Squad

| Capability | Default Squad | With Guardians |
|-----------|---------------|----------------|
| **SDLC pipeline** | No enforced order | PO → Dev → UAT → 4 reviewers → Merge |
| **Security review** | No dedicated security agent | Security Guardian with OWASP scanning |
| **Privacy compliance** | No privacy agent | Privacy Guardian with GDPR/HIPAA/CCPA |
| **Risk classification** | No command safety | LOW/MEDIUM/HIGH with approval gates |
| **Dual-model review** | Single model per agent | Code Review runs two AI models independently |
| **Side-notes** | Auto-written history | User-approved advisories with prompt injection defense |
| **Operator** | No ops automation | Screenshots, reports, health checks, housekeeping |
| **Craig scheduling** | Ralph for issues only | Cron + one-shot tasks for any Operator work |

---

## Advanced: Ralph Watch Mode + Guardians

Ralph can poll for GitHub issues and auto-triage them through the Guardian pipeline:

```bash
squad triage --execute --interval 5
```

When Ralph finds a new issue:
1. Ralph reads the issue → determines it's a feature/bug
2. Coordinator routes to **PO Guardian** for specification
3. After spec → **Dev Guardian** implements
4. After implementation → **Review Gate** (4 Guardians in parallel)
5. Results posted back to the issue

This is fully autonomous development with quality gates — work happens while you're away, but every step follows the pipeline.

---

## File Structure

```
your-project/
├── .github/
│   └── agents/
│       └── squad.agent.md          ← Squad coordinator (created by squad init)
├── .squad/
│   ├── team.md                     ← Guardian roster + SDLC pipeline
│   ├── routing.md                  ← SDLC-enforced routing rules
│   ├── decisions.md                ← Shared decision log
│   ├── agents/
│   │   ├── po-guardian/charter.md
│   │   ├── dev-guardian/charter.md
│   │   ├── security-guardian/charter.md
│   │   ├── privacy-guardian/charter.md
│   │   ├── qa-guardian/charter.md
│   │   ├── code-review-guardian/charter.md
│   │   ├── operator/charter.md
│   │   ├── scribe/charter.md       ← Squad built-in
│   │   └── ralph/charter.md        ← Squad built-in
│   ├── identity/
│   │   ├── now.md                  ← Current team focus
│   │   └── wisdom.md              ← Reusable patterns
│   └── log/                        ← Session history
├── ~/.copilot/                     ← Guardian instructions (global)
│   ├── agents/*.agent.md           ← Full Guardian procedures
│   ├── instructions/*.instructions.md
│   ├── instructions/*.notes.md     ← Side-notes (Improvement Cycle)
│   └── skills/*/SKILL.md          ← Tool skills
```

The `.squad/` directory is **per-repo and committed** — anyone who clones gets the team.
The `~/.copilot/` directory is **global** — Guardian procedures shared across all projects.

---

## Quick Reference

| What you want | Command |
|---------------|---------|
| Initialize Squad + Guardians | `squad init` → replace team.md + routing.md + add charters |
| Start coding with the team | `copilot --agent squad` |
| Start in yolo mode | `copilot --agent squad --yolo` |
| Check team health | `squad doctor` |
| Watch for issues | `squad triage --execute` |
| Compress old state | `squad nap` |
| Check Squad status | `squad status` |
