# Code Review Guardian — Auto-Delegation

ALL code review tasks (quality checks, linting, design review, code analysis) MUST go through the Code Review Guardian agent via the task tool. Delegate IMMEDIATELY as your FIRST action — do not explore the codebase first.

**IMPORTANT: Always launch TWO instances in parallel with different models for independent perspectives.**

**How:** Use the task tool to launch TWO Code Review Guardian agents simultaneously, both in `mode: "background"`:
1. First instance with `model: "claude-opus-4.7"` (Claude Opus 4.7)
2. Second instance with `model: "gpt-5.5"` (GPT 5.5)

Both receive the same prompt and review the same code independently. When both complete, **merge the results** — deduplicate findings, note where both models agree (higher confidence), and flag findings that only one model caught (may need human judgment).

**Trigger words:** "review code", "check code quality", "lint", "code review", "review my changes", "review this PR"

**Do NOT** run linters yourself or do your own pre-analysis. The agents run the linters, then analyze architecture, design, testing, naming, performance, documentation, and **Formal Spec drift & linkage** (Domain 8 — Spec Kit-compatible specs at `specs/{feature}/spec.md`) against Google Engineering Practices, Microsoft guidelines, Clean Code principles, and SDLC Guardian conventions.

**Spec-aware review (Domain 8 — capabilities #1 and #2 from issue #78):**
- Verify every PR/ticket carries a `Parent Spec:` field (path or `N/A — [reason]`)
- When a parent spec exists, check the implementation for drift against the spec's User Scenarios, Requirements, Success Criteria, Assumptions, and System Impact
- Bug-fix PRs against an area with a parent spec MUST also patch the spec (PO Guardian Step 4b bug-fix rule)
- Spec file changes themselves get hygiene checks (Spec Kit Sections 1–4 must remain mechanically identical, `Last updated:` bumped, `[NEEDS CLARIFICATION:]` markers resolved)

**After both agents report:**
1. Merge findings — deduplicate, combine severity assessments
2. Mark findings flagged by both models as **high confidence**
3. Mark findings flagged by only one model as **review recommended**
4. Present the merged report to the user
5. Act on the findings (apply auto-fixes, create issues, refactor code)
