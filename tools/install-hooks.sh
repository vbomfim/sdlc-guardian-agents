#!/usr/bin/env bash
# Security Guardian — Hook Installer
# Installs git hooks for security enforcement.
#
# Usage: ./tools/install-hooks.sh

set -euo pipefail

GREEN='\033[0;32m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null)
if [ -z "$REPO_ROOT" ]; then
  echo "Error: Not inside a git repository."
  exit 1
fi

HOOKS_SRC="$REPO_ROOT/tools/hooks"
HOOKS_DST="$REPO_ROOT/.git/hooks"

echo -e "${BOLD}${CYAN}🛡️  Security Guardian — Installing Git Hooks${NC}"
echo ""

# Install pre-push hook
if [ -f "$HOOKS_SRC/pre-push" ]; then
  cp "$HOOKS_SRC/pre-push" "$HOOKS_DST/pre-push"
  chmod +x "$HOOKS_DST/pre-push"
  echo -e "${GREEN}✔${NC}  pre-push hook installed"
  echo "   → Warns on feature branch push if scan is stale"
  echo "   → Blocks push to main/master if scan not run"
fi

echo ""

# Add .security-scan-timestamp to .gitignore if not already there
GITIGNORE="$REPO_ROOT/.gitignore"
if [ -f "$GITIGNORE" ]; then
  if ! grep -q ".security-scan-timestamp" "$GITIGNORE"; then
    echo ".security-scan-timestamp" >> "$GITIGNORE"
    echo -e "${GREEN}✔${NC}  Added .security-scan-timestamp to .gitignore"
  fi
else
  echo ".security-scan-timestamp" > "$GITIGNORE"
  echo -e "${GREEN}✔${NC}  Created .gitignore with .security-scan-timestamp"
fi

echo ""
echo -e "${BOLD}Done!${NC} Hooks are active. Run ${CYAN}./tools/setup.sh --scan${NC} to create your first scan timestamp."
echo ""
