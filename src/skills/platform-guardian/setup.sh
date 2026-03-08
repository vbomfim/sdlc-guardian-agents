#!/usr/bin/env bash
# Platform Guardian — K8s Security Tool Setup & Scan Script
#
# Usage:
#   ./setup.sh              # Install K8s audit tools
#   ./setup.sh --scan       # Run deterministic scan pipeline
#   ./setup.sh --check      # Check which tools are installed

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'
BOLD='\033[1m'

info()    { echo -e "${BLUE}ℹ${NC}  $1"; }
success() { echo -e "${GREEN}✔${NC}  $1"; }
warn()    { echo -e "${YELLOW}⚠${NC}  $1"; }
error()   { echo -e "${RED}✖${NC}  $1"; }
header()  { echo -e "\n${BOLD}${CYAN}═══ $1 ═══${NC}\n"; }

command_exists() { command -v "$1" &>/dev/null; }

install_tool() {
  local name="$1" cmd="$2"
  if command_exists "$cmd"; then
    success "$name already installed ($($cmd version 2>/dev/null | head -1 || echo 'installed'))"
    return 0
  fi
  if command_exists brew; then
    info "Installing $name via brew..."
    brew install "$cmd" 2>/dev/null && success "$name installed" && return 0
  fi
  warn "$name — install manually. See docs for your platform."
  return 1
}

check_tools() {
  header "Platform Guardian — Tool Status"
  for tool in kube-bench kube-score polaris kubeaudit trivy kubectl helm; do
    if command_exists "$tool"; then
      success "$tool: installed"
    else
      warn "$tool: not found"
    fi
  done
}

run_scan() {
  header "Platform Guardian — Security Scan"
  info "Deterministic pipeline — parallel scanners"
  echo ""

  local exit_code=0
  local tools_run=0
  local tools_missing=0
  local tmp_dir
  tmp_dir=$(mktemp -d)
  trap "rm -rf $tmp_dir" EXIT

  # Phase 1: Parallel scanners
  info "Phase 1: Security scanners (parallel)"

  if command_exists kube-bench; then
    info "  [1/5] kube-bench (CIS Benchmark)... ⏳"
    ( kube-bench run --json > "$tmp_dir/kube-bench.out" 2>&1; echo $? > "$tmp_dir/kube-bench.exit" ) &
    local pid_kb=$!
    tools_run=$((tools_run + 1))
  else
    warn "  [1/5] kube-bench — NOT INSTALLED"
    tools_missing=$((tools_missing + 1))
  fi

  if command_exists kube-score; then
    info "  [2/5] kube-score (workload best practices)... ⏳"
    ( find . -name "*.yaml" -o -name "*.yml" | grep -v node_modules | head -50 | xargs kube-score score > "$tmp_dir/kube-score.out" 2>&1; echo $? > "$tmp_dir/kube-score.exit" ) &
    local pid_ks=$!
    tools_run=$((tools_run + 1))
  else
    warn "  [2/5] kube-score — NOT INSTALLED"
    tools_missing=$((tools_missing + 1))
  fi

  if command_exists polaris; then
    info "  [3/5] polaris (configuration validation)... ⏳"
    ( polaris audit --audit-path . --format pretty > "$tmp_dir/polaris.out" 2>&1; echo $? > "$tmp_dir/polaris.exit" ) &
    local pid_pol=$!
    tools_run=$((tools_run + 1))
  else
    warn "  [3/5] polaris — NOT INSTALLED"
    tools_missing=$((tools_missing + 1))
  fi

  if command_exists kubeaudit; then
    info "  [4/5] kubeaudit (security audit)... ⏳"
    ( find . -name "*.yaml" -o -name "*.yml" | grep -v node_modules | head -50 | xargs -I{} kubeaudit all -f {} > "$tmp_dir/kubeaudit.out" 2>&1; echo $? > "$tmp_dir/kubeaudit.exit" ) &
    local pid_ka=$!
    tools_run=$((tools_run + 1))
  else
    warn "  [4/5] kubeaudit — NOT INSTALLED"
    tools_missing=$((tools_missing + 1))
  fi

  if command_exists trivy; then
    info "  [5/5] trivy (IaC + image scan)... ⏳"
    ( trivy config --severity CRITICAL,HIGH . > "$tmp_dir/trivy.out" 2>&1; echo $? > "$tmp_dir/trivy.exit" ) &
    local pid_tr=$!
    tools_run=$((tools_run + 1))
  else
    warn "  [5/5] trivy — NOT INSTALLED"
    tools_missing=$((tools_missing + 1))
  fi

  info "  Waiting for scanners..."
  for pid_var in pid_kb pid_ks pid_pol pid_ka pid_tr; do
    eval "local pid=\${$pid_var:-}"
    [ -n "$pid" ] && wait "$pid" 2>/dev/null
  done

  for tool in kube-bench kube-score polaris kubeaudit trivy; do
    if [ -f "$tmp_dir/$tool.exit" ]; then
      local tool_exit
      tool_exit=$(cat "$tmp_dir/$tool.exit")
      [ "$tool_exit" != "0" ] && exit_code=1
      echo ""
      echo "──── $tool results ────"
      cat "$tmp_dir/$tool.out"
      echo ""
    fi
  done

  echo ""
  echo "════════════════════════════════════════"
  echo "  Scanners run: $tools_run | Missing: $tools_missing"
  echo "════════════════════════════════════════"

  [ $tools_missing -gt 0 ] && warn "Run setup.sh to install missing tools"
  [ $exit_code -eq 0 ] && success "All scans passed!" || warn "Issues found — review output above"

  return $exit_code
}

main() {
  echo -e "${BOLD}${CYAN}"
  echo "  ╔═══════════════════════════════════════════╗"
  echo "  ║     ⚙️  Platform Guardian Setup  ⚙️        ║"
  echo "  ╚═══════════════════════════════════════════╝"
  echo -e "${NC}"

  case "${1:-}" in
    --check) check_tools ;;
    --scan)  run_scan ;;
    *)
      header "Installing K8s Security Tools"
      for tool in kube-bench kube-score polaris kubeaudit trivy; do
        install_tool "$tool" "$tool"
      done
      header "Done"
      echo "  Run ${CYAN}--scan${NC} to audit your cluster/manifests"
      ;;
  esac
}

main "$@"
