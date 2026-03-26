/**
 * SDLC Guardian Extension — local-only workflow helper.
 *
 * User-scoped only on this machine. Keep it thin, reversible, and free of hidden state.
 */
import { approveAll } from "@github/copilot-sdk";
import { joinSession } from "@github/copilot-sdk/extension";

const editedFiles = new Set();

/**
 * Returns true when `filePath` looks like a Copilot session-state internal
 * path.  We normalise separators to "/" before matching so that relative paths,
 * Windows back-slashes, and mixed-separator paths are all caught — not only
 * the single absolute form produced by `path.sep`.
 */
function isSessionStatePath(filePath) {
  const normalised = filePath.replace(/\\/g, "/");
  return normalised.includes("/.copilot/session-state/");
}

// These context strings mirror the canonical rules in
// src/instructions/sdlc-workflow.instructions.md.  Keep them aligned when
// either file changes.
function buildStartupContext() {
  return [
    "Local-only SDLC Guardian helper is active on this machine.",
    "Use GPT-5.4 as the default/top-level orchestrator unless a task specifies otherwise.",
    "Pre-implementation gate: verify a PO ticket/spec exists before coding.",
    "Post-implementation gate: after Developer Guardian completes, run QA + Security + Code Review in parallel.",
    "Guardians keep their specified models; Code Review stays dual-model (Opus 4.6 + GPT-5.4).",
    "React to system_notifications immediately and read finished background work right away.",
    "Craig is out of scope for this extension.",
  ].join("\n");
}

function buildPostImplementationContext(fileCount) {
  return [
    `Developer Guardian completed. ${fileCount} file(s) changed in this session.`,
    "Run the post-implementation review gate now: QA + Security + Code Review in parallel.",
    "Security and QA use claude-opus-4.6. Code Review stays dual-model: Opus 4.6 + GPT-5.4.",
  ].join("\n");
}

function normalizePath(value) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function trackableFile(filePath) {
  // Track any file except Copilot session-state files.  The post-implementation
  // gate should fire for config, docs, manifests, etc. — not just source code.
  return Boolean(filePath && !isSessionStatePath(filePath));
}

function extractEditPaths(toolName, toolArgs) {
  if (toolName === "edit" || toolName === "create") {
    const filePath = normalizePath(toolArgs?.path);
    return filePath ? [filePath] : [];
  }

  if (toolName !== "apply_patch") {
    return [];
  }

  const patchText = typeof toolArgs === "string" ? toolArgs : normalizePath(toolArgs?.patch);
  if (!patchText) {
    return [];
  }

  // Match all apply_patch file verbs: Add, Update, Delete, and Rename.
  // Delete-only and rename/move patches must still count as qualifying edits
  // so the post-implementation gate is not skipped.
  return Array.from(
    new Set(
      [...patchText.matchAll(/^\*\*\* (?:Add|Update|Delete|Rename) File: (.+)$/gm)].map((match) => match[1].trim()),
    ),
  );
}

function isDeveloperGuardianTask(toolArgs, _toolResult) {
  // Prefer the structured agent_type enum — exact match, no regex needed.
  const agentType = normalizePath(toolArgs?.agent_type);
  if (agentType === "Developer Guardian") {
    return true;
  }

  // The `name` field is a caller-controlled short identifier (e.g. "dev-guardian").
  // Exact-match it as a secondary structured signal.
  const name = normalizePath(toolArgs?.name);
  if (name === "dev-guardian" || name === "developer-guardian") {
    return true;
  }

  return false;
}

const session = await joinSession({
  // approveAll is acceptable here: the extension is local-only (user-scoped
  // ~/.copilot/), performs no destructive tool actions, and only injects
  // advisory context into the session.  It never writes files or runs commands.
  onPermissionRequest: approveAll,
  hooks: {
    onSessionStart: async () => {
      await session.log("🛡️ SDLC Guardian active (local-only)", { ephemeral: true });
      return { additionalContext: buildStartupContext() };
    },

    onPostToolUse: async (input) => {
      for (const filePath of extractEditPaths(input.toolName, input.toolArgs)) {
        if (trackableFile(filePath)) {
          editedFiles.add(filePath);
        }
      }

      if (input.toolName !== "task" || !isDeveloperGuardianTask(input.toolArgs, input.toolResult)) {
        return;
      }

      if (input.toolResult?.resultType && input.toolResult.resultType !== "success") {
        return;
      }

      const fileCount = editedFiles.size;
      if (fileCount === 0) {
        return;
      }

      return { additionalContext: buildPostImplementationContext(fileCount) };
    },
  },
  tools: [],
});

session.on("session.idle", async () => {
  if (editedFiles.size > 0) {
    await session.log(`📝 ${editedFiles.size} file(s) edited this session`, { ephemeral: true });
  }
});
