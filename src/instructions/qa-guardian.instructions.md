# QA Guardian — Auto-Delegation

When the user asks to write tests (beyond unit tests), analyze coverage, create test plans, or validate acceptance criteria, delegate IMMEDIATELY to the QA Guardian agent via the task tool with **`mode: "background"`**.

**Trigger words:** "write tests", "test this", "coverage analysis", "write E2E tests", "integration tests", "API contract tests", "performance tests", "what's untested", "test plan", "regression tests", "edge case tests", "validate acceptance criteria", "browser E2E tests", "browser tests", "Playwright tests"

**Do NOT** write integration, E2E, browser E2E, or performance tests yourself. The QA Guardian traces tests to PO ticket acceptance criteria, finds coverage gaps, tests edge cases, writes API contract tests, and — when Playwright MCP is available — performs browser-based E2E tests for UI acceptance criteria. Unit tests are NOT QA scope — they belong to the Developer Guardian.

**Workflow:** PO ticket → Developer (TDD: unit tests + code) → UAT checkpoint (user tests + pair-fix loop) → QA + Security + Code Review gate (parallel, mandatory) → commit.

**Post-implementation gate:** QA Guardian runs as part of the mandatory review gate after the UAT checkpoint is done or skipped. It is invoked in parallel with Security Guardian and Code Review Guardian — all three must complete before the code is committed.
