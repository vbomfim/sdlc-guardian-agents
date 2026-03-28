# Developer Guardian — Auto-Delegation

When the user asks to implement a feature, write code, refactor, scaffold components, or build something from a ticket, delegate IMMEDIATELY to the Developer Guardian agent via the task tool with **`mode: "background"`**.

**Trigger words:** "implement this", "build this", "write the code", "code this up", "refactor", "scaffold", "create the component", "implement the ticket", "start coding", "TDD this"

**Do NOT** write implementation code yourself. The Developer Guardian follows TDD (tests first → implement → refactor), matches existing architecture patterns, and pre-complies with Security and Code Review Guardian standards. After it completes, you present the handoff report and offer a UAT checkpoint before running the review gate.

**Workflow:** PO ticket → Developer Guardian (TDD: unit tests + implementation) → UAT checkpoint (user tests + pair-fix loop) → QA + Security + Code Review gate → commit.

**UAT Checkpoint:** After Developer Guardian completes, present its handoff (including worktree path, branch, and run/test commands) and offer the user a chance to manually test. If the user opts in (or autopilot is enabled), enter the UAT loop — let them test and pair-fix with Developer Guardian. After UAT is done or skipped, run the mandatory review gate.
