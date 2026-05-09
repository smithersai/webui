# smithers-webui

> A skill + CLI that lets agents render **React + MDX in a browser window** — for plans, diffs, decisions, dashboards, anywhere markdown-in-terminal goes lossy.

```sh
smithers-webui render << 'MDX'
import { Card, Badge } from 'smithers-webui/ui'

# Refactor plan

| Phase | Effort | Risk |
| ----- | ------ | ---- |
| 1 | 1 day | <Badge variant="success">low</Badge> |
| 2 | 3 days | <Badge variant="warn">medium</Badge> |

<Card>Approve when ready.</Card>
MDX
```

A chrome-less browser window opens with the rendered plan. The MDX is the agent's *message* to the user — piped, ephemeral, never a temp file. **One tool call.**

## Why

Agents produce a lot of structured output: plans, comparisons, diffs, decision trees, dashboards. Markdown in a terminal renders some of it. Lists work. Tables get truncated. There's no color-coded risk badge, no side-by-side diff, no "click to approve". The user reads the wall of text once and asks the agent to re-explain.

`smithers-webui` is the smallest possible bridge between *"agent has a thought"* and *"user sees that thought as a real web UI."* The agent writes MDX content + an optional React layout, runs one command, and the user gets a real browser window. No dev server config, no React boilerplate, no per-project install.

We've used it ourselves to render:

- a 15-card timeline of Southeast Asia's history, with color-coded eras and embedded GFM tables for colonial-era dates
- this project's [Rust migration plan](./SKILL.md) — a hero recommendation card, a colour-coded risk table, a `<details>` collapsible for the deep-dive section

Both took a single Bash tool call from the agent.

## How it works

```
agent ─┬─ smithers-webui render ───── Bun.serve ──── Chrome --app=
       │           │
       │           ├── @mdx-js/mdx (+ remark-gfm)   → React ESM module
       │           ├── Bun.build (optional App.tsx) → bundled ESM
       │           └── inlined runtime modules      → smithers-webui/{ui,runtime}
       │                       ↓
       │           browser resolves bare imports via importmap:
       │           react / react-dom / smithers-webui/* → esm.sh + local
       └── streams JSONL events ──────────────── stdout
           {served, opened, signal, closed}
```

No bundle step at install time. No build server. Tailwind v4 via CDN. React via esm.sh. The trick is an importmap in the served HTML that resolves `import { Card } from 'smithers-webui/ui'` to a small inlined module, and `react` to esm.sh — so MDX-with-imports just works in the browser without any client-side bundling.

## Install

```sh
bun add -D smithers-webui
# or run without installing
bunx smithers-webui --help
```

Requires **Bun ≥ 1.3** today. (`Bun.serve` and `Bun.build` are the only Bun-specific dependencies; pure-Node support via `node:http` + `esbuild` is on the roadmap — see [v0.4](#roadmap).)

## Usage

### Quickstart — pipe MDX via stdin

The canonical pattern. Generate the MDX inline, pipe it, get a window.

```sh
smithers-webui render << 'MDX'
# Refactor plan

| Phase | Effort | Risk |
| ----- | ------ | ---- |
| 1     | 1 day  | low  |
| 2     | 3 days | med  |
| 3     | 1 hour | low  |
MDX
```

A chrome-less window opens with the MDX rendered inside a Tailwind `prose` container. No app code required, no temp file written.

### How agents actually invoke it

`render` is long-running — it stays alive until the user closes the window. Most agent harnesses (Claude Code, Codex CLI, Cursor) start a fresh shell per Bash tool call and SIGHUP background jobs when that shell exits, so plain `… &` is dead by the time the user clicks the URL. Use `nohup`:

```sh
nohup smithers-webui render --format jsonl > /tmp/smithers.log 2>&1 << 'MDX' &
# Refactor plan
…
MDX

head -n 1 /tmp/smithers.log
# {"type":"chunk","data":{"event":"served","url":"http://127.0.0.1:54321"}}
```

Then echo the URL back to the user.

### Custom layout — pipe MDX, pass an App

When a default prose container isn't enough, supply an `App.tsx` separately.

```tsx
// app/App.tsx
import { Card, Button } from 'smithers-webui/ui'
type Mdx = React.ComponentType
export default function App({ mdx }: { mdx: Mdx[] }) {
  const Plan = mdx[0]
  return (
    <main className="mx-auto max-w-3xl py-12">
      <Card>{Plan ? <Plan /> : null}</Card>
      <Button onClick={() => window.close()}>Approve</Button>
    </main>
  )
}
```

```sh
smithers-webui render --app app/App.tsx << 'MDX'
# Refactor plan
…
MDX
```

Piped MDX is compiled and passed to the App as `mdx[0]`. Content stays in the heredoc; `App.tsx` is layout only.

### Rendering an MDX file already on disk

When the file existed before the agent ran (e.g. `docs/plan.mdx` checked into the repo):

```sh
smithers-webui render --content docs/plan.mdx
```

`--content` is **not** for "I'm an agent and want to render some MDX I just generated" — pipe stdin instead.

### Why stdin first

| Pattern                                          | Tool calls | Temp files | Hidden state |
| ------------------------------------------------ | ---------- | ---------- | ------------ |
| `Write tmp.mdx` then `render --content tmp.mdx`  | 2          | 1          | yes          |
| Pipe via heredoc in one Bash call                | **1**      | **0**      | **no**       |

Agents pay for tool calls in latency and tokens; users pay for temp files in clutter and confusion. Stdin removes both.

## CLI

```
smithers-webui render [options]
  Reads MDX from stdin if piped; --content is the alternate.

Options:
  --content <path>     MDX file already on disk. Repeatable. Optional.
  --app <path>         Path to a .tsx layout component. Optional.
  --port <n>           Port to serve on (0 = random free). Default: 0.
  --host <host>        Host to bind. Default: 127.0.0.1.
  --no-open            Do not auto-open a browser. Just serve.
  --browser <name>     chrome | edge | brave | firefox | default. Default: chrome.
  --window-size <wxh>  e.g. 900x700. Default: 1100x800.
  --title <text>       Window title. Default: derived from first MDX heading.

Built-in (from incur):
  --help, --version, --llms, --json, --mcp, --schema
  --format <toon|json|yaml|md|jsonl>
  skills add           Install agent skill files for Claude / Codex / Cursor
  mcp add              Register as MCP server
```

### Streaming events

`render` is long-running and streams events to stdout (TOON by default, JSONL with `--format jsonl`):

```jsonl
{"event":"served","url":"http://127.0.0.1:54321","port":54321}
{"event":"opened","browser":"…/Google Chrome"}
{"event":"signal","name":"approve","payload":{"plan":"A"}}
{"event":"closed","reason":"window"}
```

Exit codes: `0` on clean window close, `130` on Ctrl-C.

## For agents — Claude, Codex, anyone

`smithers-webui` is built to be invoked by an agent. The shipped [`SKILL.md`](./SKILL.md) (installed via `smithers-webui skills add`) tells the agent the contract:

1. **Pipe MDX via stdin in one tool call.** Don't `Write` a temp file first.
2. **Always use `nohup`** for backgrounded renders — agent shells SIGHUP `&` jobs on exit, killing the server before the user clicks the URL.
3. **Content lives in MDX, layout in `App.tsx`.** Never inline prose into TSX.
4. **Use `smithers-webui/ui` components and Tailwind utilities.** Don't pull in another component library; don't write `<style>` blocks.
5. **Echo the served URL back to the user** so they can re-open or share it.

For full instructions, see [SKILL.md](./SKILL.md).

### MCP

```sh
smithers-webui mcp add
```

Registers `smithers-webui` as an MCP server with Claude Code, Cursor, Amp. The `render` command becomes a callable tool; MDX content is a parameter. Comes free from [incur](https://github.com/wevm/incur).

## Components shipped

`smithers-webui/ui` ships shadcn-style primitives — small, opinionated, no design-system buy-in. Today:

| Component | Purpose                                            |
| --------- | -------------------------------------------------- |
| `Button`  | Primary / secondary / ghost                        |
| `Card`    | Bordered container with padding                    |
| `Badge`   | Status pill (info / success / warn / error / neutral) |

On the roadmap: `Table`, `Tabs`, `Diff`, `Code`. (Until then, GFM tables and fenced code blocks render fine via the default `prose` styling.)

All accept a `className` prop. Imported from MDX:

```mdx
import { Button, Card, Badge } from 'smithers-webui/ui'
```

## Bidirectional signals

The window can signal back to the agent:

```mdx
import { signal } from 'smithers-webui/runtime'
import { Button } from 'smithers-webui/ui'

<Button onClick={() => signal('approve', { confirmed: true })}>Approve</Button>
```

The agent sees a `signal` event in its stdout stream:

```json
{"event":"signal","name":"approve","payload":{"confirmed":true}}
```

Use this for approval flows, multi-option pickers, and form submissions where the user's choice should resume the agent's reasoning. The wire is HTTP POST today; full WebSocket round-trip with state is on the roadmap (v0.2 polish).

## Use cases

What we've actually used it for, and what agents tend to reach for it for:

- **Plan presentation** — render the plan as a real document with sortable tables, color-coded risk badges, and approval buttons. The agent's "let me show you the plan" goes from a wall of bulleted text to a scannable page.
- **Decision gate** — show options with Approve/Reject buttons; agent waits for the `signal` event to resume.
- **Multi-option selector** — render N variants in cards or tabs; user picks one, the choice streams back as a signal.
- **Test / lint report** — sortable failure list grouped by file, expandable stack traces, severity badges.
- **Diff review** — side-by-side before/after for a refactor with click-to-approve.
- **Architecture explainer** — long MDX prose with embedded code blocks and a diagram.
- **Migration progress** — phases as cards with live status badges; agent updates by re-rendering.
- **Long-form briefings** — a 15-card timeline of historical events; the user reads it like a webpage instead of scrolling a chat.

## Roadmap

- **v0.1** — `render`, stdin pipe, Tailwind + shadcn primitives, Chrome `--app=` window, agent skill, MCP. ✅ shipped
- **v0.2** — full WebSocket signal round-trip; richer `signal()` wire (today is HTTP POST; need bidirectional state).
- **v0.3** — `--watch` with HMR for design iteration.
- **v0.4** — drop the Bun runtime requirement (`Bun.build` → `esbuild`, `Bun.serve` → `node:http` + `ws`). After this, `npx` from a clean Node-only machine works.
- **v0.5** — ship `Table`, `Tabs`, `Diff`, `Code` in `smithers-webui/ui`.
- **v0.6** — `--persist` mode for durable artifacts under `.smithers/webui/<session>/`, so the URL survives an agent session.
- **v0.7** — bind [webui-dev/webui](https://github.com/webui-dev/webui) C lib for native cross-platform app windows + menus, replacing the Chrome `--app=` shim.

## Acknowledgements

- [incur](https://github.com/wevm/incur) — the CLI framework. Most of the polish (MCP, skill discovery, TOON output, streaming, `--llms`) comes free.
- [@mdx-js/mdx](https://github.com/mdx-js/mdx) and [remark-gfm](https://github.com/remarkjs/remark-gfm) — the MDX compiler and the table support.
- [Tailwind CSS](https://tailwindcss.com) — utility-first styling, loaded from CDN with the typography plugin.
- [shadcn/ui](https://ui.shadcn.com) — the design vocabulary the shipped components borrow from.
- [webui-dev/webui](https://github.com/webui-dev/webui) — the inspiration for "browser-as-GUI". We use Chrome `--app=` mode today; may bind the C library directly in v0.7.

## License

MIT
