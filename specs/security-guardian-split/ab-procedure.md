# A/B Comparison Procedure — Monolith vs. Coordinator/Sub-Guardian Split

> **Purpose:** Repeatable steps to compare the monolithic Security Guardian (on `main`) against the new coordinator + 5 sub-Guardian architecture (on `feature/security-guardian-split`) for the success criteria in the spec (SC-001 through SC-008).
>
> **Owner:** Project owner (vbomfim) runs comparisons manually — no automated A/B harness exists. This document is the script.
>
> **Spec reference:** FR-019, FR-020, SC-001 through SC-008 in `specs/security-guardian-split/spec.md`.

## Prerequisites

- Both branches checked out as worktrees side-by-side
- `package.sh` install completed for both (each into its own `~/.copilot/` snapshot — see §Setup)
- A diverse set of test inputs (≥10) — real PRs, branches with known issues, synthetic test cases
- Quiet day: no other Guardian work in flight that would consume context budget

## Setup — Two installations

The two architectures live in separate branches, so we can't have both installed at the same `~/.copilot/` path. Use `HOME` redirection to swap installations, OR maintain two snapshot directories and rsync between them.

### Option A — `HOME` redirection (recommended, cleanest)

```bash
# Set up two snapshot dirs (one-time)
mkdir -p ~/sg-monolith
mkdir -p ~/sg-coordinator

# Install monolith snapshot
cd ~/dev/sdlc-guardian-agents
git checkout main
HOME=~/sg-monolith bash package.sh --install

# Install coordinator snapshot
git checkout feature/security-guardian-split
HOME=~/sg-coordinator bash package.sh --install

# Verify both snapshots have the right files
ls ~/sg-monolith/.copilot/agents/security*.md
# Expect: security-guardian.agent.md (820 lines)

ls ~/sg-coordinator/.copilot/agents/security*.md
ls ~/sg-coordinator/.copilot/agents/security/
# Expect: 1 coordinator + 5 sub-Guardian files + 1 schema = 7 files total
```

To run a Copilot CLI session against a specific snapshot:

```bash
HOME=~/sg-monolith    copilot   # uses monolith installation
HOME=~/sg-coordinator copilot   # uses coordinator installation
```

### Option B — `rsync` swap

If `HOME` redirection isn't viable in your shell setup:

```bash
# Save current installation
cp -r ~/.copilot ~/.copilot.backup

# Switch to monolith
rsync -a --delete ~/sg-monolith/.copilot/ ~/.copilot/

# ... run review ...

# Switch to coordinator
rsync -a --delete ~/sg-coordinator/.copilot/ ~/.copilot/

# ... run review ...

# Restore
rsync -a --delete ~/.copilot.backup/ ~/.copilot/
```

Less ideal — risks polluting your live installation if a step fails.

## Running a single comparison

For each test input (PR / branch / synthetic case):

### Step 1 — Capture input

Note in your comparison log:
- Source: `repo/owner` + PR number / branch name / commit SHA
- Brief description (e.g., "Auth refactor — adds JWT validation, removes hardcoded admin token")
- Approximate diff size (lines changed)
- Domains expected to surface findings (manual estimate: AppSec? Secrets? IaC?)

### Step 2 — Run monolith review

```bash
HOME=~/sg-monolith copilot
```

In the session:
- Invoke "Security Guardian, please review [PR/branch/files]"
- Capture the full output (verbatim Guardian report from the orchestrator)
- Capture wall-clock time (start to report received)
- Capture token cost if available (Copilot CLI's session_store records this)

Save the report to `comparison-runs/<run-id>/monolith.md`.

### Step 3 — Run coordinator review

```bash
HOME=~/sg-coordinator copilot
```

Same prompt, same input. Capture the same metrics. Save to `comparison-runs/<run-id>/coordinator.md`.

### Step 4 — Diff and score

For each comparison, manually score:

| Metric | Monolith | Coordinator | Notes |
|---|---|---|---|
| Critical findings | N | N | List delta |
| High findings | N | N | List delta |
| Medium findings | N | N | List delta |
| Low + Info findings | N | N | (noise tracking) |
| Wall-clock time | s | s | (latency, SC-003) |
| Tokens used | N | N | (cost, SC-004) |
| OWASP categories covered | A0X, A0X | A0X, A0X | (SC-005 — gaps?) |
| Cross-domain findings | N | N | (only coordinator can produce these — qualitative quality check) |

**Coverage parity check (SC-001):** for each CRITICAL/HIGH finding on the monolith side, is there an equivalent finding on the coordinator side?
- ✅ Match (same file, same root cause)
- ⚠️ Different finding for the same root cause (note phrasing/severity drift)
- ❌ Missing (regression — must be addressed before deprecation)

**Noise check (SC-002):** count LOW and INFO findings on each side. Coordinator should be ≤ monolith × 1.20.

### Step 5 — Record in comparison log

Maintain a markdown table in `comparison-runs/SUMMARY.md`:

```markdown
# A/B Comparison Summary

| Run | Date | Input | Monolith C/H | Coord C/H | Parity | Noise (M+L+I) ratio | Time ratio | Notes |
|---|---|---|---|---|---|---|---|---|
| 001 | 2026-05-... | repo/PR#123 | 2 / 5 | 2 / 5 | ✅ | 1.10 | 1.32 | Coord found 1 cross-domain finding monolith missed (secret in IaC) |
| 002 | ... | ... | ... | ... | ... | ... | ... | ... |
```

### Step 6 — After ≥10 runs — decide

Aggregate results against the success criteria:

| Criterion | Threshold | Actual |
|---|---|---|
| **SC-001** Coverage parity (Critical+High) | ≥ 95% | _% |
| **SC-002** Noise increase (M+L+I) | ≤ +20% | _% |
| **SC-003** Latency ratio | ≤ 1.5× | _× |
| **SC-004** Token cost ratio | ≤ 5× | _× |
| **SC-005** OWASP category gaps | Zero | _ |
| **SC-006** Cross-domain dedup correctness | ≥ 95% | _% (curated test set, not aggregated from runs) |
| **SC-007** Report format unchanged | Yes/No | _ |
| **SC-008** Smoke test passes | Yes/No | already ✅ |

If all green → proceed to monolith deprecation (T9 second half). If any red → file findings as Phase B/C tickets, iterate on coordinator + subs, repeat.

## Curated cross-domain test set (for SC-006)

Construct ~20 small synthetic cases where you KNOW what the coordinator should produce. Examples:

| # | Synthetic input | Expected coordinator output |
|---|---|---|
| 1 | `src/config.ts` with `const apiKey = "AKIA...8RQT"` | One finding: 🔴 CRITICAL [Secrets+AppSec], CWE-798. Severity bumped via ensemble. |
| 2 | `infra/main.tf` with `default = "AKIA...P3NF"` | One finding: 🔴 CRITICAL [CROSS-DOMAIN: secrets+iac]. Both perspectives merged. |
| 3 | `Dockerfile` with `FROM node:14-alpine` (EOL) + `package.json` with `lodash@4.17.20` (CVE) | Two findings: one IaC + SupplyChain (image), one SupplyChain (lodash). |
| 4 | K8s manifest with `runAsUser: 0` + `hostPath: /` mount | One finding: 🔴 CRITICAL [CROSS-DOMAIN: iac+threat-model] — privilege escalation via host volume. |
| 5 | App route with no auth check + IDOR pattern | One finding: 🟠 HIGH AppSec (IDOR). ThreatModel may also flag if invoked. |
| 6 | `.github/workflows/deploy.yml` with `actions/checkout@main` + `aws-secret-key` env | Two findings: one SupplyChain (unpinned action), one Secrets (key in env). |
| 7 | Vulnerable `requests` version + code that calls `requests.get(user_url)` (SSRF) | Two findings: SupplyChain (CVE), AppSec (SSRF pattern). |
| 8 | Plain HTTP API endpoint with sensitive data + missing TLS in IaC | Two findings: AppSec (no TLS in code) + IaC (LB allows plain HTTP). Cross-domain. |
| 9 | App password hashed with MD5 + secret manager not used | Two findings: AppSec (weak crypto) + Secrets (no manager). Cross-domain `[appsec+secrets]`. |
| 10 | Public S3 bucket holding user uploads + missing presigned-URL pattern in app | Two findings: IaC (public bucket) + AppSec (direct path access). Cross-domain. |
| 11–20 | (extend with patterns specific to your typical PRs) | |

For each case, record whether the coordinator's merge produced the expected result. SC-006 = (correct merges) / (total cases) ≥ 0.95.

## Deprecation procedure (Phase 3, after SC criteria met)

Once A/B results support deprecation:

1. **Final commit on `feature/security-guardian-split`:**
   - No changes — branch is the deprecation source of truth.

2. **Open PR** (already exists as #83 draft) — change to ready for review.

3. **PR body update** — paste A/B comparison summary table.

4. **Merge to `main`** — this removes the monolith and replaces with the coordinator + 5 subs.

5. **Tag release** — `v1.4.0` (minor bump — internal architecture refactor, no orchestrator-facing breaking change).

6. **Update `~/.copilot/agents/security/`** on user machines:
   - Run `package.sh --uninstall` (removes monolith + leaves notes intact).
   - Run `package.sh --install` (installs coordinator + 5 subs + schema).
   - Side-notes file is preserved (it's user data — see package.sh seed logic).

7. **Document in CHANGELOG** (if a CHANGELOG exists, otherwise in the release notes):
   - Internal: Security Guardian refactored to coordinator + 5 specialist sub-Guardians.
   - User-facing: no change to invocation, no change to report format.
   - Side-notes: new `[sub]` tag convention available; untagged notes still work.

8. **Open follow-up issue** — apply same pattern to Privacy Guardian (the obvious next candidate, per spec §Product Impact).

## Risks during A/B testing

- **Coordinator-only mode without all 5 subs:** if some subs fail to load on the test machine (e.g., file permissions), coordinator produces partial report. Validate Tools Report header before scoring.
- **Sub-Guardian discovery in Copilot CLI:** verify that sub-Guardians under `agents/security/` are actually invoked by the coordinator. If the CLI doesn't auto-register subdirectory agents, the coordinator's `task` calls will fail. This is the highest-risk technical assumption to validate in run 001.
- **Side-notes filtering not yet exercised:** until users add tagged notes, the filtering logic isn't tested. Add 1–2 tagged notes to `~/sg-coordinator/.copilot/instructions/security-guardian.notes.md` for at least one comparison run to exercise the path.
- **Token cost measurement:** Copilot CLI reports per-tool token usage in `session_store.events.usage_*` columns. Sum across the run to get totals.

## When to abandon the split

If after ≥10 runs the coordinator architecture fails any of these:
- SC-001 < 90% (more than 10% coverage regression on Critical+High)
- SC-005 has any zero-coverage gap (a whole OWASP category dropped)
- Coordinator routinely fails to invoke 1+ subs (Copilot CLI doesn't recognize them)

→ Stop. Roll back the spec to "split is not viable in this CLI runtime" and either:
- Address the underlying cause (sub-Guardian discovery → file an upstream Copilot CLI issue)
- Reduce scope (e.g., 2–3 subs instead of 5)
- Abandon the split and document why for future reference
