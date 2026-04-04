#!/usr/bin/env bash
# SDLC Guardian Agents — Package & Deploy
#
# Usage:
#   ./package.sh              # Build zip only (dist/sdlc-guardian-agents.zip)
#   ./package.sh --install    # Build zip AND install to ~/.copilot/
#   ./package.sh --uninstall  # Remove from ~/.copilot/

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SRC_DIR="$SCRIPT_DIR/src"
DIST_DIR="$SCRIPT_DIR/dist"
TARGET_DIR="$HOME/.copilot"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

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
  mkdir -p "$TARGET_DIR/agents"
  mkdir -p "$TARGET_DIR/instructions"

  # ── Install agents ──
  cp "$SRC_DIR/agents/security-guardian.agent.md" "$TARGET_DIR/agents/"
  cp "$SRC_DIR/agents/code-review-guardian.agent.md" "$TARGET_DIR/agents/"
  cp "$SRC_DIR/agents/po-guardian.agent.md" "$TARGET_DIR/agents/"
  cp "$SRC_DIR/agents/dev-guardian.agent.md" "$TARGET_DIR/agents/"
  cp "$SRC_DIR/agents/qa-guardian.agent.md" "$TARGET_DIR/agents/"
  cp "$SRC_DIR/agents/platform-guardian.agent.md" "$TARGET_DIR/agents/"
  cp "$SRC_DIR/agents/delivery-guardian.agent.md" "$TARGET_DIR/agents/"

  # ── Install instructions ──
  cp "$SRC_DIR/instructions/security-guardian.instructions.md" "$TARGET_DIR/instructions/"
  cp "$SRC_DIR/instructions/code-review-guardian.instructions.md" "$TARGET_DIR/instructions/"
  cp "$SRC_DIR/instructions/po-guardian.instructions.md" "$TARGET_DIR/instructions/"
  cp "$SRC_DIR/instructions/dev-guardian.instructions.md" "$TARGET_DIR/instructions/"
  cp "$SRC_DIR/instructions/qa-guardian.instructions.md" "$TARGET_DIR/instructions/"
  cp "$SRC_DIR/instructions/platform-guardian.instructions.md" "$TARGET_DIR/instructions/"
  cp "$SRC_DIR/instructions/delivery-guardian.instructions.md" "$TARGET_DIR/instructions/"
  cp "$SRC_DIR/instructions/sdlc-workflow.instructions.md" "$TARGET_DIR/instructions/"

  # ── Install skills (tool definitions only — no scripts) ──
  cp -r "$SRC_DIR/skills/security-guardian/"* "$TARGET_DIR/skills/security-guardian/"
  cp -r "$SRC_DIR/skills/code-review-guardian/"* "$TARGET_DIR/skills/code-review-guardian/"
  cp -r "$SRC_DIR/skills/platform-guardian/"* "$TARGET_DIR/skills/platform-guardian/"

  # ── Install extensions (runtime modules only — no test files) ──
  mkdir -p "$TARGET_DIR/extensions/sdlc-guardian"
  cp "$SRC_DIR/extensions/sdlc-guardian/extension.mjs" "$TARGET_DIR/extensions/sdlc-guardian/"
  cp "$SRC_DIR/extensions/sdlc-guardian/uat-state-machine.mjs" "$TARGET_DIR/extensions/sdlc-guardian/"

  mkdir -p "$TARGET_DIR/extensions/craig"
  cp "$SRC_DIR/extensions/craig/extension.mjs" "$TARGET_DIR/extensions/craig/"
  cp "$SRC_DIR/extensions/craig/craig-scheduler.mjs" "$TARGET_DIR/extensions/craig/"
  cp "$SRC_DIR/extensions/craig/craig-config.mjs" "$TARGET_DIR/extensions/craig/"

  echo -e "${BOLD}Security Guardian:${NC}"
  echo -e "${GREEN}✔${NC}  Agent:        ~/.copilot/agents/security-guardian.agent.md"
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
  echo -e "${BOLD}SDLC Guardian Extension:${NC}"
  echo -e "${GREEN}✔${NC}  Extension:    ~/.copilot/extensions/sdlc-guardian/extension.mjs"
  echo -e "${GREEN}✔${NC}  State machine: ~/.copilot/extensions/sdlc-guardian/uat-state-machine.mjs"
  echo ""
  echo -e "${BOLD}Craig Extension (scheduled tasks):${NC}"
  echo -e "${GREEN}✔${NC}  Extension:    ~/.copilot/extensions/craig/extension.mjs"
  echo -e "${GREEN}✔${NC}  Scheduler:    ~/.copilot/extensions/craig/craig-scheduler.mjs"
  echo -e "${GREEN}✔${NC}  Config loader: ~/.copilot/extensions/craig/craig-config.mjs"
  echo ""
  echo -e "${BOLD}You're set!${NC} Open Copilot CLI and:"
  echo -e "  • Global instructions are ${GREEN}already active${NC}"
  echo -e "  • Use ${CYAN}/agent${NC} to pick any Guardian (Security, Code Review, PO, …)"
  echo -e "  • Say ${CYAN}\"set up security\"${NC} to install scanning tools"
}

uninstall() {
  echo -e "${BOLD}${YELLOW}🗑️  Uninstalling Guardians...${NC}"
  echo ""

  for guardian in security-guardian code-review-guardian po-guardian dev-guardian qa-guardian platform-guardian delivery-guardian; do
    [ -d "$TARGET_DIR/skills/$guardian" ] && rm -rf "$TARGET_DIR/skills/$guardian" && echo -e "${GREEN}✔${NC}  Removed ~/.copilot/skills/$guardian/"
    [ -f "$TARGET_DIR/agents/$guardian.agent.md" ] && rm "$TARGET_DIR/agents/$guardian.agent.md" && echo -e "${GREEN}✔${NC}  Removed ~/.copilot/agents/$guardian.agent.md"
    [ -f "$TARGET_DIR/instructions/$guardian.instructions.md" ] && rm "$TARGET_DIR/instructions/$guardian.instructions.md" && echo -e "${GREEN}✔${NC}  Removed ~/.copilot/instructions/$guardian.instructions.md"
  done

  # ── Remove shared instructions not covered by the guardian loop ──
  [ -f "$TARGET_DIR/instructions/sdlc-workflow.instructions.md" ] && rm "$TARGET_DIR/instructions/sdlc-workflow.instructions.md" && echo -e "${GREEN}✔${NC}  Removed ~/.copilot/instructions/sdlc-workflow.instructions.md"

  # ── Remove extensions ──
  [ -d "$TARGET_DIR/extensions/sdlc-guardian" ] && rm -rf "$TARGET_DIR/extensions/sdlc-guardian" && echo -e "${GREEN}✔${NC}  Removed ~/.copilot/extensions/sdlc-guardian/"
  [ -d "$TARGET_DIR/extensions/craig" ] && rm -rf "$TARGET_DIR/extensions/craig" && echo -e "${GREEN}✔${NC}  Removed ~/.copilot/extensions/craig/"

  echo ""
  echo -e "${GREEN}Done.${NC} Repo-level files (.github/) are untouched — remove per-repo if needed."
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
  *)
    package
    ;;
esac
