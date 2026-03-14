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

      // Auto-resume: remind the agent to check for completed background tasks
      await session.log(
        "🛡️ Resuming — check /tasks for completed background agents and continue the SDLC pipeline.",
        { level: "info", ephemeral: true }
      );
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
        // Only track source code files — not configs, docs, extensions
        const NON_CODE = /\.(md|yaml|yml|json|svg|txt|mjs|css|html)$|\.copilot\/|\.gitignore/i;
        if (!NON_CODE.test(filePath)) {
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
      }

      // After a git commit, enforce post-implementation reviews
      if (input.toolName === "bash") {
        const cmd = String(input.toolArgs?.command || "");
        if (/git\s+commit/.test(cmd) && editedFiles.length > 0) {
          const secWarning = securitySensitiveEdits
            ? " (includes security-sensitive files!)"
            : "";

          await session.log(
            `🛡️ Committed ${editedFiles.length} source files${secWarning}. Enforcing post-implementation gate.`,
            { level: "info" }
          );

          // ENFORCE: trigger review pipeline
          setTimeout(() => session.send({
            prompt: `Post-implementation gate triggered. ${editedFiles.length} source files committed${secWarning}. Invoke QA Guardian + Security Guardian + Code Review Guardian in parallel (background, model: claude-opus-4.6). Code Review uses dual-model: Opus 4.6 + GPT 5.4.`
          }), 0);

          // Reset tracking
          editedFiles = [];
          securitySensitiveEdits = false;
        }
      }

      // After a background agent COMPLETES (read_agent only, not task launch), enforce next step
      if (input.toolName === "read_agent") {
        const result = String(input.toolResult || "");
        const description = String(input.toolArgs?.description || "");

        if (/dev-guardian/i.test(description) || /Developer Guardian/i.test(result)) {
          await session.log(
            "🛡️ Developer Guardian completed. Enforcing post-implementation gate.",
            { level: "info" }
          );
          setTimeout(() => session.send({
            prompt: "Developer Guardian finished implementation. ENFORCE post-implementation gate: invoke QA Guardian + Security Guardian + Code Review Guardian (dual-model: Opus 4.6 + GPT 5.4) in parallel, all background mode, model: claude-opus-4.6. Read the Developer's handoff report first, then launch reviews on the changes."
          }), 0);
        } else if (/security-guardian/i.test(description) || /Security Guardian/i.test(result)) {
          await session.log(
            "🛡️ Security Guardian completed. Read findings — fix critical/high before proceeding.",
            { level: "info" }
          );
          setTimeout(() => session.send({
            prompt: "Security Guardian review completed. Read the findings with read_agent. If CRITICAL or HIGH findings exist, invoke Developer Guardian to fix them (model: claude-opus-4.6). If no critical/high, proceed to merge gate."
          }), 0);
        } else if (/code-review/i.test(description) || /Code Review Guardian/i.test(result)) {
          await session.log(
            "🛡️ Code Review Guardian completed. Read findings — fix critical/high before proceeding.",
            { level: "info" }
          );
          setTimeout(() => session.send({
            prompt: "Code Review Guardian completed. Read the findings with read_agent. If CRITICAL or HIGH findings exist, invoke Developer Guardian to fix them (model: claude-opus-4.6). If no critical/high, proceed to merge gate."
          }), 0);
        } else if (/qa-guardian/i.test(description) || /QA Guardian/i.test(result)) {
          await session.log(
            "🛡️ QA Guardian completed. Read test coverage report.",
            { level: "info" }
          );
          setTimeout(() => session.send({
            prompt: "QA Guardian completed. Read the test report with read_agent. Address any coverage gaps flagged as HIGH."
          }), 0);
        } else if (/po-guardian/i.test(description) || /PO Guardian/i.test(result)) {
          await session.log(
            "🛡️ PO Guardian completed. Create the GitHub issue from the ticket.",
            { level: "info" }
          );
          setTimeout(() => session.send({
            prompt: "PO Guardian finished the specification. Read the ticket with read_agent. Create the GitHub issue from it."
          }), 0);
        }
      }
    },

    // ── Session End: summary ───────────────────────────────────────────────
    onSessionEnd: async () => {
      // Silent — no message needed on session end
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
