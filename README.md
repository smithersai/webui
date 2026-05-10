# smithers-webui

A skill + CLI that lets agents render **React + MDX in a browser window** — for plans, diffs, decisions, dashboards, anywhere markdown-in-terminal goes lossy.

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

A chrome-less browser window opens with the rendered plan. The MDX is the agent's *message* to the user — piped, ephemeral, never a temp file.

## Installation

> [!NOTE]
> smithers-webui is a skill for coding agents. Install at least one supported agent first:
>
> - Claude Code — install [Claude Code](https://claude.com/product/claude-code) and run `claude /login`
> - Codex CLI — install [Codex CLI](https://developers.openai.com/codex/cli) and run `codex login`

### Run without installing

```sh
npx smithers-webui --help
```

### Install the agent skill (Claude Code, Codex, etc. — auto-detected)

```sh
npx smithers-webui skills add
```

This copies `SKILL.md` into each detected agent's skills directory (e.g. `~/.claude/skills/smithers-webui/SKILL.md`). The agent will reach for the skill the next time you ask it to render a plan, diff, decision gate, dashboard, etc.

For project-scoped install (current directory only):

```sh
npx smithers-webui skills add --no-global
```

### Install globally for faster startup

```sh
npm i -g smithers-webui
```

After this `smithers-webui` is on `PATH`, so the agent invokes it directly instead of paying the `npx` startup tax on every render.

### Register as an MCP server instead

```sh
npx smithers-webui mcp add
```

Registers the CLI as an MCP server for Claude Code, Cursor, Amp. The `render` command becomes a callable tool with MDX content as a parameter.

## Some notes

Very early. Expect bugs. Bun ≥ 1.3 required (the Bun requirement goes away in a future release).

See [SKILL.md](./SKILL.md) for the full agent contract — what to put in MDX, what `nohup` is for, how to use `signal()` to ask the user to make a choice.

## Acknowledgements

- [incur](https://github.com/wevm/incur) — the CLI framework. Most of the polish (MCP, skill discovery, TOON output, streaming, `--llms`) comes free.
- [@mdx-js/mdx](https://github.com/mdx-js/mdx) and [remark-gfm](https://github.com/remarkjs/remark-gfm) — the MDX compiler and the table support.
- [Tailwind CSS](https://tailwindcss.com) — utility-first styling, loaded from CDN with the typography plugin.
- [shadcn/ui](https://ui.shadcn.com) — the design vocabulary the shipped components borrow from.
- [webui-dev/webui](https://github.com/webui-dev/webui) — the inspiration for "browser-as-GUI". We use Chrome `--app=` mode today; may bind the C library directly later.

## License

MIT
