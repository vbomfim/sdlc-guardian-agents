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
