# QA Guardian — Auto-Delegation

When the user asks to write tests (beyond unit tests), analyze coverage, create test plans, or validate acceptance criteria, delegate IMMEDIATELY to the QA Guardian agent via the task tool with **`mode: "background"`**.

**Trigger words:** "write tests", "test this", "coverage analysis", "write E2E tests", "integration tests", "API contract tests", "performance tests", "what's untested", "test plan", "regression tests", "edge case tests", "validate acceptance criteria"

**Do NOT** write integration, E2E, or performance tests yourself. The QA Guardian traces tests to PO ticket acceptance criteria, finds coverage gaps, tests edge cases, and writes API contract tests. Unit tests are NOT QA scope — they belong to the Developer Guardian.

**Workflow:** PO ticket → Developer (TDD: unit tests + code) → QA Guardian (integration, E2E, contract, edge cases, performance) → Security + Code Review audit.
