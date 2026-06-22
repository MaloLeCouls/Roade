import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { hasOnboarded, markOnboarded } from './onboarding'

describe('lib/onboarding', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => localStorage.clear())

  it('part de false, devient true après markOnboarded', () => {
    expect(hasOnboarded()).toBe(false)
    markOnboarded()
    expect(hasOnboarded()).toBe(true)
  })

  it('markOnboarded est idempotent', () => {
    markOnboarded()
    markOnboarded()
    expect(hasOnboarded()).toBe(true)
  })

  it('ne casse pas si localStorage lève (mode privé strict)', () => {
    const orig = Storage.prototype.getItem
    Storage.prototype.getItem = () => {
      throw new Error('blocked')
    }
    expect(hasOnboarded()).toBe(false) // repli silencieux, pas d'exception
    Storage.prototype.getItem = orig
  })
})
