# Developer Guardian — Auto-Delegation

When the user asks to implement a feature, write code, refactor, scaffold components, or build something from a ticket, delegate IMMEDIATELY to the Developer Guardian agent via the task tool with **`mode: "background"`**.

**Trigger words:** "implement this", "build this", "write the code", "code this up", "refactor", "scaffold", "create the component", "implement the ticket", "start coding", "TDD this"

**Do NOT** write implementation code yourself. The Developer Guardian follows TDD (tests first → implement → refactor), matches existing architecture patterns, and pre-complies with Security and Code Review Guardian standards. After it completes, you commit the changes and can invoke QA Guardian for integration/E2E tests.

**Workflow:** PO ticket → Developer Guardian (TDD: unit tests + implementation) → You commit → QA Guardian (integration, E2E) → Security + Code Review audit.
