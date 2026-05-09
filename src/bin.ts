#!/usr/bin/env bun
import { Cli, z } from 'incur'
import { renderEvents } from './render.ts'

export const cli = Cli.create('smithers-webui', {
  description:
    'Render React + MDX in a browser window. A skill + CLI for agents to present plans, dashboards, and rich UIs to users.',
  version: '0.0.0',
})
  .command('render', {
    description:
      'Pipe MDX via stdin (preferred — no temp files) or pass --content paths. Bundles + serves + opens a browser window.',
    options: z.object({
      content: z
        .array(z.string())
        .optional()
        .describe('MDX file path. Repeatable. Optional — usually MDX is piped via stdin instead.'),
      app: z.string().optional().describe('Path to a .tsx layout component'),
      port: z.coerce.number().default(0).describe('Port to serve on (0 = random free port)'),
      host: z.string().default('127.0.0.1').describe('Host to bind'),
      open: z.boolean().default(true).describe('Auto-open a browser window'),
      browser: z
        .enum(['chrome', 'edge', 'brave', 'firefox', 'default'])
        .default('chrome')
        .describe('Browser to open'),
      windowSize: z.string().default('1100x800').describe('Window size as WxH'),
      title: z.string().optional().describe('Window title (default: from first MDX heading)'),
    }),
    hint:
      "Preferred form: agents pipe MDX directly via stdin in a single tool call (`echo '# X' | smithers-webui render` or a heredoc). --content is for content already on disk.",
    examples: [
      {
        options: {},
        description: 'Pipe MDX via stdin: `echo \"# Hello\" | smithers-webui render`',
      },
      {
        options: { content: ['plan.mdx'] },
        description: 'Render an MDX file already on disk',
      },
      {
        options: { app: 'App.tsx' },
        description: 'Pipe MDX, wrap with a custom layout: `echo \"# X\" | smithers-webui render --app App.tsx`',
      },
      {
        options: { open: false },
        description: 'Serve without opening a browser (useful for headless verification)',
      },
    ],
    async *run(c) {
      const stdin = await readStdinIfPiped()
      const contentPaths = c.options.content ?? []
      if (!stdin && contentPaths.length === 0) {
        yield {
          event: 'error',
          error:
            'No MDX content. Pipe MDX via stdin (e.g. `echo "# x" | smithers-webui render`) or pass --content <path>.',
        }
        return
      }
      for await (const event of renderEvents({
        stdin,
        content: contentPaths,
        app: c.options.app,
        port: c.options.port,
        host: c.options.host,
        open: c.options.open,
        browser: c.options.browser,
        windowSize: c.options.windowSize,
        title: c.options.title,
      })) {
        yield event
      }
    },
  })

/**
 * Read piped stdin if it's not a TTY. Returns `undefined` when nothing is piped,
 * so `render` can fall back to `--content` paths.
 */
async function readStdinIfPiped(): Promise<string | undefined> {
  if (process.stdin.isTTY) return undefined
  if (typeof Bun !== 'undefined') {
    const text = await Bun.stdin.text()
    return text.length > 0 ? text : undefined
  }
  let buf = ''
  process.stdin.setEncoding('utf8')
  for await (const chunk of process.stdin as AsyncIterable<string>) buf += chunk
  return buf.length > 0 ? buf : undefined
}

// Note: no `export default cli` — Bun auto-detects default exports with a `fetch`
// property as server configs and tries to start a server. We export `cli` as a
// named binding instead.

cli.serve()
