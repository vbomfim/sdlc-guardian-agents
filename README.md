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
│   └── instructions/
│       ├── security-standard.instructions.md  ← Auto-applied rules
│       └── project-security.instructions.md   ← [CUSTOM] rules (optional)
└── AGENTS.md                        ← Project-specific overrides (optional)
```

## Standards Reference

| Tag | Standard | Link |
|-----|----------|------|
| `[OWASP-A01]`–`[OWASP-A10]` | OWASP Top 10 (2025) | https://owasp.org/Top10/2025/ |
| `[AZURE-WAF]` | Azure Well-Architected Framework | https://learn.microsoft.com/en-us/azure/well-architected/ |
| `[AWS-WAF]` | AWS Well-Architected Framework | https://docs.aws.amazon.com/wellarchitected/latest/framework/welcome.html |
| `[GCP-AF]` | Google Cloud Architecture Framework | https://cloud.google.com/architecture/framework |
| `[CUSTOM]` | Project-specific rules | Defined in your repo |
