<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://img.shields.io/badge/%F0%9F%9B%A1%EF%B8%8F_SDLC-Guardian_Agents-00D4AA?style=for-the-badge&labelColor=1a1a2e&logo=githubcopilot&logoColor=white">
    <img alt="SDLC Guardian Agents" src="https://img.shields.io/badge/%F0%9F%9B%A1%EF%B8%8F_SDLC-Guardian_Agents-00D4AA?style=for-the-badge&labelColor=1a1a2e&logo=githubcopilot&logoColor=white">
  </picture>
</p>

<h1 align="center">SDLC Guardian Agents</h1>

<p align="center">
  <b>Opinionated AI agents that enforce software engineering standards across your entire development lifecycle.</b>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/OWASP-Top_10_2025-orange?style=flat-square" alt="OWASP">
  <img src="https://img.shields.io/badge/Google-Engineering_Practices-blue?style=flat-square" alt="Google">
  <img src="https://img.shields.io/badge/Azure-Well--Architected-0078D4?style=flat-square" alt="Azure WAF">
  <img src="https://img.shields.io/badge/AWS-Well--Architected-FF9900?style=flat-square" alt="AWS WAF">
  <img src="https://img.shields.io/badge/Clean_Code-SOLID-green?style=flat-square" alt="Clean Code">
  <img src="https://img.shields.io/badge/TDD-Test_First-red?style=flat-square" alt="TDD">
  <img src="https://img.shields.io/badge/SRE-SLI%2FSLO-purple?style=flat-square" alt="SRE">
  <img src="https://img.shields.io/badge/Hexagonal-Ports_%26_Adapters-teal?style=flat-square" alt="Hexagonal">
  <img src="https://img.shields.io/badge/Contract--First-API_Design-gold?style=flat-square" alt="Contract-First">
</p>

---

## Rewritable by Design

> *Boundaries and contracts are permanent. Implementations are replaceable.*

This is the foundational principle behind every Guardian agent. AI can generate, refactor, or rewrite code — but only when components have **clear boundaries, defined interfaces, and behavior-based specifications**.

### Why Components Must Be Rewritable

Traditional monolithic thinking creates code where everything knows about everything. Changing one piece means understanding — and risking — the whole system. In the AI era, this is the bottleneck: an AI agent can rewrite a function in seconds, but only if it can reason about that function in isolation.

**Rewritable components** solve this by ensuring:

| Principle | What It Means | Standard |
|-----------|--------------|----------|
| **Contract-first** | Interface exists before implementation — the contract is the source of truth | Hexagonal / Ports & Adapters |
| **Single responsibility** | One component, one reason to change — if you need "and" to describe it, split it | SOLID (SRP) |
| **No leaked dependencies** | Components don't import from sibling internals — only through defined interfaces | Clean Architecture (Dependency Rule) |
| **Behavior-specified** | Tests describe WHAT it does, not HOW — tests survive rewrites | BDD / Spec-Driven Development |
| **Bounded scope** | Clear boundary, explicit inputs/outputs, own data model | DDD Bounded Contexts |
| **Independently deployable** | Can be replaced without redeploying the system | Composable Architecture |

### Architecture Patterns That Enable This

```
┌──────────────────────────────────────────────────────────────────┐
│                    Hexagonal Architecture                        │
│                                                                  │
│   ┌─────────────┐     ┌──────────────────┐     ┌─────────────┐  │
│   │  REST API    │     │                  │     │  Database    │  │
│   │  Adapter     │────▶│   CORE LOGIC     │◀────│  Adapter     │  │
│   └─────────────┘     │   (Business      │     └─────────────┘  │
│   ┌─────────────┐     │    Rules)         │     ┌─────────────┐  │
│   │  CLI         │     │                  │     │  Queue       │  │
│   │  Adapter     │────▶│   Depends on     │◀────│  Adapter     │  │
│   └─────────────┘     │   PORTS only     │     └─────────────┘  │
│                        └──────────────────┘                      │
│                         ▲              ▲                         │
│                    [Port: In]     [Port: Out]                    │
│                    (Interface)    (Interface)                    │
│                                                                  │
│   Adapters are REWRITABLE — core logic never changes             │
└──────────────────────────────────────────────────────────────────┘
```

### How Each Guardian Enforces This

| Guardian | How It Enforces Rewritability |
|----------|------------------------------|
| **PO Guardian** | Tickets must define component boundary, interface contract, and behavior specs before implementation starts |
| **Developer Guardian** | Code must follow ports & adapters, interface-first development, no cross-component imports |
| **QA Guardian** | Tests must be behavior-based (survive rewrites) and include contract tests for interfaces |
| **Security Guardian** | Validates interface boundaries aren't bypassed, dependency direction is correct |
| **Code Review Guardian** | Checks coupling/cohesion, boundary violations, leaked dependencies, component rewritability |

---

## Why This Exists

AI coding assistants know how to write code. But **writing code is not the problem** — writing code that's consistent, secure, tested, observable, and maintainable across teams and projects is.

Every experienced engineer has seen it:
- Feature specs that miss security, observability, or edge cases
- Code that works but ignores the architecture patterns already in the codebase
- Unit tests that exist but integration and E2E tests that don't
- Security reviews that happen after the PR, not before the design
- Different projects by the same team following completely different standards

**SDLC Guardian Agents solve this by embedding industry standards directly into the AI's workflow.** Instead of relying on developers to remember every best practice, the agents enforce them automatically — every time, every project.

### The Philosophy

AI has absorbed knowledge from thousands of engineering organizations — Google's engineering practices, Microsoft's SDL, OWASP security standards, Clean Code principles, SRE observability patterns. But this knowledge is passive — it only surfaces when explicitly asked.

**We make it active.** Five specialized agents, each an expert in one phase of the SDLC, each enforcing standards from the world's best engineering organizations. They don't just suggest — they audit, research, scan, and produce structured, actionable output.

```
┌──────────────────────────────────────────────────────────────────────────┐
│                        SDLC Guardian Agents                              │
│                                                                          │
│  "I want to build     "Implement      "Write        "Check      "Review  │
│   user uploads"        this ticket"    tests"        security"   code"   │
│        │                    │             │              │          │     │
│        ▼                    ▼             ▼              ▼          ▼     │
│   ┌─────────┐        ┌──────────┐   ┌────────┐   ┌──────────┐ ┌───────┐ │
│   │   PO    │        │Developer │   │   QA   │   │ Security │ │ Code  │ │
│   │Guardian │───────▶│ Guardian │──▶│Guardian│──▶│ Guardian │▶│Review │ │
│   │         │        │          │   │        │   │          │ │Guard. │ │
│   └─────────┘        └──────────┘   └────────┘   └──────────┘ └───────┘ │
│    Research &          TDD: test     Integration   OWASP scans  Linters  │
│    13-section          first, then   E2E, API      + manual     + design │
│    ticket              implement     contract      review       review   │
│                                                                          │
│  Standards: INVEST │ SOLID │ OWASP │ Google SRE │ Clean Code │ WAF      │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## The Five Guardians

### 🎯 Product Owner Guardian
**Role:** Process enforcer and specification writer

Takes vague feature requests and produces comprehensive, developer-ready tickets through research. Audits projects for missing documentation. Scaffolds standard project docs.

| What it does | Standards |
|---|---|
| Writes 13-section feature specs (user story, API design, security, observability, data model, ...) | INVEST criteria, BDD Given/When/Then |
| Researches codebase, GitHub, and web before writing | — |
| Audits projects against 25-item health checklist | Google Eng Practices, SRE |
| Scaffolds README, ARCHITECTURE, CONTRIBUTING, SECURITY, ADRs | GitHub Community Health |

**Trigger:** *"I want to build X"*, *"create a ticket"*, *"audit this project"*, *"scaffold project docs"*

### 👨‍💻 Developer Guardian
**Role:** TDD-first implementation

The only agent that writes production code. Follows existing architecture patterns, writes unit tests before implementation, and pre-checks against Security and Code Review standards before handing off.

| What it does | Standards |
|---|---|
| TDD: writes failing tests → implements → refactors | TDD, Kent Beck |
| Follows existing codebase patterns and conventions | Clean Code, SOLID |
| Pre-complies with Security + Code Review standards | OWASP, Google Eng |
| Writes documentation alongside code | — |

**Trigger:** *"implement this"*, *"build this"*, *"code this up"*, *"refactor"*

### 🧪 QA Guardian
**Role:** Testing beyond unit tests

Writes integration, E2E, API contract, and performance tests. Traces every test to acceptance criteria. Finds coverage gaps the Developer missed. Unit tests are Developer scope — QA handles everything above.

| What it does | Standards |
|---|---|
| Integration, E2E, API contract, performance tests | Testing Trophy, Test Pyramid |
| Traces tests to PO ticket acceptance criteria | BDD, Given/When/Then |
| Coverage gap analysis | — |
| Edge case specialist (boundary, concurrent, error paths) | — |

**Trigger:** *"write tests"*, *"test this"*, *"coverage analysis"*, *"E2E tests"*

### 🛡️ Security Guardian
**Role:** Security auditor with automated scanning

Runs a deterministic security scan pipeline (Semgrep, Gitleaks, Trivy, dependency audits), then does manual code review. Classifies findings by OWASP category and severity. A tool might flag a warning — the agent determines if it's actually critical.

| What it does | Standards |
|---|---|
| Automated scans: Semgrep, Gitleaks, Trivy, dep audits | OWASP Top 10 2025 |
| Manual security review for logic flaws | Azure, AWS, GCP Well-Architected |
| Proactive requirements refinement (asks security questions before coding) | Microsoft SDL |
| Structured handoff report with source citations | — |

**Trigger:** *"check for security"*, *"security review"*, *"scan for vulnerabilities"*

### 📋 Code Review Guardian
**Role:** Code quality and design auditor

Runs language-specific linters, then reviews for architecture, design patterns, naming, performance, and documentation quality. Cites Google Engineering Practices, Microsoft guidelines, and Clean Code for every finding.

| What it does | Standards |
|---|---|
| Parallel linters: ESLint, Pylint+Ruff, Clippy, dotnet, Checkstyle | — |
| 7 review domains: quality, design, testing, naming, errors, performance, docs | Google Eng Practices |
| SOLID principle validation | Clean Code, SOLID |
| PR size and review quality checks | Microsoft Code Review |

**Trigger:** *"review my code"*, *"check code quality"*, *"lint"*

---

## Quick Start

### Install (one command)

```bash
unzip sdlc-guardian-agents.zip -d ~/.copilot/
```

Or from source:

```bash
git clone https://github.com/vbomfim/sdlc-guardian-agents.git
cd sdlc-guardian-agents
./package.sh --install
```

### Use

Open Copilot CLI in any project:

```bash
copilot
```

The agents are active immediately. Just describe what you need:

| You say | Agent responds |
|---------|---------------|
| *"I want to add user file uploads"* | PO Guardian researches, writes 13-section ticket |
| *"implement ticket #42"* | Developer Guardian: TDD → unit tests → code |
| *"write integration tests"* | QA Guardian: tests from acceptance criteria |
| *"check for security"* | Security Guardian: scans + manual review |
| *"review my code"* | Code Review Guardian: linters + design review |
| *"audit this project"* | PO Guardian: 25-item health checklist |

### Install Security Scanning Tools

```bash
bash ~/.copilot/skills/security-guardian/setup.sh        # Install tools
bash ~/.copilot/skills/security-guardian/setup.sh --scan  # Run scans
bash ~/.copilot/skills/security-guardian/install-hooks.sh # Git hooks
```

---

## How It Works

### Auto-Delegation

You talk to the **default Copilot agent** normally. Based on your request, it automatically delegates to the right Guardian as a background task. You keep working — the Guardian reports back when done.

```
You: "check for security"
Default agent: "🛡️ Security Guardian scanning in background..."
You: (keep working on other things)
[notification] Security Guardian completed
Default agent: "Found 3 issues. Want me to create GitHub issues?"
```

### Standards Enforcement

Every finding, requirement, and recommendation cites its source:

| Tag | Standard |
|-----|----------|
| `[OWASP-A01]`–`[OWASP-A10]` | OWASP Top 10 (2025) |
| `[AZURE-WAF]` | Azure Well-Architected Framework |
| `[AWS-WAF]` | AWS Well-Architected Framework |
| `[GCP-AF]` | Google Cloud Architecture Framework |
| `[GOOGLE-ENG]` | Google Engineering Practices |
| `[MS-REVIEW]` | Microsoft Code Review Guidelines |
| `[CLEAN-CODE]` | Clean Code (Robert C. Martin) |
| `[SOLID]` | SOLID Principles |
| `[INVEST]` | INVEST Criteria for user stories |
| `[GOOGLE-SRE]` | Google SRE (SLIs, SLOs, error budgets) |
| `[TDD]` | Test-Driven Development |
| `[BDD]` | Behavior-Driven Development |
| `[CUSTOM]` | Project-specific rules |

### Consistency Across Projects

The agents live at `~/.copilot/` (user-level), so **every project on your machine gets the same standards automatically**. One install, consistent enforcement everywhere.

---

## Architecture

```
~/.copilot/
├── agents/                              ← Agent definitions
│   ├── security-guardian.agent.md
│   ├── code-review-guardian.agent.md
│   ├── po-guardian.agent.md
│   ├── dev-guardian.agent.md
│   └── qa-guardian.agent.md
├── instructions/                        ← Auto-delegation rules
│   ├── security-guardian.instructions.md
│   ├── code-review-guardian.instructions.md
│   ├── po-guardian.instructions.md
│   ├── dev-guardian.instructions.md
│   └── qa-guardian.instructions.md
└── skills/                              ← Operational tools
    ├── security-guardian/               ← Semgrep, Gitleaks, Trivy
    │   ├── setup.sh
    │   ├── install-hooks.sh
    │   └── hooks/pre-push
    └── code-review-guardian/            ← ESLint, Pylint, Clippy
        └── setup.sh
```

### For Contributors

```bash
git clone https://github.com/vbomfim/sdlc-guardian-agents.git
cd sdlc-guardian-agents

# Edit agents in src/
# Build and install
./package.sh --install

# Package for distribution
./package.sh

# Uninstall
./package.sh --uninstall
```

---

## License

MIT

---

<p align="center">
  <i>Built with <a href="https://docs.github.com/copilot">GitHub Copilot CLI</a> — enforcing the standards that make great software.</i>
</p>
