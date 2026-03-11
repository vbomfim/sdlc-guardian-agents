#!/usr/bin/env bash
# Security Guardian — Tool Runner (no installation)
# Checks tool availability and runs scans. Does NOT install anything.
# See PREREQUISITES.md for installation instructions.
#
# Usage:
#   ./run.sh --check   # Check which tools are available
#   ./run.sh --scan    # Run deterministic scan pipeline

set -euo pipefail

BLUE='\033[0;34m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'
BOLD='\033[1m'

info()    { echo -e "${BLUE}ℹ${NC}  $1"; }
success() { echo -e "${GREEN}✔${NC}  $1"; }
warn()    { echo -e "${YELLOW}⚠${NC}  $1"; }
error()   { echo -e "${RED}✖${NC}  $1"; }
header()  { echo -e "\n${BOLD}${CYAN}═══ $1 ═══${NC}\n"; }

command_exists() { command -v "$1" &>/dev/null; }

detect_languages() {
  local langs=()
  local dir="${PROJECT_DIR:-.}"
  [ -f "$dir/package.json" ] || find "$dir" -maxdepth 3 \( -name "*.ts" -o -name "*.js" \) 2>/dev/null | head -1 | grep -q . && langs+=("nodejs")
  find "$dir" -maxdepth 3 \( -name "*.csproj" -o -name "*.cs" \) 2>/dev/null | head -1 | grep -q . && langs+=("dotnet")
  [ -f "$dir/Cargo.toml" ] && langs+=("rust")
  [ -f "$dir/requirements.txt" ] || [ -f "$dir/pyproject.toml" ] || find "$dir" -maxdepth 3 -name "*.py" 2>/dev/null | head -1 | grep -q . && langs+=("python")
  [ -f "$dir/pom.xml" ] || [ -f "$dir/build.gradle" ] && langs+=("java")
  echo "${langs[@]}"
}

check_tools() {
  header "Security Tools Status"
  local missing_required=0

  echo -e "${BOLD}Required:${NC}"
  for tool in semgrep gitleaks; do
    if command_exists "$tool"; then
      success "$tool: available"
    else
      error "$tool: NOT FOUND [REQUIRED] — see PREREQUISITES.md"
      missing_required=$((missing_required + 1))
    fi
  done

  echo -e "\n${BOLD}Optional (language-dependent):${NC}"
  for tool in trivy npm pip-audit bandit cargo-audit dotnet; do
    if command_exists "$tool"; then
      success "$tool: available"
    else
      info "$tool: not found (install if your project needs it)"
    fi
  done

  [ $missing_required -gt 0 ] && echo "" && error "$missing_required required tool(s) missing — install before scanning"
  return $missing_required
}

run_scan() {
  header "Security Scan Pipeline"
  info "Deterministic order — parallel core scans + sequential language audits"
  echo ""

  local dir="${PROJECT_DIR:-.}"
  local exit_code=0
  local tools_run=0
  local tools_missing=0
  local tmp_dir
  tmp_dir=$(mktemp -d)
  trap "rm -rf $tmp_dir" EXIT

  # Phase 1: Core scans (parallel)
  info "Phase 1: Core scans (parallel)"

  if command_exists semgrep; then
    info "  [1/3] Semgrep (SAST)... ⏳"
    ( semgrep scan --config=auto --severity ERROR --severity WARNING "$dir" > "$tmp_dir/semgrep.out" 2>&1; echo $? > "$tmp_dir/semgrep.exit" ) &
    local pid_semgrep=$!
    tools_run=$((tools_run + 1))
  else
    error "  [1/3] Semgrep — NOT FOUND (see PREREQUISITES.md)"
    tools_missing=$((tools_missing + 1))
  fi

  if command_exists gitleaks; then
    info "  [2/3] Gitleaks (secrets)... ⏳"
    ( gitleaks detect --source="$dir" --no-banner > "$tmp_dir/gitleaks.out" 2>&1; echo $? > "$tmp_dir/gitleaks.exit" ) &
    local pid_gitleaks=$!
    tools_run=$((tools_run + 1))
  else
    error "  [2/3] Gitleaks — NOT FOUND (see PREREQUISITES.md)"
    tools_missing=$((tools_missing + 1))
  fi

  if command_exists trivy; then
    info "  [3/3] Trivy (vulnerabilities)... ⏳"
    ( trivy fs --severity CRITICAL,HIGH "$dir" > "$tmp_dir/trivy.out" 2>&1; echo $? > "$tmp_dir/trivy.exit" ) &
    local pid_trivy=$!
    tools_run=$((tools_run + 1))
  else
    error "  [3/3] Trivy — NOT FOUND (see PREREQUISITES.md)"
    tools_missing=$((tools_missing + 1))
  fi

  info "  Waiting for core scans..."
  [ -n "${pid_semgrep:-}" ] && wait "$pid_semgrep" 2>/dev/null
  [ -n "${pid_gitleaks:-}" ] && wait "$pid_gitleaks" 2>/dev/null
  [ -n "${pid_trivy:-}" ] && wait "$pid_trivy" 2>/dev/null

  for tool in semgrep gitleaks trivy; do
    if [ -f "$tmp_dir/$tool.exit" ]; then
      [ "$(cat "$tmp_dir/$tool.exit")" != "0" ] && exit_code=1
      echo ""
      echo "──── $tool results ────"
      cat "$tmp_dir/$tool.out"
    fi
  done

  # Phase 2: Language audits (sequential)
  echo ""
  info "Phase 2: Language-specific audits"

  local langs
  langs=$(detect_languages)

  if [[ " $langs " == *" nodejs "* ]]; then
    if [ -f "$dir/package-lock.json" ]; then
      info "  [4/7] npm audit..."
      (cd "$dir" && npm audit --audit-level=moderate 2>/dev/null) || exit_code=1
      tools_run=$((tools_run + 1))
    else
      info "  [4/7] npm audit — skipped (no package-lock.json)"
    fi
  else
    info "  [4/7] npm audit — skipped (not a Node.js project)"
  fi

  if [[ " $langs " == *" rust "* ]]; then
    if command_exists cargo-audit; then
      info "  [5/7] cargo audit..."
      (cd "$dir" && cargo audit 2>/dev/null) || exit_code=1
      tools_run=$((tools_run + 1))
    else
      warn "  [5/7] cargo audit — NOT FOUND (Rust project detected)"
      tools_missing=$((tools_missing + 1))
    fi
  else
    info "  [5/7] cargo audit — skipped (not a Rust project)"
  fi

  if [[ " $langs " == *" python "* ]]; then
    if command_exists pip-audit; then
      info "  [6/7] pip-audit..."
      (cd "$dir" && pip-audit 2>/dev/null) || exit_code=1
      tools_run=$((tools_run + 1))
    else
      warn "  [6/7] pip-audit — NOT FOUND (Python project detected)"
      tools_missing=$((tools_missing + 1))
    fi
    if command_exists bandit; then
      info "  [6/7] bandit..."
      (cd "$dir" && bandit -r . -ll --quiet 2>/dev/null) || exit_code=1
      tools_run=$((tools_run + 1))
    else
      warn "  [6/7] bandit — NOT FOUND (Python project detected)"
      tools_missing=$((tools_missing + 1))
    fi
  else
    info "  [6/7] pip-audit + bandit — skipped (not a Python project)"
  fi

  if [[ " $langs " == *" dotnet "* ]]; then
    if command_exists dotnet; then
      info "  [7/7] dotnet list --vulnerable..."
      (cd "$dir" && dotnet list package --vulnerable 2>/dev/null) || exit_code=1
      tools_run=$((tools_run + 1))
    else
      warn "  [7/7] dotnet — NOT FOUND (.NET project detected)"
      tools_missing=$((tools_missing + 1))
    fi
  else
    info "  [7/7] dotnet — skipped (not a .NET project)"
  fi

  echo ""
  echo "════════════════════════════════════════"
  echo "  Tools run: $tools_run | Missing: $tools_missing"
  echo "════════════════════════════════════════"
  [ $tools_missing -gt 0 ] && warn "Install missing tools — see PREREQUISITES.md"
  [ $exit_code -eq 0 ] && success "All scans passed!" || warn "Issues found — review output above"
  return $exit_code
}

case "${1:-}" in
  --check) check_tools ;;
  --scan)  export PROJECT_DIR="${2:-.}"; run_scan ;;
  *) echo "Usage: $0 --check | --scan [directory]"; exit 1 ;;
esac
