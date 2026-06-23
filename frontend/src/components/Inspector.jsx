import { useEffect, useState } from 'react'
import { api } from '../api'
import QueryBuilder from './QueryBuilder'
import Icon from './Icon'
import { ConditionsEditor, RuleRow, MaskBuilder, RulesBuilder } from './routing'
import { EXTRACTOR_TYPES, defaultExtractor, inferIntent, intentPatch } from './validateHelpers'
import ColumnPicker, { shortType } from './ui/ColumnPicker'
import { exportSubdir } from '../lib/paths'

export default function Inspector({
  pid,
  wid,
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
      {node.type === 'dedup' && (
        <DedupConfig pid={pid} wid={wid} node={node} inputs={inputs} set={set} />
      )}
      {node.type === 'validate' && <ValidateConfig node={node} inputs={inputs} set={set} />}
      {node.type === 'pivot' && <PivotConfig node={node} inputs={inputs} set={set} />}
      {node.type === 'clean' && <CleanConfig node={node} inputs={inputs} set={set} />}
      {node.type === 'calc' && <CalcConfig node={node} inputs={inputs} set={set} />}
      {node.type === 'filter' && (
        <FilterConfig pid={pid} wid={wid} node={node} inputs={inputs} set={set} />
      )}
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
  const intent = inferIntent(d)
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
          <div className="cfg-intent">
            <span className="cfg-intent-lede">Je veux&nbsp;:</span>
            <div className="seg" role="radiogroup" aria-label="Type de validation">
              <button
                type="button"
                role="radio"
                aria-checked={intent === 'control'}
                className={intent === 'control' ? 'on' : ''}
                onClick={() => set(intentPatch(d, 'control'))}
              >
                Contrôler la conformité
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={intent === 'router'}
                className={intent === 'router' ? 'on' : ''}
                onClick={() => set(intentPatch(d, 'router'))}
              >
                Router vers plusieurs sorties
              </button>
            </div>
            <span className="muted">
              {intent === 'control'
                ? 'Deux sorties : conformes / non conformes, selon la condition ci-dessous.'
                : 'Autant de sorties que vous voulez — chacune reçoit une condition.'}
            </span>
          </div>
          <ConditionsEditor node={node} cols={cols} onChange={set} intent={intent} />
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

// F.4 — Préréglages Nettoyage : recettes courtes (1-3 ops) qu'on rencontre
// 9 fois sur 10 quand on prépare un fichier FR. La colonne reste vide :
// l'utilisateur la choisit après. Pas de magie devinante d'une colonne,
// ce serait un faux service (cf. doctrine anti-slop #2 — spécifique > générique).
const CLEAN_EXAMPLES = [
  {
    title: 'Normaliser un texte',
    desc: 'enlève les espaces autour, puis Capitalise',
    ops: [
      { op: 'trim', column: '', enabled: true },
      { op: 'capitalize', column: '', enabled: true },
    ],
  },
  {
    title: 'Convertir un nombre FR en nombre',
    desc: 'remplace la virgule décimale par un point, puis cast',
    ops: [
      { op: 'replace', column: '', find: ',', replace: '.', enabled: true },
      { op: 'to_number', column: '', enabled: true },
    ],
  },
  {
    title: 'Remplir les vides par "—"',
    desc: 'évite les blancs visibles dans les exports',
    ops: [{ op: 'fillna', column: '', value: '—', value_type: 'text', enabled: true }],
  },
  {
    title: 'Arrondir au centime',
    desc: 'round à 2 décimales',
    ops: [{ op: 'round', column: '', digits: 2, enabled: true }],
  },
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

function PivotConfig({ node, inputs, set }) {
  const d = node.data
  const mode = d.mode || 'pivot'
  const idx = d.index_columns || []
  const vals = d.value_columns || []
  const readback =
    mode === 'pivot'
      ? `Pour chaque ${idx.length ? idx.join(' + ') : '(ligne)'}, une colonne par valeur de « ${d.pivot_column || '…'} », remplie par ${d.agg || 'SUM'}(${d.value_column || '…'}).`
      : `Les colonnes ${vals.length ? vals.join(', ') : '(…)'} deviennent deux colonnes : « ${d.name_column || 'variable'} » (le nom) et « ${d.value_column || 'valeur'} ».`
  return (
    <div className="insp-body">
      <div className="cfg-intent">
        <span className="cfg-intent-lede">Je veux&nbsp;:</span>
        <div className="seg" role="radiogroup" aria-label="Sens du pivot">
          <button
            type="button"
            role="radio"
            aria-checked={mode === 'pivot'}
            className={mode === 'pivot' ? 'on' : ''}
            onClick={() => set({ mode: 'pivot' })}
          >
            Pivoter
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={mode === 'unpivot'}
            className={mode === 'unpivot' ? 'on' : ''}
            onClick={() => set({ mode: 'unpivot' })}
          >
            Dépivoter
          </button>
        </div>
        <span className="muted">
          {mode === 'pivot' ? (
            <>
              étaler les valeurs d'une colonne en nouvelles colonnes (comme un TCD Excel).{' '}
              <InfoBubble>
                <b>Pivot</b> = un TCD Excel : pour chaque combinaison des <b>colonnes conservées</b>
                , on crée une ligne ; la <b>colonne à éclater</b> devient autant de nouvelles
                colonnes que de valeurs distinctes (« Janvier », « Février »…), chacune remplie par
                l'agrégat de la <b>colonne de valeurs</b>. <b>SUM</b> pour des montants,{' '}
                <b>COUNT</b> pour compter, <b>AVG</b> pour une moyenne.
              </InfoBubble>
            </>
          ) : (
            <>
              replier plusieurs colonnes en deux (nom, valeur) — format « tidy ».{' '}
              <InfoBubble>
                <b>Dépivot</b> = inverse de Pivot. Plusieurs colonnes (« Janvier », « Février »…)
                deviennent <b>deux</b> colonnes : un libellé (le nom de l'ancienne colonne) et la
                valeur correspondante. Utile pour repasser à un format « tidy » avant un <b>SQL</b>{' '}
                ou un <b>Calc</b>.
              </InfoBubble>
            </>
          )}
        </span>
      </div>

      {mode === 'pivot' ? (
        <>
          <div className="fld">
            <span>Lignes (colonnes conservées)</span>
            <ColumnPicker
              multi
              columns={inputs[0]?.columns || []}
              value={idx}
              onChange={(v) => set({ index_columns: v })}
            />
          </div>
          <div className="fld">
            <span>Colonne à éclater en colonnes</span>
            <ColumnPicker
              columns={inputs[0]?.columns || []}
              value={d.pivot_column || ''}
              onChange={(v) => set({ pivot_column: v })}
            />
          </div>
          <div className="fld">
            <span>Colonne de valeurs</span>
            <ColumnPicker
              columns={inputs[0]?.columns || []}
              value={d.value_column || ''}
              onChange={(v) => set({ value_column: v })}
            />
          </div>
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
          <div className="fld">
            <span>Colonnes à dépivoter</span>
            <ColumnPicker
              multi
              columns={inputs[0]?.columns || []}
              value={vals}
              onChange={(v) => set({ value_columns: v })}
            />
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
      <div className="cond-readback">
        <Icon name="check" size={12} />
        <span>{readback}</span>
      </div>
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
      <div className="cfg-intent">
        <span className="cfg-intent-lede">
          Nettoyer la donnée, opération par opération{ops.length ? ` (${ops.length})` : ''}.
        </span>
        <span className="muted">
          Les opérations s'appliquent dans l'ordre ; un rapport montre à chaque exécution ce qui a
          changé ou échoué.
        </span>
      </div>
      <button className="ghost small" onClick={add}>
        <Icon name="plus" size={12} /> Ajouter une opération
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
        {ops.length === 0 && (
          <div className="calc-examples">
            <div className="qb-hint">Aucune opération. Exemples (cliquez pour insérer) :</div>
            {CLEAN_EXAMPLES.map((ex, i) => (
              <button
                key={i}
                className="calc-example"
                onClick={() => set({ operations: ex.ops.map((o) => ({ ...o })) })}
                title={ex.desc}
              >
                <b>{ex.title}</b>
                <span className="calc-example-desc">{ex.desc}</span>
              </button>
            ))}
          </div>
        )}
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
        <ColumnPicker
          multi
          columns={cols}
          value={part}
          onChange={(v) => setG({ partition_by: v })}
          emptyMessage="— colonnes non chargées —"
        />
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

// a value that is either a typed constant or a reference to another column
function ValueField({ cols, value, isCol, onValue, onToggle, placeholder = 'valeur' }) {
  return (
    <span className="calc-valuefield">
      {isCol ? (
        <ColumnPicker
          compact
          columns={cols}
          value={value || ''}
          onChange={onValue}
          placeholder="— colonne —"
        />
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
            <ColumnPicker
              compact
              columns={cols}
              value={p.value || ''}
              onChange={(v) => upd(i, { value: v })}
              placeholder="— colonne —"
            />
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
            <ColumnPicker
              compact
              columns={cols}
              value={op.column || ''}
              onChange={(v) => setOp({ column: v })}
              placeholder="— colonne —"
            />
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
            <ColumnPicker
              compact
              columns={cols}
              value={op.column || ''}
              onChange={(v) => setOp({ column: v })}
              placeholder="— colonne —"
            />
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
            <ColumnPicker
              compact
              columns={cols}
              value={op.column || ''}
              onChange={(v) => setOp({ column: v })}
              placeholder="— colonne —"
            />
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
          <ColumnPicker
            compact
            columns={cols}
            value={op.column || ''}
            onChange={(v) => setOp({ column: v })}
            placeholder="— colonne —"
          />
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

      <div className="cfg-intent">
        <span className="cfg-intent-lede">
          Ajouter des colonnes calculées{items.length ? ` (${items.length})` : ''}.
        </span>
        <span className="muted">
          Chaque colonne se construit par un choix d'opération — sans écrire de formule (ou en mode
          formule avancé). Une colonne peut réutiliser une colonne calculée plus haut.{' '}
          <InfoBubble>
            Chaque colonne se construit avec un <b>choix d'opération</b> (extraire un morceau de
            texte, transformer, combiner, condition Si…, calcul) — sans écrire de formule.
            <br />
            <b>Extraire</b> couvre le besoin courant : p.ex. le nom d'un fichier = « le texte après
            le séparateur <code>\</code>, dernière occurrence » (bouton préréglage « nom de fichier
            »).
            <br />
            La formule générée reste affichée. Le mode <b>Formule (avancé)</b> permet d'écrire
            directement : <code>[Nom]</code> = colonne, <code>"texte"</code> = littéral,{' '}
            <code>&amp;</code> = concaténer, et toutes les fonctions (IF, TEXTAFTER, REGEXEXTRACT…).
          </InfoBubble>
        </span>
      </div>
      <button className="ghost small" onClick={add}>
        <Icon name="plus" size={12} /> Ajouter une colonne calculée
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
  const byName = d.by_name !== false
  return (
    <div className="insp-body">
      <div className="cfg-intent">
        <span className="cfg-intent-lede">
          Empiler {inputs.length} entrée{inputs.length > 1 ? 's' : ''}, alignées&nbsp;:
        </span>
        <div className="seg" role="radiogroup" aria-label="Alignement des colonnes">
          <button
            type="button"
            role="radio"
            aria-checked={byName}
            className={byName ? 'on' : ''}
            onClick={() => set({ by_name: true })}
          >
            Par nom
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={!byName}
            className={!byName ? 'on' : ''}
            onClick={() => set({ by_name: false })}
          >
            Par position
          </button>
        </div>
        <span className="muted">
          {byName
            ? 'colonnes rapprochées par leur nom ; les manquantes deviennent vides (NULL).'
            : '1ʳᵉ colonne avec la 1ʳᵉ, etc. ; les noms du premier bloc gagnent — ordre identique requis.'}{' '}
          <InfoBubble wide>
            <b>Union</b> empile les lignes de toutes les entrées reliées à l'ancre <b>in</b> (comme
            coller des feuilles l'une sous l'autre). Deux stratégies d'alignement :
            <ul className="bullets">
              <li>
                <b>Par nom</b> — les colonnes sont rapprochées par leur nom ; les colonnes
                manquantes d'un côté deviennent <i>vides</i> (NULL). Robuste si les en-têtes
                coïncident.
              </li>
              <li>
                <b>Par position</b> — la 1ʳᵉ colonne avec la 1ʳᵉ, la 2ᵉ avec la 2ᵉ… Les noms du{' '}
                <b>premier</b> bloc gagnent. À n'utiliser que si l'ordre est identique partout.
              </li>
            </ul>
          </InfoBubble>
        </span>
      </div>
      <label className="qb-check">
        <input
          type="checkbox"
          checked={!!d.distinct}
          onChange={(e) => set({ distinct: e.target.checked })}
        />
        Supprimer les lignes en double après empilement
      </label>
      <UnionSchemaPreview inputs={inputs} byName={byName} />
    </div>
  )
}

// F.1 — Aperçu de l'alignement, juste sous la config Union. Pas un dry-run :
// on lit les schémas déjà connus côté front (récupérés au mount via /schema)
// pour montrer, *avant* d'exécuter, où sont les orphelines et les écarts.
//
// Deux modes, deux écueils différents :
//   - Par nom  : « si un nom diffère même d'une lettre, la colonne devient
//                 NULL d'un côté ». On liste les orphelines avec leur source.
//   - Par position : « la 1ʳᵉ avec la 1ʳᵉ ». On lève le drapeau si les
//                    longueurs diffèrent — c'est l'erreur silencieuse classique.
function UnionSchemaPreview({ inputs, byName }) {
  if (!inputs || inputs.length === 0) {
    return (
      <div className="qb-hint" style={{ marginTop: 8 }}>
        Reliez au moins deux blocs à l'ancre <b>in</b> pour voir l'aperçu de l'alignement.
      </div>
    )
  }
  const hasSchemas = inputs.every((i) => (i.columns || []).length > 0)
  if (!hasSchemas) {
    return (
      <div className="qb-hint" style={{ marginTop: 8 }}>
        Exécutez les blocs amont pour voir comment leurs colonnes vont s'aligner.
      </div>
    )
  }
  if (inputs.length === 1) {
    return (
      <div className="qb-hint" style={{ marginTop: 8 }}>
        Une seule entrée — l'union reproduira simplement le bloc amont ({inputs[0].columns.length}{' '}
        colonnes).
      </div>
    )
  }
  // ---- mode « par nom » : carte des présences ----
  if (byName) {
    const presence = new Map() // name → Set<inputIndex>
    inputs.forEach((inp, i) =>
      (inp.columns || []).forEach((c) => {
        if (!presence.has(c.name)) presence.set(c.name, new Set())
        presence.get(c.name).add(i)
      }),
    )
    const total = presence.size
    const common = [...presence.values()].filter((s) => s.size === inputs.length).length
    const orphans = [...presence.entries()]
      .filter(([, s]) => s.size < inputs.length)
      .map(([name, s]) => ({ name, sources: [...s] }))
    return (
      <div className="union-preview">
        <div className="union-preview-h">Aperçu de l'alignement</div>
        <div className="union-preview-tiles">
          <span>
            <b>{total}</b> colonnes au total
          </span>
          <span>
            <b>{common}</b> communes à toutes les entrées
          </span>
          <span className={orphans.length ? 'warn' : ''}>
            <b>{orphans.length}</b> orphelines
          </span>
        </div>
        {orphans.length > 0 && (
          <>
            <div className="qb-hint" style={{ marginTop: 6 }}>
              Ces colonnes n'existent que dans certaines entrées — elles seront <b>vides</b> (NULL)
              ailleurs :
            </div>
            <ul className="union-orphan-list">
              {orphans.slice(0, 20).map((o) => {
                const presentLabels = o.sources.map((i) => inputs[i].label || `#${i + 1}`)
                const missingLabels = inputs
                  .map((inp, i) => (o.sources.includes(i) ? null : inp.label || `#${i + 1}`))
                  .filter(Boolean)
                // Choix de phrasing : on dit ce qui est le plus court (présents
                // si peu, manquants si peu). Évite « présente dans 12 / manque 1 ».
                const showMissing = missingLabels.length <= presentLabels.length
                return (
                  <li key={o.name}>
                    <code>{o.name}</code>
                    <span className="union-orphan-src">
                      {showMissing
                        ? `manque dans : ${missingLabels.join(', ')}`
                        : `présente dans : ${presentLabels.join(', ')}`}
                    </span>
                  </li>
                )
              })}
              {orphans.length > 20 && <li className="muted">… et {orphans.length - 20} autres</li>}
            </ul>
          </>
        )}
      </div>
    )
  }
  // ---- mode « par position » : on flag les nombres de colonnes différents ----
  const sizes = inputs.map((inp) => (inp.columns || []).length)
  const allSame = sizes.every((n) => n === sizes[0])
  return (
    <div className="union-preview">
      <div className="union-preview-h">Aperçu de l'alignement</div>
      {!allSame && (
        <div className="qb-warn" style={{ marginBottom: 6 }}>
          ⚠ Les entrées n'ont pas le même nombre de colonnes — l'union « par position » va
          probablement empiler des colonnes différentes. Vérifiez ou repassez « par nom ».
        </div>
      )}
      <ul className="union-pos-list">
        {inputs.map((inp, i) => (
          <li key={i}>
            <b>{inp.label || `Entrée ${i + 1}`}</b> — {sizes[i]} colonne(s)
            {i === 0 && <span className="muted"> (impose les noms)</span>}
          </li>
        ))}
      </ul>
    </div>
  )
}

// F.3 bonus — dry-run du Filtre. Comme `useDistribution` pour la Validation, on
// re-tire un aperçu à chaque édition de la config (debounce 350 ms), à condition
// que les deux amonts soient chargés (colonnes connues = Parquet matérialisé).
// Pas d'appel sinon : l'API ne pourrait pas lire l'entrée et renverrait 400,
// qu'on n'a aucune envie de promener en boucle.
function useFilterDryRun(pid, wid, node, mainColsLen, refColsLen) {
  const d = node.data
  // clé sérialisable : ne sert qu'à invalider l'effet, JSON.stringify est OK
  // (objet petit, frappe rare une fois le debounce écoulé).
  const cfgKey = JSON.stringify({
    m: d.mode,
    p: d.pairs,
    c: d.column,
    rc: d.ref_column,
    ci: d.case_insensitive,
  })
  const ready = pid && wid && node?.id && mainColsLen > 0 && refColsLen > 0
  const [state, setState] = useState({
    loading: false,
    res: null,
    error: null,
    ready: false,
  })
  useEffect(() => {
    if (!ready) {
      setState({ loading: false, res: null, error: null, ready: false })
      return
    }
    setState((s) => ({ ...s, loading: true, ready: true }))
    const h = setTimeout(() => {
      api
        .filterPreview(pid, wid, node.id, d)
        .then((res) => setState({ loading: false, res, error: null, ready: true }))
        .catch((e) =>
          setState({ loading: false, res: null, error: e.message || String(e), ready: true }),
        )
    }, 350)
    return () => clearTimeout(h)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pid, wid, node?.id, cfgKey, ready])
  return state
}

function FilterConfig({ pid, wid, node, inputs, set }) {
  const d = node.data
  const main = inputs.find((i) => i.alias === 'in')
  const ref = inputs.find((i) => i.alias === 'ref')
  const mainCols = main?.columns || []
  const refCols = ref?.columns || []
  const keep = d.mode !== 'exclude'
  const dryRun = useFilterDryRun(pid, wid, node, mainCols.length, refCols.length)

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
      <div className="cfg-intent">
        <span className="cfg-intent-lede">Je veux&nbsp;:</span>
        <div className="seg" role="radiogroup" aria-label="Mode du filtre">
          <button
            type="button"
            role="radio"
            aria-checked={keep}
            className={keep ? 'on' : ''}
            onClick={() => set({ mode: 'keep' })}
          >
            Garder
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={!keep}
            className={!keep ? 'on' : ''}
            onClick={() => set({ mode: 'exclude' })}
          >
            Exclure
          </button>
        </div>
        <span className="muted">
          les lignes des <b>données</b> présentes dans la <b>référence</b>{' '}
          {keep ? '(semi-jointure)' : '(anti-jointure)'} — la référence est seulement consultée,
          jamais fusionnée.
        </span>
      </div>

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

      <div className="ports-head" style={{ marginTop: 6 }}>
        <span className="ports-title">La clé : quelles colonnes comparer</span>
        <InfoBubble>
          Comparez plusieurs colonnes en parallèle pour former une <b>clé composite</b> : une ligne
          ne « matche » que si la référence contient une ligne avec exactement les mêmes valeurs sur
          toutes les paires choisies.
        </InfoBubble>
      </div>
      {pairs.map((p, i) => (
        <div className="qb-row" key={i} style={{ alignItems: 'flex-end', gap: 6 }}>
          <div className="fld" style={{ flex: 1 }}>
            <span>{i === 0 ? 'Données' : ''}</span>
            <ColumnPicker
              compact
              columns={mainCols}
              value={p.column || ''}
              onChange={(v) => updatePair(i, { column: v })}
              placeholder="— colonne —"
              emptyMessage="(exécutez l'amont « données »)"
            />
          </div>
          <span className="qb-hint" style={{ paddingBottom: 6 }}>
            =
          </span>
          <div className="fld" style={{ flex: 1 }}>
            <span>{i === 0 ? 'Référence' : ''}</span>
            <ColumnPicker
              compact
              columns={refCols}
              value={p.ref_column || ''}
              onChange={(v) => updatePair(i, { ref_column: v })}
              placeholder="— colonne —"
              emptyMessage="(exécutez l'amont « référence »)"
            />
          </div>
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

      <FilterDryRunPanel dryRun={dryRun} keep={keep} />
    </div>
  )
}

// F.3 bonus — encadré « aperçu sans exécuter ». Affiché en bas de la config :
// l'utilisateur voit, dès qu'il configure ses paires, combien de lignes vont
// rester (ou disparaître), sans avoir à cliquer Exécuter et attendre.
function FilterDryRunPanel({ dryRun, keep }) {
  if (!dryRun.ready) {
    return (
      <div className="filter-dryrun filter-dryrun-hint">
        <Icon name="info" size={12} /> Exécutez les amonts pour voir combien de lignes seraient
        gardées / exclues.
      </div>
    )
  }
  if (dryRun.loading && !dryRun.res) {
    return <div className="filter-dryrun filter-dryrun-hint">Calcul de l'aperçu…</div>
  }
  if (dryRun.error) {
    return (
      <div className="filter-dryrun filter-dryrun-warn">Aperçu indisponible : {dryRun.error}</div>
    )
  }
  const r = dryRun.res
  if (!r) return null
  if (r.status !== 'ok') {
    return <div className="filter-dryrun filter-dryrun-hint">Aperçu en attente — {r.message}.</div>
  }
  const fmt = (n) => Number(n || 0).toLocaleString('fr-FR')
  const pct = r.total_main > 0 ? Math.round((r.kept / r.total_main) * 100) : 0
  // Largeur de la barre de gardés en %. À 100% de gardés on remplit tout ; à 0 vide.
  const keptPct = r.total_main > 0 ? (r.kept / r.total_main) * 100 : 0
  return (
    <div className="filter-dryrun">
      <div className="filter-dryrun-head">
        <b>Aperçu</b>{' '}
        <span className="qb-hint">
          sur {fmt(r.total_main)} ligne{r.total_main > 1 ? 's' : ''} des données
          {r.total_ref != null && (
            <>
              {' '}
              · {fmt(r.total_ref)} référence{r.total_ref > 1 ? 's' : ''}
            </>
          )}
        </span>
      </div>
      <div
        className="filter-dryrun-bar"
        role="img"
        aria-label={`${pct}% gardées, ${100 - pct}% exclues`}
      >
        <div className="filter-dryrun-bar-kept" style={{ width: `${keptPct}%` }} />
      </div>
      <div className="filter-dryrun-counts">
        <span className="filter-dryrun-kept">
          <b>{fmt(r.kept)}</b> gardée{r.kept > 1 ? 's' : ''} ({pct}%)
        </span>
        <span className="filter-dryrun-excluded">
          <b>{fmt(r.excluded)}</b> exclue{r.excluded > 1 ? 's' : ''}
        </span>
      </div>
      {r.null_keys > 0 && (
        <p className="qb-hint" style={{ marginTop: 4 }}>
          {fmt(r.null_keys)} ligne{r.null_keys > 1 ? 's ont' : ' a'} au moins une cellule vide dans
          les colonnes comparées —{' '}
          {keep ? 'exclue(s) faute de pouvoir matcher' : 'gardée(s) (faute de pouvoir matcher)'}.
        </p>
      )}
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
  const keptCount = present.filter((it) => it.keep !== false).length
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
      <div className="cfg-intent">
        <span className="cfg-intent-lede">Choisir, réordonner et renommer les colonnes.</span>
        <span className="muted">
          Décochez pour supprimer · <b>↑ ↓</b> pour réordonner · le champ de droite pour renommer.
          {present.length > 0 && (
            <>
              {' '}
              <b>
                {keptCount} gardée{keptCount > 1 ? 's' : ''}
              </b>{' '}
              sur {present.length}.
            </>
          )}{' '}
          <InfoBubble>
            <b>Décochez</b> pour supprimer une colonne, <b>↑ ↓</b> pour réordonner, et le champ de
            droite pour <b>renommer</b> (laissez vide pour garder le nom). Les colonnes apparues en
            amont après coup sont ajoutées automatiquement à la fin.
          </InfoBubble>
        </span>
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
      <div className="cfg-intent">
        <span className="cfg-intent-lede">
          Faire l'état des lieux des données
          {items.length ? ` (${items.length} analyse${items.length > 1 ? 's' : ''})` : ''}.
        </span>
        <span className="muted">
          Bloc d'information (non exporté, sans sortie). Chaque analyse ventile une colonne selon un
          critère et l'affiche en camembert, barres ou tableau.{' '}
          <InfoBubble>
            Bloc <b>à titre d'information</b> (non exporté, sans sortie). Chaque analyse{' '}
            <b>ventile</b> une colonne selon un critère — <b>valeurs</b>, <b>préfixe</b>,{' '}
            <b>suffixe</b>, <b>longueur</b>, ou le <b>respect d'une règle / d'un masque</b> (comme
            dans la Validation) — et l'affiche en <b>camembert</b>, barres ou tableau. Ex. : préfixe
            des noms de fichiers en camembert → quels préfixes, combien d'occurrences. L'analyse{' '}
            <b>Clés multiples</b> regroupe les lignes par une clé (une ou plusieurs colonnes) :
            doublons, unicité (clé candidate ?), taille des groupes, cohérence des autres colonnes
            par clé, et exploration des plus gros groupes. Visible au clic et dans la{' '}
            <b>documentation Excel</b>.
          </InfoBubble>
        </span>
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

// Dry-run live du bloc Doublons (compteur de doublons + tailles des 3 sorties)
// à chaque édition de la config — calé sur `useFilterDryRun`. Pas d'appel tant
// que les colonnes ne sont pas chargées (Parquet amont matérialisé).
function useDedupDryRun(pid, wid, node, colsLen) {
  const d = node.data
  const cfgKey = JSON.stringify({ k: d.key_columns, keep: d.keep, m: d.dups_mode })
  const ready = pid && wid && node?.id && colsLen > 0
  const [state, setState] = useState({ loading: false, res: null, error: null, ready: false })
  useEffect(() => {
    if (!ready) {
      setState({ loading: false, res: null, error: null, ready: false })
      return
    }
    setState((s) => ({ ...s, loading: true, ready: true }))
    const h = setTimeout(() => {
      api
        .dedupPreview(pid, wid, node.id, d)
        .then((res) => setState({ loading: false, res, error: null, ready: true }))
        .catch((e) =>
          setState({ loading: false, res: null, error: e.message || String(e), ready: true }),
        )
    }, 350)
    return () => clearTimeout(h)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pid, wid, node?.id, cfgKey, ready])
  return state
}

const fmtInt = (v) => Number(v ?? 0).toLocaleString('fr-FR')

// Bloc Doublons — refonte ergonomique (pilote du rework).
// La config se lit comme une phrase : « deux lignes sont des doublons quand
// elles partagent : [colonnes] ». Compteur live, sorties chiffrées, options
// rares repliées (divulgation progressive).
function DedupConfig({ pid, wid, node, inputs, set }) {
  const d = node.data
  const cols = inputs[0]?.columns || []
  const selected = d.key_columns || []
  const dry = useDedupDryRun(pid, wid, node, cols.length)
  const available = cols.filter((c) => !selected.includes(c?.name ?? String(c)))
  const keep = d.keep === 'last' ? 'last' : 'first'

  const addKey = (name) => name && set({ key_columns: [...selected, name] })
  const removeKey = (name) => set({ key_columns: selected.filter((k) => k !== name) })

  return (
    <div className="insp-body dedup">
      {inputs.length === 0 && (
        <div className="qb-warn">
          Connectez une entrée (ancre <b>in</b>) puis exécutez le bloc amont pour charger ses
          colonnes.
        </div>
      )}

      <div className="dedup-sentence">
        <span className="dedup-lede">
          Deux lignes sont des doublons quand elles partagent&nbsp;:
          <InfoBubble>
            Aucune colonne → doublon sur la <b>ligne entière</b>. Plusieurs colonnes → doublon sur
            leur <b>combinaison</b> (toutes identiques).
          </InfoBubble>
        </span>
        <div className="keychips">
          {selected.length === 0 ? (
            <span
              className="keychip keychip-whole"
              title="Aucune colonne-clé : le doublon porte sur la ligne entière"
            >
              la ligne entière
            </span>
          ) : (
            selected.map((name) => (
              <span className="keychip" key={name}>
                {name}
                <button
                  type="button"
                  className="keychip-x"
                  aria-label={`Retirer la colonne ${name}`}
                  onClick={() => removeKey(name)}
                >
                  ×
                </button>
              </span>
            ))
          )}
          {available.length > 0 && (
            <select
              className="keychip-add"
              value=""
              aria-label="Ajouter une colonne-clé"
              onChange={(e) => {
                addKey(e.target.value)
                e.target.value = ''
              }}
            >
              <option value="">+ colonne</option>
              {available.map((c) => {
                const name = c?.name ?? String(c)
                return (
                  <option key={name} value={name}>
                    {name}
                    {c?.type ? ` (${shortType(c.type)})` : ''}
                  </option>
                )
              })}
            </select>
          )}
        </div>
        <DedupCountLine dry={dry} />
      </div>

      <div className="dedup-keep">
        <span className="dedup-keep-lbl">On garde&nbsp;:</span>
        <div className="seg" role="radiogroup" aria-label="Exemplaire à conserver">
          <button
            type="button"
            role="radio"
            aria-checked={keep === 'first'}
            className={keep === 'first' ? 'on' : ''}
            onClick={() => set({ keep: 'first' })}
          >
            la 1re occurrence
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={keep === 'last'}
            className={keep === 'last' ? 'on' : ''}
            onClick={() => set({ keep: 'last' })}
          >
            la dernière
          </button>
        </div>
      </div>

      <DedupOutputs dry={dry} />

      <details className="dedup-adv">
        <summary>Options avancées</summary>
        <label className="fld">
          <span>La sortie « Doublons » contient…</span>
          <select value={d.dups_mode || 'all'} onChange={(e) => set({ dups_mode: e.target.value })}>
            <option value="all">Toutes les occurrences des groupes en double</option>
            <option value="exemplar">Un exemplaire par groupe en double</option>
            <option value="extra">Seulement les occurrences en trop</option>
          </select>
        </label>
      </details>
    </div>
  )
}

function DedupCountLine({ dry }) {
  if (!dry.ready)
    return (
      <div className="dedup-count dedup-count-hint">
        Exécutez le bloc amont pour compter les doublons.
      </div>
    )
  if (dry.loading) return <div className="dedup-count dedup-count-hint">Calcul de l'aperçu…</div>
  if (dry.error)
    return <div className="dedup-count dedup-count-warn">Aperçu indisponible : {dry.error}</div>
  const r = dry.res
  if (!r || r.status !== 'ok')
    return (
      <div className="dedup-count dedup-count-warn">{r?.message || 'Aperçu indisponible.'}</div>
    )
  const pct = r.total ? Math.round((r.extra / r.total) * 100) : 0
  if (r.extra === 0)
    return (
      <div className="dedup-count dedup-count-ok">
        Aucun doublon sur cette clé — les {fmtInt(r.total)} lignes sont uniques.
      </div>
    )
  return (
    <div className="dedup-count">
      ↳ <b>{fmtInt(r.extra)}</b> ligne{r.extra > 1 ? 's' : ''} en double
      {r.dup_groups > 0 && (
        <>
          {' '}
          dans <b>{fmtInt(r.dup_groups)}</b> groupe{r.dup_groups > 1 ? 's' : ''}
        </>
      )}
      <span className="muted">
        {' '}
        · sur {fmtInt(r.total)} ({pct}%)
      </span>
    </div>
  )
}

function DedupOutputs({ dry }) {
  const r = dry.ready && !dry.loading && !dry.error && dry.res?.status === 'ok' ? dry.res : null
  const n = (v) => (r ? fmtInt(v) : '—')
  const rows = [
    ['kept', 'Dédoublonné', r?.kept, 'un exemplaire par groupe'],
    ['dups', 'Doublons', r?.dups, 'selon l’option ci-dessous'],
    ['uniq', 'Uniques', r?.uniques, 'lignes présentes une seule fois'],
  ]
  return (
    <div className="dedup-cfg-outs" aria-label="Sorties du bloc">
      {rows.map(([cls, name, val, desc]) => (
        <div className="dedup-cfg-out" key={cls}>
          <span className={`odot ${cls}`} aria-hidden="true" />
          <span className="dedup-cfg-out-name">{name}</span>
          <span className="dedup-cfg-out-n">{n(val)}</span>
          <span className="dedup-cfg-out-desc muted">{desc}</span>
        </div>
      ))}
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
  // A.8 — pièges xlsx remontés par le backend (cellules fusionnées, en-tête
  // multi-lignes…). Affichés en surface-warn dans l'aperçu Source.
  const [warnings, setWarnings] = useState([])

  const refresh = (file, sheet, headerRow, opts) => {
    if (!file) return
    api
      .peek(pid, file, sheet, headerRow, opts)
      .then((p) => {
        if (p.sheets) setSheets(p.sheets)
        setDetected(p.detected || {})
        setColCount(p.columns?.length ?? null)
        setWarnings(p.warnings || [])
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
  // Fichiers uploadés uniquement — `listFiles` inclut aussi les exports (même
  // nom dans plusieurs workflows) ; les sources ne lisent que `files/`.
  const sourceFiles = files.filter((f) => f.origin !== 'export')

  return (
    <div className="insp-body">
      <div className="cfg-intent">
        <span className="cfg-intent-lede">Lire un fichier Excel/CSV.</span>
        <span className="muted">
          Le point de départ du workflow. Encodage, séparateur et décimale sont détectés
          automatiquement (et ajustables ci-dessous).
        </span>
      </div>
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
          {sourceFiles.map((f) => (
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

      {/* A.8 — avertissements xlsx (cellules fusionnées, en-tête multi-lignes). */}
      {warnings.length > 0 && (
        <div className="notice notice-warn" role="alert">
          {warnings.map((w, i) => (
            <p key={i}>{w}</p>
          ))}
        </div>
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

function InfoBubble({ children, wide }) {
  return (
    <span className="info-bubble" tabIndex={0}>
      <Icon name="info" size={14} />
      <span className={`info-pop${wide ? ' wide' : ''}`} role="tooltip">
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
  // Entrées : au moins `inputCount` ports (défaut 2), et au moins autant que
  // d'entrées réellement branchées (in3 connectée ⇒ on montre jusqu'à 3).
  const connectedMax = inputs.reduce((m, i) => {
    const k = /^in(\d+)$/.exec(i.alias)
    return k ? Math.max(m, Number(k[1])) : m
  }, 0)
  const nIn = Math.max(1, d.inputCount || 2, connectedMax)
  const ports = Array.from({ length: nIn }, (_, i) => ({
    num: i + 1,
    alias: `in${i + 1}`,
    source: inputs.find((x) => x.alias === `in${i + 1}`),
  }))
  const connected = ports.filter((p) => p.source)
  const setInputs = (n) => set({ inputCount: Math.max(1, n) })
  return (
    <div className="insp-body">
      <div className="cfg-intent">
        <span className="cfg-intent-lede">Transformer en SQL&nbsp;:</span>
        <div className="seg" role="radiogroup" aria-label="Mode SQL">
          <button
            type="button"
            role="radio"
            aria-checked={mode === 'builder'}
            className={mode === 'builder' ? 'on' : ''}
            onClick={() => set({ mode: 'builder' })}
          >
            Constructeur visuel
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={mode === 'raw'}
            className={mode === 'raw' ? 'on' : ''}
            onClick={() => set({ mode: 'raw' })}
          >
            SQL brut
          </button>
        </div>
        <span className="muted">
          {mode === 'builder'
            ? 'sélection, filtres, jointures, regroupements — sans écrire de SQL.'
            : 'écrivez la requête DuckDB ; les entrées sont les tables in1, in2, in3…'}
        </span>
      </div>

      <div className="ports">
        <div className="ports-head">
          <span className="ports-title">Entrées</span>
          <InfoBubble>
            <b>in1</b> — table principale (le <code>FROM</code>). <b>in2, in3…</b> — tables
            additionnelles, à brancher pour des <b>jointures</b> ou des unions.
            <br />
            Une seule entrée suffit pour filtrer, agréger, trier… Ajoutez-en autant que
            nécessaire avec <b>+ entrée</b>.
          </InfoBubble>
          <span className="ports-add">
            <button
              type="button"
              className="ghost small"
              disabled={nIn <= 1}
              onClick={() => setInputs(nIn - 1)}
              title="Retirer la dernière entrée"
              aria-label="Retirer la dernière entrée"
            >
              –
            </button>
            <button
              type="button"
              className="ghost small"
              onClick={() => setInputs(nIn + 1)}
              title="Ajouter une entrée"
            >
              + entrée
            </button>
          </span>
        </div>
        <div className="ports-row">
          {ports.map((p) => (
            <PortTag
              key={p.alias}
              num={p.num}
              name={p.num === 1 ? 'principale' : p.alias}
              optional={p.num > 1}
              source={p.source}
            />
          ))}
        </div>
      </div>
      {mode === 'raw' ? (
        <>
          <p className="qb-hint">
            Utilisez les alias d'entrée comme tables :{' '}
            {ports.map((p, i) => (
              <span key={p.alias}>
                {i > 0 ? ', ' : ''}
                <code>{p.alias}</code>
              </span>
            ))}
            .
          </p>
          {connected.length > 0 && (
            <div className="sql-legend" aria-label="Correspondance des entrées">
              {connected.map((p) => (
                <div className="sql-legend-row" key={p.alias}>
                  <code>{p.alias}</code>
                  <span className="sql-legend-eq">=</span>
                  <span className="sql-legend-name" title={p.source.label}>
                    «&nbsp;{p.source.label}&nbsp;»
                  </span>
                  {(p.source.columns || []).length === 0 && (
                    <span className="muted">&nbsp;· exécutez l'amont pour voir les colonnes</span>
                  )}
                </div>
              ))}
            </div>
          )}
          <textarea
            className="sql-edit"
            rows={12}
            placeholder={'SELECT *\nFROM in1\nWHERE ...'}
            value={d.raw_sql || ''}
            onChange={(e) => set({ raw_sql: e.target.value })}
          />
          {!(d.raw_sql || '').trim() && (
            <div className="calc-examples">
              <div className="qb-hint">Exemples DuckDB (cliquez pour insérer) :</div>
              {SQL_RAW_EXAMPLES.map((ex, i) => (
                <button
                  key={i}
                  className="calc-example"
                  onClick={() => set({ raw_sql: ex.sql })}
                  title={ex.desc}
                >
                  <b>{ex.title}</b>
                  <span className="calc-example-desc">{ex.desc}</span>
                </button>
              ))}
            </div>
          )}
        </>
      ) : (
        <QueryBuilder value={d.query} inputs={inputs} onChange={(q) => set({ query: q })} />
      )}
    </div>
  )
}

// F.4 — Préréglages SQL brut. Pas de magie : on dépose une requête à
// retoucher, l'utilisateur change les noms de colonnes. La page blanche du
// `<textarea>` était le pire ennemi de ce mode — un alias `in1` à coller,
// ça donne le bon départ.
const SQL_RAW_EXAMPLES = [
  {
    title: 'Filtrer',
    desc: 'WHERE sur une colonne',
    sql: 'SELECT *\nFROM in1\nWHERE colonne > 0',
  },
  {
    title: 'Compter par catégorie',
    desc: 'GROUP BY + tri décroissant',
    sql: 'SELECT colonne, COUNT(*) AS n\nFROM in1\nGROUP BY colonne\nORDER BY n DESC',
  },
  {
    title: 'Valeurs distinctes',
    desc: 'DISTINCT sur une colonne',
    sql: 'SELECT DISTINCT colonne\nFROM in1\nORDER BY colonne',
  },
  {
    title: 'Top 10 récents',
    desc: 'ORDER BY + LIMIT',
    sql: 'SELECT *\nFROM in1\nORDER BY date DESC\nLIMIT 10',
  },
  {
    title: 'Jointure (port 2 branché)',
    desc: 'LEFT JOIN entre in1 et in2 sur une clé commune',
    sql: 'SELECT in1.*, in2.libelle\nFROM in1\nLEFT JOIN in2 USING (id)',
  },
]

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
  // Emplacement réel sur le disque : exports/<workflow>/… (PAS files/, qui ne
  // contient que les sources importées).
  const sub = exportSubdir(wfName)
  return (
    <div className="insp-body">
      <div className="cfg-intent">
        <span className="cfg-intent-lede">Écrire le résultat dans un fichier.</span>
        <span className="muted">
          (Re)généré à chaque exécution, dans <b>exports/{sub}/</b> (dossier des exports du
          workflow — bouton dossier sur le bloc pour l'ouvrir). <b>Réécrit</b> le fichier s'il existe
          déjà.
        </span>
      </div>
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

      <div className="cond-readback">
        <Icon name="download" size={12} />
        <span>
          {toWb ? (
            <>
              Feuille <code>{sanitizeSheet(shown)}</code> du classeur{' '}
              <code>
                exports/{sub}/{wb}
              </code>{' '}
              — les autres exports « classeur » de ce workflow s'y ajoutent comme feuilles.
            </>
          ) : (
            <>
              Écrit{' '}
              <code>
                exports/{sub}/{shown || 'resultat'}.{d.format === 'csv' ? 'csv' : 'xlsx'}
              </code>
              .
            </>
          )}
        </span>
      </div>
      <p className="qb-hint">Un export sans données (0 ligne) ne crée aucun fichier.</p>
    </div>
  )
}
