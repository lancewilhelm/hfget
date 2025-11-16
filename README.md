# hfget

A CLI tool for downloading models from HuggingFace with an interactive interface.

## Installation

```bash
npm install -g hfget
```

Or for development:

```bash
git clone <repo>
cd hfget
npm install
npm run build
npm link
```

## Quick Start

1. Initialize configuration:
```bash
hfget init
```

2. Edit `~/.config/hfget/config.json` and add your HuggingFace token:
```json
{
  "hfToken": "hf_xxxxxxxxxxxxx",
  "defaultDownloadDir": "/opt/llms/models",
  "defaultSearchLimit": 20,
  "storageStrategy": "organized"
}
```

3. Run the tool:
```bash
hfget
```

## Configuration

**Location:** `~/.config/hfget/config.json`

**Options:**

- `hfToken` - Your HuggingFace API token (get one at https://huggingface.co/settings/tokens)
- `defaultDownloadDir` - Default directory for downloaded models (default: `/opt/llms/models`)
- `defaultSearchLimit` - Maximum number of search results to fetch (default: `20`)
- `storageStrategy` - File organization method:
  - `"organized"` (default) - Store in `owner/model-name/` subdirectories
  - `"flat"` - Store all files directly in download directory

**View current config:**
```bash
hfget config
```

## Usage

Run `hfget` and follow the interactive prompts:

1. Search for models by name or keyword
2. Select a repository from filtered results
3. Select one or more files to download (use Space to toggle selection)
4. Specify download directory (or use default)
5. Download with real-time progress tracking

### Keyboard Shortcuts

**Model selection (autocomplete):**
- Type to filter results in real-time
- Arrow keys to navigate
- Enter to select

**File selection (multi-select):**
- Space - Toggle file selection
- a - Toggle all files
- i - Invert selection
- Enter - Confirm and proceed

**During download:**
- Ctrl+C - Cancel download (removes partial files)

**File conflicts:**
When a file already exists, you can choose to skip, overwrite, or cancel.

### Storage Organization

**Organized strategy** (default):
```
/opt/llms/models/
├── meta-llama/
│   └── Llama-3.2-1B/
│       ├── model-Q4_K_M.gguf
│       └── model-Q5_K_M.gguf
└── mistralai/
    └── Mistral-7B-v0.1/
        └── model-Q4_K_M.gguf
```

**Flat strategy:**
```
/opt/llms/models/
├── Llama-3.2-1B-Q4_K_M.gguf
├── Llama-3.2-1B-Q5_K_M.gguf
└── Mistral-7B-v0.1-Q4_K_M.gguf
```

## Features

- Interactive search with real-time filtering
- Multi-file selection for batch downloads
- Download progress bars with speed and ETA
- Configurable file organization
- Automatic cleanup of partial downloads on cancellation
- File conflict detection and resolution
- Support for GGUF, safetensors, and bin formats

## Requirements

- Node.js 16+
- HuggingFace account and API token

## Commands

- `hfget` - Run the interactive downloader
- `hfget init` - Create a new config file
- `hfget config` - Show config file location and current settings

## License

MIT