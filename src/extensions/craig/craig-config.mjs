/**
 * Craig Config — reads, writes, and manages craig.config.yaml.
 *
 * Search order for loading:
 * 1. ./craig.config.yaml (repo root)
 * 2. ~/.copilot/craig.config.yaml (user global)
 *
 * Default init location: ~/.copilot/craig.config.yaml
 *
 * @module craig-config
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

/** Known config file locations, searched in order. */
const CONFIG_PATHS = [
  join(process.cwd(), "craig.config.yaml"),
  join(homedir(), ".copilot", "craig.config.yaml"),
];

/** Default location for new config files. */
export const DEFAULT_CONFIG_PATH = join(homedir(), ".copilot", "craig.config.yaml");

/**
 * Find the first existing config file path.
 * @returns {string | null}
 */
export function findConfigPath() {
  for (const p of CONFIG_PATHS) {
    if (existsSync(p)) return p;
  }
  return null;
}

/**
 * Load and parse a craig.config.yaml file.
 *
 * @param {string} configPath
 * @returns {{ path: string, enabled: boolean, repo: string, schedule: Record<string, string>, prompts: Record<string, string> }}
 */
export function loadConfig(configPath) {
  const raw = readFileSync(configPath, "utf-8");
  const config = parseSimpleYaml(raw);

  return {
    path: configPath,
    repo: config.repo || ".",
    schedule: config.schedule || {},
    prompts: config.prompts || {},
  };
}

/**
 * Create a default craig.config.yaml at the given path.
 *
 * @param {string} configPath
 * @returns {{ path: string, enabled: boolean, repo: string, schedule: Record<string, string>, prompts: Record<string, string> }}
 */
export function initConfig(configPath = DEFAULT_CONFIG_PATH) {
  const defaultConfig = {
    repo: ".",
    schedule: {},
    prompts: {},
  };
  saveConfig(configPath, defaultConfig);
  return { path: configPath, ...defaultConfig };
}

/**
 * Save config back to disk as YAML.
 *
 * @param {string} configPath
 * @param {{ repo: string, schedule: Record<string, string>, prompts: Record<string, string> }} config
 */
export function saveConfig(configPath, config) {
  const lines = [];
  lines.push(`repo: ${config.repo}`);

  lines.push("schedule:");
  for (const [name, cron] of Object.entries(config.schedule)) {
    lines.push(`  ${name}: ${cron}`);
  }

  if (Object.keys(config.prompts).length > 0) {
    lines.push("prompts:");
    for (const [name, prompt] of Object.entries(config.prompts)) {
      lines.push(`  ${name}: ${prompt}`);
    }
  }

  writeFileSync(configPath, lines.join("\n") + "\n", "utf-8");
}

/**
 * Minimal YAML parser for flat and one-level-nested maps.
 * Handles: key: value, nested maps (2-space indent), comments (#).
 * Does NOT handle arrays, multi-line strings, or complex YAML.
 *
 * @param {string} text
 * @returns {Record<string, any>}
 */
function parseSimpleYaml(text) {
  const result = {};
  let currentSection = null;

  for (const line of text.split("\n")) {
    const trimmed = line.replace(/#.*$/, "").trimEnd();
    if (!trimmed) continue;

    const indent = line.length - line.trimStart().length;

    if (indent === 0 && trimmed.includes(":")) {
      const [key, ...rest] = trimmed.split(":");
      const value = rest.join(":").trim();
      if (value) {
        result[key.trim()] = value;
        currentSection = null;
      } else {
        currentSection = key.trim();
        result[currentSection] = {};
      }
    } else if (indent >= 2 && currentSection && trimmed.includes(":")) {
      const [key, ...rest] = trimmed.trim().split(":");
      result[currentSection][key.trim()] = rest.join(":").trim();
    }
  }

  return result;
}
