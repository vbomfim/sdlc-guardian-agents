/**
 * SDLC Guardian Extension — Minimal workflow enforcement.
 *
 * Two hooks only:
 * 1. onSessionStart — inject SDLC workflow reminder
 * 2. onPostToolUse  — track file edits, trigger review pipeline after implementation
 *
 * No stale state, no false triggers, no prompt rewriting.
 */
import { approveAll } from "@github/copilot-sdk";
import { joinSession } from "@github/copilot-sdk/extension";

// Track files edited by the agent in this session
const editedFiles = new Set();
let implementationInProgress = false;

const session = await joinSession({
  onPermissionRequest: approveAll,
  hooks: {
    onSessionStart: async (input) => {
      await session.log("🛡️ SDLC Guardian active", { ephemeral: true });
      return {
        additionalContext: [
          "SDLC Guardian is active. Follow the workflow:",
          "• Pre-implementation: verify a PO ticket exists before coding",
          "• Post-implementation: after Developer Guardian completes, run QA + Security + Code Review in parallel",
          "• All Guardians use model: claude-opus-4.6",
          "• Code Review uses dual-model: Opus 4.6 + GPT 5.4",
          "• React to system_notifications IMMEDIATELY — call read_agent right away",
        ].join("\n"),
      };
    },

    onPostToolUse: async (input) => {
      // Track source code edits (not docs, not session files)
      if (input.toolName === "edit" || input.toolName === "create") {
        const filePath = String(input.toolArgs?.path || "");
        const isSourceCode = /\.(ts|js|py|rs|go|java|cpp|hpp|c|h|cs|rb|swift|kt)$/i.test(filePath);
        const isSessionFile = filePath.includes(".copilot/session-state");

        if (isSourceCode && !isSessionFile) {
          editedFiles.add(filePath);
        }
      }

      // Detect Developer Guardian completion (task tool with dev-guardian)
      if (input.toolName === "task" && input.toolResult?.resultType === "success") {
        const result = String(input.toolResult?.result || "");
        if (result.includes("Developer Guardian") || result.includes("dev-guardian")) {
          implementationInProgress = false;
          const fileCount = editedFiles.size;
          if (fileCount > 0) {
            return {
              additionalContext: [
                `Developer Guardian completed. ${fileCount} file(s) changed.`,
                "Post-implementation gate: invoke QA + Security + Code Review Guardians in parallel (background, model: claude-opus-4.6).",
                "Code Review uses dual-model: Opus 4.6 + GPT 5.4.",
              ].join("\n"),
            };
          }
        }
      }
    },
  },
  tools: [],
});

// Listen for session idle to log edit count
session.on("session.idle", () => {
  if (editedFiles.size > 0) {
    session.log(`📝 ${editedFiles.size} file(s) edited this session`, { ephemeral: true });
  }
});
