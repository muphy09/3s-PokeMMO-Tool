# Telemetry integration

The desktop app reports anonymous install metrics to a lightweight HTTPS service. The
same service exposes aggregated install counts for the CLI tooling in
`tools/install-telemetry-stats.js`.

## Endpoints

- **Install POST endpoint:** `https://telemetry.pokemmo-tool.app/install`
- **Stats endpoint:** `https://telemetry.pokemmo-tool.app/stats`

Both endpoints accept JSON responses and support bearer authentication. When the
`POKEMMO_TOOL_TELEMETRY_KEY` environment variable is set the Electron app and CLI
utilities include it automatically using the `Authorization` header.

## Local environment configuration

A `.env.telemetry` file is checked into the repository root with the default endpoint
values. You can edit that file directly or copy its contents to a personal `.env`:

```bash
cp .env.telemetry .env
# edit the key if you have one
```

The stats script will try to load `.env.telemetry` first, then fall back to `.env` when
you run it from the project root:

```bash
node tools/install-telemetry-stats.js
```

To request JSON output you can use the `--json` flag:

```bash
node tools/install-telemetry-stats.js --json
```

If your deployment exposes a different stats path set
`POKEMMO_TOOL_TELEMETRY_STATS_URL` in the env file. When omitted, the CLI automatically
appends `/stats` to the POST endpoint.

When the telemetry API is unreachable the CLI falls back to GitHub release download
counts. The asset naming convention keeps the per-platform/per-version grouping intact.
Set `POKEMMO_TOOL_TELEMETRY_FALLBACK=none` to force the primary service or change the
fallback repository with `POKEMMO_TOOL_TELEMETRY_GITHUB_OWNER` and
`POKEMMO_TOOL_TELEMETRY_GITHUB_REPO`.

## Release automation

The GitHub Actions release workflow calls `scripts/write-telemetry-config.js` before
packaging. The script reads the telemetry secrets from the workflow environment and
generates `resources/telemetry.config.json`. The Electron main process loads this file at
runtime when the corresponding `POKEMMO_TOOL_TELEMETRY_*` variables are not already set,
which ensures production builds always ship with the real endpoint and token.

Populate the following repository secrets so the workflow can create the config file:

- `POKEMMO_TOOL_TELEMETRY_URL` (required)
- `POKEMMO_TOOL_TELEMETRY_KEY` or `POKEMMO_TOOL_TELEMETRY_TOKEN`
- `POKEMMO_TOOL_TELEMETRY_STATS_URL` (optional)
- `POKEMMO_TOOL_TELEMETRY_STATS_KEY` or `POKEMMO_TOOL_TELEMETRY_STATS_TOKEN`
