/**
 * Unit tests for the Config component.
 *
 * Tests written FIRST per TDD — these define the expected behavior.
 * Each acceptance criterion from the ticket maps to one or more tests.
 *
 * @see https://github.com/vbomfim/sdlc-guardian-agents/issues/1
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { ConfigLoader } from "../config.loader.js";
import {
  ConfigNotFoundError,
  ConfigValidationError,
  ConfigParseError,
} from "../config.errors.js";
import type { CraigConfig } from "../config.port.js";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Create a temp directory for each test to avoid cross-test pollution. */
async function makeTempDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "craig-test-"));
}

/** Write a YAML string to a temp config file and return its path. */
async function writeConfig(dir: string, content: string): Promise<string> {
  const filePath = path.join(dir, "craig.config.yaml");
  await fs.writeFile(filePath, content, "utf-8");
  return filePath;
}

/* ------------------------------------------------------------------ */
/*  Fixtures                                                           */
/* ------------------------------------------------------------------ */

const FULL_VALID_YAML = `
repo: owner/repo-name
branch: main

schedule:
  merge_monitor: on_push
  coverage_scan: "0 8 * * *"
  tech_debt_audit: "0 9 * * 1"

capabilities:
  merge_review: true
  coverage_gaps: true
  bug_detection: true
  pattern_enforcement: true
  po_audit: true
  auto_fix: true
  dependency_updates: true

models:
  code_review:
    - claude-opus-4.6
    - gpt-5.4
  security: claude-opus-4.6
  default: claude-sonnet-4.5

autonomy:
  create_issues: true
  create_draft_prs: true
  auto_merge: false

guardians:
  path: ~/.copilot/
`;

const MINIMAL_VALID_YAML = `
repo: owner/my-repo
`;

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe("ConfigLoader", () => {
  let tmpDir: string;
  let loader: ConfigLoader;

  beforeEach(async () => {
    tmpDir = await makeTempDir();
    loader = new ConfigLoader();
    // Clear env var before each test
    delete process.env.CRAIG_CONFIG;
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
    delete process.env.CRAIG_CONFIG;
  });

  /* ----- AC1: Load valid config ----- */
  describe("AC1: Load valid config", () => {
    it("should load and return a fully typed CraigConfig from valid YAML", async () => {
      const configPath = await writeConfig(tmpDir, FULL_VALID_YAML);

      const config = await loader.load(configPath);

      expect(config.repo).toBe("owner/repo-name");
      expect(config.branch).toBe("main");
      expect(config.schedule.merge_monitor).toBe("on_push");
      expect(config.schedule.coverage_scan).toBe("0 8 * * *");
      expect(config.capabilities.merge_review).toBe(true);
      expect(config.models.code_review).toEqual(["claude-opus-4.6", "gpt-5.4"]);
      expect(config.models.security).toBe("claude-opus-4.6");
      expect(config.models.default).toBe("claude-sonnet-4.5");
      expect(config.autonomy.create_issues).toBe(true);
      expect(config.autonomy.create_draft_prs).toBe(true);
      expect(config.autonomy.auto_merge).toBe(false);
      expect(config.guardians.path).toBe("~/.copilot/");
    });
  });

  /* ----- AC2: Apply defaults for omitted fields ----- */
  describe("AC2: Apply defaults for omitted fields", () => {
    it("should default branch to 'main' when omitted", async () => {
      const configPath = await writeConfig(tmpDir, MINIMAL_VALID_YAML);

      const config = await loader.load(configPath);

      expect(config.branch).toBe("main");
    });

    it("should default autonomy.auto_merge to false when omitted", async () => {
      const configPath = await writeConfig(tmpDir, MINIMAL_VALID_YAML);

      const config = await loader.load(configPath);

      expect(config.autonomy.auto_merge).toBe(false);
    });

    it("should default guardians.path to '~/.copilot/' when omitted", async () => {
      const configPath = await writeConfig(tmpDir, MINIMAL_VALID_YAML);

      const config = await loader.load(configPath);

      expect(config.guardians.path).toBe("~/.copilot/");
    });

    it("should default all capabilities to true when omitted", async () => {
      const configPath = await writeConfig(tmpDir, MINIMAL_VALID_YAML);

      const config = await loader.load(configPath);

      expect(config.capabilities.merge_review).toBe(true);
      expect(config.capabilities.coverage_gaps).toBe(true);
      expect(config.capabilities.bug_detection).toBe(true);
      expect(config.capabilities.pattern_enforcement).toBe(true);
      expect(config.capabilities.po_audit).toBe(true);
      expect(config.capabilities.auto_fix).toBe(true);
      expect(config.capabilities.dependency_updates).toBe(true);
    });

    it("should default models.default to 'claude-sonnet-4.5' when omitted", async () => {
      const configPath = await writeConfig(tmpDir, MINIMAL_VALID_YAML);

      const config = await loader.load(configPath);

      expect(config.models.default).toBe("claude-sonnet-4.5");
    });

    it("should default schedule to empty object when omitted", async () => {
      const configPath = await writeConfig(tmpDir, MINIMAL_VALID_YAML);

      const config = await loader.load(configPath);

      expect(config.schedule).toEqual({});
    });

    it("should default autonomy.create_issues to true when omitted", async () => {
      const configPath = await writeConfig(tmpDir, MINIMAL_VALID_YAML);

      const config = await loader.load(configPath);

      expect(config.autonomy.create_issues).toBe(true);
    });

    it("should default autonomy.create_draft_prs to true when omitted", async () => {
      const configPath = await writeConfig(tmpDir, MINIMAL_VALID_YAML);

      const config = await loader.load(configPath);

      expect(config.autonomy.create_draft_prs).toBe(true);
    });
  });

  /* ----- AC3: Reject invalid config ----- */
  describe("AC3: Reject invalid config", () => {
    it("should throw ConfigValidationError when repo is missing", async () => {
      const configPath = await writeConfig(tmpDir, "branch: main\n");

      await expect(loader.load(configPath)).rejects.toThrow(
        ConfigValidationError,
      );
    });

    it("should include the missing field name in the error message", async () => {
      const configPath = await writeConfig(tmpDir, "branch: main\n");

      await expect(loader.load(configPath)).rejects.toThrow(/repo/i);
    });

    it("should throw ConfigValidationError for invalid repo format", async () => {
      const configPath = await writeConfig(tmpDir, "repo: invalid-no-slash\n");

      await expect(loader.load(configPath)).rejects.toThrow(
        ConfigValidationError,
      );
    });

    it("should throw ConfigValidationError for invalid cron expression", async () => {
      const yaml = `
repo: owner/repo
schedule:
  coverage_scan: "not a cron"
`;
      const configPath = await writeConfig(tmpDir, yaml);

      await expect(loader.load(configPath)).rejects.toThrow(
        ConfigValidationError,
      );
    });
  });

  /* ----- AC4: Handle missing file ----- */
  describe("AC4: Handle missing file", () => {
    it("should throw ConfigNotFoundError when file does not exist", async () => {
      const missingPath = path.join(tmpDir, "does-not-exist.yaml");

      await expect(loader.load(missingPath)).rejects.toThrow(
        ConfigNotFoundError,
      );
    });

    it("should include the attempted path in the error", async () => {
      const missingPath = path.join(tmpDir, "does-not-exist.yaml");

      try {
        await loader.load(missingPath);
        expect.fail("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(ConfigNotFoundError);
        expect((error as ConfigNotFoundError).path).toBe(missingPath);
      }
    });
  });

  /* ----- AC5: Runtime update via MCP tool ----- */
  describe("AC5: Runtime update", () => {
    it("should update in-memory config for a top-level key", async () => {
      const configPath = await writeConfig(tmpDir, FULL_VALID_YAML);
      await loader.load(configPath);

      const updated = await loader.update("branch", "develop");

      expect(updated.branch).toBe("develop");
      expect(loader.get().branch).toBe("develop");
    });

    it("should update a nested key using dot notation", async () => {
      const configPath = await writeConfig(tmpDir, FULL_VALID_YAML);
      await loader.load(configPath);

      const updated = await loader.update("capabilities.auto_fix", false);

      expect(updated.capabilities.auto_fix).toBe(false);
    });

    it("should persist the update to disk", async () => {
      const configPath = await writeConfig(tmpDir, FULL_VALID_YAML);
      await loader.load(configPath);

      await loader.update("branch", "develop");

      // Read file and verify it was written
      const fileContent = await fs.readFile(configPath, "utf-8");
      expect(fileContent).toContain("develop");
    });

    it("should reject updates that would make config invalid", async () => {
      const configPath = await writeConfig(tmpDir, FULL_VALID_YAML);
      await loader.load(configPath);

      // repo cannot be empty
      await expect(loader.update("repo", "")).rejects.toThrow(
        ConfigValidationError,
      );
    });
  });

  /* ----- AC6: Environment variable override ----- */
  describe("AC6: Environment variable override for path", () => {
    it("should load from CRAIG_CONFIG env var when no argument is passed", async () => {
      const configPath = await writeConfig(tmpDir, FULL_VALID_YAML);
      process.env.CRAIG_CONFIG = configPath;

      const config = await loader.load();

      expect(config.repo).toBe("owner/repo-name");
    });

    it("should prefer explicit argument over env var", async () => {
      const envConfig = await writeConfig(tmpDir, MINIMAL_VALID_YAML);
      process.env.CRAIG_CONFIG = envConfig;

      const otherDir = await makeTempDir();
      const argConfig = await writeConfig(otherDir, FULL_VALID_YAML);

      const config = await loader.load(argConfig);

      expect(config.repo).toBe("owner/repo-name");

      await fs.rm(otherDir, { recursive: true, force: true });
    });
  });

  /* ----- Edge Cases ----- */
  describe("Edge cases", () => {
    it("should throw ConfigValidationError for empty file", async () => {
      const configPath = await writeConfig(tmpDir, "");

      await expect(loader.load(configPath)).rejects.toThrow(
        ConfigValidationError,
      );
    });

    it("should throw ConfigParseError for invalid YAML", async () => {
      const configPath = await writeConfig(
        tmpDir,
        "{{{{invalid yaml: [[[",
      );

      await expect(loader.load(configPath)).rejects.toThrow(ConfigParseError);
    });

    it("should ignore extra unknown fields (forward-compatible)", async () => {
      const yaml = `
repo: owner/repo
future_field: some_value
nested_future:
  key: value
`;
      const configPath = await writeConfig(tmpDir, yaml);

      const config = await loader.load(configPath);

      expect(config.repo).toBe("owner/repo");
      // Unknown fields should not cause errors
    });

    it("should override auto_merge: true to false", async () => {
      const yaml = `
repo: owner/repo
autonomy:
  auto_merge: true
`;
      const configPath = await writeConfig(tmpDir, yaml);

      const config = await loader.load(configPath);

      expect(config.autonomy.auto_merge).toBe(false);
    });

    it("should reject config with secret-like values (ghp_ prefix)", async () => {
      const yaml = `
repo: owner/repo
models:
  default: ghp_1234567890abcdef
`;
      const configPath = await writeConfig(tmpDir, yaml);

      await expect(loader.load(configPath)).rejects.toThrow(
        ConfigValidationError,
      );
    });

    it("should reject config with secret-like values (ghs_ prefix)", async () => {
      const yaml = `
repo: owner/repo
models:
  default: ghs_secrettoken1234
`;
      const configPath = await writeConfig(tmpDir, yaml);

      await expect(loader.load(configPath)).rejects.toThrow(
        ConfigValidationError,
      );
    });

    it("should throw if get() is called before load()", () => {
      expect(() => loader.get()).toThrow();
    });
  });

  /* ----- validate() direct tests ----- */
  describe("validate()", () => {
    it("should return a valid CraigConfig from correct raw data", () => {
      const raw = {
        repo: "owner/repo",
        branch: "main",
        schedule: {},
        capabilities: {},
        models: { default: "claude-sonnet-4.5" },
        autonomy: {
          create_issues: true,
          create_draft_prs: true,
          auto_merge: false,
        },
        guardians: { path: "~/.copilot/" },
      };

      const config = loader.validate(raw);

      expect(config.repo).toBe("owner/repo");
    });

    it("should throw ConfigValidationError for null input", () => {
      expect(() => loader.validate(null)).toThrow(ConfigValidationError);
    });

    it("should throw ConfigValidationError for undefined input", () => {
      expect(() => loader.validate(undefined)).toThrow(ConfigValidationError);
    });
  });
});
