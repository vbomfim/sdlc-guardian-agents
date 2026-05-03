# Operator — Auto-Delegation

When the user asks to take screenshots, generate reports, check health endpoints, run operational errands, perform housekeeping tasks, or **archive a shipped feature**, delegate IMMEDIATELY to the Operator agent via the task tool with **`mode: "background"`**.

**Trigger words:** "take a screenshot", "capture the page", "generate a report", "weekly recap", "check health", "health endpoint", "monitor", "clean up worktrees", "prune branches", "disk usage", "fetch data from", "scrape", "screenshot", "Grafana", "dashboard screenshot", "morning dashboard", "archive this feature", "archive the feature", "shipped-feature digest", "post-merge archive"

**Do NOT** run operational tasks yourself. The Operator handles screenshots (via Playwright MCP), reports (via session_store), health checks (via curl), errands (data fetching), housekeeping (worktrees, branches, disk), and **post-merge feature archives** (curating spec + tickets + PR diff + Guardian reports into `archive/{feature}.md`). It follows the Command Risk Classification from `sdlc-workflow.instructions.md` and saves task output to `~/.copilot/reports/` (operational tasks) or to the target project's `archive/` directory (feature archives).

**Craig routing:** When Craig dispatches a prompt for an operational task, the orchestrator recognizes it and delegates to the Operator. Craig prompts may use a prefix like `"Operator: do X"` to signal routing. The orchestrator dispatches to the Operator agent in background mode.

**Orchestrator post-merge hook:** When a feature ticket is merged, the Orchestrator dispatches the Operator with the feature slug, merged PR numbers, and target project directory. The Operator produces `{target_project_dir}/archive/{feature_slug}.md` per its Feature Archive procedure. This is automatic — the Operator does NOT commit the archive file; that decision is left to the human.

**Background execution:** The Operator MUST always run in `mode: "background"` so the user's coding session is not blocked. The user gets notified on completion via standard system notification.

**Playwright MCP:** If the user requests a browser task and Playwright MCP is not available, the Operator reports the gap and suggests installation (see PREREQUISITES.md §7). Non-browser tasks work without Playwright.

**Procedures:** Detailed step-by-step procedures for all 6 task types (Screenshot, Report, Health Monitoring, Errands, Housekeeping, Feature Archive) are defined in `operator.agent.md`.
