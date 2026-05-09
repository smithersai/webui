/**
 * Options accepted by the `render` command.
 *
 * Content can come from two places: piped stdin (the canonical agent path —
 * no temp files, one tool call) or `--content` file paths (when the MDX is
 * already on disk). They can be combined; stdin is rendered first.
 */
export type RenderOptions = {
  /** Inline MDX source — typically read from stdin. Rendered first when both `stdin` and `content` are given. */
  stdin?: string | undefined
  /** Zero or more MDX file paths. The first source (stdin or path) is the "primary" — its first `# heading` becomes the window title. */
  content?: string[] | undefined
  /** Optional path to a `.tsx` component used as the layout/shell. */
  app?: string | undefined
  /** Port to serve on. `0` picks a free port. Default: `0`. */
  port?: number | undefined
  /** Host to bind. Default: `127.0.0.1`. */
  host?: string | undefined
  /** Whether to auto-open a browser. Default: `true`. */
  open?: boolean | undefined
  /** Browser preference. */
  browser?: BrowserChoice | undefined
  /** Window size as `WxH`. Default: `1100x800`. */
  windowSize?: string | undefined
  /** Window title override. Default: derived from primary MDX `# heading`. */
  title?: string | undefined
  /**
   * For tests / programmatic use: forcibly close the server after N ms. Not exposed via CLI.
   */
  closeAfterMs?: number | undefined
}

export type BrowserChoice = 'chrome' | 'edge' | 'brave' | 'firefox' | 'default'

/**
 * Events streamed from the `render` command.
 */
export type RenderEvent =
  | { event: 'served'; url: string; port: number }
  | { event: 'opened'; browser: string }
  | { event: 'open_failed'; error: string }
  | { event: 'signal'; name: string; payload: unknown }
  | { event: 'closed'; reason: 'window' | 'signal' | 'timeout' }

export type Platform = 'darwin' | 'linux' | 'win32'
