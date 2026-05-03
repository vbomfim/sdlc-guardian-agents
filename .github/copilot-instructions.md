# Project Instructions — sdlc-guardian-agents

This file contains repository-specific instructions that apply ONLY when working inside this repo (the SDLC Guardian Agents source). It is auto-loaded by Copilot CLI alongside the global instructions installed under `~/.copilot/instructions/`.

These rules are **not** part of the Guardian baseline that gets distributed to user projects. They exist because editing a system that *uses* Guardians is fundamentally different from *being* a user of those Guardians.

## ⛔ No Guardian-on-Guardian recursion

When the work is **editing the Guardian instructions, agents, or workflow files themselves** (anything under `src/agents/`, `src/instructions/`, `src/templates/`, `src/skills/`, or `src/extensions/`), the default agent works **directly**. Do NOT delegate to Developer Guardian, QA Guardian, Code Review Guardian, or any other Guardian for this work.

**Why:** the Guardians are the system being edited. Asking a Developer Guardian to write Developer Guardian instructions creates a circular reference that wastes context, produces lower-quality output, and obscures intent. The user is the domain expert here; the default agent should pair with the user directly.

**Concretely:**

- ❌ Do not invoke `task` with `agent_type: "Developer Guardian"` to implement changes to `src/agents/*.agent.md`
- ❌ Do not invoke `task` with `agent_type: "Code Review Guardian"` to review your own edits to `src/instructions/*.instructions.md`
- ❌ Do not invoke `task` with `agent_type: "QA Guardian"` to write tests for files under `src/`
- ✅ Use `view`, `edit`, `grep`, and `bash` directly. Run the existing tests yourself (`bash -n package.sh` + `node --test src/extensions/sdlc-guardian/uat-state-machine.test.mjs`).
- ✅ The `task` tool is still available for **truly external** work — e.g., researching upstream Spec Kit changes (`agent_type: "explore"` or `"research"`) or asking the rubber-duck agent to critique a design.

**Scope of this rule:** edits under `src/`, `package.sh`, `package.ps1`, `README.md`, `USER-GUIDE.md`, `OPERATIONS-GUIDE.md`, `PREREQUISITES.md`, `SQUAD-INTEGRATION.md`, `.github/`, and any other top-level project metadata file.

**Exception:** if the user EXPLICITLY asks for a Guardian to do meta-work on the Guardians themselves (e.g., "have Code Review review my changes to po-guardian.agent.md"), do it. The user override beats the default rule.

## Other project-specific notes

- The repo's own ticket workflow does not use a Formal Spec for every change. Spec system development (#78) was tracked via a 7-commit branch with the issue body acting as the umbrella spec. This is intentional self-restraint — see PO Guardian Step 4b for the per-request judgment rule.
- When upgrading model strings (e.g., Opus 4.6 → 4.7), see the canonical model section in `src/instructions/sdlc-workflow.instructions.md` — all other files reference it.
- When changing the PO ticket template structure, also update the count claims in `README.md` and `USER-GUIDE.md` (no automated drift detector exists; this is a known gap).

## Guardian agent file structure (Rules / Procedure / Background)

Issue #80 introduced a three-section structure for `.agent.md` files. The structure exists because long instruction files (200+ lines) suffer from well-documented LLM behaviors:

- **Lost in the middle** — models retrieve well from the start and end, poorly from the middle (Liu et al. 2023)
- **Recency bias** — recent context wins attention
- **Instruction fatigue** — rules buried among 50 others get diluted
- **Compounding probability** — N rules at 95% adherence → 0.95^N for "all followed"

The structure groups content by *how reliably the agent follows it*, and positions the most-followed material where the model attends most.

### The three sections

Every `.agent.md` should have exactly these three top-level sections, in this order:

```markdown
# {Guardian Name}

[Identity paragraph. Role summary. 2-5 lines max.]

---

## Rules

[CRITICAL must-do / must-not-do. The agent reliably follows everything here.]
[Use bold MUST / NEVER / MUST NOT. Group by domain.]
[~50-150 lines depending on the Guardian's scope. If it's much longer, it's
probably misclassified — some of these are really procedure or background.]

---

## Procedure

[Step-by-step workflow — how the agent does its job.]
[Numbered steps (Step 0 / Step 1 / ...). Models follow ordered lists well.]

---

## Background

[Rationale, examples, references, edge case discussion.]
[Explicitly framed as NOT directive — context for human maintainers and for
when the rules need interpretation.]
[Includes References at the end.]
```

### Classification rules

When deciding which section content goes in:

| Question | If yes → |
|---|---|
| "If the agent ignores this, will the work be wrong?" | **Rules** |
| "Is this a step the agent must perform in order?" | **Procedure** |
| "Is this explanatory — *why*, not *what*?" | **Background** |
| "Is this an example to clarify a rule?" | **Background** (don't dilute the rule) |
| "Is this a checklist item that must be satisfied?" | **Rules** (Pre-compliance subsection) |
| "Is this a template the agent fills in?" | **Procedure** (or extract to `src/templates/`) |

### Reference implementation

`src/agents/dev-guardian.agent.md` is the reference implementation (issue #80 / commit on the `feature/80-instruction-restructure-poc` branch). When restructuring other Guardians, mirror its section ordering, heading style, and the introductory paragraph that explains the structure.

### What this is NOT

- **Not a token-reduction effort.** File sizes stay roughly the same; the change is positional.
- **Not an automated requirement.** No CI check verifies the structure.
- **Not a one-time migration.** Other Guardians (Security, Privacy, PO, etc.) will get this restructure as separate tickets.
