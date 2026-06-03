/*
 * Visual SQL builder. No SQL typing: the user selects inputs, columns,
 * operators and values from structured controls. Produces the query model
 * consumed by the backend (query_builder.py).
 */
import Icon from './Icon'

const AGG = ['SUM', 'AVG', 'MIN', 'MAX', 'COUNT', 'COUNT_DISTINCT', 'MEDIAN', 'STDDEV', 'STRING_AGG']
const OPS = ['=', '!=', '>', '>=', '<', '<=', 'LIKE', 'NOT LIKE', 'IN', 'NOT IN', 'IS NULL', 'IS NOT NULL', 'BETWEEN']
const JOIN_TYPES = ['INNER', 'LEFT', 'RIGHT', 'FULL', 'CROSS']
const VALUE_TYPES = [['text', 'texte'], ['number', 'nombre'], ['boolean', 'booléen'], ['raw', 'brut']]

function colOptions(inputs) {
  const out = []
  for (const inp of inputs)
    for (const c of inp.columns || [])
      out.push({ input: inp.alias, name: c.name, type: c.type })
  return out
}

// One dropdown that selects an (input, column) pair.
function ColPicker({ inputs, value, onChange, allowEmpty }) {
  const opts = colOptions(inputs)
  const v = value && value.column ? `${value.input}::${value.column}` : ''
  return (
    <select
      className="qb-select"
      value={v}
      onChange={(e) => {
        if (!e.target.value) return onChange(null)
        const [input, column] = e.target.value.split('::')
        onChange({ input, column })
      }}
    >
      {allowEmpty && <option value="">—</option>}
      {opts.length === 0 && <option value="">(exécutez les blocs en amont)</option>}
      {inputs.map((inp) => (
        <optgroup key={inp.alias} label={`${inp.alias} — ${inp.label || ''}`}>
          {(inp.columns || []).map((c) => (
            <option key={`${inp.alias}::${c.name}`} value={`${inp.alias}::${c.name}`}>
              {c.name} {c.type ? `(${c.type})` : ''}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  )
}

function Section({ title, children, onAdd, addLabel }) {
  return (
    <div className="qb-section">
      <div className="qb-section-head">
        <span>{title}</span>
        {onAdd && <button className="ghost small" onClick={onAdd}>+ {addLabel || 'Ajouter'}</button>}
      </div>
      <div className="qb-section-body">{children}</div>
    </div>
  )
}

export default function QueryBuilder({ value, onChange, inputs }) {
  const q = value || {}
  const set = (patch) => onChange({ ...q, ...patch })
  const list = (key) => q[key] || []
  const setList = (key, arr) => set({ [key]: arr })
  const upd = (key, i, patch) => {
    const arr = [...list(key)]
    arr[i] = { ...arr[i], ...patch }
    setList(key, arr)
  }
  const del = (key, i) => setList(key, list(key).filter((_, j) => j !== i))

  const hasSecond = inputs.length > 1
  const primary = inputs[0]?.alias || 'in1'

  return (
    <div className="qb">
      {inputs.length === 0 && (
        <div className="qb-warn">
          Connectez au moins une entrée (ancre <b>in1</b>) à ce bloc, puis exécutez les blocs
          amont pour charger leurs colonnes.
        </div>
      )}

      {/* ---------------- SELECT ---------------- */}
      <Section
        title="Colonnes en sortie (SELECT)"
        addLabel="colonne"
        onAdd={() => setList('select', [...list('select'), { kind: 'column', input: primary }])}
      >
        <label className="qb-check">
          <input type="checkbox" checked={!!q.distinct} onChange={(e) => set({ distinct: e.target.checked })} />
          Lignes distinctes (DISTINCT)
        </label>
        {list('select').length === 0 && <div className="qb-hint">Vide → toutes les colonnes (*)</div>}
        {list('select').map((it, i) => (
          <div className="qb-row" key={i}>
            <select className="qb-select narrow" value={it.kind || 'column'}
              onChange={(e) => upd('select', i, { kind: e.target.value })}>
              <option value="column">Colonne</option>
              <option value="agg">Agrégat</option>
              <option value="expr">Expression</option>
            </select>

            {it.kind === 'expr' ? (
              <input className="qb-input grow" placeholder="ex: Montant * 1.2"
                value={it.expression || ''} onChange={(e) => upd('select', i, { expression: e.target.value })} />
            ) : it.kind === 'agg' ? (
              <>
                <select className="qb-select narrow" value={it.func || 'SUM'}
                  onChange={(e) => upd('select', i, { func: e.target.value })}>
                  {AGG.map((a) => <option key={a}>{a}</option>)}
                </select>
                <ColPicker inputs={inputs} value={it} onChange={(v) => upd('select', i, v || { input: primary, column: '' })} />
              </>
            ) : (
              <ColPicker inputs={inputs} value={it} onChange={(v) => upd('select', i, v || { input: primary, column: '' })} />
            )}

            <input className="qb-input alias" placeholder="alias"
              value={it.alias || ''} onChange={(e) => upd('select', i, { alias: e.target.value })} />
            <button className="ghost danger small" onClick={() => del('select', i)}><Icon name="x" /></button>
          </div>
        ))}
      </Section>

      {/* ---------------- JOINS ---------------- */}
      {hasSecond && (
        <Section
          title="Jointures (JOIN)"
          addLabel="jointure"
          onAdd={() => setList('joins', [...list('joins'), {
            input: inputs[1].alias, type: 'INNER',
            on: [{ left_input: primary, left_column: '', right_input: inputs[1].alias, right_column: '' }],
          }])}
        >
          {list('joins').map((j, i) => (
            <div className="qb-block" key={i}>
              <div className="qb-row">
                <select className="qb-select narrow" value={j.type}
                  onChange={(e) => upd('joins', i, { type: e.target.value })}>
                  {JOIN_TYPES.map((t) => <option key={t}>{t}</option>)}
                </select>
                <span className="qb-lbl">JOIN</span>
                <select className="qb-select narrow" value={j.input}
                  onChange={(e) => upd('joins', i, { input: e.target.value })}>
                  {inputs.map((inp) => <option key={inp.alias} value={inp.alias}>{inp.alias}</option>)}
                </select>
                <button className="ghost danger small" onClick={() => del('joins', i)}><Icon name="x" /></button>
              </div>
              {j.type !== 'CROSS' && (j.on || []).map((c, k) => (
                <div className="qb-row indent" key={k}>
                  <span className="qb-lbl">ON</span>
                  <ColPicker inputs={inputs} value={{ input: c.left_input, column: c.left_column }}
                    onChange={(v) => updJoinOn(i, k, { left_input: v?.input, left_column: v?.column })} />
                  <span className="qb-eq">=</span>
                  <ColPicker inputs={inputs} value={{ input: c.right_input, column: c.right_column }}
                    onChange={(v) => updJoinOn(i, k, { right_input: v?.input, right_column: v?.column })} />
                </div>
              ))}
            </div>
          ))}
        </Section>
      )}

      {/* ---------------- WHERE ---------------- */}
      <Section title="Filtres (WHERE)" addLabel="filtre"
        onAdd={() => setList('where', [...list('where'), { input: primary, op: '=', value_type: 'text', connector: 'AND' }])}>
        {list('where').map((c, i) => (
          <ConditionRow key={i} c={c} i={i} inputs={inputs} onUpd={(p) => upd('where', i, p)} onDel={() => del('where', i)} showConnector={i > 0} />
        ))}
      </Section>

      {/* ---------------- GROUP BY ---------------- */}
      <Section title="Regroupement (GROUP BY)" addLabel="colonne"
        onAdd={() => setList('group_by', [...list('group_by'), { input: primary, column: '' }])}>
        {list('group_by').map((g, i) => (
          <div className="qb-row" key={i}>
            <ColPicker inputs={inputs} value={g} onChange={(v) => upd('group_by', i, v || { input: primary, column: '' })} />
            <button className="ghost danger small" onClick={() => del('group_by', i)}><Icon name="x" /></button>
          </div>
        ))}
      </Section>

      {/* ---------------- HAVING ---------------- */}
      {list('group_by').length > 0 && (
        <Section title="Filtres d'agrégat (HAVING)" addLabel="condition"
          onAdd={() => setList('having', [...list('having'), { func: 'SUM', input: primary, op: '>', value_type: 'number', connector: 'AND' }])}>
          {list('having').map((c, i) => (
            <div className="qb-row" key={i}>
              {i > 0 && <select className="qb-select tiny" value={c.connector || 'AND'} onChange={(e) => upd('having', i, { connector: e.target.value })}><option>AND</option><option>OR</option></select>}
              <select className="qb-select tiny" value={c.func || 'SUM'} onChange={(e) => upd('having', i, { func: e.target.value })}>
                {AGG.map((a) => <option key={a}>{a}</option>)}
              </select>
              <ColPicker inputs={inputs} value={c} onChange={(v) => upd('having', i, v || {})} />
              <select className="qb-select tiny" value={c.op} onChange={(e) => upd('having', i, { op: e.target.value })}>
                {OPS.map((o) => <option key={o}>{o}</option>)}
              </select>
              <input className="qb-input narrow" value={c.value || ''} onChange={(e) => upd('having', i, { value: e.target.value })} />
              <button className="ghost danger small" onClick={() => del('having', i)}><Icon name="x" /></button>
            </div>
          ))}
        </Section>
      )}

      {/* ---------------- ORDER BY ---------------- */}
      <Section title="Tri (ORDER BY)" addLabel="colonne"
        onAdd={() => setList('order_by', [...list('order_by'), { input: primary, column: '', dir: 'ASC' }])}>
        {list('order_by').map((o, i) => (
          <div className="qb-row" key={i}>
            <ColPicker inputs={inputs} value={o} onChange={(v) => upd('order_by', i, v || { input: primary, column: '' })} />
            <select className="qb-select narrow" value={o.dir} onChange={(e) => upd('order_by', i, { dir: e.target.value })}>
              <option value="ASC">croissant</option>
              <option value="DESC">décroissant</option>
            </select>
            <button className="ghost danger small" onClick={() => del('order_by', i)}><Icon name="x" /></button>
          </div>
        ))}
      </Section>

      {/* ---------------- LIMIT ---------------- */}
      <Section title="Limite de lignes (LIMIT)">
        <input className="qb-input narrow" type="number" min="0" placeholder="aucune"
          value={q.limit ?? ''} onChange={(e) => set({ limit: e.target.value === '' ? null : Number(e.target.value) })} />
      </Section>
    </div>
  )

  function updJoinOn(ji, ci, patch) {
    const joins = [...list('joins')]
    const on = [...(joins[ji].on || [])]
    on[ci] = { ...on[ci], ...patch }
    joins[ji] = { ...joins[ji], on }
    setList('joins', joins)
  }
}

function ConditionRow({ c, inputs, onUpd, onDel, showConnector }) {
  const noValue = c.op === 'IS NULL' || c.op === 'IS NOT NULL'
  return (
    <div className="qb-row">
      {showConnector && (
        <select className="qb-select tiny" value={c.connector || 'AND'} onChange={(e) => onUpd({ connector: e.target.value })}>
          <option>AND</option><option>OR</option>
        </select>
      )}
      <ColPicker inputs={inputs} value={c} onChange={(v) => onUpd(v || {})} />
      <select className="qb-select tiny" value={c.op} onChange={(e) => onUpd({ op: e.target.value })}>
        {OPS.map((o) => <option key={o}>{o}</option>)}
      </select>
      {!noValue && (
        <>
          <input className="qb-input narrow" placeholder={c.op === 'IN' || c.op === 'NOT IN' ? 'a, b, c' : 'valeur'}
            value={c.value || ''} onChange={(e) => onUpd({ value: e.target.value })} />
          {c.op === 'BETWEEN' && (
            <input className="qb-input narrow" placeholder="et…" value={c.value2 || ''} onChange={(e) => onUpd({ value2: e.target.value })} />
          )}
          <select className="qb-select tiny" value={c.value_type || 'text'} onChange={(e) => onUpd({ value_type: e.target.value })}>
            {VALUE_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </>
      )}
      <button className="ghost danger small" onClick={onDel}><Icon name="x" /></button>
    </div>
  )
}
