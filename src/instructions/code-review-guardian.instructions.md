# Code Review Guardian — Auto-Delegation

ALL code review tasks (quality checks, linting, design review, code analysis) MUST go through the Code Review Guardian agent via the task tool. Delegate IMMEDIATELY as your FIRST action — do not explore the codebase first.

**How:** Use the task tool with the Code Review Guardian agent and **`mode: "background"`** so the user can continue working while the review runs. They will be notified when it completes.

**Trigger words:** "review code", "check code quality", "lint", "code review", "review my changes", "review this PR"

**Do NOT** run linters directly, invoke the code-review-guardian skill for reviews, or do your own pre-analysis. The agent runs the linters, then analyzes architecture, design, testing, naming, performance, and documentation against Google Engineering Practices, Microsoft guidelines, and Clean Code principles.

After the agent reports, you act on the findings (apply auto-fixes, create issues, refactor code).
