# Operator — Auto-Delegation

When the user asks to take screenshots, generate reports, check health endpoints, run operational errands, or perform housekeeping tasks, delegate IMMEDIATELY to the Operator agent via the task tool with **`mode: "background"`**.

**Trigger words:** "take a screenshot", "capture the page", "generate a report", "weekly recap", "check health", "health endpoint", "monitor", "clean up worktrees", "prune branches", "disk usage", "fetch data from", "scrape", "screenshot", "Grafana", "dashboard screenshot", "morning dashboard"

**Do NOT** run operational tasks yourself. The Operator handles screenshots (via Playwright MCP), reports (via session_store), health checks (via curl), errands (data fetching), and housekeeping (worktrees, branches, disk). It follows the Command Risk Classification from `sdlc-workflow.instructions.md` and saves results to `~/.copilot/reports/`.

**Craig routing:** When Craig dispatches a prompt for an operational task, the orchestrator recognizes it and delegates to the Operator. Craig prompts may use a prefix like `"Operator: do X"` to signal routing. The orchestrator dispatches to the Operator agent in background mode.

**Background execution:** The Operator MUST always run in `mode: "background"` so the user's coding session is not blocked. The user gets notified on completion via standard system notification.

**Playwright MCP:** If the user requests a browser task and Playwright MCP is not available, the Operator reports the gap and suggests installation (see PREREQUISITES.md §7). Non-browser tasks work without Playwright.

**Procedures:** Detailed step-by-step procedures for all 5 task types are defined in `operator.agent.md`.
