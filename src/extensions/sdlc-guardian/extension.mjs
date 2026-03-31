/**
 * SDLC Guardian Extension — local-only workflow helper.
 *
 * User-scoped only on this machine.  Keep it thin, reversible, and free
 * of hidden state.
 *
 * All pure logic lives in ./uat-state-machine.mjs so it can be tested
 * with `node --test` without bootstrapping a live Copilot SDK session.
 * This file is the thin SDK-wiring shell: it creates one
 * `UatStateMachine` instance and delegates from the hooks.
 */
import { approveAll } from "@github/copilot-sdk";
import { joinSession } from "@github/copilot-sdk/extension";
import { UatStateMachine, buildStartupContext } from "./uat-state-machine.mjs";

const sm = new UatStateMachine();

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
      return sm.handlePostToolUse(input);
    },
  },
  tools: [],
});

session.on("session.idle", async () => {
  if (sm.fileCount > 0) {
    await session.log(`📝 ${sm.fileCount} file(s) edited this session`, { ephemeral: true });
  }
});
