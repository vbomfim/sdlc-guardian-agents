<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://img.shields.io/badge/%F0%9F%9B%A1%EF%B8%8F_SDLC-Guardian_Agents-00D4AA?style=for-the-badge&labelColor=1a1a2e&logo=githubcopilot&logoColor=white">
    <img alt="SDLC Guardian Agents" src="https://img.shields.io/badge/%F0%9F%9B%A1%EF%B8%8F_SDLC-Guardian_Agents-00D4AA?style=for-the-badge&labelColor=1a1a2e&logo=githubcopilot&logoColor=white">
  </picture>
</p>

<h1 align="center">SDLC Guardian Agents for GitHub Copilot</h1>

<p align="center">
  <b>Opinionated AI agents that enforce software engineering standards across your entire development lifecycle.</b>
</p>

---

<p align="center">
  <img src="assets/rewritable-by-design-logo.svg" alt="Rewritable by Design" width="700">
</p>

### Motivation

Software development is undergoing a fundamental shift. AI agents can now generate, refactor, and rewrite code at unprecedented speed. However, this capability is only effective when the AI can operate within a clearly defined scope. A component with ambiguous boundaries, leaked dependencies, or shared state cannot be safely rewritten — by a human or an AI — without risking cascading side effects across the system.

Traditional architectural principles — cohesion, coupling, separation of concerns — have always advocated for modularity. **Rewritable by Design takes these principles to their practical conclusion:** if a component cannot be rewritten from its interface definition and behavioral tests alone, its boundary is insufficiently defined.

**Rewritable by Design** establishes that software systems should be composed of components with well-defined boundaries and stable contracts, such that any individual component can be replaced, rewritten, or regenerated without requiring changes to — or knowledge of — the rest of the system.

### The Idea-First Model

Everything begins with an **idea** — the intent, the feature, the problem to be solved. The idea exists independently of implementation.

A well-designed architecture serves as the channel through which ideas become components. When a developer — or an AI agent — receives an idea, the architecture determines how that idea decomposes into bounded, contractually-defined units of work. Each unit has:

- A **boundary** that defines what is inside and what is outside its scope
- A **contract** (interface) that specifies how it communicates with the rest of the system
- A **behavioral specification** (tests) that describes what it does, not how it does it

The implementation within each unit is disposable. It can be written today, rewritten tomorrow, and replaced entirely next quarter — provided the contract and behavior remain satisfied.

### Core Principles

| Principle | Definition | Theoretical Basis |
|-----------|-----------|-------------------|
| **Contract-first** | The interface is defined before implementation. The contract is the source of truth, not the code. | Hexagonal Architecture (Cockburn), Ports & Adapters |
| **Single responsibility** | Each component has exactly one reason to change. If describing it requires "and", it should be split. | SOLID — Single Responsibility Principle (Martin) |
| **No leaked dependencies** | Components interact exclusively through defined interfaces. No component imports from a sibling's internal modules. | Clean Architecture — Dependency Rule (Martin) |
| **Behavior-specified** | Tests describe observable behavior, not implementation details. Tests must survive a complete rewrite of the component. | Behavior-Driven Development (North), Spec-Driven Development |
| **Bounded scope** | Each component owns its data model and has explicit inputs and outputs. No shared database tables or global state across boundaries. | Domain-Driven Design — Bounded Contexts (Evans) |
| **Independently replaceable** | A component can be replaced without modifying or redeploying any other component in the system. | Composable Architecture, Microservices Principles |

---

# SDLC Guardian Agents

## Overview

SDLC Guardian Agents are a suite of seven specialized AI agents for [GitHub Copilot CLI](https://docs.github.com/copilot), each responsible for a distinct phase of the software development lifecycle. They enforce industry standards automatically, ensuring consistent quality across projects and teams.

The agents operate on a delegation model: the default Copilot agent recognizes the user's intent and delegates to the appropriate Guardian as a background task. The user continues working and is notified when the Guardian completes its analysis. The default agent then acts on the Guardian's findings — creating issues, applying fixes, or committing code.

### The Problem

AI coding assistants generate code effectively. What they do not inherently enforce is *consistency* — across projects, across teams, across the lifecycle. Without structured guidance:

- Feature specifications miss security, observability, or edge cases
- Code is written without following the architecture patterns already in the codebase
- Unit tests exist but integration and end-to-end tests do not
- Security reviews occur after implementation, not before design
- Different projects by the same team follow different standards

### Enforcement Through SDLC Guardian Agents

Seven agents, each encoding the standards of recognized industry authorities, operationalize these principles across the development lifecycle:

| Phase | Guardian | Enforcement |
|-------|----------|-------------|
| Specification | **PO Guardian** | Tickets must define component boundary, interface contract, and behavioral acceptance criteria before implementation begins |
| Implementation | **Developer Guardian** | Code must follow ports & adapters, interface-first development, and strict dependency direction (inward only) |
| Testing | **QA Guardian** | Tests must be behavior-based (survive rewrites) and include contract tests that validate interface stability |
| Security | **Security Guardian** | Validates that interface boundaries are not bypassed and that dependency direction does not expose core logic to untrusted adapters |
| Quality | **Code Review Guardian** | Checks coupling/cohesion metrics, boundary violations, leaked dependencies, and component rewritability |
| Infrastructure | **Platform Guardian** | Validates cluster security, network policies, resource configuration, and CIS Benchmark compliance |
| Operations | **Delivery Guardian** | Reviews deployment strategy, observability, SLI/SLO definitions, BCDR plans, and incident response readiness |

### Automatic Workflow Orchestration

The Guardians are not invoked manually — the default Copilot agent enforces the pipeline automatically through quality gates:

```
💡 Idea
  │
  ├─ No ticket? → 🎯 PO Guardian creates specification (auto)
  │
  ▼
🎯 Specification exists
  │
  ▼
👨‍💻 Developer Guardian implements (TDD + unit tests)
  │
  │ ── UAT Checkpoint (offered to user — opt-in or auto in autopilot) ──
  │
  │ User tests the worktree checkout + pair-fixes with Developer Guardian
  │
  │ ── Post-Implementation Gate (auto-triggered after UAT done/skipped, parallel) ──
  │
  ├─── 🧪 QA Guardian ──────────────┐
  ├─── 🛡️ Security Guardian ────────┤  background, simultaneous
  ├─── 📋 Code Review Guardian ─────┘
  │
  ▼
  Combined results → fix critical/high findings
  │
  │ ── Pre-Deployment Gate (auto-triggered) ──
  │
  ├─── ⚙️ Platform Guardian ────────┐  if K8s manifests changed
  ├─── 🚀 Delivery Guardian ────────┘  if deployment config changed
  │
  ▼
✅ PR → Merge → Deploy

── Operational Track (parallel, non-blocking) ──

⏰ Craig (scheduler)
  │
  └─ session.send({ prompt }) → 🔧 Operator (background)
                                   ├─ Screenshots (Playwright MCP)
                                   ├─ Reports (session_store)
                                   ├─ Health checks (curl)
                                   ├─ Errands (web data, GitHub)
                                   └─ Housekeeping (worktrees, branches)
                                        │
                                        └─ Results → ~/.copilot/reports/
```

**Five quality gates, enforced automatically:**

| Gate | When | What happens |
|------|------|-------------|
| **Pre-Implementation** | User asks to implement without a ticket | PO Guardian invoked to create specification first |
| **UAT Checkpoint** | Developer Guardian completes | User offered a chance to test the worktree + pair-fix with Developer Guardian (auto-entered in autopilot mode). After 3 pair-fix iterations the orchestrator recommends moving to the review gate. |
| **Post-Implementation** | UAT done or skipped | QA + Security + Code Review invoked in parallel automatically |
| **Pre-Merge** | All Guardian reviews pass + CI checks pass | Default agent presents combined results; user confirms merge approval |
| **Pre-Deployment** | User asks to deploy | Platform + Delivery Guardians verify infrastructure and operations readiness |

The user never needs to remember which Guardian to invoke. The workflow enforces it.

---

## The Seven Guardians

<img src="assets/banner-po.svg" alt="Product Owner Guardian" width="500">

The process guardian and specification writer. Takes ideas and produces comprehensive, developer-ready tickets through research. Audits projects for documentation gaps and scaffolds standard project documents.

| Capability | Standards |
|---|---|
| 14-section feature specifications (component design, API, security, observability, data model) | INVEST criteria, BDD Given/When/Then |
| Codebase, GitHub, and web research before writing | — |
| 25-item project health audit | Google Engineering Practices, SRE |
| Document scaffolding (README, ARCHITECTURE, CONTRIBUTING, SECURITY, ADRs) | GitHub Community Health |

**Trigger:** *"I want to build X"*, *"create a ticket"*, *"audit this project"*, *"scaffold project docs"*

<img src="assets/banner-dev.svg" alt="Developer Guardian" width="500">

The implementation agent. The only Guardian that writes production code. Follows Test-Driven Development, matches existing architecture patterns, and pre-validates against Security and Code Review standards before handoff.

| Capability | Standards |
|---|---|
| TDD: failing tests → implementation → refactoring | Test-Driven Development (Beck) |
| Interface-first, ports & adapters, no cross-component imports | Hexagonal Architecture (Cockburn), Clean Architecture (Martin) |
| Pre-compliance with Security and Code Review standards | OWASP, SOLID, Google Engineering Practices |
| Documentation written alongside code | — |

**Trigger:** *"implement this"*, *"build this"*, *"code this up"*, *"refactor"*

<img src="assets/banner-qa.svg" alt="QA Guardian" width="500">

The verification agent. Writes integration, end-to-end, API contract, and performance tests. Traces every test to acceptance criteria from the PO ticket. Identifies coverage gaps the Developer missed. Unit tests are Developer scope — QA handles everything above unit level.

| Capability | Standards |
|---|---|
| Integration, E2E, API contract, performance tests | Testing Trophy (Dodds), Test Pyramid (Fowler) |
| Browser-based E2E tests via Playwright MCP (when available) | — |
| Acceptance criteria traceability | BDD, Given/When/Then |
| Coverage gap analysis and edge case identification | — |
| Behavior-based tests that survive component rewrites | Spec-Driven Development |

**Trigger:** *"write tests"*, *"test this"*, *"coverage analysis"*, *"E2E tests"*

<img src="assets/banner-security.svg" alt="Security Guardian" width="500">

The security auditor. Runs a deterministic scan pipeline (Semgrep, Gitleaks, Trivy, dependency audits), then performs manual code review. Classifies findings by OWASP category and severity with source citations. A scanning tool may flag a warning — the Guardian determines whether it constitutes a critical risk.

| Capability | Standards |
|---|---|
| Automated scanning: Semgrep, Gitleaks, Trivy, dependency audits | OWASP Top 10 (2025) |
| Manual security review for logic and design flaws | Azure, AWS, GCP Well-Architected Frameworks |
| Proactive requirements refinement | Microsoft SDL |
| Structured handoff report with source and justification per finding | — |

**Trigger:** *"check for security"*, *"security review"*, *"scan for vulnerabilities"*

<img src="assets/banner-codereview.svg" alt="Code Review Guardian" width="500">

The quality auditor. Runs language-specific linters in parallel, then reviews for architecture, design patterns, naming, performance, and documentation quality. Every finding cites its source standard. **Runs two instances in parallel with different AI models** (Claude Opus 4.6 + GPT 5.4) for independent perspectives — findings from both are merged with confidence scoring.

| Capability | Standards |
|---|---|
| **Dual-model review:** Claude Opus 4.6 + GPT 5.4 in parallel | — |
| Parallel linters: ESLint, Pylint+Ruff, Clippy, dotnet format, Checkstyle | — |
| 8 review domains: quality, design, rewritability, testing, naming, errors, performance, documentation | Google Engineering Practices |
| SOLID principle and component boundary validation | Clean Code (Martin), SOLID |
| PR size and review process checks | Microsoft Code Review Guidelines |

**Trigger:** *"review my code"*, *"check code quality"*, *"lint"*

<img src="assets/banner-platform.svg" alt="Platform Guardian" width="500">

Kubernetes platform security and infrastructure auditor. Scans cluster configuration with kube-bench, kube-score, polaris, kubeaudit, and trivy. Audits RBAC, pod security standards, network policies, resource management, and CIS Benchmark compliance.

| Capability | Standards |
|---|---|
| Automated scanning: kube-bench, kube-score, polaris, kubeaudit, trivy | CIS Kubernetes Benchmark |
| RBAC, pod security, managed identity, container registry validation | OWASP K8s Security, Pod Security Standards |
| Network policies, ingress, service mesh, TLS configuration | NIST SP 800-190 |
| Resource requests/limits, HPA/VPA, PDBs, compliance | Azure/AWS Well-Architected |

**Trigger:** *"audit cluster"*, *"check k8s security"*, *"CIS benchmark"*, *"network policies"*

<img src="assets/banner-delivery.svg" alt="Delivery Guardian" width="500">

Deployment and operations specialist. Reviews deployment strategies (blue-green, canary, A/B), CI/CD pipelines, observability stack (Prometheus, Grafana, Azure Monitor), SLI/SLO definitions, BCDR plans, testing environments (chaos, fuzz, load, penetration), and incident response (post-mortems, runbooks, on-call).

| Capability | Standards |
|---|---|
| Multi-environment deployment: blue-green, canary, A/B, Argo Rollouts | Kubernetes Deployment, GitOps |
| CI/CD pipeline audit: stages, quality gates, automated rollback | Twelve-Factor App |
| Observability: Prometheus, Grafana, Azure Monitor, distributed tracing | Google SRE |
| SLI/SLO definitions, burn-rate alerting, BCDR with failover plans | Google SRE, Well-Architected |
| Testing: chaos engineering, fuzz, penetration, load (k6), regression | Principles of Chaos Engineering |
| Incident response: post-mortem templates, runbooks, on-call, SLA tracking | Google SRE |

**Trigger:** *"review deployment"*, *"check pipeline"*, *"setup monitoring"*, *"define SLOs"*, *"BCDR plan"*, *"post-mortem"*, *"incident review"*

---

## Operational Agents

Beyond the seven Guardians, the suite includes operational agents that execute tasks rather than review or audit.

### Operator — Task Runner

The Operator executes routine operational chores and errands. It is NOT a Guardian — it does not review code, write tests, or produce severity-rated findings. It runs tasks and writes results to `~/.copilot/reports/`.

| Capability | Tools |
|---|---|
| Screenshot capture — web pages, dashboards, monitoring UIs | Playwright MCP (optional) |
| Report generation — weekly recaps, Guardian finding summaries | session_store SQL |
| Health monitoring — HTTP endpoint checks with status and response time | bash (`curl`) |
| Errands — fetch data from web pages, extract metrics, run user-defined tasks | Playwright MCP, bash, GitHub MCP |
| Housekeeping — worktree cleanup, branch pruning, disk usage reports | bash (`git`, `du`) |

**Trigger:** *"take a screenshot"*, *"generate a report"*, *"weekly recap"*, *"check health endpoint"*, *"clean up worktrees"*, *"disk usage"*

**Background execution:** The Operator always runs in background mode (`mode: "background"`) so the user's coding session is not blocked.

**Craig integration:** Craig can schedule Operator tasks — morning dashboard screenshots, weekly finding recaps, periodic health checks. See [USER-GUIDE.md](USER-GUIDE.md) for examples.

---

## Getting Started

### Prerequisites

See **[PREREQUISITES.md](PREREQUISITES.md)** for the complete setup guide — covers macOS, Linux, and Windows with install commands for all scanning and analysis tools used by the Guardians.

### Installation

```bash
unzip sdlc-guardian-agents.zip -d ~/.copilot/
```

Or from source:

```bash
git clone https://github.com/vbomfim/sdlc-guardian-agents.git
cd sdlc-guardian-agents
./package.sh --install
```

### Usage

Launch Copilot CLI in any project:

```bash
copilot
```

The agents activate immediately. Describe what you need in natural language:

| Input | Guardian | Output |
|-------|----------|--------|
| *"I want to add user file uploads"* | PO Guardian | 14-section feature specification |
| *"implement ticket #42"* | Developer Guardian | TDD implementation with unit tests |
| *"write integration tests"* | QA Guardian | Tests traced to acceptance criteria |
| *"check for security"* | Security Guardian | Scan results with OWASP classification |
| *"review my code"* | Code Review Guardian | Linter results with design analysis |
| *"audit cluster security"* | Platform Guardian | CIS Benchmark + K8s security audit |
| *"review deployment pipeline"* | Delivery Guardian | CI/CD, observability, BCDR analysis |
| *"audit this project"* | PO Guardian | 25-item project health checklist |
| *"take a screenshot of the dashboard"* | Operator | Screenshot saved to `~/.copilot/reports/` |
| *"generate a weekly recap"* | Operator | Markdown report with Guardian findings summary |

### Verify Tool Availability

The agents check for required tools before scanning. If anything is missing, they'll ask you to install it. See [PREREQUISITES.md](PREREQUISITES.md) for installation commands per platform.

---

## Delegation Model

The agents operate through automatic delegation. The user interacts with the default Copilot agent, which identifies security, quality, testing, implementation, or specification requests and delegates to the appropriate Guardian in background mode.

```
User: "check for security"
Default agent: "🛡️ Security Guardian scanning in background..."
User: (continues working)
[notification] Security Guardian completed
Default agent: "Found 3 issues. Want me to create GitHub issues?"
```

This model provides two properties:
1. **Non-blocking** — the user continues working while the Guardian operates
2. **Separation of concerns** — read-only Guardians (PO, QA, Security, Code Review) analyze and report; the default agent executes changes

---

## Standards Reference

Every finding, requirement, and recommendation produced by a Guardian cites its source standard:

| Tag | Standard | Authority |
|-----|----------|-----------|
| `[OWASP-A01]`–`[OWASP-A10]` | OWASP Top 10 (2025) | OWASP Foundation |
| `[AZURE-WAF]` | Azure Well-Architected Framework | Microsoft |
| `[AWS-WAF]` | AWS Well-Architected Framework | Amazon Web Services |
| `[GCP-AF]` | Google Cloud Architecture Framework | Google Cloud |
| `[GOOGLE-ENG]` | Engineering Practices | Google |
| `[MS-REVIEW]` | Code Review Guidelines | Microsoft |
| `[CLEAN-CODE]` | Clean Code | Robert C. Martin |
| `[SOLID]` | SOLID Principles | Robert C. Martin |
| `[HEXAGONAL]` | Hexagonal Architecture (Ports & Adapters) | Alistair Cockburn |
| `[CLEAN-ARCH]` | Clean Architecture (Dependency Rule) | Robert C. Martin |
| `[INVEST]` | INVEST Criteria | Bill Wake |
| `[GOOGLE-SRE]` | Site Reliability Engineering | Google |
| `[TDD]` | Test-Driven Development | Kent Beck |
| `[BDD]` | Behavior-Driven Development | Dan North |
| `[CUSTOM]` | Project-specific rules | — |

---

## File Structure

```
~/.copilot/
├── agents/                              ← Agent definitions
│   ├── po-guardian.agent.md
│   ├── dev-guardian.agent.md
│   ├── qa-guardian.agent.md
│   ├── security-guardian.agent.md
│   ├── code-review-guardian.agent.md
│   ├── platform-guardian.agent.md
│   ├── delivery-guardian.agent.md
│   └── operator.agent.md               ← Task runner (not a Guardian)
├── instructions/                        ← Auto-delegation rules
│   ├── po-guardian.instructions.md
│   ├── dev-guardian.instructions.md
│   ├── qa-guardian.instructions.md
│   ├── security-guardian.instructions.md
│   ├── code-review-guardian.instructions.md
│   ├── platform-guardian.instructions.md
│   ├── delivery-guardian.instructions.md
│   ├── operator.instructions.md         ← Operator procedures + delegation
│   ├── sdlc-workflow.instructions.md    ← Workflow orchestration rules
│   └── {guardian-name}.notes.md         ← Side-notes (7 files, advisory, user-editable)
├── extensions/                          ← Copilot CLI extensions
│   └── sdlc-guardian/                   ← Local-only workflow helper
│       ├── extension.mjs                ← SDK wiring shell (thin)
│       ├── uat-state-machine.mjs        ← Pure state-machine logic (testable)
│       └── uat-state-machine.test.mjs   ← Zero-dep tests (node --test)
├── reports/                             ← Operator output (created at runtime by Operator)
│   ├── weekly-recap-2026-04-05-170030.md
│   └── grafana-dashboard-2026-04-05-083015.png
└── skills/                              ← Operational tooling
    ├── security-guardian/               ← Tool definitions
    │   └── SKILL.md
    ├── code-review-guardian/            ← Tool definitions
    │   └── SKILL.md
    └── platform-guardian/               ← Tool definitions
        └── SKILL.md
```

---

## Side-Notes — Improvement Cycle

The side-notes system creates a **feedback loop** from review Guardians back to upstream Guardians. When a review Guardian (Security, Code Review, QA) detects a recurring pattern across multiple sessions, it proposes an advisory note for the relevant Guardian. After user approval, the note is appended to the Guardian's `.notes.md` file.

### How it works

```
Review Guardian finds recurring issue
        │
        ▼
Queries session_store for evidence (2+ past occurrences)
        │
        ▼
Proposes note in handoff report (Improvement Cycle Proposals table)
        │
        ▼
Orchestrator presents proposal to user
        │
        ▼
User approves → note appended to ~/.copilot/instructions/{guardian}.notes.md
```

### Key principles

| Principle | Detail |
|-----------|--------|
| **Additive only** | Notes add context ("also check X"), never contradict base instructions |
| **Advisory** | Guardians treat notes as additional awareness, not mandatory rules |
| **Evidence-based** | Proposals require 2+ past session occurrences (session_store query) |
| **User-approved** | Guardians never self-modify notes files — user must approve |
| **Human-editable** | Free-form markdown bullets, editable with any text editor |
| **Soft limit** | Guardians suggest pruning when a notes file exceeds ~20 items |

### Notes files

Each Guardian has its own `.notes.md` file in `~/.copilot/instructions/`:

| File | Read by | Can propose additions |
|------|---------|----------------------|
| `security-guardian.notes.md` | Security Guardian | Security, Code Review, QA |
| `code-review-guardian.notes.md` | Code Review Guardian | Security, Code Review, QA |
| `qa-guardian.notes.md` | QA Guardian | Security, Code Review, QA |
| `dev-guardian.notes.md` | Developer Guardian | Security, Code Review, QA |
| `po-guardian.notes.md` | PO Guardian | Security, Code Review, QA |
| `platform-guardian.notes.md` | Platform Guardian | Security, Code Review, QA |
| `delivery-guardian.notes.md` | Delivery Guardian | Security, Code Review, QA |

> **Naming:** Notes files use `.notes.md`, not `.instructions.md`. Files ending in `.instructions.md` are auto-loaded by the Copilot CLI runtime. Notes must be explicitly read by Guardians so they can be framed as advisory.

### Installation

`package.sh --install` creates empty seed `.notes.md` files if they don't already exist. Existing notes files are never overwritten. `package.sh --uninstall` does **not** remove notes files — they are user data.

---

## Not Yet Covered

The following SDLC areas are recognized but not yet addressed by a Guardian agent. Contributions welcome.

| Area | Description | Potential Approach |
|------|-------------|-------------------|
| **Documentation** | API documentation (OpenAPI), user guides, changelogs, release notes, onboarding documentation | Extend PO Guardian or new Docs Guardian |
| **Data Governance** | Database migrations, schema versioning, data quality, data privacy (GDPR/CCPA), data lineage | New Data Guardian |
| **FinOps** | Cloud cost monitoring, right-sizing, unused resource detection, budget alerts | Extend Platform Guardian |
| **Accessibility** | WCAG compliance, screen reader testing, keyboard navigation, color contrast | Extend QA or Code Review Guardian |

---

## Contributing

```bash
git clone https://github.com/vbomfim/sdlc-guardian-agents.git
cd sdlc-guardian-agents

# Edit agents in src/
./package.sh --install      # Build and install locally
./package.sh                # Package for distribution
./package.sh --uninstall    # Remove from ~/.copilot/
./package.sh --doctor       # Verify all prerequisites
```

---

## License

MIT

---

<p align="center">
  <i>Built with <a href="https://docs.github.com/copilot">GitHub Copilot CLI</a></i>
</p>
