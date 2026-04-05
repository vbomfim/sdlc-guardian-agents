# Prerequisites — Setting Up Your Dev + AI Machine

This guide installs all tools required by the SDLC Guardian Agents. Each tool is used by a specific Guardian for automated scanning and analysis.

---

## Supported Platforms

| Platform | Status |
|----------|--------|
| macOS (Apple Silicon + Intel) | ✅ Fully supported |
| Linux (Ubuntu/Debian, Fedora/RHEL) | ✅ Fully supported |
| Windows (WSL2 recommended) | ✅ Via WSL2 or native where available |

---

## 1. Core Requirements

These are required for Copilot CLI and the Guardian agents to function.

| Tool | Purpose | Used By |
|------|---------|---------|
| [GitHub Copilot CLI](https://docs.github.com/copilot) | AI coding assistant — hosts the Guardian agents | All Guardians |
| [Git](https://git-scm.com/) | Version control | All Guardians |
| [GitHub CLI (`gh`)](https://cli.github.com/) | GitHub API (issues, PRs, releases) | PO Guardian, Default Agent |

### macOS
```bash
brew install git gh
curl -fsSL https://gh.io/copilot-install | bash
```

### Linux (Ubuntu/Debian)
```bash
sudo apt update && sudo apt install -y git
curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | sudo dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | sudo tee /etc/apt/sources.list.d/github-cli.list > /dev/null
sudo apt update && sudo apt install -y gh
curl -fsSL https://gh.io/copilot-install | bash
```

### Linux (Fedora/RHEL)
```bash
sudo dnf install -y git gh
curl -fsSL https://gh.io/copilot-install | bash
```

### Windows
```powershell
winget install Git.Git
winget install GitHub.cli
winget install GitHub.Copilot
```

---

## 2. Security Guardian Tools

Used by the Security Guardian for OWASP scanning and vulnerability analysis.

| Tool | Purpose | Guardian |
|------|---------|----------|
| [Semgrep](https://semgrep.dev/) | SAST — static analysis for OWASP vulnerabilities | Security Guardian |
| [Gitleaks](https://github.com/gitleaks/gitleaks) | Secret detection in source code and git history | Security Guardian |
| [Trivy](https://trivy.dev/) | Vulnerability scanner for containers, IaC, and dependencies | Security Guardian, Platform Guardian |

### macOS
```bash
brew install semgrep gitleaks trivy
```

### Linux
```bash
# Semgrep
pip3 install semgrep

# Gitleaks
curl -sSfL https://github.com/gitleaks/gitleaks/releases/latest/download/gitleaks_$(uname -s)_$(uname -m).tar.gz | tar xz -C /usr/local/bin gitleaks

# Trivy
curl -sfL https://raw.githubusercontent.com/aquasecurity/trivy/main/contrib/install.sh | sudo sh -s -- -b /usr/local/bin
```

### Windows (WSL2)
```bash
# Inside WSL2 — same as Linux
pip3 install semgrep
# Gitleaks and Trivy — same curl commands as Linux
```

### Windows (Native)
```powershell
# Semgrep
pip install semgrep

# Gitleaks
winget install Gitleaks.Gitleaks

# Trivy
# Download from https://github.com/aquasecurity/trivy/releases
```

---

## 3. Code Review Guardian Tools

Used by the Code Review Guardian for language-specific linting and quality analysis.

| Tool | Purpose | Languages | Guardian |
|------|---------|-----------|----------|
| [ESLint](https://eslint.org/) | Linter for JavaScript/TypeScript | JS, TS | Code Review Guardian |
| [Pylint](https://pylint.org/) | Deep analysis for Python | Python | Code Review Guardian |
| [Ruff](https://docs.astral.sh/ruff/) | Fast Python linter | Python | Code Review Guardian |
| [Clippy](https://doc.rust-lang.org/clippy/) | Idiomatic Rust linter | Rust | Code Review Guardian |
| [dotnet format](https://learn.microsoft.com/en-us/dotnet/core/tools/dotnet-format) | C# code formatter and analyzer | C# | Code Review Guardian |
| [Checkstyle](https://checkstyle.org/) | Java style and bug checker | Java | Code Review Guardian |

**Install only what applies to your project's languages.**

### macOS / Linux
```bash
# JavaScript/TypeScript
npm install -g eslint

# Python
pip3 install pylint ruff

# Rust (included with rustup)
rustup component add clippy

# C# (included with .NET SDK)
dotnet tool install -g dotnet-format

# Java (Maven plugin — add to pom.xml, no global install needed)
```

### Windows
```powershell
# JavaScript/TypeScript
npm install -g eslint

# Python
pip install pylint ruff

# Rust
rustup component add clippy

# C# (included with .NET SDK)
dotnet tool install -g dotnet-format
```

---

## 4. Platform Guardian Tools

Used by the Platform Guardian for Kubernetes cluster security auditing.

| Tool | Purpose | Guardian |
|------|---------|----------|
| [kubectl](https://kubernetes.io/docs/tasks/tools/) | Kubernetes CLI | Platform Guardian |
| [kube-bench](https://github.com/aquasecurity/kube-bench) | CIS Kubernetes Benchmark compliance | Platform Guardian |
| [kube-score](https://github.com/zegl/kube-score) | Kubernetes workload best practices | Platform Guardian |
| [Polaris](https://github.com/FairwindsOps/polaris) | Kubernetes configuration validation | Platform Guardian |
| [kubeaudit](https://github.com/Shopify/kubeaudit) | Kubernetes security audit | Platform Guardian |
| [Helm](https://helm.sh/) | Kubernetes package manager | Platform Guardian, Delivery Guardian |

### macOS
```bash
brew install kubectl kube-bench kube-score polaris kubeaudit helm
```

### Linux
```bash
# kubectl
curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"
sudo install -o root -g root -m 0755 kubectl /usr/local/bin/kubectl

# kube-bench
curl -sSL https://github.com/aquasecurity/kube-bench/releases/latest/download/kube-bench_linux_amd64.tar.gz | tar xz -C /usr/local/bin

# kube-score
curl -sSL https://github.com/zegl/kube-score/releases/latest/download/kube-score_linux_amd64.tar.gz | tar xz -C /usr/local/bin

# Polaris
curl -sSL https://github.com/FairwindsOps/polaris/releases/latest/download/polaris_linux_amd64.tar.gz | tar xz -C /usr/local/bin

# kubeaudit
curl -sSL https://github.com/Shopify/kubeaudit/releases/latest/download/kubeaudit_linux_amd64.tar.gz | tar xz -C /usr/local/bin

# Helm
curl https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash
```

### Windows
```powershell
# kubectl
winget install Kubernetes.kubectl

# Helm
winget install Helm.Helm

# kube-bench, kube-score, polaris, kubeaudit
# Download binaries from GitHub releases or use WSL2
```

---

## 5. Delivery Guardian Tools

Used by the Delivery Guardian for deployment, observability, and testing.

| Tool | Purpose | Guardian |
|------|---------|----------|
| [k6](https://k6.io/) | Load and performance testing | Delivery Guardian, QA Guardian |
| [Argo Rollouts](https://argoproj.github.io/rollouts/) | Blue-green, canary deployments | Delivery Guardian |
| [Chaos Mesh](https://chaos-mesh.org/) | Chaos engineering for Kubernetes | Delivery Guardian |
| [Azure CLI (`az`)](https://learn.microsoft.com/en-us/cli/azure/) | Azure cloud operations (AKS, Monitor, Key Vault) | Platform Guardian, Delivery Guardian |

### macOS
```bash
brew install k6
brew install azure-cli

# Argo Rollouts (kubectl plugin)
kubectl argo rollouts version 2>/dev/null || \
  curl -LO https://github.com/argoproj/argo-rollouts/releases/latest/download/kubectl-argo-rollouts-darwin-amd64 && \
  chmod +x kubectl-argo-rollouts-darwin-amd64 && \
  sudo mv kubectl-argo-rollouts-darwin-amd64 /usr/local/bin/kubectl-argo-rollouts
```

### Linux
```bash
# k6
sudo gpg -k
sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D68
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update && sudo apt-get install -y k6

# Azure CLI
curl -sL https://aka.ms/InstallAzureCLIDeb | sudo bash
```

### Windows
```powershell
winget install k6.k6
winget install Microsoft.AzureCLI
```

---

## 6. Python & Node.js Dependency Auditors

Used by Security Guardian and Code Review Guardian for dependency scanning.

| Tool | Purpose | Guardian |
|------|---------|----------|
| [pip-audit](https://github.com/pypa/pip-audit) | Python dependency vulnerabilities | Security Guardian |
| [Bandit](https://bandit.readthedocs.io/) | Python SAST | Security Guardian |
| [Safety](https://safetycli.com/) | Python dependency safety check | Security Guardian |
| [npm audit](https://docs.npmjs.com/cli/v10/commands/npm-audit) | Node.js dependency vulnerabilities (built-in) | Security Guardian |
| [cargo audit](https://github.com/rustsec/rustsec) | Rust dependency vulnerabilities | Security Guardian |
| [cargo deny](https://github.com/EmbarkStudios/cargo-deny) | Rust license + vulnerability checks | Security Guardian |

### All Platforms
```bash
# Python
pip3 install pip-audit bandit safety

# Rust
cargo install cargo-audit cargo-deny

# Node.js — npm audit is built-in with npm
```

---

## 7. Browser Automation (Operator + QA Guardian)

Used by the Operator for screenshots, page monitoring, and data extraction. Used by QA Guardian for browser-based E2E testing.

| Tool | Purpose | Used By |
|------|---------|---------|
| [Playwright MCP](https://github.com/microsoft/playwright-mcp) | Browser automation via MCP — screenshots, navigation, page interaction | Operator, QA Guardian |

**Note:** Playwright MCP is **optional**. The Operator works without it for non-browser tasks (reports, housekeeping, health checks via `curl`). The QA Guardian skips browser-based E2E tests when it's not configured.

### Setup

Add Playwright MCP to your MCP configuration:

**Copilot CLI** (`~/.copilot/mcp-config.json`):
```json
{
  "servers": {
    "playwright": {
      "command": "npx",
      "args": ["@playwright/mcp@0.0.28"]
    }
  }
}
```

**VS Code** (`.vscode/mcp.json`):
```json
{
  "servers": {
    "playwright": {
      "command": "npx",
      "args": ["@playwright/mcp@0.0.28"]
    }
  }
}
```

> **Pin to a specific version in production.** Use `@latest` only for evaluation. Check [Playwright MCP releases](https://github.com/microsoft/playwright-mcp/releases) for the latest stable version.

### Prerequisites
- Node.js 18+ (for npx)
- npm (comes with Node.js)
- First run auto-installs browser binaries (~400 MB download)

### Verification

After adding the MCP config, restart Copilot CLI. Playwright MCP tools (`browser_navigate`, `browser_take_screenshot`, `browser_click`) should appear in the tool list.

---

## Quick Verification

After installing, verify your setup:

```bash
# Check all tools
bash ~/.copilot/skills/security-guardian/setup.sh --check
bash ~/.copilot/skills/code-review-guardian/setup.sh --check
bash ~/.copilot/skills/platform-guardian/setup.sh --check
```

---

## Minimal Install

Not every project needs every tool. Here's the minimum per role:

| Role | Minimum Tools |
|------|--------------|
| **Any developer** | Git, GitHub CLI, Copilot CLI |
| **Web/API developer** | + ESLint or Pylint/Ruff (per language) |
| **Security-conscious** | + Semgrep, Gitleaks |
| **Kubernetes operator** | + kubectl, kube-bench, Helm |
| **Ops automation** | + Playwright MCP (for screenshots — optional) |
| **Full SDLC** | Everything above |
| **Web E2E testing** | + Playwright MCP (QA Guardian browser tests) |
