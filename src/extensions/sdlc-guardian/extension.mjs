/**
 * SDLC Guardian Extension for GitHub Copilot CLI
 *
 * Hooks into the Copilot CLI lifecycle to enforce the SDLC Guardian pipeline:
 * - onSessionStart: Verify tool availability, log Guardian status
 * - onUserPromptSubmitted: Detect security/review/implement intent, inject workflow context
 * - onPreToolUse: Block dangerous commands, enforce scan-before-push
 * - onPostToolUse: Auto-trigger reviews after code edits
 * - onSessionEnd: Generate session summary
 */
import { approveAll } from "@github/copilot-sdk";
import { joinSession } from "@github/copilot-sdk/extension";
import { execFile } from "node:child_process";

// ─── Constants ──────────────────────────────────────────────────────────────

const GUARDIAN_AGENTS = [
  "security-guardian",
  "code-review-guardian",
  "po-guardian",
  "dev-guardian",
  "qa-guardian",
  "platform-guardian",
  "delivery-guardian",
];

const SECURITY_TRIGGERS = /\b(security|vulnerabilit|owasp|scan|audit|penetration|threat)\b/i;
const CODE_REVIEW_TRIGGERS = /\b(review|code quality|lint|check code|review my)\b/i;
const IMPLEMENT_TRIGGERS = /\b(implement|build this|code this|refactor|scaffold|create the)\b/i;
const TEST_TRIGGERS = /\b(write tests|test this|coverage|e2e|integration test)\b/i;
const PO_TRIGGERS = /\b(create.*(ticket|issue|spec)|I want to build|feature request|audit.*project)\b/i;
const PLATFORM_TRIGGERS = /\b(audit cluster|k8s|kubernetes|cis benchmark|network polic)\b/i;
const DEPLOY_TRIGGERS = /\b(deploy|pipeline|monitoring|slo|sli|bcdr|post.mortem|canary|blue.green)\b/i;

const DANGEROUS_COMMANDS = /\b(rm\s+-rf|rmdir|del\s+\/|format\s+|mkfs|dd\s+if=)\b/i;

const SECURITY_SENSITIVE_PATHS = /\b(auth|login|token|password|secret|crypt|session|jwt|oauth|key)\b/i;

// ─── Track session state ────────────────────────────────────────────────────

let editedFiles = [];
let securitySensitiveEdits = false;
let sessionStartTime = Date.now();

// ─── Join Session ───────────────────────────────────────────────────────────

const session = await joinSession({
  onPermissionRequest: approveAll,

  hooks: {
    // ── Session Start: verify environment ──────────────────────────────────
    onSessionStart: async () => {
      sessionStartTime = Date.now();
      editedFiles = [];
      securitySensitiveEdits = false;

      await session.log("🛡️ SDLC Guardian Extension active", { level: "info" });

      // Check if Guardian agents are installed
      const agentsDir = `${process.env.HOME}/.copilot/agents`;
      const missing = [];
      for (const agent of GUARDIAN_AGENTS) {
        try {
          const { statSync } = await import("node:fs");
          statSync(`${agentsDir}/${agent}.agent.md`);
        } catch {
          missing.push(agent);
        }
      }

      if (missing.length > 0) {
        await session.log(
          `⚠️ Missing Guardian agents: ${missing.join(", ")}. Install: unzip sdlc-guardian-agents.zip -d ~/.copilot/`,
          { level: "warning" }
        );
      }
    },

    // ── User Prompt: detect intent, inject workflow context ────────────────
    onUserPromptSubmitted: async (input) => {
      const prompt = input.prompt;

      // Pre-implementation gate: check for ticket reference
      if (IMPLEMENT_TRIGGERS.test(prompt) && !/#\d+/.test(prompt)) {
        return {
          additionalContext:
            "[SDLC WORKFLOW] The user is asking to implement something without referencing a ticket (#N). " +
            "Before implementing, check if a PO Guardian ticket exists for this work. " +
            "If not, suggest creating one first: 'There's no ticket for this yet. Let me invoke the PO Guardian to spec it out first.'",
        };
      }

      // Route security requests
      if (SECURITY_TRIGGERS.test(prompt)) {
        return {
          additionalContext:
            "[SDLC WORKFLOW] This is a security request. Delegate to the Security Guardian agent " +
            "via the task tool with mode: background. Do not run security tools directly.",
        };
      }

      // Route code review requests
      if (CODE_REVIEW_TRIGGERS.test(prompt)) {
        return {
          additionalContext:
            "[SDLC WORKFLOW] This is a code review request. Launch TWO Code Review Guardian instances " +
            "in parallel: one with model claude-opus-4.6, one with model gpt-5.4. Merge results.",
        };
      }

      // Route test requests
      if (TEST_TRIGGERS.test(prompt)) {
        return {
          additionalContext:
            "[SDLC WORKFLOW] This is a testing request. Delegate to the QA Guardian agent. " +
            "Unit tests are Developer scope — QA handles integration, E2E, contract, performance.",
        };
      }

      // Route PO requests
      if (PO_TRIGGERS.test(prompt)) {
        return {
          additionalContext:
            "[SDLC WORKFLOW] This is a specification/ticket request. Delegate to the PO Guardian. " +
            "Do NOT use background mode — feature specification is interactive.",
        };
      }

      // Route platform requests
      if (PLATFORM_TRIGGERS.test(prompt)) {
        return {
          additionalContext:
            "[SDLC WORKFLOW] This is a platform/infrastructure request. Delegate to the Platform Guardian " +
            "via the task tool with mode: background.",
        };
      }

      // Route deployment requests
      if (DEPLOY_TRIGGERS.test(prompt)) {
        return {
          additionalContext:
            "[SDLC WORKFLOW] This is a deployment/operations request. Delegate to the Delivery Guardian " +
            "via the task tool with mode: background.",
        };
      }
    },

    // ── Pre-Tool Use: enforce safety rules ─────────────────────────────────
    onPreToolUse: async (input) => {
      // Block dangerous shell commands
      if (input.toolName === "bash") {
        const cmd = String(input.toolArgs?.command || "");

        if (DANGEROUS_COMMANDS.test(cmd)) {
          return {
            permissionDecision: "deny",
            permissionDecisionReason:
              "🛡️ SDLC Guardian: Destructive command blocked. Use git to manage file deletions.",
          };
        }

        // Warn on git push without scan
        if (/git\s+push/.test(cmd)) {
          await session.log(
            "🛡️ Pushing code — ensure security scan has been run since last commit.",
            { level: "info", ephemeral: true }
          );
        }
      }
    },

    // ── Post-Tool Use: track edits, auto-trigger reviews ───────────────────
    onPostToolUse: async (input) => {
      if (input.toolName === "edit" || input.toolName === "create") {
        const filePath = String(input.toolArgs?.path || "");
        editedFiles.push(filePath);

        // Detect security-sensitive file edits
        if (SECURITY_SENSITIVE_PATHS.test(filePath)) {
          securitySensitiveEdits = true;
          await session.log(
            `🛡️ Security-sensitive file edited: ${filePath.split("/").pop()} — Security Guardian review recommended.`,
            { level: "warning", ephemeral: true }
          );
        }
      }

      // After a git commit, suggest post-implementation reviews
      if (input.toolName === "bash") {
        const cmd = String(input.toolArgs?.command || "");
        if (/git\s+commit/.test(cmd) && editedFiles.length > 0) {
          const fileCount = editedFiles.length;
          const secWarning = securitySensitiveEdits
            ? " (includes security-sensitive files!)"
            : "";

          await session.log(
            `🛡️ Committed ${fileCount} files${secWarning}. Post-implementation gate: ` +
            `consider running QA + Security + Code Review Guardians before PR.`,
            { level: "info" }
          );

          // Reset tracking
          editedFiles = [];
          securitySensitiveEdits = false;
        }
      }
    },

    // ── Session End: summary ───────────────────────────────────────────────
    onSessionEnd: async () => {
      const duration = Math.round((Date.now() - sessionStartTime) / 1000 / 60);
      await session.log(
        `🛡️ Session ended (${duration} min). SDLC Guardian Extension shutting down.`,
        { level: "info" }
      );
    },
  },

  // ── Custom Tools ─────────────────────────────────────────────────────────
  tools: [
    {
      name: "guardian_status",
      description:
        "Shows which SDLC Guardian agents are installed and available.",
      parameters: {
        type: "object",
        properties: {},
      },
      handler: async () => {
        const agentsDir = `${process.env.HOME}/.copilot/agents`;
        const results = [];

        for (const agent of GUARDIAN_AGENTS) {
          try {
            const { statSync } = await import("node:fs");
            statSync(`${agentsDir}/${agent}.agent.md`);
            results.push(`✅ ${agent}`);
          } catch {
            results.push(`❌ ${agent} — NOT INSTALLED`);
          }
        }

        return `SDLC Guardian Agents:\n${results.join("\n")}`;
      },
    },
  ],
});
