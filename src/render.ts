import { startServer } from './server.ts'
import { resolveBrowserCommand } from './browser.ts'
import type { RenderEvent, RenderOptions, Platform } from './types.ts'

/**
 * The streaming event source for the `render` command.
 *
 * Yields events in this order:
 *   1. `served` — server is up
 *   2. `opened` or `open_failed` — browser launch attempted (unless `--no-open`)
 *   3. `signal` events — zero or more, as the user interacts
 *   4. `closed` — window/server shut down
 */
export async function* renderEvents(opts: RenderOptions): AsyncGenerator<RenderEvent> {
  const host = opts.host ?? '127.0.0.1'
  const port = opts.port ?? 0
  const open = opts.open ?? true
  const browser = opts.browser ?? 'chrome'
  const windowSize = opts.windowSize ?? '1100x800'

  const server = await startServer({
    stdin: opts.stdin,
    contentPaths: opts.content,
    appPath: opts.app,
    host,
    port,
    title: opts.title,
  })

  yield { event: 'served', url: server.url, port: server.port }

  let closeReason: 'window' | 'signal' | 'timeout' = 'window'

  if (open) {
    const cmd = resolveBrowserCommand({
      browser,
      platform: process.platform as Platform,
      url: server.url,
      windowSize,
    })
    try {
      if (typeof Bun !== 'undefined') {
        Bun.spawn(cmd, { stdout: 'ignore', stderr: 'ignore' })
      } else {
        const { spawn } = await import('node:child_process')
        spawn(cmd[0]!, cmd.slice(1), { stdio: 'ignore', detached: true }).unref()
      }
      yield { event: 'opened', browser: cmd[0] ?? browser }
    } catch (err) {
      yield { event: 'open_failed', error: err instanceof Error ? err.message : String(err) }
    }
  }

  // Race: window close, optional timeout, signal stream
  const timeoutPromise = opts.closeAfterMs
    ? new Promise<'timeout'>((r) => setTimeout(() => r('timeout'), opts.closeAfterMs))
    : null

  const signalIter = server.signals[Symbol.asyncIterator]()

  // Pump signals until close
  let closed = false
  const closePromise = server.closed.then(() => 'window' as const)
  const racers: Promise<'window' | 'timeout' | { signal: { name: string; payload: unknown } }>[] = [
    closePromise,
  ]
  if (timeoutPromise) racers.push(timeoutPromise)

  while (!closed) {
    const next = signalIter.next().then((r) => ({ signal: r.value as { name: string; payload: unknown } }))
    const winner = await Promise.race([...racers, next])
    if (winner === 'window') {
      closed = true
      closeReason = 'window'
    } else if (winner === 'timeout') {
      closed = true
      closeReason = 'timeout'
    } else if (typeof winner === 'object' && 'signal' in winner) {
      yield { event: 'signal', name: winner.signal.name, payload: winner.signal.payload }
    }
  }

  await server.stop()
  yield { event: 'closed', reason: closeReason }
}
