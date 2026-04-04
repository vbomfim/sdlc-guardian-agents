/**
 * Craig — Scheduled Task Extension for Copilot CLI.
 *
 * Craig is a lightweight scheduler that sends prompts to your CLI session
 * on a cron schedule. The CLI agent (with SDLC Guardians) does the work.
 * Craig just tells it when.
 *
 * Disabled by default. Enable with: "craig enable"
 * Disable with: "craig disable"
 *
 * Configuration: craig.config.yaml in the repo root or ~/.copilot/craig.config.yaml
 *
 * Craig does NOT:
 *  - Invoke agents directly (the CLI agent handles that)
 *  - Call GitHub APIs (the CLI's GitHub MCP server handles that)
 *  - Manage its own state file (uses CLI session store via SQL, tagged craig-memory)
 *  - Run as a separate process (it's an extension inside your session)
 */
import { approveAll } from "@github/copilot-sdk";
import { joinSession } from "@github/copilot-sdk/extension";
import { loadConfig, findConfigPath, initConfig, saveConfig, DEFAULT_CONFIG_PATH } from "./craig-config.mjs";
import { CraigScheduler } from "./craig-scheduler.mjs";

let scheduler = null;
let enabled = false;
let config = null;

const session = await joinSession({
  onPermissionRequest: approveAll,
  hooks: {
    onSessionStart: async () => {
      const configPath = findConfigPath();
      if (!configPath) {
        return {
          additionalContext:
            "Craig (scheduled tasks) is available but no craig.config.yaml found. " +
            "Say 'craig enable' to activate with defaults, or create a config file.",
        };
      }

      config = loadConfig(configPath);

      return {
        additionalContext:
          `Craig (scheduled tasks) loaded config from ${configPath}. ` +
          `${Object.keys(config.schedule).length} task(s) configured. ` +
          `Craig is disabled. ` +
          `Say 'craig enable' to start scheduled tasks, 'craig disable' to stop.`,
      };
    },

    onPostToolUse: async (input) => {
      // Craig doesn't need to track tool usage — that's the SDLC Guardian's job.
      return undefined;
    },
  },

  tools: [
    {
      name: "craig_enable",
      description: "Enable Craig's scheduled tasks for this session",
      parameters: { type: "object", properties: {} },
      handler: async () => {
        if (!config) {
          config = initConfig();
          await session.log(`🤖 Craig: created config at ${config.path}`, { ephemeral: true });
        }
        if (enabled) {
          return { content: "Craig is already enabled in this session." };
        }
        enabled = true;
        restartScheduler();
        const taskList = Object.entries(config.schedule)
          .map(([name, cron]) => `  ${name}: ${cron}`)
          .join("\n") || "  (none — use craig_schedule_add to add tasks)";
        await session.log(`🤖 Craig enabled. ${scheduler?.taskCount ?? 0} task(s) scheduled.`, { ephemeral: true });
        return { content: `Craig enabled for this session. Config: ${config.path}\nScheduled tasks:\n${taskList}` };
      },
    },
    {
      name: "craig_disable",
      description: "Disable Craig's scheduled tasks for this session",
      parameters: { type: "object", properties: {} },
      handler: async () => {
        if (!enabled) {
          return { content: "Craig is not enabled in this session." };
        }
        if (scheduler) {
          scheduler.stop();
          scheduler = null;
        }
        enabled = false;
        await session.log("🤖 Craig disabled. Scheduled tasks stopped.", { ephemeral: true });
        return { content: "Craig disabled. All scheduled tasks stopped." };
      },
    },
    {
      name: "craig_status",
      description: "Show Craig's current state: enabled/disabled, scheduled tasks, last runs",
      parameters: { type: "object", properties: {} },
      handler: async () => {
        if (!config) {
          return { content: "Craig: no config loaded." };
        }
        const tasks = Object.entries(config.schedule)
          .map(([name, cron]) => {
            const lastRun = scheduler?.getLastRun(name);
            const nextRun = scheduler?.getNextRun(name);
            return `  ${name}: ${cron} (last: ${lastRun ?? "never"}, next: ${nextRun ?? "n/a"})`;
          })
          .join("\n");
        return {
          content: `Craig: ${enabled ? "enabled" : "disabled"}\nTasks:\n${tasks}`,
        };
      },
    },
    {
      name: "craig_run",
      description: "Run a Craig task immediately (by name)",
      parameters: {
        type: "object",
        properties: {
          task: { type: "string", description: "Task name from craig.config.yaml" },
        },
        required: ["task"],
      },
      handler: async ({ task }) => {
        if (!config) {
          return { content: "Craig not initialized. Say 'craig enable' first." };
        }
        if (!config.schedule[task] && !config.prompts[task]) {
          const available = Object.keys({ ...config.schedule, ...config.prompts }).join(", ");
          return { content: `Unknown task '${task}'. Available: ${available || "(none)"}` };
        }
        const prompt = buildPrompt(config, task);
        await session.log(`🤖 Craig: running '${task}' on demand`, { ephemeral: true });
        await session.send({ prompt });
        return { content: `Task '${task}' triggered.` };
      },
    },
    {
      name: "craig_schedule_add",
      description: "Add a new scheduled task. Provide task name, cron expression, and optional custom prompt.",
      parameters: {
        type: "object",
        properties: {
          task: { type: "string", description: "Task name (e.g., security_scan, my_weekly_check)" },
          cron: { type: "string", description: "Cron expression (e.g., '0 8 * * 1' for Monday 8 AM) or 'on_push'" },
          prompt: { type: "string", description: "Optional custom prompt. If omitted, Craig uses a default prompt for known task types." },
        },
        required: ["task", "cron"],
      },
      handler: async ({ task, cron, prompt }) => {
        if (!config) {
          config = initConfig();
        }
        config.schedule[task] = cron;
        if (prompt) {
          config.prompts[task] = prompt;
        }
        saveConfig(config.path, config);
        if (enabled) restartScheduler();
        return {
          content: `Scheduled '${task}' with cron '${cron}'.${prompt ? " Custom prompt saved." : " Using default prompt."}\nConfig saved to ${config.path}`,
        };
      },
    },
    {
      name: "craig_schedule_remove",
      description: "Remove a scheduled task by name.",
      parameters: {
        type: "object",
        properties: {
          task: { type: "string", description: "Task name to remove" },
        },
        required: ["task"],
      },
      handler: async ({ task }) => {
        if (!config) {
          return { content: "Craig not initialized. Nothing to remove." };
        }
        if (!config.schedule[task]) {
          return { content: `Task '${task}' not found in schedule.` };
        }
        delete config.schedule[task];
        delete config.prompts[task];
        saveConfig(config.path, config);
        if (enabled) restartScheduler();
        return { content: `Removed '${task}' from schedule. Config saved.` };
      },
    },
    {
      name: "craig_schedule_update",
      description: "Update the cron expression or prompt for an existing task.",
      parameters: {
        type: "object",
        properties: {
          task: { type: "string", description: "Task name to update" },
          cron: { type: "string", description: "New cron expression (optional — keep current if empty)" },
          prompt: { type: "string", description: "New custom prompt (optional — keep current if empty)" },
        },
        required: ["task"],
      },
      handler: async ({ task, cron, prompt }) => {
        if (!config || !config.schedule[task]) {
          return { content: `Task '${task}' not found. Use craig_schedule_add to create it.` };
        }
        if (cron) config.schedule[task] = cron;
        if (prompt) config.prompts[task] = prompt;
        saveConfig(config.path, config);
        if (enabled) restartScheduler();
        return { content: `Updated '${task}'. Config saved to ${config.path}` };
      },
    },
  ],
});

/**
 * Build the prompt for a scheduled task.
 * Wraps the task description in a structured format so the agent
 * queues it as a todo and works on it when ready.
 */
function buildPrompt(cfg, taskName) {
  const taskPrompt = cfg.prompts?.[taskName] || getDefaultPrompt(cfg, taskName);
  const now = new Date();
  const time = now.toLocaleString("en-US", {
    month: "long", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit", hour12: true,
  });

  return [
    `[Craig Scheduled Task]`,
    `Task: ${taskName}`,
    `Scheduled: ${time}`,
    ``,
    `Insert this into your todos table as a pending task and work on it when ready.`,
    `If you're busy with something else, finish that first — this is a background task.`,
    ``,
    `Prompt: ${taskPrompt}`,
    ``,
    `When done, tag results as craig-memory in the session store.`,
  ].join("\n");
}

function getDefaultPrompt(cfg, taskName) {
  const repo = cfg.repo || ".";
  const defaults = {
    security_scan: `Run a security scan on ${repo}. Create GitHub issues for any CRITICAL or HIGH findings.`,
    coverage_scan: `Analyze test coverage gaps in ${repo}. Report untested code paths and missing edge cases.`,
    tech_debt_audit: `Audit ${repo} for tech debt: TODO comments, deprecated dependencies, code complexity hotspots.`,
    dependency_check: `Check ${repo} for outdated or vulnerable dependencies. Report findings with upgrade recommendations.`,
    merge_review: `Review the latest merge to main in ${repo}. Check for security issues, code quality, and test coverage.`,
    pr_monitor: `Check open PRs in ${repo}. For any PR older than 3 days without review, flag it.`,
    platform_audit: `Audit Kubernetes manifests in ${repo} for security and best practices.`,
    delivery_audit: `Review deployment configuration in ${repo}: CI/CD pipeline, environments, rollback strategy.`,
  };

  return defaults[taskName] || `Run the '${taskName}' task on ${repo}.`;
}

/** Stop the current scheduler (if running) and start a new one from config. */
function restartScheduler() {
  if (scheduler) scheduler.stop();
  scheduler = new CraigScheduler(
    config.schedule,
    async (taskName, prompt) => {
      const fullPrompt = buildPrompt(config, taskName);
      await session.log(`🤖 Craig: running scheduled task '${taskName}'`, { ephemeral: true });
      await session.send({ prompt: fullPrompt });
    },
    (taskName) => {
      // One-shot task completed — remove from config and save
      delete config.schedule[taskName];
      delete config.prompts[taskName];
      saveConfig(config.path, config);
      session.log(`🤖 Craig: one-shot task '${taskName}' completed and removed from schedule.`, { ephemeral: true });
    },
  );
  scheduler.start();
}

// restartScheduler/auto-enable is handled inside onSessionStart
