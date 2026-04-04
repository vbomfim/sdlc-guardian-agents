/**
 * UAT State Machine — automated test suite.
 *
 * Exercises the pure state-machine logic extracted from the SDLC Guardian
 * extension.  Uses Node's built-in test runner (`node --test`) — zero
 * external dependencies.
 *
 * Run:  node --test src/extensions/sdlc-guardian/uat-state-machine.test.mjs
 */
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";

import {
  UatStateMachine,
  MAX_UAT_PAIR_FIX_ITERATIONS,
  REQUIRED_REVIEW_GUARDIANS,
  // helpers
  isSessionStatePath,
  normalizePath,
  trackableFile,
  extractEditPaths,
  isDeveloperGuardianTask,
  isReviewGuardianTask,
  getReviewGuardianType,
  isPOGuardianTask,
  getGuardianType,
  // context builders
  buildStartupContext,
  buildPostImplementationContext,
  buildPairFixContinuationContext,
  buildPoGateContext,
  buildDevWithoutPoWarning,
  buildGuardianCompletionContext,
} from "./uat-state-machine.mjs";

// ── Test-event factories ──────────────────────────────────────────────────

/** Simulate a file edit via the `edit` tool. */
function editEvent(path) {
  return { toolName: "edit", toolArgs: { path } };
}

/** Simulate a file create via the `create` tool. */
function createEvent(path) {
  return { toolName: "create", toolArgs: { path } };
}

/** Simulate an apply_patch with one or more files. */
function patchEvent(files) {
  const patch = files
    .map((f) => `*** Update File: ${f}\n--- old\n+++ new\n@@ -1 +1 @@\n-a\n+b`)
    .join("\n");
  return { toolName: "apply_patch", toolArgs: { patch } };
}

/** Simulate a successful Developer Guardian task completion. */
function devGuardianSuccess() {
  return {
    toolName: "task",
    toolArgs: { agent_type: "Developer Guardian" },
    toolResult: { resultType: "success" },
  };
}

/** Simulate a failed Developer Guardian task completion. */
function devGuardianFailure() {
  return {
    toolName: "task",
    toolArgs: { agent_type: "Developer Guardian" },
    toolResult: { resultType: "failure" },
  };
}

/** Simulate a successful review Guardian task completion. */
function reviewGuardianSuccess(type = "QA Guardian") {
  return {
    toolName: "task",
    toolArgs: { agent_type: type },
    toolResult: { resultType: "success" },
  };
}

/** Simulate a failed review Guardian task completion. */
function reviewGuardianFailure(type = "QA Guardian") {
  return {
    toolName: "task",
    toolArgs: { agent_type: type },
    toolResult: { resultType: "failure" },
  };
}

/** Simulate a cancelled review Guardian task completion. */
function reviewGuardianCancelled(type = "Security Guardian") {
  return {
    toolName: "task",
    toolArgs: { agent_type: type },
    toolResult: { resultType: "cancelled" },
  };
}

/** Review Guardian with no resultType (legacy / missing field). */
function reviewGuardianNoResult(type = "Code Review Guardian") {
  return {
    toolName: "task",
    toolArgs: { agent_type: type },
  };
}

/** Dev Guardian with no resultType (legacy / missing field). */
function devGuardianNoResult() {
  return {
    toolName: "task",
    toolArgs: { agent_type: "Developer Guardian" },
  };
}

// ── Helper function tests ─────────────────────────────────────────────────

describe("isSessionStatePath", () => {
  it("detects absolute session-state paths", () => {
    assert.ok(isSessionStatePath("/home/user/.copilot/session-state/foo.json"));
  });

  it("detects Windows-style backslash paths", () => {
    assert.ok(isSessionStatePath("C:\\Users\\me\\.copilot\\session-state\\bar.json"));
  });

  it("rejects normal source files", () => {
    assert.ok(!isSessionStatePath("src/index.ts"));
  });

  it("rejects paths that merely contain 'session-state'", () => {
    assert.ok(!isSessionStatePath("src/session-state/utils.ts"));
  });

  it("detects relative session-state paths", () => {
    assert.ok(isSessionStatePath(".copilot/session-state/foo.json"));
  });

  it("detects nested relative session-state paths", () => {
    assert.ok(isSessionStatePath("foo/.copilot/session-state/bar.json"));
  });

  it("detects deeply nested relative session-state paths", () => {
    assert.ok(isSessionStatePath("a/b/c/.copilot/session-state/d.json"));
  });

  it("returns false for truthy non-string inputs", () => {
    assert.ok(!isSessionStatePath(42));
    assert.ok(!isSessionStatePath(true));
    assert.ok(!isSessionStatePath({}));
    assert.ok(!isSessionStatePath(["/.copilot/session-state/x"]));
  });
});

describe("normalizePath", () => {
  it("returns string as-is when non-empty", () => {
    assert.equal(normalizePath("foo.ts"), "foo.ts");
  });

  it("returns null for empty string", () => {
    assert.equal(normalizePath(""), null);
  });

  it("returns null for non-string", () => {
    assert.equal(normalizePath(42), null);
    assert.equal(normalizePath(undefined), null);
    assert.equal(normalizePath(null), null);
  });
});

describe("trackableFile", () => {
  it("accepts normal source files", () => {
    assert.ok(trackableFile("src/app.ts"));
  });

  it("rejects session-state files", () => {
    assert.ok(!trackableFile("/home/u/.copilot/session-state/x.json"));
  });

  it("rejects falsy paths", () => {
    assert.ok(!trackableFile(""));
    assert.ok(!trackableFile(null));
    assert.ok(!trackableFile(undefined));
  });
});

describe("extractEditPaths", () => {
  it("extracts path from edit tool", () => {
    assert.deepEqual(extractEditPaths("edit", { path: "src/a.ts" }), ["src/a.ts"]);
  });

  it("extracts path from create tool", () => {
    assert.deepEqual(extractEditPaths("create", { path: "src/b.ts" }), ["src/b.ts"]);
  });

  it("returns empty for missing path in edit", () => {
    assert.deepEqual(extractEditPaths("edit", {}), []);
  });

  it("extracts multiple files from apply_patch", () => {
    const patch =
      "*** Update File: src/a.ts\n--- old\n+++ new\n" +
      "*** Add File: src/b.ts\n--- old\n+++ new\n" +
      "*** Delete File: src/c.ts\n--- old\n+++ new\n" +
      "*** Rename File: src/d.ts\n--- old\n+++ new\n";
    const result = extractEditPaths("apply_patch", { patch });
    assert.deepEqual(result.sort(), ["src/a.ts", "src/b.ts", "src/c.ts", "src/d.ts"]);
  });

  it("deduplicates files in apply_patch", () => {
    const patch = "*** Update File: src/a.ts\n*** Update File: src/a.ts\n";
    assert.deepEqual(extractEditPaths("apply_patch", { patch }), ["src/a.ts"]);
  });

  it("handles raw string apply_patch args", () => {
    const patch = "*** Update File: src/x.ts\n";
    assert.deepEqual(extractEditPaths("apply_patch", patch), ["src/x.ts"]);
  });

  it("returns empty for non-edit tools", () => {
    assert.deepEqual(extractEditPaths("bash", { command: "ls" }), []);
    assert.deepEqual(extractEditPaths("grep", { pattern: "foo" }), []);
  });
});

describe("isDeveloperGuardianTask", () => {
  it("matches agent_type 'Developer Guardian'", () => {
    assert.ok(isDeveloperGuardianTask({ agent_type: "Developer Guardian" }));
  });

  it("matches name 'dev-guardian'", () => {
    assert.ok(isDeveloperGuardianTask({ name: "dev-guardian" }));
  });

  it("matches name 'developer-guardian'", () => {
    assert.ok(isDeveloperGuardianTask({ name: "developer-guardian" }));
  });

  it("rejects QA Guardian", () => {
    assert.ok(!isDeveloperGuardianTask({ agent_type: "QA Guardian" }));
  });

  it("rejects empty args", () => {
    assert.ok(!isDeveloperGuardianTask({}));
  });

  it("agent_type is authoritative — ignores conflicting name", () => {
    // agent_type says QA, name says dev — agent_type wins
    assert.ok(!isDeveloperGuardianTask({ agent_type: "QA Guardian", name: "dev-guardian" }));
  });

  it("agent_type 'Developer Guardian' wins over conflicting name", () => {
    assert.ok(isDeveloperGuardianTask({ agent_type: "Developer Guardian", name: "qa-guardian" }));
  });
});

describe("isReviewGuardianTask", () => {
  for (const type of ["QA Guardian", "Security Guardian", "Code Review Guardian"]) {
    it(`matches agent_type '${type}'`, () => {
      assert.ok(isReviewGuardianTask({ agent_type: type }));
    });
  }

  for (const name of ["qa-guardian", "security-guardian", "code-review-guardian"]) {
    it(`matches name '${name}'`, () => {
      assert.ok(isReviewGuardianTask({ name }));
    });
  }

  it("rejects Developer Guardian", () => {
    assert.ok(!isReviewGuardianTask({ agent_type: "Developer Guardian" }));
  });

  it("agent_type is authoritative — rejects Dev Guardian despite review name", () => {
    assert.ok(!isReviewGuardianTask({ agent_type: "Developer Guardian", name: "qa-guardian" }));
  });
});

describe("getReviewGuardianType", () => {
  it("returns canonical type for agent_type 'QA Guardian'", () => {
    assert.equal(getReviewGuardianType({ agent_type: "QA Guardian" }), "QA Guardian");
  });

  it("returns canonical type for agent_type 'Security Guardian'", () => {
    assert.equal(getReviewGuardianType({ agent_type: "Security Guardian" }), "Security Guardian");
  });

  it("returns canonical type for agent_type 'Code Review Guardian'", () => {
    assert.equal(getReviewGuardianType({ agent_type: "Code Review Guardian" }), "Code Review Guardian");
  });

  it("maps name 'qa-guardian' to 'QA Guardian'", () => {
    assert.equal(getReviewGuardianType({ name: "qa-guardian" }), "QA Guardian");
  });

  it("maps name 'security-guardian' to 'Security Guardian'", () => {
    assert.equal(getReviewGuardianType({ name: "security-guardian" }), "Security Guardian");
  });

  it("maps name 'code-review-guardian' to 'Code Review Guardian'", () => {
    assert.equal(getReviewGuardianType({ name: "code-review-guardian" }), "Code Review Guardian");
  });

  it("returns null for Developer Guardian", () => {
    assert.equal(getReviewGuardianType({ agent_type: "Developer Guardian" }), null);
  });

  it("returns null for empty args", () => {
    assert.equal(getReviewGuardianType({}), null);
  });

  it("prefers agent_type over name", () => {
    assert.equal(
      getReviewGuardianType({ agent_type: "Security Guardian", name: "qa-guardian" }),
      "Security Guardian",
    );
  });

  it("agent_type is authoritative — non-review agent_type blocks name fallback", () => {
    assert.equal(
      getReviewGuardianType({ agent_type: "Developer Guardian", name: "qa-guardian" }),
      null,
    );
  });
});

// ── Context builder tests ─────────────────────────────────────────────────

describe("context builders", () => {
  it("buildStartupContext includes key orchestration rules", () => {
    const ctx = buildStartupContext();
    assert.ok(ctx.includes("SDLC Guardian"));
    assert.ok(ctx.includes("UAT"));
    assert.ok(ctx.includes("review gate"));
    assert.ok(ctx.includes("Craig is out of scope"));
  });

  it("buildPostImplementationContext includes file count", () => {
    const ctx = buildPostImplementationContext(5);
    assert.ok(ctx.includes("5 file(s) changed"));
    assert.ok(ctx.includes("UAT checkpoint"));
  });

  it("buildPairFixContinuationContext shows iteration", () => {
    const ctx = buildPairFixContinuationContext(3, 2, 3);
    assert.ok(ctx.includes("iteration 2/3"));
    assert.ok(ctx.includes("Continue the existing UAT loop"));
  });

  it("buildPairFixContinuationContext warns at cap", () => {
    const ctx = buildPairFixContinuationContext(3, 3, 3);
    assert.ok(ctx.includes("Reached 3 pair-fix iterations"));
    assert.ok(ctx.includes("review gate"));
  });

  it("buildPairFixContinuationContext no warning below cap", () => {
    const ctx = buildPairFixContinuationContext(3, 1, 3);
    assert.ok(!ctx.includes("Reached"));
  });
});

// ── State machine integration tests ───────────────────────────────────────

describe("UatStateMachine", () => {
  /** @type {UatStateMachine} */
  let sm;

  beforeEach(() => {
    sm = new UatStateMachine();
    // Most tests focus on UAT/review behavior — pre-satisfy the PO gate.
    // PO gate enforcement has its own describe block below.
    sm.poGateCompleted = true;
  });

  // ─────────────────────────────────────────────────────────────────────
  // (a) First feature → UAT offer
  // ─────────────────────────────────────────────────────────────────────
  describe("first feature → UAT offer", () => {
    it("produces UAT offer on first successful Dev Guardian after edits", () => {
      sm.handlePostToolUse(editEvent("src/app.ts"));
      sm.handlePostToolUse(editEvent("src/utils.ts"));

      const result = sm.handlePostToolUse(devGuardianSuccess());
      assert.ok(result, "expected a hook result");
      assert.ok(result.additionalContext.includes("UAT checkpoint"));
      assert.ok(result.additionalContext.includes("2 file(s) changed"));
      assert.ok(sm.uatOfferInjected);
    });

    it("skips UAT offer when no files were edited", () => {
      const result = sm.handlePostToolUse(devGuardianSuccess());
      assert.equal(result, undefined);
      assert.ok(!sm.uatOfferInjected);
    });

    it("skips UAT offer on failed Dev Guardian", () => {
      sm.handlePostToolUse(editEvent("src/app.ts"));
      const result = sm.handlePostToolUse(devGuardianFailure());
      assert.equal(result, undefined);
      assert.ok(!sm.uatOfferInjected);
    });

    it("produces UAT offer when Dev Guardian has no resultType (legacy)", () => {
      sm.handlePostToolUse(editEvent("src/app.ts"));
      const result = sm.handlePostToolUse(devGuardianNoResult());
      assert.ok(result, "expected a hook result with legacy no-resultType");
      assert.ok(result.additionalContext.includes("UAT checkpoint"));
    });

    it("tracks files from edit, create, and apply_patch", () => {
      sm.handlePostToolUse(editEvent("src/a.ts"));
      sm.handlePostToolUse(createEvent("src/b.ts"));
      sm.handlePostToolUse(patchEvent(["src/c.ts", "src/d.ts"]));

      assert.equal(sm.fileCount, 4);
    });

    it("ignores session-state file edits", () => {
      sm.handlePostToolUse(editEvent("/home/u/.copilot/session-state/x.json"));
      assert.equal(sm.fileCount, 0);
    });

    it("ignores non-task non-edit events", () => {
      const result = sm.handlePostToolUse({ toolName: "bash", toolArgs: { command: "ls" } });
      assert.equal(result, undefined);
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // (b) Pair-fix continuation in same UAT loop
  // ─────────────────────────────────────────────────────────────────────
  describe("pair-fix continuation", () => {
    it("second Dev Guardian completion injects continuation, not fresh offer", () => {
      sm.handlePostToolUse(editEvent("src/app.ts"));
      const first = sm.handlePostToolUse(devGuardianSuccess());
      assert.ok(first.additionalContext.includes("UAT checkpoint"));

      // Pair-fix edit + second Dev Guardian
      sm.handlePostToolUse(editEvent("src/fix.ts"));
      const second = sm.handlePostToolUse(devGuardianSuccess());
      assert.ok(second, "expected pair-fix result");
      assert.ok(second.additionalContext.includes("pair-fix completed"));
      assert.ok(second.additionalContext.includes("iteration 1/"));
      // The continuation text mentions "UAT checkpoint" only in "do NOT re-offer" —
      // verify it's NOT the fresh-offer phrasing.
      assert.ok(!second.additionalContext.includes("Offer the UAT checkpoint now"));
    });

    it("increments pair-fix counter on each iteration", () => {
      sm.handlePostToolUse(editEvent("src/app.ts"));
      sm.handlePostToolUse(devGuardianSuccess()); // UAT offer

      for (let i = 1; i <= 3; i++) {
        sm.handlePostToolUse(editEvent(`src/fix${i}.ts`));
        const result = sm.handlePostToolUse(devGuardianSuccess());
        assert.ok(result.additionalContext.includes(`iteration ${i}/`));
      }
      assert.equal(sm.uatPairFixCount, 3);
    });

    it("warns at MAX_UAT_PAIR_FIX_ITERATIONS cap", () => {
      sm.handlePostToolUse(editEvent("src/app.ts"));
      sm.handlePostToolUse(devGuardianSuccess()); // UAT offer

      let result;
      for (let i = 0; i < MAX_UAT_PAIR_FIX_ITERATIONS; i++) {
        sm.handlePostToolUse(editEvent(`src/fix${i}.ts`));
        result = sm.handlePostToolUse(devGuardianSuccess());
      }
      assert.ok(result.additionalContext.includes("Reached"));
      assert.ok(result.additionalContext.includes("review gate"));
    });

    it("pair-fix works even without new edits (Dev Guardian's sub-agent may not propagate)", () => {
      sm.handlePostToolUse(editEvent("src/app.ts"));
      sm.handlePostToolUse(devGuardianSuccess()); // UAT offer

      // No new edits, but Dev Guardian completes (pair-fix for a runtime issue)
      const result = sm.handlePostToolUse(devGuardianSuccess());
      assert.ok(result, "should still get continuation — files from before remain");
      assert.ok(result.additionalContext.includes("pair-fix completed"));
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // (c) Review gate → first tracked edit of next feature → fresh offer
  // ─────────────────────────────────────────────────────────────────────
  describe("review gate → edit → fresh UAT offer", () => {
    it("first edit of next feature is preserved and yields fresh UAT offer", () => {
      // Feature 1: edit → Dev Guardian → UAT offer
      sm.handlePostToolUse(editEvent("src/feature1.ts"));
      sm.handlePostToolUse(devGuardianSuccess());

      // Full review gate completes
      sm.handlePostToolUse(reviewGuardianSuccess("QA Guardian"));
      sm.handlePostToolUse(reviewGuardianSuccess("Security Guardian"));
      sm.handlePostToolUse(reviewGuardianSuccess("Code Review Guardian"));
      assert.ok(sm.pendingFeatureReset);

      // New feature: edit arrives → does NOT trigger reset yet
      sm.handlePostToolUse(editEvent("src/feature2.ts"));
      // Edit was tracked (both old and new are in editedFiles now)

      // Dev Guardian for feature 2
      const result = sm.handlePostToolUse(devGuardianSuccess());
      assert.ok(result, "expected fresh UAT offer for feature 2");
      assert.ok(result.additionalContext.includes("UAT checkpoint"));

      // feature1.ts was in the baseline → removed; feature2.ts preserved
      assert.ok(sm.editedFiles.has("src/feature2.ts"), "new feature file preserved");
      assert.ok(!sm.editedFiles.has("src/feature1.ts"), "old feature file removed");
      assert.ok(result.additionalContext.includes("1 file(s) changed"));
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // (d) Review gate → Dev Guardian before edits → clean reset
  // ─────────────────────────────────────────────────────────────────────
  describe("review gate → Dev Guardian before edits → clean reset", () => {
    it("Dev Guardian completion after review gate with no new edits yields boundary-crossing offer", () => {
      // Feature 1 lifecycle
      sm.handlePostToolUse(editEvent("src/feature1.ts"));
      sm.handlePostToolUse(devGuardianSuccess()); // UAT offer
      sm.handlePostToolUse(reviewGuardianSuccess("QA Guardian"));
      sm.handlePostToolUse(reviewGuardianSuccess("Security Guardian"));
      sm.handlePostToolUse(reviewGuardianSuccess("Code Review Guardian"));
      assert.ok(sm.pendingFeatureReset);

      // No new edits — Dev Guardian starts next feature
      const result = sm.handlePostToolUse(devGuardianSuccess());
      // crossedBoundary=true, so even fileCount=0 → offer fires
      assert.ok(result, "expected boundary-crossing UAT offer");
      assert.ok(result.additionalContext.includes("UAT checkpoint"));
      assert.ok(result.additionalContext.includes("0 file(s) changed"));

      // State is fully reset
      assert.ok(!sm.pendingFeatureReset);
      assert.equal(sm.uatPairFixCount, 0);
      assert.equal(sm.fileCount, 0);
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // (e) Multiple review Guardian completions are idempotent
  // ─────────────────────────────────────────────────────────────────────
  describe("idempotent review completions", () => {
    it("parallel review Guardians arm reset only after all three succeed", () => {
      sm.handlePostToolUse(editEvent("src/feature.ts"));
      sm.handlePostToolUse(devGuardianSuccess()); // UAT offer

      // Three review Guardians complete (parallel gate)
      sm.handlePostToolUse(reviewGuardianSuccess("QA Guardian"));
      assert.ok(!sm.pendingFeatureReset, "1/3 — not yet");

      sm.handlePostToolUse(reviewGuardianSuccess("Security Guardian"));
      assert.ok(!sm.pendingFeatureReset, "2/3 — not yet");

      sm.handlePostToolUse(reviewGuardianSuccess("Code Review Guardian"));
      assert.ok(sm.pendingFeatureReset, "3/3 — gate passed");

      // Baseline snapshotted at gate-pass time
      assert.ok(sm.baselineFiles.has("src/feature.ts"));

      // Next Dev Guardian consumes once
      const result = sm.handlePostToolUse(devGuardianSuccess());
      assert.ok(result, "fresh UAT offer after review gate");
      assert.ok(!sm.pendingFeatureReset, "reset consumed");
      assert.equal(sm.baselineFiles, null, "baseline cleared");
    });

    it("baseline snapshot captures all reviewer edits when gate passes", () => {
      sm.handlePostToolUse(editEvent("src/feature.ts"));
      sm.handlePostToolUse(devGuardianSuccess()); // UAT offer

      // QA completes first
      sm.handlePostToolUse(reviewGuardianSuccess("QA Guardian"));

      // Security Guardian adds a report file (edit event before its completion)
      sm.handlePostToolUse(editEvent("reports/security.md"));
      sm.handlePostToolUse(reviewGuardianSuccess("Security Guardian"));

      // Code Review completes — gate passes, single snapshot taken now
      sm.handlePostToolUse(reviewGuardianSuccess("Code Review Guardian"));
      assert.ok(sm.pendingFeatureReset);
      assert.ok(sm.baselineFiles.has("reports/security.md"), "reviewer edit in baseline");
      assert.ok(sm.baselineFiles.has("src/feature.ts"), "feature file in baseline");

      // Next feature won't count the report
      sm.handlePostToolUse(editEvent("src/feature2.ts"));
      sm.handlePostToolUse(devGuardianSuccess());

      assert.ok(sm.editedFiles.has("src/feature2.ts"));
      assert.ok(!sm.editedFiles.has("reports/security.md"));
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // (f) Failed/cancelled review Guardian does NOT arm reset
  // ─────────────────────────────────────────────────────────────────────
  describe("failed review Guardian does not arm reset", () => {
    it("failed review Guardian is ignored — no pendingFeatureReset", () => {
      sm.handlePostToolUse(editEvent("src/feature.ts"));
      sm.handlePostToolUse(devGuardianSuccess()); // UAT offer
      assert.ok(sm.uatOfferInjected);

      sm.handlePostToolUse(reviewGuardianFailure("QA Guardian"));
      assert.ok(!sm.pendingFeatureReset, "failed review must NOT arm reset");
    });

    it("cancelled review Guardian is ignored — no pendingFeatureReset", () => {
      sm.handlePostToolUse(editEvent("src/feature.ts"));
      sm.handlePostToolUse(devGuardianSuccess());

      sm.handlePostToolUse(reviewGuardianCancelled("Security Guardian"));
      assert.ok(!sm.pendingFeatureReset, "cancelled review must NOT arm reset");
    });

    it("mixed success/failure taints the gate — no reset armed", () => {
      sm.handlePostToolUse(editEvent("src/feature.ts"));
      sm.handlePostToolUse(devGuardianSuccess());

      sm.handlePostToolUse(reviewGuardianFailure("QA Guardian"));
      assert.ok(!sm.pendingFeatureReset);
      assert.ok(sm.reviewGateTainted, "gate tainted by QA failure");

      sm.handlePostToolUse(reviewGuardianSuccess("Security Guardian"));
      sm.handlePostToolUse(reviewGuardianSuccess("Code Review Guardian"));
      assert.ok(!sm.pendingFeatureReset, "tainted gate must NOT arm reset");
    });

    it("review Guardian with no resultType (legacy) is treated as success", () => {
      sm.handlePostToolUse(editEvent("src/feature.ts"));
      sm.handlePostToolUse(devGuardianSuccess());

      sm.handlePostToolUse(reviewGuardianNoResult("Code Review Guardian"));
      assert.ok(
        sm.reviewGateSucceeded.has("Code Review Guardian"),
        "missing resultType → treated as success",
      );
      assert.ok(!sm.pendingFeatureReset, "single reviewer does not arm reset");
    });

    it("after failed review the UAT loop continues normally", () => {
      sm.handlePostToolUse(editEvent("src/feature.ts"));
      sm.handlePostToolUse(devGuardianSuccess()); // UAT offer

      // Review fails — lifecycle should NOT advance
      sm.handlePostToolUse(reviewGuardianFailure("QA Guardian"));

      // Pair-fix inside same feature
      sm.handlePostToolUse(editEvent("src/fix.ts"));
      const result = sm.handlePostToolUse(devGuardianSuccess());
      assert.ok(result, "pair-fix should still work");
      assert.ok(result.additionalContext.includes("pair-fix completed"));
      assert.ok(!sm.pendingFeatureReset, "still no reset armed");
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // (g) Full review-gate semantics (all 3 must succeed)
  // ─────────────────────────────────────────────────────────────────────
  describe("full review gate semantics", () => {
    it("partial review completion (1/3) does NOT arm reset", () => {
      sm.handlePostToolUse(editEvent("src/feature.ts"));
      sm.handlePostToolUse(devGuardianSuccess());

      sm.handlePostToolUse(reviewGuardianSuccess("QA Guardian"));
      assert.ok(!sm.pendingFeatureReset, "1 of 3 reviewers — gate not passed");
      assert.equal(sm.reviewGateSucceeded.size, 1);
      assert.ok(!sm.isReviewGatePassed);
    });

    it("partial review completion (2/3) does NOT arm reset", () => {
      sm.handlePostToolUse(editEvent("src/feature.ts"));
      sm.handlePostToolUse(devGuardianSuccess());

      sm.handlePostToolUse(reviewGuardianSuccess("QA Guardian"));
      sm.handlePostToolUse(reviewGuardianSuccess("Security Guardian"));
      assert.ok(!sm.pendingFeatureReset, "2 of 3 reviewers — gate not passed");
      assert.equal(sm.reviewGateSucceeded.size, 2);
      assert.ok(!sm.isReviewGatePassed);
    });

    it("arms reset only after all 3 required review Guardians succeed", () => {
      sm.handlePostToolUse(editEvent("src/feature.ts"));
      sm.handlePostToolUse(devGuardianSuccess());

      sm.handlePostToolUse(reviewGuardianSuccess("QA Guardian"));
      sm.handlePostToolUse(reviewGuardianSuccess("Security Guardian"));
      sm.handlePostToolUse(reviewGuardianSuccess("Code Review Guardian"));
      assert.ok(sm.pendingFeatureReset, "all 3 succeeded — gate passed");
      assert.ok(sm.isReviewGatePassed);
    });

    it("mixed success/failure across the gate does NOT count as gate success", () => {
      sm.handlePostToolUse(editEvent("src/feature.ts"));
      sm.handlePostToolUse(devGuardianSuccess());

      sm.handlePostToolUse(reviewGuardianSuccess("QA Guardian"));
      sm.handlePostToolUse(reviewGuardianFailure("Security Guardian"));
      sm.handlePostToolUse(reviewGuardianSuccess("Code Review Guardian"));

      assert.ok(!sm.pendingFeatureReset, "tainted gate — not armed");
      assert.ok(sm.reviewGateTainted);
      assert.ok(!sm.isReviewGatePassed);
    });

    it("later success after failure does NOT advance lifecycle (tainted gate)", () => {
      sm.handlePostToolUse(editEvent("src/feature.ts"));
      sm.handlePostToolUse(devGuardianSuccess());

      // QA fails first
      sm.handlePostToolUse(reviewGuardianFailure("QA Guardian"));
      // Security and Code Review succeed
      sm.handlePostToolUse(reviewGuardianSuccess("Security Guardian"));
      sm.handlePostToolUse(reviewGuardianSuccess("Code Review Guardian"));
      // QA retries and succeeds
      sm.handlePostToolUse(reviewGuardianSuccess("QA Guardian"));

      assert.ok(!sm.pendingFeatureReset, "tainted gate cannot pass — needs clean retry");
      assert.ok(sm.reviewGateTainted);
    });

    it("pair-fix after failed gate clears taint for fresh retry", () => {
      sm.handlePostToolUse(editEvent("src/feature.ts"));
      sm.handlePostToolUse(devGuardianSuccess());

      // Gate attempt 1: QA fails
      sm.handlePostToolUse(reviewGuardianFailure("QA Guardian"));
      assert.ok(sm.reviewGateTainted);

      // Dev Guardian pair-fix to address QA findings
      sm.handlePostToolUse(editEvent("src/fix.ts"));
      sm.handlePostToolUse(devGuardianSuccess()); // pair-fix
      assert.ok(!sm.reviewGateTainted, "pair-fix clears taint");
      assert.equal(sm.reviewGateSucceeded.size, 0, "pair-fix clears gate results");

      // Gate attempt 2: all succeed on fresh code
      sm.handlePostToolUse(reviewGuardianSuccess("QA Guardian"));
      sm.handlePostToolUse(reviewGuardianSuccess("Security Guardian"));
      sm.handlePostToolUse(reviewGuardianSuccess("Code Review Guardian"));
      assert.ok(sm.pendingFeatureReset, "fresh gate passed after pair-fix");
      assert.ok(sm.isReviewGatePassed);
    });

    it("duplicate success for same Guardian type is idempotent", () => {
      sm.handlePostToolUse(editEvent("src/feature.ts"));
      sm.handlePostToolUse(devGuardianSuccess());

      sm.handlePostToolUse(reviewGuardianSuccess("QA Guardian"));
      sm.handlePostToolUse(reviewGuardianSuccess("QA Guardian")); // duplicate
      assert.equal(sm.reviewGateSucceeded.size, 1, "deduplicated");
      assert.ok(!sm.pendingFeatureReset, "still only 1/3");
    });

    it("late review failure after gate passed disarms pendingFeatureReset", () => {
      sm.handlePostToolUse(editEvent("src/feature.ts"));
      sm.handlePostToolUse(devGuardianSuccess()); // UAT offer

      // All 3 reviewers succeed — gate passes, reset armed
      sm.handlePostToolUse(reviewGuardianSuccess("QA Guardian"));
      sm.handlePostToolUse(reviewGuardianSuccess("Security Guardian"));
      sm.handlePostToolUse(reviewGuardianSuccess("Code Review Guardian"));
      assert.ok(sm.pendingFeatureReset, "gate passed — reset armed");
      assert.ok(sm.baselineFiles instanceof Set, "baseline snapshotted");

      // Late duplicate/retry arrives with failure — disarms everything
      sm.handlePostToolUse(reviewGuardianFailure("QA Guardian"));
      assert.ok(!sm.pendingFeatureReset, "late failure must disarm reset");
      assert.equal(sm.baselineFiles, null, "late failure must invalidate baseline");
      assert.ok(sm.reviewGateTainted, "gate is now tainted");

      // Next Dev Guardian must NOT consume the boundary as passed
      sm.handlePostToolUse(editEvent("src/fix.ts"));
      const result = sm.handlePostToolUse(devGuardianSuccess());
      assert.ok(result, "pair-fix still works");
      assert.ok(
        result.additionalContext.includes("pair-fix completed"),
        "treated as pair-fix, not new feature",
      );
      // editedFiles should contain BOTH old and new files (no baseline subtract)
      assert.ok(sm.editedFiles.has("src/feature.ts"), "old file preserved");
      assert.ok(sm.editedFiles.has("src/fix.ts"), "new file tracked");
    });

    it("late review cancellation after gate passed disarms pendingFeatureReset", () => {
      sm.handlePostToolUse(editEvent("src/feature.ts"));
      sm.handlePostToolUse(devGuardianSuccess()); // UAT offer

      // All 3 reviewers succeed — gate passes, reset armed
      sm.handlePostToolUse(reviewGuardianSuccess("QA Guardian"));
      sm.handlePostToolUse(reviewGuardianSuccess("Security Guardian"));
      sm.handlePostToolUse(reviewGuardianSuccess("Code Review Guardian"));
      assert.ok(sm.pendingFeatureReset, "gate passed — reset armed");

      // Late cancelled result arrives — disarms everything
      sm.handlePostToolUse(reviewGuardianCancelled("Security Guardian"));
      assert.ok(!sm.pendingFeatureReset, "late cancellation must disarm reset");
      assert.equal(sm.baselineFiles, null, "late cancellation must invalidate baseline");
      assert.ok(sm.reviewGateTainted, "gate is now tainted");

      // Next Dev Guardian must NOT cross the feature boundary
      sm.handlePostToolUse(editEvent("src/fix2.ts"));
      const result = sm.handlePostToolUse(devGuardianSuccess());
      assert.ok(result, "pair-fix still works");
      assert.ok(
        result.additionalContext.includes("pair-fix completed"),
        "treated as pair-fix, not new feature",
      );
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // Additional edge cases
  // ─────────────────────────────────────────────────────────────────────
  describe("edge cases", () => {
    it("review Guardian before UAT offer does NOT arm reset", () => {
      sm.handlePostToolUse(editEvent("src/feature.ts"));
      // Review arrives before Dev Guardian somehow
      sm.handlePostToolUse(reviewGuardianSuccess("QA Guardian"));
      assert.ok(!sm.pendingFeatureReset, "no UAT offer yet — no reset to arm");
    });

    it("multiple full feature lifecycles work correctly", () => {
      // Feature 1
      sm.handlePostToolUse(editEvent("src/f1.ts"));
      let r = sm.handlePostToolUse(devGuardianSuccess());
      assert.ok(r.additionalContext.includes("UAT checkpoint"));

      sm.handlePostToolUse(reviewGuardianSuccess("QA Guardian"));
      sm.handlePostToolUse(reviewGuardianSuccess("Security Guardian"));
      sm.handlePostToolUse(reviewGuardianSuccess("Code Review Guardian"));

      // Feature 2
      sm.handlePostToolUse(editEvent("src/f2.ts"));
      r = sm.handlePostToolUse(devGuardianSuccess());
      assert.ok(r.additionalContext.includes("UAT checkpoint"));
      assert.ok(r.additionalContext.includes("1 file(s) changed"));

      sm.handlePostToolUse(reviewGuardianSuccess("QA Guardian"));
      sm.handlePostToolUse(reviewGuardianSuccess("Security Guardian"));
      sm.handlePostToolUse(reviewGuardianSuccess("Code Review Guardian"));

      // Feature 3
      sm.handlePostToolUse(editEvent("src/f3.ts"));
      r = sm.handlePostToolUse(devGuardianSuccess());
      assert.ok(r.additionalContext.includes("UAT checkpoint"));
      assert.equal(sm.uatPairFixCount, 0, "pair-fix counter reset across features");
    });

    it("Dev Guardian by name rather than agent_type still triggers UAT", () => {
      sm.handlePostToolUse(editEvent("src/app.ts"));
      const result = sm.handlePostToolUse({
        toolName: "task",
        toolArgs: { name: "dev-guardian" },
        toolResult: { resultType: "success" },
      });
      assert.ok(result);
      assert.ok(result.additionalContext.includes("UAT checkpoint"));
    });

    it("review Guardian by name rather than agent_type still records gate success", () => {
      sm.handlePostToolUse(editEvent("src/app.ts"));
      sm.handlePostToolUse(devGuardianSuccess());

      sm.handlePostToolUse({
        toolName: "task",
        toolArgs: { name: "qa-guardian" },
        toolResult: { resultType: "success" },
      });
      assert.ok(sm.reviewGateSucceeded.has("QA Guardian"), "name-based QA registered");
      assert.ok(!sm.pendingFeatureReset, "single reviewer does not arm reset");
    });

    it("consumePendingReset clears all UAT state including gate tracking", () => {
      sm.handlePostToolUse(editEvent("src/app.ts"));
      sm.handlePostToolUse(devGuardianSuccess());
      sm.handlePostToolUse(editEvent("src/fix.ts"));
      sm.handlePostToolUse(devGuardianSuccess()); // pair-fix

      assert.ok(sm.uatOfferInjected);
      assert.equal(sm.uatPairFixCount, 1);

      // Simulate gate passing
      sm.reviewGateSucceeded.add("QA Guardian");
      sm.reviewGateSucceeded.add("Security Guardian");
      sm.reviewGateSucceeded.add("Code Review Guardian");
      sm.pendingFeatureReset = true;
      sm.baselineFiles = new Set(sm.editedFiles);
      sm.consumePendingReset();

      assert.ok(!sm.uatOfferInjected);
      assert.equal(sm.uatPairFixCount, 0);
      assert.ok(!sm.pendingFeatureReset);
      assert.equal(sm.baselineFiles, null);
      assert.equal(sm.fileCount, 0);
      assert.equal(sm.reviewGateSucceeded.size, 0, "gate results cleared");
      assert.ok(!sm.reviewGateTainted, "gate taint cleared");
    });

    it("non-task tool events are no-ops beyond file tracking", () => {
      const result = sm.handlePostToolUse({
        toolName: "bash",
        toolArgs: { command: "npm test" },
      });
      assert.equal(result, undefined);
      assert.equal(sm.fileCount, 0);
    });

    it("task tool for non-Guardian agent is a no-op", () => {
      sm.handlePostToolUse(editEvent("src/app.ts"));
      const result = sm.handlePostToolUse({
        toolName: "task",
        toolArgs: { agent_type: "explore", name: "search-code" },
        toolResult: { resultType: "success" },
      });
      assert.equal(result, undefined);
      assert.ok(!sm.uatOfferInjected);
    });

    it("task event with undefined toolArgs does not throw", () => {
      const result = sm.handlePostToolUse({ toolName: "task", toolArgs: undefined });
      assert.equal(result, undefined);
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // PO gate enforcement
  // ─────────────────────────────────────────────────────────────────────
  describe("PO gate enforcement", () => {
    beforeEach(() => {
      sm = new UatStateMachine();
      // Do NOT set poGateCompleted — test the gate
    });

    it("warns when Dev Guardian completes without PO gate", () => {
      sm.handlePostToolUse(editEvent("src/app.ts"));
      const result = sm.handlePostToolUse(devGuardianSuccess());
      assert.ok(result, "expected a warning");
      assert.ok(result.additionalContext.includes("no PO Guardian ticket"));
      assert.ok(!sm.uatOfferInjected, "should not offer UAT without PO");
    });

    it("PO Guardian completion sets poGateCompleted", () => {
      const result = sm.handlePostToolUse({
        toolName: "task",
        toolArgs: { agent_type: "Product Owner Guardian" },
        toolResult: { resultType: "success" },
      });
      assert.ok(result, "expected PO gate context");
      assert.ok(result.additionalContext.includes("FULL ticket"));
      assert.ok(sm.poGateCompleted);
    });

    it("PO Guardian by name also works", () => {
      const result = sm.handlePostToolUse({
        toolName: "task",
        toolArgs: { name: "po-guardian" },
        toolResult: { resultType: "success" },
      });
      assert.ok(result);
      assert.ok(sm.poGateCompleted);
    });

    it("failed PO Guardian does not set poGateCompleted", () => {
      const result = sm.handlePostToolUse({
        toolName: "task",
        toolArgs: { agent_type: "Product Owner Guardian" },
        toolResult: { resultType: "failed" },
      });
      assert.equal(result, undefined);
      assert.ok(!sm.poGateCompleted);
    });

    it("Dev Guardian proceeds normally after PO gate", () => {
      // PO completes
      sm.handlePostToolUse({
        toolName: "task",
        toolArgs: { agent_type: "Product Owner Guardian" },
        toolResult: { resultType: "success" },
      });

      // Dev completes with edits
      sm.handlePostToolUse(editEvent("src/app.ts"));
      const result = sm.handlePostToolUse(devGuardianSuccess());
      assert.ok(result);
      assert.ok(result.additionalContext.includes("UAT checkpoint"));
      assert.ok(sm.uatOfferInjected);
    });

    it("PO gate resets after full review gate passes and new feature starts", () => {
      // Full cycle: PO → Dev → reviews pass → new Dev
      sm.handlePostToolUse({
        toolName: "task",
        toolArgs: { agent_type: "Product Owner Guardian" },
        toolResult: { resultType: "success" },
      });
      sm.handlePostToolUse(editEvent("src/app.ts"));
      sm.handlePostToolUse(devGuardianSuccess());

      for (const type of REQUIRED_REVIEW_GUARDIANS) {
        sm.handlePostToolUse(reviewGuardianSuccess(type));
      }
      assert.ok(sm.pendingFeatureReset);

      // New Dev Guardian triggers boundary reset — PO gate should be cleared
      sm.handlePostToolUse(editEvent("src/new-feature.ts"));
      sm.handlePostToolUse(devGuardianSuccess());
      assert.ok(!sm.poGateCompleted, "PO gate should reset for new feature");
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // Guardian completion hooks
  // ─────────────────────────────────────────────────────────────────────
  describe("Guardian completion hooks", () => {
    it("review Guardian success injects completion context", () => {
      sm.handlePostToolUse(editEvent("src/app.ts"));
      sm.handlePostToolUse(devGuardianSuccess());

      const result = sm.handlePostToolUse(reviewGuardianSuccess("Security Guardian"));
      assert.ok(result, "expected completion context");
      assert.ok(result.additionalContext.includes("Security Guardian completed"));
      assert.ok(result.additionalContext.includes("Tools Report"));
    });

    it("QA Guardian success injects QA-specific context", () => {
      sm.handlePostToolUse(editEvent("src/app.ts"));
      sm.handlePostToolUse(devGuardianSuccess());

      const result = sm.handlePostToolUse(reviewGuardianSuccess("QA Guardian"));
      assert.ok(result);
      assert.ok(result.additionalContext.includes("QA Guardian completed"));
      assert.ok(result.additionalContext.includes("coverage gaps"));
    });

    it("Code Review success injects CR-specific context", () => {
      sm.handlePostToolUse(editEvent("src/app.ts"));
      sm.handlePostToolUse(devGuardianSuccess());

      const result = sm.handlePostToolUse(reviewGuardianSuccess("Code Review Guardian"));
      assert.ok(result);
      assert.ok(result.additionalContext.includes("Code Review Guardian completed"));
    });

    it("failed review Guardian does not inject context", () => {
      sm.handlePostToolUse(editEvent("src/app.ts"));
      sm.handlePostToolUse(devGuardianSuccess());

      const result = sm.handlePostToolUse({
        toolName: "task",
        toolArgs: { agent_type: "Security Guardian" },
        toolResult: { resultType: "failed" },
      });
      assert.equal(result, undefined);
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // Helper function tests
  // ─────────────────────────────────────────────────────────────────────
  describe("isPOGuardianTask", () => {
    it("matches agent_type 'Product Owner Guardian'", () => {
      assert.ok(isPOGuardianTask({ agent_type: "Product Owner Guardian" }));
    });

    it("matches name 'po-guardian'", () => {
      assert.ok(isPOGuardianTask({ name: "po-guardian" }));
    });

    it("matches name 'product-owner-guardian'", () => {
      assert.ok(isPOGuardianTask({ name: "product-owner-guardian" }));
    });

    it("rejects other agent types", () => {
      assert.ok(!isPOGuardianTask({ agent_type: "Developer Guardian" }));
    });

    it("rejects other names", () => {
      assert.ok(!isPOGuardianTask({ name: "dev-guardian" }));
    });
  });

  describe("getGuardianType", () => {
    it("identifies Developer Guardian", () => {
      assert.equal(getGuardianType({ agent_type: "Developer Guardian" }), "Developer Guardian");
    });

    it("identifies PO Guardian", () => {
      assert.equal(getGuardianType({ agent_type: "Product Owner Guardian" }), "Product Owner Guardian");
    });

    it("identifies review Guardians", () => {
      assert.equal(getGuardianType({ agent_type: "Security Guardian" }), "Security Guardian");
    });

    it("returns null for unknown", () => {
      assert.equal(getGuardianType({ agent_type: "explore" }), null);
    });
  });
});
