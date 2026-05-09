import { describe, it, expect } from 'vitest'
import { compileMdx, extractTitle } from './bundle.ts'

describe('compileMdx', () => {
  it('compiles a markdown heading into a React element', async () => {
    const out = await compileMdx('# Hello\n\nWorld')
    // The compiled output is JS that renders an h1 element. We assert on the
    // shape of the output (jsx call with `h1`) rather than the exact text,
    // because @mdx-js/mdx's emit can change between minor versions.
    expect(out).toMatch(/_jsx\b|jsx\(/)
    expect(out).toContain('h1')
    expect(out).toContain('Hello')
  })

  it('preserves JSX components in MDX', async () => {
    const out = await compileMdx('<Button>click</Button>')
    expect(out).toContain('Button')
  })

  it('emits a default export', async () => {
    const out = await compileMdx('# x')
    expect(out).toContain('export default')
  })
})

describe('extractTitle', () => {
  it('returns the first H1', () => {
    expect(extractTitle('# Plan\n\nstuff')).toBe('Plan')
  })

  it('ignores H2 and below', () => {
    expect(extractTitle('## Subhead\n\nbody')).toBeNull()
  })

  it('returns null when no heading exists', () => {
    expect(extractTitle('just a paragraph')).toBeNull()
  })

  it('trims trailing whitespace', () => {
    expect(extractTitle('#   Hello   ')).toBe('Hello')
  })
})
