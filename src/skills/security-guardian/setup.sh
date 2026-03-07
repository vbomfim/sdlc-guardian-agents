#!/usr/bin/env bash
# Security Guardian — Tool Setup Script
# Detects project languages and installs the appropriate security analysis tools.
# Idempotent: safe to run multiple times.
#
# Usage:
#   ./tools/setup.sh              # Auto-detect languages, install tools
#   ./tools/setup.sh --all        # Install tools for ALL supported languages
#   ./tools/setup.sh --check      # Check which tools are already installed
#   ./tools/setup.sh --ci         # Install only CI-friendly tools (no GUI/IDE plugins)

set -euo pipefail

# ─── Colors ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color
BOLD='\033[1m'

# ─── Helpers ──────────────────────────────────────────────────────────────────
info()    { echo -e "${BLUE}ℹ${NC}  $1"; }
success() { echo -e "${GREEN}✔${NC}  $1"; }
warn()    { echo -e "${YELLOW}⚠${NC}  $1"; }
error()   { echo -e "${RED}✖${NC}  $1"; }
header()  { echo -e "\n${BOLD}${CYAN}═══ $1 ═══${NC}\n"; }

command_exists() { command -v "$1" &>/dev/null; }

install_or_skip() {
  local name="$1" check_cmd="$2" install_fn="$3"
  if command_exists "$check_cmd"; then
    success "$name is already installed ($($check_cmd --version 2>/dev/null | head -1 || echo 'installed'))"
    return 0
  fi
  info "Installing $name..."
  if $install_fn; then
    success "$name installed successfully"
  else
    warn "Failed to install $name — install manually (see README.md)"
    return 1
  fi
}

# ─── Language Detection ───────────────────────────────────────────────────────
detect_languages() {
  local langs=()
  local dir="${PROJECT_DIR:-.}"

  # TypeScript / JavaScript
  if [ -f "$dir/package.json" ] || \
     find "$dir" -maxdepth 3 -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.jsx" 2>/dev/null | head -1 | grep -q .; then
    langs+=("nodejs")
  fi

  # C# / .NET
  if find "$dir" -maxdepth 3 -name "*.csproj" -o -name "*.sln" -o -name "*.cs" 2>/dev/null | head -1 | grep -q .; then
    langs+=("dotnet")
  fi

  # Rust
  if [ -f "$dir/Cargo.toml" ] || find "$dir" -maxdepth 3 -name "Cargo.toml" 2>/dev/null | head -1 | grep -q .; then
    langs+=("rust")
  fi

  # Python
  if [ -f "$dir/requirements.txt" ] || [ -f "$dir/pyproject.toml" ] || [ -f "$dir/setup.py" ] || \
     find "$dir" -maxdepth 3 -name "*.py" 2>/dev/null | head -1 | grep -q .; then
    langs+=("python")
  fi

  # Java
  if [ -f "$dir/pom.xml" ] || [ -f "$dir/build.gradle" ] || [ -f "$dir/build.gradle.kts" ] || \
     find "$dir" -maxdepth 3 -name "*.java" 2>/dev/null | head -1 | grep -q .; then
    langs+=("java")
  fi

  echo "${langs[@]}"
}

# ─── Core Tools (all projects) ───────────────────────────────────────────────

install_semgrep() {
  if command_exists pip3; then
    pip3 install semgrep --quiet
  elif command_exists pip; then
    pip install semgrep --quiet
  elif command_exists brew; then
    brew install semgrep
  else
    error "No pip or brew found. Install Python 3 first, then: pip3 install semgrep"
    return 1
  fi
}

install_gitleaks() {
  if command_exists brew; then
    brew install gitleaks
  elif command_exists go; then
    go install github.com/gitleaks/gitleaks/v8@latest
  else
    # Download binary
    local os arch url
    os="$(uname -s | tr '[:upper:]' '[:lower:]')"
    arch="$(uname -m)"
    case "$arch" in
      x86_64) arch="x64" ;;
      aarch64|arm64) arch="arm64" ;;
    esac
    url="https://github.com/gitleaks/gitleaks/releases/latest/download/gitleaks_${os}_${arch}.tar.gz"
    info "Downloading gitleaks from $url"
    curl -sSL "$url" | tar xz -C /usr/local/bin gitleaks 2>/dev/null || \
    curl -sSL "$url" | tar xz -C "$HOME/.local/bin" gitleaks 2>/dev/null || \
    { error "Could not install gitleaks. Download manually from https://github.com/gitleaks/gitleaks/releases"; return 1; }
  fi
}

install_trivy() {
  if command_exists brew; then
    brew install trivy
  else
    curl -sfL https://raw.githubusercontent.com/aquasecurity/trivy/main/contrib/install.sh | sh -s -- -b /usr/local/bin 2>/dev/null || \
    curl -sfL https://raw.githubusercontent.com/aquasecurity/trivy/main/contrib/install.sh | sh -s -- -b "$HOME/.local/bin" 2>/dev/null || \
    { error "Could not install trivy. See https://aquasecurity.github.io/trivy/"; return 1; }
  fi
}

# ─── Language-Specific Tools ─────────────────────────────────────────────────

install_nodejs_tools() {
  header "Node.js / TypeScript Security Tools"

  if ! command_exists npm; then
    warn "npm not found — skipping Node.js tools"
    return 0
  fi

  # npm audit is built-in, just verify
  success "npm audit (built-in with npm)"

  # eslint-plugin-security
  if [ -f "package.json" ]; then
    info "Installing eslint-plugin-security as dev dependency..."
    npm install --save-dev eslint-plugin-security 2>/dev/null && \
      success "eslint-plugin-security installed" || \
      warn "eslint-plugin-security — install manually: npm i -D eslint-plugin-security"
  fi

  # better-npm-audit
  install_or_skip "better-npm-audit" "better-npm-audit" \
    "npm install -g better-npm-audit"
}

install_dotnet_tools() {
  header "C# / .NET Security Tools"

  if ! command_exists dotnet; then
    warn "dotnet not found — skipping .NET tools"
    return 0
  fi

  success "dotnet list --vulnerable (built-in with .NET CLI)"

  # Security Code Scan
  info "To add SecurityCodeScan to your project:"
  echo "  dotnet add package SecurityCodeScan.VS2019 --version 5.*"
  echo "  (analyzes code during build for OWASP vulnerabilities)"
}

install_rust_tools() {
  header "Rust Security Tools"

  if ! command_exists cargo; then
    warn "cargo not found — skipping Rust tools"
    return 0
  fi

  install_or_skip "cargo-audit" "cargo-audit" \
    "cargo install cargo-audit"

  install_or_skip "cargo-deny" "cargo-deny" \
    "cargo install cargo-deny"
}

install_python_tools() {
  header "Python Security Tools"

  local pip_cmd=""
  if command_exists pip3; then pip_cmd="pip3"
  elif command_exists pip; then pip_cmd="pip"
  else
    warn "pip not found — skipping Python tools"
    return 0
  fi

  install_or_skip "bandit" "bandit" \
    "$pip_cmd install bandit --quiet"

  install_or_skip "pip-audit" "pip-audit" \
    "$pip_cmd install pip-audit --quiet"

  install_or_skip "safety" "safety" \
    "$pip_cmd install safety --quiet"
}

install_java_tools() {
  header "Java Security Tools"

  if command_exists mvn; then
    success "OWASP Dependency-Check Maven Plugin available"
    info "Add to pom.xml:"
    echo "  <plugin>"
    echo "    <groupId>org.owasp</groupId>"
    echo "    <artifactId>dependency-check-maven</artifactId>"
    echo "    <version>10.0.4</version>"
    echo "  </plugin>"
    echo "  Run: mvn org.owasp:dependency-check-maven:check"
  elif command_exists gradle; then
    success "OWASP Dependency-Check Gradle Plugin available"
    info "Add to build.gradle:"
    echo "  plugins { id 'org.owasp.dependencycheck' version '10.0.4' }"
    echo "  Run: gradle dependencyCheckAnalyze"
  else
    warn "Neither mvn nor gradle found — skipping Java tools"
  fi

  # SpotBugs with FindSecBugs
  info "For static analysis, add SpotBugs + FindSecBugs plugin to your build"
}

# ─── Check Mode ──────────────────────────────────────────────────────────────

check_tools() {
  header "Security Tools Status"

  echo -e "${BOLD}Core Tools:${NC}"
  for tool in semgrep gitleaks trivy; do
    if command_exists "$tool"; then
      success "$tool: $($tool --version 2>/dev/null | head -1)"
    else
      error "$tool: NOT INSTALLED"
    fi
  done

  echo ""
  echo -e "${BOLD}Node.js:${NC}"
  for tool in npm npx; do
    if command_exists "$tool"; then
      success "$tool: $($tool --version 2>/dev/null | head -1)"
    else
      warn "$tool: not found"
    fi
  done

  echo ""
  echo -e "${BOLD}Rust:${NC}"
  for tool in cargo cargo-audit cargo-deny; do
    if command_exists "$tool"; then
      success "$tool: installed"
    else
      warn "$tool: not found"
    fi
  done

  echo ""
  echo -e "${BOLD}Python:${NC}"
  for tool in bandit pip-audit safety; do
    if command_exists "$tool"; then
      success "$tool: $($tool --version 2>/dev/null | head -1)"
    else
      warn "$tool: not found"
    fi
  done

  echo ""
  echo -e "${BOLD}.NET:${NC}"
  if command_exists dotnet; then
    success "dotnet: $(dotnet --version 2>/dev/null)"
  else
    warn "dotnet: not found"
  fi

  echo ""
  echo -e "${BOLD}Java:${NC}"
  for tool in mvn gradle; do
    if command_exists "$tool"; then
      success "$tool: $($tool --version 2>/dev/null | head -1)"
    else
      warn "$tool: not found"
    fi
  done
}

# ─── Scan Mode ───────────────────────────────────────────────────────────────

run_scan() {
  header "Running Security Scan"
  info "Deterministic pipeline — fixed order, every time"
  echo ""

  local dir="${PROJECT_DIR:-.}"
  local exit_code=0
  local tools_run=0
  local tools_missing=0

  # ── 1. Semgrep (SAST) ──
  if command_exists semgrep; then
    info "[1/7] Semgrep (SAST — OWASP rules)..."
    semgrep scan --config=auto --severity ERROR --severity WARNING "$dir" 2>/dev/null || exit_code=1
    tools_run=$((tools_run + 1))
  else
    warn "[1/7] Semgrep — NOT INSTALLED (run setup.sh to install)"
    tools_missing=$((tools_missing + 1))
  fi

  # ── 2. Gitleaks (Secrets) ──
  if command_exists gitleaks; then
    info "[2/7] Gitleaks (secret detection)..."
    gitleaks detect --source="$dir" --no-banner 2>/dev/null || exit_code=1
    tools_run=$((tools_run + 1))
  else
    warn "[2/7] Gitleaks — NOT INSTALLED (run setup.sh to install)"
    tools_missing=$((tools_missing + 1))
  fi

  # ── 3. Trivy (Vulnerability scanner) ──
  if command_exists trivy; then
    info "[3/7] Trivy (filesystem vulnerability scan)..."
    trivy fs --severity CRITICAL,HIGH "$dir" 2>/dev/null || exit_code=1
    tools_run=$((tools_run + 1))
  else
    warn "[3/7] Trivy — NOT INSTALLED (run setup.sh to install)"
    tools_missing=$((tools_missing + 1))
  fi

  # ── 4-7. Language-specific audits ──
  local langs
  langs=$(detect_languages)

  # 4. Node.js
  if [[ " $langs " == *" nodejs "* ]]; then
    if [ -f "$dir/package-lock.json" ]; then
      info "[4/7] npm audit (Node.js dependencies)..."
      (cd "$dir" && npm audit --audit-level=moderate 2>/dev/null) || exit_code=1
      tools_run=$((tools_run + 1))
    else
      warn "[4/7] npm audit — no package-lock.json found"
    fi
  fi

  # 5. Rust
  if [[ " $langs " == *" rust "* ]]; then
    if command_exists cargo-audit; then
      info "[5/7] cargo audit (Rust dependencies)..."
      (cd "$dir" && cargo audit 2>/dev/null) || exit_code=1
      tools_run=$((tools_run + 1))
    else
      warn "[5/7] cargo audit — NOT INSTALLED"
      tools_missing=$((tools_missing + 1))
    fi
  fi

  # 6. Python
  if [[ " $langs " == *" python "* ]]; then
    if command_exists pip-audit; then
      info "[6/7] pip-audit (Python dependencies)..."
      (cd "$dir" && pip-audit 2>/dev/null) || exit_code=1
      tools_run=$((tools_run + 1))
    else
      warn "[6/7] pip-audit — NOT INSTALLED"
      tools_missing=$((tools_missing + 1))
    fi
    if command_exists bandit; then
      info "[6/7] bandit (Python SAST)..."
      (cd "$dir" && bandit -r . -ll --quiet 2>/dev/null) || exit_code=1
      tools_run=$((tools_run + 1))
    else
      warn "[6/7] bandit — NOT INSTALLED"
      tools_missing=$((tools_missing + 1))
    fi
  fi

  # 7. .NET
  if [[ " $langs " == *" dotnet "* ]]; then
    if command_exists dotnet; then
      info "[7/7] dotnet list --vulnerable (.NET dependencies)..."
      (cd "$dir" && dotnet list package --vulnerable 2>/dev/null) || exit_code=1
      tools_run=$((tools_run + 1))
    fi
  fi

  # ── Summary ──
  echo ""
  echo "────────────────────────────────────────"
  echo "  Tools run: $tools_run | Missing: $tools_missing"
  echo "────────────────────────────────────────"

  if [ $tools_missing -gt 0 ]; then
    warn "Run './tools/setup.sh' or 'bash ~/.copilot/skills/security-guardian/setup.sh' to install missing tools"
  fi

  if [ $exit_code -eq 0 ]; then
    echo ""
    success "All security scans passed!"
    date +%s > "${dir}/.security-scan-timestamp"
    success "Scan timestamp recorded (.security-scan-timestamp)"
  else
    echo ""
    warn "Some security issues found — review the output above"
    warn "Scan timestamp NOT updated (fix issues and re-scan)"
  fi

  return $exit_code
}

# ─── Main ────────────────────────────────────────────────────────────────────

main() {
  local mode="${1:-auto}"
  export PROJECT_DIR="${2:-.}"

  echo -e "${BOLD}${CYAN}"
  echo "  ╔═══════════════════════════════════════════╗"
  echo "  ║       🛡️  Security Guardian Setup  🛡️      ║"
  echo "  ╚═══════════════════════════════════════════╝"
  echo -e "${NC}"

  case "$mode" in
    --check)
      check_tools
      exit 0
      ;;
    --scan)
      run_scan
      exit $?
      ;;
    --all)
      header "Installing ALL Security Tools"
      ;;
    --ci)
      header "Installing CI-Friendly Tools"
      ;;
    *)
      header "Auto-Detecting Project Languages"
      ;;
  esac

  # ── Core tools (always install) ──
  header "Core Security Tools"
  install_or_skip "Semgrep (SAST)" "semgrep" install_semgrep
  install_or_skip "Gitleaks (secret scanning)" "gitleaks" install_gitleaks
  install_or_skip "Trivy (vulnerability scanner)" "trivy" install_trivy

  # ── Language-specific tools ──
  local langs
  if [ "$mode" = "--all" ]; then
    langs="nodejs dotnet rust python java"
  else
    langs=$(detect_languages)
  fi

  if [ -z "$langs" ]; then
    warn "No project languages detected. Run with --all to install everything."
  else
    info "Detected languages: ${BOLD}$langs${NC}"
  fi

  for lang in $langs; do
    case "$lang" in
      nodejs) install_nodejs_tools ;;
      dotnet) install_dotnet_tools ;;
      rust)   install_rust_tools ;;
      python) install_python_tools ;;
      java)   install_java_tools ;;
    esac
  done

  # ── Summary ──
  header "Setup Complete"
  echo -e "${BOLD}Installed tools enforce these Security Guardian rules:${NC}"
  echo ""
  echo "  Semgrep        → [OWASP-A01] through [OWASP-A10] (SAST analysis)"
  echo "  Gitleaks       → [OWASP-A04] No hardcoded secrets"
  echo "  Trivy          → [OWASP-A02] Misconfiguration, [OWASP-A03] Supply Chain"
  echo "  npm audit      → [OWASP-A03] Dependency vulnerabilities (Node.js)"
  echo "  cargo audit    → [OWASP-A03] Dependency vulnerabilities (Rust)"
  echo "  cargo deny     → [OWASP-A03] License + vulnerability checks (Rust)"
  echo "  pip-audit      → [OWASP-A03] Dependency vulnerabilities (Python)"
  echo "  bandit         → [OWASP-A05] Injection, [OWASP-A04] Crypto (Python)"
  echo "  dotnet audit   → [OWASP-A03] Dependency vulnerabilities (.NET)"
  echo ""
  echo -e "${BOLD}Next steps:${NC}"
  echo "  1. Run ${CYAN}./tools/setup.sh --scan${NC} to scan your project now"
  echo "  2. Copy ${CYAN}.github/workflows/security-scan.yml${NC} to enable CI/CD enforcement"
  echo "  3. Use ${CYAN}/agent${NC} in Copilot CLI to invoke Security Guardian for reviews"
  echo ""
}

main "$@"
