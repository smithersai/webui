import { describe, it, expect } from 'vitest'
import { resolveBrowserCommand } from './browser.ts'

describe('resolveBrowserCommand', () => {
  describe('chromium-family in app mode', () => {
    it('chrome on darwin uses Google Chrome.app with --app=', () => {
      const cmd = resolveBrowserCommand({
        browser: 'chrome',
        platform: 'darwin',
        url: 'http://127.0.0.1:54321',
        windowSize: '900x700',
      })
      expect(cmd[0]).toContain('Google Chrome')
      expect(cmd).toContain('--app=http://127.0.0.1:54321')
      expect(cmd).toContain('--window-size=900,700')
    })

    it('chrome on linux uses google-chrome', () => {
      const cmd = resolveBrowserCommand({
        browser: 'chrome',
        platform: 'linux',
        url: 'http://localhost:3000',
        windowSize: '1100x800',
      })
      expect(cmd[0]).toBe('google-chrome')
      expect(cmd).toContain('--app=http://localhost:3000')
    })

    it('edge on darwin', () => {
      const cmd = resolveBrowserCommand({
        browser: 'edge',
        platform: 'darwin',
        url: 'http://localhost:3000',
        windowSize: '1100x800',
      })
      expect(cmd[0]).toContain('Microsoft Edge')
    })

    it('brave on darwin', () => {
      const cmd = resolveBrowserCommand({
        browser: 'brave',
        platform: 'darwin',
        url: 'http://localhost:3000',
        windowSize: '1100x800',
      })
      expect(cmd[0]).toContain('Brave')
    })
  })

  describe('firefox', () => {
    it('uses --new-window (no app mode)', () => {
      const cmd = resolveBrowserCommand({
        browser: 'firefox',
        platform: 'darwin',
        url: 'http://localhost:3000',
        windowSize: '1100x800',
      })
      expect(cmd).toContain('--new-window')
      expect(cmd).toContain('http://localhost:3000')
      expect(cmd.find((a) => a.startsWith('--app='))).toBeUndefined()
    })
  })

  describe('default', () => {
    it('falls back to `open` on darwin', () => {
      const cmd = resolveBrowserCommand({
        browser: 'default',
        platform: 'darwin',
        url: 'http://localhost:3000',
        windowSize: '1100x800',
      })
      expect(cmd).toEqual(['open', 'http://localhost:3000'])
    })

    it('falls back to xdg-open on linux', () => {
      const cmd = resolveBrowserCommand({
        browser: 'default',
        platform: 'linux',
        url: 'http://localhost:3000',
        windowSize: '1100x800',
      })
      expect(cmd).toEqual(['xdg-open', 'http://localhost:3000'])
    })

    it('falls back to start on win32', () => {
      const cmd = resolveBrowserCommand({
        browser: 'default',
        platform: 'win32',
        url: 'http://localhost:3000',
        windowSize: '1100x800',
      })
      expect(cmd[0]).toBe('cmd')
      expect(cmd).toContain('start')
    })
  })
})
