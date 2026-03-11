#!/usr/bin/env bash
# Platform Guardian — K8s Tool Runner (no installation)
# Checks K8s audit tool availability and runs scans. Does NOT install anything.
#
# Usage:
#   ./run.sh --check   # Check which tools are available
#   ./run.sh --scan    # Run K8s security scan pipeline

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

check_tools() {
  header "Platform Guardian Tools Status"
  for tool in kube-bench kube-score polaris kubeaudit trivy kubectl helm; do
    if command_exists "$tool"; then
      success "$tool: available"
    else
      error "$tool: NOT FOUND — see PREREQUISITES.md"
    fi
  done
}

run_scan() {
  header "Platform Security Scan Pipeline"
  info "Parallel K8s security scanners"
  echo ""

  local exit_code=0
  local tools_run=0
  local tools_missing=0
  local tmp_dir
  tmp_dir=$(mktemp -d)
  trap "rm -rf $tmp_dir" EXIT

  info "Phase 1: K8s scanners (parallel)"

  if command_exists kube-bench; then
    info "  [1/5] kube-bench (CIS Benchmark)... ⏳"
    ( kube-bench run --json > "$tmp_dir/kube-bench.out" 2>&1; echo $? > "$tmp_dir/kube-bench.exit" ) &
    local pid_kb=$!
    tools_run=$((tools_run + 1))
  else
    error "  [1/5] kube-bench — NOT FOUND"
    tools_missing=$((tools_missing + 1))
  fi

  if command_exists kube-score; then
    info "  [2/5] kube-score (best practices)... ⏳"
    ( find . -name "*.yaml" -o -name "*.yml" | grep -v node_modules | head -50 | xargs kube-score score > "$tmp_dir/kube-score.out" 2>&1; echo $? > "$tmp_dir/kube-score.exit" ) &
    local pid_ks=$!
    tools_run=$((tools_run + 1))
  else
    error "  [2/5] kube-score — NOT FOUND"
    tools_missing=$((tools_missing + 1))
  fi

  if command_exists polaris; then
    info "  [3/5] polaris (config validation)... ⏳"
    ( polaris audit --audit-path . --format pretty > "$tmp_dir/polaris.out" 2>&1; echo $? > "$tmp_dir/polaris.exit" ) &
    local pid_pol=$!
    tools_run=$((tools_run + 1))
  else
    error "  [3/5] polaris — NOT FOUND"
    tools_missing=$((tools_missing + 1))
  fi

  if command_exists kubeaudit; then
    info "  [4/5] kubeaudit (security audit)... ⏳"
    ( find . -name "*.yaml" -o -name "*.yml" | grep -v node_modules | head -50 | xargs -I{} kubeaudit all -f {} > "$tmp_dir/kubeaudit.out" 2>&1; echo $? > "$tmp_dir/kubeaudit.exit" ) &
    local pid_ka=$!
    tools_run=$((tools_run + 1))
  else
    error "  [4/5] kubeaudit — NOT FOUND"
    tools_missing=$((tools_missing + 1))
  fi

  if command_exists trivy; then
    info "  [5/5] trivy (IaC scan)... ⏳"
    ( trivy config --severity CRITICAL,HIGH . > "$tmp_dir/trivy.out" 2>&1; echo $? > "$tmp_dir/trivy.exit" ) &
    local pid_tr=$!
    tools_run=$((tools_run + 1))
  else
    error "  [5/5] trivy — NOT FOUND"
    tools_missing=$((tools_missing + 1))
  fi

  info "  Waiting for scanners..."
  for pid_var in pid_kb pid_ks pid_pol pid_ka pid_tr; do
    eval "local pid=\${$pid_var:-}"
    [ -n "$pid" ] && wait "$pid" 2>/dev/null
  done

  for tool in kube-bench kube-score polaris kubeaudit trivy; do
    if [ -f "$tmp_dir/$tool.exit" ]; then
      [ "$(cat "$tmp_dir/$tool.exit")" != "0" ] && exit_code=1
      echo ""
      echo "──── $tool results ────"
      cat "$tmp_dir/$tool.out"
    fi
  done

  echo ""
  echo "════════════════════════════════════════"
  echo "  Scanners run: $tools_run | Missing: $tools_missing"
  echo "════════════════════════════════════════"
  [ $tools_missing -gt 0 ] && warn "Install missing tools — see PREREQUISITES.md"
  [ $exit_code -eq 0 ] && success "All scans passed!" || warn "Issues found — review output above"
  return $exit_code
}

case "${1:-}" in
  --check) check_tools ;;
  --scan)  run_scan ;;
  *) echo "Usage: $0 --check | --scan"; exit 1 ;;
esac
