/**
 * Send a structured event from the rendered browser page back to the agent.
 *
 * On the server side, this surfaces as a `signal` event in the `render` event stream:
 *   `event: signal, name: <name>, payload: <payload>`
 *
 * Use it for approval flows, multi-option pickers, form submissions — any
 * point where the agent should resume reasoning based on a user choice.
 *
 * @example
 * ```tsx
 * import { signal } from 'smithers-webui/runtime'
 * <button onClick={() => signal('approve', { plan: 'A' })}>Approve plan A</button>
 * ```
 */
export function signal(name: string, payload?: unknown): Promise<void> {
  const w = globalThis as unknown as { __smithers_signal__?: (n: string, p: unknown) => Promise<unknown> }
  if (typeof w.__smithers_signal__ !== 'function') {
    return Promise.reject(new Error('signal() called outside the smithers-webui runtime'))
  }
  return w.__smithers_signal__(name, payload).then(() => undefined)
}
