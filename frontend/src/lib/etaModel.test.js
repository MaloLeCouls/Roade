import { beforeEach, describe, expect, it } from 'vitest'

import { estimateNodeMs, learnDuration, modelKey } from './etaModel'

beforeEach(() => {
  localStorage.clear() // repart de la baseline à chaque test
})

describe('modelKey', () => {
  it('scinde les exports par format (coûts très différents)', () => {
    expect(modelKey({ type: 'export', data: { format: 'csv' } })).toBe('export_csv')
    expect(modelKey({ type: 'export', data: { format: 'xlsx' } })).toBe('export_xlsx')
    expect(modelKey({ type: 'export', data: {} })).toBe('export_xlsx') // défaut
  })
  it('renvoie le type pour les autres blocs', () => {
    expect(modelKey({ type: 'pivot' })).toBe('pivot')
  })
})

describe('estimateNodeMs', () => {
  it('croît avec le nombre de lignes', () => {
    const small = estimateNodeMs('export_xlsx', 1000)
    const big = estimateNodeMs('export_xlsx', 100000)
    expect(big).toBeGreaterThan(small)
  })
  it('xlsx est nettement plus lourd que csv à volume égal', () => {
    expect(estimateNodeMs('export_xlsx', 100000)).toBeGreaterThan(
      estimateNodeMs('export_csv', 100000) * 5,
    )
  })
  it('un type inconnu retombe sur un coût générique (pas NaN)', () => {
    expect(Number.isFinite(estimateNodeMs('inconnu', 10000))).toBe(true)
  })
})

describe('learnDuration', () => {
  it('rapproche l’estimation de la durée réelle observée (EMA)', () => {
    const before = estimateNodeMs('clean', 100000)
    // on observe un bloc clean BEAUCOUP plus lent que la baseline
    for (let i = 0; i < 5; i++) learnDuration('clean', 100000, 50000)
    const after = estimateNodeMs('clean', 100000)
    expect(after).toBeGreaterThan(before)
    expect(after).toBeLessThanOrEqual(50000) // ne dépasse pas l’observation
  })

  it('ignore les runs en cache (durée nulle) côté appelant — ms négatif/NaN ignoré', () => {
    const ref = estimateNodeMs('union', 100000)
    learnDuration('union', 100000, NaN)
    learnDuration('union', 100000, -10)
    expect(estimateNodeMs('union', 100000)).toBe(ref)
  })
})
