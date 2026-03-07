#!/usr/bin/env bash
# Code Review Guardian — Tool Setup & Scan Script
# Detects project languages and runs the appropriate linters/analyzers.
# Deterministic pipeline: same tools, same order, every time.
#
# Usage:
#   ./setup.sh              # Auto-detect languages, install linters
#   ./setup.sh --scan       # Run all linters (deterministic pipeline)
#   ./setup.sh --check      # Check which linters are installed
#   ./setup.sh --all        # Install linters for ALL languages

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

# ─── Language Detection ───────────────────────────────────────────────────────
detect_languages() {
  local langs=()
  local dir="${PROJECT_DIR:-.}"

  if [ -f "$dir/package.json" ] || find "$dir" -maxdepth 3 -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.jsx" 2>/dev/null | head -1 | grep -q .; then
    langs+=("nodejs")
  fi
  if find "$dir" -maxdepth 3 -name "*.csproj" -o -name "*.sln" -o -name "*.cs" 2>/dev/null | head -1 | grep -q .; then
    langs+=("dotnet")
  fi
  if [ -f "$dir/Cargo.toml" ] || find "$dir" -maxdepth 3 -name "Cargo.toml" 2>/dev/null | head -1 | grep -q .; then
    langs+=("rust")
  fi
  if [ -f "$dir/requirements.txt" ] || [ -f "$dir/pyproject.toml" ] || [ -f "$dir/setup.py" ] || find "$dir" -maxdepth 3 -name "*.py" 2>/dev/null | head -1 | grep -q .; then
    langs+=("python")
  fi
  if [ -f "$dir/pom.xml" ] || [ -f "$dir/build.gradle" ] || [ -f "$dir/build.gradle.kts" ] || find "$dir" -maxdepth 3 -name "*.java" 2>/dev/null | head -1 | grep -q .; then
    langs+=("java")
  fi

  echo "${langs[@]}"
}

# ─── Install Functions ────────────────────────────────────────────────────────

install_nodejs_tools() {
  header "Node.js / TypeScript Linters"
  if ! command_exists npm; then
    warn "npm not found — skipping"
    return 0
  fi
  if [ -f "package.json" ]; then
    info "Installing ESLint as dev dependency..."
    npm install --save-dev eslint 2>/dev/null && success "eslint installed" || warn "Install manually: npm i -D eslint"
  else
    info "Installing ESLint globally..."
    npm install -g eslint 2>/dev/null && success "eslint installed globally" || warn "Install manually: npm i -g eslint"
  fi
}

install_python_tools() {
  header "Python Linters"
  local pip_cmd=""
  if command_exists pip3; then pip_cmd="pip3"
  elif command_exists pip; then pip_cmd="pip"
  else warn "pip not found — skipping"; return 0; fi

  for tool in pylint ruff; do
    if ! command_exists "$tool"; then
      info "Installing $tool..."
      $pip_cmd install "$tool" --quiet 2>/dev/null && success "$tool installed" || warn "Install manually: $pip_cmd install $tool"
    else
      success "$tool already installed"
    fi
  done
}

install_rust_tools() {
  header "Rust Linters"
  if ! command_exists cargo; then warn "cargo not found — skipping"; return 0; fi
  success "clippy is included with rustup (cargo clippy)"
}

install_dotnet_tools() {
  header "C# / .NET Linters"
  if ! command_exists dotnet; then warn "dotnet not found — skipping"; return 0; fi
  success "dotnet format is included with .NET SDK"
}

install_java_tools() {
  header "Java Linters"
  if command_exists mvn; then
    info "Add Checkstyle + SpotBugs to pom.xml:"
    echo '  <plugin><groupId>org.apache.maven.plugins</groupId><artifactId>maven-checkstyle-plugin</artifactId></plugin>'
    echo '  <plugin><groupId>com.github.spotbugs</groupId><artifactId>spotbugs-maven-plugin</artifactId></plugin>'
  elif command_exists gradle; then
    info "Add to build.gradle:"
    echo "  plugins { id 'checkstyle'; id 'com.github.spotbugs' version '6.0+' }"
  else
    warn "Neither mvn nor gradle found — skipping"
  fi
}

# ─── Check Mode ──────────────────────────────────────────────────────────────

check_tools() {
  header "Code Review Tools Status"

  echo -e "${BOLD}JavaScript/TypeScript:${NC}"
  for tool in eslint npx; do
    if command_exists "$tool"; then success "$tool: $($tool --version 2>/dev/null | head -1)"
    else warn "$tool: not found"; fi
  done

  echo -e "\n${BOLD}Python:${NC}"
  for tool in pylint ruff; do
    if command_exists "$tool"; then success "$tool: $($tool --version 2>/dev/null | head -1)"
    else warn "$tool: not found"; fi
  done

  echo -e "\n${BOLD}Rust:${NC}"
  if command_exists cargo; then
    success "cargo clippy: $(cargo clippy --version 2>/dev/null | head -1 || echo 'available')"
  else warn "cargo: not found"; fi

  echo -e "\n${BOLD}C# / .NET:${NC}"
  if command_exists dotnet; then success "dotnet format: available ($(dotnet --version 2>/dev/null))"
  else warn "dotnet: not found"; fi

  echo -e "\n${BOLD}Java:${NC}"
  for tool in mvn gradle; do
    if command_exists "$tool"; then success "$tool: available"
    else warn "$tool: not found"; fi
  done
}

# ─── Scan Mode ───────────────────────────────────────────────────────────────

run_scan() {
  header "Running Code Review Scan"
  info "Deterministic pipeline — parallel linters + sequential analysis"
  echo ""

  local dir="${PROJECT_DIR:-.}"
  local exit_code=0
  local tools_run=0
  local tools_missing=0
  local langs
  langs=$(detect_languages)

  # Create temp dir for parallel results
  local tmp_dir
  tmp_dir=$(mktemp -d)
  trap "rm -rf $tmp_dir" EXIT

  # ══════════════════════════════════════════════════════════════════════════
  # PHASE 1: Linters — run in PARALLEL (independent of each other)
  # ══════════════════════════════════════════════════════════════════════════
  info "Phase 1: Linters (parallel)"

  # ── 1. ESLint (JS/TS) ──
  if [[ " $langs " == *" nodejs "* ]]; then
    if command_exists eslint || command_exists npx; then
      info "  [1/5] ESLint (JS/TS)... ⏳"
      local eslint_cmd="eslint"
      command_exists eslint || eslint_cmd="npx eslint"
      ( $eslint_cmd "$dir" --no-error-on-unmatched-pattern --format compact > "$tmp_dir/eslint.out" 2>&1; echo $? > "$tmp_dir/eslint.exit" ) &
      local pid_eslint=$!
      tools_run=$((tools_run + 1))
    else
      warn "  [1/5] ESLint — NOT INSTALLED (Node.js project detected)"
      tools_missing=$((tools_missing + 1))
    fi
  else
    info "  [1/5] ESLint — skipped (not a Node.js project)"
  fi

  # ── 2. Pylint + Ruff (Python) ──
  if [[ " $langs " == *" python "* ]]; then
    if command_exists ruff; then
      info "  [2/5] Ruff (Python fast linter)... ⏳"
      ( ruff check "$dir" > "$tmp_dir/ruff.out" 2>&1; echo $? > "$tmp_dir/ruff.exit" ) &
      local pid_ruff=$!
      tools_run=$((tools_run + 1))
    else
      warn "  [2/5] Ruff — NOT INSTALLED (Python project detected)"
      tools_missing=$((tools_missing + 1))
    fi
    if command_exists pylint; then
      info "  [2/5] Pylint (Python deep analysis)... ⏳"
      ( find "$dir" -name "*.py" -not -path "*/venv/*" -not -path "*/.venv/*" | head -20 | xargs pylint --disable=C0114,C0115,C0116 --score=yes > "$tmp_dir/pylint.out" 2>&1; echo $? > "$tmp_dir/pylint.exit" ) &
      local pid_pylint=$!
      tools_run=$((tools_run + 1))
    else
      warn "  [2/5] Pylint — NOT INSTALLED (Python project detected)"
      tools_missing=$((tools_missing + 1))
    fi
  else
    info "  [2/5] Pylint + Ruff — skipped (not a Python project)"
  fi

  # ── 3. Clippy (Rust) ──
  if [[ " $langs " == *" rust "* ]]; then
    if command_exists cargo; then
      info "  [3/5] Clippy (Rust)... ⏳"
      ( cd "$dir" && cargo clippy --message-format=short 2>&1 | grep -E "^(warning|error)" > "$tmp_dir/clippy.out" 2>&1; echo $? > "$tmp_dir/clippy.exit" ) &
      local pid_clippy=$!
      tools_run=$((tools_run + 1))
    else
      warn "  [3/5] Clippy — NOT INSTALLED (Rust project detected)"
      tools_missing=$((tools_missing + 1))
    fi
  else
    info "  [3/5] Clippy — skipped (not a Rust project)"
  fi

  # ── 4. dotnet format (C#) ──
  if [[ " $langs " == *" dotnet "* ]]; then
    if command_exists dotnet; then
      info "  [4/5] dotnet format (C#)... ⏳"
      ( cd "$dir" && dotnet format --verify-no-changes --verbosity minimal > "$tmp_dir/dotnet.out" 2>&1; echo $? > "$tmp_dir/dotnet.exit" ) &
      local pid_dotnet=$!
      tools_run=$((tools_run + 1))
    else
      warn "  [4/5] dotnet format — NOT INSTALLED (.NET project detected)"
      tools_missing=$((tools_missing + 1))
    fi
  else
    info "  [4/5] dotnet format — skipped (not a .NET project)"
  fi

  # ── 5. Checkstyle / SpotBugs (Java) ──
  if [[ " $langs " == *" java "* ]]; then
    if command_exists mvn; then
      info "  [5/5] Maven Checkstyle (Java)... ⏳"
      ( cd "$dir" && mvn checkstyle:check -q > "$tmp_dir/checkstyle.out" 2>&1; echo $? > "$tmp_dir/checkstyle.exit" ) &
      local pid_checkstyle=$!
      tools_run=$((tools_run + 1))
    elif command_exists gradle; then
      info "  [5/5] Gradle Checkstyle (Java)... ⏳"
      ( cd "$dir" && gradle checkstyleMain -q > "$tmp_dir/checkstyle.out" 2>&1; echo $? > "$tmp_dir/checkstyle.exit" ) &
      local pid_checkstyle=$!
      tools_run=$((tools_run + 1))
    else
      warn "  [5/5] Java tools — NOT INSTALLED (Java project detected)"
      tools_missing=$((tools_missing + 1))
    fi
  else
    info "  [5/5] Checkstyle — skipped (not a Java project)"
  fi

  # Wait for all linters
  info "  Waiting for linters to complete..."
  for pid_var in pid_eslint pid_ruff pid_pylint pid_clippy pid_dotnet pid_checkstyle; do
    eval "local pid=\${$pid_var:-}"
    [ -n "$pid" ] && wait "$pid" 2>/dev/null
  done

  # Collect results
  for tool in eslint ruff pylint clippy dotnet checkstyle; do
    if [ -f "$tmp_dir/$tool.exit" ]; then
      local tool_exit
      tool_exit=$(cat "$tmp_dir/$tool.exit")
      if [ "$tool_exit" != "0" ]; then
        exit_code=1
      fi
      echo ""
      echo "──── $tool results ────"
      cat "$tmp_dir/$tool.out"
      echo ""
    fi
  done

  # ── Summary ──
  echo ""
  echo "════════════════════════════════════════"
  echo "  Linters run: $tools_run | Missing: $tools_missing"
  echo "════════════════════════════════════════"

  if [ $tools_missing -gt 0 ]; then
    warn "Run 'bash ~/.copilot/skills/code-review-guardian/setup.sh' to install missing linters"
  fi

  if [ $exit_code -eq 0 ]; then
    echo ""
    success "All linters passed — no issues found!"
  else
    echo ""
    warn "Linter issues found — review the output above"
  fi

  return $exit_code
}

# ─── Main ────────────────────────────────────────────────────────────────────

main() {
  local mode="${1:-auto}"
  export PROJECT_DIR="${2:-.}"

  echo -e "${BOLD}${CYAN}"
  echo "  ╔═══════════════════════════════════════════╗"
  echo "  ║     📋 Code Review Guardian Setup  📋     ║"
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
      header "Installing ALL Code Review Tools"
      ;;
    *)
      header "Auto-Detecting Project Languages"
      ;;
  esac

  # ── Install linters ──
  local langs
  if [ "$mode" = "--all" ]; then
    langs="nodejs python rust dotnet java"
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
      python) install_python_tools ;;
      rust)   install_rust_tools ;;
      dotnet) install_dotnet_tools ;;
      java)   install_java_tools ;;
    esac
  done

  header "Setup Complete"
  echo -e "${BOLD}Next steps:${NC}"
  echo "  1. Run ${CYAN}bash ~/.copilot/skills/code-review-guardian/setup.sh --scan${NC} to lint your project"
  echo "  2. Use ${CYAN}/agent${NC} → Code Review Guardian for full reviews"
  echo ""
}

main "$@"
