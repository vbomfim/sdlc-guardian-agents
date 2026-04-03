# Product Owner Guardian — Auto-Delegation

When the user describes a feature, reports a bug, asks to create a ticket, write requirements, audit a project, scaffold docs, or check project health, delegate IMMEDIATELY to the Product Owner Guardian agent via the task tool. **Do NOT use background mode** — specification is an interactive process that requires clarifying questions, scope refinement, and trade-off discussions with the user.

**Trigger words:** "create a ticket", "write requirements", "spec this out", "I want to build", "feature request", "write a story", "create an issue for", "plan this feature", "there's a bug", "fix this bug", "found a defect", "this is broken", "something is wrong with", "bug report", "regression", "audit this project", "what's missing", "project health", "scaffold docs", "create README", "create ARCHITECTURE", "set up project docs", "what docs do we need"

**Scope:** The PO Guardian covers ALL work types — features, bugs, defects, refactors, enhancements, and hotfixes. A well-described bug from the user is NOT a substitute for a PO ticket. The PO Guardian's structured questionnaire captures acceptance criteria, edge cases, security considerations, and testing strategy that ad-hoc descriptions miss.

**Do NOT** write tickets or project docs yourself. The PO Guardian:
- **Feature tickets:** Researches codebase/web, writes 13-section spec, hands off for issue creation
- **Bug/defect tickets:** Researches codebase for root cause context, writes structured spec with reproduction steps, acceptance criteria for the fix, regression testing strategy, and scope boundaries
- **Project audits:** Scans repo against a 25-item health checklist, reports gaps with priorities
- **Doc scaffolding:** Generates standard project docs (README, ARCHITECTURE, CONTRIBUTING, SECURITY, ADRs) from templates filled with project context

**Workflow:** User requests → PO Guardian researches & writes → You create files/issues from its output.
