import { describe, expect, it } from 'vitest'

import { hasBlockingIssues, preflightWorkflow } from './preflight'

function n(id, type, data = {}) {
  return { id, type, data }
}
function e(source, target, sourceHandle = 'out', targetHandle = 'in') {
  return { source, target, sourceHandle, targetHandle }
}

describe('preflightWorkflow', () => {
  it("flagge un bloc qui exige une entrée mais n'en a pas", () => {
    const issues = preflightWorkflow([n('s', 'source', { file: 'x.csv' }), n('q', 'sql')], [])
    expect(issues.q?.[0]?.kind).toBe('input_missing')
  })

  it('ne flagge pas une source sans entrée (Source = racine du DAG)', () => {
    const issues = preflightWorkflow([n('s', 'source', { file: 'x.csv' })], [])
    expect(issues.s).toBeUndefined()
  })

  it("avertit qu'une source n'a pas de fichier", () => {
    const issues = preflightWorkflow([n('s', 'source')], [])
    expect(issues.s?.[0]?.kind).toBe('no_file')
  })

  it('détecte un SQL brut vide', () => {
    const issues = preflightWorkflow(
      [n('s', 'source', { file: 'x' }), n('q', 'sql', { mode: 'raw', raw_sql: '   ' })],
      [e('s', 'q')],
    )
    expect(issues.q?.some((i) => i.kind === 'sql_empty')).toBe(true)
  })

  it('détecte un cycle', () => {
    // 3 SQL qui se renvoient en boucle : a → b → c → a
    const issues = preflightWorkflow(
      [n('a', 'sql'), n('b', 'sql'), n('c', 'sql')],
      [e('a', 'b'), e('b', 'c'), e('c', 'a')],
    )
    expect(issues.a?.some((i) => i.kind === 'cycle')).toBe(true)
    expect(issues.b?.some((i) => i.kind === 'cycle')).toBe(true)
    expect(issues.c?.some((i) => i.kind === 'cycle')).toBe(true)
  })

  it('ignore les blocs cosmétiques (frame / stop)', () => {
    const issues = preflightWorkflow([n('f', 'frame'), n('p', 'stop')], [])
    expect(issues.f).toBeUndefined()
    expect(issues.p).toBeUndefined()
  })

  it('renvoie vide pour un workflow propre, et `hasBlockingIssues` est false', () => {
    const issues = preflightWorkflow(
      [n('s', 'source', { file: 'x' }), n('q', 'sql', { mode: 'builder' })],
      [e('s', 'q', 'out', 'in1')],
    )
    expect(issues).toEqual({})
    expect(hasBlockingIssues(issues)).toBe(false)
  })

  it('valide sans target_column : non-route → flag, route → pas de flag', () => {
    // En mode non-route (rules / mask / undefined), _run_validate exige
    // target_column. La pastille est légitime.
    const src = n('s', 'source', { file: 'x' })
    const noTargetNonRoute = preflightWorkflow(
      [src, n('v', 'validate', { mode: 'rules' })],
      [e('s', 'v')],
    )
    expect(noTargetNonRoute.v?.some((i) => i.kind === 'validate_target')).toBe(true)

    // En mode route, target_column n'est qu'un fallback : si chaque condition
    // a sa propre colonne, le moteur tourne sans erreur, donc PAS de pastille.
    const routeNoTarget = preflightWorkflow(
      [src, n('v', 'validate', { mode: 'route' })],
      [e('s', 'v')],
    )
    expect(routeNoTarget.v).toBeUndefined()

    // Route + split activé sans colonne dédiée ni fallback → là on flagge.
    const routeSplitMissing = preflightWorkflow(
      [src, n('v', 'validate', { mode: 'route', split: { enabled: true } })],
      [e('s', 'v')],
    )
    expect(routeSplitMissing.v?.some((i) => i.kind === 'validate_target')).toBe(true)

    // Route + split activé avec sa colonne propre → OK même sans target_column.
    const routeSplitWithCol = preflightWorkflow(
      [src, n('v', 'validate', { mode: 'route', split: { enabled: true, column: 'x' } })],
      [e('s', 'v')],
    )
    expect(routeSplitWithCol.v).toBeUndefined()
  })
})
