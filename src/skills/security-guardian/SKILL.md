---
name: security-guardian-tools
description: >
  Security scanning tool definitions. Tells the Security Guardian agent
  which tools to check and run. Does NOT install anything.
  See PREREQUISITES.md for installation.
---

# Security Guardian Tools

## Tool Inventory

Check each tool's availability and relevance before scanning. Report status in the Tools Report.

### Core Security Tools

| Tool | Check Command | Purpose |
|------|--------------|---------|
| Semgrep | `semgrep --version` | SAST — OWASP vulnerability scanning |
| Gitleaks | `gitleaks version` | Secret detection in source and git history |
| Trivy | `trivy --version` | Container, IaC, and dependency vulnerability scanning |

### Language-Specific Auditors

| Tool | Check Command | Purpose | Relevant When |
|------|--------------|---------|---------------|
| npm | `npm --version` | Node.js dependency audit (`npm audit`) | Node.js projects (package.json) |
| pip-audit | `pip-audit --version` | Python dependency vulnerabilities | Python projects (requirements.txt, pyproject.toml) |
| Bandit | `bandit --version` | Python SAST | Python projects |
| cargo-audit | `cargo audit --version` | Rust dependency vulnerabilities | Rust projects (Cargo.toml) |
| dotnet | `dotnet --version` | .NET dependency vulnerabilities | .NET projects (.csproj) |

## Scan Commands

### Phase 1: Core scans (run in parallel, when available)
```
semgrep scan --config=auto --severity ERROR --severity WARNING .
gitleaks detect --source=. --no-banner
trivy fs --severity CRITICAL,HIGH .
```

### Phase 2: Language-specific (run sequentially, only for detected languages)
```
npm audit --audit-level=moderate          # Node.js
pip-audit                                 # Python
bandit -r . -ll --quiet                   # Python
cargo audit                              # Rust
dotnet list package --vulnerable          # .NET
```

