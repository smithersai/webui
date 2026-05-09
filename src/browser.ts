import type { BrowserChoice, Platform } from './types.ts'

/**
 * Resolve the OS command + args needed to open a URL in app mode.
 *
 * App mode = browser window with no tab bar / address bar (Chrome's `--app=URL`).
 * Falls back to a plain "open URL in default browser" when app mode isn't available.
 */
export function resolveBrowserCommand(opts: {
  browser: BrowserChoice
  platform: Platform
  url: string
  windowSize: string
}): string[] {
  const { browser, platform, url, windowSize } = opts
  const [w, h] = windowSize.split('x')
  const sizeFlag = `--window-size=${w},${h}`

  // app-mode capable browsers (Chromium-family)
  if (browser === 'chrome' || browser === 'edge' || browser === 'brave') {
    const bin = chromiumBinary(platform, browser)
    if (bin) return [bin, `--app=${url}`, sizeFlag]
  }

  // Firefox supports --new-window but not chrome-less app mode
  if (browser === 'firefox') {
    const bin = firefoxBinary(platform)
    if (bin) return [bin, '--new-window', url]
  }

  // default fallback — let the OS pick
  return platformOpen(platform, url)
}

function chromiumBinary(platform: Platform, browser: 'chrome' | 'edge' | 'brave'): string | null {
  if (platform === 'darwin') {
    if (browser === 'chrome') return '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
    if (browser === 'edge') return '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'
    if (browser === 'brave') return '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser'
  }
  if (platform === 'linux') {
    if (browser === 'chrome') return 'google-chrome'
    if (browser === 'edge') return 'microsoft-edge'
    if (browser === 'brave') return 'brave-browser'
  }
  if (platform === 'win32') {
    if (browser === 'chrome')
      return 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
    if (browser === 'edge')
      return 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
    if (browser === 'brave')
      return 'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe'
  }
  return null
}

function firefoxBinary(platform: Platform): string | null {
  if (platform === 'darwin') return '/Applications/Firefox.app/Contents/MacOS/firefox'
  if (platform === 'linux') return 'firefox'
  if (platform === 'win32') return 'C:\\Program Files\\Mozilla Firefox\\firefox.exe'
  return null
}

function platformOpen(platform: Platform, url: string): string[] {
  if (platform === 'darwin') return ['open', url]
  if (platform === 'win32') return ['cmd', '/c', 'start', '""', url]
  return ['xdg-open', url]
}
