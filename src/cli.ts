#!/usr/bin/env node

import * as hub from "@huggingface/hub";
import inquirer from "inquirer";
import chalk from "chalk";
import ora from "ora";
import fs from "fs";
import path from "path";
import * as config from "./config.js";
import autocomplete from "inquirer-autocomplete-standalone";
import cliProgress from "cli-progress";
import https from "https";
import http from "http";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageJson = JSON.parse(
  readFileSync(join(__dirname, "..", "package.json"), "utf-8"),
);
const logo = `
  _      __            _
 | |__  / _| __ _  ___| |_
 | '_ \\| |_ / _\` |/ _ \\ __|
 | | | |  _| (_| |  __/ |_
 |_| |_|_|  \\__, |\\___|\\__|
            |___/
  `;

function formatBytes(bytes: number | undefined): string {
  if (!bytes || bytes <= 0) return "unknown";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let v = bytes;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(1)} ${units[i]}`;
}

function getNavigationHint(multiSelect: boolean = false): string {
  if (multiSelect) {
    return chalk.dim(
      "↑↓ Navigate • Space Toggle • a Toggle all • i Invert • Enter Confirm • Ctrl+C Quit",
    );
  }
  return chalk.dim("↑↓ Navigate • Type to filter • Enter Select • Ctrl+C Quit");
}

type Step =
  | "search"
  | "selectRepo"
  | "selectFile"
  | "outputDir"
  | "download"
  | "quit";

interface State {
  query?: string;
  models?: hub.ModelEntry[];
  selectedRepo?: string;
  files?: any[];
  weightFiles?: any[];
  selectedFile?: string;
  selectedFiles?: string[];
  outDir?: string;
}

async function stepSearch(state: State): Promise<Step> {
  console.log(chalk.dim("\n" + getNavigationHint()));

  const { query } = await inquirer.prompt<{ query: string }>([
    {
      type: "input",
      name: "query",
      message: "Search models on HuggingFace:",
      validate: (v) => (v.trim().length ? true : "Enter a search query"),
    },
  ]);

  state.query = query;

  const spinner = ora(`Searching for "${query}"...`).start();

  const searchLimit = config.getSearchLimit();
  const models: hub.ModelEntry[] = [];
  try {
    for await (const m of hub.listModels({
      search: { query },
      limit: searchLimit,
    })) {
      models.push(m);
    }
    spinner.succeed(`Found ${models.length} models.`);
  } catch (err) {
    spinner.fail("Search failed.");
    console.error(err);
    return "quit";
  }

  if (models.length === 0) {
    console.log(chalk.yellow("No models found."));
    return "search";
  }

  state.models = models;
  return "selectRepo";
}

async function stepSelectRepo(state: State): Promise<Step> {
  if (!state.models) return "search";

  console.log(chalk.dim("\n" + getNavigationHint()));
  console.log(chalk.dim(`Found ${state.models.length} models\n`));

  const selectedRepo = await autocomplete({
    message: "Select a repository:",
    pageSize: 20,
    source: async (input: string | undefined) => {
      const search = (input || "").toLowerCase();
      return state
        .models!.map((m, idx) => ({
          name: `${chalk.cyan((idx + 1).toString().padStart(2))}. ${m.name} ${chalk.dim(`(likes: ${m.likes ?? 0})`)}`,
          value: m.name,
          description: m.name,
        }))
        .filter((choice) => choice.description.toLowerCase().includes(search));
    },
  });

  state.selectedRepo = selectedRepo;

  const token = config.getToken();
  const infoSpinner = ora(`Fetching files for ${selectedRepo}...`).start();
  try {
    await hub.modelInfo({
      name: selectedRepo,
      accessToken: token,
    });
    infoSpinner.succeed("Got model info.");
  } catch (err) {
    infoSpinner.fail("Failed to fetch model info.");
    console.error(err);
    return "selectRepo";
  }

  const files = [];
  for await (const f of hub.listFiles({ repo: selectedRepo })) {
    files.push(f);
  }

  const weightFiles = files.filter((f: any) =>
    f.path.match(/\.(gguf|safetensors|bin)$/i),
  );

  if (weightFiles.length === 0) {
    console.log(
      chalk.yellow("No weight files found (.gguf, .safetensors, .bin)."),
    );
    return "selectRepo";
  }

  state.files = files;
  state.weightFiles = weightFiles;
  return "selectFile";
}

async function stepSelectFile(state: State): Promise<Step> {
  if (!state.weightFiles) return "selectRepo";

  console.log(chalk.dim("\n" + getNavigationHint(true)));
  console.log(chalk.dim(`Found ${state.weightFiles.length} files\n`));

  const choices = state.weightFiles.map((f: any, idx: number) => {
    const quant = f.path.match(/[qf][0-9]+[_a-z0-9]*/i)?.[0] ?? "unknown";
    return {
      name: `${quant.padEnd(12)} ${formatBytes(f.size).padEnd(10)} ${chalk.dim(f.path)}`,
      value: f.path,
    };
  });

  const { selectedFiles } = await inquirer.prompt<{ selectedFiles: string[] }>([
    {
      type: "checkbox",
      name: "selectedFiles",
      message: "Select files to download (Space to select, Enter to confirm):",
      pageSize: 20,
      choices,
      loop: false,
      validate: (answer: string[]) => {
        if (answer.length === 0) {
          return "You must select at least one file.";
        }
        return true;
      },
    },
  ]);

  state.selectedFiles = selectedFiles;
  return "outputDir";
}

async function stepOutputDir(state: State): Promise<Step> {
  const defaultDir = config.getDefaultDownloadDir();

  console.log(chalk.dim("\n" + getNavigationHint()));

  if (state.selectedFiles && state.selectedFiles.length > 1) {
    console.log(chalk.dim(`Selected ${state.selectedFiles.length} files\n`));
  }

  const { action } = await inquirer.prompt<{ action: string }>([
    {
      type: "input",
      name: "action",
      message: "Download directory:",
      default: defaultDir,
    },
  ]);

  state.outDir = action.trim();
  return "download";
}

async function stepDownload(state: State): Promise<Step> {
  if (!state.selectedFiles || !state.selectedRepo || !state.outDir) {
    return "search";
  }

  const token = config.getToken();
  const storageStrategy = config.getStorageStrategy();
  const totalFiles = state.selectedFiles.length;
  let successCount = 0;
  let failedFiles: string[] = [];

  // Determine the target directory based on storage strategy
  let targetDir = state.outDir;
  if (storageStrategy === "organized" && state.selectedRepo) {
    // Split repo into owner/model (e.g., "meta-llama/Llama-3.2-1B")
    const [owner, ...modelParts] = state.selectedRepo.split("/");
    const modelName = modelParts.join("/");
    targetDir = path.join(state.outDir, owner, modelName);
  }

  // Create target directory
  try {
    fs.mkdirSync(targetDir, { recursive: true });
  } catch (err) {
    console.error(chalk.red(`Failed to create directory: ${targetDir}`));
    console.error(err);
    return "outputDir";
  }

  console.log(
    chalk.dim(
      `\nStorage: ${storageStrategy === "organized" ? "Organized by owner/model" : "Flat"}`,
    ),
  );
  console.log(chalk.dim(`Target: ${targetDir}\n`));

  // Setup Ctrl+C handler for downloads
  let downloadAborted = false;
  let currentDownloadTarget: string | null = null;
  const abortHandler = () => {
    downloadAborted = true;
    console.log(chalk.yellow("\n\nDownload cancelled by user."));

    // Clean up partial file if it exists
    if (currentDownloadTarget && fs.existsSync(currentDownloadTarget)) {
      try {
        fs.unlinkSync(currentDownloadTarget);
        console.log(
          chalk.dim(`Removed partial file: ${currentDownloadTarget}`),
        );
      } catch (err) {
        console.log(chalk.dim(`Could not remove partial file: ${err}`));
      }
    }

    // Clean up empty directories (but not if they contain other files)
    if (storageStrategy === "organized" && targetDir) {
      try {
        // Check if directory is empty
        const files = fs.readdirSync(targetDir);
        if (files.length === 0) {
          fs.rmdirSync(targetDir);
          console.log(chalk.dim(`Removed empty directory: ${targetDir}`));

          // Try to remove parent (owner) directory if also empty
          const parentDir = path.dirname(targetDir);
          if (parentDir !== state.outDir) {
            const parentFiles = fs.readdirSync(parentDir);
            if (parentFiles.length === 0) {
              fs.rmdirSync(parentDir);
              console.log(chalk.dim(`Removed empty directory: ${parentDir}`));
            }
          }
        }
      } catch (err) {
        // Ignore errors - directory might not exist or not be empty
      }
    }

    process.exit(0);
  };
  process.on("SIGINT", abortHandler);

  for (let i = 0; i < state.selectedFiles.length; i++) {
    if (downloadAborted) break;
    const selectedFile = state.selectedFiles[i];
    const target = path.join(targetDir, path.basename(selectedFile));
    currentDownloadTarget = target;

    console.log(
      chalk.cyan(`\n[${i + 1}/${totalFiles}] ${path.basename(selectedFile)}`),
    );

    // Check if file already exists
    if (fs.existsSync(target)) {
      const stats = fs.statSync(target);
      console.log(
        chalk.yellow(`\n⚠ File already exists (${formatBytes(stats.size)})`),
      );
      console.log(chalk.dim(`  ${target}\n`));

      const { action } = await inquirer.prompt<{ action: string }>([
        {
          type: "list",
          name: "action",
          message: "What would you like to do?",
          choices: [
            { name: "Skip this file", value: "skip" },
            { name: "Overwrite", value: "overwrite" },
            { name: "Cancel all downloads", value: "cancel" },
          ],
          loop: false,
        },
      ]);

      if (action === "cancel") {
        console.log(chalk.yellow("Downloads cancelled by user."));
        downloadAborted = true;
        break;
      }

      if (action === "skip") {
        console.log(chalk.dim("Skipping file.\n"));
        successCount++;
        currentDownloadTarget = null;
        continue;
      }

      // If overwrite, delete the existing file
      if (action === "overwrite") {
        try {
          fs.unlinkSync(target);
          console.log(chalk.dim("Overwriting existing file...\n"));
        } catch (err) {
          console.log(chalk.red(`Failed to delete existing file: ${err}`));
          failedFiles.push(selectedFile);
          currentDownloadTarget = null;
          continue;
        }
      }
    }

    try {
      // Get file info to know the size
      const fileInfo = state.weightFiles!.find(
        (f: any) => f.path === selectedFile,
      );
      const fileSize = fileInfo?.size || 0;

      // Create progress bar with custom ETA
      let startTime = Date.now();
      let lastUpdate = Date.now();
      let downloadedMB = 0;

      const progressBar = new cliProgress.SingleBar({
        format: `${chalk.cyan("{bar}")} {percentage}% | {downloaded}/{total} MB | {speed} MB/s | ETA: {etaTime}`,
        barCompleteChar: "\u2588",
        barIncompleteChar: "\u2591",
        hideCursor: true,
      });

      if (fileSize > 0) {
        progressBar.start(Math.ceil(fileSize / (1024 * 1024)), 0, {
          downloaded: 0,
          total: Math.ceil(fileSize / (1024 * 1024)),
          speed: "0.0",
          etaTime: "calculating...",
        });
      }

      // Construct HuggingFace CDN download URL
      const url = `https://huggingface.co/${state.selectedRepo}/resolve/main/${selectedFile}`;

      // Download with progress
      await new Promise<void>((resolve, reject) => {
        if (downloadAborted) {
          resolve();
          return;
        }

        const protocol = url.startsWith("https") ? https : http;
        const headers: any = {};
        if (token) {
          headers["Authorization"] = `Bearer ${token}`;
        }

        const request = protocol.get(url, { headers }, (response) => {
          if (response.statusCode === 302 || response.statusCode === 301) {
            // Follow redirect
            const redirectUrl = response.headers.location!;
            const redirectProtocol = redirectUrl.startsWith("https")
              ? https
              : http;

            redirectProtocol
              .get(redirectUrl, (redirectResponse) => {
                const fileStream = fs.createWriteStream(target);
                let downloadedBytes = 0;

                redirectResponse.on("data", (chunk) => {
                  downloadedBytes += chunk.length;
                  downloadedMB = downloadedBytes / (1024 * 1024); // Use precise float, not ceil

                  if (fileSize > 0) {
                    const now = Date.now();
                    const elapsed = (now - startTime) / 1000; // seconds
                    const totalMB = fileSize / (1024 * 1024); // Use precise float
                    const remainingMB = totalMB - downloadedMB;

                    let etaTime = "calculating...";
                    let speedDisplay = "0.0";

                    if (elapsed > 2 && downloadedMB > 5) {
                      const speed = downloadedMB / elapsed; // MB per second

                      if (speed > 0 && isFinite(speed)) {
                        speedDisplay = speed.toFixed(1);
                        const remainingSeconds = remainingMB / speed;

                        if (
                          isFinite(remainingSeconds) &&
                          remainingSeconds > 0 &&
                          remainingSeconds < 999999
                        ) {
                          const minutes = Math.floor(remainingSeconds / 60);
                          const seconds = Math.floor(remainingSeconds % 60);
                          etaTime = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
                        }
                      }
                    }

                    progressBar.update(Math.ceil(downloadedMB), {
                      downloaded: Math.ceil(downloadedMB),
                      total: Math.ceil(totalMB),
                      speed: speedDisplay,
                      etaTime: etaTime,
                    });
                  }
                });

                redirectResponse.pipe(fileStream);

                fileStream.on("finish", () => {
                  fileStream.close();
                  if (fileSize > 0) {
                    progressBar.stop();
                  }
                  resolve();
                });

                fileStream.on("error", (err) => {
                  if (fileSize > 0) {
                    progressBar.stop();
                  }
                  fs.unlinkSync(target);
                  reject(err);
                });
              })
              .on("error", (err) => {
                if (fileSize > 0) {
                  progressBar.stop();
                }
                reject(err);
              });
          } else {
            const fileStream = fs.createWriteStream(target);
            let downloadedBytes = 0;

            response.on("data", (chunk) => {
              downloadedBytes += chunk.length;
              downloadedMB = downloadedBytes / (1024 * 1024); // Use precise float, not ceil

              if (fileSize > 0) {
                const now = Date.now();
                const elapsed = (now - startTime) / 1000; // seconds
                const totalMB = fileSize / (1024 * 1024); // Use precise float
                const remainingMB = totalMB - downloadedMB;

                let etaTime = "calculating...";
                let speedDisplay = "0.0";

                if (elapsed > 2 && downloadedMB > 5) {
                  const speed = downloadedMB / elapsed; // MB per second

                  if (speed > 0 && isFinite(speed)) {
                    speedDisplay = speed.toFixed(1);
                    const remainingSeconds = remainingMB / speed;

                    if (
                      isFinite(remainingSeconds) &&
                      remainingSeconds > 0 &&
                      remainingSeconds < 999999
                    ) {
                      const minutes = Math.floor(remainingSeconds / 60);
                      const seconds = Math.floor(remainingSeconds % 60);
                      etaTime = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
                    }
                  }
                }

                progressBar.update(Math.ceil(downloadedMB), {
                  downloaded: Math.ceil(downloadedMB),
                  total: Math.ceil(totalMB),
                  speed: speedDisplay,
                  etaTime: etaTime,
                });
              }
            });

            response.pipe(fileStream);

            fileStream.on("finish", () => {
              fileStream.close();
              if (fileSize > 0) {
                progressBar.stop();
              }
              resolve();
            });

            fileStream.on("error", (err) => {
              if (fileSize > 0) {
                progressBar.stop();
              }
              fs.unlinkSync(target);
              reject(err);
            });
          }
        });

        request.on("error", (err) => {
          if (fileSize > 0) {
            progressBar.stop();
          }
          reject(err);
        });
      });

      console.log(chalk.green(`✓ Saved → ${target}`));
      successCount++;
      currentDownloadTarget = null;
    } catch (err) {
      console.log(chalk.red(`✗ Download failed: ${selectedFile}`));
      console.error(err);
      failedFiles.push(selectedFile);

      // Clean up partial file on failure
      if (fs.existsSync(target)) {
        try {
          fs.unlinkSync(target);
        } catch (unlinkErr) {
          // Ignore cleanup errors
        }
      }
      currentDownloadTarget = null;
    }
  }

  // Remove signal handler after downloads complete
  process.off("SIGINT", abortHandler);

  if (downloadAborted) {
    return "quit";
  }

  console.log(
    chalk.green(
      `\n✓ Successfully downloaded ${successCount} of ${totalFiles} files`,
    ),
  );

  if (failedFiles.length > 0) {
    console.log(
      chalk.red(`\n✗ Failed to download ${failedFiles.length} files:`),
    );
    failedFiles.forEach((file) => console.log(chalk.red(`  - ${file}`)));

    const { retry } = await inquirer.prompt<{ retry: boolean }>([
      {
        type: "confirm",
        name: "retry",
        message: "Would you like to retry the failed downloads?",
        default: true,
      },
    ]);

    if (retry) {
      state.selectedFiles = failedFiles;
      return "download";
    }
  }

  return "quit";
}

async function main() {
  // Handle help flag
  if (process.argv[2] === "--help" || process.argv[2] === "-h") {
    console.log(chalk.yellow(logo));
    console.log(`
${chalk.cyan.bold("🤗 HuggingFace Model Downloader")}

${chalk.bold("USAGE:")}
  hfget [COMMAND]

${chalk.bold("COMMANDS:")}
  (none)      Run interactive downloader
  init        Create a new config file
  config      Show config location and settings
  --help, -h  Show this help message
  --version   Show version number

${chalk.bold("CONFIGURATION:")}
  Config file: ~/.config/hfget/config.json

${chalk.bold("EXAMPLES:")}
  hfget              Start interactive download
  hfget init         Initialize config file
  hfget config       View current configuration
`);
    process.exit(0);
  }

  // Handle version flag
  if (process.argv[2] === "--version" || process.argv[2] === "-v") {
    console.log(packageJson.version);
    process.exit(0);
  }

  // Handle config init command
  if (process.argv[2] === "init") {
    try {
      config.initConfig();
      const configPath = config.getConfigPath();
      console.log(chalk.green(`✓ Config file created at: ${configPath}`));
      console.log(
        chalk.dim("\nEdit this file to set your HF_TOKEN and preferences."),
      );
      console.log(chalk.dim("Example config:"));
      console.log(
        chalk.cyan(
          JSON.stringify(
            {
              hfToken: "hf_xxxxxxxxxxxxx",
              defaultDownloadDir: "/opt/llms/models",
              defaultSearchLimit: 20,
              storageStrategy: "organized",
            },
            null,
            2,
          ),
        ),
      );
      console.log(
        chalk.dim(
          '\nStorage strategies:\n  - "organized" (default): Store in owner/model subdirectories\n  - "flat": Store all files directly in download directory',
        ),
      );
      process.exit(0);
    } catch (err: any) {
      console.error(chalk.red(`✗ ${err.message}`));
      process.exit(1);
    }
  }

  // Handle config path command
  if (process.argv[2] === "config") {
    const configPath = config.getConfigPath();
    const exists = fs.existsSync(configPath);
    console.log(chalk.cyan(`Config file location: ${configPath}`));
    if (exists) {
      console.log(chalk.green("✓ Config file exists"));
      const cfg = config.loadConfig();
      console.log(chalk.dim("\nCurrent config:"));
      console.log(chalk.cyan(JSON.stringify(cfg, null, 2)));
    } else {
      console.log(chalk.yellow("⚠ Config file does not exist"));
      console.log(chalk.dim(`Run 'hfget init' to create it`));
    }
    process.exit(0);
  }

  const token = config.getToken();
  if (!token) {
    console.error(chalk.red("❌ HF_TOKEN not set."));
    console.error(chalk.dim("   Option 1: Set environment variable"));
    console.error("      export HF_TOKEN=hf_xxxxxxxxxxxxx");
    console.error(chalk.dim("   Option 2: Set in config file"));
    console.error(
      `      Run 'hfget init' to create config at ${config.getConfigPath()}`,
    );
    process.exit(1);
  }

  console.log(chalk.yellow(logo));
  console.log(chalk.cyan.bold("🤗 HuggingFace Model Downloader"));
  console.log(chalk.dim(`Config: ${config.getConfigPath()}`));

  const state: State = {};
  let currentStep: Step = "search";

  while (currentStep !== "quit") {
    try {
      switch (currentStep) {
        case "search":
          currentStep = await stepSearch(state);
          break;
        case "selectRepo":
          currentStep = await stepSelectRepo(state);
          break;
        case "selectFile":
          currentStep = await stepSelectFile(state);
          break;
        case "outputDir":
          currentStep = await stepOutputDir(state);
          break;
        case "download":
          currentStep = await stepDownload(state);
          break;
        default:
          currentStep = "quit";
      }
    } catch (err: any) {
      if (err.isTtyError) {
        console.error(
          chalk.red("Prompt couldn't be rendered in this environment"),
        );
        process.exit(1);
      } else if (err.name === "ExitPromptError") {
        // User pressed Ctrl+C
        console.log(chalk.yellow("\n\nGoodbye! 👋"));
        process.exit(0);
      } else {
        console.error(chalk.red("An error occurred:"), err);
        process.exit(1);
      }
    }
  }

  console.log(chalk.green("\n✨ Done!\n"));
}

main();
