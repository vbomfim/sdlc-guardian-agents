#!/usr/bin/env bash
# SDLC Guardian Agents — Package & Deploy
#
# Usage:
#   ./package.sh              # Build zip only (dist/sdlc-guardian-agents.zip)
#   ./package.sh --install    # Build zip AND install to ~/.copilot/
#   ./package.sh --uninstall  # Remove from ~/.copilot/
#   ./package.sh --doctor     # Verify all prerequisites are installed

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SRC_DIR="$SCRIPT_DIR/src"
DIST_DIR="$SCRIPT_DIR/dist"
TARGET_DIR="$HOME/.copilot"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
GRAY='\033[0;90m'
BOLD='\033[1m'
NC='\033[0m'

# Guardian names — single source of truth for uninstall and doctor
GUARDIANS="security-guardian code-review-guardian po-guardian dev-guardian qa-guardian platform-guardian delivery-guardian privacy-guardian"

package() {
  echo -e "${BOLD}${CYAN}📦 Packaging SDLC Guardian Agents...${NC}"
  mkdir -p "$DIST_DIR"
  rm -f "$DIST_DIR/sdlc-guardian-agents.zip"

  cd "$SRC_DIR"
  zip -r "$DIST_DIR/sdlc-guardian-agents.zip" . -x ".*" "*.test.*"
  cd "$SCRIPT_DIR"

  local size
  size=$(ls -lh "$DIST_DIR/sdlc-guardian-agents.zip" | awk '{print $5}')
  echo ""
  echo -e "${GREEN}✔${NC}  Package created: ${BOLD}dist/sdlc-guardian-agents.zip${NC} ($size)"
  echo ""
  echo -e "  To install:"
  echo -e "    ${CYAN}unzip dist/sdlc-guardian-agents.zip -d ~/.copilot/${NC}"
  echo -e "    ${CYAN}./package.sh --install${NC}                           (recommended)"
}

install() {
  echo -e "${BOLD}${CYAN}🛡️  Installing Guardians to ~/.copilot/...${NC}"
  echo ""

  # Ensure target dirs exist
  mkdir -p "$TARGET_DIR/skills/security-guardian"
  mkdir -p "$TARGET_DIR/skills/code-review-guardian"
  mkdir -p "$TARGET_DIR/skills/platform-guardian"
  mkdir -p "$TARGET_DIR/skills/privacy-guardian"
  mkdir -p "$TARGET_DIR/agents"
  mkdir -p "$TARGET_DIR/instructions"
  mkdir -p "$TARGET_DIR/templates"

  # ── Install agents ──
  cp "$SRC_DIR/agents/security-guardian.agent.md" "$TARGET_DIR/agents/"
  # Security Guardian sub-Guardians (coordinator/specialist split — see specs/security-guardian-split/spec.md)
  if [ -d "$SRC_DIR/agents/security" ]; then
    mkdir -p "$TARGET_DIR/agents/security"
    cp -r "$SRC_DIR/agents/security/"* "$TARGET_DIR/agents/security/"
  fi
  cp "$SRC_DIR/agents/code-review-guardian.agent.md" "$TARGET_DIR/agents/"
  cp "$SRC_DIR/agents/po-guardian.agent.md" "$TARGET_DIR/agents/"
  cp "$SRC_DIR/agents/dev-guardian.agent.md" "$TARGET_DIR/agents/"
  cp "$SRC_DIR/agents/qa-guardian.agent.md" "$TARGET_DIR/agents/"
  cp "$SRC_DIR/agents/platform-guardian.agent.md" "$TARGET_DIR/agents/"
  cp "$SRC_DIR/agents/delivery-guardian.agent.md" "$TARGET_DIR/agents/"
  cp "$SRC_DIR/agents/privacy-guardian.agent.md" "$TARGET_DIR/agents/"

  # ── Install instructions ──
  cp "$SRC_DIR/instructions/security-guardian.instructions.md" "$TARGET_DIR/instructions/"
  cp "$SRC_DIR/instructions/code-review-guardian.instructions.md" "$TARGET_DIR/instructions/"
  cp "$SRC_DIR/instructions/po-guardian.instructions.md" "$TARGET_DIR/instructions/"
  cp "$SRC_DIR/instructions/dev-guardian.instructions.md" "$TARGET_DIR/instructions/"
  cp "$SRC_DIR/instructions/qa-guardian.instructions.md" "$TARGET_DIR/instructions/"
  cp "$SRC_DIR/instructions/platform-guardian.instructions.md" "$TARGET_DIR/instructions/"
  cp "$SRC_DIR/instructions/delivery-guardian.instructions.md" "$TARGET_DIR/instructions/"
  cp "$SRC_DIR/instructions/privacy-guardian.instructions.md" "$TARGET_DIR/instructions/"
  cp "$SRC_DIR/instructions/sdlc-workflow.instructions.md" "$TARGET_DIR/instructions/"

  # ── Install Operator (not a Guardian — separate naming convention) ──
  cp "$SRC_DIR/agents/operator.agent.md" "$TARGET_DIR/agents/"
  cp "$SRC_DIR/instructions/operator.instructions.md" "$TARGET_DIR/instructions/"

  # ── Install Craig instructions ──
  cp "$SRC_DIR/instructions/craig.instructions.md" "$TARGET_DIR/instructions/"

  # ── Install templates (Spec Kit-compatible Formal Spec, ticket, audit, scaffolds) ──
  mkdir -p "$TARGET_DIR/templates/scaffold"
  cp "$SRC_DIR/templates/feature-spec.template.md"     "$TARGET_DIR/templates/"
  cp "$SRC_DIR/templates/feature-ticket.template.md"   "$TARGET_DIR/templates/"
  cp "$SRC_DIR/templates/project-audit.template.md"    "$TARGET_DIR/templates/"
  cp "$SRC_DIR/templates/scaffold/"*.md                "$TARGET_DIR/templates/scaffold/"

  # ── Install skills (tool definitions only — no scripts) ──
  mkdir -p "$TARGET_DIR/skills/playwright-mcp"
  cp -r "$SRC_DIR/skills/security-guardian/"* "$TARGET_DIR/skills/security-guardian/"
  cp -r "$SRC_DIR/skills/code-review-guardian/"* "$TARGET_DIR/skills/code-review-guardian/"
  cp -r "$SRC_DIR/skills/platform-guardian/"* "$TARGET_DIR/skills/platform-guardian/"
  cp -r "$SRC_DIR/skills/privacy-guardian/"* "$TARGET_DIR/skills/privacy-guardian/"
  cp -r "$SRC_DIR/skills/playwright-mcp/"* "$TARGET_DIR/skills/playwright-mcp/"

  # ── Install extensions (runtime modules only — no test files) ──
  mkdir -p "$TARGET_DIR/extensions/sdlc-guardian"
  cp "$SRC_DIR/extensions/sdlc-guardian/extension.mjs" "$TARGET_DIR/extensions/sdlc-guardian/"
  cp "$SRC_DIR/extensions/sdlc-guardian/uat-state-machine.mjs" "$TARGET_DIR/extensions/sdlc-guardian/"

  mkdir -p "$TARGET_DIR/extensions/craig"
  cp "$SRC_DIR/extensions/craig/extension.mjs" "$TARGET_DIR/extensions/craig/"
  cp "$SRC_DIR/extensions/craig/craig-scheduler.mjs" "$TARGET_DIR/extensions/craig/"
  cp "$SRC_DIR/extensions/craig/craig-config.mjs" "$TARGET_DIR/extensions/craig/"

  # ── Seed side-notes files (never overwrite existing — user data) ──
  local NOTES_CREATED=0
  local NOTES_EXISTED=0
  # shellcheck disable=SC2086
  for guardian in $GUARDIANS; do
    [[ "$guardian" =~ ^[a-z-]+$ ]] || continue
    notes_file="$TARGET_DIR/instructions/${guardian}.notes.md"
    if [ ! -f "$notes_file" ]; then
      printf "# %s — Advisory Notes\\n\\n" "$guardian" > "$notes_file"
      printf "<!-- Learned patterns from past reviews. Guardians read this file at startup. -->\\n" >> "$notes_file"
      printf "<!-- Add notes as markdown bullets. Keep to ~20 items; prune when exceeded. -->\\n" >> "$notes_file"
      # Security Guardian uses a [sub] tag convention so the coordinator can
      # filter notes per sub-Guardian on fan-out (see specs/security-guardian-split/spec.md FR-013).
      if [ "$guardian" = "security-guardian" ]; then
        printf "\\n<!-- TAG CONVENTION (coordinator-filtered):\\n" >> "$notes_file"
        printf "     Prefix each note with [appsec], [supply-chain], [secrets], [threat-model],\\n" >> "$notes_file"
        printf "     or [iac] so the coordinator passes only the relevant subset to each sub.\\n" >> "$notes_file"
        printf "     Untagged notes are passed to all subs.\\n" >> "$notes_file"
        printf "     Examples:\\n" >> "$notes_file"
        printf "       - [secrets] Repo keeps API keys in src/config/secrets.ts — scan there.\\n" >> "$notes_file"
        printf "       - [appsec] Repository layer historically uses raw SQL strings — always flag.\\n" >> "$notes_file"
        printf "       - [iac] Production Terraform lives in infra/prod/ and uses aws_iam_role modules.\\n" >> "$notes_file"
        printf "       - [supply-chain] CI runs npm audit --production; dev deps may have intentional unfixed CVEs.\\n" >> "$notes_file"
        printf "       - [threat-model] Tenant boundary is at the API gateway; no app-server enforcement.\\n" >> "$notes_file"
        printf "     -->\\n" >> "$notes_file"
      fi
      chmod 600 "$notes_file"
      NOTES_CREATED=$((NOTES_CREATED + 1))
    else
      NOTES_EXISTED=$((NOTES_EXISTED + 1))
    fi
  done

  echo -e "${BOLD}Security Guardian:${NC}"
  echo -e "${GREEN}✔${NC}  Agent:        ~/.copilot/agents/security-guardian.agent.md"
  if [ -d "$TARGET_DIR/agents/security" ]; then
    sub_count=$(find "$TARGET_DIR/agents/security" -name "*.agent.md" 2>/dev/null | wc -l | tr -d ' ')
    echo -e "${GREEN}✔${NC}  Sub-agents:   ~/.copilot/agents/security/ ($sub_count specialist file(s))"
  fi
  echo -e "${GREEN}✔${NC}  Instructions: ~/.copilot/instructions/security-guardian.instructions.md"
  echo -e "${GREEN}✔${NC}  Skill:        ~/.copilot/skills/security-guardian/"
  echo ""
  echo -e "${BOLD}Code Review Guardian:${NC}"
  echo -e "${GREEN}✔${NC}  Agent:        ~/.copilot/agents/code-review-guardian.agent.md"
  echo -e "${GREEN}✔${NC}  Instructions: ~/.copilot/instructions/code-review-guardian.instructions.md"
  echo -e "${GREEN}✔${NC}  Skill:        ~/.copilot/skills/code-review-guardian/"
  echo ""
  echo -e "${BOLD}Product Owner Guardian:${NC}"
  echo -e "${GREEN}✔${NC}  Agent:        ~/.copilot/agents/po-guardian.agent.md"
  echo -e "${GREEN}✔${NC}  Instructions: ~/.copilot/instructions/po-guardian.instructions.md"
  echo ""
  echo -e "${BOLD}Developer Guardian:${NC}"
  echo -e "${GREEN}✔${NC}  Agent:        ~/.copilot/agents/dev-guardian.agent.md"
  echo -e "${GREEN}✔${NC}  Instructions: ~/.copilot/instructions/dev-guardian.instructions.md"
  echo ""
  echo -e "${BOLD}QA Guardian:${NC}"
  echo -e "${GREEN}✔${NC}  Agent:        ~/.copilot/agents/qa-guardian.agent.md"
  echo -e "${GREEN}✔${NC}  Instructions: ~/.copilot/instructions/qa-guardian.instructions.md"
  echo ""
  echo -e "${BOLD}Platform Guardian:${NC}"
  echo -e "${GREEN}✔${NC}  Agent:        ~/.copilot/agents/platform-guardian.agent.md"
  echo -e "${GREEN}✔${NC}  Instructions: ~/.copilot/instructions/platform-guardian.instructions.md"
  echo -e "${GREEN}✔${NC}  Skill:        ~/.copilot/skills/platform-guardian/"
  echo ""
  echo -e "${BOLD}Delivery Guardian:${NC}"
  echo -e "${GREEN}✔${NC}  Agent:        ~/.copilot/agents/delivery-guardian.agent.md"
  echo -e "${GREEN}✔${NC}  Instructions: ~/.copilot/instructions/delivery-guardian.instructions.md"
  echo ""
  echo -e "${BOLD}Privacy Guardian:${NC}"
  echo -e "${GREEN}✔${NC}  Agent:        ~/.copilot/agents/privacy-guardian.agent.md"
  echo -e "${GREEN}✔${NC}  Instructions: ~/.copilot/instructions/privacy-guardian.instructions.md"
  echo -e "${GREEN}✔${NC}  Skill:        ~/.copilot/skills/privacy-guardian/"
  echo ""
  echo -e "${BOLD}Operator (task runner):${NC}"
  echo -e "${GREEN}✔${NC}  Agent:        ~/.copilot/agents/operator.agent.md"
  echo -e "${GREEN}✔${NC}  Instructions: ~/.copilot/instructions/operator.instructions.md"
  echo -e "${GREEN}✔${NC}  Skill:        ~/.copilot/skills/playwright-mcp/"
  echo ""
  echo -e "${BOLD}Craig (scheduled tasks):${NC}"
  echo -e "${GREEN}✔${NC}  Instructions: ~/.copilot/instructions/craig.instructions.md"
  echo -e "${GREEN}✔${NC}  Extension:    ~/.copilot/extensions/craig/extension.mjs"
  echo -e "${GREEN}✔${NC}  Scheduler:    ~/.copilot/extensions/craig/craig-scheduler.mjs"
  echo -e "${GREEN}✔${NC}  Config loader: ~/.copilot/extensions/craig/craig-config.mjs"
  echo ""
  echo -e "${BOLD}SDLC Guardian Extension:${NC}"
  echo -e "${GREEN}✔${NC}  Extension:    ~/.copilot/extensions/sdlc-guardian/extension.mjs"
  echo -e "${GREEN}✔${NC}  State machine: ~/.copilot/extensions/sdlc-guardian/uat-state-machine.mjs"
  echo ""
  echo -e "${BOLD}Templates:${NC}"
  echo -e "${GREEN}✔${NC}  Feature Spec:   ~/.copilot/templates/feature-spec.template.md (Spec Kit-compatible)"
  echo -e "${GREEN}✔${NC}  Feature Ticket: ~/.copilot/templates/feature-ticket.template.md (18 sections)"
  echo -e "${GREEN}✔${NC}  Project Audit:  ~/.copilot/templates/project-audit.template.md"
  echo -e "${GREEN}✔${NC}  Scaffolds:      ~/.copilot/templates/scaffold/ (README, ARCHITECTURE, ADR, CONTRIBUTING, SECURITY)"
  echo ""
  echo -e "${BOLD}Side-Notes (advisory):${NC}"
  echo -e "${GREEN}✔${NC}  Notes: ${NOTES_CREATED} created, ${NOTES_EXISTED} preserved"
  echo ""
  echo -e "${BOLD}You're set!${NC} Open Copilot CLI and:"
  echo -e "  • Global instructions are ${GREEN}already active${NC}"
  echo -e "  • Use ${CYAN}/agent${NC} to pick any Guardian (Security, Code Review, PO, …)"
  echo -e "  • Say ${CYAN}\"set up security\"${NC} to install scanning tools"
}

uninstall() {
  echo -e "${BOLD}${YELLOW}🗑️  Uninstalling Guardians...${NC}"
  echo ""

  # shellcheck disable=SC2086
  for guardian in $GUARDIANS; do
    [ -d "$TARGET_DIR/skills/$guardian" ] && rm -rf "$TARGET_DIR/skills/$guardian" && echo -e "${GREEN}✔${NC}  Removed ~/.copilot/skills/$guardian/"
    [ -f "$TARGET_DIR/agents/$guardian.agent.md" ] && rm "$TARGET_DIR/agents/$guardian.agent.md" && echo -e "${GREEN}✔${NC}  Removed ~/.copilot/agents/$guardian.agent.md"
    [ -f "$TARGET_DIR/instructions/$guardian.instructions.md" ] && rm "$TARGET_DIR/instructions/$guardian.instructions.md" && echo -e "${GREEN}✔${NC}  Removed ~/.copilot/instructions/$guardian.instructions.md"
  done

  # ── Remove shared instructions not covered by the guardian loop ──
  [ -f "$TARGET_DIR/instructions/sdlc-workflow.instructions.md" ] && rm "$TARGET_DIR/instructions/sdlc-workflow.instructions.md" && echo -e "${GREEN}✔${NC}  Removed ~/.copilot/instructions/sdlc-workflow.instructions.md"

  # ── Remove Operator (not a Guardian — separate naming convention) ──
  [ -f "$TARGET_DIR/agents/operator.agent.md" ] && rm "$TARGET_DIR/agents/operator.agent.md" && echo -e "${GREEN}✔${NC}  Removed ~/.copilot/agents/operator.agent.md"
  [ -f "$TARGET_DIR/instructions/operator.instructions.md" ] && rm "$TARGET_DIR/instructions/operator.instructions.md" && echo -e "${GREEN}✔${NC}  Removed ~/.copilot/instructions/operator.instructions.md"

  # ── Remove extensions ──
  [ -d "$TARGET_DIR/extensions/sdlc-guardian" ] && rm -rf "$TARGET_DIR/extensions/sdlc-guardian" && echo -e "${GREEN}✔${NC}  Removed ~/.copilot/extensions/sdlc-guardian/"
  [ -d "$TARGET_DIR/extensions/craig" ] && rm -rf "$TARGET_DIR/extensions/craig" && echo -e "${GREEN}✔${NC}  Removed ~/.copilot/extensions/craig/"

  # ── Remove templates ──
  [ -f "$TARGET_DIR/templates/feature-spec.template.md" ] && rm "$TARGET_DIR/templates/feature-spec.template.md" && echo -e "${GREEN}✔${NC}  Removed ~/.copilot/templates/feature-spec.template.md"
  [ -f "$TARGET_DIR/templates/feature-ticket.template.md" ] && rm "$TARGET_DIR/templates/feature-ticket.template.md" && echo -e "${GREEN}✔${NC}  Removed ~/.copilot/templates/feature-ticket.template.md"
  [ -f "$TARGET_DIR/templates/project-audit.template.md" ] && rm "$TARGET_DIR/templates/project-audit.template.md" && echo -e "${GREEN}✔${NC}  Removed ~/.copilot/templates/project-audit.template.md"
  [ -d "$TARGET_DIR/templates/scaffold" ] && rm -rf "$TARGET_DIR/templates/scaffold" && echo -e "${GREEN}✔${NC}  Removed ~/.copilot/templates/scaffold/"
  [ -d "$TARGET_DIR/templates" ] && rmdir "$TARGET_DIR/templates" 2>/dev/null && echo -e "${GREEN}✔${NC}  Removed empty ~/.copilot/templates/"

  echo ""
  echo -e "${GREEN}Done.${NC} Repo-level files (.github/) are untouched — remove per-repo if needed."
  echo -e "${GRAY}Side-notes files (~/.copilot/instructions/*.notes.md) are preserved — they contain user data.${NC}"
}

# ── Doctor: verify all prerequisites ──

# SECURITY: $cmd and $ver_flag MUST be hardcoded literals — never pass user input.
# _check_tool <display_name> <command> <version_flag> <guardian> <install_hint> [--core]
# Uses command -v for portability (POSIX). Prints ✅, ⚠️, or ❌.
# Pass --core as 6th arg to mark missing tools as critical (red ❌).
_check_tool() {
  local name="$1"
  local cmd="$2"
  local ver_flag="$3"
  local guardian="$4"
  local hint="$5"
  local is_core="${6:-}"

  DOCTOR_TOTAL=$((DOCTOR_TOTAL + 1))

  if command -v "$cmd" >/dev/null 2>&1; then
    local version=""
    if [ -n "$ver_flag" ]; then
      # shellcheck disable=SC2086
      version=$($cmd $ver_flag 2>/dev/null | grep -oE '[0-9]+\.[0-9]+[.0-9]*' | head -1 | sed 's/\.$//' || true)
    fi
    if [ -n "$version" ]; then
      echo -e "  ${GREEN}✅${NC} ${name} ${GRAY}(${version})${NC}"
    else
      echo -e "  ${GREEN}✅${NC} ${name}"
    fi
    DOCTOR_AVAILABLE=$((DOCTOR_AVAILABLE + 1))
    return
  fi

  # Tool not found
  if [ "$is_core" = "--core" ]; then
    echo -e "  ${RED}❌${NC} ${name} — ${GRAY}Used by: ${guardian}${NC}"
    DOCTOR_CORE_MISSING=$((DOCTOR_CORE_MISSING + 1))
  else
    echo -e "  ${YELLOW}⚠️${NC}  ${name} — ${GRAY}Used by: ${guardian}${NC}"
    DOCTOR_OPTIONAL_MISSING=$((DOCTOR_OPTIONAL_MISSING + 1))
  fi
  if [ -n "$hint" ]; then
    echo -e "      ${GRAY}Install: ${hint}${NC}"
  fi
}

# _check_file <relative_path> <description>
# Checks if a Guardian file exists at ~/.copilot/<path>
_check_file() {
  local rel_path="$1"
  local desc="$2"
  local full_path="$TARGET_DIR/$rel_path"

  DOCTOR_FILE_TOTAL=$((DOCTOR_FILE_TOTAL + 1))

  if [ -e "$full_path" ]; then
    echo -e "  ${GREEN}✅${NC} ${desc}"
    DOCTOR_FILE_OK=$((DOCTOR_FILE_OK + 1))
  else
    echo -e "  ${YELLOW}⚠️${NC}  ${desc} — ${GRAY}~/.copilot/${rel_path}${NC}"
    DOCTOR_FILE_MISSING=$((DOCTOR_FILE_MISSING + 1))
  fi
}

_print_section() {
  echo ""
  echo -e "${BOLD}$1${NC}"
}

doctor_check_tools() {
  # ── 1. Core Requirements ──
  _print_section "Core Requirements"
  _check_tool "Git"         "git"     "--version" "All Guardians"             "see PREREQUISITES.md" --core
  _check_tool "GitHub CLI"  "gh"      "--version" "PO Guardian, Default Agent" "see PREREQUISITES.md" --core
  _check_tool "Copilot CLI" "copilot" "--version" "All Guardians"             "see PREREQUISITES.md" --core

  # ── 2. Security Guardian Tools ──
  _print_section "Security Guardian Tools"
  _check_tool "Semgrep"  "semgrep"  "--version" "Security Guardian, Privacy Guardian"  "pip3 install semgrep (see PREREQUISITES.md)"
  _check_tool "Gitleaks" "gitleaks" "version"   "Security Guardian, Privacy Guardian"  "see PREREQUISITES.md"
  _check_tool "Trivy"    "trivy"    "--version" "Security Guardian, Platform Guardian"  "see PREREQUISITES.md"

  # ── 3. Code Review Guardian Tools ──
  _print_section "Code Review Guardian Tools"
  _check_tool "ESLint"             "eslint"       "--version" "Code Review Guardian" "npm install -g eslint (see PREREQUISITES.md)"
  _check_tool "Ruff"               "ruff"         "--version" "Code Review Guardian" "pip3 install ruff (see PREREQUISITES.md)"
  _check_tool "Pylint"             "pylint"       "--version" "Code Review Guardian" "pip3 install pylint (see PREREQUISITES.md)"
  _check_tool "Clippy"             "cargo-clippy" "--version" "Code Review Guardian" "rustup component add clippy (see PREREQUISITES.md)"
  _check_tool "dotnet"             "dotnet"       "--version" "Code Review Guardian" "see PREREQUISITES.md"
  _check_tool "Maven (Checkstyle)" "mvn"          "--version" "Code Review Guardian" "see PREREQUISITES.md"

  # ── 4. Platform Guardian Tools ──
  _print_section "Platform Guardian Tools"
  _check_tool "kubectl"    "kubectl"    "version --client" "Platform Guardian"                      "see PREREQUISITES.md"
  _check_tool "kube-bench" "kube-bench" "version"          "Platform Guardian"                      "see PREREQUISITES.md"
  _check_tool "kube-score" "kube-score" "version"          "Platform Guardian"                      "see PREREQUISITES.md"
  _check_tool "Polaris"    "polaris"    "version"          "Platform Guardian"                      "see PREREQUISITES.md"
  _check_tool "kubeaudit"  "kubeaudit"  "version"          "Platform Guardian"                      "see PREREQUISITES.md"
  _check_tool "Helm"       "helm"       "version --short"  "Platform Guardian, Delivery Guardian"   "see PREREQUISITES.md"

  # ── 5. Delivery Guardian Tools ──
  _print_section "Delivery Guardian Tools"
  _check_tool "k6"        "k6" "version"    "Delivery Guardian, QA Guardian"          "see PREREQUISITES.md"
  _check_tool "Azure CLI" "az" "--version"  "Platform Guardian, Delivery Guardian"     "see PREREQUISITES.md"

  # ── 6. Dependency Auditors ──
  _print_section "Dependency Auditors"
  _check_tool "pip-audit"   "pip-audit"   "--version" "Security Guardian" "pip3 install pip-audit (see PREREQUISITES.md)"
  _check_tool "Bandit"      "bandit"      "--version" "Security Guardian" "pip3 install bandit (see PREREQUISITES.md)"
  _check_tool "Safety"      "safety"      "--version" "Security Guardian" "pip3 install safety (see PREREQUISITES.md)"
  _check_tool "cargo-audit" "cargo-audit" "--version" "Security Guardian" "cargo install cargo-audit (see PREREQUISITES.md)"
  _check_tool "cargo-deny"  "cargo-deny"  "--version" "Security Guardian" "cargo install cargo-deny (see PREREQUISITES.md)"

  # ── 7. Operator Tools ──
  _print_section "Operator Tools"
  _check_tool "npx (Playwright MCP)" "npx" "--version" "Operator" "Install Node.js; then: npx @playwright/mcp@0.0.28 (see PREREQUISITES.md §7)"
}

doctor_check_files() {
  _print_section "Guardian Files (installed to ~/.copilot/)"

  # Agents
  # shellcheck disable=SC2086
  for guardian in $GUARDIANS; do
    _check_file "agents/${guardian}.agent.md" "${guardian}.agent.md"
  done

  # Instructions
  # shellcheck disable=SC2086
  for guardian in $GUARDIANS; do
    _check_file "instructions/${guardian}.instructions.md" "${guardian}.instructions.md"
  done
  _check_file "instructions/sdlc-workflow.instructions.md" "sdlc-workflow.instructions.md"

  # Operator (not a Guardian — separate naming convention)
  _check_file "agents/operator.agent.md" "operator.agent.md"
  _check_file "instructions/operator.instructions.md" "operator.instructions.md"

  # Skills
  for skill in security-guardian code-review-guardian platform-guardian privacy-guardian; do
    _check_file "skills/${skill}/SKILL.md" "skills/${skill}/"
  done

  # Extensions
  _check_file "extensions/sdlc-guardian/extension.mjs"         "extensions/sdlc-guardian/extension.mjs"
  _check_file "extensions/sdlc-guardian/uat-state-machine.mjs" "extensions/sdlc-guardian/uat-state-machine.mjs"
  _check_file "extensions/craig/extension.mjs"                 "extensions/craig/extension.mjs"
  _check_file "extensions/craig/craig-scheduler.mjs"           "extensions/craig/craig-scheduler.mjs"
  _check_file "extensions/craig/craig-config.mjs"              "extensions/craig/craig-config.mjs"

  # Templates
  _check_file "templates/feature-spec.template.md"   "templates/feature-spec.template.md (Spec Kit-compatible)"
  _check_file "templates/feature-ticket.template.md" "templates/feature-ticket.template.md"
  _check_file "templates/project-audit.template.md"  "templates/project-audit.template.md"
  _check_file "templates/scaffold/README.template.md"        "templates/scaffold/README.template.md"
  _check_file "templates/scaffold/ARCHITECTURE.template.md"  "templates/scaffold/ARCHITECTURE.template.md"
  _check_file "templates/scaffold/ADR.template.md"           "templates/scaffold/ADR.template.md"
  _check_file "templates/scaffold/CONTRIBUTING.template.md"  "templates/scaffold/CONTRIBUTING.template.md"
  _check_file "templates/scaffold/SECURITY.template.md"      "templates/scaffold/SECURITY.template.md"

  # Side-notes (advisory — not critical if missing)
  # shellcheck disable=SC2086
  for guardian in $GUARDIANS; do
    _check_file "instructions/${guardian}.notes.md" "${guardian}.notes.md (side-notes)"
  done

  if [ "$DOCTOR_FILE_MISSING" -gt 0 ]; then
    echo ""
    echo -e "  ${GRAY}Run ${CYAN}./package.sh --install${GRAY} to install Guardian files.${NC}"
  fi
}

doctor_print_summary() {
  echo ""
  echo -e "${BOLD}────────────────────────────────────────${NC}"
  echo -e "${BOLD}Summary:${NC} ${DOCTOR_AVAILABLE}/${DOCTOR_TOTAL} tools available. ${DOCTOR_OPTIONAL_MISSING} optional missing. ${DOCTOR_CORE_MISSING} core missing."

  if [ "$DOCTOR_FILE_MISSING" -gt 0 ]; then
    echo -e "         ${DOCTOR_FILE_OK}/${DOCTOR_FILE_TOTAL} Guardian files installed. ${DOCTOR_FILE_MISSING} missing."
  else
    echo -e "         ${DOCTOR_FILE_OK}/${DOCTOR_FILE_TOTAL} Guardian files installed."
  fi

  if [ "$DOCTOR_CORE_MISSING" -gt 0 ]; then
    echo ""
    echo -e "${RED}${BOLD}✘ Core requirements missing.${NC} Install them before using Guardians."
    return 1
  else
    echo ""
    echo -e "${GREEN}${BOLD}✔ Core requirements met.${NC} Optional tools can be installed as needed."
    return 0
  fi
}

doctor() {
  # Counters — scoped to doctor (visible to sub-functions via dynamic scoping)
  local DOCTOR_TOTAL=0
  local DOCTOR_AVAILABLE=0
  local DOCTOR_OPTIONAL_MISSING=0
  local DOCTOR_CORE_MISSING=0
  local DOCTOR_FILE_TOTAL=0
  local DOCTOR_FILE_OK=0
  local DOCTOR_FILE_MISSING=0

  echo -e "${BOLD}${CYAN}🩺 SDLC Guardian Agents — Doctor${NC}"
  echo -e "${GRAY}Checking prerequisites...${NC}"

  doctor_check_tools
  doctor_check_files
  doctor_print_summary
}

case "${1:-}" in
  --install)
    package
    echo ""
    install
    ;;
  --uninstall)
    uninstall
    ;;
  --doctor)
    doctor
    ;;
  *)
    package
    ;;
esac
