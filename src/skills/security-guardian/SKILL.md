---
name: security-guardian-tools
description: >
  Security scanning tool definitions. Tells the Security Guardian agent
  which tools to check and run. Does NOT install anything.
  See PREREQUISITES.md for installation.
---

# Security Guardian Tools

## Required Tools (must have — stop and ask user to install if missing)

| Tool | Check Command | Purpose |
|------|--------------|---------|
| Semgrep | `semgrep --version` | SAST — OWASP vulnerability scanning |
| Gitleaks | `gitleaks version` | Secret detection in source and git history |

## Optional Tools (language-dependent — skip if not relevant)

| Tool | Check Command | Purpose | When Required |
|------|--------------|---------|---------------|
| Trivy | `trivy --version` | Container/IaC/dependency vulnerabilities | Any project with containers or IaC |
| npm | `npm --version` | Node.js dependency audit (`npm audit`) | Node.js projects |
| pip-audit | `pip-audit --version` | Python dependency vulnerabilities | Python projects |
| Bandit | `bandit --version` | Python SAST | Python projects |
| cargo-audit | `cargo audit --version` | Rust dependency vulnerabilities | Rust projects |
| dotnet | `dotnet --version` | .NET dependency vulnerabilities | .NET projects |

## Scan Commands (run in this order)

### Phase 1: Core scans (run in parallel)
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

