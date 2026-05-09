import { describe, it, expect } from 'vitest'
import { renderEvents } from './render.ts'
import { writeFile, mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const hasBun = typeof (globalThis as any).Bun !== 'undefined'

describe.skipIf(!hasBun)('renderEvents (Bun integration)', () => {
  it('yields served first, then closed when timed out, in order', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'smithers-webui-test-'))
    const mdx = join(dir, 'plan.mdx')
    await writeFile(mdx, '# test plan\n\nbody')

    const events = []
    for await (const e of renderEvents({
      content: [mdx],
      open: false,
      closeAfterMs: 200,
    })) {
      events.push(e)
    }

    expect(events[0]).toMatchObject({ event: 'served' })
    expect(events.at(-1)).toMatchObject({ event: 'closed', reason: 'timeout' })
    const url = (events[0] as any).url as string
    expect(url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/)
  })

  it('omits opened event when open=false', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'smithers-webui-test-'))
    const mdx = join(dir, 'plan.mdx')
    await writeFile(mdx, '# t\n')

    const events = []
    for await (const e of renderEvents({
      content: [mdx],
      open: false,
      closeAfterMs: 100,
    })) {
      events.push(e)
    }

    expect(events.find((e) => e.event === 'opened')).toBeUndefined()
    expect(events.find((e) => e.event === 'open_failed')).toBeUndefined()
  })
})
