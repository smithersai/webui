import { compileMdx, extractTitle } from './bundle.ts'
import { readFile } from 'node:fs/promises'
import { basename, resolve as resolvePath } from 'node:path'

export type ServerHandle = {
  url: string
  port: number
  /** Stop the server. Resolves once it's fully closed. */
  stop: () => Promise<void>
  /** Async iterator of `signal()` calls from the browser. */
  signals: AsyncIterable<{ name: string; payload: unknown }>
  /** Resolves when at least one client has connected. */
  opened: Promise<void>
  /** Resolves when the last client disconnects (window closed). */
  closed: Promise<void>
}

/**
 * Start a Bun HTTP server that:
 *   - Serves an HTML shell at `/`
 *   - Compiles + serves the user's MDX as ESM modules at `/__mdx__/<n>.js`
 *   - Serves the user's `App.tsx` (if any) at `/__app__.js`
 *   - Accepts POSTs at `/__signal__` from the page and emits them via the `signals` iterator
 *   - Tracks WebSocket-based liveness (`/__live__`) to know when the window has closed
 *
 * Content sources are concatenated in this order: `stdin` (if any), then each
 * file in `contentPaths`. The first non-empty source contributes the window title.
 */
export async function startServer(opts: {
  stdin?: string | undefined
  contentPaths?: string[] | undefined
  appPath?: string | undefined
  host: string
  port: number
  title?: string | undefined
}): Promise<ServerHandle> {
  if (typeof Bun === 'undefined') throw new Error('startServer requires Bun runtime')

  const sources: { source: string }[] = []
  if (opts.stdin) sources.push({ source: opts.stdin })
  for (const p of opts.contentPaths ?? []) {
    sources.push({ source: await readFile(p, 'utf8') })
  }
  if (sources.length === 0) throw new Error('No content provided — pipe MDX via stdin or pass --content')

  const compiled = await Promise.all(
    sources.map(async (s) => ({ ...s, js: await compileMdx(s.source) })),
  )
  const titleFromMdx = sources[0] ? extractTitle(sources[0].source) : null
  const title = opts.title ?? titleFromMdx ?? 'smithers-webui'

  const appJs = opts.appPath ? await buildApp(resolvePath(opts.appPath)) : null

  const html = renderShell({ title, mdxCount: compiled.length, hasApp: appJs !== null })
  const clientJs = renderClient({ mdxCount: compiled.length, hasApp: appJs !== null })

  const signalQueue: Array<{ name: string; payload: unknown }> = []
  let signalNotify: (() => void) | null = null
  function pushSignal(s: { name: string; payload: unknown }) {
    signalQueue.push(s)
    signalNotify?.()
  }

  let openedResolve: () => void
  const opened = new Promise<void>((r) => (openedResolve = r))
  let closedResolve: () => void
  const closed = new Promise<void>((r) => (closedResolve = r))
  let liveCount = 0
  let everConnected = false

  const server = Bun.serve({
    hostname: opts.host,
    port: opts.port,
    fetch(req, srv) {
      const url = new URL(req.url)
      const path = url.pathname

      if (path === '/') return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } })
      if (path === '/__client__.js')
        return new Response(clientJs, { headers: { 'content-type': 'text/javascript; charset=utf-8' } })
      if (path === '/__sw_ui__.js')
        return new Response(SW_UI_MODULE, { headers: { 'content-type': 'text/javascript; charset=utf-8' } })
      if (path === '/__sw_runtime__.js')
        return new Response(SW_RUNTIME_MODULE, { headers: { 'content-type': 'text/javascript; charset=utf-8' } })

      const mdxMatch = path.match(/^\/__mdx__\/(\d+)\.js$/)
      if (mdxMatch) {
        const i = Number(mdxMatch[1])
        const c = compiled[i]
        if (!c) return new Response('not found', { status: 404 })
        return new Response(c.js, { headers: { 'content-type': 'text/javascript; charset=utf-8' } })
      }

      if (path === '/__app__.js' && appJs)
        return new Response(appJs, { headers: { 'content-type': 'text/javascript; charset=utf-8' } })

      if (path === '/__signal__' && req.method === 'POST') {
        return req.json().then((body: any) => {
          pushSignal({ name: String(body?.name ?? 'unknown'), payload: body?.payload })
          return new Response('{"ok":true}', { headers: { 'content-type': 'application/json' } })
        })
      }

      if (path === '/__live__') {
        const ok = srv.upgrade(req)
        if (ok) return undefined
        return new Response('upgrade required', { status: 426 })
      }

      return new Response('not found', { status: 404 })
    },
    websocket: {
      open() {
        liveCount += 1
        if (!everConnected) {
          everConnected = true
          openedResolve()
        }
      },
      message() {
        // no-op — we just use ws as a liveness channel
      },
      close() {
        liveCount = Math.max(0, liveCount - 1)
        if (everConnected && liveCount === 0) closedResolve()
      },
    },
  })

  const port = server.port ?? opts.port
  const url = `http://${opts.host === '0.0.0.0' ? '127.0.0.1' : opts.host}:${port}`

  const signals: AsyncIterable<{ name: string; payload: unknown }> = {
    [Symbol.asyncIterator]() {
      return {
        async next() {
          while (signalQueue.length === 0) {
            await new Promise<void>((r) => {
              signalNotify = r
            })
            signalNotify = null
          }
          return { value: signalQueue.shift()!, done: false as const }
        },
      }
    },
  }

  return {
    url,
    port,
    stop: async () => {
      server.stop(true)
    },
    signals,
    opened,
    closed,
  }
}

/**
 * Bundle a `.tsx` entry point to a single browser ESM module.
 *
 * Externalizes `react`, `react-dom`, `react/jsx-runtime`, and the
 * `smithers-webui/*` paths — all of those resolve via the importmap in the
 * HTML shell. We only bundle the user's local imports.
 */
async function buildApp(entryPath: string): Promise<string> {
  if (typeof Bun === 'undefined') throw new Error('buildApp requires Bun')
  const result = await Bun.build({
    entrypoints: [entryPath],
    target: 'browser',
    format: 'esm',
    external: [
      'react',
      'react/jsx-runtime',
      'react-dom',
      'react-dom/client',
      'smithers-webui',
      'smithers-webui/ui',
      'smithers-webui/runtime',
    ],
    minify: false,
    sourcemap: 'none',
  })
  if (!result.success) {
    const msg = result.logs.map((l) => String(l)).join('\n')
    throw new Error(`buildApp failed: ${msg}`)
  }
  const out = result.outputs[0]
  if (!out) throw new Error('buildApp produced no output')
  return await out.text()
}

function renderShell(opts: { title: string; mdxCount: number; hasApp: boolean }): string {
  // Import map: MDX-compiled modules emit bare `import { jsx } from 'react/jsx-runtime'`
  // and similar. We remap React + jsx-runtime + smithers-webui paths to esm.sh
  // so the browser can resolve them without a bundle step.
  const importMap = {
    imports: {
      react: 'https://esm.sh/react@19',
      'react/jsx-runtime': 'https://esm.sh/react@19/jsx-runtime',
      'react/jsx-dev-runtime': 'https://esm.sh/react@19/jsx-dev-runtime',
      'react-dom': 'https://esm.sh/react-dom@19',
      'react-dom/client': 'https://esm.sh/react-dom@19/client',
      'smithers-webui/ui': '/__sw_ui__.js',
      'smithers-webui/runtime': '/__sw_runtime__.js',
    },
  }
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(opts.title)}</title>
    <script type="importmap">${JSON.stringify(importMap)}</script>
    <script src="https://cdn.tailwindcss.com?plugins=typography"></script>
    <style>
      html, body, #root { height: 100%; }
      body { margin: 0; }
    </style>
  </head>
  <body class="bg-white text-slate-900 antialiased">
    <div id="root"></div>
    <script type="module" src="/__client__.js"></script>
  </body>
</html>`
}

function renderClient(opts: { mdxCount: number; hasApp: boolean }): string {
  // Generated browser-side bootstrap. Imports React, the user's MDX modules, and either
  // their App.tsx or the default prose layout.
  const mdxImports = Array.from({ length: opts.mdxCount }, (_, i) => `import M${i} from '/__mdx__/${i}.js'`).join('\n')
  const mdxList = `[${Array.from({ length: opts.mdxCount }, (_, i) => `M${i}`).join(', ')}]`
  const appImport = opts.hasApp ? `import App from '/__app__.js'` : ''
  const liveness = `
const ws = new WebSocket((location.protocol === 'https:' ? 'wss:' : 'ws:') + '//' + location.host + '/__live__')
window.addEventListener('beforeunload', () => { try { ws.close() } catch {} })
window.__smithers_signal__ = function (name, payload) {
  return fetch('/__signal__', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, payload }) })
}`
  return `import React from 'https://esm.sh/react@19'
import { createRoot } from 'https://esm.sh/react-dom@19/client'
${mdxImports}
${appImport}
${liveness}
const Mdx = ${mdxList}
function DefaultLayout() {
  return React.createElement('main', { className: 'prose prose-slate mx-auto max-w-3xl py-12 px-6' },
    Mdx.map((C, i) => React.createElement(C, { key: i }))
  )
}
const Root = ${opts.hasApp ? '() => React.createElement(App, { mdx: Mdx })' : 'DefaultLayout'}
createRoot(document.getElementById('root')).render(React.createElement(Root))
`
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
}

// Browser-side `smithers-webui/ui` module. Plain ESM, no JSX, no transpile.
// React is resolved via the importmap.
const SW_UI_MODULE = `import { createElement as h } from 'react'
const cx = (...xs) => xs.filter(Boolean).join(' ')

const buttonVariants = {
  primary: 'bg-slate-900 text-white hover:bg-slate-800 focus-visible:ring-slate-900',
  secondary: 'bg-slate-100 text-slate-900 hover:bg-slate-200 focus-visible:ring-slate-300',
  ghost: 'bg-transparent text-slate-900 hover:bg-slate-100 focus-visible:ring-slate-200',
}
export function Button({ variant = 'primary', className = '', ...rest }) {
  const base = 'inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50'
  return h('button', { className: cx(base, buttonVariants[variant], className), ...rest })
}

export function Card({ className = '', ...rest }) {
  return h('div', { className: cx('rounded-lg border border-slate-200 bg-white p-6 shadow-sm', className), ...rest })
}

const badgeVariants = {
  info: 'bg-sky-100 text-sky-800',
  success: 'bg-emerald-100 text-emerald-800',
  warn: 'bg-amber-100 text-amber-900',
  error: 'bg-rose-100 text-rose-800',
  neutral: 'bg-slate-100 text-slate-700',
}
export function Badge({ variant = 'neutral', className = '', ...rest }) {
  return h('span', { className: cx('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium', badgeVariants[variant], className), ...rest })
}
`

// Browser-side `smithers-webui/runtime` module — exposes `signal()`.
const SW_RUNTIME_MODULE = `export function signal(name, payload) {
  if (typeof window.__smithers_signal__ !== 'function')
    return Promise.reject(new Error('signal() called outside the smithers-webui runtime'))
  return window.__smithers_signal__(name, payload).then(() => undefined)
}
`
