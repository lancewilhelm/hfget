import fs from "fs";
import path from "path";
import os from "os";

export interface Config {
  hfToken?: string;
  defaultDownloadDir?: string;
  defaultSearchLimit?: number;
  storageStrategy?: "flat" | "organized";
}

const CONFIG_DIR = path.join(os.homedir(), ".config", "hfget");
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");

export function getConfigPath(): string {
  return CONFIG_FILE;
}

export function loadConfig(): Config {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const content = fs.readFileSync(CONFIG_FILE, "utf-8");
      return JSON.parse(content);
    }
  } catch (err) {
    console.warn(`Warning: Failed to load config from ${CONFIG_FILE}`);
  }
  return {};
}

export function saveConfig(config: Config): void {
  try {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), "utf-8");
  } catch (err) {
    throw new Error(`Failed to save config to ${CONFIG_FILE}: ${err}`);
  }
}

export function getToken(): string | undefined {
  const config = loadConfig();
  return config.hfToken || process.env.HF_TOKEN;
}

export function getDefaultDownloadDir(): string {
  const config = loadConfig();
  return config.defaultDownloadDir || "/opt/llms/models";
}

export function getSearchLimit(): number {
  const config = loadConfig();
  return config.defaultSearchLimit || 20;
}

export function getStorageStrategy(): "flat" | "organized" {
  const config = loadConfig();
  return config.storageStrategy || "organized";
}

export function initConfig(): void {
  if (fs.existsSync(CONFIG_FILE)) {
    throw new Error(`Config file already exists at ${CONFIG_FILE}`);
  }

  const defaultConfig: Config = {
    hfToken: "",
    defaultDownloadDir: "/opt/llms/models",
    defaultSearchLimit: 20,
    storageStrategy: "organized",
  };

  saveConfig(defaultConfig);
}
