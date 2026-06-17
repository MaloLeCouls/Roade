import { useEffect, useState } from 'react'
import { api } from '../api'
import QueryBuilder from './QueryBuilder'
import Icon from './Icon'
import { ConditionsEditor, RuleRow, MaskBuilder, RulesBuilder } from './routing'
import { EXTRACTOR_TYPES, defaultExtractor } from './validateHelpers'

export default function Inspector({
  pid,
  node,
  files,
  inputs,
  onChange,
  onSchema,
  onDelete,
  wfName,
}) {
  if (!node) {
    return (
      <div className="inspector empty-inspector">
        <p className="muted">
          Sélectionnez un bloc pour le configurer, ou ajoutez-en un depuis la barre d'outils.
        </p>
        <div className="legend">
          <div>
            <span className="dot src" /> Source — lit un fichier Excel/CSV
          </div>
          <div>
            <span className="dot sql" /> SQL — transforme les données
          </div>
          <div>
            <span className="dot exp" /> Export — écrit un fichier
          </div>
        </div>
      </div>
    )
  }
  const set = (patch) => onChange(node.id, patch)
  return (
    <div className="inspector">
      <div className="insp-head">
        <input
          className="insp-title"
          value={node.data.label || ''}
          onChange={(e) => set({ label: e.target.value })}
        />
        <button className="ghost danger small" onClick={() => onDelete(node.id)}>
          Supprimer
        </button>
      </div>
      <div className="insp-type">
        <span>{typeLabel(node.type)}</span>
        {node.type !== 'export' && (
          <label
            className="lock-toggle"
            title="Verrouiller : le bloc n'est pas recalculé tant qu'il est verrouillé (fige le résultat même si la source change)."
          >
            <input
              type="checkbox"
              checked={!!node.data.locked}
              onChange={(e) => set({ locked: e.target.checked })}
            />
            <Icon name="lock" size={12} /> Verrouiller le résultat
          </label>
        )}
      </div>

      <label className="fld insp-desc">
        <span>Commentaire (s'affiche au-dessus du bloc)</span>
        <textarea
          rows={2}
          placeholder="Décrivez ce que fait ce bloc, pour la vue d'ensemble…"
          value={node.data.description || ''}
          onChange={(e) => set({ description: e.target.value })}
        />
      </label>

      {node.type === 'source' && (
        <SourceConfig pid={pid} node={node} files={files} set={set} onSchema={onSchema} />
      )}
      {node.type === 'sql' && <SqlConfig node={node} inputs={inputs} set={set} />}
      {node.type === 'dedup' && <DedupConfig node={node} inputs={inputs} set={set} />}
      {node.type === 'validate' && <ValidateConfig node={node} inputs={inputs} set={set} />}
      {node.type === 'pivot' && <PivotConfig node={node} inputs={inputs} set={set} />}
      {node.type === 'clean' && <CleanConfig node={node} inputs={inputs} set={set} />}
      {node.type === 'calc' && <CalcConfig node={node} inputs={inputs} set={set} />}
      {node.type === 'filter' && <FilterConfig node={node} inputs={inputs} set={set} />}
      {node.type === 'cols' && <ColsConfig node={node} inputs={inputs} set={set} />}
      {node.type === 'report' && <ReportConfig node={node} inputs={inputs} set={set} />}
      {node.type === 'union' && <UnionConfig node={node} inputs={inputs} set={set} />}
      {node.type === 'export' && <ExportConfig node={node} set={set} wfName={wfName} />}
    </div>
  )
}

export function typeLabel(t) {
  return (
    {
      source: 'Bloc Source',
      sql: 'Bloc SQL',
      dedup: 'Bloc Doublons',
      validate: 'Bloc Validation',
      pivot: 'Bloc Pivot',
      clean: 'Bloc Nettoyage',
      calc: 'Bloc Calcul',
      filter: 'Bloc Filtre',
      cols: 'Bloc Colonnes',
      report: 'Bloc Analyse',
      union: 'Bloc Union',
      export: 'Bloc Export',
      frame: 'Cadre',
    }[t] || t
  )
}

function ValidateConfig({ node, inputs, set }) {
  const cols = inputs[0]?.columns || []
  const d = node.data
  const split = d.split || {}
  const isSplit = !!split.enabled
  return (
    <div className="insp-body">
      {inputs.length === 0 && (
        <div className="qb-warn">
          Connectez une entrée puis exécutez l'amont pour charger les colonnes.
        </div>
      )}
      <div className="mode-toggle">
        <button
          className={!isSplit ? 'on' : ''}
          onClick={() => {
            if (isSplit) set({ split: { ...split, enabled: false }, outputs: [] })
          }}
        >
          Conditions
        </button>
        <button
          className={isSplit ? 'on' : ''}
          onClick={() => {
            if (!isSplit)
              set({
                split: {
                  column: split.column || d.target_column || '',
                  extractor: split.extractor || defaultExtractor(),
                  enabled: true,
                },
                outputs: [],
              })
          }}
        >
          Éclater par valeur
        </button>
      </div>

      {isSplit ? (
        <SplitConfig node={node} cols={cols} set={set} />
      ) : (
        <>
          <div className="ports-head">
            <span className="ports-title">Conditions</span>
            <InfoBubble>
              Définissez des <b>conditions</b> nommées (en <b>règles</b> ou en <b>masque</b>). À
              droite, attribuez chaque condition à une <b>sortie</b> — un contrôle « conforme / non
              conforme » n'est qu'un aiguillage à deux sorties.
            </InfoBubble>
          </div>
          <ConditionsEditor node={node} cols={cols} onChange={set} />
        </>
      )}
    </div>
  )
}

// "Split by value" settings: a column + an extraction rule (the "part to watch").
// The distinct values are turned into outputs by the "Scanner" button (right pane).
function SplitConfig({ node, cols, set }) {
  const d = node.data
  const split = d.split || {}
  const ex = split.extractor || defaultExtractor()
  const setEx = (patch) => set({ split: { ...split, extractor: { ...ex, ...patch } } })
  return (
    <div>
      <div className="ports-head">
        <span className="ports-title">Éclater par valeur</span>
        <InfoBubble>
          Définissez la <b>partie à observer</b> d'une colonne (ex. ce qui suit le dernier « . » =
          l'extension). Puis, à droite, cliquez sur <b>Scanner</b> : une <b>sortie</b> est créée
          automatiquement pour chaque valeur distincte trouvée. Les sorties restent figées jusqu'au
          prochain scan.
        </InfoBubble>
      </div>
      <label className="fld">
        <span>Colonne à éclater</span>
        <select
          value={split.column || ''}
          onChange={(e) => set({ split: { ...split, column: e.target.value } })}
        >
          <option value="">—</option>
          {cols.length === 0 && <option value="">(exécutez l'amont)</option>}
          {cols.map((c) => (
            <option key={c.name} value={c.name}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <label className="fld">
        <span>Méthode d'extraction</span>
        <select
          value={ex.type || 'after_last'}
          onChange={(e) => {
            const t = e.target.value
            const sep = { before_first: '_', segment: '\\', after_last: '.' }[t]
            setEx(sep !== undefined ? { type: t, sep } : { type: t })
          }}
        >
          {EXTRACTOR_TYPES.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </label>
      {(ex.type === 'after_last' ||
        !ex.type ||
        ex.type === 'before_first' ||
        ex.type === 'segment') && (
        <label className="fld">
          <span>Séparateur</span>
          <input
            className="qb-input"
            value={
              ex.sep ?? (ex.type === 'before_first' ? '_' : ex.type === 'segment' ? '\\' : '.')
            }
            onChange={(e) => setEx({ sep: e.target.value })}
            style={{ width: 80 }}
          />
        </label>
      )}
      {ex.type === 'segment' && (
        <label className="fld">
          <span>Niveau (Nᵉ segment ; négatif = depuis la fin, -1 = dernier)</span>
          <input
            className="qb-input"
            type="number"
            value={ex.index ?? 2}
            onChange={(e) => setEx({ index: e.target.value })}
            style={{ width: 90 }}
          />
        </label>
      )}
      {ex.type === 'substring' && (
        <div className="qb-row">
          <label className="fld">
            <span>Position (1ᵉʳ caractère)</span>
            <input
              className="qb-input"
              type="number"
              min="1"
              value={ex.start ?? 1}
              onChange={(e) => setEx({ start: e.target.value })}
              style={{ width: 80 }}
            />
          </label>
          <label className="fld">
            <span>Longueur (vide = jusqu'à la fin)</span>
            <input
              className="qb-input"
              type="number"
              min="1"
              value={ex.length ?? ''}
              onChange={(e) => setEx({ length: e.target.value })}
              style={{ width: 110 }}
            />
          </label>
        </div>
      )}
      {ex.type === 'regex' && (
        <label className="fld">
          <span>Expression régulière (1ᵉʳ groupe capturé = clé)</span>
          <input
            className="qb-input"
            value={ex.pattern || ''}
            placeholder="ex. \.(\w+)$"
            onChange={(e) => setEx({ pattern: e.target.value })}
          />
        </label>
      )}
      <label className="qb-check" style={{ marginTop: 4 }}>
        <input
          type="checkbox"
          checked={!!d.case_sensitive}
          onChange={(e) => set({ case_sensitive: e.target.checked })}
        />
        Sensible à la casse
      </label>
    </div>
  )
}

const CLEAN_OPS = [
  ['trim', 'Supprimer les espaces'],
  ['upper', 'MAJUSCULES'],
  ['lower', 'minuscules'],
  ['capitalize', 'Capitaliser'],
  ['replace', 'Rechercher / remplacer'],
  ['fillna', 'Remplir les vides'],
  ['to_number', 'Convertir en nombre'],
  ['to_integer', 'Convertir en entier'],
  ['to_date', 'Convertir en date'],
  ['round', 'Arrondir'],
  ['abs', 'Valeur absolue'],
]
const PIVOT_AGG = ['SUM', 'AVG', 'MIN', 'MAX', 'COUNT', 'MEDIAN', 'FIRST', 'LAST']

// Group/window functions for the Calcul block: [value, label, needsColumn, needsOrder]
//   'value_when' has its OWN inline editor (condition + source + reducer + fallback)
//   so neither needsColumn nor needsOrder applies; the dedicated panel handles
//   everything below the function picker.
const GROUP_FUNCS = [
  ['occurrence', "N° d'occurrence dans le groupe", false, true],
  ['group_size', 'Taille du groupe (nb de lignes)', false, false],
  ['count_distinct', 'Nb de valeurs distinctes de…', true, false],
  ['is_duplicate', 'En conflit (valeur répétée dans le groupe)', true, false],
  ['sum', 'Somme de…', true, false],
  ['avg', 'Moyenne de…', true, false],
  ['min', 'Minimum de…', true, false],
  ['max', 'Maximum de…', true, false],
  ['median', 'Médiane de…', true, false],
  ['share', 'Part dans le total du groupe (…)', true, false],
  ['first', 'Première valeur de… (selon le tri)', true, true],
  ['last', 'Dernière valeur de… (selon le tri)', true, true],
  ['prev', 'Valeur précédente de… (selon le tri)', true, true],
  ['next', 'Valeur suivante de… (selon le tri)', true, true],
  ['concat', 'Lister les valeurs de… (séparées par « , »)', true, false],
  ['value_when', 'Valeur conditionnelle (depuis la ligne qui matche)', false, false],
]
const GROUP_NEEDS_COL = new Set(GROUP_FUNCS.filter((f) => f[2]).map((f) => f[0]))
const GROUP_NEEDS_ORDER = new Set(GROUP_FUNCS.filter((f) => f[3]).map((f) => f[0]))

// value_when reducers ; 'first' / 'last' are the only ones that need a sort
// order (the others are commutative and ignore the row order).
const VW_REDUCERS = [
  ['first', 'la première (selon le tri)'],
  ['last', 'la dernière (selon le tri)'],
  ['min', 'la plus petite (numérique)'],
  ['max', 'la plus grande (numérique)'],
  ['sum', 'la somme (numérique)'],
  ['avg', 'la moyenne (numérique)'],
  ['concat', 'toutes (concaténées par « , »)'],
]
const VW_NEEDS_ORDER = new Set(['first', 'last'])

function defaultGroupName(fn, col) {
  const c = col || 'valeur'
  return (
    {
      occurrence: 'occurrence',
      group_size: 'taille_groupe',
      count_distinct: `nb_${c}_distinct`,
      is_duplicate: `conflit_${c}`,
      sum: `somme_${c}`,
      avg: `moyenne_${c}`,
      min: `min_${c}`,
      max: `max_${c}`,
      median: `mediane_${c}`,
      share: `part_${c}`,
      first: `premier_${c}`,
      last: `dernier_${c}`,
      prev: `${c}_precedent`,
      next: `${c}_suivant`,
      concat: `liste_${c}`,
      value_when: 'valeur_si',
    }[fn] || 'groupe'
  )
}

function ColSelect({ inputs, value, onChange, allowEmpty }) {
  const cols = inputs[0]?.columns || []
  return (
    <select value={value || ''} onChange={(e) => onChange(e.target.value)}>
      {allowEmpty && <option value="">—</option>}
      {cols.length === 0 && <option value="">(exécutez l'amont)</option>}
      {cols.map((c) => (
        <option key={c.name} value={c.name}>
          {c.name}
        </option>
      ))}
    </select>
  )
}

function ColChecklist({ inputs, selected, onToggle }) {
  const cols = inputs[0]?.columns || []
  return (
    <div className="checklist">
      {cols.length === 0 && <div className="qb-hint">— colonnes non chargées —</div>}
      {cols.map((c) => (
        <label key={c.name} className="qb-check">
          <input
            type="checkbox"
            checked={selected.includes(c.name)}
            onChange={() => onToggle(c.name)}
          />
          {c.name} <span className="coltype-inline">{c.type}</span>
        </label>
      ))}
    </div>
  )
}

function PivotConfig({ node, inputs, set }) {
  const d = node.data
  const mode = d.mode || 'pivot'
  const idx = d.index_columns || []
  const vals = d.value_columns || []
  const toggleIdx = (c) =>
    set({ index_columns: idx.includes(c) ? idx.filter((x) => x !== c) : [...idx, c] })
  const toggleVal = (c) =>
    set({ value_columns: vals.includes(c) ? vals.filter((x) => x !== c) : [...vals, c] })
  return (
    <div className="insp-body">
      <div className="mode-toggle">
        <button className={mode === 'pivot' ? 'on' : ''} onClick={() => set({ mode: 'pivot' })}>
          Pivot
        </button>
        <button className={mode === 'unpivot' ? 'on' : ''} onClick={() => set({ mode: 'unpivot' })}>
          Dépivot
        </button>
      </div>

      {mode === 'pivot' ? (
        <>
          <p className="qb-hint">
            Transforme les valeurs d'une colonne en nouvelles colonnes (comme un TCD Excel).
          </p>
          <div className="fld">
            <span>Lignes (colonnes conservées)</span>
            <ColChecklist inputs={inputs} selected={idx} onToggle={toggleIdx} />
          </div>
          <label className="fld">
            <span>Colonne à éclater en colonnes</span>
            <ColSelect
              inputs={inputs}
              value={d.pivot_column}
              onChange={(v) => set({ pivot_column: v })}
              allowEmpty
            />
          </label>
          <label className="fld">
            <span>Colonne de valeurs</span>
            <ColSelect
              inputs={inputs}
              value={d.value_column}
              onChange={(v) => set({ value_column: v })}
              allowEmpty
            />
          </label>
          <label className="fld">
            <span>Agrégat</span>
            <select value={d.agg || 'SUM'} onChange={(e) => set({ agg: e.target.value })}>
              {PIVOT_AGG.map((a) => (
                <option key={a}>{a}</option>
              ))}
            </select>
          </label>
        </>
      ) : (
        <>
          <p className="qb-hint">Transforme plusieurs colonnes en deux colonnes (nom, valeur).</p>
          <div className="fld">
            <span>Colonnes à dépivoter</span>
            <ColChecklist inputs={inputs} selected={vals} onToggle={toggleVal} />
          </div>
          <label className="fld">
            <span>Nom de la colonne « nom »</span>
            <input
              value={d.name_column || ''}
              placeholder="variable"
              onChange={(e) => set({ name_column: e.target.value })}
            />
          </label>
          <label className="fld">
            <span>Nom de la colonne « valeur »</span>
            <input
              value={d.value_column || ''}
              placeholder="valeur"
              onChange={(e) => set({ value_column: e.target.value })}
            />
          </label>
        </>
      )}
    </div>
  )
}

function CleanConfig({ node, inputs, set }) {
  const d = node.data
  const ops = d.operations || []
  const upd = (i, patch) =>
    set({ operations: ops.map((o, j) => (j === i ? { ...o, ...patch } : o)) })
  const del = (i) => set({ operations: ops.filter((_, j) => j !== i) })
  const add = () =>
    set({
      operations: [
        ...ops,
        { op: 'trim', column: inputs[0]?.columns?.[0]?.name || '', enabled: true },
      ],
    })
  const move = (i, dir) => {
    const j = i + dir
    if (j < 0 || j >= ops.length) return
    const a = [...ops]
    ;[a[i], a[j]] = [a[j], a[i]]
    set({ operations: a })
  }
  return (
    <div className="insp-body">
      {inputs.length === 0 && (
        <div className="qb-warn">
          Connectez une entrée puis exécutez l'amont pour charger les colonnes.
        </div>
      )}
      <p className="qb-hint">
        Les opérations s'appliquent dans l'ordre, l'une après l'autre. Un rapport montre à chaque
        exécution ce qui a changé / échoué.
      </p>
      <button className="ghost small" onClick={add}>
        + Opération
      </button>
      <div className="clean-ops">
        {ops.map((o, i) => (
          <div className={`clean-op ${o.enabled === false ? 'off' : ''}`} key={i}>
            <div className="qb-row">
              <input
                type="checkbox"
                checked={o.enabled !== false}
                onChange={(e) => upd(i, { enabled: e.target.checked })}
                title="Activer / désactiver"
              />
              <select
                className="qb-select"
                value={o.op}
                onChange={(e) => upd(i, { op: e.target.value })}
              >
                {CLEAN_OPS.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
              <span className="qb-lbl">sur</span>
              <select
                className="qb-select"
                value={o.column || ''}
                onChange={(e) => upd(i, { column: e.target.value })}
              >
                <option value="">— colonne —</option>
                {(inputs[0]?.columns || []).map((c) => (
                  <option key={c.name} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            {o.op === 'replace' && (
              <div className="qb-row indent">
                <input
                  className="qb-input"
                  placeholder="chercher"
                  value={o.find || ''}
                  onChange={(e) => upd(i, { find: e.target.value })}
                />
                <span className="qb-eq">→</span>
                <input
                  className="qb-input"
                  placeholder="remplacer"
                  value={o.replace || ''}
                  onChange={(e) => upd(i, { replace: e.target.value })}
                />
                <label className="qb-check">
                  <input
                    type="checkbox"
                    checked={!!o.regex}
                    onChange={(e) => upd(i, { regex: e.target.checked })}
                  />
                  regex
                </label>
              </div>
            )}
            {o.op === 'fillna' && (
              <div className="qb-row indent">
                <span className="qb-lbl">par</span>
                <input
                  className="qb-input"
                  placeholder="valeur"
                  value={o.value || ''}
                  onChange={(e) => upd(i, { value: e.target.value })}
                />
                <select
                  className="qb-select tiny"
                  value={o.value_type || 'text'}
                  onChange={(e) => upd(i, { value_type: e.target.value })}
                >
                  <option value="text">texte</option>
                  <option value="number">nombre</option>
                </select>
              </div>
            )}
            {o.op === 'to_date' && (
              <div className="qb-row indent">
                <input
                  className="qb-input"
                  placeholder="format ex: %d/%m/%Y (vide = auto)"
                  value={o.format || ''}
                  onChange={(e) => upd(i, { format: e.target.value })}
                />
              </div>
            )}
            {o.op === 'round' && (
              <div className="qb-row indent">
                <span className="qb-lbl">décimales</span>
                <input
                  className="qb-input narrow"
                  type="number"
                  min="0"
                  value={o.digits ?? 0}
                  onChange={(e) => upd(i, { digits: Number(e.target.value) })}
                />
              </div>
            )}
            <div className="clean-op-actions">
              <button className="mini" onClick={() => move(i, -1)} disabled={i === 0}>
                <Icon name="up" />
              </button>
              <button className="mini" onClick={() => move(i, 1)} disabled={i === ops.length - 1}>
                <Icon name="down" />
              </button>
              <button className="ghost danger small" onClick={() => del(i)}>
                <Icon name="x" />
              </button>
            </div>
          </div>
        ))}
        {ops.length === 0 && <div className="qb-hint">Aucune opération.</div>}
      </div>
    </div>
  )
}

const CALC_EXAMPLES = [
  ['prix_ttc', '[prix_ht] * 1.2'],
  ['statut', 'IF([stock] > 0, "OK", "Rupture")'],
  ['nom_complet', '[nom] & " " & [prenom]'],
  ['nom_fichier', 'TEXTAFTER([chemin], "\\", -1)'],
  ['sans_extension', 'TEXTBEFORE(TEXTAFTER([chemin], "\\", -1), ".", -1)'],
]

function GroupCalcSection({ d, cols, set }) {
  const g = d.group || {}
  const part = g.partition_by || []
  const funcs = g.functions || []
  const order = g.order_by || []
  const orderCol = order[0]?.column || ''
  const orderDesc = !!order[0]?.desc
  const setG = (patch) => set({ group: { ...g, ...patch } })
  const togglePart = (c) =>
    setG({ partition_by: part.includes(c) ? part.filter((x) => x !== c) : [...part, c] })
  const updF = (i, patch) =>
    setG({ functions: funcs.map((o, j) => (j === i ? { ...o, ...patch } : o)) })
  const delF = (i) => setG({ functions: funcs.filter((_, j) => j !== i) })
  const addF = () =>
    setG({ functions: [...funcs, { fn: 'group_size', name: 'taille_groupe', enabled: true }] })
  // changing the function (or its column) refreshes an auto-generated name only
  // when the user hasn't typed their own. value_when also gets a minimal default
  // skeleton so the user lands on a usable form (one empty rule) instead of an
  // empty panel inviting them to click "+ Groupe (OU)" first.
  const setFn = (i, fn) => {
    const cur = funcs[i]
    const wasAuto = !cur.name || cur.name === defaultGroupName(cur.fn, cur.column)
    const patch = { fn, name: wasAuto ? defaultGroupName(fn, cur.column) : cur.name }
    if (fn === 'value_when' && !cur.condition) {
      patch.condition = { groups: [{ rules: [{ test: 'equals', value: '' }] }] }
      patch.source = cur.source || { kind: 'column' }
      patch.reducer = cur.reducer || 'first'
      patch.fallback = cur.fallback || { mode: 'null' }
    }
    updF(i, patch)
  }
  const setCol = (i, column) => {
    const cur = funcs[i]
    const wasAuto = !cur.name || cur.name === defaultGroupName(cur.fn, cur.column)
    updF(i, { column, name: wasAuto ? defaultGroupName(cur.fn, column) : cur.name })
  }
  // 'value_when' also wants the order when its reducer is first/last, so it
  // unlocks the shared "trier par" row just like the other ordered functions.
  const needsOrder = funcs.some(
    (f) =>
      f.enabled !== false &&
      (GROUP_NEEDS_ORDER.has(f.fn) ||
        (f.fn === 'value_when' && VW_NEEDS_ORDER.has(f.reducer || 'first'))),
  )
  const open = part.length > 0 || funcs.length > 0

  return (
    <details className="group-calc" open={open}>
      <summary>
        <span className="ports-title">Par groupe</span>
        <InfoBubble>
          Regroupe les lignes qui partagent une <b>clé</b> (1+ colonnes), puis ajoute des colonnes
          calculées sur chaque groupe : n° d'occurrence, taille, nb de valeurs distinctes,
          somme/part…
          <br />
          <b>« En conflit »</b> marque <b>oui</b> les lignes dont une valeur se répète dans le
          groupe (ex. même fichier → la config doit être unique).
        </InfoBubble>
      </summary>

      <div className="fld">
        <div className="fld-head">
          <span>Clé de regroupement</span>
        </div>
        <div className="checklist">
          {cols.length === 0 && <div className="qb-hint">— colonnes non chargées —</div>}
          {cols.map((c) => (
            <label key={c.name} className="qb-check">
              <input
                type="checkbox"
                checked={part.includes(c.name)}
                onChange={() => togglePart(c.name)}
              />
              {c.name} <span className="coltype-inline">{c.type}</span>
            </label>
          ))}
        </div>
      </div>

      {needsOrder && (
        <div className="qb-row">
          <span className="qb-lbl">trier par</span>
          <select
            className="qb-select"
            value={orderCol}
            onChange={(e) =>
              setG({
                order_by: e.target.value ? [{ column: e.target.value, desc: orderDesc }] : [],
              })
            }
          >
            <option value="">— ordre du fichier —</option>
            {cols.map((c) => (
              <option key={c.name} value={c.name}>
                {c.name}
              </option>
            ))}
          </select>
          {orderCol && (
            <label className="qb-check" style={{ marginBottom: 0 }}>
              <input
                type="checkbox"
                checked={orderDesc}
                onChange={(e) => setG({ order_by: [{ column: orderCol, desc: e.target.checked }] })}
              />
              décroissant
            </label>
          )}
        </div>
      )}

      <button className="ghost small" onClick={addF}>
        + Colonne par groupe
      </button>
      <div className="clean-ops">
        {funcs.map((o, i) => (
          <div className={`clean-op ${o.enabled === false ? 'off' : ''}`} key={i}>
            <div className="qb-row">
              <input
                type="checkbox"
                checked={o.enabled !== false}
                onChange={(e) => updF(i, { enabled: e.target.checked })}
                title="Activer / désactiver"
              />
              <select
                className="qb-select"
                value={o.fn || 'group_size'}
                onChange={(e) => setFn(i, e.target.value)}
              >
                {GROUP_FUNCS.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
              <button className="ghost danger small" onClick={() => delF(i)}>
                <Icon name="x" />
              </button>
            </div>
            <div className="qb-row indent">
              {GROUP_NEEDS_COL.has(o.fn) && (
                <select
                  className="qb-select"
                  value={o.column || ''}
                  onChange={(e) => setCol(i, e.target.value)}
                  title="Colonne concernée"
                >
                  <option value="">— colonne —</option>
                  {cols.map((c) => (
                    <option key={c.name} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                </select>
              )}
              <span className="qb-lbl">→</span>
              <input
                className="qb-input"
                placeholder="nom de la colonne"
                value={o.name || ''}
                onChange={(e) => updF(i, { name: e.target.value })}
              />
            </div>
            {o.fn === 'value_when' && (
              <ValueWhenEditor item={o} cols={cols} onChange={(patch) => updF(i, patch)} />
            )}
          </div>
        ))}
        {funcs.length === 0 && (
          <div className="qb-hint">
            Aucune colonne par groupe. Choisissez une clé puis « + Colonne par groupe ».
          </div>
        )}
      </div>
    </details>
  )
}

// Dedicated editor for the 'value_when' group function: a DNF condition (same
// builder as Validation/Routage), a source (column or formula), a reducer for
// when several rows match, and an optional fixed fallback for groups with no
// match. Everything is stored inside the function dict so the row stays self-
// describing for the backend.
function ValueWhenEditor({ item, cols, onChange }) {
  const src = item.source || { kind: 'column' }
  const fb = item.fallback || { mode: 'null' }
  const cond = item.condition || { groups: [] }
  const setSrc = (patch) => onChange({ source: { ...src, ...patch } })
  return (
    <div className="vw-editor">
      <div className="vw-block">
        <div className="vw-h">
          <span className="vw-tag">QUAND</span> la ligne respecte&nbsp;:
        </div>
        <RulesBuilder
          groups={cond.groups || []}
          cols={cols}
          defaultCol={null}
          onChange={(groups) => onChange({ condition: { groups } })}
        />
      </div>
      <div className="vw-block">
        <div className="vw-h">
          <span className="vw-tag alors">ALORS</span> prendre&nbsp;:
        </div>
        <div className="qb-row">
          <div className="mode-toggle sm">
            <button
              className={src.kind !== 'formula' ? 'on' : ''}
              onClick={() => setSrc({ kind: 'column' })}
            >
              Colonne
            </button>
            <button
              className={src.kind === 'formula' ? 'on' : ''}
              onClick={() => setSrc({ kind: 'formula' })}
            >
              Formule
            </button>
          </div>
          {src.kind === 'formula' ? (
            <input
              className="qb-input vw-formula"
              placeholder='ex : [val] & "=" & [n]'
              value={src.expr || ''}
              onChange={(e) => setSrc({ expr: e.target.value })}
            />
          ) : (
            <select
              className="qb-select"
              value={src.column || ''}
              onChange={(e) => setSrc({ column: e.target.value })}
            >
              <option value="">— colonne —</option>
              {cols.map((c) => (
                <option key={c.name} value={c.name}>
                  {c.name}
                </option>
              ))}
            </select>
          )}
        </div>
        <div className="qb-row">
          <span className="qb-lbl">si plusieurs lignes matchent, garder</span>
          <select
            className="qb-select"
            value={item.reducer || 'first'}
            onChange={(e) => onChange({ reducer: e.target.value })}
          >
            {VW_REDUCERS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </div>
        <div className="qb-row">
          <span className="qb-lbl">si aucune ne matche</span>
          <select
            className="qb-select tiny"
            value={fb.mode || 'null'}
            onChange={(e) => onChange({ fallback: { ...fb, mode: e.target.value } })}
          >
            <option value="null">vide (NULL)</option>
            <option value="value">valeur fixe</option>
          </select>
          {fb.mode === 'value' && (
            <input
              className="qb-input"
              placeholder="valeur de repli"
              value={fb.value ?? ''}
              onChange={(e) => onChange({ fallback: { ...fb, value: e.target.value } })}
            />
          )}
        </div>
      </div>
    </div>
  )
}

/* ----- visual builder for a calculated column: an `op` model -> a formula --- *
 * The op is stored on the column so the form can be re-edited; we also generate
 * the `expr` formula string the backend already compiles — the backend is
 * unchanged. 'formula' is the advanced escape hatch (raw textarea).           */
const CALC_OPS = [
  ['extract', 'Extraire du texte'],
  ['transform', 'Transformer du texte'],
  ['combine', 'Combiner (coller) des colonnes'],
  ['condition', 'Condition (Si… alors…)'],
  ['math', 'Calcul (nombres)'],
  ['formula', 'Formule (avancé)'],
]
const EXTRACT_WHAT = [
  ['after_sep', 'le texte après un séparateur'],
  ['before_sep', 'le texte avant un séparateur'],
  ['first_n', 'les N premiers caractères'],
  ['last_n', 'les N derniers caractères'],
  ['mid', 'à partir d’une position'],
]
const OCCURRENCES = [
  ['first', 'première'],
  ['last', 'dernière'],
  ['nth', 'n-ième'],
]
const TRANSFORMS = [
  ['upper', 'MAJUSCULES'],
  ['lower', 'minuscules'],
  ['trim', 'enlever les espaces'],
  ['replace', 'remplacer un texte'],
]
const CMPS = [
  ['=', '='],
  ['<>', '≠'],
  ['>', '>'],
  ['>=', '≥'],
  ['<', '<'],
  ['<=', '≤'],
  ['contains', 'contient'],
]
const MATH_OPS = [
  ['+', '+'],
  ['-', '−'],
  ['*', '×'],
  ['/', '÷'],
]

const _lit = (s) => '"' + String(s ?? '').replace(/"/g, '""') + '"'
const _colref = (c) => `[${c}]`
const _isNum = (v) => v !== '' && v != null && !isNaN(Number(v))
const _num = (v, def) => (v === '' || v == null || isNaN(Number(v)) ? def : Number(v))
const _valExpr = (v, isCol) => (isCol ? (v ? _colref(v) : '""') : _isNum(v) ? String(v) : _lit(v))

function buildCalcExpr(op) {
  if (!op) return ''
  const c = op.column
  switch (op.kind) {
    case 'extract': {
      if (!c) return ''
      const w = op.what || 'after_sep'
      if (w === 'first_n') return `LEFT(${_colref(c)}, ${_num(op.n, 1)})`
      if (w === 'last_n') return `RIGHT(${_colref(c)}, ${_num(op.n, 1)})`
      if (w === 'mid') return `MID(${_colref(c)}, ${_num(op.start, 1)}, ${_num(op.n, 5)})`
      const fn = w === 'before_sep' ? 'TEXTBEFORE' : 'TEXTAFTER'
      const inst =
        op.occurrence === 'last' ? -1 : op.occurrence === 'nth' ? _num(op.instance, 1) : 1
      return `${fn}(${_colref(c)}, ${_lit(op.sep ?? '')}, ${inst})`
    }
    case 'transform': {
      if (!c) return ''
      const t = op.transform || 'upper'
      if (t === 'replace')
        return `SUBSTITUTE(${_colref(c)}, ${_lit(op.find ?? '')}, ${_lit(op.replace ?? '')})`
      return `${t.toUpperCase()}(${_colref(c)})`
    }
    case 'combine': {
      const segs = (op.parts || [])
        .map((p) => (p.type === 'text' ? _lit(p.value) : p.value ? _colref(p.value) : ''))
        .filter(Boolean)
      if (!segs.length) return ''
      return segs.join(op.sep ? ` & ${_lit(op.sep)} & ` : ' & ')
    }
    case 'condition': {
      if (!c) return ''
      const then = _valExpr(op.then, op.thenIsCol)
      const els = _valExpr(op.else, op.elseIsCol)
      if (op.cmp === 'contains')
        return `IF(FIND(${_valExpr(op.value, op.valueIsCol)}, ${_colref(c)}) > 0, ${then}, ${els})`
      return `IF(${_colref(c)} ${op.cmp || '='} ${_valExpr(op.value, op.valueIsCol)}, ${then}, ${els})`
    }
    case 'math': {
      if (!c) return ''
      const rhs = op.rhsIsCol
        ? op.rhs
          ? _colref(op.rhs)
          : '0'
        : _isNum(op.rhs)
          ? String(op.rhs)
          : '0'
      let e = `${_colref(c)} ${op.mathOp || '+'} ${rhs}`
      if (op.round !== '' && op.round != null) e = `ROUND(${e}, ${_num(op.round, 0)})`
      return `(${e})`
    }
    default:
      return op.expr || ''
  }
}

function CalcColSelect({ cols, value, onChange, placeholder = '— colonne —' }) {
  return (
    <select className="qb-select" value={value || ''} onChange={(e) => onChange(e.target.value)}>
      <option value="">{placeholder}</option>
      {cols.map((c) => (
        <option key={c.name} value={c.name}>
          {c.name}
        </option>
      ))}
    </select>
  )
}

// a value that is either a typed constant or a reference to another column
function ValueField({ cols, value, isCol, onValue, onToggle, placeholder = 'valeur' }) {
  return (
    <span className="calc-valuefield">
      {isCol ? (
        <CalcColSelect cols={cols} value={value} onChange={onValue} />
      ) : (
        <input
          className="qb-input narrow"
          value={value ?? ''}
          placeholder={placeholder}
          onChange={(e) => onValue(e.target.value)}
        />
      )}
      <label className="qb-check tiny" title="Utiliser une colonne plutôt qu'une valeur saisie">
        <input type="checkbox" checked={!!isCol} onChange={(e) => onToggle(e.target.checked)} /> col
      </label>
    </span>
  )
}

function CombineForm({ op, setOp, cols }) {
  const parts = op.parts || []
  const setParts = (p) => setOp({ parts: p })
  const upd = (i, patch) => setParts(parts.map((p, j) => (j === i ? { ...p, ...patch } : p)))
  return (
    <div className="combine-form">
      {parts.map((p, i) => (
        <div className="qb-row indent" key={i}>
          <select
            className="qb-select"
            value={p.type || 'col'}
            onChange={(e) => upd(i, { type: e.target.value })}
          >
            <option value="col">colonne</option>
            <option value="text">texte</option>
          </select>
          {p.type === 'text' ? (
            <input
              className="qb-input"
              value={p.value ?? ''}
              placeholder="texte"
              onChange={(e) => upd(i, { value: e.target.value })}
            />
          ) : (
            <CalcColSelect cols={cols} value={p.value} onChange={(v) => upd(i, { value: v })} />
          )}
          <button
            className="ghost danger small"
            onClick={() => setParts(parts.filter((_, j) => j !== i))}
          >
            <Icon name="x" />
          </button>
        </div>
      ))}
      <div className="qb-row indent">
        <button
          className="ghost small"
          onClick={() => setParts([...parts, { type: 'col', value: '' }])}
        >
          + colonne
        </button>
        <button
          className="ghost small"
          onClick={() => setParts([...parts, { type: 'text', value: '' }])}
        >
          + texte
        </button>
        <span className="qb-lbl">séparateur</span>
        <input
          className="qb-input narrow"
          value={op.sep ?? ''}
          placeholder="ex : espace, -"
          onChange={(e) => setOp({ sep: e.target.value })}
        />
      </div>
    </div>
  )
}

function CalcColumnCard({ item, index, count, cols, onChange, onMove, onDelete }) {
  const op = item.op || { kind: 'formula' }
  const kind = op.kind || 'formula'
  const setOp = (patch) => {
    const next = { ...op, ...patch }
    onChange({ op: next, expr: buildCalcExpr(next) })
  }
  const setKind = (k) => {
    if (k === 'formula') onChange({ op: { kind: 'formula' }, expr: item.expr || '' })
    else {
      const next = { ...op, kind: k }
      onChange({ op: next, expr: buildCalcExpr(next) })
    }
  }
  const appendCol = (cName) => {
    const cur = item.expr || ''
    onChange({
      op: { kind: 'formula' },
      expr: cur + (cur && !cur.endsWith(' ') ? ' ' : '') + `[${cName}]`,
    })
  }
  const w = op.what || 'after_sep'
  return (
    <div className={`clean-op ${item.enabled === false ? 'off' : ''}`}>
      <div className="qb-row">
        <input
          type="checkbox"
          checked={item.enabled !== false}
          onChange={(e) => onChange({ enabled: e.target.checked })}
          title="Activer / désactiver"
        />
        <input
          className="qb-input"
          placeholder="nom de la nouvelle colonne"
          value={item.name || ''}
          onChange={(e) => onChange({ name: e.target.value })}
        />
      </div>
      <div className="qb-row indent">
        <span className="qb-lbl">calcule</span>
        <select className="qb-select" value={kind} onChange={(e) => setKind(e.target.value)}>
          {CALC_OPS.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </div>

      {kind === 'extract' && (
        <>
          <div className="qb-row indent">
            <span className="qb-lbl">de</span>
            <CalcColSelect cols={cols} value={op.column} onChange={(v) => setOp({ column: v })} />
            <span className="qb-lbl">prendre</span>
            <select
              className="qb-select"
              value={w}
              onChange={(e) => setOp({ what: e.target.value })}
            >
              {EXTRACT_WHAT.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </div>
          {['after_sep', 'before_sep'].includes(w) && (
            <div className="qb-row indent">
              <span className="qb-lbl">séparateur</span>
              <input
                className="qb-input narrow"
                value={op.sep ?? ''}
                placeholder={'\\  /  -  .'}
                onChange={(e) => setOp({ sep: e.target.value })}
              />
              <span className="qb-lbl">occurrence</span>
              <select
                className="qb-select"
                value={op.occurrence || 'last'}
                onChange={(e) => setOp({ occurrence: e.target.value })}
              >
                {OCCURRENCES.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
              {op.occurrence === 'nth' && (
                <input
                  className="qb-input narrow"
                  type="number"
                  min="1"
                  value={op.instance ?? 1}
                  onChange={(e) => setOp({ instance: e.target.value })}
                />
              )}
            </div>
          )}
          {['first_n', 'last_n'].includes(w) && (
            <div className="qb-row indent">
              <span className="qb-lbl">combien de caractères</span>
              <input
                className="qb-input narrow"
                type="number"
                min="1"
                value={op.n ?? 1}
                onChange={(e) => setOp({ n: e.target.value })}
              />
            </div>
          )}
          {w === 'mid' && (
            <div className="qb-row indent">
              <span className="qb-lbl">à partir de</span>
              <input
                className="qb-input narrow"
                type="number"
                min="1"
                value={op.start ?? 1}
                onChange={(e) => setOp({ start: e.target.value })}
              />
              <span className="qb-lbl">sur</span>
              <input
                className="qb-input narrow"
                type="number"
                min="1"
                value={op.n ?? 5}
                onChange={(e) => setOp({ n: e.target.value })}
              />
            </div>
          )}
          <div className="qb-row indent calc-presets">
            <span className="qb-lbl">préréglages</span>
            <button
              className="chip-mini"
              onClick={() => setOp({ what: 'after_sep', sep: '\\', occurrence: 'last' })}
            >
              nom de fichier
            </button>
            <button
              className="chip-mini"
              onClick={() => setOp({ what: 'before_sep', sep: '.', occurrence: 'last' })}
            >
              retirer l’extension
            </button>
          </div>
        </>
      )}

      {kind === 'transform' && (
        <>
          <div className="qb-row indent">
            <CalcColSelect cols={cols} value={op.column} onChange={(v) => setOp({ column: v })} />
            <span className="qb-lbl">→</span>
            <select
              className="qb-select"
              value={op.transform || 'upper'}
              onChange={(e) => setOp({ transform: e.target.value })}
            >
              {TRANSFORMS.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </div>
          {op.transform === 'replace' && (
            <div className="qb-row indent">
              <span className="qb-lbl">remplacer</span>
              <input
                className="qb-input narrow"
                value={op.find ?? ''}
                onChange={(e) => setOp({ find: e.target.value })}
              />
              <span className="qb-lbl">par</span>
              <input
                className="qb-input narrow"
                value={op.replace ?? ''}
                onChange={(e) => setOp({ replace: e.target.value })}
              />
            </div>
          )}
        </>
      )}

      {kind === 'combine' && <CombineForm op={op} setOp={setOp} cols={cols} />}

      {kind === 'condition' && (
        <>
          <div className="qb-row indent">
            <span className="qb-lbl">si</span>
            <CalcColSelect cols={cols} value={op.column} onChange={(v) => setOp({ column: v })} />
            <select
              className="qb-select"
              value={op.cmp || '='}
              onChange={(e) => setOp({ cmp: e.target.value })}
            >
              {CMPS.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
            <ValueField
              cols={cols}
              value={op.value}
              isCol={op.valueIsCol}
              onValue={(v) => setOp({ value: v })}
              onToggle={(b) => setOp({ valueIsCol: b })}
            />
          </div>
          <div className="qb-row indent">
            <span className="qb-lbl">alors</span>
            <ValueField
              cols={cols}
              value={op.then}
              isCol={op.thenIsCol}
              onValue={(v) => setOp({ then: v })}
              onToggle={(b) => setOp({ thenIsCol: b })}
            />
            <span className="qb-lbl">sinon</span>
            <ValueField
              cols={cols}
              value={op.else}
              isCol={op.elseIsCol}
              onValue={(v) => setOp({ else: v })}
              onToggle={(b) => setOp({ elseIsCol: b })}
            />
          </div>
        </>
      )}

      {kind === 'math' && (
        <div className="qb-row indent">
          <CalcColSelect cols={cols} value={op.column} onChange={(v) => setOp({ column: v })} />
          <select
            className="qb-select"
            value={op.mathOp || '+'}
            onChange={(e) => setOp({ mathOp: e.target.value })}
          >
            {MATH_OPS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
          <ValueField
            cols={cols}
            value={op.rhs}
            isCol={op.rhsIsCol}
            onValue={(v) => setOp({ rhs: v })}
            onToggle={(b) => setOp({ rhsIsCol: b })}
            placeholder="nombre"
          />
          <span className="qb-lbl">arrondi</span>
          <input
            className="qb-input narrow"
            type="number"
            placeholder="—"
            value={op.round ?? ''}
            onChange={(e) => setOp({ round: e.target.value })}
          />
        </div>
      )}

      {kind === 'formula' && (
        <>
          <div className="qb-row indent">
            <span className="qb-eq">=</span>
            <textarea
              className="qb-input calc-expr"
              rows={2}
              placeholder='ex : IF([stock] > 0, "OK", "Rupture")'
              value={item.expr || ''}
              onChange={(e) => onChange({ op: { kind: 'formula' }, expr: e.target.value })}
            />
          </div>
          {cols.length > 0 && (
            <div className="calc-cols">
              {cols.map((c) => (
                <button
                  key={c.name}
                  className="calc-coltag"
                  title="Insérer cette colonne"
                  onClick={() => appendCol(c.name)}
                >
                  {c.name}
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {kind !== 'formula' && (
        <div
          className="calc-genexpr"
          title="Formule générée (modifiable en mode « Formule (avancé) »)"
        >
          = <code>{item.expr || '…'}</code>
        </div>
      )}

      <div className="clean-op-actions">
        <button className="mini" onClick={() => onMove(-1)} disabled={index === 0}>
          <Icon name="up" />
        </button>
        <button className="mini" onClick={() => onMove(1)} disabled={index === count - 1}>
          <Icon name="down" />
        </button>
        <button className="ghost danger small" onClick={onDelete}>
          <Icon name="x" />
        </button>
      </div>
    </div>
  )
}

function CalcConfig({ node, inputs, set }) {
  const d = node.data
  const cols = inputs[0]?.columns || []
  const items = d.columns || []
  const upd = (i, patch) =>
    set({ columns: items.map((o, j) => (j === i ? { ...o, ...patch } : o)) })
  const del = (i) => set({ columns: items.filter((_, j) => j !== i) })
  const add = () =>
    set({
      columns: [
        ...items,
        {
          name: '',
          enabled: true,
          op: { kind: 'extract', what: 'after_sep', occurrence: 'last' },
          expr: '',
        },
      ],
    })
  const move = (i, dir) => {
    const j = i + dir
    if (j < 0 || j >= items.length) return
    const a = [...items]
    ;[a[i], a[j]] = [a[j], a[i]]
    set({ columns: a })
  }
  return (
    <div className="insp-body">
      {inputs.length === 0 && (
        <div className="qb-warn">
          Connectez une entrée puis exécutez l'amont pour charger les colonnes.
        </div>
      )}

      <GroupCalcSection d={d} cols={cols} set={set} />

      <div className="ports-head">
        <span className="ports-title">Colonnes calculées</span>
        <InfoBubble>
          Chaque colonne se construit avec un <b>choix d'opération</b> (extraire un morceau de
          texte, transformer, combiner, condition Si…, calcul) — sans écrire de formule.
          <br />
          <b>Extraire</b> couvre le besoin courant : p.ex. le nom d'un fichier = « le texte après le
          séparateur
          <code>\</code>, dernière occurrence » (bouton préréglage « nom de fichier »).
          <br />
          La formule générée reste affichée. Le mode <b>Formule (avancé)</b> permet d'écrire
          directement :<code>[Nom]</code> = colonne, <code>"texte"</code> = littéral,{' '}
          <code>&amp;</code> = concaténer, et toutes les fonctions (IF, TEXTAFTER, REGEXEXTRACT…).
          Une colonne peut réutiliser une colonne calculée plus haut.
        </InfoBubble>
      </div>
      <button className="ghost small" onClick={add}>
        + Colonne calculée
      </button>
      <div className="clean-ops">
        {items.map((o, i) => (
          <CalcColumnCard
            key={i}
            item={o}
            index={i}
            count={items.length}
            cols={cols}
            onChange={(patch) => upd(i, patch)}
            onMove={(dir) => move(i, dir)}
            onDelete={() => del(i)}
          />
        ))}
        {items.length === 0 && (
          <div className="calc-examples">
            <div className="qb-hint">Aucune colonne. Exemples (cliquez pour insérer) :</div>
            {CALC_EXAMPLES.map(([n, e], i) => (
              <button
                key={i}
                className="calc-example"
                onClick={() =>
                  set({
                    columns: [
                      ...items,
                      { name: n, expr: e, op: { kind: 'formula' }, enabled: true },
                    ],
                  })
                }
              >
                <b>{n}</b> = <code>{e}</code>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function UnionConfig({ node, inputs, set }) {
  const d = node.data
  return (
    <div className="insp-body">
      <div className="ports-head">
        <span className="ports-title">Union (empilement)</span>
        <InfoBubble>
          Empile (concatène) les lignes de <b>toutes</b> les entrées reliées à l'ancre <b>in</b>.
          Reliez-y plusieurs blocs.
        </InfoBubble>
      </div>
      <div className="fld">
        <span>Entrées connectées : {inputs.length}</span>
      </div>
      <label className="fld">
        <span>Alignement des colonnes</span>
        <select
          value={d.by_name === false ? 'pos' : 'name'}
          onChange={(e) => set({ by_name: e.target.value === 'name' })}
        >
          <option value="name">Par nom de colonne (tolère l'ordre / colonnes manquantes)</option>
          <option value="pos">Par position</option>
        </select>
      </label>
      <label className="qb-check">
        <input
          type="checkbox"
          checked={!!d.distinct}
          onChange={(e) => set({ distinct: e.target.checked })}
        />
        Supprimer les lignes en double après empilement
      </label>
    </div>
  )
}

function FilterConfig({ node, inputs, set }) {
  const d = node.data
  const main = inputs.find((i) => i.alias === 'in')
  const ref = inputs.find((i) => i.alias === 'ref')
  const mainCols = main?.columns || []
  const refCols = ref?.columns || []
  const keep = d.mode !== 'exclude'

  // Effective list of column pairs — the new source of truth. Backward compat:
  // a legacy block with only `column`/`ref_column` is read as a single pair.
  const pairs =
    d.pairs && d.pairs.length
      ? d.pairs
      : d.column || d.ref_column
        ? [{ column: d.column || '', ref_column: d.ref_column || '' }]
        : [{ column: '', ref_column: '' }]
  // Mirror the first pair onto the legacy fields so nothing breaks if a piece of
  // code still reads d.column / d.ref_column.
  const setPairs = (next) =>
    set({
      pairs: next,
      column: next[0]?.column || '',
      ref_column: next[0]?.ref_column || '',
    })
  const updatePair = (i, patch) => setPairs(pairs.map((p, j) => (j === i ? { ...p, ...patch } : p)))
  const addPair = () => setPairs([...pairs, { column: '', ref_column: '' }])
  const removePair = (i) =>
    setPairs(pairs.length <= 1 ? [{ column: '', ref_column: '' }] : pairs.filter((_, j) => j !== i))

  return (
    <div className="insp-body">
      <div className="ports">
        <div className="ports-head">
          <span className="ports-title">Entrées</span>
          <InfoBubble>
            <b>Données</b> (ancre <b>D</b>) — le tableau à filtrer.
            <br />
            <b>Référence</b> (ancre <b>R</b>) — le tableau dont on lit les valeurs. Il n'est jamais
            fusionné, seulement consulté.
            <br />
            On garde (ou on exclut) les lignes des <b>données</b> dont les colonnes choisies
            figurent <b>toutes ensemble</b>, sur une même ligne de la <b>référence</b> (clé
            composite).
          </InfoBubble>
        </div>
        <div className="ports-row">
          <PortTag num="D" name="données" source={main} />
          <PortTag num="R" name="référence" source={ref} />
        </div>
      </div>

      <div className="mode-toggle">
        <button className={keep ? 'on' : ''} onClick={() => set({ mode: 'keep' })}>
          Garder si présent
        </button>
        <button className={!keep ? 'on' : ''} onClick={() => set({ mode: 'exclude' })}>
          Exclure si présent
        </button>
      </div>
      <p className="qb-hint">
        {keep
          ? `Ne conserve que les lignes des données dont ${pairs.length > 1 ? 'la combinaison de colonnes existe' : 'la valeur existe'} dans la référence (semi-jointure${pairs.length > 1 ? ' composite' : ''}).`
          : `Retire les lignes des données dont ${pairs.length > 1 ? 'la combinaison de colonnes existe' : 'la valeur existe'} dans la référence (anti-jointure${pairs.length > 1 ? ' composite' : ''}).`}
      </p>

      <div className="ports-head" style={{ marginTop: 6 }}>
        <span className="ports-title">Colonnes à comparer</span>
        <InfoBubble>
          Comparez plusieurs colonnes en parallèle pour former une <b>clé composite</b> : une ligne
          ne « matche » que si la référence contient une ligne avec exactement les mêmes valeurs sur
          toutes les paires choisies.
        </InfoBubble>
      </div>
      {pairs.map((p, i) => (
        <div className="qb-row" key={i} style={{ alignItems: 'flex-end', gap: 6 }}>
          <label className="fld" style={{ flex: 1 }}>
            <span>{i === 0 ? 'Données' : ''}</span>
            <select
              value={p.column || ''}
              onChange={(e) => updatePair(i, { column: e.target.value })}
            >
              <option value="">— colonne —</option>
              {mainCols.length === 0 && (
                <option value="" disabled>
                  (exécutez l'amont « données »)
                </option>
              )}
              {mainCols.map((c) => (
                <option key={c.name} value={c.name}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <span className="qb-hint" style={{ paddingBottom: 6 }}>
            =
          </span>
          <label className="fld" style={{ flex: 1 }}>
            <span>{i === 0 ? 'Référence' : ''}</span>
            <select
              value={p.ref_column || ''}
              onChange={(e) => updatePair(i, { ref_column: e.target.value })}
            >
              <option value="">— colonne —</option>
              {refCols.length === 0 && (
                <option value="" disabled>
                  (exécutez l'amont « référence »)
                </option>
              )}
              {refCols.map((c) => (
                <option key={c.name} value={c.name}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <button
            className="ghost small danger"
            onClick={() => removePair(i)}
            disabled={pairs.length <= 1 && !p.column && !p.ref_column}
            title={pairs.length > 1 ? 'Retirer cette paire' : 'Vider cette paire'}
          >
            <Icon name="x" size={12} />
          </button>
        </div>
      ))}
      <button className="ghost small" onClick={addPair} style={{ marginTop: 4 }}>
        <Icon name="plus" size={12} /> Ajouter une paire de colonnes
      </button>

      <label className="qb-check" style={{ marginTop: 8 }}>
        <input
          type="checkbox"
          checked={!!d.case_insensitive}
          onChange={(e) => set({ case_insensitive: e.target.checked })}
        />
        Ignorer la casse (comparer le texte sans tenir compte des majuscules)
      </label>
      <p className="qb-hint">
        Le bloc ne garde que les colonnes des données — il n'ajoute aucune colonne de la référence.
      </p>
    </div>
  )
}

function ColsConfig({ node, inputs, set }) {
  const d = node.data
  const cols = inputs[0]?.columns || []
  const items = d.columns || []

  // Keep the stored list in sync with the upstream schema: append newly-appeared
  // columns (kept by default), so the user always sees every available column.
  useEffect(() => {
    if (cols.length === 0) return
    const known = new Set(items.map((i) => i.name))
    const missing = cols.filter((c) => !known.has(c.name))
    if (missing.length) {
      set({
        columns: [...items, ...missing.map((c) => ({ name: c.name, keep: true, rename: '' }))],
      })
    }
  }, [cols]) // eslint-disable-line react-hooks/exhaustive-deps

  const present = items.filter((it) => cols.some((c) => c.name === it.name))
  const typeOf = (name) => cols.find((c) => c.name === name)?.type
  const upd = (name, patch) =>
    set({ columns: items.map((it) => (it.name === name ? { ...it, ...patch } : it)) })
  const move = (i, dir) => {
    const list = present
    const j = i + dir
    if (j < 0 || j >= list.length) return
    const a = [...list]
    ;[a[i], a[j]] = [a[j], a[i]]
    // re-thread the moved sublist into the full items array order
    set({ columns: a })
  }
  const allKept = present.every((it) => it.keep !== false)
  const toggleAll = () => set({ columns: items.map((it) => ({ ...it, keep: !allKept })) })
  // Stable partition: checked columns float to the top (keeping their order), unchecked sink below.
  const keptToTop = () =>
    set({
      columns: [
        ...present.filter((it) => it.keep !== false),
        ...present.filter((it) => it.keep === false),
      ],
    })
  const mixed = present.some((it) => it.keep === false) && present.some((it) => it.keep !== false)

  return (
    <div className="insp-body">
      {inputs.length === 0 && (
        <div className="qb-warn">
          Connectez une entrée puis exécutez l'amont pour charger les colonnes.
        </div>
      )}
      <div className="ports-head">
        <span className="ports-title">Colonnes</span>
        <InfoBubble>
          <b>Décochez</b> pour supprimer une colonne, utilisez <b>↑ ↓</b> pour réordonner, et le
          champ de droite pour <b>renommer</b> (laissez vide pour garder le nom). Les colonnes
          apparues en amont après coup sont ajoutées automatiquement à la fin.
        </InfoBubble>
      </div>
      {present.length > 0 && (
        <div className="qb-row">
          <button className="ghost small" onClick={toggleAll}>
            {allKept ? 'Tout décocher' : 'Tout cocher'}
          </button>
          {mixed && (
            <button
              className="ghost small"
              onClick={keptToTop}
              title="Remonter les colonnes cochées tout en haut"
            >
              Cochées en haut
            </button>
          )}
        </div>
      )}
      <div className="clean-ops">
        {present.map((it, i) => (
          <div className={`clean-op ${it.keep === false ? 'off' : ''}`} key={it.name}>
            <div className="qb-row">
              <input
                type="checkbox"
                checked={it.keep !== false}
                onChange={(e) => upd(it.name, { keep: e.target.checked })}
                title="Garder / supprimer"
              />
              <span className="qb-lbl" style={{ flex: 1, fontWeight: 600 }}>
                {it.name}
              </span>
              <span className="coltype-inline">{typeOf(it.name)}</span>
            </div>
            <div className="qb-row indent">
              <span className="qb-lbl">→</span>
              <input
                className="qb-input"
                placeholder={it.name}
                value={it.rename || ''}
                onChange={(e) => upd(it.name, { rename: e.target.value })}
              />
              <button className="mini" onClick={() => move(i, -1)} disabled={i === 0}>
                <Icon name="up" />
              </button>
              <button
                className="mini"
                onClick={() => move(i, 1)}
                disabled={i === present.length - 1}
              >
                <Icon name="down" />
              </button>
            </div>
          </div>
        ))}
        {present.length === 0 && <div className="qb-hint">— colonnes non chargées —</div>}
      </div>
    </div>
  )
}

const ANALYSIS_KINDS = [
  ['values', 'Valeurs (les plus fréquentes)'],
  ['prefix', 'Préfixe'],
  ['suffix', 'Suffixe'],
  ['length', 'Longueur (nb de caractères)'],
  ['rule', 'Respect d’une règle'],
  ['mask', 'Respect d’un format (masque)'],
  ['keys', 'Clés multiples (groupes / doublons)'],
]
const CHART_KINDS = [
  ['bar', 'Barres'],
  ['pie', 'Camembert'],
  ['table', 'Tableau'],
]
const _aid = () => 'a' + Math.random().toString(36).slice(2, 8)

function AnalysisCard({ a, cols, index, count, onChange, onMove, onDelete }) {
  const kind = a.kind || 'values'
  const by = a.by || 'sep'
  const keyCols = a.key || (a.column ? [a.column] : [])
  const toggleKey = (name) => {
    const set = new Set(keyCols)
    if (set.has(name)) set.delete(name)
    else set.add(name)
    onChange({ key: cols.map((c) => c.name).filter((n) => set.has(n)) }) // keep column order
  }
  const onKindChange = (v) => {
    const patch = { kind: v }
    if (v === 'keys' && (!a.key || a.key.length === 0))
      patch.key = a.column ? [a.column] : cols[0] ? [cols[0].name] : []
    onChange(patch)
  }
  return (
    <div className="clean-op">
      <div className="qb-row">
        {kind !== 'keys' && (
          <select
            className="qb-select"
            value={a.column || ''}
            onChange={(e) => onChange({ column: e.target.value })}
            title="Colonne analysée"
          >
            <option value="">— colonne —</option>
            {cols.map((c) => (
              <option key={c.name} value={c.name}>
                {c.name}
              </option>
            ))}
          </select>
        )}
        <select
          className="qb-select"
          value={kind}
          onChange={(e) => onKindChange(e.target.value)}
          title="Ce qu'on regarde"
        >
          {ANALYSIS_KINDS.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
        <button className="ghost danger small" onClick={onDelete}>
          <Icon name="x" />
        </button>
      </div>

      {kind === 'keys' && (
        <div className="indent">
          <div className="qb-lbl">Clé (cochez une ou plusieurs colonnes — clé composite) :</div>
          <div className="keys-pick">
            {cols.map((c) => (
              <label key={c.name} className="qb-check tiny" title={c.type}>
                <input
                  type="checkbox"
                  checked={keyCols.includes(c.name)}
                  onChange={() => toggleKey(c.name)}
                />{' '}
                {c.name}
              </label>
            ))}
            {cols.length === 0 && (
              <span className="qb-hint">Exécutez l'amont pour charger les colonnes.</span>
            )}
          </div>
        </div>
      )}

      {(kind === 'prefix' || kind === 'suffix') && (
        <div className="qb-row indent">
          <select
            className="qb-select"
            value={by}
            onChange={(e) => onChange({ by: e.target.value })}
          >
            <option value="sep">
              {kind === 'prefix' ? 'avant le séparateur' : 'après le séparateur'}
            </option>
            <option value="chars">nombre de caractères</option>
          </select>
          {by === 'sep' ? (
            <>
              <span className="qb-lbl">séparateur</span>
              <input
                className="qb-input narrow"
                value={a.sep ?? '-'}
                placeholder={'-  \\  .  _'}
                onChange={(e) => onChange({ sep: e.target.value })}
              />
            </>
          ) : (
            <>
              <span className="qb-lbl">combien</span>
              <input
                className="qb-input narrow"
                type="number"
                min="1"
                value={a.n ?? 3}
                onChange={(e) => onChange({ n: Number(e.target.value) })}
              />
            </>
          )}
        </div>
      )}

      {kind === 'rule' && (
        <div className="indent">
          <RuleRow
            r={a.rule || { test: 'starts_with', value: '' }}
            cols={cols}
            defaultCol={a.column}
            onChange={(p) => onChange({ rule: { ...(a.rule || { test: 'starts_with' }), ...p } })}
          />
          <label className="qb-check tiny">
            <input
              type="checkbox"
              checked={!!a.case_sensitive}
              onChange={(e) => onChange({ case_sensitive: e.target.checked })}
            />{' '}
            sensible à la casse
          </label>
        </div>
      )}
      {kind === 'mask' && (
        <div className="indent">
          <MaskBuilder
            segments={a.segments || []}
            caseSensitive={!!a.case_sensitive}
            onChange={(segs) => onChange({ segments: segs })}
          />
        </div>
      )}

      <div className="qb-row indent">
        {kind !== 'keys' && (
          <>
            <span className="qb-lbl">graphique</span>
            <select
              className="qb-select"
              value={a.chart || 'bar'}
              onChange={(e) => onChange({ chart: e.target.value })}
            >
              {CHART_KINDS.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </>
        )}
        <span className="qb-lbl">{kind === 'keys' ? 'groupes affichés' : 'max'}</span>
        <input
          className="qb-input narrow"
          type="number"
          min="2"
          value={a.top ?? 12}
          onChange={(e) => onChange({ top: Number(e.target.value) })}
        />
        <button className="mini" onClick={() => onMove(-1)} disabled={index === 0}>
          <Icon name="up" />
        </button>
        <button className="mini" onClick={() => onMove(1)} disabled={index === count - 1}>
          <Icon name="down" />
        </button>
      </div>
    </div>
  )
}

function ReportConfig({ node, inputs, set }) {
  const d = node.data
  const cols = inputs[0]?.columns || []
  const items = d.analyses || []
  const upd = (i, patch) =>
    set({ analyses: items.map((o, j) => (j === i ? { ...o, ...patch } : o)) })
  const del = (i) => set({ analyses: items.filter((_, j) => j !== i) })
  const move = (i, dir) => {
    const j = i + dir
    if (j < 0 || j >= items.length) return
    const a = [...items]
    ;[a[i], a[j]] = [a[j], a[i]]
    set({ analyses: a })
  }
  const add = () =>
    set({
      analyses: [
        ...items,
        { id: _aid(), column: cols[0]?.name || '', kind: 'values', chart: 'bar', top: 12 },
      ],
    })
  return (
    <div className="insp-body">
      {inputs.length === 0 && (
        <div className="qb-warn">
          Connectez une entrée puis exécutez l'amont pour charger les colonnes.
        </div>
      )}
      <div className="ports-head">
        <span className="ports-title">Analyses (état des lieux)</span>
        <InfoBubble>
          Bloc <b>à titre d'information</b> (non exporté, sans sortie). Chaque analyse{' '}
          <b>ventile</b> une colonne selon un critère — <b>valeurs</b>, <b>préfixe</b>,{' '}
          <b>suffixe</b>, <b>longueur</b>, ou le <b>respect d'une règle / d'un masque</b> (comme
          dans la Validation) — et l'affiche en <b>camembert</b>, barres ou tableau. Ex. : préfixe
          des noms de fichiers en camembert → quels préfixes, combien d'occurrences. L'analyse{' '}
          <b>Clés multiples</b> regroupe les lignes par une clé (une ou plusieurs colonnes) :
          doublons, unicité (clé candidate ?), taille des groupes, cohérence des autres colonnes par
          clé, et exploration des plus gros groupes. Visible au clic et dans la{' '}
          <b>documentation Excel</b>.
        </InfoBubble>
      </div>

      <label className="fld insp-desc">
        <span>Note pour le rapport (le « pourquoi » de ces analyses)</span>
        <textarea
          rows={2}
          placeholder="Ex. : composition des lignes non conformes pour comprendre les rejets…"
          value={d.note || ''}
          onChange={(e) => set({ note: e.target.value })}
        />
      </label>

      <button className="ghost small" onClick={add}>
        + Analyse
      </button>
      <div className="clean-ops">
        {items.map((o, i) => (
          <AnalysisCard
            key={o.id || i}
            a={o}
            cols={cols}
            index={i}
            count={items.length}
            onChange={(p) => upd(i, p)}
            onMove={(dir) => move(i, dir)}
            onDelete={() => del(i)}
          />
        ))}
        {items.length === 0 && (
          <div className="qb-hint">
            Aucune analyse. Cliquez « + Analyse » (ex. préfixe des noms de fichiers, en camembert).
          </div>
        )}
      </div>
      <p className="qb-hint">
        Exécutez le bloc pour générer les graphiques (visibles ici et dans la documentation).
      </p>
    </div>
  )
}

function DedupConfig({ node, inputs, set }) {
  const d = node.data
  const cols = inputs[0]?.columns || []
  const selected = d.key_columns || []
  const toggle = (name) => {
    const next = selected.includes(name) ? selected.filter((c) => c !== name) : [...selected, name]
    set({ key_columns: next })
  }
  return (
    <div className="insp-body">
      {inputs.length === 0 && (
        <div className="qb-warn">
          Connectez une entrée (ancre <b>in</b>) puis exécutez le bloc amont pour charger ses
          colonnes.
        </div>
      )}

      <div className="fld">
        <div className="fld-head">
          <span>Colonnes-clés (détection des doublons)</span>
          <InfoBubble>
            Aucune cochée → doublon sur la <b>ligne entière</b>. Plusieurs cochées → doublon sur
            leur <b>combinaison</b>.
          </InfoBubble>
        </div>
        <div className="checklist">
          {cols.length === 0 && <div className="qb-hint">— colonnes non chargées —</div>}
          {cols.map((c) => (
            <label key={c.name} className="qb-check">
              <input
                type="checkbox"
                checked={selected.includes(c.name)}
                onChange={() => toggle(c.name)}
              />
              {c.name} <span className="coltype-inline">{c.type}</span>
            </label>
          ))}
        </div>
      </div>

      <label className="fld">
        <span>Exemplaire à conserver</span>
        <select value={d.keep || 'first'} onChange={(e) => set({ keep: e.target.value })}>
          <option value="first">Première occurrence</option>
          <option value="last">Dernière occurrence</option>
        </select>
      </label>

      <label className="fld">
        <span>Sortie « Doublons » contient…</span>
        <select value={d.dups_mode || 'all'} onChange={(e) => set({ dups_mode: e.target.value })}>
          <option value="all">Toutes les occurrences des groupes en double</option>
          <option value="exemplar">Un exemplaire par groupe en double</option>
          <option value="extra">Seulement les occurrences en trop</option>
        </select>
      </label>

      <div className="outs-legend">
        <div>
          <span className="odot kept" /> <b>Dédoublonné</b> — un exemplaire par groupe (flux « sans
          doublons »)
        </div>
        <div>
          <span className="odot dups" /> <b>Doublons</b> — selon l'option ci-dessus
        </div>
        <div>
          <span className="odot uniq" /> <b>Uniques</b> — lignes présentes une seule fois
        </div>
      </div>
    </div>
  )
}

// Étiquettes courtes pour le bandeau « sniffing » de l'aperçu (A.3).
const ENC_LABELS = {
  'utf-8': 'UTF-8',
  utf_8: 'UTF-8',
  'utf-16': 'UTF-16',
  cp1252: 'CP1252 (Windows FR)',
  'iso-8859-1': 'Latin-1',
  'iso-8859-15': 'Latin-9',
  ascii: 'ASCII',
}

function _encLabel(enc) {
  if (!enc) return null
  const k = String(enc).toLowerCase()
  return ENC_LABELS[k] || enc
}

function _sepLabel(sep) {
  if (!sep) return null
  if (sep === ';') return 'point-virgule (;)'
  if (sep === ',') return 'virgule (,)'
  if (sep === '\t') return 'tabulation'
  if (sep === '|') return 'pipe (|)'
  return `« ${sep} »`
}

// Si l'extension fait penser à un format binaire (xlsx, parquet…), on ne montre
// pas les options CSV.
function _isCsvFile(name) {
  if (!name) return false
  return /\.(csv|tsv|txt)$/i.test(name)
}

function SourceConfig({ pid, node, files, set, onSchema }) {
  const d = node.data
  const [sheets, setSheets] = useState(null)
  const [detected, setDetected] = useState({}) // {encoding, sep, decimal} renvoyé par /peek
  const [colCount, setColCount] = useState(null)

  const refresh = (file, sheet, headerRow, opts) => {
    if (!file) return
    api
      .peek(pid, file, sheet, headerRow, opts)
      .then((p) => {
        if (p.sheets) setSheets(p.sheets)
        setDetected(p.detected || {})
        setColCount(p.columns?.length ?? null)
        onSchema(node.id, p.columns)
      })
      .catch(() => {})
  }

  useEffect(() => {
    if (d.file) {
      refresh(d.file, d.sheet, d.header_row || 0, {
        encoding: d.encoding,
        decimal: d.decimal,
        thousands: d.thousands,
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d.file, d.sheet, d.header_row, d.encoding, d.decimal, d.thousands])

  const isCsv = _isCsvFile(d.file)
  const sniffSummary = isCsv
    ? [
        detected.sep && `séparateur ${_sepLabel(detected.sep)}`,
        detected.encoding && `encodage ${_encLabel(detected.encoding)}`,
        detected.decimal && `décimale « ${detected.decimal} »`,
        colCount != null && `${colCount} colonnes`,
      ].filter(Boolean)
    : null

  return (
    <div className="insp-body">
      <label className="fld">
        <span>Fichier source</span>
        <select
          value={d.file || ''}
          onChange={(e) => {
            setSheets(null)
            setDetected({})
            set({ file: e.target.value, sheet: '' })
          }}
        >
          <option value="">— choisir —</option>
          {files.map((f) => (
            <option key={f.name} value={f.name}>
              {f.name}
            </option>
          ))}
        </select>
      </label>

      {sheets && sheets.length > 0 && (
        <label className="fld">
          <span>Feuille</span>
          <select value={d.sheet || ''} onChange={(e) => set({ sheet: e.target.value })}>
            {sheets.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
      )}

      <label className="fld">
        <span>Lignes d'en-tête à ignorer</span>
        <input
          type="number"
          min="0"
          value={d.header_row || 0}
          onChange={(e) => set({ header_row: Number(e.target.value) })}
        />
      </label>

      {/* Aperçu du sniffing CSV + override (todo A.1 / A.2 / A.3). */}
      {isCsv && (
        <>
          {sniffSummary && sniffSummary.length > 0 && (
            <p className="qb-hint" data-test="sniff-summary">
              Détecté : {sniffSummary.join(' · ')}
            </p>
          )}

          <label className="fld">
            <span>Encodage</span>
            <select
              value={d.encoding || 'auto'}
              onChange={(e) => set({ encoding: e.target.value })}
            >
              <option value="auto">Auto (détection)</option>
              <option value="utf-8">UTF-8</option>
              <option value="cp1252">CP1252 (Windows FR)</option>
              <option value="iso-8859-1">Latin-1 (ISO-8859-1)</option>
              <option value="iso-8859-15">Latin-9 (ISO-8859-15)</option>
              <option value="utf-16">UTF-16</option>
            </select>
          </label>

          <label className="fld">
            <span>Format des nombres</span>
            <select value={d.decimal || 'auto'} onChange={(e) => set({ decimal: e.target.value })}>
              <option value="auto">Auto (détection)</option>
              <option value=",">FR (1 234,56)</option>
              <option value=".">EN (1,234.56)</option>
            </select>
          </label>

          <label className="fld">
            <span>Séparateur de milliers (optionnel)</span>
            <select
              value={d.thousands || ''}
              onChange={(e) => set({ thousands: e.target.value || undefined })}
            >
              <option value="">Aucun</option>
              <option value=" ">Espace</option>
              <option value="&#160;">Espace insécable</option>
              <option value=",">Virgule</option>
              <option value=".">Point</option>
            </select>
          </label>
        </>
      )}

      <label
        className="qb-check"
        title="Le fichier n'est relu que s'il a changé (taille ou date de modification). Évite de recharger un gros Excel à chaque exécution d'un bloc en aval."
      >
        <input
          type="checkbox"
          checked={d.cache !== false}
          onChange={(e) => set({ cache: e.target.checked })}
        />
        Garder le fichier en cache (relire seulement s'il a changé)
      </label>
      <p className="qb-hint">
        Le gros Excel n'est plus relu à chaque exécution. Pour forcer la relecture : bouton{' '}
        <b>Recharger</b> (⟳) sur le bloc.
      </p>

      {files.length === 0 && (
        <div className="qb-warn">
          Aucun fichier dans le projet. Importez un Excel/CSV depuis la page du projet.
        </div>
      )}
    </div>
  )
}

function InfoBubble({ children }) {
  return (
    <span className="info-bubble" tabIndex={0}>
      <Icon name="info" size={14} />
      <span className="info-pop" role="tooltip">
        {children}
      </span>
    </span>
  )
}

function PortTag({ num, name, optional, source }) {
  const connected = !!source
  const loaded = (source?.columns || []).length > 0
  const state = !connected
    ? optional
      ? 'optionnel'
      : 'à brancher'
    : loaded
      ? source.label
      : 'exécuter l’amont'
  return (
    <span
      className={`port-tag ${connected ? 'on' : 'off'} ${optional ? 'opt' : ''}`}
      title={
        connected
          ? `Branché sur « ${source.label} »`
          : optional
            ? 'Entrée optionnelle'
            : 'Aucune entrée branchée'
      }
    >
      <span className="port-tag-num">{num}</span>
      <span className="port-tag-txt">
        <span className="port-tag-name">{name}</span>
        <span className="port-tag-state">{state}</span>
      </span>
    </span>
  )
}

function SqlConfig({ node, inputs, set }) {
  const d = node.data
  const mode = d.mode || 'builder'
  const in1 = inputs.find((i) => i.alias === 'in1')
  const in2 = inputs.find((i) => i.alias === 'in2')
  return (
    <div className="insp-body">
      <div className="ports">
        <div className="ports-head">
          <span className="ports-title">Entrées</span>
          <InfoBubble>
            <b>Port 1</b> — table principale (le <code>FROM</code>, alias <code>in1</code>).
            <br />
            <b>Port 2</b> (<code>in2</code>) — <b>optionnel</b>, à brancher seulement pour une{' '}
            <b>jointure</b> avec une 2ᵉ table.
            <br />
            Une seule entrée suffit pour filtrer, agréger, trier…
          </InfoBubble>
        </div>
        <div className="ports-row">
          <PortTag num="1" name="principale" source={in1} />
          <PortTag num="2" name="jointure" optional source={in2} />
        </div>
      </div>
      <div className="mode-toggle">
        <button className={mode === 'builder' ? 'on' : ''} onClick={() => set({ mode: 'builder' })}>
          Constructeur visuel
        </button>
        <button className={mode === 'raw' ? 'on' : ''} onClick={() => set({ mode: 'raw' })}>
          SQL brut
        </button>
      </div>

      {mode === 'raw' ? (
        <>
          <p className="qb-hint">
            Utilisez les alias d'entrée comme tables : <code>in1</code>, <code>in2</code>.
          </p>
          <textarea
            className="sql-edit"
            rows={12}
            placeholder={'SELECT *\nFROM in1\nWHERE ...'}
            value={d.raw_sql || ''}
            onChange={(e) => set({ raw_sql: e.target.value })}
          />
        </>
      ) : (
        <QueryBuilder value={d.query} inputs={inputs} onChange={(q) => set({ query: q })} />
      )}
    </div>
  )
}

function sanitizeSheet(name) {
  return (
    String(name || '')
      .replace(/[\\/:*?[\]]/g, '_')
      .trim()
      .slice(0, 31) || 'Feuille'
  )
}

function ExportConfig({ node, set, wfName }) {
  const d = node.data
  const auto = d.auto_name !== false
  const toWb = !!d.to_workbook
  // A standalone file is named (Workflow) - (block); a sheet inside the workbook
  // only needs the block name (the file already carries the workflow name).
  const autoName = toWb
    ? (d.label || 'Export').trim()
    : `${(wfName || 'Workflow').trim()} - ${(d.label || 'Export').trim()}`
  // while auto-naming is on, keep the stored filename in sync with the auto name
  useEffect(() => {
    if (auto && d.filename !== autoName) set({ filename: autoName })
  }, [auto, autoName]) // eslint-disable-line react-hooks/exhaustive-deps
  const shown = auto ? autoName : d.filename || ''
  const enabled = d.enabled !== false
  const wb = `${(wfName || 'Workflow').trim()}.xlsx`
  return (
    <div className="insp-body">
      <label
        className="qb-check"
        style={{ marginBottom: 10 }}
        title="Désactivé, ce bloc n'écrit ni ne met à jour le fichier lors de l'exécution du workflow."
      >
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => set({ enabled: e.target.checked })}
        />
        <b>Activer cet export</b> — génère le fichier à l'exécution
      </label>

      <label
        className="qb-check"
        style={{ marginBottom: 8 }}
        title="Tous les exports en mode classeur écrivent dans un seul fichier Excel nommé d'après le workflow ; chacun devient une feuille."
      >
        <input
          type="checkbox"
          checked={toWb}
          onChange={(e) => set({ to_workbook: e.target.checked })}
        />
        Regrouper dans un <b>classeur multi-feuilles</b> nommé d'après le workflow
      </label>

      <label className="qb-check" style={{ marginBottom: 8 }}>
        <input
          type="checkbox"
          checked={auto}
          onChange={(e) => set({ auto_name: e.target.checked })}
        />
        Nom automatique : <b>(Workflow) - (Nom du bloc)</b>
      </label>
      <label className="fld">
        <span>{toWb ? 'Nom de la feuille' : 'Nom du fichier'}</span>
        <input
          value={shown}
          disabled={auto}
          placeholder="resultat"
          onChange={(e) => set({ filename: e.target.value })}
        />
      </label>

      {!toWb && (
        <label className="fld">
          <span>Format</span>
          <select value={d.format || 'xlsx'} onChange={(e) => set({ format: e.target.value })}>
            <option value="xlsx">Excel (.xlsx)</option>
            <option value="csv">CSV (.csv)</option>
          </select>
        </label>
      )}

      {toWb ? (
        <p className="qb-hint">
          Feuille <code>{sanitizeSheet(shown)}</code> dans le classeur <b>files/</b>
          <code>{wb}</code>.<br />
          Les autres exports « classeur » de ce workflow deviennent d'autres feuilles du <b>
            même
          </b>{' '}
          fichier.
        </p>
      ) : (
        <p className="qb-hint">
          Écrit dans <b>files/</b> :{' '}
          <code>
            {shown || 'resultat'}.{d.format === 'csv' ? 'csv' : 'xlsx'}
          </code>
        </p>
      )}
      <p className="qb-hint">Un export sans données (0 ligne) ne crée aucun fichier.</p>
    </div>
  )
}
