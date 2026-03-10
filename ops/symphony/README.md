# Symphony For Miftah

This repo includes a ready template and helper scripts to run OpenAI Symphony against Linear issues for Miftah.

## Files

- `ops/symphony/WORKFLOW.template.md` — Miftah workflow template.
- `scripts/symphony/setup_symphony.sh` — clone + install + build Symphony (Elixir).
- `scripts/symphony/check_linear.sh` — verify Linear API key and list project slugs.
- `scripts/symphony/run_symphony.sh` — generate workflow and run Symphony.

## One-time setup

```bash
cd /Users/Executor/miftah
npm run symphony:setup
```

## Required env vars

```bash
export LINEAR_API_KEY='lin_api_...'
export LINEAR_PROJECT_SLUG='your-linear-project-slug'
```

You can also place these in `/Users/Executor/miftah/.env.local`.

Optional:

```bash
export SYMPHONY_DIR="$HOME/symphony"
export SYMPHONY_WORKSPACE_ROOT="$HOME/code/miftah-symphony-workspaces"
export SYMPHONY_SOURCE_REPO_URL='git@github.com:khayroul/miftah.git'
export SYMPHONY_PORT=4040
```

## Find your project slug quickly

```bash
npm run symphony:linear-check
```

## Run Symphony

```bash
npm run symphony:run
```

Dashboard:

- `http://localhost:${SYMPHONY_PORT:-4040}`

## Linear workflow states needed

Your Linear team/project workflow should include:

- `Todo`
- `In Progress`
- `In Review`
- `Done` (terminal)
