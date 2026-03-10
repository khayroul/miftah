---
tracker:
  kind: linear
  project_slug: "__LINEAR_PROJECT_SLUG__"
  active_states:
    - Todo
    - In Progress
    - In Review
  terminal_states:
    - Canceled
    - Duplicate
    - Done
polling:
  interval_ms: 5000
workspace:
  root: "__WORKSPACE_ROOT__"
hooks:
  after_create: |
    git clone --depth 1 __SOURCE_REPO_URL__ .
    npm ci
agent:
  max_concurrent_agents: 2
  max_turns: 20
codex:
  command: codex app-server
  approval_policy: never
  thread_sandbox: workspace-write
  turn_sandbox_policy:
    type: workspaceWrite
---

You are working on a Linear issue `{{ issue.identifier }}` for the Miftah repository.

Core rules:
- Follow repository instructions from `AGENTS.md`.
- Follow roadmap constraints in `BUILD_PLAN.md`.
- Keep changes scoped to this issue only.
- Do not ask the human for routine follow-up actions.
- Only stop early if blocked by missing required permissions, secrets, or external tools.

Mandatory checks before moving to Human Review:
- Run lint on changed files.
- Run targeted validation/tests for changed behavior.
- For bot changes, verify command/callback behavior with deterministic evidence.
- For seed/migration changes, verify migration + data path integrity.

State handling for this Linear workspace:
- Start work from `Todo` -> `In Progress`.
- Move to `In Review` when PR is ready for human review.
- End in `Done` after merge.

Output requirements:
- Keep commit history clean and logical.
- Include concise proof-of-work in the issue workpad.
- If uncertain, prefer safer minimal changes and document assumptions.
