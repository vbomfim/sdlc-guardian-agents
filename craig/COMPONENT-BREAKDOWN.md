Agent completed. agent_id: agent-0, agent_type: po-guardian, status: completed, description: PO review Craig specification, elapsed: 564s, duration: 549s

Result:
Now I have full context. Let me compile the complete component breakdown.

---

# Craig — Component Breakdown for GitHub Issues

## Research Summary

### Internal Findings
- **Codebase:** No existing Craig code — `craig/` directory contains only `SPECIFICATION.md`. This is a greenfield implementation.
- **Guardian Agent Output Format:** All guardians produce structured handoff reports with a consistent pattern: `## [Guardian] Report` → `### Summary` → `### Findings` (severity-tagged table with `| # | Severity | Category | File:Line | Issue | Source | Fix |`) → `### Recommended Actions` → `### For the Default Agent`.
- **Severity tags:** `🔴 CRITICAL`, `🟠 HIGH`, `🟡 MEDIUM`, `🔵 LOW`, `ℹ️ INFO` — consistent across all guardians.
- **Standard tags:** `[OWASP-A01]`–`[OWASP-A10]`, `[GOOGLE-ENG]`, `[SOLID]`, `[CLEAN-CODE]`, `[HEXAGONAL]`, etc.
- **Agent invocation pattern:** Agents are `.agent.md` files installed at `~/.copilot/agents/`. They're invoked as subagents via Copilot CLI delegation. The `@github/copilot-sdk` is the programmatic interface.
- **Existing workflow:** `src/instructions/sdlc-workflow.instructions.md` defines the quality gates pipeline — Craig automates this pipeline autonomously.

### External Findings
- **MCP TypeScript SDK:** `@modelcontextprotocol/server` (v2 in development, v1.x is production-ready). Uses `zod` for schema validation. Supports `stdio` and Streamable HTTP transports. Tools registered with `server.tool()` decorator or via `McpServer` class.
- **MCP Server Pattern (TypeScript v1):** `new McpServer({ name, version })` → `server.tool(name, schema, handler)` → `server.connect(transport)`. Stdio transport via `new StdioServerTransport()`.
- **No console.log in stdio servers** — use `console.error()` for logging (stdout is the MCP protocol channel).
- **node-cron:** Standard cron scheduling for Node.js.
- **@octokit/rest:** Standard GitHub API client.

---

## Architecture & Dependency Graph

```
Layer 0 — Foundation (no internal deps)
  ┌─────────────┐   ┌────────────────────┐   ┌────────────────┐
  │   Config     │   │  State Management  │   │  Result Parser │
  │  (YAML)      │   │ (.craig-state.json)│   │ (markdown→obj) │
  └──────┬───────┘   └────────┬───────────┘   └───────┬────────┘
         │                    │                        │
Layer 1 — Infrastructure (depends on Layer 0)
  ┌──────┴──────────────┐   ┌┴───────────────────────┐
  │  GitHub Integration │   │  Copilot SDK Integration│
  │  (octokit wrapper)  │   │  (agent invocation)     │
  └──────┬──────────────┘   └┬───────────────────────┘
         │                   │
Layer 2 — Core
  ┌──────┴───────────────────┴──────────┐
  │  Core MCP Server + Tool Registration │
  │  (wires everything, thin handlers)   │
  └──────┬──────────────────────────────┘
         │
Layer 3 — Background Services
  ┌──────┴──────────┐   ┌───────────────┐
  │  Merge Watcher  │   │   Scheduler   │
  │  (poll main)    │   │  (node-cron)  │
  └──────┬──────────┘   └───────┬───────┘
         │                      │
Layer 4 — Analyzers (each independent, same interface)
  ┌──────┴──────────────────────┴────────────────────────┐
  │ Merge Review │ Coverage │ Security │ Tech Debt │ ... │
  │  Analyzer    │ Analyzer │ Analyzer │ Analyzer  │     │
  └──────────────┴──────────┴──────────┴───────────┴─────┘
         │
Layer 5 — Reporting
  ┌──────┴──────────────┐
  │  Daily Digest       │
  │  Reporter           │
  └─────────────────────┘
```

## Build Order (by dependency)

| Sprint | Issue # | Component | Depends On |
|--------|---------|-----------|------------|
| 1 | 1 | Config — YAML Config Loader | — |
| 1 | 2 | State Management — .craig-state.json | — |
| 1 | 3 | Result Parser — Guardian Report Parser | — |
| 1 | 4 | GitHub Integration — Issues, PRs, Comments | Config |
| 1 | 5 | Copilot SDK Integration — Agent Invocation | Config |
| 2 | 6 | Core MCP Server — Setup + Tool Registration | Config, State, GitHub, Copilot SDK |
| 2 | 7 | Merge Watcher — Poll Main Branch | Config, State, GitHub |
| 2 | 8 | Scheduler — Cron-based Task Execution | Config |
| 3 | 9 | Analyzer: Merge Review | Copilot SDK, GitHub, Result Parser, State |
| 3 | 10 | Analyzer: Security Scanner | Copilot SDK, GitHub, Result Parser, State |
| 3 | 11 | Analyzer: Coverage Gap Scanner | Copilot SDK, GitHub, Result Parser, State |
| 3 | 12 | Analyzer: Tech Debt Auditor | Copilot SDK, GitHub, Result Parser, State |
| 4 | 13 | Analyzer: Dependency Health Checker | GitHub, State |
| 4 | 14 | Analyzer: Pattern Learner & Enforcer | Copilot SDK, GitHub, Result Parser, State |
| 4 | 15 | Analyzer: Auto-Fix (Draft PR Creator) | GitHub, State |
| 4 | 16 | Daily Digest Reporter | State, GitHub |

---

## Issue 1 of 16

# Craig: Config — YAML Config Loader

## 1. User Story
As a **developer setting up Craig**,
I want Craig to load its configuration from a `craig.config.yaml` file,
so that I can customize which capabilities are enabled, set scan schedules, and configure repo-specific settings without modifying code.

## 2. Component Design (Rewritable by Design)
### Component Boundary
- **Component name:** `config`
- **Boundary:** Loads, validates, and provides typed access to `craig.config.yaml`. Owns the config schema. Does NOT use the config values — consumers read them through the exposed interface.
- **New or existing:** New component at `craig/src/config/`

### Interface Contract (define BEFORE implementation)
- **Ports (interfaces):**
  ```typescript
  interface ConfigPort {
    load(configPath?: string): Promise<CraigConfig>;
    get(): CraigConfig;
    update(key: string, value: unknown): Promise<CraigConfig>;
    validate(raw: unknown): CraigConfig; // throws on invalid
  }
  ```
- **Input contract:** File path to `craig.config.yaml` (default: `./craig.config.yaml`, overridable via `CRAIG_CONFIG` env var). YAML format per spec section 6.
- **Output contract:** `CraigConfig` typed object:
  ```typescript
  interface CraigConfig {
    repo: string;                    // "owner/repo-name"
    branch: string;                  // default: "main"
    schedule: Record<string, string>; // task → cron expression or "on_push"
    capabilities: Record<string, boolean>;
    models: { code_review?: string[]; security?: string; default: string };
    autonomy: { create_issues: boolean; create_draft_prs: boolean; auto_merge: false };
    guardians: { path: string };     // default: "~/.copilot/"
  }
  ```
- **Error contract:**
  - `ConfigNotFoundError` — file doesn't exist at path
  - `ConfigValidationError` — YAML is valid but schema fails (missing required fields, invalid cron expressions)
  - `ConfigParseError` — file is not valid YAML

### Dependencies
- **Depends on:** `yaml` npm package (YAML parser), `zod` (schema validation)
- **Consumed by:** Every other Craig component reads config through this interface
- **Rule:** No component imports config internals — only through `ConfigPort`

### Rewritability Check
- [x] Can this component be rewritten without changing any other component?
- [x] Are the interfaces stable enough that tests would survive a rewrite?
- [x] Is the data model owned by this component (not shared with siblings)?

## 3. Audience & Personas
- **Primary:** Developer configuring Craig for their repo
- **Secondary:** All other Craig components consuming configuration
- **Skill level:** Technical — YAML-literate developers
- **Scale:** One config per Craig instance, loaded once at startup, updated rarely via MCP tool

## 4. Functional Requirements
### Acceptance Criteria (Given/When/Then)

**AC1: Load valid config**
- Given a valid `craig.config.yaml` exists at the configured path
- When `config.load()` is called
- Then it returns a typed `CraigConfig` object with all fields populated (including defaults for omitted optional fields)

**AC2: Apply defaults for omitted fields**
- Given a minimal `craig.config.yaml` with only `repo` specified
- When `config.load()` is called
- Then `branch` defaults to `"main"`, `autonomy.auto_merge` defaults to `false`, `guardians.path` defaults to `"~/.copilot/"`, and all capabilities default to `true`

**AC3: Reject invalid config**
- Given a `craig.config.yaml` with missing `repo` field
- When `config.load()` is called
- Then it throws `ConfigValidationError` with a message listing the missing field

**AC4: Handle missing file**
- Given no file exists at the configured path
- When `config.load()` is called
- Then it throws `ConfigNotFoundError` with the attempted path

**AC5: Runtime update via MCP tool**
- Given a loaded config
- When `config.update("capabilities.auto_fix", false)` is called
- Then the in-memory config is updated AND the YAML file is written back to disk with the change preserved

**AC6: Environment variable override for path**
- Given `CRAIG_CONFIG=/custom/path.yaml` is set
- When `config.load()` is called with no argument
- Then it loads from `/custom/path.yaml`

### Edge Cases
- Config file exists but is empty → `ConfigValidationError` (repo is required)
- Config file has extra unknown fields → Ignore them (forward-compatible), do not error
- Cron expression is syntactically invalid → `ConfigValidationError` with field name
- `auto_merge` is set to `true` → Override to `false` and log a warning (spec says NEVER)

## 5. Non-Functional Requirements
- **Performance:** Config load < 50ms (it's a small file)
- **Scalability:** N/A — single file, single instance
- **Reliability:** If config can't load, Craig must not start — fail fast with clear error
- **Accessibility:** N/A — server-side component
- **Internationalization:** N/A

## 6. API Design
N/A — this is an internal component. Exposed to MCP consumers via the `craig_config` tool (implemented in the Core MCP Server component, not here).

## 7. Security Considerations
- **Authentication:** N/A — local file
- **Authorization:** Config file should be readable only by the Craig process owner
- **Data sensitivity:** Config may reference token env var names — but must NEVER contain actual secrets. Validate that no field value looks like a token/key (starts with `ghp_`, `ghs_`, etc.)
- **Input validation:** Validate all fields with zod schema. Reject unknown YAML tags.
- **OWASP references:** `[OWASP-A04]` — no secrets in config files
- **Rate limiting:** N/A

## 8. Observability
### Metrics
- Config load success/failure count
- Config reload count (via MCP update)

### SLIs / SLOs
N/A — startup-time component, not runtime.

### Dashboards
N/A for MVP.

### Alerts
- Craig fails to start due to config error → logged to stderr

## 9. Data Model & Storage
- **File:** `craig.config.yaml` — YAML, user-authored
- **Schema:** Defined by zod schema in this component
- **Migration:** N/A — first version
- **Storage:** Local filesystem
- **Retention:** User manages the file

## 10. Dependencies & Impacts
- **Upstream:** Filesystem (YAML file)
- **Downstream:** Every Craig component
- **Third-party:** `yaml` (YAML parser), `zod` (validation)
- **Team coordination:** None

## 11. Out of Scope
- Config UI or web editor — out of scope
- Remote config (fetching config from GitHub) — future
- Config file watching / hot reload — future (manual reload via MCP tool only)
- Multi-repo config — out of scope per spec

## 12. Open Questions
- [ ] Should `config.update()` write back to disk immediately, or batch writes?
- [ ] Should the config support YAML anchors and references for DRY definitions?

## 13. Research Findings
### Internal (codebase)
- Config schema defined in spec section 6 (`craig.config.yaml` example)
- Spec references `CRAIG_CONFIG` env var in MCP server registration JSON

### External (web/GitHub)
- `yaml` npm package is the standard YAML parser for Node.js
- `zod` used by MCP SDK already — reuse for config validation (no new dependency)
- Similar pattern: ESLint config loading, Prettier config loading

## 14. Testing Strategy
- **Unit tests:** `load()` with valid YAML, `load()` with missing file, `load()` with invalid schema, `validate()` edge cases, `update()` roundtrip, defaults application, `auto_merge: true` override
- **Integration tests:** Load from actual filesystem, write-back verification
- **E2E tests:** N/A — tested via `craig_config` MCP tool in Core component
- **Edge cases:** Empty file, malformed YAML, extra fields, env var override, nested key update
- **Performance tests:** N/A

**Suggested labels:** `component:config`, `layer:foundation`, `priority:high`, `sprint:1`

---

## Issue 2 of 16

# Craig: State Management — .craig-state.json Persistence

## 1. User Story
As **Craig (the autonomous daemon)**,
I want to persist my operational state (last processed commit, last run times, findings history) to a local JSON file,
so that I can resume where I left off after a restart and avoid re-processing merges or re-reporting findings.

## 2. Component Design (Rewritable by Design)
### Component Boundary
- **Component name:** `state`
- **Boundary:** Owns read/write of `.craig-state.json`. Provides typed get/set access. Does NOT interpret the state — consumers decide what to store and read.
- **New or existing:** New component at `craig/src/state/`

### Interface Contract
- **Ports (interfaces):**
  ```typescript
  interface StatePort {
    load(): Promise<CraigState>;
    save(): Promise<void>;
    get<K extends keyof CraigState>(key: K): CraigState[K];
    set<K extends keyof CraigState>(key: K, value: CraigState[K]): void;
    addFinding(finding: Finding): void;
    getFindings(filter?: FindingFilter): Finding[];
  }

  interface CraigState {
    last_processed_sha: string | null;
    last_runs: Record<string, string>;  // task → ISO timestamp
    running_tasks: string[];
    findings: Finding[];
    daily_stats: DailyStats;
  }

  interface Finding {
    id: string;
    severity: "critical" | "high" | "medium" | "low" | "info";
    category: string;
    file?: string;
    issue: string;
    source: string;           // which guardian
    github_issue_url?: string;
    detected_at: string;      // ISO timestamp
    task: string;             // which task found it
  }

  interface FindingFilter {
    severity?: string;
    since?: string;           // ISO date
    task?: string;
  }

  interface DailyStats {
    merges_reviewed: number;
    issues_created: number;
    prs_opened: number;
    findings_by_severity: Record<string, number>;
  }
  ```
- **Input contract:** State file path (default: `./.craig-state.json` in repo root)
- **Output contract:** Typed `CraigState` object
- **Error contract:**
  - File doesn't exist → Create with default empty state (not an error)
  - File is corrupted JSON → `StateCorruptedError`, log warning, back up corrupted file, create fresh state

### Dependencies
- **Depends on:** None (filesystem only)
- **Consumed by:** Merge Watcher (last_processed_sha), Scheduler (last_runs), all Analyzers (findings, stats), Digest Reporter (daily_stats), Core MCP Server (craig_status, craig_findings)
- **Rule:** No component directly reads `.craig-state.json` — all access through `StatePort`

### Rewritability Check
- [x] Can this component be rewritten without changing any other component?
- [x] Are the interfaces stable enough that tests would survive a rewrite?
- [x] Is the data model owned by this component (not shared with siblings)?

## 3. Audience & Personas
- **Primary:** Craig internal components
- **Secondary:** Developer debugging Craig (can inspect `.craig-state.json`)
- **Skill level:** N/A — internal
- **Scale:** Single file, updated multiple times per day, < 1MB for months of operation

## 4. Functional Requirements
### Acceptance Criteria (Given/When/Then)

**AC1: Load existing state**
- Given `.craig-state.json` exists with valid content
- When `state.load()` is called
- Then the in-memory state reflects the file contents

**AC2: Initialize fresh state**
- Given no `.craig-state.json` exists
- When `state.load()` is called
- Then a default empty state is created in memory (last_processed_sha: null, empty findings, zeroed stats)

**AC3: Persist on save**
- Given state has been modified in memory
- When `state.save()` is called
- Then `.craig-state.json` is written atomically (write to temp file, rename — no partial writes)

**AC4: Add finding with deduplication**
- Given a finding with the same file + issue already exists
- When `state.addFinding(duplicate)` is called
- Then it updates the existing finding's `detected_at` timestamp instead of creating a duplicate

**AC5: Filter findings**
- Given 20 findings in state across severities
- When `state.getFindings({ severity: "critical", since: "2025-01-01" })` is called
- Then only critical findings after that date are returned

**AC6: Handle corrupted state**
- Given `.craig-state.json` contains invalid JSON
- When `state.load()` is called
- Then the corrupted file is backed up to `.craig-state.json.bak`, a fresh state is created, and a warning is logged to stderr

### Edge Cases
- Concurrent writes (two tasks finishing simultaneously) → Use write lock (simple mutex)
- State file grows very large → Prune findings older than 90 days on load
- `running_tasks` contains stale entries after crash → Clear tasks running > 30 min on load

## 5. Non-Functional Requirements
- **Performance:** Read/write < 10ms for typical state file (< 100KB)
- **Reliability:** Atomic writes — never corrupt state on crash
- **Scalability:** State file < 1MB after 90 days of operation

## 6. API Design
N/A — internal component. Exposed via `craig_status` and `craig_findings` MCP tools in Core.

## 7. Security Considerations
- **Data sensitivity:** Findings may reference file paths and code issues — `.craig-state.json` should be gitignored
- **Input validation:** Validate JSON structure on load
- **OWASP references:** N/A

## 8. Observability
### Metrics
- State load/save count, state file size

### Alerts
- State file corruption detected → log to stderr

## 9. Data Model & Storage
- **File:** `.craig-state.json` — JSON, machine-managed
- **Schema:** Defined by TypeScript interfaces above
- **Migration:** Version field in state for future schema migrations
- **Retention:** Auto-prune findings > 90 days

## 10. Dependencies & Impacts
- **Upstream:** Filesystem
- **Downstream:** All Craig components
- **Third-party:** None (native JSON, native `fs`)

## 11. Out of Scope
- SQLite storage — future per spec
- Remote state sync — not in MVP
- State encryption — not needed for MVP

## 12. Open Questions
- [ ] Should `.craig-state.json` live in the repo root or in a `craig/` subdirectory?
- [ ] Should findings be capped at a maximum count (e.g., 10,000) to prevent unbounded growth?

## 13. Research Findings
### Internal
- Spec section 9: "Last processed commit SHA stored in `.craig-state.json`", "Pattern knowledge in `.craig-patterns.json`" (patterns are a separate component)
- Spec section 8: Metrics include merges_reviewed, issues_created, prs_opened, findings_by_severity

### External
- Atomic file writes in Node.js: write to `.craig-state.json.tmp`, then `fs.rename()` (rename is atomic on POSIX)
- Similar pattern: VS Code settings.json, ESLint cache files

## 14. Testing Strategy
- **Unit tests:** load/save roundtrip, fresh state initialization, finding deduplication, finding filtering, corrupted file recovery, atomic write, stale task cleanup, finding pruning
- **Integration tests:** Filesystem read/write with actual files
- **Edge cases:** Empty file, concurrent access, very large state
- **Performance tests:** Load/save with 10,000 findings

**Suggested labels:** `component:state`, `layer:foundation`, `priority:high`, `sprint:1`

---

## Issue 3 of 16

# Craig: Result Parser — Parse Guardian Agent Handoff Reports

## 1. User Story
As **Craig's analyzer pipeline**,
I want to parse the structured markdown handoff reports produced by Guardian agents into typed data objects,
so that I can programmatically create GitHub issues, filter by severity, and compile digest reports from Guardian output.

## 2. Component Design (Rewritable by Design)
### Component Boundary
- **Component name:** `result-parser`
- **Boundary:** Takes raw markdown text (Guardian handoff report) → outputs structured `ParsedReport` object. Pure function — no side effects, no I/O.
- **New or existing:** New component at `craig/src/result-parser/`

### Interface Contract
- **Ports (interfaces):**
  ```typescript
  interface ResultParserPort {
    parse(markdown: string, guardianType: GuardianType): ParsedReport;
  }

  type GuardianType = "security" | "code-review" | "qa" | "po" | "dev";

  interface ParsedReport {
    guardian: GuardianType;
    summary: string;
    findings: ParsedFinding[];
    recommended_actions: string[];
    metrics?: Record<string, string | number>;
    coverage_gaps?: CoverageGap[];
    raw: string;  // original markdown preserved
  }

  interface ParsedFinding {
    number: number;
    severity: "critical" | "high" | "medium" | "low" | "info";
    category: string;          // e.g., "[OWASP-A05]", "Design", "Quality"
    file_line?: string;        // e.g., "src/db.py:42"
    issue: string;
    source_justification: string;
    suggested_fix: string;
  }
  ```
- **Input contract:** Raw markdown string in the Guardian handoff report format (see research findings below for exact format)
- **Output contract:** `ParsedReport` typed object with all findings extracted
- **Error contract:**
  - Markdown doesn't match expected format → Return `ParsedReport` with `findings: []` and `raw` containing the original text (graceful degradation, never crash)
  - Partial parse success → Return what was parsed, log warning for unparseable sections

### Dependencies
- **Depends on:** None
- **Consumed by:** All Analyzer components
- **Rule:** No regex coupling to specific Guardian versions — parse generously, validate gently

### Rewritability Check
- [x] Can this component be rewritten without changing any other component?
- [x] Are the interfaces stable enough that tests would survive a rewrite?
- [x] Is the data model owned by this component (not shared with siblings)?

## 3. Audience & Personas
- **Primary:** Craig's analyzer components (machine consumers)
- **Secondary:** Developers debugging Craig's parsing
- **Skill level:** N/A — internal
- **Scale:** Called once per Guardian invocation (6-10 times per day)

## 4. Functional Requirements
### Acceptance Criteria (Given/When/Then)

**AC1: Parse Security Guardian report**
- Given a Security Guardian handoff report with 3 findings in a markdown table
- When `parser.parse(markdown, "security")` is called
- Then it returns a `ParsedReport` with `findings.length === 3`, each finding having severity, category, file_line, issue, source_justification, and suggested_fix extracted correctly

**AC2: Parse Code Review Guardian report**
- Given a Code Review Guardian report with metrics section and findings table
- When `parser.parse(markdown, "code-review")` is called
- Then `metrics` contains linter issue counts and `findings` contains all table rows

**AC3: Parse QA Guardian report**
- Given a QA Guardian report with coverage gaps table
- When `parser.parse(markdown, "qa")` is called
- Then `coverage_gaps` is populated with gap descriptions, risk levels, and statuses

**AC4: Extract severity from emoji markers**
- Given findings with `🔴 CRITICAL`, `🟠 HIGH`, `🟡 MEDIUM`, `🔵 LOW`, `ℹ️ INFO`
- When parsed
- Then severity is normalized to lowercase enum: `"critical"`, `"high"`, `"medium"`, `"low"`, `"info"`

**AC5: Handle unexpected format gracefully**
- Given a Guardian output that doesn't match the expected markdown table format
- When `parser.parse(markdown, "security")` is called
- Then it returns `{ findings: [], summary: "", raw: originalMarkdown }` without throwing

**AC6: Extract recommended actions**
- Given a report with `### Recommended Actions` section containing checkbox items
- When parsed
- Then `recommended_actions` contains the text of each action item

### Edge Cases
- Report with no findings table → `findings: []`
- Findings table with missing columns → populate available fields, leave others as empty strings
- Multiple tables in one report → parse all tables, combine findings
- Unicode/emoji in finding text → preserve as-is

## 5. Non-Functional Requirements
- **Performance:** Parse a 500-line report in < 10ms
- **Reliability:** NEVER throw — always return a valid `ParsedReport`, even if partially empty

## 6. API Design
N/A — internal component, pure function.

## 7. Security Considerations
- **Input validation:** The markdown input is trusted (comes from Guardian agents, not user input)
- **OWASP references:** N/A

## 8. Observability
### Metrics
- Parse success rate (full parse vs partial vs empty)
- Findings extracted per parse

## 9. Data Model & Storage
N/A — stateless, pure function. No storage.

## 10. Dependencies & Impacts
- **Upstream:** Guardian agent markdown output (format defined in each agent's `.agent.md` file)
- **Downstream:** All analyzer components
- **Third-party:** None (regex/string parsing only)

## 11. Out of Scope
- Parsing non-Guardian markdown (generic markdown parsing)
- Structured output from Guardians (if Guardians ever output JSON directly, this component becomes simpler)

## 12. Open Questions
- [ ] Should the parser also extract the `### For the Default Agent` action items as a separate field?
- [ ] Should we version the parser to match Guardian agent versions?

## 13. Research Findings
### Internal (codebase)
- **Security Guardian format** (from `security-guardian.agent.md` lines 133-158):
  ```
  ## Security Guardian Report
  ### Summary
  ### Findings ([N] total: [X] critical, [Y] high, [Z] medium)
  | # | Severity | Category | File:Line | Issue | Source & Justification | Suggested Fix |
  ### Recommended Actions
  ### For the Default Agent
  ```
- **Code Review Guardian format** (from `code-review-guardian.agent.md` lines 183-213): Same table structure plus `### Metrics` section with linter counts
- **QA Guardian format** (from `qa-guardian.agent.md` lines 175-220): Includes `### Coverage Gaps Found` table and `### Acceptance Criteria Coverage` table
- **Consistent severity emoji** across all guardians: `🔴`, `🟠`, `🟡`, `🔵`, `ℹ️`

### External
- Markdown table parsing is well-solved with regex: split by `|`, trim cells, skip header separator row

## 14. Testing Strategy
- **Unit tests:** Parse each guardian type's sample report, severity extraction, empty report, malformed report, partial table, recommended actions extraction
- **Integration tests:** N/A — pure function
- **Edge cases:** Report with zero findings, report with 100 findings, report with missing columns, report with extra columns, unicode in cells
- **Performance tests:** Parse 1000-line synthetic report

**Suggested labels:** `component:result-parser`, `layer:foundation`, `priority:high`, `sprint:1`

---

## Issue 4 of 16

# Craig: GitHub Integration — Issues, PRs, Review Comments

## 1. User Story
As **Craig's autonomous engine**,
I want a unified interface for creating GitHub issues, opening draft PRs, posting review comments, and reading merge history,
so that all GitHub interactions are centralized, rate-limit-aware, and can be swapped without changing analyzer code.

## 2. Component Design (Rewritable by Design)
### Component Boundary
- **Component name:** `github`
- **Boundary:** Wraps `@octokit/rest`. All GitHub API calls go through this component. No other component imports octokit directly. Handles rate limiting, pagination, and error mapping.
- **New or existing:** New component at `craig/src/github/`

### Interface Contract
- **Ports (interfaces):**
  ```typescript
  interface GitHubPort {
    // Issues
    createIssue(params: CreateIssueParams): Promise<{ url: string; number: number }>;
    findExistingIssue(title: string): Promise<{ url: string; number: number } | null>;
    listOpenIssues(labels?: string[]): Promise<Issue[]>;

    // Pull Requests
    createDraftPR(params: CreatePRParams): Promise<{ url: string; number: number }>;

    // Review Comments
    createCommitComment(sha: string, body: string): Promise<{ url: string }>;

    // Repository
    getLatestCommits(since: string, branch?: string): Promise<Commit[]>;
    getCommitDiff(sha: string): Promise<string>;
    getMergeCommits(since: string): Promise<MergeCommit[]>;

    // Rate Limiting
    getRateLimit(): Promise<{ remaining: number; reset: Date }>;
  }

  interface CreateIssueParams {
    title: string;
    body: string;
    labels: string[];
    assignees?: string[];
  }

  interface CreatePRParams {
    title: string;
    body: string;
    head: string;  // branch name
    base: string;  // target branch
    draft: true;   // always draft — Craig never creates ready PRs
  }
  ```
- **Input contract:** Structured params objects (typed above)
- **Output contract:** GitHub API response data (url, number, etc.)
- **Error contract:**
  - `GitHubRateLimitError` — rate limit reached, includes reset time
  - `GitHubAuthError` — token invalid or insufficient scopes
  - `GitHubNotFoundError` — repo or resource not found
  - `GitHubAPIError` — generic API error with status code and message

### Dependencies
- **Depends on:** Config (for `repo`, `branch`), `GITHUB_TOKEN` env var
- **Consumed by:** All Analyzers, Merge Watcher, Digest Reporter
- **Rule:** No other component uses `@octokit/rest` directly

### Rewritability Check
- [x] Can this component be rewritten without changing any other component? (could swap octokit for `gh` CLI)
- [x] Are the interfaces stable enough that tests would survive a rewrite?
- [x] Is the data model owned by this component?

## 3. Audience & Personas
- **Primary:** Craig's internal analyzer and watcher components
- **Secondary:** Developers who see Craig's GitHub output (issues, PRs, comments)
- **Skill level:** N/A — internal
- **Scale:** 50-200 API calls per day per repo (well within 5000/hour limit)

## 4. Functional Requirements
### Acceptance Criteria (Given/When/Then)

**AC1: Create issue**
- Given valid issue params with title, body, and labels
- When `github.createIssue(params)` is called
- Then a GitHub issue is created in the configured repo and the URL + number are returned

**AC2: Duplicate issue detection**
- Given an open issue with title "Security: SQL injection in src/db.py"
- When `github.findExistingIssue("Security: SQL injection in src/db.py")` is called
- Then it returns the existing issue's URL and number (so Craig doesn't create a duplicate)

**AC3: Create draft PR**
- Given a branch `craig/fix-linting-2025-07-11` with commits
- When `github.createDraftPR(params)` is called
- Then a draft PR is created targeting the configured base branch

**AC4: Respect rate limits**
- Given fewer than 100 GitHub API requests remaining
- When any API call is made
- Then Craig queues the request and waits until the rate limit resets, logging a warning

**AC5: Get merge commits**
- Given 3 merge commits to main since a given SHA
- When `github.getMergeCommits(since)` is called
- Then it returns all 3 merge commits with SHA, message, author, and timestamp

**AC6: Post commit comment**
- Given a merge commit SHA
- When `github.createCommitComment(sha, body)` is called
- Then a comment is posted on that commit visible in the GitHub UI

### Edge Cases
- Token has insufficient scopes → `GitHubAuthError` with message listing required scopes
- Repo doesn't exist or is private without access → `GitHubNotFoundError`
- Issue title > 256 characters → Truncate to 253 + "..."
- API returns 500 → Retry once after 2 second delay, then throw `GitHubAPIError`

## 5. Non-Functional Requirements
- **Performance:** API calls should complete in < 3s (GitHub's typical response time)
- **Reliability:** Retry once on 5xx errors. Never retry on 4xx.
- **Rate limiting:** Queue requests when < 100 remaining. Log warning at < 500 remaining.

## 6. API Design
N/A — internal component wrapping GitHub API.

## 7. Security Considerations
- **Authentication:** `GITHUB_TOKEN` from environment variable — never from config file
- **Authorization:** Token needs scopes: `repo`, `issues`, `pull_requests`
- **Data sensitivity:** Token is a secret — never logged, never included in error messages
- **OWASP references:** `[OWASP-A04]` — secret management

## 8. Observability
### Metrics
- API calls per hour, rate limit remaining, error count by type

### Alerts
- Rate limit < 100 remaining → warning log
- Auth failure → error log

## 9. Data Model & Storage
N/A — stateless adapter. Uses GitHub as storage.

## 10. Dependencies & Impacts
- **Upstream:** GitHub API, `GITHUB_TOKEN`
- **Downstream:** All Craig components that interact with GitHub
- **Third-party:** `@octokit/rest`

## 11. Out of Scope
- GitHub App authentication (using PAT for MVP)
- Webhook receiver (using polling for MVP)
- GitHub GraphQL API (REST is sufficient for MVP)

## 12. Open Questions
- [ ] Should Craig use a dedicated bot account PAT or a GitHub App installation token?
- [ ] Should `findExistingIssue` search by exact title match or fuzzy match?
- [ ] Should closed issues be included in duplicate detection?

## 13. Research Findings
### Internal
- Spec section 7: "GitHub token with repo, issues, pull_requests scopes"
- Spec section 7: "Respect GitHub API rate limits (5000 req/hour)"
- Spec section 4: "Check existing open issues before creating" (duplicate prevention)

### External
- `@octokit/rest` is the standard GitHub API client for Node.js
- Rate limit info available via `GET /rate_limit`
- Commit comments via `POST /repos/{owner}/{repo}/commits/{sha}/comments`

## 14. Testing Strategy
- **Unit tests:** Mock octokit — test createIssue, findExistingIssue, createDraftPR, getMergeCommits, rate limit handling, error mapping, retry logic
- **Integration tests:** Real API calls against a test repo (with test token)
- **Edge cases:** Rate limit boundary, auth failure, 500 retry, title truncation, duplicate detection
- **Performance tests:** N/A

**Suggested labels:** `component:github`, `layer:infrastructure`, `priority:high`, `sprint:1`

---

## Issue 5 of 16

# Craig: Copilot SDK Integration — Session Management + Agent Invocation

## 1. User Story
As **Craig's analyzer pipeline**,
I want to programmatically invoke SDLC Guardian agents (Security, Code Review, QA, PO) and capture their structured output,
so that Craig can orchestrate Guardian reviews autonomously without human initiation.

## 2. Component Design (Rewritable by Design)
### Component Boundary
- **Component name:** `copilot`
- **Boundary:** Manages Copilot SDK sessions and invokes Guardian agents by name. Captures agent output. Handles session lifecycle (create, use, close). Does NOT interpret agent output — that's the Result Parser's job.
- **New or existing:** New component at `craig/src/copilot/`

### Interface Contract
- **Ports (interfaces):**
  ```typescript
  interface CopilotPort {
    invoke(params: InvokeParams): Promise<InvokeResult>;
    isAvailable(): Promise<boolean>;
  }

  interface InvokeParams {
    agent: "security-guardian" | "code-review-guardian" | "qa-guardian" | "po-guardian";
    prompt: string;     // the task description for the agent
    context?: string;   // additional context (diff, file list, etc.)
    model?: string;     // override model from config
    timeout?: number;   // ms, default 300000 (5 min)
  }

  interface InvokeResult {
    success: boolean;
    output: string;     // raw agent output (markdown)
    duration_ms: number;
    model_used: string;
    error?: string;     // error message if success is false
  }
  ```
- **Input contract:** Agent name + prompt + optional context
- **Output contract:** Raw markdown output from the Guardian agent
- **Error contract:**
  - `CopilotSessionError` — SDK session failed to create
  - `CopilotTimeoutError` — agent didn't respond within timeout
  - `CopilotUnavailableError` — Copilot CLI/SDK not installed or not authenticated

### Dependencies
- **Depends on:** Config (for `models`, `guardians.path`), `@github/copilot-sdk`
- **Consumed by:** All Analyzer components
- **Rule:** No analyzer imports copilot-sdk directly

### Rewritability Check
- [x] Can this component be rewritten without changing any other component? (could swap SDK for CLI `-p` flag invocation)
- [x] Are the interfaces stable enough that tests would survive a rewrite?
- [x] Is the data model owned by this component?

## 3. Audience & Personas
- **Primary:** Craig's analyzer components (machine consumers)
- **Skill level:** N/A — internal
- **Scale:** 6-10 invocations per day (each running 1-5 minutes)

## 4. Functional Requirements
### Acceptance Criteria (Given/When/Then)

**AC1: Invoke Security Guardian**
- Given Copilot SDK is available and authenticated
- When `copilot.invoke({ agent: "security-guardian", prompt: "Review this diff for vulnerabilities", context: diffText })` is called
- Then it returns `{ success: true, output: "## Security Guardian Report\n..." }` containing the Guardian's markdown report

**AC2: Handle timeout**
- Given a Guardian agent takes > 5 minutes
- When the timeout is reached
- Then it returns `{ success: false, error: "Timeout after 300000ms", output: "" }` without crashing

**AC3: Handle SDK unavailable**
- Given Copilot CLI is not installed
- When `copilot.isAvailable()` is called
- Then it returns `false`

**AC4: Retry on session failure**
- Given the first SDK session creation fails
- When Craig retries once
- Then the second attempt creates a fresh session

**AC5: Model selection**
- Given config has `models.security: "claude-opus-4.6"`
- When invoking security-guardian
- Then the specified model is used for the invocation

### Edge Cases
- Copilot SDK returns empty output → `{ success: true, output: "" }` (not an error — the analyzer handles empty output)
- Multiple concurrent invocations → Each gets its own session (no shared state)
- SDK version mismatch → Log warning, attempt invocation anyway

## 5. Non-Functional Requirements
- **Performance:** Agent invocation should complete within 5 minutes per spec
- **Reliability:** Retry once on session failure, then record as failed
- **Resource usage:** One session at a time per invocation (don't leak sessions)

## 6. API Design
N/A — internal component.

## 7. Security Considerations
- **Authentication:** Copilot SDK uses its own auth (GitHub OAuth via Copilot CLI login)
- **Data sensitivity:** Prompts may contain source code diffs — kept in memory, not logged
- **OWASP references:** N/A

## 8. Observability
### Metrics
- Invocation count by guardian type, success/failure rate, duration per invocation

### SLIs / SLOs
| SLI | Target (SLO) | Window |
|-----|-------------|--------|
| Agent invocation success rate | 95% | 30 days |

### Alerts
- 3 consecutive failures → create incident issue (per spec)

## 9. Data Model & Storage
N/A — stateless adapter.

## 10. Dependencies & Impacts
- **Upstream:** `@github/copilot-sdk`, Copilot CLI (must be installed and authenticated)
- **Downstream:** All Analyzer components
- **Third-party:** `@github/copilot-sdk` (v0.1.32 per spec research)

## 11. Out of Scope
- Copilot CLI `-p` flag fallback — future (if SDK is unavailable)
- Multi-model parallel invocation (Code Review Guardian's dual-model pattern) — future
- Custom agent loading — uses agents installed at `guardians.path`

## 12. Open Questions
- [ ] Does `@github/copilot-sdk` support invoking custom agents by name, or only via prompt? (from spec Open Questions)
- [ ] If SDK doesn't support named agent invocation, should we fall back to `copilot -p "invoke security guardian"` CLI?
- [ ] What happens if the user's Copilot subscription doesn't include agent features?

## 13. Research Findings
### Internal
- Spec: "`@github/copilot-sdk` v0.1.32 — TypeScript SDK, JSON-RPC to Copilot CLI"
- Spec: "Copilot CLI supports `-p` flag for non-interactive mode"
- Agent files at `~/.copilot/agents/*.agent.md`

### External
- `@github/copilot-sdk` is the official programmatic interface to Copilot
- SDK uses JSON-RPC for communication with Copilot CLI process

## 14. Testing Strategy
- **Unit tests:** Mock SDK — invoke success, invoke timeout, invoke failure, session retry, model selection, availability check
- **Integration tests:** Real SDK invocation with a simple prompt (requires Copilot auth)
- **Edge cases:** Empty output, concurrent invocations, SDK not installed
- **Performance tests:** Measure invocation latency

**Suggested labels:** `component:copilot`, `layer:infrastructure`, `priority:high`, `sprint:1`

---

## Issue 6 of 16

# Craig: Core MCP Server — Setup + Tool Registration

## 1. User Story
As a **developer using Copilot CLI**,
I want Craig to run as an MCP server that exposes `craig_status`, `craig_run_task`, `craig_findings`, `craig_schedule`, `craig_config`, and `craig_digest` as discoverable tools,
so that I can interact with Craig through natural language in Copilot CLI.

## 2. Component Design (Rewritable by Design)
### Component Boundary
- **Component name:** `core`
- **Boundary:** The MCP server entry point. Registers 6 MCP tools with thin handlers that delegate to other components. Starts background services (Merge Watcher, Scheduler). This is the wiring layer — minimal business logic.
- **New or existing:** New component at `craig/src/core/` + `craig/src/index.ts` (entry point)

### Interface Contract — MCP Tools
| MCP Tool | Parameters | Returns | Delegates To |
|----------|------------|---------|-------------|
| `craig_status` | none | `{ running_tasks, last_runs, health }` | State |
| `craig_run_task` | `{ task: string }` | `{ task_id, status: "started" }` | Analyzers (by task name) |
| `craig_findings` | `{ severity?, since? }` | `{ findings: [...] }` | State |
| `craig_schedule` | `{ action, task?, cron? }` | `{ schedule: [...] }` | Config + Scheduler |
| `craig_config` | `{ action, key?, value? }` | `{ config }` | Config |
| `craig_digest` | `{ period? }` | `{ merges_reviewed, issues_created, ... }` | Digest Reporter |

- **Error contract:** MCP tool errors returned as JSON `{ error: string, code: string }`, never crash the server process

### Dependencies
- **Depends on:** Config, State, GitHub, Copilot SDK, all Analyzers, Scheduler, Merge Watcher, Digest Reporter
- **Consumed by:** Copilot CLI via MCP protocol (stdio transport)
- **Rule:** Tool handlers are thin wrappers (< 20 lines each) — logic lives in the delegated components

### Rewritability Check
- [x] Can this component be rewritten without changing any other component? (it's the wiring — changes here don't affect component implementations)
- [x] Are the interfaces stable enough that tests would survive a rewrite?
- [ ] Is the data model owned by this component? (No — it delegates entirely)

## 3. Audience & Personas
- **Primary:** Developer using Copilot CLI who says "craig status" or "ask craig to review"
- **Secondary:** Copilot CLI host (discovers tools via MCP protocol)
- **Skill level:** Technical — Copilot CLI users
- **Scale:** One instance per repo, 10-50 tool calls per day

## 4. Functional Requirements
### Acceptance Criteria (Given/When/Then)

**AC1: Server starts and registers tools**
- Given Craig's dependencies are configured (config, token)
- When `node dist/index.js` is started
- Then the MCP server connects via stdio and registers 6 tools discoverable by Copilot CLI

**AC2: craig_status returns health**
- Given Craig is running with no active tasks
- When `craig_status` tool is called
- Then it returns `{ running_tasks: [], last_runs: { merge_review: "2025-07-10T..." }, health: "ok" }`

**AC3: craig_run_task triggers analyzer**
- Given Craig is idle
- When `craig_run_task({ task: "security_scan" })` is called
- Then the security analyzer is started asynchronously and `{ task_id: "uuid", status: "started" }` is returned immediately

**AC4: craig_findings filters results**
- Given state contains 15 findings
- When `craig_findings({ severity: "critical" })` is called
- Then only critical findings are returned

**AC5: Invalid task name**
- Given a call with `craig_run_task({ task: "nonexistent" })`
- When the tool handler processes it
- Then it returns `{ error: "Unknown task: nonexistent", code: "INVALID_TASK" }`

**AC6: Background services start with server**
- Given Craig starts successfully
- When the MCP server is connected
- Then the Merge Watcher and Scheduler are started as background processes

### Edge Cases
- Tool called while previous instance of same task is running → Return `{ error: "Task already running", code: "TASK_RUNNING" }`
- Server crashes → PM2/systemd restarts, state is recovered from `.craig-state.json`
- Config file missing on startup → Server fails to start with clear error message

## 5. Non-Functional Requirements
- **Performance:** Tool call response < 100ms (they return immediately, work is async)
- **Resource usage:** < 512MB RAM idle per spec
- **Reliability:** Process should be restartable without data loss

## 6. API Design
### MCP Tool Schemas (zod)
```typescript
// craig_run_task
z.object({
  task: z.enum([
    "merge_review", "coverage_scan", "security_scan",
    "tech_debt_audit", "dependency_check", "pattern_check", "auto_fix"
  ])
})

// craig_findings
z.object({
  severity: z.enum(["critical", "high", "medium", "low"]).optional(),
  since: z.string().datetime().optional()
})

// craig_schedule
z.object({
  action: z.enum(["view", "update"]),
  task: z.string().optional(),
  cron: z.string().optional()
})

// craig_config
z.object({
  action: z.enum(["view", "update"]),
  key: z.string().optional(),
  value: z.string().optional()
})

// craig_digest
z.object({
  period: z.enum(["today", "week", "month"]).optional()
})
```

## 7. Security Considerations
- **Authentication:** MCP protocol relies on the host (Copilot CLI) for auth — Craig trusts the caller
- **Data sensitivity:** Tool responses may contain file paths and finding details
- **OWASP references:** N/A — local process communication
- **No `console.log()`:** MCP stdio transport uses stdout — all logging must go to stderr

## 8. Observability
### Metrics
- Tool call count by tool name, tool call latency, background service uptime

### SLIs / SLOs
| SLI | Target (SLO) | Window |
|-----|-------------|--------|
| Process uptime | 99% | 30 days |

### Alerts
- Process down > 5 minutes → external monitor (PM2 or systemd)

## 9. Data Model & Storage
N/A — delegates to State component.

## 10. Dependencies & Impacts
- **Upstream:** `@modelcontextprotocol/sdk` (MCP server library), all Craig components
- **Downstream:** Copilot CLI (tool consumer)
- **Third-party:** `@modelcontextprotocol/sdk`, `zod`

## 11. Out of Scope
- HTTP/SSE transport (stdio only for MVP)
- Authentication layer (trusted local process)
- Web UI

## 12. Open Questions
- [ ] Should Craig expose MCP resources (for listing findings as browsable data) in addition to tools?
- [ ] Should tool calls be queued if the server is under heavy load?

## 13. Research Findings
### Internal
- Spec section 6: MCP tool definitions with exact parameter schemas
- Spec architecture diagram: MCP server with 6 tools + 4 background services

### External
- MCP TypeScript SDK v1: `new McpServer({ name, version })` → `server.tool(name, schema, handler)` → `server.connect(new StdioServerTransport())`
- **Critical:** Never `console.log()` in stdio MCP servers — corrupts JSON-RPC
- `zod` is a required peer dep of the MCP SDK — already available

## 14. Testing Strategy
- **Unit tests:** Each tool handler (mock dependencies), parameter validation, error responses, task dispatch
- **Integration tests:** Start MCP server, send tool calls via MCP client, verify responses
- **E2E tests:** Register in Copilot CLI config, invoke via natural language
- **Edge cases:** Invalid params, concurrent tool calls, missing config
- **Performance tests:** Tool response latency under load

**Suggested labels:** `component:core`, `layer:core`, `priority:critical`, `sprint:2`

---

## Issue 7 of 16

# Craig: Merge Watcher — Poll Main Branch for New Merges

## 1. User Story
As a **development team**,
I want Craig to automatically detect new merges to the main branch within 60 seconds,
so that every merge gets reviewed by Guardian agents without anyone needing to remember to trigger a review.

## 2. Component Design (Rewritable by Design)
### Component Boundary
- **Component name:** `merge-watcher`
- **Boundary:** Polls the GitHub API for new merge commits on the configured branch. Emits events when new merges are found. Does NOT run the review — it delegates to the configured task handler.
- **New or existing:** New component at `craig/src/merge-watcher/`

### Interface Contract
- **Ports (interfaces):**
  ```typescript
  interface MergeWatcherPort {
    start(): void;
    stop(): void;
    onMerge(handler: (merge: MergeEvent) => void): void;
  }

  interface MergeEvent {
    sha: string;
    message: string;
    author: string;
    timestamp: string;
    diff_url: string;
  }
  ```
- **Input contract:** Polls GitHub API at configured interval (default: 60 seconds). Reads `last_processed_sha` from State.
- **Output contract:** Emits `MergeEvent` for each new merge detected
- **Error contract:** API failures logged, polling continues. 3+ consecutive failures → log warning.

### Dependencies
- **Depends on:** Config (`branch`, `schedule.merge_monitor`), State (`last_processed_sha`), GitHub (`getMergeCommits`)
- **Consumed by:** Core MCP Server (starts the watcher), Merge Review Analyzer (handles events)
- **Rule:** Watcher only detects — analyzers decide what to do

### Rewritability Check
- [x] Can this component be rewritten without changing any other component?
- [x] Are the interfaces stable enough that tests would survive a rewrite?
- [x] Is the data model owned by this component?

## 3. Audience & Personas
- **Primary:** The automated pipeline (no direct human interaction)
- **Scale:** 1 poll per minute = ~1440 API calls/day (within rate limits)

## 4. Functional Requirements
### Acceptance Criteria (Given/When/Then)

**AC1: Detect new merge**
- Given `last_processed_sha` is "abc123" and a new merge "def456" exists on main
- When the next poll cycle runs
- Then `onMerge` handler is called with `{ sha: "def456", ... }` and `last_processed_sha` is updated to "def456"

**AC2: No new merges**
- Given no new merges since `last_processed_sha`
- When the poll cycle runs
- Then no event is emitted and the poll cycle completes silently

**AC3: Multiple merges between polls**
- Given 3 merges happened since last poll (chronological order: A, B, C)
- When the poll cycle runs
- Then `onMerge` is called 3 times in chronological order (A first, C last) and `last_processed_sha` is updated after each

**AC4: First run (no previous SHA)**
- Given `last_processed_sha` is `null` (fresh install)
- When the first poll runs
- Then it sets `last_processed_sha` to the current HEAD of main without emitting events (don't review all historical merges)

**AC5: API failure resilience**
- Given the GitHub API returns a 500 error
- When the poll cycle runs
- Then the error is logged to stderr, the poll continues on the next cycle, and no state is modified

### Edge Cases
- Force push to main (SHA doesn't exist anymore) → Reset `last_processed_sha` to current HEAD, log warning
- Very long gap between polls (100+ merges) → Process in batches of 30, update SHA after each batch
- Watcher stopped and restarted → Resumes from `last_processed_sha` in state

## 5. Non-Functional Requirements
- **Performance:** Poll cycle < 2 seconds (single API call)
- **Reliability:** Never crash on API error — log and retry next cycle
- **Resource usage:** Negligible — one API call per minute

## 6. API Design
N/A — internal component, event-based.

## 7. Security Considerations
- **Rate limiting:** 1440 calls/day from this component alone — monitor cumulative usage
- **OWASP references:** N/A

## 8. Observability
### Metrics
- Merges detected per day, poll failures, consecutive failure count

### SLIs / SLOs
| SLI | Target (SLO) | Window |
|-----|-------------|--------|
| Merge detection within 5 min | 99% | 30 days |

## 9. Data Model & Storage
- Uses `State.last_processed_sha` — does not own storage.

## 10. Dependencies & Impacts
- **Upstream:** GitHub API (merge commits endpoint)
- **Downstream:** Merge Review Analyzer
- **Third-party:** `setInterval` (Node.js native)

## 11. Out of Scope
- Webhook-based detection (future — would eliminate polling)
- Branch-specific watching (only main/configured branch)

## 12. Open Questions
- [ ] What polling interval for merge detection without webhooks? (spec says 60s — confirm)
- [ ] Should Craig watch for PRs merging to main, or direct pushes too?

## 13. Research Findings
### Internal
- Spec: "poll interval: 60s" for merge_monitor
- Spec AC1: "Craig detects the merge (polling or webhook)"
- Spec: "Merge review should complete within 5 minutes of merge detection"

### External
- GitHub API: `GET /repos/{owner}/{repo}/commits?sha={branch}&since={date}` returns commits
- Merge commits identifiable by having 2+ parents in the commit object

## 14. Testing Strategy
- **Unit tests:** Mock GitHub — new merge detection, no-merge poll, multiple merges, first run, API failure, force push
- **Integration tests:** Poll against a test repo with known merge history
- **Edge cases:** Force push, 100+ merges, concurrent start/stop

**Suggested labels:** `component:merge-watcher`, `layer:background`, `priority:high`, `sprint:2`

---

## Issue 8 of 16

# Craig: Scheduler — Cron-based Task Execution

## 1. User Story
As a **development team**,
I want Craig to run scans on a configurable schedule (daily coverage scans, weekly tech debt audits),
so that repository health is continuously monitored without manual trigger.

## 2. Component Design (Rewritable by Design)
### Component Boundary
- **Component name:** `scheduler`
- **Boundary:** Reads cron expressions from Config, schedules tasks using `node-cron`. Invokes the task dispatch function when a schedule triggers. Does NOT run the task itself — delegates to the analyzer registry.
- **New or existing:** New component at `craig/src/scheduler/`

### Interface Contract
- **Ports (interfaces):**
  ```typescript
  interface SchedulerPort {
    start(): void;
    stop(): void;
    getSchedule(): ScheduleEntry[];
    updateSchedule(task: string, cron: string): void;
  }

  interface ScheduleEntry {
    task: string;
    cron: string;
    next_run: string;  // ISO timestamp
    last_run: string | null;
  }
  ```
- **Input contract:** `config.schedule` record mapping task names to cron expressions (or `"on_push"` for merge-triggered tasks)
- **Output contract:** Calls a registered task dispatcher function when a cron fires
- **Error contract:** Invalid cron expression → `ScheduleValidationError` at registration time, not at fire time

### Dependencies
- **Depends on:** Config (`schedule`), `node-cron`
- **Consumed by:** Core MCP Server (starts scheduler, provides `craig_schedule` tool data)
- **Rule:** Scheduler knows task names but not task implementations

### Rewritability Check
- [x] Can this component be rewritten without changing any other component?
- [x] Are the interfaces stable enough that tests would survive a rewrite?
- [x] Is the data model owned by this component?

## 3. Audience & Personas
- **Primary:** Automated pipeline
- **Secondary:** Developer checking schedule via `craig_schedule` tool
- **Scale:** 5-10 scheduled task firings per day

## 4. Functional Requirements
### Acceptance Criteria (Given/When/Then)

**AC1: Schedule tasks from config**
- Given config contains `coverage_scan: "0 8 * * *"`
- When the scheduler starts
- Then `coverage_scan` is scheduled to fire daily at 8:00 AM

**AC2: Skip "on_push" tasks**
- Given config contains `merge_monitor: "on_push"`
- When the scheduler processes schedules
- Then `merge_monitor` is NOT scheduled (it's handled by Merge Watcher, not cron)

**AC3: Fire triggers task dispatcher**
- Given coverage_scan is scheduled for 8:00 AM
- When the cron fires at 8:00 AM
- Then the registered task dispatcher is called with task name `"coverage_scan"`

**AC4: Update schedule at runtime**
- Given `craig_schedule({ action: "update", task: "coverage_scan", cron: "0 6 * * *" })`
- When the update is applied
- Then the existing cron job is replaced with the new schedule

**AC5: View schedule**
- Given 3 active scheduled tasks
- When `scheduler.getSchedule()` is called
- Then it returns entries with task, cron, next_run, and last_run for each

### Edge Cases
- Invalid cron expression in config → `ScheduleValidationError` at startup (fail fast)
- Task fires while previous instance is still running → Skip (log "task still running, skipping")
- System clock changes (DST, NTP sync) → `node-cron` handles this natively

## 5. Non-Functional Requirements
- **Performance:** Cron evaluation is negligible
- **Reliability:** Scheduler must survive task dispatch failures (catch and log, don't crash)

## 6. API Design
N/A — internal. Exposed via `craig_schedule` MCP tool.

## 7. Security Considerations
N/A — local scheduling, no external input.

## 8. Observability
### Metrics
- Scheduled task fires per day, skipped fires (task already running), schedule update count

## 9. Data Model & Storage
- Reads from Config. Records `last_run` in State.

## 10. Dependencies & Impacts
- **Upstream:** Config, State
- **Downstream:** All Analyzers (via task dispatcher)
- **Third-party:** `node-cron`

## 11. Out of Scope
- Distributed scheduling — single instance only
- Timezone configuration — uses server timezone

## 12. Open Questions
- [ ] Should schedule updates persist to `craig.config.yaml` or only in memory until restart?

## 13. Research Findings
### Internal
- Spec config example: `coverage_scan: "0 8 * * *"`, `tech_debt_audit: "0 9 * * 1"`, `merge_monitor: on_push`

### External
- `node-cron` v3.x: `cron.schedule(expression, callback, options)`
- Supports standard 5-field cron syntax

## 14. Testing Strategy
- **Unit tests:** Schedule registration, on_push skip, fire triggers dispatch, runtime update, invalid cron rejection, overlap prevention
- **Integration tests:** Schedule a task 1 second in the future, verify it fires
- **Edge cases:** Invalid cron, rapid fires, stop/start lifecycle

**Suggested labels:** `component:scheduler`, `layer:background`, `priority:high`, `sprint:2`

---

## Issue 9 of 16

# Craig: Analyzer — Merge Review (Post-Merge Guardian Review)

## 1. User Story
As a **development team**,
I want every merge to main to be automatically reviewed by Security Guardian and Code Review Guardian,
so that security vulnerabilities and code quality issues are caught within 5 minutes of merge, even outside business hours.

## 2. Component Design (Rewritable by Design)
### Component Boundary
- **Component name:** `analyzer-merge-review`
- **Boundary:** Orchestrates a post-merge review: gets the merge diff → invokes Security Guardian + Code Review Guardian → parses results → posts a review comment on the merge commit. Implements the shared `Analyzer` interface.
- **New or existing:** New component at `craig/src/analyzers/merge-review/`

### Interface Contract
- **Ports (interfaces):**
  ```typescript
  // Shared interface for ALL analyzers
  interface Analyzer {
    name: string;
    execute(context: AnalyzerContext): Promise<AnalyzerResult>;
  }

  interface AnalyzerContext {
    trigger: "merge" | "schedule" | "manual";
    sha?: string;           // for merge-triggered tasks
    diff?: string;          // for merge-triggered tasks
  }

  interface AnalyzerResult {
    task: string;
    success: boolean;
    findings: ParsedFinding[];
    actions_taken: ActionTaken[];
    duration_ms: number;
    error?: string;
  }

  interface ActionTaken {
    type: "issue_created" | "pr_created" | "comment_posted";
    url: string;
    description: string;
  }
  ```
- **Input contract:** `AnalyzerContext` with `trigger: "merge"`, `sha`, and `diff`
- **Output contract:** `AnalyzerResult` with findings and actions taken
- **Error contract:** Errors caught internally — returns `{ success: false, error }`, never throws

### Dependencies
- **Depends on:** Copilot SDK (invoke guardians), GitHub (get diff, post comment), Result Parser (parse reports), State (record findings)
- **Consumed by:** Core MCP Server (via `craig_run_task`), Merge Watcher (on merge event)
- **Rule:** Each analyzer is independently deployable — removing one doesn't break others

### Rewritability Check
- [x] Can this component be rewritten without changing any other component?
- [x] Are the interfaces stable enough that tests would survive a rewrite?
- [x] Is the data model owned by this component?

## 3. Audience & Personas
- **Primary:** Developers who see review comments on their merge commits
- **Scale:** 2-10 merges per day per repo

## 4. Functional Requirements
### Acceptance Criteria (Given/When/Then)

**AC1: Full merge review flow**
- Given a new merge to main with SHA "abc123"
- When the merge review analyzer executes
- Then it: (1) gets the merge diff via GitHub, (2) invokes Security Guardian with the diff, (3) invokes Code Review Guardian with the diff, (4) parses both reports, (5) posts a combined review comment on the merge commit

**AC2: Review comment format**
- Given Security Guardian found 2 issues and Code Review Guardian found 3 issues
- When the review comment is posted
- Then it follows this format:
  ```
  ## 🤖 Craig — Merge Review
  **Commit:** abc123 | **Reviewed by:** Security Guardian, Code Review Guardian

  ### Security Findings (2)
  | Severity | Issue | File | Fix |
  ...

  ### Code Review Findings (3)
  | Severity | Issue | File | Fix |
  ...

  ### Summary
  - 🔴 0 critical | 🟠 1 high | 🟡 3 medium | 🔵 1 low
  ```

**AC3: Create issues for critical/high findings**
- Given the review finds 1 CRITICAL and 1 HIGH finding
- When findings are processed
- Then GitHub issues are created for each (after checking for duplicates)

**AC4: No findings**
- Given the merge has no issues
- When review completes
- Then a brief "✅ No issues found" comment is posted

**AC5: Guardian timeout**
- Given Security Guardian times out
- When the review continues
- Then Code Review Guardian results are still posted, with a note: "⚠️ Security Guardian timed out — run manually with `craig run security_scan`"

### Edge Cases
- Very large diff (> 10,000 lines) → Truncate to first 5,000 lines, note truncation
- Both guardians fail → Post error comment, create incident issue

## 5. Non-Functional Requirements
- **Performance:** Complete within 5 minutes of merge detection (spec SLO)

## 6. API Design
N/A — implements `Analyzer` interface.

## 7. Security Considerations
- Review comments may contain file paths and code snippets — acceptable, it's the repo owner's content

## 8. Observability
### Metrics
- Merges reviewed per day, review duration, findings per merge

### SLIs / SLOs
| SLI | Target (SLO) | Window |
|-----|-------------|--------|
| Merge review completion | 99% within 5 min | 30 days |

## 9. Data Model & Storage
- Findings stored via State component. No direct storage.

## 10. Dependencies & Impacts
- **Upstream:** Merge Watcher (trigger), Copilot SDK (invoke), GitHub (diff + comment), Result Parser (parse)
- **Downstream:** State (findings), GitHub (issues for critical/high)

## 11. Out of Scope
- QA Guardian invocation on merge (future — currently only Security + Code Review)
- Pattern enforcement on merge (handled by separate pattern analyzer)

## 12. Open Questions
- [ ] Should Security and Code Review guardians run sequentially or in parallel?
- [ ] Should Craig skip review of its own `craig/fix-*` branch merges?

## 13. Research Findings
### Internal
- Spec AC1: Security + Code Review Guardian on merge diff, post review comment
- Security Guardian report format: `## Security Guardian Report` + findings table
- Code Review Guardian report format: `## Code Review Guardian Report` + metrics + findings table

## 14. Testing Strategy
- **Unit tests:** Mock all deps — full flow, comment formatting, duplicate detection, timeout handling, no-findings case
- **Integration tests:** Invoke with a real diff against test repo
- **E2E tests:** Merge to test repo → Craig detects → review comment appears
- **Edge cases:** Large diff, both guardians fail, empty diff

**Suggested labels:** `component:analyzer`, `analyzer:merge-review`, `layer:analyzer`, `priority:high`, `sprint:3`

---

## Issue 10 of 16

# Craig: Analyzer — Security Scanner (Scheduled Full-Repo Scan)

## 1. User Story
As a **development team**,
I want Craig to run a full Security Guardian scan of the repository on schedule,
so that newly discovered vulnerabilities (CVEs, OWASP issues) are caught even without code changes.

## 2. Component Design (Rewritable by Design)
### Component Boundary
- **Component name:** `analyzer-security-scan`
- **Boundary:** Invokes Security Guardian on the full repository (not just a diff). Parses results. Creates GitHub issues for CRITICAL and HIGH findings. Implements `Analyzer` interface.
- **New or existing:** New component at `craig/src/analyzers/security-scan/`

### Interface Contract
- Same `Analyzer` interface as Issue #9.
- **Input:** `AnalyzerContext` with `trigger: "schedule" | "manual"`
- **Output:** `AnalyzerResult` with findings and created issues

### Dependencies
- **Depends on:** Copilot SDK (invoke Security Guardian), GitHub (create issues), Result Parser, State
- **Consumed by:** Core MCP Server, Scheduler

## 3. Audience & Personas
- **Primary:** Development team receiving security issue notifications
- **Scale:** 1 scan per day (or on-demand via MCP tool)

## 4. Functional Requirements
### Acceptance Criteria (Given/When/Then)

**AC1: Full repo security scan**
- Given a scheduled trigger fires
- When the security analyzer executes
- Then it invokes Security Guardian with prompt "Run a full security review of this repository: Semgrep, Gitleaks, Trivy, dependency audit. Report all findings."

**AC2: Issue creation for critical/high**
- Given the scan finds 2 CRITICAL and 1 HIGH finding
- When results are processed
- Then 3 GitHub issues are created with labels `["craig", "security", "critical"]` or `["craig", "security", "high"]`, after duplicate checking

**AC3: Issue body contains Guardian output**
- Given a finding: "SQL injection in src/db.py:42"
- When the issue is created
- Then the issue body contains: severity, OWASP category, file/line, description, justification, and suggested fix — all from the Guardian report

**AC4: Skip duplicate findings**
- Given an open issue "🔴 Security: SQL injection in src/db.py" already exists
- When the same finding appears in a new scan
- Then no duplicate issue is created

### Edge Cases
- Guardian returns zero findings → Log "clean scan", no issues created
- Guardian times out → Record in state as failed, create incident issue if 3 consecutive failures

## 5–14. (Abbreviated — same patterns as Issue #9)

**Suggested labels:** `component:analyzer`, `analyzer:security-scan`, `layer:analyzer`, `priority:high`, `sprint:3`

---

## Issue 11 of 16

# Craig: Analyzer — Coverage Gap Scanner

## 1. User Story
As a **development team**,
I want Craig to identify untested code paths and missing edge cases daily,
so that test coverage gaps are tracked as actionable GitHub issues before they cause production bugs.

## 2. Component Design (Rewritable by Design)
### Component Boundary
- **Component name:** `analyzer-coverage-scan`
- **Boundary:** Invokes QA Guardian in coverage analysis mode. Parses coverage gap findings. Creates GitHub issues for each gap with acceptance criteria. Implements `Analyzer` interface.
- **New or existing:** New component at `craig/src/analyzers/coverage-scan/`

### Interface Contract
- Same `Analyzer` interface as Issue #9.
- **Input:** `AnalyzerContext` with `trigger: "schedule" | "manual"`
- **Output:** `AnalyzerResult` with coverage gaps as findings

### Dependencies
- **Depends on:** Copilot SDK (invoke QA Guardian), GitHub (create issues), Result Parser, State
- **Consumed by:** Core MCP Server, Scheduler

## 4. Functional Requirements
### Acceptance Criteria (Given/When/Then)

**AC1: Identify coverage gaps**
- Given a daily scheduled trigger
- When the coverage analyzer executes
- Then it invokes QA Guardian with prompt "Analyze this repository for test coverage gaps. Identify untested code paths, missing edge cases, and functions without tests."

**AC2: Issues include acceptance criteria**
- Given QA Guardian identifies "No tests for error paths in /upload endpoint"
- When the issue is created
- Then the issue body includes suggested Given/When/Then acceptance criteria for the missing tests

**AC3: No test framework detected**
- Given the repository has no test files or test framework configured
- When the coverage analyzer runs
- Then it creates a single issue: "Setup test framework" with recommendations per the detected language

### Edge Cases
- Repository with 100% coverage → No issues created, log "full coverage"

**Suggested labels:** `component:analyzer`, `analyzer:coverage-scan`, `layer:analyzer`, `priority:medium`, `sprint:3`

---

## Issue 12 of 16

# Craig: Analyzer — Tech Debt Auditor

## 1. User Story
As a **development team**,
I want Craig to audit the repository weekly for tech debt (missing docs, stale dependencies, TODO comments, incomplete specs),
so that technical debt is cataloged and prioritized as GitHub issues before it compounds.

## 2. Component Design (Rewritable by Design)
### Component Boundary
- **Component name:** `analyzer-tech-debt`
- **Boundary:** Invokes PO Guardian in audit mode. Parses the project health audit results. Creates GitHub issues organized by category with priority. Implements `Analyzer` interface.
- **New or existing:** New component at `craig/src/analyzers/tech-debt/`

### Interface Contract
- Same `Analyzer` interface as Issue #9.

### Dependencies
- **Depends on:** Copilot SDK (invoke PO Guardian), GitHub (create issues), Result Parser, State

## 4. Functional Requirements
### Acceptance Criteria (Given/When/Then)

**AC1: Weekly tech debt audit**
- Given the weekly schedule fires (Monday 9 AM)
- When the tech debt analyzer executes
- Then it invokes PO Guardian with prompt "Audit this project. Check for missing docs, stale dependencies, TODO comments, incomplete specs. Run the full 25-item project health checklist."

**AC2: Categorized issues**
- Given PO Guardian finds 5 gaps across 3 categories
- When issues are created
- Then each issue has a category label: `docs`, `dependencies`, `process`, etc.

**AC3: Priority mapping**
- Given PO Guardian reports gaps with criticality ratings
- When issues are created
- Then critical gaps → `priority:high` label, medium gaps → `priority:medium`, nice-to-have → `priority:low`

**Suggested labels:** `component:analyzer`, `analyzer:tech-debt`, `layer:analyzer`, `priority:medium`, `sprint:3`

---

## Issue 13 of 16

# Craig: Analyzer — Dependency Health Checker

## 1. User Story
As a **development team**,
I want Craig to detect outdated and vulnerable dependencies weekly and create upgrade PRs,
so that dependency rot is addressed proactively with tested upgrade paths.

## 2. Component Design (Rewritable by Design)
### Component Boundary
- **Component name:** `analyzer-dependency-check`
- **Boundary:** Checks for outdated/vulnerable dependencies using native package manager audit commands (`npm audit`, `pip-audit`, `cargo audit`). Creates upgrade draft PRs with updated lockfiles. Implements `Analyzer` interface.
- **New or existing:** New component at `craig/src/analyzers/dependency-check/`

### Interface Contract
- Same `Analyzer` interface as Issue #9.
- **Additional output:** May create draft PRs (not just issues)

### Dependencies
- **Depends on:** GitHub (create PRs, create issues), State, Config
- **Consumed by:** Core MCP Server, Scheduler
- **Note:** This analyzer may NOT need Copilot SDK — it can run `npm audit`, `pip-audit`, etc. directly

## 4. Functional Requirements
### Acceptance Criteria (Given/When/Then)

**AC1: Detect vulnerable dependencies**
- Given the repo has a `package.json` with a known vulnerable dependency
- When the dependency checker runs
- Then it creates a GitHub issue with the vulnerability details (CVE, severity, affected package, fixed version)

**AC2: Create upgrade PR**
- Given an outdated dependency with a safe upgrade path
- When Craig creates the upgrade
- Then a draft PR is created on branch `craig/deps-update-YYYY-MM-DD` with updated lockfile and a body explaining what was updated and why

**AC3: Run tests in PR**
- Given a dependency upgrade PR is created
- When CI runs on the PR
- Then the PR body notes: "⚠️ Review CI results before merging — tests validate the upgrade"

**AC4: Detect package manager**
- Given a repo with `package.json` → npm, `requirements.txt`/`pyproject.toml` → pip, `Cargo.toml` → cargo
- When the dependency checker runs
- Then it uses the correct audit tool for the detected package manager

### Edge Cases
- No package manager detected → Skip with "no dependencies found" log
- Multiple package managers in repo → Run all applicable audits

**Suggested labels:** `component:analyzer`, `analyzer:dependency-check`, `layer:analyzer`, `priority:medium`, `sprint:4`

---

## Issue 14 of 16

# Craig: Analyzer — Pattern Learner & Enforcer

## 1. User Story
As a **development team**,
I want Craig to learn the repository's coding patterns (naming, structure, error handling, imports) and flag deviations in new merges,
so that codebase consistency is maintained as the team and codebase grow.

## 2. Component Design (Rewritable by Design)
### Component Boundary
- **Component name:** `analyzer-pattern-check`
- **Boundary:** Learns repository conventions by analyzing existing code. Stores learned patterns in `.craig-patterns.json`. On merge, compares new code against patterns and flags deviations. Implements `Analyzer` interface.
- **New or existing:** New component at `craig/src/analyzers/pattern-check/`

### Interface Contract
- Same `Analyzer` interface as Issue #9.
- **Additional port:**
  ```typescript
  interface PatternStore {
    learn(repoPath: string): Promise<PatternSet>;
    load(): Promise<PatternSet>;
    save(patterns: PatternSet): Promise<void>;
  }

  interface PatternSet {
    naming_conventions: PatternRule[];
    file_structure: PatternRule[];
    error_handling: PatternRule[];
    import_conventions: PatternRule[];
    learned_at: string;
  }
  ```

### Dependencies
- **Depends on:** Copilot SDK (invoke Code Review Guardian for pattern analysis), GitHub (get diff), State, filesystem (`.craig-patterns.json`)
- **Consumed by:** Core MCP Server, Merge Watcher

## 4. Functional Requirements
### Acceptance Criteria (Given/When/Then)

**AC1: Learn patterns from repo**
- Given a repository with established code patterns
- When `patternStore.learn(repoPath)` is called (initial setup or periodic refresh)
- Then it analyzes the codebase and stores naming conventions, file structure patterns, error handling patterns, and import conventions in `.craig-patterns.json`

**AC2: Flag deviations on merge**
- Given learned patterns include "error handling uses Result type" and a new merge uses try/catch
- When the pattern analyzer runs on the merge diff
- Then it flags the deviation: "Pattern deviation: repo uses Result<T,E> for error handling (15/18 files). This merge uses try/catch."

**AC3: Include deviations in merge review**
- Given pattern deviations are found
- When the merge review comment is composed
- Then pattern findings are included in the review comment alongside Security and Code Review findings

### Edge Cases
- No learned patterns yet → Skip pattern check, log "run `craig_run_task pattern_check` to learn patterns first"
- Patterns file corrupted → Re-learn from repo

**Suggested labels:** `component:analyzer`, `analyzer:pattern-check`, `layer:analyzer`, `priority:low`, `sprint:4`

---

## Issue 15 of 16

# Craig: Analyzer — Auto-Fix (Lint Fix + Draft PR)

## 1. User Story
As a **development team**,
I want Craig to automatically fix simple linting and formatting issues detected post-merge and submit them as draft PRs,
so that trivial code quality issues are resolved without developer time, while still requiring human review.

## 2. Component Design (Rewritable by Design)
### Component Boundary
- **Component name:** `analyzer-auto-fix`
- **Boundary:** Detects auto-fixable linting/formatting issues. Runs fix commands (`eslint --fix`, `ruff --fix`, `cargo clippy --fix`). Creates a `craig/fix-*` branch. Opens a draft PR. Implements `Analyzer` interface.
- **New or existing:** New component at `craig/src/analyzers/auto-fix/`

### Interface Contract
- Same `Analyzer` interface as Issue #9.
- **Output:** Draft PR URL in `actions_taken`

### Dependencies
- **Depends on:** GitHub (create branch, commit, create draft PR), Config (`capabilities.auto_fix`), State

## 4. Functional Requirements
### Acceptance Criteria (Given/When/Then)

**AC1: Auto-fix linting issues**
- Given a post-merge scan detects 5 auto-fixable ESLint issues
- When the auto-fix analyzer runs
- Then it: (1) creates branch `craig/fix-lint-YYYY-MM-DD`, (2) runs `eslint --fix`, (3) commits changes, (4) pushes branch, (5) opens a draft PR

**AC2: PR description explains changes**
- Given the auto-fix created a PR
- When a developer opens the PR
- Then the description includes: what was fixed, which linter, which rules, and Craig's rationale

**AC3: Disabled by config**
- Given `capabilities.auto_fix: false` in config
- When auto-fix is triggered
- Then it skips execution and logs "auto-fix disabled by config"

**AC4: No fixable issues**
- Given `eslint --fix` reports no changes
- When auto-fix runs
- Then no branch or PR is created

### Edge Cases
- Fix introduces new issues → Run linter again after fix, abort PR if new issues found
- Multiple languages in repo → Run applicable fixers sequentially, combine into one PR

**Suggested labels:** `component:analyzer`, `analyzer:auto-fix`, `layer:analyzer`, `priority:low`, `sprint:4`

---

## Issue 16 of 16

# Craig: Daily Digest Reporter

## 1. User Story
As an **engineering team lead**,
I want Craig to publish a daily digest summarizing all its activity (merges reviewed, issues created, PRs opened, findings by severity),
so that I have a single-glance view of repository health and Craig's contributions each day.

## 2. Component Design (Rewritable by Design)
### Component Boundary
- **Component name:** `digest`
- **Boundary:** Compiles daily/weekly/monthly summaries from State data. Creates or updates a GitHub issue (or comment) with the digest. Does NOT generate findings — only aggregates existing data.
- **New or existing:** New component at `craig/src/digest/`

### Interface Contract
- **Ports (interfaces):**
  ```typescript
  interface DigestPort {
    generate(period: "today" | "week" | "month"): Promise<DigestReport>;
    publish(report: DigestReport): Promise<{ url: string }>;
  }

  interface DigestReport {
    period: string;
    period_start: string;
    period_end: string;
    merges_reviewed: number;
    issues_created: number;
    prs_opened: number;
    findings_by_severity: Record<string, number>;
    top_findings: ParsedFinding[];  // top 5 by severity
    guardian_invocations: Record<string, number>;
    failures: string[];             // tasks that failed
  }
  ```
- **Input contract:** Period type + State data
- **Output contract:** `DigestReport` object + published GitHub issue/comment URL
- **Error contract:** If State has no data for the period → generate empty digest, don't error

### Dependencies
- **Depends on:** State (daily_stats, findings), GitHub (create/update issue)
- **Consumed by:** Core MCP Server (via `craig_digest` tool), Scheduler (end-of-day trigger)

## 4. Functional Requirements
### Acceptance Criteria (Given/When/Then)

**AC1: Generate daily digest**
- Given Craig reviewed 5 merges, created 3 issues, and opened 1 PR today
- When `digest.generate("today")` is called
- Then it returns a `DigestReport` with accurate counts

**AC2: Publish as GitHub issue**
- Given a generated digest report
- When `digest.publish(report)` is called
- Then a GitHub issue is created with title "📊 Craig Daily Digest — 2025-07-11" and labeled `["craig", "digest"]`

**AC3: Update existing digest**
- Given a daily digest issue already exists for today
- When a new digest is published
- Then the existing issue is updated (comment added) instead of creating a duplicate

**AC4: Weekly aggregation**
- Given `digest.generate("week")` is called
- When data spans Mon-Sun
- Then all 7 days' stats are aggregated

**AC5: Digest markdown format**
```markdown
# 📊 Craig Daily Digest — 2025-07-11

## Activity
| Metric | Count |
|--------|-------|
| Merges reviewed | 5 |
| Issues created | 3 |
| Draft PRs opened | 1 |
| Guardian invocations | 12 |

## Findings by Severity
| 🔴 Critical | 🟠 High | 🟡 Medium | 🔵 Low |
|-------------|---------|-----------|--------|
| 0 | 2 | 5 | 8 |

## Top Findings
1. 🟠 **HIGH** — SQL injection in src/db.py:42 (Security Guardian)
2. 🟠 **HIGH** — SRP violation in api.ts:120 (Code Review Guardian)

## Failures
- ⚠️ Security Guardian timed out at 14:32 UTC
```

### Edge Cases
- No activity for the day → Publish digest with all zeros: "Craig monitored the repo — no issues detected. ✅"
- Craig was down for part of the day → Include "⚠️ Craig was unavailable from X to Y" note

## 5. Non-Functional Requirements
- **Performance:** Digest generation < 5 seconds (aggregating in-memory state)

## 6–8. N/A — follows same patterns as other components.

## 9. Data Model & Storage
- Reads from State component. Publishes to GitHub Issues.

## 10. Dependencies & Impacts
- **Upstream:** State (all activity data)
- **Downstream:** GitHub (issue creation)
- **Third-party:** None

## 11. Out of Scope
- Slack/Teams notifications — future
- Email digest — future
- Trend charts/graphs — future (use GitHub Projects board instead)

## 12. Open Questions
- [ ] Should the digest be a GitHub issue, a GitHub Discussion, or a commit to a markdown file in the repo?
- [ ] Should the weekly digest include day-by-day breakdown or just totals?

## 13. Research Findings
### Internal
- Spec AC8: "creates or updates a daily digest issue/comment"
- Spec: "summarizes: merges reviewed, issues created, PRs opened, findings by severity"
- `craig_digest` MCP tool returns: `{ merges_reviewed, issues_created, prs_opened, findings_by_severity }`

## 14. Testing Strategy
- **Unit tests:** Generate with sample state data, empty day, weekly aggregation, markdown formatting
- **Integration tests:** Publish to test repo, update existing issue
- **Edge cases:** No activity, partial day, missing state data

**Suggested labels:** `component:digest`, `layer:reporting`, `priority:medium`, `sprint:4`

---

## Product Owner Guardian — Tickets Ready

### Summary

| # | Component | Layer | Sprint | Priority | Depends On |
|---|-----------|-------|--------|----------|------------|
| 1 | Config — YAML Loader | Foundation | 1 | High | — |
| 2 | State Management | Foundation | 1 | High | — |
| 3 | Result Parser | Foundation | 1 | High | — |
| 4 | GitHub Integration | Infrastructure | 1 | High | #1 |
| 5 | Copilot SDK Integration | Infrastructure | 1 | High | #1 |
| 6 | Core MCP Server | Core | 2 | Critical | #1, #2, #4, #5 |
| 7 | Merge Watcher | Background | 2 | High | #1, #2, #4 |
| 8 | Scheduler | Background | 2 | High | #1 |
| 9 | Analyzer: Merge Review | Analyzer | 3 | High | #3, #4, #5 |
| 10 | Analyzer: Security Scanner | Analyzer | 3 | High | #3, #4, #5 |
| 11 | Analyzer: Coverage Gap Scanner | Analyzer | 3 | Medium | #3, #4, #5 |
| 12 | Analyzer: Tech Debt Auditor | Analyzer | 3 | Medium | #3, #4, #5 |
| 13 | Analyzer: Dependency Health | Analyzer | 4 | Medium | #4 |
| 14 | Analyzer: Pattern Learner | Analyzer | 4 | Low | #3, #4, #5 |
| 15 | Analyzer: Auto-Fix | Analyzer | 4 | Low | #4 |
| 16 | Daily Digest Reporter | Reporting | 4 | Medium | #2, #4 |

### INVEST Verification

| Criterion | Assessment |
|-----------|-----------|
| **Independent** | ✅ Foundation components (#1-5) have no internal deps. All analyzers (#9-15) share the same interface and can be built in any order. |
| **Negotiable** | ✅ Interface contracts are defined but implementation is flexible (e.g., GitHub component could use `gh` CLI instead of octokit). |
| **Valuable** | ✅ Each component delivers identifiable value — even partial Craig (Core + Merge Watcher + Merge Review) is useful. |
| **Estimable** | ✅ Foundation components: 1-2 days each. Infrastructure: 2-3 days. Core: 3 days. Analyzers: 1-2 days each. |
| **Small** | ✅ All components fit in one sprint. No component exceeds 3 days of effort. |
| **Testable** | ✅ Every component has Given/When/Then acceptance criteria and a testing strategy. |

### Key Architecture Decisions

1. **Shared `Analyzer` interface** — All 7 analyzers implement the same interface (`execute(context) → result`). This means:
   - New analyzers can be added without changing Core
   - Any analyzer can be removed without affecting others
   - Analyzers are independently testable

2. **Thin MCP tool handlers** — Core is just wiring. All logic lives in the delegated components. This keeps the MCP server simple and the components rewritable.

3. **Result Parser as pure function** — No I/O, no state. Takes markdown string in, returns structured object out. Easiest component to test and rewrite.

4. **State as the single source of truth** — All components read/write state through `StatePort`. No component maintains its own persistent state.

### For the Default Agent

The 16 tickets above are complete and ready to be created as GitHub issues.

1. Create an **epic issue** titled "Craig — Autonomous AI Developer (MVP)" linking all 16 sub-issues
2. Create each issue with the title, body, and suggested labels
3. Add milestone labels by sprint: `sprint:1`, `sprint:2`, `sprint:3`, `sprint:4`
4. Add the shared `Analyzer` interface definition to a pinned architectural issue or ADR
5. The dependency graph above determines build order — Sprint 1 components MUST be complete before Sprint 2 begins