// Tests des helpers purs de la Validation (catalogue de règles, factory d'id,
// classes de caractères). Pas de fetch, pas de DOM.

import { describe, expect, it } from 'vitest'

import {
  CLASS_FR,
  CLASS_RE_JS,
  VAL_TESTS,
  controlOutputs,
  defaultExtractor,
  inferIntent,
  intentPatch,
  uid,
} from './validateHelpers'

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

describe('intentPatch — préréglage Contrôler / Router', () => {
  it('control : 2 sorties Conformes/Non conformes sur la 1re condition', () => {
    const p = intentPatch({ conditions: [{ id: 'c1', name: 'Conforme' }], outputs: [] }, 'control')
    expect(p.intent).toBe('control')
    expect(p.outputs.map((o) => o.id)).toEqual(['valid', 'invalid'])
    expect(p.outputs[0].match).toEqual({ conditionId: 'c1', negate: false })
    expect(p.outputs[1].match).toEqual({ conditionId: 'c1', negate: true })
    expect(p.else_enabled).toBe(false)
  })

  it('control crée une condition si aucune', () => {
    const p = intentPatch({ conditions: [] }, 'control')
    expect(p.conditions).toHaveLength(1)
    expect(p.outputs[0].match.conditionId).toBe(p.conditions[0].id)
  })

  it('router→control planque les sorties, control→router les restaure (jamais perdues)', () => {
    const router = {
      intent: 'router',
      conditions: [{ id: 'c1' }, { id: 'c2' }],
      outputs: [
        { id: 'a', label: 'A', match: { conditionId: 'c1' } },
        { id: 'b', label: 'B', match: { conditionId: 'c2' } },
        { id: 'c', label: 'C', match: { conditionId: 'c1', negate: true } },
      ],
      else_enabled: true,
    }
    const toCtrl = intentPatch(router, 'control')
    expect(toCtrl.outputs.map((o) => o.id)).toEqual(['valid', 'invalid'])
    expect(toCtrl.router_stash.outputs.map((o) => o.id)).toEqual(['a', 'b', 'c'])

    const controlState = { ...router, ...toCtrl }
    const back = intentPatch(controlState, 'router')
    expect(back.outputs.map((o) => o.id)).toEqual(['a', 'b', 'c']) // restaurées
    expect(back.else_enabled).toBe(true)
    expect(back.router_stash).toBeNull()
  })

  it('control→router sans stash garde les sorties courantes (patch ne touche pas outputs)', () => {
    const ctrl = intentPatch({ conditions: [{ id: 'c1' }] }, 'control')
    const back = intentPatch({ conditions: [{ id: 'c1' }], ...ctrl }, 'router')
    expect(back.intent).toBe('router')
    expect(back.outputs).toBeUndefined()
  })

  it('inferIntent : router si >2 sorties ou plusieurs conditions, control sinon', () => {
    expect(inferIntent({ intent: 'router' })).toBe('router')
    expect(inferIntent({ outputs: controlOutputs('c1'), conditions: [{ id: 'c1' }] })).toBe(
      'control',
    )
    expect(
      inferIntent({
        outputs: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
        conditions: [{ id: 'c1' }],
      }),
    ).toBe('router')
    expect(inferIntent({ conditions: [{ id: 'c1' }, { id: 'c2' }] })).toBe('router')
  })
})
