import { describe, it, expect } from 'vitest'
import { estimateBlockLoad, estimateWorkflowLoad } from './loadEstimate'

const ranWith = (rows) => ({ ran: true, rows })

describe('estimateBlockLoad', () => {
  it('returns null for source / frame / stop', () => {
    expect(estimateBlockLoad({ id: 's', type: 'source' }, [], {})).toBeNull()
    expect(estimateBlockLoad({ id: 'f', type: 'frame' }, [], {})).toBeNull()
    expect(estimateBlockLoad({ id: 'st', type: 'stop' }, [], {})).toBeNull()
  })

  it('returns null when the block has no incoming edges', () => {
    expect(estimateBlockLoad({ id: 'p', type: 'pivot' }, [], {})).toBeNull()
  })

  it('returns null when no upstream has been run yet', () => {
    const node = { id: 'c', type: 'clean' }
    const edges = [{ source: 'a', target: 'c' }]
    expect(estimateBlockLoad(node, edges, {})).toBeNull()
  })

  it('returns null when total input rows are below the heavy threshold', () => {
    const node = { id: 'c', type: 'clean' }
    const edges = [{ source: 'a', target: 'c' }]
    const status = { a: ranWith(10_000) }
    expect(estimateBlockLoad(node, edges, status)).toBeNull()
  })

  it('flags a pivot above 50k rows (lower threshold)', () => {
    const node = { id: 'p', type: 'pivot', data: { mode: 'pivot' } }
    const edges = [{ source: 'a', target: 'p' }]
    const status = { a: ranWith(60_000) }
    const est = estimateBlockLoad(node, edges, status)
    expect(est).not.toBeNull()
    expect(est.level).toBe('heavy')
    expect(est.rows).toBe(60_000)
    expect(est.reason).toMatch(/pivot/i)
  })

  it('does NOT lower the threshold for unpivot mode', () => {
    const node = { id: 'p', type: 'pivot', data: { mode: 'unpivot' } }
    const edges = [{ source: 'a', target: 'p' }]
    // 60k < default 100k → not flagged in unpivot mode
    expect(estimateBlockLoad(node, edges, { a: ranWith(60_000) })).toBeNull()
  })

  it('lowers threshold for SQL with multiple inputs (join)', () => {
    const node = { id: 's', type: 'sql' }
    const edges = [
      { source: 'a', target: 's' },
      { source: 'b', target: 's' },
    ]
    const status = { a: ranWith(40_000), b: ranWith(20_000) }
    const est = estimateBlockLoad(node, edges, status)
    expect(est).not.toBeNull()
    expect(est.rows).toBe(60_000)
    expect(est.reason).toMatch(/jointure/i)
  })

  it('keeps the default threshold for single-input SQL', () => {
    const node = { id: 's', type: 'sql' }
    const edges = [{ source: 'a', target: 's' }]
    // 60k < 100k for non-join SQL
    expect(estimateBlockLoad(node, edges, { a: ranWith(60_000) })).toBeNull()
  })

  it('escalates to critical above 2M rows (generic case)', () => {
    const node = { id: 'c', type: 'clean' }
    const edges = [{ source: 'a', target: 'c' }]
    const est = estimateBlockLoad(node, edges, { a: ranWith(3_000_000) })
    expect(est.level).toBe('critical')
  })

  it('uses XLSX-specific thresholds for export', () => {
    const node = { id: 'x', type: 'export', data: { format: 'xlsx' } }
    const edges = [{ source: 'a', target: 'x' }]
    // 150k < 200k → not heavy for XLSX
    expect(estimateBlockLoad(node, edges, { a: ranWith(150_000) })).toBeNull()
    // 250k > 200k → heavy
    expect(estimateBlockLoad(node, edges, { a: ranWith(250_000) })?.level).toBe('heavy')
  })

  it('ignores edges from upstreams that have not run', () => {
    const node = { id: 'c', type: 'clean' }
    const edges = [
      { source: 'a', target: 'c' },
      { source: 'b', target: 'c' },
    ]
    // only `a` ran ; `b` is unknown → total = 200k, knownInputs = 1 → flagged
    const est = estimateBlockLoad(node, edges, { a: ranWith(200_000) })
    expect(est?.rows).toBe(200_000)
  })
})

describe('estimateWorkflowLoad', () => {
  it('collects only the flagged blocks', () => {
    const nodes = [
      { id: 'a', type: 'source' },
      { id: 'b', type: 'clean' },
      { id: 'c', type: 'pivot', data: { mode: 'pivot' } },
    ]
    const edges = [
      { source: 'a', target: 'b' },
      { source: 'b', target: 'c' },
    ]
    const status = { a: ranWith(200_000), b: ranWith(200_000) }
    const out = estimateWorkflowLoad(nodes, edges, status)
    expect(Object.keys(out).sort()).toEqual(['b', 'c'])
  })
})
