---
name: smithers-webui
description: Render rich React + MDX UIs in a browser window for the user. Pipe MDX via stdin in a single tool call — no temp files. Use when presenting plans, diffs, tables, comparisons, dashboards, or anything where markdown-in-terminal would be lossy.
command: smithers-webui
---

# smithers-webui

Render React + MDX in a browser window. The MDX is the agent's *message* to the user — ephemeral, generated inline, piped over stdin in a single tool call.

## When to use

Use `smithers-webui` when the user benefits from a real UI:

- **Plans** with phases, effort, risk — render as a table, not a bulleted list
- **Diffs** — render side-by-side, not as `+`/`-` text
- **Comparisons** — multiple options as tabs the user can flip between
- **Dashboards** — sortable tables, expandable rows, color-coded status
- **Decision points** — buttons the user can click, signaling back to you
- **Long structured documents** — MDX with prose, code blocks, embedded components

Do NOT use it for:

- Single-line answers, status updates, or short prose (use the terminal)
- Code edits (use Edit/Write directly)
- File listings (use the terminal)

## The one rule: pipe MDX via stdin. Do not write a file first.

This is the canonical invocation:

```sh
nohup smithers-webui render --format jsonl > /tmp/smithers.log 2>&1 << 'MDX' &
# Refactor plan

| Phase | Effort | Risk |
| ----- | ------ | ---- |
| 1     | 1 day  | low  |
| 2     | 3 days | med  |
MDX
```

**Do not** call `Write` to put the MDX on disk and then invoke `smithers-webui render --content path.mdx`. That doubles your tool calls, leaves a junk file behind, and hides the content from the user. The MDX is your *message*, not a build artifact — keep it in the same tool call as the render.

`--content path.mdx` exists only for the case where the MDX *was already on disk before the agent started* (e.g. the user committed `docs/plan.mdx` and asked you to render it).

## Background invocation pattern

`render` is long-running — it stays alive until the user closes the browser window. Always run it in the background, redirect output, **and prefix with `nohup`** so it survives the shell that your tool call ran in:

```sh
nohup smithers-webui render --format jsonl > /tmp/smithers-webui.log 2>&1 << 'MDX' &
# (your MDX here)
MDX
```

### Why `nohup`?

Most agent harnesses (Claude Code, Codex CLI, Cursor, etc.) start a fresh shell for each Bash tool call and SIGHUP all background jobs when that shell exits. Plain `… &` is dead the moment your tool call returns. `nohup` makes the render process ignore SIGHUP so it survives the shell's exit and stays alive until the user closes the browser window. **Always include `nohup`.** Without it, the user clicks the URL you printed and gets `ERR_CONNECTION_REFUSED`.

After it spawns, peek at the log to grab the URL:

```sh
head -n 1 /tmp/smithers-webui.log
# {"type":"chunk","data":{"event":"served","url":"http://127.0.0.1:54321","port":54321}}
```

Then tell the user: _"I've opened a window at http://127.0.0.1:54321 with the plan."_ — see [Echo the URL back](#echo-the-url-back).

Don't sit blocked waiting for the window to close. After spawning, continue with whatever follow-up makes sense. When the user closes the window, the process exits cleanly.

## Authoring rules

### All content goes in the MDX heredoc

Prose, headings, tables, paragraphs — all of it lives in the MDX you pipe. Layout (centered container, app shell, custom widgets) is the only thing that may live in a `.tsx` file passed via `--app`.

### Components — use `smithers-webui/ui` from inside MDX

MDX supports `import` statements. Pull components from `smithers-webui/ui`:

```sh
nohup smithers-webui render --format jsonl > /tmp/smithers.log 2>&1 << 'MDX' &
import { Card, Badge, Button } from 'smithers-webui/ui'

# Refactor plan

<Card>
  ## Phase 1 — Extract auth middleware

  Effort: 1 day &nbsp; <Badge variant="success">low risk</Badge>

  Pure code move into a new package.
</Card>

<Card>
  ## Phase 2 — Migrate sessions to Postgres

  Effort: 3 days &nbsp; <Badge variant="warn">medium risk</Badge>

  Needs a migration window.
</Card>
MDX
```

Available components: `Button`, `Card`, `Badge`. Don't pull in another component library.

### Styling — Tailwind utility classes only

Tailwind v4 + the typography plugin are loaded automatically. Use `className="..."`. Do **not** write `<style>` blocks or import a `.css` file.

### Signals — when you need user input

If you want the user to make a choice that resumes your reasoning, emit a signal from a button:

```sh
nohup smithers-webui render --format jsonl > /tmp/smithers.log 2>&1 << 'MDX' &
import { Button } from 'smithers-webui/ui'
import { signal } from 'smithers-webui/runtime'

# Pick a plan

<Button onClick={() => signal('approve', { plan: 'A' })}>Approve plan A</Button>
<Button onClick={() => signal('approve', { plan: 'B' })}>Approve plan B</Button>
MDX
```

Watch the log for `event: signal, name: approve, payload: …` to learn what the user picked, then resume.

## Echo the URL back

After spawning, your reply to the user must include the URL the window was opened at, e.g.:

> I've opened the plan at http://127.0.0.1:54321. Closing the window will let me know which option you picked.

This lets them re-open or share the URL.

## Examples — full invocations

### Plan with a table

```sh
nohup smithers-webui render --format jsonl > /tmp/smithers.log 2>&1 << 'MDX' &
# Refactor plan

| Phase | What | Effort | Risk |
| ----- | ---- | ------ | ---- |
| 1 | Extract auth middleware into a package | 1 day | low |
| 2 | Migrate sessions to Postgres | 3 days | medium |
| 3 | Drop the Redis dependency | 1 hour | low |

## Why now

The current middleware leaks session tokens through query params.
MDX
```

### Decision gate with approve / reject

```sh
nohup smithers-webui render --format jsonl > /tmp/smithers.log 2>&1 << 'MDX' &
import { Button, Card } from 'smithers-webui/ui'
import { signal } from 'smithers-webui/runtime'

# Run the migration?

<Card>
  - Tables affected: `sessions`, `users`
  - Estimated downtime: **30 seconds**
  - Rollback: drop the new columns

  <div className="mt-4 flex gap-2">
    <Button variant="secondary" onClick={() => signal('reject', {})}>Cancel</Button>
    <Button onClick={() => signal('approve', {})}>Run it</Button>
  </div>
</Card>
MDX
```

### Multi-option picker

```sh
nohup smithers-webui render --format jsonl > /tmp/smithers.log 2>&1 << 'MDX' &
import { Button, Card, Badge } from 'smithers-webui/ui'
import { signal } from 'smithers-webui/runtime'

# Pick a redirect strategy

<Card>
  ## Option A — 301 with rewrite map  <Badge variant="success">recommended</Badge>

  Permanent, cacheable, search engines pick it up.

  <Button onClick={() => signal('pick', { option: 'A' })}>Pick A</Button>
</Card>

<Card>
  ## Option B — 302 with feature flag

  Temporary; lets us flip back without a deploy.

  <Button onClick={() => signal('pick', { option: 'B' })}>Pick B</Button>
</Card>
MDX
```

## Failure modes to avoid

- **Writing the MDX to a file first.** Don't. Pipe via stdin in a single tool call.
- **Forgetting `nohup`.** Plain `… &` dies when your tool call's shell exits. Use `nohup … &`. Without it, the user gets `ERR_CONNECTION_REFUSED`.
- **Calling render foreground.** It blocks. Always run in the background with `&`.
- **Inlining content into TSX.** Don't. The MDX heredoc holds the content; `--app` is layout only.
- **Hand-rolling buttons / cards / tables.** Use `smithers-webui/ui`.
- **Importing a CSS framework.** Tailwind is already loaded.
- **Forgetting to tell the user the URL.** Always echo it back.
