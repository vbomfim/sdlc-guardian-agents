/**
 * Craig Config Loader — reads craig.config.yaml from known locations.
 *
 * Search order:
 * 1. ./craig.config.yaml (repo root)
 * 2. ~/.copilot/craig.config.yaml (user global)
 *
 * @module craig-config
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

/** Known config file locations, searched in order. */
const CONFIG_PATHS = [
  join(process.cwd(), "craig.config.yaml"),
  join(homedir(), ".copilot", "craig.config.yaml"),
];

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
 * Uses a simple YAML subset parser — no dependency needed for flat configs.
 *
 * @param {string} configPath
 * @returns {{ enabled: boolean, repo: string, schedule: Record<string, string>, prompts: Record<string, string> }}
 */
export function loadConfig(configPath) {
  const raw = readFileSync(configPath, "utf-8");
  const config = parseSimpleYaml(raw);

  return {
    enabled: config.enabled === "true" || config.enabled === true,
    repo: config.repo || ".",
    schedule: config.schedule || {},
    prompts: config.prompts || {},
  };
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
