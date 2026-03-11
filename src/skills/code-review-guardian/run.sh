#!/usr/bin/env bash
# Code Review Guardian — Linter Runner (no installation)
# Checks linter availability and runs them. Does NOT install anything.
#
# Usage:
#   ./run.sh --check   # Check which linters are available
#   ./run.sh --scan    # Run linters for detected languages

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
  header "Code Review Tools Status"
  local langs
  langs=$(detect_languages)
  local missing_required=0

  echo -e "${BOLD}Detected languages:${NC} $langs"
  echo ""

  [[ " $langs " == *" nodejs "* ]] && {
    if command_exists eslint || command_exists npx; then success "eslint: available"
    else error "eslint: NOT FOUND [REQUIRED for JS/TS] — see PREREQUISITES.md"; missing_required=$((missing_required + 1)); fi
  }
  [[ " $langs " == *" python "* ]] && {
    if command_exists ruff; then success "ruff: available"
    else error "ruff: NOT FOUND [REQUIRED for Python] — see PREREQUISITES.md"; missing_required=$((missing_required + 1)); fi
  }
  [[ " $langs " == *" rust "* ]] && {
    if command_exists cargo; then success "clippy: available (via cargo)"
    else error "cargo: NOT FOUND [REQUIRED for Rust] — see PREREQUISITES.md"; missing_required=$((missing_required + 1)); fi
  }
  [[ " $langs " == *" dotnet "* ]] && {
    if command_exists dotnet; then success "dotnet format: available"
    else error "dotnet: NOT FOUND [REQUIRED for C#] — see PREREQUISITES.md"; missing_required=$((missing_required + 1)); fi
  }

  [ $missing_required -gt 0 ] && echo "" && error "$missing_required required linter(s) missing for detected languages"
  return $missing_required
}

run_scan() {
  header "Code Review Linter Pipeline"
  info "Parallel linters for detected languages"
  echo ""

  local dir="${PROJECT_DIR:-.}"
  local exit_code=0
  local tools_run=0
  local tools_missing=0
  local langs
  langs=$(detect_languages)
  local tmp_dir
  tmp_dir=$(mktemp -d)
  trap "rm -rf $tmp_dir" EXIT

  info "Phase 1: Linters (parallel)"

  if [[ " $langs " == *" nodejs "* ]]; then
    if command_exists eslint || command_exists npx; then
      info "  [1/5] ESLint (JS/TS)... ⏳"
      local eslint_cmd="eslint"
      command_exists eslint || eslint_cmd="npx eslint"
      ( $eslint_cmd "$dir" --no-error-on-unmatched-pattern --format compact > "$tmp_dir/eslint.out" 2>&1; echo $? > "$tmp_dir/eslint.exit" ) &
      local pid_eslint=$!
      tools_run=$((tools_run + 1))
    else
      warn "  [1/5] ESLint — NOT FOUND (Node.js project detected)"
      tools_missing=$((tools_missing + 1))
    fi
  else
    info "  [1/5] ESLint — skipped (not a Node.js project)"
  fi

  if [[ " $langs " == *" python "* ]]; then
    if command_exists ruff; then
      info "  [2/5] Ruff (Python)... ⏳"
      ( ruff check "$dir" > "$tmp_dir/ruff.out" 2>&1; echo $? > "$tmp_dir/ruff.exit" ) &
      local pid_ruff=$!
      tools_run=$((tools_run + 1))
    else
      warn "  [2/5] Ruff — NOT FOUND (Python project detected)"
      tools_missing=$((tools_missing + 1))
    fi
    if command_exists pylint; then
      info "  [2/5] Pylint (Python)... ⏳"
      ( find "$dir" -name "*.py" -not -path "*/venv/*" -not -path "*/.venv/*" | head -20 | xargs pylint --disable=C0114,C0115,C0116 --score=yes > "$tmp_dir/pylint.out" 2>&1; echo $? > "$tmp_dir/pylint.exit" ) &
      local pid_pylint=$!
      tools_run=$((tools_run + 1))
    fi
  else
    info "  [2/5] Pylint + Ruff — skipped (not a Python project)"
  fi

  if [[ " $langs " == *" rust "* ]]; then
    if command_exists cargo; then
      info "  [3/5] Clippy (Rust)... ⏳"
      ( cd "$dir" && cargo clippy --message-format=short > "$tmp_dir/clippy.out" 2>&1; echo $? > "$tmp_dir/clippy.exit" ) &
      local pid_clippy=$!
      tools_run=$((tools_run + 1))
    fi
  else
    info "  [3/5] Clippy — skipped (not a Rust project)"
  fi

  if [[ " $langs " == *" dotnet "* ]]; then
    if command_exists dotnet; then
      info "  [4/5] dotnet format (C#)... ⏳"
      ( cd "$dir" && dotnet format --verify-no-changes --verbosity minimal > "$tmp_dir/dotnet.out" 2>&1; echo $? > "$tmp_dir/dotnet.exit" ) &
      local pid_dotnet=$!
      tools_run=$((tools_run + 1))
    fi
  else
    info "  [4/5] dotnet format — skipped (not a .NET project)"
  fi

  if [[ " $langs " == *" java "* ]]; then
    if command_exists mvn; then
      info "  [5/5] Checkstyle (Java)... ⏳"
      ( cd "$dir" && mvn checkstyle:check -q > "$tmp_dir/checkstyle.out" 2>&1; echo $? > "$tmp_dir/checkstyle.exit" ) &
      local pid_checkstyle=$!
      tools_run=$((tools_run + 1))
    fi
  else
    info "  [5/5] Checkstyle — skipped (not a Java project)"
  fi

  info "  Waiting for linters..."
  for pid_var in pid_eslint pid_ruff pid_pylint pid_clippy pid_dotnet pid_checkstyle; do
    eval "local pid=\${$pid_var:-}"
    [ -n "$pid" ] && wait "$pid" 2>/dev/null
  done

  for tool in eslint ruff pylint clippy dotnet checkstyle; do
    if [ -f "$tmp_dir/$tool.exit" ]; then
      [ "$(cat "$tmp_dir/$tool.exit")" != "0" ] && exit_code=1
      echo ""
      echo "──── $tool results ────"
      cat "$tmp_dir/$tool.out"
    fi
  done

  echo ""
  echo "════════════════════════════════════════"
  echo "  Linters run: $tools_run | Missing: $tools_missing"
  echo "════════════════════════════════════════"
  [ $tools_missing -gt 0 ] && warn "Install missing linters — see PREREQUISITES.md"
  [ $exit_code -eq 0 ] && success "All linters passed!" || warn "Linter issues found — review output above"
  return $exit_code
}

case "${1:-}" in
  --check) check_tools ;;
  --scan)  export PROJECT_DIR="${2:-.}"; run_scan ;;
  *) echo "Usage: $0 --check | --scan [directory]"; exit 1 ;;
esac
