# Coverage Map: Monolith → Coordinator + 5 Sub-Guardians

> **Purpose:** Map every section of the 820-line monolithic Security Guardian (`src/agents/security-guardian.agent.md` on `main` at the time of this branch's creation) to its new home in the coordinator + 5 sub-Guardian architecture.
>
> **Why this exists:** Without this map, splitting the monolith is guesswork. Any topic the monolith covers but no sub owns is a coverage regression.
>
> **Validates:** SC-005 (zero OWASP Top 10 coverage regressions) and Phase A acceptance.
>
> **Status:** Draft for Phase A. Will be re-validated during the A/B comparison runs (Phase C / T9).

## Legend

| Code | Owner |
|---|---|
| **C** | Coordinator (`src/agents/security-guardian.agent.md` — slim parent) |
| **AS** | sub-AppSec (`src/agents/sub-appsec.agent.md`) |
| **SC** | sub-SupplyChain (`src/agents/sub-supply-chain.agent.md`) |
| **SE** | sub-Secrets (`src/agents/sub-secrets.agent.md`) |
| **TM** | sub-ThreatModel (`src/agents/sub-threat-model.agent.md`) |
| **IaC** | sub-IaC (`src/agents/sub-iac.agent.md`) |

Multiple owners separated by `+`. The first listed owner is primary; subsequent owners contribute when the topic is genuinely cross-domain.

## 1. Identity & Mode Selection (lines 1–23)

| Monolith section | Lines | Owner(s) | Notes |
|---|---|---|---|
| Front-matter (`name`, `description`, `infer`) | 1–8 | C | Coordinator keeps the public name "Security Guardian"; orchestrator and users see no change |
| Identity paragraph + role statement | 10–16 | C | Coordinator's identity rewritten — it's a router/merger, not a scanner |
| Mode selection prompt (Design / Code / Implementation) | 18–23 | C | Coordinator decides which subs to fan out to based on mode |

## 2. Scanning Procedure — Pre-flight (lines 25–122)

| Monolith section | Lines | Owner(s) | Notes |
|---|---|---|---|
| "Always run the full scan pipeline" preamble | 25–27 | C | Becomes "always fan out to relevant subs per hybrid routing" |
| Pre-flight Step A — load own notes | 29–33 | C | Coordinator owns the notes file, **filters by `[sub]` tag**, passes relevant subset to each sub on fan-out |
| Pre-flight Step B — cross-Guardian notes read | 34–49 | C | Only the coordinator reads cross-Guardian notes, NOT each sub (avoids 5× duplicated reads). Coordinator passes relevant cross-Guardian context down. |
| Step 0 — `git worktree` workspace isolation | 51–57 | C | Coordinator sets up the worktree **once**, passes the path to each sub. Subs don't create their own worktrees. |
| Step 0.1 — `session_store` past-findings search | 59–89 | C | Coordinator runs the cross-cutting query once. Findings get routed to relevant subs by category keyword (e.g., "SQL injection" → AS; "hardcoded secret" → SE; "dependency CVE" → SC). |
| Step 0.5 — tool discovery | 92–122 | C | Coordinator assembles the unified Tools Report. Sub-specific tool checks: |
| ↳ semgrep | 98 | AS | SAST core for AppSec |
| ↳ gitleaks | 99 | SE | Secret scanner |
| ↳ trivy (overall command) | 100 | SC + IaC | Trivy is multi-purpose — see Step 1 split below |
| ↳ npm audit / pip-audit / cargo audit / dotnet list --vulnerable | 105–108 | SC | All language SCAs belong to SupplyChain |
| ↳ bandit | 107 | AS | Python SAST = AppSec |

## 3. Step 1 — Automated Scans (lines 124–152)

| Tool / scan | Lines | Owner(s) | Notes |
|---|---|---|---|
| Semgrep SAST | 130 | AS | Core code-level vulnerability scan |
| Gitleaks secret scan | 133 | SE | All secret detection |
| `trivy fs --severity CRITICAL,HIGH .` | 136 | SC + IaC | Trivy `fs` covers deps (SC) AND IaC misconfig (IaC) — coordinator splits results by finding type and routes to the appropriate sub |
| `npm audit` | 139 | SC | Node.js deps |
| `pip-audit` | 140 | SC | Python deps |
| `bandit -r . -ll --quiet` | 141 | AS | Python SAST |
| `cargo audit` | 142 | SC | Rust crates |
| `dotnet list package --vulnerable` | 143 | SC | .NET NuGet |
| Phase 1 / Phase 2 parallel/sequential orchestration | 146–152 | C | Coordinator runs subs in parallel (background mode); each sub decides its own internal phase ordering |

## 4. Step 2 — Manual Code Review (lines 154–167)

| Topic | Lines | Owner(s) | Notes |
|---|---|---|---|
| Business logic flaws and authorization bypasses | 156 | AS | Code-level logic = AppSec |
| Insecure design patterns | 157 | AS + TM | AS for code-level patterns; TM for system-level design |
| Missing security controls | 158 | AS | Code-level missing controls |
| Data flow and trust boundary violations | 159 | TM + AS | TM owns trust boundaries; AS owns code-level data flow |
| Component Boundary Security — interface bypass | 162 | AS | Code-level interface enforcement |
| Component Boundary Security — dependency direction | 163 | AS + TM | AS for code; TM for system architecture |
| Component Boundary Security — data isolation (cross-tenant) | 164 | AS + TM | AS for code-level checks; TM for tenant trust boundaries |
| Component Boundary Security — trust boundaries (auth/authz at interface) | 165 | TM + AS | TM-native concept |

## 5. Tagging Standards & Handoff Report Format (lines 169–213)

| Section | Lines | Owner(s) | Notes |
|---|---|---|---|
| Severity ladder + OWASP/WAF/CUSTOM tags | 171–180 | C + ALL | Coordinator publishes the canonical tagging scheme; every sub uses it |
| Handoff Report Format (markdown table) | 182–213 | C | Coordinator assembles the unified report. Subs emit findings in **standard YAML schema** (FR-006, see `_finding-schema.md`); coordinator translates to the user-visible markdown table. |

## 6. Improvement Cycle Proposals (lines 215–254)

| Topic | Lines | Owner(s) | Notes |
|---|---|---|---|
| `session_store` query for recurring patterns | 220–230 | C | Coordinator runs the query **once** for the security domain (avoid 5× duplication). Routes results to subs that match the pattern category. |
| Proposal table format | 236–243 | C | Coordinator aggregates proposals from all subs; tags each with `[sub]` so the user sees provenance |
| Rules for proposals (additive only, advisory, etc.) | 245–253 | C + ALL | Coordinator enforces; subs follow when proposing |

## 7. Proactive Security Requirements Refinement (lines 258–352)

| Topic | Lines | Owner(s) | Notes |
|---|---|---|---|
| Trigger conditions | 264–272 | C | Coordinator decides when to enter refinement mode |
| **Data & Identity checklist** | 284–289 | AS | Auth, identity, MFA, rate limiting, account enumeration — all AppSec |
| ↳ "Does this feature handle PHI? → Privacy Guardian" handoff | 287 | C | Coordinator-level cross-Guardian handoff (not a sub's job) |
| **Input & Data Flow checklist** | 291–295 | AS | Input validation, injection paths, encryption in transit/rest |
| **Error & Edge Cases checklist** | 297–300 | AS | Fail-safe, error handling, logging hygiene (security-side; PHI side stays with Privacy Guardian) |
| **Dependencies & Infrastructure checklist** | 302–305 | SC + IaC | Deps → SC; env/secrets/network → IaC + SE |
| **Multi-Tenancy & Isolation checklist** | 307–309 | AS + TM | Code-level isolation = AS; tenant trust boundaries = TM |
| **Supply Chain & Integrity checklist** | 311–313 | SC + IaC | Packages/registries/pinning = SC; build/deploy pipeline = IaC |
| Example: "Build me a login page" | 315–331 | AS | All 9 questions are AppSec-domain |
| Example: "Create an API endpoint to upload files" | 333–343 | AS + IaC | Storage/encryption can route to IaC if cloud blob storage; rest is AS |
| Behavior Rules ("never skip refinement", etc.) | 345–351 | C | Coordinator-level governance |

## 8. Mode 1 — Design Review (lines 355–417)

| Topic | Lines | Owner(s) | Notes |
|---|---|---|---|
| Threat Modeling (STRIDE) | 355–360 | TM | Primary domain |
| ↳ Data sensitivity classification (PII / credentials / financial) | 357 | TM + (Privacy handoff for PHI) | Coordinator handles cross-Guardian handoff |
| Access Control Architecture | 362–367 | AS + TM | AS for RBAC/ABAC enforcement; TM for trust boundary design |
| Data Protection Architecture | 369–374 | AS + IaC | AS for crypto choices; IaC for cloud KMS config |
| Supply Chain Architecture | 376–380 | SC + IaC | SC for deps; IaC for CI/CD pipeline security |
| Reliability as Security | 382–386 | IaC + TM | Fault isolation/DDoS mitigation usually in cloud infra; threat-model contributes |
| Operational Security | 388–392 | IaC + C | IaC for IaC and observability config; coordinator for runbook/incident-response handoff |
| Output Format for Design Review (markdown) | 394–417 | C | Coordinator assembles |

## 9. Mode 2 — Code Review (lines 421–532)

| Topic | Lines | Owner(s) | Notes |
|---|---|---|---|
| Authentication & Identity | 425–431 | AS | Pure code-level concern |
| Access Control | 433–438 | AS | IDOR, deny-by-default, privilege escalation |
| Input Validation & Injection Prevention | 440–446 | AS | SQLi, XSS, command injection, file upload validation |
| Cryptographic Practices | 448–453 | AS | Algorithm choice, TLS version, CSPRNG |
| Security Misconfiguration | 455–460 | AS + IaC | App-level config = AS (helmet, headers, CORS); infra config = IaC (cloud, K8s) |
| Secrets Management | 462–467 | SE | All secret handling — primary domain |
| Data Isolation & Multi-Tenancy | 469–473 | AS | Code-level checks; TM contributes for design-level review |
| API Security | 475–481 | AS | Rate limiting, auth-per-endpoint, CORS at app layer |
| Dependency Security | 483–487 | SC | Lockfiles, audits, dependency confusion |
| Logging & Monitoring | 489–494 | AS | Security event logging; PII-in-logs is Privacy Guardian (cross-Guardian) |
| Error Handling | 496–500 | AS | Stack trace leakage, fail-safe defaults |
| Software Integrity | 502–506 | SC + AS | Code signing/CI = SC; deserialization-of-untrusted = AS (cross-domain finding when both apply) |
| Output Format for Code Review (markdown) | 509–532 | C | Coordinator assembles |

## 10. Mode 3 — Implementation Guidance (lines 536–760)

| Section | Lines | Owner(s) | Notes |
|---|---|---|---|
| General Principles (defense in depth, least privilege, etc.) | 540–550 | C | Cross-cutting — coordinator publishes; subs reference |
| **TypeScript / JavaScript** | 552–616 | (split below) | |
| ↳ Authentication snippet | 554–565 | AS | |
| ↳ Input Validation snippet | 567–582 | AS | |
| ↳ Database Queries snippet | 584–591 | AS | |
| ↳ Security Headers snippet | 593–600 | AS | |
| ↳ Secrets snippet | 602–610 | SE | |
| ↳ Dependency Audit snippet | 612–616 | SC | |
| **C# / .NET / Azure Functions** | 618–663 | (split below) | |
| ↳ Authentication snippet | 620–634 | AS | |
| ↳ Input Validation snippet | 636–647 | AS | |
| ↳ Secrets snippet | 649–657 | SE | |
| ↳ Dependency Audit snippet | 659–663 | SC | |
| **Rust** | 665–698 | (split below) | |
| ↳ Memory Safety snippet | 667–680 | AS | |
| ↳ Secrets Handling snippet | 682–692 | SE | |
| ↳ Dependency Audit snippet | 694–698 | SC | |
| **Python** | 700–730 | (split below) | |
| ↳ Input Validation snippet | 702–714 | AS | |
| ↳ Database Queries snippet | 716–723 | AS | |
| ↳ Dependency Audit snippet | 725–730 | SC | |
| **Java** | 732–760 | (split below) | |
| ↳ Authentication snippet | 734–742 | AS | |
| ↳ Input Validation snippet | 744–754 | AS | |
| ↳ Dependency Audit snippet | 756–760 | SC | |

## 11. Custom Rules Extension (lines 764–777)

| Topic | Lines | Owner(s) | Notes |
|---|---|---|---|
| `[CUSTOM]` rule mechanism | 764–777 | C | Coordinator-level policy. Custom rules can target any sub via `target: <sub>` field added during T1. |

## 12. Tool-to-Rule Mapping (lines 781–793)

| Tool | Lines | Owner(s) | Notes |
|---|---|---|---|
| Semgrep | 785 | AS | |
| Gitleaks | 786 | SE | |
| Trivy | 787 | SC + IaC | Coordinator splits trivy output by finding type |
| npm audit | 788 | SC | |
| cargo audit / cargo deny | 789 | SC | |
| pip-audit / bandit / safety | 790 | AS (bandit) + SC (pip-audit, safety) | bandit is SAST → AS; pip-audit and safety are SCA → SC |
| dotnet list --vulnerable | 791 | SC | |

## 13. References (lines 797–820)

| Section | Lines | Owner(s) | Notes |
|---|---|---|---|
| OWASP (Top 10, ASVS, Cheat Sheets) | 799–803 | AS (primary) | Other subs reference where applicable (e.g., AS-A03 Supply Chain → SC) |
| Microsoft Azure WAF | 805–809 | IaC + AS | WAF Security Pillar covers infra (IaC) and code (AS) |
| AWS WAF | 811–814 | IaC + AS | Same split |
| Google Cloud Architecture Framework | 816–820 | IaC + AS | Same split |
| SLSA | 820 | SC | Supply chain levels — pure SC |

## 14. Coverage Gap Analysis

> **Question for each item:** is it covered by at least one sub?

| Monolith topic | Covered by |
|---|---|
| OWASP A01 — Broken Access Control | AS + TM |
| OWASP A02 — Cryptographic Failures | AS + IaC + SE |
| OWASP A03 — Injection | AS |
| OWASP A04 — Insecure Design | AS + TM |
| OWASP A05 — Security Misconfiguration | AS + IaC |
| OWASP A06 — Vulnerable & Outdated Components | SC |
| OWASP A07 — Identification & Authentication Failures | AS |
| OWASP A08 — Software & Data Integrity Failures | SC + AS |
| OWASP A09 — Security Logging & Monitoring Failures | AS |
| OWASP A10 — Server-Side Request Forgery (SSRF) | AS |
| Azure WAF Security Pillar | AS + IaC |
| AWS WAF Security Pillar | AS + IaC |
| GCP Architecture Framework Security | AS + IaC |
| SLSA | SC |
| STRIDE threat modeling | TM |
| Component boundary security | AS + TM |
| `[CUSTOM]` rules extension | C (registry) + targeted sub |
| Cross-Guardian handoff (Privacy Guardian for PHI) | C |

**Result: zero coverage gaps.** Every monolith concern has at least one sub-Guardian owner. SC-005 satisfied at the design level.

## 15. Cross-Domain Findings — expected scenarios

Based on the coverage map, these are the most likely cross-domain finding patterns the coordinator will need to handle (FR-010):

| Scenario | Subs that flag | Dedup or cross-domain? |
|---|---|---|
| Hardcoded AWS key in source `.ts` file | AS (CWE-798) + SE (gitleaks rule) | **Dedup** (same file, line, CWE) — merge to one CRITICAL with both perspectives |
| Hardcoded AWS key in `infra/main.tf` | SE (gitleaks rule) + IaC (checkov rule for embedded secrets) | **Cross-domain** `[SE+IaC]` (different categories: secret hygiene vs. IaC misconfig) |
| Vulnerable transitive dependency that triggers a known exploit pattern in code | SC (CVE) + AS (Semgrep rule for the pattern) | **Cross-domain** `[SC+AS]` |
| K8s pod running as root in `deployment.yaml` | IaC (kube-bench / polaris) + TM (privilege escalation surface) | **Cross-domain** `[IaC+TM]` |
| Insecure deserialization in code that reads from S3 bucket | AS (deserialization rule) + IaC (S3 bucket public-read) | **Cross-domain** `[AS+IaC]` |
| Missing rate limiting on auth endpoint | AS (code review) + TM (DoS attack surface) | **Cross-domain** `[AS+TM]` (both substantive perspectives) |

The coordinator's dedup logic (FR-007) uses `(file, line, cwe||category)`. The "category" axis is what distinguishes dedup from cross-domain — same category = duplicate; different categories = cross-domain.

## 16. Notes & Open Items

- **Trivy is multi-tool**: `trivy fs` produces findings in 3 categories (deps, IaC misconfig, secrets). The coordinator's Tools Report should run trivy once at the parent level and route findings into SC, IaC, and SE inboxes by finding type. Avoid having each sub run trivy independently.
- **`bandit` is the only SAST that's clearly AS** in the SCA list — keep it in AS's tool inventory, NOT SC's, even though it's listed alongside `pip-audit` in the monolith.
- **Cross-Guardian handoffs** (e.g., "PHI → Privacy Guardian") stay at the coordinator level. Subs MUST NOT directly invoke other Guardians.
- **Logging hygiene** is split between security-side (AS — logging security events, no tokens) and privacy-side (Privacy Guardian — no PII/PHI). The coordinator handles this routing in `Step 0.1 / Refinement` mode by checking if data classification surfaces require Privacy Guardian.
- **Threat modeling integration with code review**: TM is design-time but contributes to code review when reviewing whether the code matches the threat model. Coordinator may invoke TM during code-review fan-out for that purpose.
