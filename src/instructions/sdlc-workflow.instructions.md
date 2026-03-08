# SDLC Workflow Orchestration — Automatic Guardian Pipeline

This instruction enforces the SDLC Guardian pipeline automatically. The default agent MUST follow these rules to ensure no code reaches a PR without passing through the appropriate Guardians.

## Pre-Implementation Gate

**Before any implementation starts, verify a specification exists.**

When the user asks to implement, build, or code something:
1. Check: is there a GitHub issue or PO Guardian ticket for this work?
2. If **yes** → proceed to Developer Guardian
3. If **no** → invoke PO Guardian first to create the specification, then proceed

Do NOT allow implementation without a specification. Say:
> "There's no ticket for this yet. Let me invoke the PO Guardian to spec it out first."

## Post-Implementation Gate — AUTOMATIC

**After the Developer Guardian completes, automatically invoke the review pipeline.**

When the Developer Guardian hands off its report, do NOT just commit. Instead:

1. Present the Developer's handoff report to the user
2. Ask the user to confirm assumptions and answer open questions
3. Then **automatically invoke in parallel** (all three as background tasks):
   - **QA Guardian** — integration, E2E, contract tests
   - **Security Guardian** — OWASP scans + manual review
   - **Code Review Guardian** — linters + design review

```
Developer Guardian completes
  ↓
Default agent: "Implementation done. Running review pipeline..."
  ↓
  ┌──────────────┐  ┌──────────────────┐  ┌───────────────────┐
  │ QA Guardian  │  │ Security Guardian │  │ Code Review Guard. │
  │ (background) │  │ (background)      │  │ (background)       │
  └──────┬───────┘  └────────┬─────────┘  └─────────┬─────────┘
         └──────────────────┼──────────────────────┘
                            ▼
               Default agent: combined results
                            ▼
               "3 Guardians reviewed. Here's the summary.
                Fix these before committing?"
```

4. Present combined results from all three Guardians
5. If critical or high findings exist → recommend fixing before committing
6. If all pass → proceed to commit and PR

## Pre-Merge Gate

**Before creating a PR or merging to main, verify all reviews passed.**

When the user asks to create a PR, merge, or push to main:
1. Check: did QA, Security, and Code Review Guardians run on this code?
2. If **yes** and no unresolved critical/high findings → proceed
3. If **no** → invoke the missing Guardians before proceeding
4. If **unresolved findings** → remind the user of outstanding issues

Say: "Security Guardian found 2 high issues that haven't been addressed. Want to fix them before the PR?"

## Pre-Deployment Gate

**Before deploying to staging or production, verify platform readiness.**

When the user asks to deploy, release, or push to an environment:
1. Check: has Platform Guardian audited the K8s manifests in this change?
2. Check: has Delivery Guardian reviewed the deployment strategy?
3. If **no** → invoke the relevant Guardian(s) before proceeding

## Workflow Summary

```
💡 Idea
  ↓
  ├─ No ticket? → PO Guardian (auto)
  ↓
🎯 PO Guardian ticket exists
  ↓
👨‍💻 Developer Guardian implements (TDD)
  ↓ (auto-triggered)
  ├─ 🧪 QA Guardian ──────────┐
  ├─ 🛡️ Security Guardian ────┤ (parallel, background)
  ├─ 📋 Code Review Guardian ─┘
  ↓
  Combined results → fix critical/high → commit
  ↓
  ├─ Deploy? → ⚙️ Platform Guardian + 🚀 Delivery Guardian (auto)
  ↓
  PR / Merge / Deploy
```

## Rules

- **Never skip a gate** — if a Guardian hasn't run, invoke it before proceeding
- **Parallel when possible** — QA, Security, Code Review run simultaneously
- **Sequential when required** — Developer must finish before reviews start
- **User decides, not the agent** — present findings, recommend, but let the user choose
- **Track what ran** — when presenting results, show which Guardians completed and which are pending
