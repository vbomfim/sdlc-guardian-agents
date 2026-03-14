/**
 * Unit tests for multi-repo config schema validation.
 *
 * Tests written FIRST per TDD — these define the expected behavior
 * for the repos array field added in issue #34.
 *
 * @see https://github.com/vbomfim/sdlc-guardian-agents/issues/34
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { ConfigLoader } from "../config.loader.js";
import { ConfigValidationError } from "../config.errors.js";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

async function makeTempDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "craig-multi-repo-test-"));
}

async function writeConfig(dir: string, content: string): Promise<string> {
  const filePath = path.join(dir, "craig.config.yaml");
  await fs.writeFile(filePath, content, "utf-8");
  return filePath;
}

/* ------------------------------------------------------------------ */
/*  Fixtures                                                           */
/* ------------------------------------------------------------------ */

const MULTI_REPO_YAML = `
repos:
  - repo: owner/repo-a
    branch: main
    capabilities:
      merge_review: true
      security: true
  - repo: owner/repo-b
    branch: develop
    schedule:
      coverage_scan: "0 10 * * *"
`;

const SINGLE_REPO_YAML = `
repo: owner/repo-name
branch: main
`;

const MIXED_YAML = `
repo: owner/default-repo
repos:
  - repo: owner/repo-a
  - repo: owner/repo-b
`;

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe("Config multi-repo support (#34)", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await makeTempDir();
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  // ─── AC4: Backward compatibility — single repo config unchanged ──

  describe("backward compatibility", () => {
    it("should accept single-repo config with repo field", async () => {
      const configPath = await writeConfig(tmpDir, SINGLE_REPO_YAML);
      const loader = new ConfigLoader({ baseDir: tmpDir });
      const config = await loader.load(configPath);

      expect(config.repo).toBe("owner/repo-name");
      expect(config.branch).toBe("main");
      expect(config.repos).toBeUndefined();
    });

    it("should apply all defaults for single-repo config", async () => {
      const configPath = await writeConfig(tmpDir, SINGLE_REPO_YAML);
      const loader = new ConfigLoader({ baseDir: tmpDir });
      const config = await loader.load(configPath);

      expect(config.capabilities.merge_review).toBe(true);
      expect(config.autonomy.auto_merge).toBe(false);
      expect(config.models.default).toBe("claude-sonnet-4.5");
    });
  });

  // ─── AC1: Given multiple repos configured, config is valid ────────

  describe("multi-repo config", () => {
    it("should accept repos array with valid entries", async () => {
      const configPath = await writeConfig(tmpDir, MULTI_REPO_YAML);
      const loader = new ConfigLoader({ baseDir: tmpDir });
      const config = await loader.load(configPath);

      expect(config.repos).toBeDefined();
      expect(config.repos).toHaveLength(2);
      expect(config.repos![0]!.repo).toBe("owner/repo-a");
      expect(config.repos![1]!.repo).toBe("owner/repo-b");
    });

    it("should apply default branch to repos entries without branch", async () => {
      const yaml = `
repos:
  - repo: owner/repo-a
  - repo: owner/repo-b
    branch: develop
`;
      const configPath = await writeConfig(tmpDir, yaml);
      const loader = new ConfigLoader({ baseDir: tmpDir });
      const config = await loader.load(configPath);

      expect(config.repos![0]!.branch).toBe("main");
      expect(config.repos![1]!.branch).toBe("develop");
    });

    it("should allow per-repo schedule overrides", async () => {
      const configPath = await writeConfig(tmpDir, MULTI_REPO_YAML);
      const loader = new ConfigLoader({ baseDir: tmpDir });
      const config = await loader.load(configPath);

      expect(config.repos![1]!.schedule).toEqual({
        coverage_scan: "0 10 * * *",
      });
    });

    it("should allow per-repo capabilities", async () => {
      const yaml = `
repos:
  - repo: owner/repo-a
    capabilities:
      merge_review: false
      auto_fix: false
`;
      const configPath = await writeConfig(tmpDir, yaml);
      const loader = new ConfigLoader({ baseDir: tmpDir });
      const config = await loader.load(configPath);

      expect(config.repos![0]!.capabilities!.merge_review).toBe(false);
      expect(config.repos![0]!.capabilities!.auto_fix).toBe(false);
    });
  });

  // ─── When both repo and repos present, repos takes precedence ────

  describe("repo + repos coexistence", () => {
    it("should accept config with both repo and repos", async () => {
      const configPath = await writeConfig(tmpDir, MIXED_YAML);
      const loader = new ConfigLoader({ baseDir: tmpDir });
      const config = await loader.load(configPath);

      expect(config.repo).toBe("owner/default-repo");
      expect(config.repos).toHaveLength(2);
    });
  });

  // ─── Validation: at least one of repo or repos must be present ────

  describe("validation", () => {
    it("should reject config with neither repo nor repos", async () => {
      const yaml = `
branch: main
schedule: {}
`;
      const configPath = await writeConfig(tmpDir, yaml);
      const loader = new ConfigLoader({ baseDir: tmpDir });

      await expect(loader.load(configPath)).rejects.toThrow(
        ConfigValidationError,
      );
    });

    it("should reject repos entry without repo field", async () => {
      const yaml = `
repos:
  - branch: main
`;
      const configPath = await writeConfig(tmpDir, yaml);
      const loader = new ConfigLoader({ baseDir: tmpDir });

      await expect(loader.load(configPath)).rejects.toThrow(
        ConfigValidationError,
      );
    });

    it("should reject repos entry with invalid repo format", async () => {
      const yaml = `
repos:
  - repo: invalid-format
`;
      const configPath = await writeConfig(tmpDir, yaml);
      const loader = new ConfigLoader({ baseDir: tmpDir });

      await expect(loader.load(configPath)).rejects.toThrow(
        ConfigValidationError,
      );
    });

    it("should reject repos with empty array", async () => {
      const yaml = `
repos: []
`;
      const configPath = await writeConfig(tmpDir, yaml);
      const loader = new ConfigLoader({ baseDir: tmpDir });

      await expect(loader.load(configPath)).rejects.toThrow(
        ConfigValidationError,
      );
    });

    it("should reject repos entry with secret in repo field", async () => {
      const yaml = `
repos:
  - repo: ghp_secrettoken123/repo
`;
      const configPath = await writeConfig(tmpDir, yaml);
      const loader = new ConfigLoader({ baseDir: tmpDir });

      await expect(loader.load(configPath)).rejects.toThrow();
    });

    it("should reject repos entry with invalid cron in schedule", async () => {
      const yaml = `
repos:
  - repo: owner/repo-a
    schedule:
      coverage_scan: "not-a-cron"
`;
      const configPath = await writeConfig(tmpDir, yaml);
      const loader = new ConfigLoader({ baseDir: tmpDir });

      await expect(loader.load(configPath)).rejects.toThrow(
        ConfigValidationError,
      );
    });
  });
});
