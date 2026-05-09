import { compile as mdxCompile } from '@mdx-js/mdx'
import remarkGfm from 'remark-gfm'

/**
 * Compile a single MDX source string to ESM JSX (React).
 *
 * The output is a string of JS with a default export — a React component.
 * Suitable to write to disk and feed to a bundler, or to evaluate as ESM.
 *
 * GFM is enabled (tables, strikethrough, task lists). Tables are critical for
 * the typical agent use case — plans, comparisons, status grids.
 */
export async function compileMdx(source: string): Promise<string> {
  const compiled = await mdxCompile(source, {
    jsx: false,
    jsxImportSource: 'react',
    development: false,
    outputFormat: 'program',
    remarkPlugins: [remarkGfm],
  })
  return String(compiled)
}

/**
 * Extract the first `# heading` from an MDX source — used to derive a window title.
 */
export function extractTitle(source: string): string | null {
  const match = source.match(/^#\s+(.+?)\s*$/m)
  return match?.[1] ?? null
}
