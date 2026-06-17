// Tests des helpers purs de la Validation (catalogue de règles, factory d'id,
// classes de caractères). Pas de fetch, pas de DOM.

import { describe, expect, it } from 'vitest'

import { CLASS_FR, CLASS_RE_JS, VAL_TESTS, defaultExtractor, uid } from './validateHelpers'

describe('CLASS_RE_JS / CLASS_FR', () => {
  it('expose une regex JS valide par classe de caractère', () => {
    for (const [key, re] of Object.entries(CLASS_RE_JS)) {
      expect(typeof re).toBe('string')
      // construit une vraie RegExp pour s'assurer que le pattern est sain
      expect(() => new RegExp(re)).not.toThrow()
      // un libellé FR doit exister pour les classes nommées (sauf 'any')
      if (key !== 'any') expect(CLASS_FR).toHaveProperty(key)
    }
  })
})

describe('VAL_TESTS', () => {
  it('paire chaque test à un libellé FR non vide', () => {
    expect(VAL_TESTS.length).toBeGreaterThan(0)
    for (const [id, label] of VAL_TESTS) {
      expect(typeof id).toBe('string')
      expect(typeof label).toBe('string')
      expect(label.trim()).not.toBe('')
    }
    // ids uniques
    const ids = VAL_TESTS.map(([id]) => id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('uid()', () => {
  it('génère des identifiants préfixés `o` et probablement uniques', () => {
    const ids = new Set()
    for (let i = 0; i < 200; i++) {
      const id = uid()
      expect(id).toMatch(/^o[a-z0-9]+$/)
      ids.add(id)
    }
    // collisions extrêmement improbables sur 200 tirages
    expect(ids.size).toBe(200)
  })
})

describe('defaultExtractor()', () => {
  it('renvoie un nouvel objet à chaque appel (pas un singleton partagé)', () => {
    const a = defaultExtractor()
    const b = defaultExtractor()
    expect(a).not.toBe(b)
    expect(a).toEqual(b)
  })
})
