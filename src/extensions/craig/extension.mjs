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
import { loadConfig, findConfigPath } from "./craig-config.mjs";
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
          `Craig is ${config.enabled ? "enabled" : "disabled"}. ` +
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
      parameters: {},
      handler: async () => {
        if (!config) {
          return { content: "No craig.config.yaml found. Create one first." };
        }
        if (enabled) {
          return { content: "Craig is already enabled." };
        }
        enabled = true;
        scheduler = new CraigScheduler(config.schedule, async (taskName, prompt) => {
          await session.log(`🤖 Craig: running scheduled task '${taskName}'`, { ephemeral: true });
          await session.send({ prompt });
        });
        scheduler.start();
        const taskList = Object.entries(config.schedule)
          .map(([name, cron]) => `  ${name}: ${cron}`)
          .join("\n");
        await session.log(`🤖 Craig enabled. ${scheduler.taskCount} task(s) scheduled.`, { ephemeral: true });
        return { content: `Craig enabled. Scheduled tasks:\n${taskList}` };
      },
    },
    {
      name: "craig_disable",
      description: "Disable Craig's scheduled tasks for this session",
      parameters: {},
      handler: async () => {
        if (!enabled) {
          return { content: "Craig is not enabled." };
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
      parameters: {},
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
        task: { type: "string", description: "Task name from craig.config.yaml" },
      },
      handler: async ({ task }) => {
        if (!config) {
          return { content: "No craig.config.yaml found." };
        }
        if (!config.schedule[task] && !config.prompts[task]) {
          const available = Object.keys({ ...config.schedule, ...config.prompts }).join(", ");
          return { content: `Unknown task '${task}'. Available: ${available}` };
        }
        const prompt = buildPrompt(config, task);
        await session.log(`🤖 Craig: running '${task}' on demand`, { ephemeral: true });
        await session.send({ prompt });
        return { content: `Task '${task}' triggered.` };
      },
    },
  ],
});

/**
 * Build the prompt for a scheduled task.
 * Uses the prompt template from config, or a sensible default.
 */
function buildPrompt(cfg, taskName) {
  // User-defined prompt template takes priority
  if (cfg.prompts?.[taskName]) {
    return cfg.prompts[taskName];
  }

  // Default prompts for well-known task types
  const repo = cfg.repo || ".";
  const defaults = {
    security_scan: `Run a security scan on ${repo}. Create GitHub issues for any CRITICAL or HIGH findings. Tag results as craig-memory in the session store.`,
    coverage_scan: `Analyze test coverage gaps in ${repo}. Report untested code paths and missing edge cases. Tag results as craig-memory.`,
    tech_debt_audit: `Audit ${repo} for tech debt: TODO comments, deprecated dependencies, code complexity hotspots. Tag results as craig-memory.`,
    dependency_check: `Check ${repo} for outdated or vulnerable dependencies. Report findings with upgrade recommendations. Tag results as craig-memory.`,
    merge_review: `Review the latest merge to main in ${repo}. Check for security issues, code quality, and test coverage. Tag results as craig-memory.`,
    pr_monitor: `Check open PRs in ${repo}. For any PR older than 3 days without review, flag it. Tag results as craig-memory.`,
    platform_audit: `Audit Kubernetes manifests in ${repo} for security and best practices. Tag results as craig-memory.`,
    delivery_audit: `Review deployment configuration in ${repo}: CI/CD pipeline, environments, rollback strategy. Tag results as craig-memory.`,
  };

  return defaults[taskName] || `Run the '${taskName}' task on ${repo}. Tag results as craig-memory.`;
}

// Auto-enable if config says so
if (config?.enabled) {
  scheduler = new CraigScheduler(config.schedule, async (taskName, prompt) => {
    await session.log(`🤖 Craig: running scheduled task '${taskName}'`, { ephemeral: true });
    await session.send({ prompt });
  });
  scheduler.start();
  enabled = true;
}
