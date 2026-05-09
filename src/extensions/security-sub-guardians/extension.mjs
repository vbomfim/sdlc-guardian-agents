/**
 * Extension: security-sub-guardians
 *
 * Triggers session.rpc.agent.reload() at startup so sub-Guardian .agent.md
 * files added to ~/.copilot/agents/ AFTER the original install (notably the
 * Security Guardian sub-* files) become invokable via the task tool.
 *
 * Without this extension, the agent registry is scanned only once at CLI
 * startup. Users who install the Security Guardian split via package.sh
 * after a CLI session has already started would not see Sub-AppSec,
 * Sub-SupplyChain, Sub-Secrets, Sub-ThreatModel, or Sub-IaC available
 * until they restart the CLI. This extension does the reload automatically
 * on every CLI startup.
 *
 * Also exposes a tool `reload_security_subagents` for manual re-registration
 * after adding new sub-* agent files mid-session.
 *
 * NOTE: even with this extension running, the orchestrator's task tool's
 * agent_type enum is built at orchestrator launch and is NOT refreshed by
 * agent.reload(). For the sub-Guardians to be invokable via task() in a
 * given session, they MUST already be in the registry when that orchestrator
 * launches. In practice this means: install the extension once, then start
 * a fresh `copilot` shell. Subsequent sessions will find the sub-Guardians
 * pre-registered.
 *
 * See specs/security-guardian-split/ab-procedure.md §"Sub-Guardian discovery"
 * for the full background.
 */
import { joinSession } from "@github/copilot-sdk/extension";

const session = await joinSession({
    tools: [
        {
            name: "reload_security_subagents",
            description: "Reload agent registry from disk.",
            parameters: { type: "object", properties: {} },
            handler: async () => {
                try {
                    const result = await session.rpc.agent.reload();
                    const names = (result?.agents ?? []).map((a) => a.name);
                    return JSON.stringify({ reloaded: true, count: names.length, agents: names });
                } catch (err) {
                    return JSON.stringify({ reloaded: false, error: err.message });
                }
            },
        },
    ],
});

// Best-effort startup reload — silent on failure (manual tool above is the fallback).
try {
    await session.rpc.agent.reload();
} catch {}
