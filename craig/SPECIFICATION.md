# Craig — Autonomous AI Developer

## 1. User Story
As a **software engineering team**,
we want an **autonomous AI agent that continuously monitors our repository, reviews code, detects issues, and creates tickets/PRs**,
so that **quality, security, and consistency are enforced 24/7 without human initiation**.

## 2. Component Design (Rewritable by Design)

### Component Boundary
- **Component name:** Craig
- **Boundary:** Standalone Node.js application. Consumes GitHub API and Copilot SDK. Does NOT modify the Guardian agent definitions — uses them as-is.
- **New or existing:** New project, separate from `sdlc-guardian-agents`

### Interface Contract
- **Input:** GitHub repository events (merges, PRs), cron schedule triggers
- **Output:** GitHub issues, draft PRs, review comments, daily digest reports
- **Configuration:** `craig.config.yaml` per repo
- **Error contract:** Failures logged, never silently swallowed. Failed tasks retry once, then create an incident issue.

### Dependencies
- **Depends on:** `@github/copilot-sdk` (JSON-RPC), GitHub API (`@octokit/rest`), SDLC Guardian agents (installed at `~/.copilot/`)
- **Consumed by:** Human developers who review Craig's output (issues, draft PRs, comments)
- **Rule:** Craig never merges its own PRs. A human always approves.

### Rewritability Check
- [x] Each analyzer (coverage, tech-debt, deps, patterns) is an independent component with a defined interface
- [x] The Copilot SDK session management is isolated from business logic
- [x] GitHub API interactions are behind an interface (can swap `@octokit` for `gh` CLI)

## 3. Audience & Personas
- **Primary:** Development teams using GitHub + Copilot CLI who want continuous code health monitoring
- **Secondary:** Engineering managers who want visibility into repo health trends
- **Skill level:** Technical — installed by a developer, output reviewed by developers
- **Scale:** One instance per repository. Multiple repos = multiple Craig instances.

## 4. Functional Requirements

### Acceptance Criteria

**AC1: Merge Monitoring**
- Given a new merge to main
- When Craig detects the merge (polling or webhook)
- Then it invokes Security Guardian + Code Review Guardian on the merge diff
- And posts a review comment on the merge commit with findings

**AC2: Test Coverage Gaps**
- Given a scheduled scan trigger (daily)
- When Craig invokes QA Guardian on the repository
- Then it identifies untested code paths and missing edge cases
- And creates GitHub issues for each gap with acceptance criteria

**AC3: Bug Detection**
- Given a post-merge or scheduled trigger
- When Craig runs Security Guardian scans (Semgrep, Gitleaks, Trivy)
- Then it classifies findings by OWASP category and severity
- And creates issues for CRITICAL and HIGH findings

**AC4: Pattern Enforcement**
- Given a new merge to main
- When Craig compares the new code against learned repo patterns
- Then it flags deviations in naming, structure, error handling, imports
- And includes the deviation in the merge review comment

**AC5: PO Audit — Tech Debt & Docs**
- Given a scheduled trigger (weekly)
- When Craig invokes PO Guardian in audit mode
- Then it scans for: missing docs, stale deps, TODO comments, incomplete specs
- And creates issues organized by category with priority

**AC6: Auto-Fix Simple Issues**
- Given a linting/formatting issue detected post-merge
- When Craig can auto-fix it (eslint --fix, ruff --fix, cargo clippy --fix)
- Then it creates a draft PR with the fix on a `craig/fix-*` branch
- And the PR description explains what was fixed and why

**AC7: Dependency Updates**
- Given a scheduled trigger (weekly)
- When Craig detects outdated or vulnerable dependencies
- Then it creates an upgrade PR with updated lockfiles
- And runs the test suite to validate the upgrade
- And marks the PR as draft for human review

**AC8: Daily Digest**
- Given the end of a day with Craig activity
- When Craig compiles its actions for the day
- Then it creates or updates a daily digest issue/comment
- And summarizes: merges reviewed, issues created, PRs opened, findings by severity

### Edge Cases
- What if Copilot SDK session fails? → Retry once, then log and create incident issue
- What if a Guardian agent times out? → Record timeout in daily digest, skip that check
- What if Craig creates a duplicate issue? → Check existing open issues before creating
- What if the repo has no tests? → Coverage scanner reports "no test framework detected" and creates a setup ticket

## 5. Non-Functional Requirements
- **Performance:** Merge review should complete within 5 minutes of merge detection
- **Scalability:** One instance per repo; designed for repos up to 100k LOC
- **Reliability:** Process crashes should auto-restart (PM2 or systemd); no data loss
- **Resource usage:** Should run on a small VM or developer machine (< 512MB RAM idle)

## 6. API Design

Craig is not an API service — it's a daemon. Configuration is via YAML:

```yaml
# craig.config.yaml
repo: owner/repo-name
branch: main

schedule:
  merge_monitor: on_push          # poll interval: 60s
  coverage_scan: "0 8 * * *"     # daily 8am
  tech_debt_audit: "0 9 * * 1"  # weekly Monday 9am
  dependency_check: "0 10 * * 1" # weekly Monday 10am

capabilities:
  merge_review: true
  coverage_gaps: true
  bug_detection: true
  pattern_enforcement: true
  po_audit: true
  auto_fix: true
  dependency_updates: true

models:
  code_review: ["claude-opus-4.6", "gpt-5.4"]
  security: "claude-opus-4.6"
  default: "claude-sonnet-4.5"

autonomy:
  create_issues: true
  create_draft_prs: true
  auto_merge: false               # NEVER

guardians:
  path: ~/.copilot/
```

## 7. Security Considerations
- **Authentication:** GitHub token with repo, issues, pull_requests scopes. Stored as environment variable, not in config.
- **Authorization:** Craig operates under the token owner's permissions. Should use a dedicated bot account.
- **Data sensitivity:** Craig reads all source code. Token must be treated as a secret.
- **OWASP references:** [OWASP-A04] — no secrets in config files or logs
- **Rate limiting:** Respect GitHub API rate limits (5000 req/hour). Queue requests if approaching limit.

## 8. Observability

### Metrics
- Merges reviewed per day
- Issues created per day/week
- Draft PRs opened
- Findings by severity (critical/high/medium/low)
- Guardian agent invocation count and duration
- Copilot SDK session success/failure rate

### SLIs / SLOs
| SLI | Target (SLO) | Window |
|-----|-------------|--------|
| Merge review completion rate | 99% of merges reviewed within 5 min | 30 days |
| Guardian agent success rate | 95% of invocations succeed | 30 days |
| Uptime | 99% process uptime | 30 days |

### Alerts
- Craig process down for > 5 minutes
- GitHub API rate limit reached
- Copilot SDK session failures > 3 consecutive
- Guardian agent timeout

## 9. Data Model & Storage
- **No database required** for MVP — state tracked via GitHub issues/PRs
- **Last processed commit SHA** stored in a local file (`.craig-state.json`)
- **Pattern knowledge** stored as learned conventions file (`.craig-patterns.json`)
- Future: SQLite for history and trend analysis

## 10. Dependencies & Impacts
- **Upstream:** GitHub API, `@github/copilot-sdk`, Copilot CLI (must be installed)
- **Downstream:** Development team (reviews Craig's output)
- **Third-party:** `@octokit/rest`, `node-cron`, `yaml` parser
- **Team coordination:** None — Craig runs independently

## 11. Out of Scope
- Multi-repo monitoring (future — one Craig per repo for now)
- Auto-merging PRs (always draft, always human-reviewed)
- Slack/Teams notifications (future — GitHub issues/comments only for now)
- Web dashboard (future — use GitHub issues/projects for now)
- Custom LLM integration beyond Copilot SDK

## 12. Open Questions
- [ ] Does `@github/copilot-sdk` support invoking custom agents by name, or only via prompt?
- [ ] What's the polling interval for merge detection without webhooks?
- [ ] Should Craig have its own GitHub App identity, or use a PAT?
- [ ] How to handle repos with monorepo structure (multiple projects in one repo)?

## 13. Research Findings

### Internal
- `@github/copilot-sdk` v0.1.32 — TypeScript SDK, JSON-RPC to Copilot CLI, depends on `vscode-jsonrpc`, `zod`, `@github/copilot`
- SDLC Guardian Agents already define all review, security, QA, and PO logic — Craig orchestrates them
- Copilot CLI supports `-p` flag for non-interactive mode

### External
- Similar: [Sweep AI](https://sweep.dev/), [CodeRabbit](https://coderabbit.ai/), [Sourcery](https://sourcery.ai/) — but Craig uses YOUR Guardian agents with YOUR standards
- `@github/copilot-sdk` is the official way to control Copilot programmatically

## 14. Testing Strategy
- **Unit tests:** Config parser, result parser, pattern matcher, duplicate detector
- **Integration tests:** Copilot SDK session lifecycle, GitHub API issue/PR creation
- **E2E tests:** Full flow: mock merge → Craig detects → invokes Guardian → creates issue
- **Edge cases:** API rate limit, SDK timeout, duplicate issue prevention, empty repo
- **Performance tests:** Time to review a merge (target < 5 min for 500-line diff)
