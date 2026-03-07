# Security Guardian — Usage Guide

## What Is This?

Security Guardian is a Copilot CLI custom agent that acts as a security persona across your projects. It enforces consistent security standards grounded in:

- **OWASP Top 10 (2025)** — the industry standard for application security
- **Azure Well-Architected Framework** — Microsoft's 5-pillar cloud architecture guidance
- **AWS Well-Architected Framework** — Amazon's cloud security and reliability best practices
- **Google Cloud Architecture Framework** — Google's security, privacy, and compliance guidance

Every rule is tagged with its source (`[OWASP-A0X]`, `[AZURE-WAF]`, `[AWS-WAF]`, `[GCP-AF]`, `[CUSTOM]`) so you always know *why* a rule exists.

## Quick Start

### 1. Copy into your repository

```bash
# From the security-guardian-template directory
cp -r .github/agents/ /path/to/your-repo/.github/agents/
cp -r .github/instructions/ /path/to/your-repo/.github/instructions/
```

Or copy individual files:
```bash
cp .github/agents/security-guardian.agent.md /path/to/your-repo/.github/agents/
cp .github/instructions/security-standard.instructions.md /path/to/your-repo/.github/instructions/
```

### 2. The global baseline is already installed

The file `~/.copilot/copilot-instructions.md` applies to ALL projects on your machine automatically. It provides minimal security rules as a safety net.

### 3. Launch Copilot CLI in your project

```bash
cd /path/to/your-repo
copilot
```

## How to Use the Agent

### Invoking Security Guardian

Use the `/agent` command in Copilot CLI to browse and select the Security Guardian agent. Once selected, it will act as your security expert.

### Three Operating Modes

When you invoke the agent, tell it which mode you need:

#### Design Review
Ask Security Guardian to review your architecture or design documents.

```
Review the architecture in ARCHITECTURE.md for security risks.
Focus on data flow, trust boundaries, and access control design.
```

Output: A structured threat model with findings rated by severity, tagged with standards, and including specific recommendations.

#### Code Review
Ask Security Guardian to review code changes.

```
Review the changes in src/auth/ for security vulnerabilities.
```

Or review a diff:
```
Review the current git diff for security issues.
```

Output: A security checklist with findings mapped to OWASP categories, exact file/line references, and fix guidance.

#### Implementation Guidance
Ask Security Guardian to help you write secure code.

```
Help me implement JWT authentication for this Express API.
Use the secure patterns from our security standard.
```

Output: Production-ready code with security best practices baked in, tagged with the standards each pattern satisfies.

## How Auto-Applied Rules Work

The file `.github/instructions/security-standard.instructions.md` has a YAML frontmatter:

```yaml
---
applyTo: "**/*.{ts,tsx,js,jsx,mjs,cjs,cs,rs,py,java,go,rb,php,swift,kt,scala}"
---
```

This means its rules are **automatically included** whenever Copilot CLI works with code files matching those patterns — no need to invoke the agent. These are the always-on guardrails.

## Customizing Rules

### Adding Project-Specific Rules

Add `[CUSTOM]` rules in your project's `AGENTS.md` or in a new instructions file:

```markdown
# File: .github/instructions/project-security.instructions.md
---
applyTo: "src/**/*.ts"
---

### [CUSTOM] Per-User Database Isolation
- Each user MUST get an isolated database: `db_user_<hash(user_id)>`
- Backend derives DB name from JWT token hash
- Justification: Privacy-first architecture for GDPR compliance
```

### Relaxing a Rule

If a project needs to relax an OWASP rule, document the justification:

```markdown
### [CUSTOM] Relaxed CORS for Development API
- Allow wildcard CORS on `/api/dev/*` endpoints ONLY
- Overrides: [OWASP-A02] strict CORS policy
- Justification: Internal dev tooling, not production-facing
- Mitigations: Network-level access control, separate deployment
```

## File Structure Summary

```
~/.copilot/
└── copilot-instructions.md          ← Global baseline (all projects)

your-repo/
├── .github/
│   ├── agents/
│   │   └── security-guardian.agent.md    ← The agent (invoke via /agent)
│   ├── instructions/
│   │   ├── security-standard.instructions.md  ← Auto-applied rules
│   │   └── project-security.instructions.md   ← [CUSTOM] rules (optional)
│   └── workflows/
│       └── security-scan.yml             ← CI/CD automated enforcement
├── tools/
│   ├── setup.sh                          ← Tool installer + scanner
│   ├── install-hooks.sh                  ← Git hook installer
│   └── hooks/
│       └── pre-push                      ← Warns/blocks if scan is stale
└── AGENTS.md                        ← Project-specific overrides (optional)
```

## Automated Security Tools

Security Guardian includes a setup script and CI/CD workflow to enforce rules with real tools.

### Quick Start

```bash
# Install security tools (auto-detects your project's languages)
./tools/setup.sh

# Check what's already installed
./tools/setup.sh --check

# Run a full security scan
./tools/setup.sh --scan
```

### What Gets Installed

| Tool | What It Does | OWASP Rules |
|------|-------------|-------------|
| **Semgrep** | Static analysis (SAST) — finds injection, auth issues, misconfig | A01–A10 |
| **Gitleaks** | Detects hardcoded secrets in source code | A04 |
| **Trivy** | Scans dependencies, containers, and IaC for vulnerabilities | A02, A03 |
| **npm audit** | Node.js dependency vulnerabilities | A03 |
| **cargo audit + deny** | Rust crate vulnerabilities and license compliance | A03 |
| **pip-audit + bandit + safety** | Python dependency and code security | A03, A05 |
| **dotnet list --vulnerable** | .NET NuGet package vulnerabilities | A03 |

### CI/CD Workflow

Copy `.github/workflows/security-scan.yml` to your repo. It runs automatically on:
- Every push to `main`/`master`
- Every pull request
- Weekly schedule (catches newly disclosed vulnerabilities)

The workflow uploads SARIF results to GitHub Security tab when GitHub Advanced Security is available.

### Git Hook Enforcement

Install the pre-push hook to get local feedback before your code even reaches CI:

```bash
./tools/install-hooks.sh
```

**How it works:**

| Pushing to... | Scan is stale? | Behavior |
|---------------|---------------|----------|
| Feature branch | Yes | ⚠️ **WARNING** — push proceeds, but you're reminded to scan |
| Feature branch | No | ✅ Push proceeds silently |
| `main`/`master` | Yes | 🚫 **BLOCKED** — push rejected until you run a scan |
| `main`/`master` | No | ✅ Push proceeds |

The scan timestamp is recorded automatically when `./tools/setup.sh --scan` passes. If you commit new code after a scan, the hook detects the scan is stale and notifies you.

**Enforcement chain:** Local hook (warn/block) → CI workflow (required check) → PR merge gate

## Standards Reference

| Tag | Standard | Link |
|-----|----------|------|
| `[OWASP-A01]`–`[OWASP-A10]` | OWASP Top 10 (2025) | https://owasp.org/Top10/2025/ |
| `[AZURE-WAF]` | Azure Well-Architected Framework | https://learn.microsoft.com/en-us/azure/well-architected/ |
| `[AWS-WAF]` | AWS Well-Architected Framework | https://docs.aws.amazon.com/wellarchitected/latest/framework/welcome.html |
| `[GCP-AF]` | Google Cloud Architecture Framework | https://cloud.google.com/architecture/framework |
| `[CUSTOM]` | Project-specific rules | Defined in your repo |
