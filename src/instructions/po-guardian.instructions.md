# Product Owner Guardian — Auto-Delegation

When the user describes a feature, reports a bug, asks to create a ticket, write requirements, audit a project, scaffold docs, or check project health, delegate IMMEDIATELY to the Product Owner Guardian agent via the task tool.

**⛔ NEVER use `mode: "background"` for the PO Guardian.** Specification is an interactive process — it requires clarifying questions, scope refinement, decomposition decisions, and trade-off discussions with the user. Background mode prevents this interaction. Always use `mode: "sync"` or the default mode so the PO can ask questions and get answers.

**Trigger words:** "create a ticket", "write requirements", "spec this out", "I want to build", "feature request", "write a story", "create an issue for", "plan this feature", "there's a bug", "fix this bug", "found a defect", "this is broken", "something is wrong with", "bug report", "regression", "audit this project", "what's missing", "project health", "scaffold docs", "create README", "create ARCHITECTURE", "set up project docs", "what docs do we need"

**Scope:** The PO Guardian covers ALL work types — features, bugs, defects, refactors, enhancements, and hotfixes. A well-described bug from the user is NOT a substitute for a PO ticket.

**Do NOT** write tickets or project docs yourself. The PO Guardian handles research, decomposition, and specification.

**Component design is mandatory.** Every ticket must include a component map listing all components involved, their single responsibility, interface contracts, and dependencies.

**Ticket creation is mandatory.** The PO Guardian must create issues in the project's issue tracker (GitHub Issues, Azure DevOps Work Items, or equivalent) — or report that no remote exists. Session artifacts and local markdown files are NOT tickets.

**Workflow:**
1. PO Guardian researches and **decomposes** the request into modules/tickets
2. PO Guardian **decides per-request whether a Formal Spec is warranted** (Step 4b) — multi-component / cross-Guardian / architectural shifts produce a Spec Kit-compatible spec at `specs/{feature}/spec.md`; trivial work skips it. Decision and rationale are captured in every ticket via the `Parent Spec:` field.
3. **For brownfield projects** (Step 2c) — when the area being changed has no parent spec, the PO Guardian bootstraps one from the existing code so the new change has a baseline to evolve from. Bug fixes against an area with a spec **patch the spec** as part of the ticket.
4. **For non-trivial work** (Step 5b-arch) — the PO Guardian consults the Code Review Guardian for architectural-impact assessment, which feeds the spec's System Impact section.
5. PO Guardian presents the decomposition (and spec, if produced) to the user for approval
6. PO Guardian details each ticket with the 18-section template (each ticket carries a `Parent Spec:` line)
7. PO Guardian creates issues in the project's tracker
8. Orchestrator presents the specs to the user — no summarizing
9. User confirms, requests changes, or answers open questions
10. Only then does the orchestrator invoke the Developer Guardian
