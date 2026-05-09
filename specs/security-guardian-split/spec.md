# Feature Specification: Security Guardian Split (Coordinator + Specialist Sub-Guardians)

**Feature Branch**: `feature/security-guardian-split`
**Created**: 2026-05-09
**Status**: Draft
**Input**: User description: "More granular sub-agents for each guardian. Split the guardians. Example: The PO Guardian would coordinate sub-po-specialized-guardians, the same for QA, Code Review, ..."

**Owner**: vbomfim (project owner) + default agent
**Last updated**: 2026-05-09
**Issue tracker**: TBD — umbrella issue to be created on `vbomfim/sdlc-guardian-agents`
**Tickets**: TBD — populated during decomposition (Section §Decomposition)

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Coordinator + sub-AppSec Proof-of-Concept (Priority: P1)

As a Guardian system maintainer, I want to validate the coordinator/sub-Guardian pattern with a single sub (sub-AppSec) and a thin coordinator before committing to the full 5-sub architecture, so that I can A/B test the new approach against the existing monolithic Security Guardian without losing review coverage.

**Why this priority**: P1 because the coordinator + first sub validates the entire architectural pattern (routing, fan-out, merge, dedup, severity reconciliation, side-notes filtering). Without this, we cannot know whether the split improves quality or just adds complexity. The remaining 4 subs are mechanical replication of a proven pattern.

**Independent Test**: Can be fully tested by running a security review on a representative branch using the new coordinator (which fans out to sub-AppSec only) and comparing the output to the same review run on the monolithic Security Guardian on `main`. The new path must produce findings of equal or better quality with no missed CRITICAL/HIGH from the monolith's coverage of AppSec topics.

**Acceptance Scenarios**:

1. **Given** the `feature/security-guardian-split` branch with the new coordinator and sub-AppSec installed, **When** the orchestrator invokes "Security Guardian" on a PR diff with code-level vulnerabilities, **Then** the coordinator fans out to sub-AppSec, receives its findings, and produces a unified report indistinguishable in format from the monolith's report.
2. **Given** a security review on the new architecture, **When** sub-AppSec returns findings, **Then** the coordinator merges them with the standard finding schema (file, line range, CWE, OWASP category, severity) and applies the severity reconciliation rules.
3. **Given** an A/B comparison run (same input, monolith vs. coordinator+sub-AppSec), **When** both reports are diffed, **Then** every CRITICAL and HIGH finding from the monolith that pertains to AppSec topics also appears in the new report (no regressions on AppSec coverage).
4. **Given** the orchestrator invokes the new coordinator, **When** the user reads the report, **Then** the report is attributed to "Security Guardian" — sub-Guardian attribution is invisible unless it adds critical context (e.g., cross-domain tagging in later phases).

---

### User Story 2 - Add Remaining 4 Sub-Guardians (Priority: P2)

As a Guardian system maintainer, I want to add sub-SupplyChain, sub-Secrets, sub-ThreatModel, and sub-IaC to the coordinator so that the new architecture covers the full surface area of the monolithic Security Guardian.

**Why this priority**: P2 because P1 must succeed first — adding 4 more subs without validating the pattern is wasted work if the pattern is wrong. P2 unlocks deprecation of the monolith.

**Independent Test**: Each sub-Guardian can be added incrementally and tested in isolation by:
- Running the coordinator with only that new sub enabled (other subs stubbed)
- Comparing its findings against the monolith's coverage of that sub's domain (e.g., sub-SupplyChain vs. monolith's `npm audit` output)
- Validating cross-domain tagging when findings overlap (e.g., a hardcoded AWS key in a Terraform file should appear once tagged `[CROSS-DOMAIN: Secrets+IaC]`)

**Acceptance Scenarios**:

1. **Given** all 5 sub-Guardians installed under the coordinator, **When** the orchestrator invokes a full security review on a PR with mixed concerns (code vulns + outdated deps + a leaked secret + IaC misconfig), **Then** the coordinator fans out to all 5 subs in parallel, receives reports, deduplicates overlapping findings, and produces a single unified report.
2. **Given** sub-Secrets and sub-IaC both flag a hardcoded AWS key in `infra/main.tf`, **When** the coordinator merges findings, **Then** the finding appears once with a `[CROSS-DOMAIN: Secrets+IaC]` tag and combines remediation context from both subs.
3. **Given** sub-Secrets reports HIGH on `src/config.ts:42` and sub-AppSec reports HIGH on the same line for the same CWE-798, **When** the coordinator reconciles severity, **Then** the merged finding is bumped to CRITICAL (ensemble bump for 2+ at HIGH+).

---

### User Story 3 - A/B Test and Deprecate Monolith (Priority: P3)

As a project maintainer, I want to run the new coordinator and the old monolith in parallel for a defined period, compare their outputs on real reviews, and then deprecate the monolith once the new architecture is proven, so that the project ends up with one coherent Security Guardian implementation.

**Why this priority**: P3 because deprecation is the final step that locks in the change. It depends on P1 and P2 producing good evidence.

**Independent Test**: Run N security reviews (target: ≥10 across diverse PRs), capture both monolith and coordinator outputs side-by-side, manually score each pair on (a) coverage parity, (b) finding quality, (c) noise rate, (d) latency, (e) token cost. The new architecture wins if it matches monolith on (a)(b), is comparable on (c), and the cost (d)(e) is acceptable.

**Acceptance Scenarios**:

1. **Given** 10+ A/B comparison runs, **When** results are tallied, **Then** the new architecture has ≥95% coverage parity on CRITICAL/HIGH findings and ≤20% increase in noise (LOW/INFO findings) compared to the monolith.
2. **Given** the new architecture passes A/B testing, **When** the monolith is removed and the coordinator becomes the only Security Guardian, **Then** all auto-delegation triggers in `src/instructions/security-guardian.instructions.md` route to the coordinator and the install scripts (`package.sh`, `package.ps1`) install the coordinator + 5 sub files.
3. **Given** the deprecation, **When** a new install runs, **Then** the smoke test verifies all 6 files (1 coordinator + 5 subs) are present at `~/.copilot/agents/`.

---

### Edge Cases

- **One sub fails or times out** — coordinator must produce a partial report with the failed sub flagged, never block the user. (Q6 default; see §Assumptions.)
- **All subs return zero findings** — coordinator returns a clean Security Guardian report attributed to "no findings" (not "no scan ran").
- **Sub returns malformed output** (not matching the standard finding schema) — coordinator logs the parse error, treats the sub as "failed," continues with the others.
- **Two subs return contradictory severity for the same finding** — highest wins (Q3 default), but BOTH perspectives' descriptions are concatenated in the merged finding so the user sees both rationales.
- **Hybrid routing misclassifies the user's intent** — coordinator's safe default is "fan out to all 5" when the request is ambiguous. The cost of an unnecessary scan is preferable to missing a domain.
- **Side-notes file grows large** — single shared `security-guardian.notes.md` may eventually have 100+ entries. Coordinator must filter relevant subset per fan-out (e.g., when fanning out to sub-Secrets, only pass notes tagged `[secrets]`). Tagging convention defined in §Assumptions.
- **A sub flags a finding outside its declared scope** (e.g., sub-AppSec spots a hardcoded secret) — sub MUST tag the finding `[handoff: secrets]` and include it; coordinator routes it to the correct sub on next iteration or merges it as cross-domain.
- **Iteration cap exhausted** — after 3 coordinator-level iterations across the whole sub-fleet, coordinator escalates to user per the existing iteration cap rule. Per-sub iteration counts do NOT exist; the cap is owned by the coordinator (Q5 decision).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide a Security Guardian *coordinator* agent at `src/agents/security-guardian.agent.md` that does NOT itself scan code, but instead delegates all scanning to specialist sub-Guardians.
- **FR-002**: System MUST provide 5 specialist sub-Guardian agent files at `src/agents/sub-{appsec,supply-chain,secrets,threat-model,iac}.agent.md`. Sub-Guardian agent files MUST live at the **root** of `agents/` (not in a subdirectory) — Copilot CLI's `task` tool only registers top-level agent files. The `Sub-*` filename prefix groups them visually.
- **FR-003**: The coordinator MUST implement *hybrid routing*: fan out to ALL 5 sub-Guardians by default and on review-gate/PR triggers; fan out to a subset only when the user explicitly scopes the request (e.g., "scan for leaked secrets" → sub-Secrets only). Default on ambiguity = fan out to all 5.
- **FR-004**: The coordinator MUST invoke selected sub-Guardians in parallel using `task` with `mode: "background"`.
- **FR-005**: The coordinator MUST wait for all selected sub-Guardians to complete before merging results, with a per-sub timeout (default 5 minutes). If a sub times out, treat as "failed" and produce a partial report flagging the failure.
- **FR-006**: Each sub-Guardian MUST emit findings in a standardized YAML schema with fields: `sub_guardian`, `severity`, `title`, `cwe_id` (if applicable), `owasp_category` (if applicable), `file_path`, `line_range`, `rule_id` (if from automated scan), `description`, `remediation`, `cross_domain` (boolean).
- **FR-007**: The coordinator MUST deduplicate findings using the dedup key `(file_path, overlapping line_range, cwe_id || category)`. Two findings matching the dedup key are merged into one.
- **FR-008**: When merging duplicates, the coordinator MUST select the highest severity (CRITICAL > HIGH > MEDIUM > LOW > INFO) and concatenate remediation/description text from both contributing findings.
- **FR-009**: When 2 or more sub-Guardians independently flag the same area at HIGH severity or above, the coordinator MUST apply an *ensemble bump*: HIGH × 2 → CRITICAL.
- **FR-010**: The coordinator MUST tag genuinely cross-domain findings (e.g., a leaked secret in a Terraform file) with `[CROSS-DOMAIN: <subs>]` and present them as one finding (not duplicated), preserving context from each contributing sub.
- **FR-011**: The coordinator MUST produce a unified report attributed to "Security Guardian" — sub-Guardian attribution MUST NOT be exposed to the orchestrator unless it adds critical context (e.g., cross-domain tagging or partial-failure flag).
- **FR-012**: The coordinator MUST own the *iteration cap* of 3 across the entire sub-fleet (NOT per-sub). After 3 coordinator-level iterations, the coordinator escalates to the user per the existing Iteration & Consultation Pattern in `src/instructions/sdlc-workflow.instructions.md`.
- **FR-013**: The coordinator MUST own a *single shared* side-notes file at `~/.copilot/instructions/security-guardian.notes.md`. Sub-Guardians MUST NOT have their own `.notes.md` files. The coordinator MUST filter notes by tag (e.g., `[appsec]`, `[secrets]`, `[iac]`) and pass only relevant notes to each sub when fanning out.
- **FR-014**: All sub-Guardians MUST use the same model as the coordinator — the *Default Guardian model* (currently Opus 4.7, per the canonical models section in `src/instructions/sdlc-workflow.instructions.md`). Cheaper models for narrow specialists are explicitly out of scope.
- **FR-015**: The orchestrator MUST NOT invoke sub-Guardians directly. All security work MUST route through the coordinator. Auto-delegation triggers in `src/instructions/security-guardian.instructions.md` MUST point only to the coordinator.
- **FR-016**: If a sub-Guardian fails (timeout, parse error, agent error), the coordinator MUST produce a partial report with the failed sub flagged. Failure of one sub MUST NOT block reporting from the others.
- **FR-017**: The install scripts (`package.sh`, `package.ps1`) MUST install the coordinator + 5 sub files. The smoke test MUST verify all 6 files are present at `~/.copilot/agents/`.
- **FR-018**: The Improvement Cycle proposals from any sub-Guardian MUST land in the shared parent `security-guardian.notes.md` with the appropriate sub tag (e.g., `[appsec]`, `[secrets]`).
- **FR-019**: The system MUST maintain the monolithic Security Guardian alive on `main` during Phase 1 and Phase 2 to enable A/B testing. Deprecation only happens at Phase 3 after A/B evidence supports the switch.
- **FR-020**: A/B comparison results MUST achieve ≥95% parity on CRITICAL/HIGH findings before the monolith is deprecated (see SC-001).

### Key Entities

- **Security Guardian Coordinator**: The parent agent. Holds routing logic, fan-out execution, finding-merge logic, severity reconciliation, side-notes filtering, and unified-report generation. Speaks with one voice as "Security Guardian."
- **Sub-Guardian**: A specialist agent for one security sub-domain (AppSec / SupplyChain / Secrets / ThreatModel / IaC). Holds the procedure and references for its domain only. Emits standardized findings.
- **Finding**: A structured record with the schema in FR-006. The unit of communication between sub-Guardians and the coordinator.
- **Side-note**: A learned pattern stored in the shared `security-guardian.notes.md` file. Tagged by sub-domain so the coordinator can filter on fan-out.
- **A/B comparison run**: A pair of (monolith report, coordinator report) produced from the same input PR/branch, used to validate parity before deprecation.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: ≥95% coverage parity on CRITICAL and HIGH findings between the new coordinator architecture and the monolithic Security Guardian, measured across at least 10 A/B comparison runs on diverse PRs/branches.
- **SC-002**: ≤20% increase in noise (count of LOW/INFO findings) on the new architecture vs. the monolith, averaged across the same A/B runs.
- **SC-003**: Coordinator latency for a full 5-sub fan-out ≤ 1.5× the monolith's latency on equivalent input (parallelism should keep wall-clock time close to the slowest sub, not the sum of all subs).
- **SC-004**: Token cost per full review ≤ 5× the monolith's token cost (acceptable upper bound; hybrid routing should keep typical cost lower because most targeted requests will fan out to ≤2 subs).
- **SC-005**: Zero regressions in coverage of OWASP Top 10 categories: every category covered by the monolith MUST be covered by some sub-Guardian. Validated by mapping table in `specs/security-guardian-split/coverage-map.md` (deliverable).
- **SC-006**: Cross-domain dedup correctness ≥95% on a curated test set of 20 cross-domain finding scenarios (e.g., secret in IaC, dependency CVE that requires code change, IDOR that's also a threat model gap).
- **SC-007**: User-visible report format unchanged — orchestrator and end users MUST NOT need to learn anything new. The coordinator's output looks like the monolith's output.
- **SC-008**: Smoke test passes after `package.sh` install — all 6 agent files present at `~/.copilot/agents/`.

## Assumptions

- **A/B testing happens on the user's own machine via parallel branches** — not a feature flag. The monolith stays on `main`; the coordinator lives on `feature/security-guardian-split`. To run an experiment, the user checks out each branch in turn (or two worktrees side-by-side), gives both versions the same input, and compares the resulting reports manually. There is no runtime toggle and no shared install state. Acceptable because the volume of comparison runs (≥10) is small.
- **The single shared side-notes file uses inline `[sub]` tags** to enable coordinator-side filtering. Tag convention: lowercase sub-name in square brackets at the start of each note line, e.g., `[secrets] This codebase keeps API keys in a custom config loader at src/config/secrets.ts — scan there.` Notes without a tag are passed to all subs.
- **Cross-domain tagging is reserved for genuine multi-domain findings**, not for findings that one sub *could* have caught from a different angle. Coordinator's heuristic: if 2+ sub-Guardians independently emit findings with the same dedup key but DIFFERENT `category` values, treat as cross-domain. Same `category` = duplicate (merge to one).
- **The monolithic Security Guardian and the new coordinator coexist on different branches during Phase 1 and Phase 2.** Each is installed by checking out the relevant branch and running `package.sh`. To run an experiment, give both installs the same input and compare reports — no runtime feature flag, no shared install state, no orchestrator-side switch. (Worktrees make this convenient: keep two checkouts side-by-side.)
- **Per-sub-Guardian timeout default of 5 minutes** is sufficient based on observation of the current monolith's review duration. May be tunable in a future iteration.
- **No automated drift detection** between sub-Guardian instruction files. Maintainers commit to keeping the standard finding schema and procedure structure consistent across all 5 subs by following the sub-AppSec template literally.
- **Existing tooling investment is preserved** — sub-Guardians reuse the security-guardian-tools skill (semgrep, codeql, gitleaks, npm audit, checkov, etc.) without re-installation. The skill catalog stays at parent level; subs just invoke their relevant subset.
- **Privacy Guardian split is out of scope** for this spec but is a likely follow-up using the same pattern (per §Product Impact).

<!-- =============================================================================
     END OF SPEC KIT-COMPATIBLE CONTENT
     ============================================================================= -->

## Decomposition

### Module map

| Module | Purpose | Tickets |
|--------|---------|---------|
| Coordinator | Slim Security Guardian parent: routing, fan-out, merge, dedup, severity reconciliation, unified report | T1 (P1) |
| Standard Finding Schema | YAML schema definition + validation contract used by all subs | T1 (P1, bundled with Coordinator) |
| sub-AppSec | OWASP Top 10, CWE, code-level vulns, business logic flaws | T2 (P1) |
| sub-SupplyChain | Deps, lockfiles, SBOM, SLSA, transitive CVEs, license risk | T3 (P2) |
| sub-Secrets | Hardcoded secrets, key rotation, vault config | T4 (P2) |
| sub-ThreatModel | STRIDE, abuse cases, attack surface, trust boundaries | T5 (P2) |
| sub-IaC | Terraform, Helm, K8s manifests, cloud configs, CIS Benchmarks | T6 (P2) |
| Side-notes filtering | Coordinator logic to filter `security-guardian.notes.md` by sub-tag and pass relevant subset to each sub | T7 (P2) |
| Install + smoke test updates | Update `package.sh` / `package.ps1` to install all 6 files; smoke test verifies presence | T8 (P2) |
| A/B comparison + deprecation | Run ≥10 comparison runs, capture results, validate SC-001 to SC-008, then remove monolith | T9 (P3) |
| Coverage map deliverable | `specs/security-guardian-split/coverage-map.md` mapping every monolith section to its new sub-home | T10 (P1, prerequisite to T2–T6) |

### Sequencing and dependencies

- **Phase A (foundation, P1):** T10 (coverage map) → T1 (coordinator + finding schema) → T2 (sub-AppSec)
- **Phase B (parallel after Phase A, P2):** T3, T4, T5, T6 (the other 4 subs — independently shippable now that the pattern is proven) + T7 (side-notes filtering) + T8 (install/smoke)
- **Phase C (after Phase B, P3):** T9 (A/B + deprecation)

### Decomposition rationale

The decomposition front-loads the *coverage map* (T10) as a P1 prerequisite because mapping every section of the 820-line monolith to its new sub-home is the highest-risk activity — if we discover during Phase B that the monolith covers something none of the 5 subs are scoped for, we have to redesign the sub-roster. Doing this analysis up front (~3 hours of careful reading) is much cheaper than discovering the gap mid-Phase-B.

The coordinator (T1) and sub-AppSec (T2) are bundled into Phase A because the coordinator alone can't be tested without a sub to fan out to, and sub-AppSec is the most representative sub (largest domain, most overlap with other subs — best stress-test of merge logic).

The other 4 subs (T3–T6) are fully parallelizable in Phase B because each is a mechanical replication of the proven T2 pattern with a different domain.

Alternatives considered:
- **Big-bang (all 6 files at once)**: rejected — too much risk if the pattern is wrong; loses fast feedback.
- **Coordinator alone first**: rejected — can't be tested without a sub; pattern validation would be deferred.
- **One sub-Guardian per phase (5 phases)**: rejected — over-sequenced; subs are independent after T2 proves the pattern.

## Guardian Consultation Results

### Security Guardian
- **Self-consultation N/A** — this spec IS the Security Guardian's evolution. The owner has read the existing monolith and confirms the 5-sub split covers all current scope (validated formally by T10 coverage map).

### Privacy Guardian
- **No PII/PHI surface in this change** — the Security Guardian operates on source code, not user data. N/A.

### Platform Guardian
- **N/A** — no Kubernetes / cloud infrastructure changes. The change is entirely in `src/agents/` markdown files.

### Delivery Guardian
- **Install script update** (T8) is the only deployment-adjacent change. Existing `package.sh` smoke test pattern handles it. No CI/CD changes required.

### Code Review Guardian (architectural impact)
- **Architectural concern: Coordinator-as-orchestrator pattern is new for this codebase** — no other Guardian fans out to sub-agents today. The pattern should be explicitly documented in `src/instructions/sdlc-workflow.instructions.md` so future Guardians (Privacy, QA, Code Review themselves) can follow the same template if/when they split.
- **Architectural concern: Standard finding schema (FR-006) is a public contract.** Once sub-Guardians emit findings in this schema, changing it later is a breaking change. The schema should be defined in a central place (proposal: `src/agents/security/_finding-schema.md`) and all subs reference it.
- **Architectural concern: Iteration cap semantics shift.** The current cap is "3 per Guardian." For the coordinator, the cap is "3 across all subs." This should be called out in the workflow instructions so the rule reads consistently.

## System Impact

### Affected components

| Component | Change type | Description |
|-----------|-------------|-------------|
| `src/agents/security-guardian.agent.md` | Modified | Becomes the slim coordinator (~150 lines, no scanning) — was 820 lines of scanning logic |
| `src/agents/security/` (new directory) | New | Holds 5 sub-Guardian files |
| `src/agents/sub-appsec.agent.md` | New | Sub-AppSec specialist |
| `src/agents/sub-supply-chain.agent.md` | New | Sub-SupplyChain specialist |
| `src/agents/sub-secrets.agent.md` | New | Sub-Secrets specialist |
| `src/agents/sub-threat-model.agent.md` | New | Sub-ThreatModel specialist |
| `src/agents/sub-iac.agent.md` | New | Sub-IaC specialist |
| `src/agents/security/_finding-schema.md` | New | Shared finding schema referenced by all subs (per Code Review consultation) |
| `src/instructions/security-guardian.instructions.md` | Modified | Auto-delegation triggers point to coordinator (no changes for orchestrator-side; subs are invisible) |
| `src/instructions/sdlc-workflow.instructions.md` | Modified | Document the coordinator/sub pattern as a reusable template; clarify iteration-cap semantics for coordinators |
| `~/.copilot/instructions/security-guardian.notes.md` | Existing (runtime) | Convention added: notes use inline `[sub]` tags for coordinator-side filtering |
| `package.sh` | Modified | Installs the 6 agent files (1 coordinator + 5 subs); smoke test verifies presence |
| `package.ps1` | Modified | Same as `package.sh` for Windows |
| Monolithic Security Guardian (on `main`) | Removed (Phase 3) | Deleted after A/B validation (T9) |

### Affected contracts

| Contract | Change | Backward compatible? |
|----------|--------|---------------------|
| Orchestrator → Security Guardian invocation | No change — orchestrator still calls "Security Guardian" via `task` tool | Yes |
| Security Guardian → orchestrator report format | No change — unified report from coordinator looks identical to monolith report | Yes |
| Sub-Guardian → coordinator finding schema | New (FR-006) — internal to Security Guardian, not exposed to orchestrator | N/A (internal contract) |
| Side-notes file format | Convention added: inline `[sub]` tags. Existing untagged notes are still valid (passed to all subs). | Yes |

### Architectural deltas

- **Coordinator/sub-agent pattern introduced.** Before: every Guardian is a flat agent. After: Security Guardian is a coordinator that delegates to subs. This is a new architectural pattern in the codebase.
- **Standard finding schema introduced.** Before: each Guardian formats findings in free-form markdown. After: Security sub-Guardians emit YAML-structured findings; coordinator translates back to markdown for the user.
- **Side-notes filtering convention introduced.** Before: notes file is read whole. After: notes can be tagged by sub-domain so the coordinator can pass relevant subsets to specialists.

### Backward compatibility and migration

- **Breaking changes:** None for end users / orchestrator. The change is internal to Security Guardian.
- **Migration path:** The monolith stays alive on `main` during Phase 1 and Phase 2. The coordinator lives on `feature/security-guardian-split`. A/B tests run by checking out the appropriate branch. After Phase 3, the monolith is removed.
- **Deprecation timeline:** Monolith removed at the end of Phase 3 (after T9 A/B validation completes successfully).

### Risk surface

- **Risks introduced:**
  - Increased token cost per full review (~5x worst case; hybrid routing mitigates typical case to ~1-2x).
  - Increased latency (parallelism helps, but worst case = slowest sub's wall-clock time).
  - Maintenance burden — 6 files to keep coherent vs. 1 today. Mitigated by shared finding schema + sub-AppSec template.
  - Coordinator routing logic is a new failure surface (misroutes could miss findings). Mitigated by safe-default fan-out-all on ambiguity.
  - Standard finding schema is a public-ish contract — changing it later breaks all subs simultaneously.
- **Risks reduced:**
  - Deeper expertise per domain — each sub's instruction file is shorter and more focused, less prone to "lost in the middle" attention failures.
  - Easier to evolve — adding a new security domain (e.g., sub-Cryptography) becomes adding one file, not editing a 820-line monolith.
  - Better tracking of findings by domain (each finding carries its `sub_guardian` field).

## Product Impact

### Positioning shift

This is the first Guardian split in the codebase. It establishes a **coordinator/specialist pattern** that other large Guardians (Privacy, QA, Code Review) can adopt when they grow past the point where a single agent file can hold all the relevant expertise without quality degradation. The product remains "SDLC Guardians for AI-augmented development" — the architectural pattern broadens but the value prop doesn't change.

### Scope boundary changes

- **Opens** a new category of work: splitting other Guardians (Privacy is the obvious next candidate per the original brainstorm).
- **Closes nothing** — the existing surface area is preserved by FR-020 / SC-001 (parity gate).

### Roadmap dependencies

- **Unlocks:**
  - Privacy Guardian split (GDPR / HIPAA / CCPA / Logging / Data-Flow specialists) — pattern is now proven.
  - QA Guardian split (E2E / Contract / Perf / A11y specialists).
  - Coordinator pattern documentation in `sdlc-workflow.instructions.md` becomes a reusable template.
- **Blocks or delays:** None.
- **Depends on:** Issue #80 instruction-restructure pattern (Rules / Procedure / Background) is the recommended structure for the new coordinator and all 5 subs. If issue #80 is still in flight when this work starts, both can proceed in parallel.

### User-facing communication

- **Internal stakeholders to inform:** Project owner (vbomfim) — already involved as the brainstorm collaborator.
- **External communication needed:** None for Phase 1 and Phase 2 (internal architectural change). Phase 3 (deprecation) may warrant a CHANGELOG entry noting "Security Guardian internal architecture refactored to coordinator + 5 specialists" with reassurance that the orchestrator-facing contract is unchanged.

## Appendix — References

- Original brainstorm in session plan: `~/.copilot/session-state/c223d192-4372-40ea-9bd8-7764ccde2837/plan.md`
- Existing monolithic Security Guardian: `src/agents/security-guardian.agent.md` (820 lines, commit on `main` at the time of spec creation)
- Project rule against Guardian-on-Guardian recursion: `.github/copilot-instructions.md`
- Iteration & Consultation Pattern (referenced by FR-012): `src/instructions/sdlc-workflow.instructions.md`
- Canonical Constants (referenced by FR-014): `src/instructions/sdlc-workflow.instructions.md`
- Memory policy (referenced by FR-013, FR-018): `src/instructions/sdlc-workflow.instructions.md` "Memory — Two Systems, Two Purposes"
- Issue #80 instruction-restructure (Rules / Procedure / Background): `.github/copilot-instructions.md`
- Industry parallels: Snyk product taxonomy (Code / Open Source / Container / IaC); GitHub Advanced Security feature segmentation.
