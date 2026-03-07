#!/usr/bin/env bash
# Security Guardian — Package & Deploy
#
# Usage:
#   ./package.sh              # Build zip only (dist/security-guardian.zip)
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
  echo -e "${BOLD}${CYAN}📦 Packaging Security Guardian...${NC}"
  mkdir -p "$DIST_DIR"

  cd "$SRC_DIR"
  zip -r "$DIST_DIR/security-guardian.zip" . -x ".*"
  cd "$SCRIPT_DIR"

  local size
  size=$(ls -lh "$DIST_DIR/security-guardian.zip" | awk '{print $5}')
  echo ""
  echo -e "${GREEN}✔${NC}  Package created: ${BOLD}dist/security-guardian.zip${NC} ($size)"
  echo ""
  echo -e "  To distribute: share ${CYAN}dist/security-guardian.zip${NC}"
  echo -e "  To install:    ${CYAN}unzip dist/security-guardian.zip -d ~/.copilot/${NC}"
  echo -e "  Or run:        ${CYAN}./package.sh --install${NC}"
}

install() {
  echo -e "${BOLD}${CYAN}🛡️  Installing Security Guardian to ~/.copilot/...${NC}"
  echo ""

  # Ensure target exists
  mkdir -p "$TARGET_DIR/skills/security-guardian"

  # Copy everything from src/ to ~/.copilot/
  cp -r "$SRC_DIR"/* "$TARGET_DIR/"

  # Ensure scripts are executable
  chmod +x "$TARGET_DIR/skills/security-guardian/setup.sh"
  chmod +x "$TARGET_DIR/skills/security-guardian/install-hooks.sh"
  chmod +x "$TARGET_DIR/skills/security-guardian/hooks/pre-push"

  echo -e "${GREEN}✔${NC}  Global baseline installed:  ~/.copilot/copilot-instructions.md"
  echo -e "${GREEN}✔${NC}  Skill installed:            ~/.copilot/skills/security-guardian/"
  echo -e "${GREEN}✔${NC}  Repo template available:    ~/.copilot/skills/security-guardian/template/"
  echo ""
  echo -e "${BOLD}You're set!${NC} Open Copilot CLI and:"
  echo -e "  • Global security rules are ${GREEN}already active${NC}"
  echo -e "  • Say ${CYAN}\"set up security\"${NC} to install tools"
  echo -e "  • Say ${CYAN}\"adopt security guardian\"${NC} to add to a repo"
  echo -e "  • Use ${CYAN}/agent${NC} → Security Guardian for full reviews"
}

uninstall() {
  echo -e "${BOLD}${YELLOW}🗑️  Uninstalling Security Guardian...${NC}"
  echo ""

  if [ -d "$TARGET_DIR/skills/security-guardian" ]; then
    rm -rf "$TARGET_DIR/skills/security-guardian"
    echo -e "${GREEN}✔${NC}  Removed ~/.copilot/skills/security-guardian/"
  fi

  if [ -f "$TARGET_DIR/copilot-instructions.md" ]; then
    echo -e "${YELLOW}⚠${NC}  Kept ~/.copilot/copilot-instructions.md (may contain your customizations)"
    echo "   Delete manually if you want a clean removal."
  fi

  echo ""
  echo -e "${GREEN}Done.${NC} Repo-level files (.github/agents/, etc.) are untouched — remove per-repo if needed."
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
