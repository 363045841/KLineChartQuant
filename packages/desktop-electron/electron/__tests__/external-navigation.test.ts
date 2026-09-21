import { describe, expect, it } from 'vitest'

import {
  createNavigationPolicy,
  decideExternalLink,
  isApplicationOrigin,
  type ExternalLinkRejection,
} from '../external-navigation'

const RENDERER_URL = 'http://localhost:5173'
const PACKAGED_URL = 'file:///Applications/KQ.app/out/renderer/index.html'

function trackPolicy(applicationUrl: string) {
  const opened: string[] = []
  const rejected: Array<{ rawUrl: string; reason: ExternalLinkRejection }> = []
  const policy = createNavigationPolicy({
    openExternal: (url) => void opened.push(url),
    applicationUrl,
    onRejected: (rawUrl, reason) => void rejected.push({ rawUrl, reason }),
  })
  return { policy, opened, rejected }
}

describe('decideExternalLink', () => {
  it('allows allowlisted https hosts and their subdomains', () => {
    expect(decideExternalLink('https://302.ai/pricing')).toEqual({
      allowed: true,
      url: 'https://302.ai/pricing',
    })
    expect(decideExternalLink('https://dash.302.ai/apis')).toMatchObject({ allowed: true })
    expect(decideExternalLink('https://github.com/klinecharts')).toMatchObject({ allowed: true })
  })

  it('rejects every protocol other than https', () => {
    for (const rawUrl of [
      'http://302.ai',
      'file:///etc/passwd',
      'javascript:fetch("https://302.ai")',
      'data:text/html,<script>alert(1)</script>',
      'kq-agent://open',
    ]) {
      expect(decideExternalLink(rawUrl)).toEqual({
        allowed: false,
        reason: 'protocol-not-allowed',
      })
    }
  })

  it('rejects hosts that only look like an allowlisted domain', () => {
    for (const rawUrl of [
      'https://evil-302.ai/steal',
      'https://302.ai.attacker.test',
      'https://notgithub.com',
    ]) {
      expect(decideExternalLink(rawUrl)).toEqual({ allowed: false, reason: 'host-not-allowed' })
    }
  })

  it('rejects unparsable input instead of forwarding it', () => {
    expect(decideExternalLink('not a url')).toEqual({ allowed: false, reason: 'malformed' })
    expect(decideExternalLink('')).toEqual({ allowed: false, reason: 'malformed' })
  })

  it('ignores host casing', () => {
    expect(decideExternalLink('https://DASH.302.AI/apis')).toMatchObject({ allowed: true })
  })
})

describe('isApplicationOrigin', () => {
  it('accepts the exact packaged page and any path on the dev renderer origin', () => {
    expect(isApplicationOrigin(PACKAGED_URL, PACKAGED_URL)).toBe(true)
    expect(isApplicationOrigin(`${RENDERER_URL}/index.html`, RENDERER_URL)).toBe(true)
  })

  it('rejects other local files even though they share the file protocol', () => {
    expect(isApplicationOrigin('file:///etc/passwd', PACKAGED_URL)).toBe(false)
    expect(isApplicationOrigin('file:///Users/victim/.ssh/id_rsa', PACKAGED_URL)).toBe(false)
  })

  it('rejects other origins, protocol mismatches, and unparsable input', () => {
    expect(isApplicationOrigin('https://302.ai', RENDERER_URL)).toBe(false)
    expect(isApplicationOrigin('http://localhost:6000', RENDERER_URL)).toBe(false)
    expect(isApplicationOrigin(PACKAGED_URL, RENDERER_URL)).toBe(false)
    expect(isApplicationOrigin('not a url', RENDERER_URL)).toBe(false)
    expect(isApplicationOrigin(RENDERER_URL, 'not a url')).toBe(false)
  })
})

describe('createNavigationPolicy', () => {
  it('opens allowlisted window-open targets and reports the rest', () => {
    const { policy, opened, rejected } = trackPolicy(RENDERER_URL)

    policy.handleWindowOpen('https://dash.302.ai/apis')
    policy.handleWindowOpen('javascript:fetch("https://attacker.test")')

    expect(opened).toEqual(['https://dash.302.ai/apis'])
    expect(rejected).toEqual([
      { rawUrl: 'javascript:fetch("https://attacker.test")', reason: 'protocol-not-allowed' },
    ])
  })

  it('keeps in-app navigation and diverts allowlisted externals to the browser', () => {
    const { policy, opened } = trackPolicy(RENDERER_URL)

    expect(policy.handleWillNavigate(`${RENDERER_URL}/index.html`)).toBe(true)
    expect(policy.handleWillNavigate('https://302.ai/docs')).toBe(false)

    expect(opened).toEqual(['https://302.ai/docs'])
  })

  it('blocks external navigation without opening anything when it fails the allowlist', () => {
    const { policy, opened, rejected } = trackPolicy(RENDERER_URL)

    expect(policy.handleWillNavigate('file:///etc/passwd')).toBe(false)
    expect(policy.handleWillNavigate('https://attacker.test/phish')).toBe(false)

    expect(opened).toEqual([])
    expect(rejected).toEqual([
      { rawUrl: 'file:///etc/passwd', reason: 'protocol-not-allowed' },
      { rawUrl: 'https://attacker.test/phish', reason: 'host-not-allowed' },
    ])
  })

  it('keeps the packaged page navigable while blocking sibling local files', () => {
    const { policy } = trackPolicy(PACKAGED_URL)

    expect(policy.handleWillNavigate(PACKAGED_URL)).toBe(true)
    expect(policy.handleWillNavigate('file:///Applications/KQ.app/out/renderer/secrets.html')).toBe(
      false,
    )
  })

  it('works without an onRejected reporter', () => {
    const opened: string[] = []
    const policy = createNavigationPolicy({
      openExternal: (url) => void opened.push(url),
      applicationUrl: RENDERER_URL,
    })

    expect(policy.handleWillNavigate('https://attacker.test')).toBe(false)
    policy.handleWindowOpen('https://attacker.test')

    expect(opened).toEqual([])
  })
})
