import { useEffect, useRef, useState } from 'react'
import { api } from '../api'
import Icon from './Icon'
import ColumnPicker from './ui/ColumnPicker'
import {
  VAL_TESTS,
  CHAR_CLASS,
  needs,
  SEG_TYPES,
  OUTPUT_COLORS,
  uid,
  buildMaskPattern,
  makeCondition,
  ruleSummary,
  VS_COLUMN_TESTS,
  MULTI_VALUE_TESTS,
} from './validateHelpers'

// Relecture d'une condition en langage clair (le « ça se lit comme une phrase »
// du rework). Pour le mode règles : groupes joints par OU, règles par ET, via
// le résumé FR existant. Mask/groupe : pas de relecture (le builder a déjà sa
// propre lisibilité). Défensif — une config en cours d'édition ne doit jamais
// faire planter le panneau.
function conditionReadback(cond) {
  if (!cond || (cond.kind || 'rules') !== 'rules') return ''
  try {
    const parts = (cond.groups || [])
      .map((g) =>
        (g.rules || [])
          .map((r) => ruleSummary(r))
          .filter(Boolean)
          .join(' ET '),
      )
      .filter(Boolean)
    if (!parts.length) return ''
    return parts.length > 1 ? parts.map((p) => `(${p})`).join(' OU ') : parts[0]
  } catch {
    return ''
  }
}

function ConditionReadback({ cond }) {
  const txt = conditionReadback(cond)
  if (!txt) return null
  return (
    <div className="cond-readback" aria-live="polite">
      <Icon name="check" size={12} />
      <span>{txt}</span>
    </div>
  )
}

/*
 * Validation block = named CONDITIONS (rules-DNF or positional mask) + OUTPUTS
 * that each reference one condition (optionally negated). No "control vs router"
 * split: a conforme/non-conforme check is just a 2-output routing.
 *
 *   ConditionsEditor — left pane: the "what to test" (conditions + live testers).
 *   OutputsPane      — right pane: compact flow map + the "where it goes"
 *                      (outputs, attribution, per-output preview) — fills the space.
 */

// Live distribution (server dry-run, no materialization), debounced on config change.
export function useRoutePreview(pid, wid, node, status) {
  const d = node.data
  const [dist, setDist] = useState({ total: 0, counts: {}, error: null, loading: false })
  const cfgKey = JSON.stringify({
    o: d.outputs,
    cn: d.conditions,
    r: d.routing,
    e: d.else_enabled,
    cs: d.case_sensitive,
    tc: d.target_column,
    sp: d.split,
  })
  // Re-run after THIS block executes: running it materializes the upstream, so the
  // dry-run (which reads that input) goes from "Entrée : 0" to the real split.
  const ranKey = status?.ran ? JSON.stringify(status.outputs || status.rows) : ''
  useEffect(() => {
    setDist((s) => ({ ...s, loading: true }))
    const h = setTimeout(() => {
      api
        .routePreview(pid, wid, node.id, d)
        .then((r) =>
          setDist({ total: r.total, counts: r.counts || {}, error: null, loading: false }),
        )
        .catch((e) => setDist((s) => ({ ...s, counts: {}, error: e.message, loading: false })))
    }, 350)
    return () => clearTimeout(h)
  }, [cfgKey, ranKey]) // eslint-disable-line react-hooks/exhaustive-deps
  return dist
}

/* ======================================================================== *
 *  LEFT — conditions (the "what to test")
 * ======================================================================== */

export function ConditionsEditor({ node, cols, onChange }) {
  const d = node.data
  const conditions = d.conditions || []
  const setConditions = (next) => onChange({ conditions: next })
  const updCond = (i, patch) =>
    setConditions(conditions.map((c, j) => (j === i ? { ...c, ...patch } : c)))
  const addCond = () =>
    setConditions([...conditions, makeCondition({ name: `Condition ${conditions.length + 1}` })])
  const dupCond = (i) => {
    const src = conditions[i]
    if (!src) return
    // Copie collée juste après l'originale. Nouvel `id` pour ne pas collisionner
    // avec les références d'outputs ; nom suffixé pour repérer la copie au
    // premier coup d'œil.
    const copy = { ...src, id: 'c' + uid(), name: `${src.name || 'Condition'} (copie)` }
    setConditions([...conditions.slice(0, i + 1), copy, ...conditions.slice(i + 1)])
  }
  const delCond = (i) => {
    const removed = conditions[i]
    onChange({
      conditions: conditions.filter((_, j) => j !== i),
      outputs: (d.outputs || []).map((o) =>
        o.match?.conditionId === removed?.id
          ? { ...o, match: { conditionId: '', negate: false } }
          : o,
      ),
    })
  }

  return (
    <div className="conditions-editor">
      <div className="route-toolbar">
        <div className="fld" style={{ flex: 1, marginBottom: 0 }}>
          <span>Colonne par défaut</span>
          <ColumnPicker
            compact
            columns={cols}
            value={d.target_column || ''}
            onChange={(v) => onChange({ target_column: v })}
            placeholder="—"
            emptyMessage="(exécutez l'amont)"
          />
        </div>
        <label className="qb-check" style={{ marginBottom: 2 }}>
          <input
            type="checkbox"
            checked={!!d.case_sensitive}
            onChange={(e) => onChange({ case_sensitive: e.target.checked })}
          />
          Sensible à la casse
        </label>
      </div>

      {conditions.length === 0 && (
        <div className="qb-hint">
          Aucune condition. Créez-en une, puis attribuez-la à une sortie (à droite).
        </div>
      )}
      {conditions.map((c, i) => (
        <div className="ccard" key={c.id}>
          <div className="ccard-head">
            <Icon name="filter" size={13} />
            <input
              className="ocard-name"
              value={c.name || ''}
              placeholder="Nom de la condition"
              onChange={(e) => updCond(i, { name: e.target.value })}
            />
            <button
              className="ghost small"
              onClick={() => dupCond(i)}
              title="Dupliquer la condition"
              aria-label="Dupliquer la condition"
            >
              <Icon name="copy" />
            </button>
            <button
              className="ghost danger small"
              onClick={() => delCond(i)}
              title="Supprimer la condition"
              aria-label="Supprimer la condition"
            >
              <Icon name="x" />
            </button>
          </div>
          <ConditionBuilder
            cond={c}
            cols={cols}
            defaultCol={d.target_column}
            caseSensitive={!!d.case_sensitive}
            onChange={(patch) => updCond(i, patch)}
          />
        </div>
      ))}
      <button className="ghost route-add" onClick={addCond}>
        <Icon name="plus" /> Ajouter une condition
      </button>
    </div>
  )
}

// Sélecteur de colonne « colonne : X » réutilisé en mode règles et masque.
function CondColumn({ cols, cond, defaultCol, onChange }) {
  return (
    <div className="cond-col">
      <span className="qb-lbl">colonne</span>
      <ColumnPicker
        compact
        columns={cols}
        value={cond.column || ''}
        onChange={(v) => onChange({ column: v })}
        placeholder={defaultCol ? `défaut : ${defaultCol}` : '(par défaut)'}
      />
    </div>
  )
}

// Condition d'une Validation — refonte (le même langage que le bloc Doublons).
// On mène par le cas à 80 % (les règles, qui se lisent comme une phrase et se
// relisent en clair) ; les façons rares de définir la règle (masque positionnel,
// contrôle par groupe) passent en divulgation progressive au lieu de trois
// onglets de même poids.
function ConditionBuilder({ cond, cols, defaultCol, caseSensitive, onChange }) {
  const kind = cond.kind || 'rules'

  if (kind === 'mask' || kind === 'group') {
    const title = kind === 'mask' ? 'Masque positionnel' : 'Contrôle par groupe'
    return (
      <div className="cond-builder">
        <div className="cond-alt-head">
          <span className="cond-alt-title">{title}</span>
          <button
            className="ghost small"
            onClick={() => onChange({ kind: 'rules' })}
            title="Revenir aux règles"
          >
            <Icon name="chev-left" size={12} /> revenir aux règles
          </button>
        </div>
        {kind === 'mask' ? (
          <>
            <CondColumn cols={cols} cond={cond} defaultCol={defaultCol} onChange={onChange} />
            <MaskBuilder
              segments={cond.segments || []}
              caseSensitive={caseSensitive}
              onChange={(segments) => onChange({ segments })}
            />
            <ConditionTester cond={cond} caseSensitive={caseSensitive} onChange={onChange} />
          </>
        ) : (
          <GroupCheckBuilder cond={cond} cols={cols} defaultCol={defaultCol} onChange={onChange} />
        )}
      </div>
    )
  }

  // Mode règles (par défaut) — mené par la phrase.
  return (
    <div className="cond-builder">
      <div className="cond-lead">
        <span className="cond-lead-txt">La ligne correspond si&nbsp;:</span>
        <CondColumn cols={cols} cond={cond} defaultCol={defaultCol} onChange={onChange} />
      </div>
      <RulesBuilder
        groups={cond.groups || []}
        cols={cols}
        defaultCol={cond.column || defaultCol}
        onChange={(groups) => onChange({ groups })}
      />
      <ConditionReadback cond={cond} />
      <ConditionTester cond={cond} caseSensitive={caseSensitive} onChange={onChange} />
      <div className="cond-altlink">
        <span className="muted">Définir autrement&nbsp;:</span>
        <button type="button" className="linkish" onClick={() => onChange({ kind: 'mask' })}>
          masque positionnel
        </button>
        <span className="dotsep" aria-hidden="true">
          ·
        </span>
        <button type="button" className="linkish" onClick={() => onChange({ kind: 'group' })}>
          contrôle par groupe
        </button>
      </div>
    </div>
  )
}

// Catalog of group checks: [value, label, scope, extra]
//   scope 'col'  → needs a column to verify ; 'size' → about the group size only
//   scope 'rules'→ a per-row consequent built with the rules builder (rows_satisfy)
//   extra 'number' → a N field ; 'value' → a free value field ; null → nothing
//   extra 'col2' → a second column ; 'cmpcol' → an operator + a second column
const GROUP_CHECKS = [
  ['rows_satisfy', 'des règles personnalisées', 'rules', null],
  ['unique', 'toutes différentes (unicité)', 'col', null],
  ['constant', 'toutes identiques (constance)', 'col', null],
  ['no_null', 'jamais vide (toujours renseignée)', 'col', null],
  ['all_null', 'toujours vide (jamais renseignée)', 'col', null],
  ['not_all_null', 'pas entièrement vide (au moins une valeur)', 'col', null],
  ['distinct_eq', 'exactement N valeurs distinctes', 'col', 'number'],
  ['distinct_min', 'au moins N valeurs distinctes', 'col', 'number'],
  ['distinct_max', 'au plus N valeurs distinctes', 'col', 'number'],
  ['distinct_cmp', 'nb de valeurs distinctes', 'col', 'cmpcol'],
  ['determines', 'déterminer la colonne (dépendance fonctionnelle)', 'col', 'col2'],
  // Per-row two-column comparison, atomic per group: every row of the group
  // must satisfy "colA <op> colB" — the group fails as soon as ONE row breaks.
  ['rows_cols_cmp', 'égaler ligne par ligne (col vs col)', 'col', 'cmpcol'],
  ['contains', 'contenir la valeur', 'col', 'value'],
  ['not_contains', 'ne pas contenir la valeur', 'col', 'value'],
  ['size_eq', 'compter exactement N lignes', 'size', 'number'],
  ['size_min', 'compter au moins N lignes', 'size', 'number'],
  ['size_max', 'compter au plus N lignes', 'size', 'number'],
]

// Comparison operators for the two-column "nb de valeurs distinctes" check.
const CMP_OPS = [
  ['eq', '='],
  ['ne', '≠'],
  ['lt', '<'],
  ['le', '≤'],
  ['gt', '>'],
  ['ge', '≥'],
]

// Group check: routes rows by a property of the *group* (rows sharing a key).
// Layout reads as a sentence — the repeating KEY on top, then, indented below,
// the checked column and the property it must satisfy. It SORTS rows (a NON on
// the output isolates the offenders); it never adds a column.
// Renders only the ALORS clause for a single check (sentence + optional rules
// body). The surrounding WHEN box and "shared WHEN" plumbing live one level up
// in GroupCheckBuilder, so a single WHEN can host several ALORS lines.
//   boxed=true  -> sentence wrapped with [ALORS] tag (used inside a WHEN box)
//   boxed=false -> flat sentence, no chrome (used when there is no WHEN)
function GroupCheckAlors({ ck, cols, defaultCol, boxed, onChange, onDelete }) {
  const check = ck.check || 'unique'
  const spec = GROUP_CHECKS.find((g) => g[0] === check) || GROUP_CHECKS[0]
  const onCol = spec[2] === 'col'
  const isRules = spec[2] === 'rules' // 'rows_satisfy' consequent (a rules builder)
  const extra = spec[3]
  const colSelect = (val, onPick, placeholder = '(colonne)') => (
    <ColumnPicker
      compact
      columns={cols}
      value={val || ''}
      onChange={onPick}
      placeholder={placeholder}
    />
  )
  const checkSelect = (
    <select
      className="qb-select"
      value={check}
      onChange={(e) => onChange({ check: e.target.value })}
    >
      {GROUP_CHECKS.map(([v, l]) => (
        <option key={v} value={v}>
          {l}
        </option>
      ))}
    </select>
  )
  const delBtn = onDelete && (
    <button className="ghost danger small" onClick={onDelete} title="Retirer ce contrôle">
      <Icon name="x" />
    </button>
  )
  // The check's inline extras (N / value / op+col / col2). Same fragment in both
  // flat and boxed modes; appended after the kind selector in the property sentence.
  const extras = (
    <>
      {extra === 'number' && (
        <input
          className="qb-input narrow"
          type="number"
          min="0"
          value={ck.n ?? ''}
          onChange={(e) => onChange({ n: e.target.value })}
        />
      )}
      {extra === 'value' && (
        <>
          <button
            className="rhs-toggle"
            type="button"
            onClick={() => onChange({ via: ck.via === 'column' ? 'value' : 'column' })}
            title={
              ck.via === 'column'
                ? 'Comparer à une valeur littérale'
                : 'Comparer à une autre colonne'
            }
          >
            {ck.via === 'column' ? 'vs colonne' : 'vs valeur'}
          </button>
          {ck.via === 'column' ? (
            colSelect(ck.column2, (v) => onChange({ column2: v }), '(autre colonne)')
          ) : (
            <input
              className="qb-input"
              placeholder="valeur"
              value={ck.value ?? ''}
              onChange={(e) => onChange({ value: e.target.value })}
            />
          )}
        </>
      )}
      {extra === 'cmpcol' && (
        <>
          <select
            className="qb-select narrow"
            value={ck.op || 'eq'}
            onChange={(e) => onChange({ op: e.target.value })}
          >
            {CMP_OPS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
          <span className="qb-lbl">celui de</span>
          {colSelect(ck.column2, (v) => onChange({ column2: v }), '(autre colonne)')}
        </>
      )}
      {extra === 'col2' &&
        colSelect(ck.column2, (v) => onChange({ column2: v }), '(autre colonne)')}
    </>
  )
  return (
    <>
      <div className={boxed ? 'grp-clause-h' : 'grp-rule-body'}>
        {boxed && <span className="grp-clause-tag">ALORS</span>}
        {isRules ? (
          <>
            <span className="qb-lbl">chaque ligne respecte :</span>
            {checkSelect}
          </>
        ) : (
          <>
            {onCol && colSelect(ck.column, (v) => onChange({ column: v }))}
            <span className="qb-lbl">doit</span>
            {checkSelect}
            {extras}
          </>
        )}
        {delBtn}
      </div>
      {isRules && (
        <RulesBuilder
          groups={ck.then?.groups || []}
          cols={cols}
          defaultCol={defaultCol}
          onChange={(groups) => onChange({ then: { groups } })}
        />
      )}
    </>
  )
}

function GroupCheckBuilder({ cond, cols, defaultCol, onChange }) {
  const keys = cond.group_by || []
  // collapse the picker once a key is set — the long list rarely needs to stay open
  const [keysOpen, setKeysOpen] = useState(keys.length === 0)
  // one or several checks, AND-combined; migrate the legacy single-check shape.
  const checks =
    cond.checks && cond.checks.length
      ? cond.checks
      : [{ check: cond.check || 'unique', column: cond.column || '', n: cond.n, value: cond.value }]
  const setChecks = (next) => onChange({ checks: next })
  const updCheck = (i, patch) => setChecks(checks.map((c, j) => (j === i ? { ...c, ...patch } : c)))
  const addCheck = () => setChecks([...checks, { check: 'no_null', column: '' }])
  // a ready-to-fill "quand X … alors chaque ligne respecte …" skeleton (the headline case)
  const addConditional = () =>
    setChecks([
      ...checks,
      {
        check: 'rows_satisfy',
        when: { groups: [{ rules: [{ test: 'equals', value: '' }] }] },
        then: { groups: [{ rules: [{ test: 'not_empty' }] }] },
      },
    ])
  const delCheck = (i) => setChecks(checks.filter((_, j) => j !== i))

  // Group consecutive checks that share an identical non-empty WHEN — a UI
  // sugar over the per-check `when` data model so the user can read & write
  // "one premise, several verdicts ANDed" naturally. Each group below renders
  // a single WHEN box + N ALORS sentences + a "+ alors" button. Editing the
  // WHEN propagates the new value to every check in the group.
  const clauseGroups = []
  for (let i = 0; i < checks.length; i++) {
    const wj = JSON.stringify(checks[i].when?.groups || [])
    const hasWhen = wj !== '[]'
    const last = clauseGroups[clauseGroups.length - 1]
    if (hasWhen && last && last.whenJson === wj) {
      last.indices.push(i)
    } else {
      clauseGroups.push({ whenJson: wj, hasWhen, indices: [i] })
    }
  }
  const updGroupWhen = (g, newGroups) => {
    setChecks(
      checks.map((c, j) => (g.indices.includes(j) ? { ...c, when: { groups: newGroups } } : c)),
    )
  }
  const clearGroupWhen = (g) => {
    setChecks(checks.map((c, j) => (g.indices.includes(j) ? { ...c, when: { groups: [] } } : c)))
  }
  const addAlorsToGroup = (g) => {
    const ref = checks[g.indices[0]]
    const newCk = { check: 'no_null', column: '', when: ref.when }
    const at = g.indices[g.indices.length - 1] + 1
    setChecks([...checks.slice(0, at), newCk, ...checks.slice(at)])
  }
  const enableWhenOn = (idx) => {
    updCheck(idx, { when: { groups: [{ rules: [{ test: 'equals', value: '' }] }] } })
  }
  return (
    <div className="cond-group-check">
      <div className="grp-key">
        <button
          type="button"
          className="grp-key-head"
          onClick={() => setKeysOpen((v) => !v)}
          title={keysOpen ? 'Replier' : 'Déplier'}
        >
          <Icon name={keysOpen ? 'down' : 'chev-right'} size={11} />
          <Icon name="list" size={13} />
          <span>
            Clé de regroupement <span className="qb-lbl">— ce qui se répète</span>
          </span>
          {!keysOpen && (
            <span className="grp-key-summary">
              {keys.length === 0 ? <em>aucune</em> : keys.join(', ')}
            </span>
          )}
        </button>
        {keysOpen && (
          <ColumnPicker
            multi
            columns={cols}
            value={keys}
            onChange={(v) => onChange({ group_by: v })}
            emptyMessage="— colonnes non chargées —"
          />
        )}
      </div>

      <div className="grp-rule">
        <span className="grp-rule-lead">dans chaque groupe,</span>
        <div className="grp-checks">
          {clauseGroups.map((g, gi) => {
            const canDelete = checks.length > 1
            return (
              <div key={gi}>
                {gi > 0 && <span className="cond-and">ET</span>}
                {g.hasWhen ? (
                  <div className="grp-rule-item">
                    <div className="grp-clause-box grp-clause-when">
                      <div className="grp-clause-h">
                        <span className="grp-clause-tag">QUAND</span>
                        <span className="qb-lbl">les lignes du groupe qui vérifient :</span>
                        <button
                          className="ghost danger small"
                          title="Retirer le filtre QUAND (s'applique aux ALORS de ce bloc)"
                          onClick={() => clearGroupWhen(g)}
                        >
                          <Icon name="x" />
                        </button>
                      </div>
                      <RulesBuilder
                        groups={checks[g.indices[0]].when?.groups || []}
                        cols={cols}
                        defaultCol={defaultCol}
                        onChange={(newGroups) => updGroupWhen(g, newGroups)}
                      />
                    </div>
                    {/* one or more ALORS sharing the WHEN above */}
                    {g.indices.map((idx) => (
                      <div key={idx} className="grp-clause-box grp-clause-then">
                        <GroupCheckAlors
                          ck={checks[idx]}
                          cols={cols}
                          defaultCol={defaultCol}
                          boxed
                          onChange={(p) => updCheck(idx, p)}
                          onDelete={canDelete ? () => delCheck(idx) : null}
                        />
                      </div>
                    ))}
                    <button className="grp-when-add" onClick={() => addAlorsToGroup(g)}>
                      <Icon name="plus" size={11} /> ajouter un ALORS (ET) sous ce QUAND
                    </button>
                  </div>
                ) : (
                  /* single check without a WHEN — flat sentence, optional "+ quand…" */
                  <div className="grp-rule-item">
                    <button className="grp-when-add" onClick={() => enableWhenOn(g.indices[0])}>
                      <Icon name="plus" size={11} /> ajouter un filtre QUAND…
                    </button>
                    <GroupCheckAlors
                      ck={checks[g.indices[0]]}
                      cols={cols}
                      defaultCol={defaultCol}
                      boxed={false}
                      onChange={(p) => updCheck(g.indices[0], p)}
                      onDelete={canDelete ? () => delCheck(g.indices[0]) : null}
                    />
                  </div>
                )}
              </div>
            )
          })}
          <div className="grp-add-row">
            <button className="ghost small grp-add-check" onClick={addCheck}>
              + contrôle (ET)
            </button>
            <button className="ghost small grp-add-check" onClick={addConditional}>
              + règle conditionnelle (QUAND…)
            </button>
          </div>
        </div>
      </div>

      {keys.length === 0 && (
        <div className="qb-warn">
          ⚠ Aucune <b>clé de regroupement</b> cochée : le contrôle porte alors sur{' '}
          <b>toute la table</b>
          (l'unicité devient globale → si la colonne a des doublons, tout devient non conforme).
          Cochez ci-dessus la colonne qui se répète (ex. le nom de fichier).
        </div>
      )}
      <div className="qb-hint grp-hint">
        Une sortie reçoit la condition (groupes conformes) ; mets <b>NON</b> sur l'autre pour isoler
        les anomalies.
      </div>
    </div>
  )
}

// Rules as a DNF: OR of groups, each group an AND of rules (NON per rule).
export function RulesBuilder({ groups, cols, defaultCol, onChange }) {
  const addGroup = () => onChange([...groups, { rules: [{ test: 'contains', value: '' }] }])
  const updGroup = (gi, rules) => onChange(groups.map((g, j) => (j === gi ? { ...g, rules } : g)))
  const delGroup = (gi) => onChange(groups.filter((_, j) => j !== gi))
  // Premier rendu sur condition vide → on amorce un groupe avec une règle
  // prête à éditer, plutôt que de demander à l'utilisateur de cliquer
  // « + Groupe (OU) » d'abord (geste pré-requis non intuitif). Le `useRef`
  // empêche de re-créer après que l'utilisateur a explicitement supprimé son
  // dernier groupe : son geste fait foi.
  const seededRef = useRef(false)
  useEffect(() => {
    if (groups.length > 0) {
      seededRef.current = true
      return
    }
    if (!seededRef.current) {
      seededRef.current = true
      onChange([{ rules: [{ test: 'contains', value: '' }] }])
    }
  }, [groups, onChange])
  return (
    <div className="ocard-cond">
      {groups.length === 0 && <div className="qb-hint">Aucune règle. Ajoutez un groupe.</div>}
      {groups.map((g, gi) => (
        <div key={gi}>
          {gi > 0 && <div className="cond-or">OU</div>}
          <ConditionGroup
            rules={g.rules || []}
            cols={cols}
            defaultCol={defaultCol}
            onChange={(rules) => updGroup(gi, rules)}
            onDelete={() => delGroup(gi)}
          />
        </div>
      ))}
      <button className="ghost small cond-addgroup" onClick={addGroup}>
        + Groupe (OU)
      </button>
    </div>
  )
}

function ConditionGroup({ rules, cols, defaultCol, onChange, onDelete }) {
  const upd = (i, patch) => onChange(rules.map((r, j) => (j === i ? { ...r, ...patch } : r)))
  const add = () => onChange([...rules, { test: 'contains', value: '' }])
  const del = (i) => onChange(rules.filter((_, j) => j !== i))
  return (
    <div className="cond-group">
      <div className="cond-group-head">
        <span className="qb-lbl">TOUTES ces conditions (ET)</span>
        <button className="ghost danger small" onClick={onDelete} title="Supprimer le groupe">
          <Icon name="x" />
        </button>
      </div>
      {rules.map((r, i) => (
        <div key={i}>
          {i > 0 && <span className="cond-and">ET</span>}
          <RuleRow
            r={r}
            cols={cols}
            defaultCol={defaultCol}
            onChange={(p) => upd(i, p)}
            onDelete={() => del(i)}
          />
        </div>
      ))}
      <button className="ghost small" onClick={add}>
        + Condition (ET)
      </button>
    </div>
  )
}

export function RuleRow({ r, cols, defaultCol, onChange, onDelete }) {
  return (
    <div className="rrow">
      <button
        className={`neg ${r.negate ? 'on' : ''}`}
        onClick={() => onChange({ negate: !r.negate })}
        title="Inverser cette condition (NON)"
      >
        NON
      </button>
      <ColumnPicker
        compact
        columns={cols}
        value={r.column || ''}
        onChange={(v) => onChange({ column: v })}
        placeholder={defaultCol ? `(défaut : ${defaultCol})` : '(colonne par défaut)'}
      />
      <select
        className="qb-select"
        value={r.test}
        onChange={(e) => onChange({ test: e.target.value })}
      >
        {VAL_TESTS.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
      {needs.position.includes(r.test) && (
        <>
          <span className="qb-lbl">pos</span>
          <input
            className="qb-input narrow"
            type="number"
            min="1"
            value={r.position ?? 1}
            onChange={(e) => onChange({ position: Number(e.target.value) })}
          />
        </>
      )}
      {needs.startlen.includes(r.test) && (
        <>
          <span className="qb-lbl">de</span>
          <input
            className="qb-input narrow"
            type="number"
            min="1"
            value={r.start ?? 1}
            onChange={(e) => onChange({ start: Number(e.target.value) })}
          />
          <span className="qb-lbl">sur</span>
          <input
            className="qb-input narrow"
            type="number"
            min="1"
            value={r.length ?? 1}
            onChange={(e) => onChange({ length: Number(e.target.value) })}
          />
        </>
      )}
      {needs.cls.includes(r.test) && (
        <select
          className="qb-select"
          value={r.charclass || 'letter'}
          onChange={(e) => onChange({ charclass: e.target.value })}
        >
          {CHAR_CLASS.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      )}
      {needs.number.includes(r.test) && (
        <input
          className="qb-input narrow"
          type="number"
          min="0"
          value={r.value ?? ''}
          onChange={(e) => onChange({ value: e.target.value })}
        />
      )}
      {/* Right-hand side of a value/numeric test: by default a literal input; on
          tests that support it, a toggle flips to a column reference (r.column2). */}
      {(needs.value.includes(r.test) || needs.numericValue.includes(r.test)) && (
        <>
          {VS_COLUMN_TESTS.has(r.test) && (
            <button
              className="rhs-toggle"
              type="button"
              onClick={() => onChange({ via: r.via === 'column' ? 'value' : 'column' })}
              title={
                r.via === 'column'
                  ? 'Comparer à une valeur littérale'
                  : 'Comparer à une autre colonne'
              }
            >
              {r.via === 'column' ? 'vs colonne' : 'vs valeur'}
            </button>
          )}
          {r.via === 'column' && VS_COLUMN_TESTS.has(r.test) ? (
            <ColumnPicker
              compact
              columns={cols}
              value={r.column2 || ''}
              onChange={(v) => onChange({ column2: v })}
              placeholder="(autre colonne)"
            />
          ) : (
            <RuleValueField r={r} onChange={onChange} />
          )}
        </>
      )}
      {onDelete && (
        <button className="ghost danger small rrow-del" onClick={onDelete}>
          <Icon name="x" />
        </button>
      )}
    </div>
  )
}

// Cellule « valeur littérale » d'une règle. Par défaut input simple ; sur les
// tests qui le supportent (MULTI_VALUE_TESTS), un toggle « liste » bascule en
// textarea (une valeur par ligne). Stocke `r.values` (array) en mode liste,
// `r.value` (string) en mode simple. Les deux ne coexistent pas — le backend
// donne la priorité à `r.values` si non-vide, sinon retombe sur `r.value`.
function RuleValueField({ r, onChange }) {
  const isMulti = Array.isArray(r.values)
  const isNumeric = needs.numericValue.includes(r.test)
  const canMulti = MULTI_VALUE_TESTS.has(r.test)

  const enterMulti = () => {
    const seed = r.value ? [r.value] : []
    onChange({ values: seed, value: '' })
  }
  const leaveMulti = () => {
    const first = (r.values || []).find((v) => v && String(v).trim() !== '')
    onChange({ values: undefined, value: first ?? '' })
  }

  if (isMulti) {
    const text = (r.values || []).join('\n')
    const nonEmpty = (r.values || []).filter((v) => v && String(v).trim() !== '').length
    return (
      <div
        className="rrow-multi"
        title="Mode liste : une valeur par ligne, la règle matche si au moins une matche"
      >
        <textarea
          className="qb-input rrow-multi-area"
          rows={Math.min(8, Math.max(2, (r.values || []).length + 1))}
          placeholder={'une valeur par ligne\n(ex. 00\n01\n02)'}
          value={text}
          onChange={(e) => onChange({ values: e.target.value.split('\n') })}
        />
        <div className="rrow-multi-tail">
          <span className="rrow-multi-count">{nonEmpty} val.</span>
          <button
            type="button"
            className="rhs-toggle on"
            onClick={leaveMulti}
            title="Revenir à une valeur unique"
          >
            <Icon name="list" size={12} /> liste
          </button>
        </div>
      </div>
    )
  }

  return (
    <>
      <input
        className={`qb-input ${isNumeric ? 'narrow' : ''}`}
        type={isNumeric ? 'number' : 'text'}
        placeholder={r.test === 'is_in' ? 'F0, F1, FE…' : 'valeur'}
        value={r.value ?? ''}
        onChange={(e) => onChange({ value: e.target.value })}
      />
      {canMulti && (
        <button
          type="button"
          className="rhs-toggle"
          onClick={enterMulti}
          title="Tester contre une liste de valeurs (« commence par l'une de… »)"
        >
          <Icon name="list" size={12} /> liste
        </button>
      )}
    </>
  )
}

export function MaskBuilder({ segments, caseSensitive, onChange }) {
  const updSeg = (i, patch) => onChange(segments.map((s, j) => (j === i ? { ...s, ...patch } : s)))
  const moveSeg = (i, dir) => {
    const j = i + dir
    if (j < 0 || j >= segments.length) return
    const a = [...segments]
    ;[a[i], a[j]] = [a[j], a[i]]
    onChange(a)
  }
  const delSeg = (i) => onChange(segments.filter((_, j) => j !== i))
  const pattern = buildMaskPattern(segments, caseSensitive)
  return (
    <div className="mask-builder">
      <div className="qb-hint">
        Segment par segment, dans l'ordre. Ex. « AB1-2024 » : Texte « AB » · Chiffres ×1 · Texte « -
        » · Chiffres ×4.
      </div>
      <button
        className="ghost small"
        onClick={() => onChange([...segments, { type: 'letter', length: 1 }])}
      >
        + Segment
      </button>
      <div className="clean-ops">
        {segments.map((s, i) => (
          <div className="vrule" key={i}>
            <div className="qb-row">
              <span className="vrule-idx">{i + 1}</span>
              <select
                className="qb-select"
                value={s.type}
                onChange={(e) => updSeg(i, { type: e.target.value })}
              >
                {SEG_TYPES.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
              <button className="mini" onClick={() => moveSeg(i, -1)} disabled={i === 0}>
                <Icon name="up" />
              </button>
              <button
                className="mini"
                onClick={() => moveSeg(i, 1)}
                disabled={i === segments.length - 1}
              >
                <Icon name="down" />
              </button>
              <button className="ghost danger small" onClick={() => delSeg(i)}>
                <Icon name="x" />
              </button>
            </div>
            <div className="qb-row indent">
              {s.type === 'literal' || s.type === 'set' ? (
                <>
                  <span className="qb-lbl">{s.type === 'set' ? 'caractères' : 'texte'}</span>
                  <input
                    className="qb-input"
                    value={s.value || ''}
                    onChange={(e) => updSeg(i, { value: e.target.value })}
                  />
                </>
              ) : (
                <>
                  <span className="qb-lbl">longueur</span>
                  <input
                    className="qb-input narrow"
                    type="number"
                    min="1"
                    placeholder="exact"
                    value={s.length ?? ''}
                    onChange={(e) =>
                      updSeg(i, { length: e.target.value === '' ? '' : Number(e.target.value) })
                    }
                  />
                  <span className="qb-lbl">ou min</span>
                  <input
                    className="qb-input narrow"
                    type="number"
                    min="0"
                    value={s.min ?? ''}
                    onChange={(e) =>
                      updSeg(i, { min: e.target.value === '' ? '' : Number(e.target.value) })
                    }
                  />
                  <span className="qb-lbl">max</span>
                  <input
                    className="qb-input narrow"
                    type="number"
                    min="0"
                    value={s.max ?? ''}
                    onChange={(e) =>
                      updSeg(i, { max: e.target.value === '' ? '' : Number(e.target.value) })
                    }
                  />
                </>
              )}
            </div>
          </div>
        ))}
        {segments.length === 0 && (
          <div className="qb-hint">Aucun segment — cliquez « + Segment ».</div>
        )}
      </div>
      {pattern && (
        <div className="vtest-pattern">
          <span className="qb-lbl">motif généré</span> <code>{pattern}</code>
        </div>
      )}
    </div>
  )
}

// Live green/red tester for a single condition (debounced, uses the unsaved
// config). Hidden behind a checkbox so it stays out of the way unless wanted.
function ConditionTester({ cond, caseSensitive, onChange }) {
  const samplesText = cond.test_samples || ''
  const sampleLines = samplesText
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
  const [test, setTest] = useState({ results: [], error: null, loading: false })
  const cfgKey = JSON.stringify({
    k: cond.kind,
    g: cond.groups,
    s: cond.segments,
    cs: caseSensitive,
  })
  useEffect(() => {
    if (sampleLines.length === 0) {
      setTest({ results: [], error: null, loading: false })
      return
    }
    setTest((t) => ({ ...t, loading: true }))
    const cfg = {
      kind: cond.kind || 'rules',
      groups: cond.groups || [],
      segments: cond.segments || [],
      case_sensitive: caseSensitive,
    }
    const h = setTimeout(() => {
      api
        .validateTest(cfg, sampleLines)
        .then((r) =>
          setTest({
            results: r.ok ? r.results || [] : [],
            error: r.ok ? null : r.error,
            loading: false,
          }),
        )
        .catch((e) => setTest({ results: [], error: e.message, loading: false }))
    }, 300)
    return () => clearTimeout(h)
  }, [cfgKey, samplesText]) // eslint-disable-line react-hooks/exhaustive-deps
  const passCount = test.results.filter((r) => r.valid).length
  // (3) Testeur toujours visible : on essaie des valeurs sans avoir à déplier.
  return (
    <div className="vtest vtest-open">
      <div className="vtest-toggle">
        <span className="ports-title">Testeur</span>
        <span className="vtest-hint muted">— essayez des valeurs, une par ligne</span>
        {test.loading && <span className="vtest-spin">…</span>}
        {sampleLines.length > 0 && !test.error && (
          <span className={`vtest-score ${passCount === sampleLines.length ? 'all' : ''}`}>
            {passCount}/{sampleLines.length}
          </span>
        )}
      </div>
      <textarea
        className="vtest-input"
        rows={2}
        spellCheck={false}
        placeholder={'Exemples (un par ligne)… F0-01073.pdf'}
        value={samplesText}
        onChange={(e) => onChange({ test_samples: e.target.value })}
      />
      {test.error && <div className="qb-warn">{test.error}</div>}
      {sampleLines.length > 0 && !test.error && (
        <div className="vtest-results">
          {sampleLines.map((s, i) => {
            const r = test.results[i]
            const ok = r?.valid
            return (
              <div className="vtest-item" key={i}>
                <div className={`vtest-row ${ok ? 'ok' : 'ko'}`}>
                  <span className="vtest-mark">
                    <Icon name={ok ? 'check' : 'x'} size={11} />
                  </span>
                  <span className="vtest-val" title={s}>
                    {s}
                  </span>
                  {!ok && r?.motif && r.motif !== 'OK' && (
                    <span className="vtest-motif" title={r.motif}>
                      {r.motif}
                    </span>
                  )}
                </div>
                {r?.steps?.length > 0 && (
                  <div className="vtest-steps">
                    {r.steps.map((st, j) => (
                      <span key={j} className={`vstep ${st.status}`} title={st.label}>
                        {st.label}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/* ======================================================================== *
 *  RIGHT — flow map + outputs settings (the "where it goes") + preview
 * ======================================================================== */

export function OutputsPane({ pid, wid, node, status, onChange, onRun, running, onPreview }) {
  const dist = useRoutePreview(pid, wid, node, status)
  const d = node.data
  const conditions = d.conditions || []
  const outputs = d.outputs || []
  const routing = d.routing || 'first'
  const split = d.split || {}
  const isSplit = !!split.enabled

  const [zoom, setZoom] = useState(false) // enlarge the flow map (many outputs)
  const [topN, setTopN] = useState(10) // "keep the N principal outputs" — pruning

  // "Split by value": scan the input for distinct extracted values and turn each
  // into an output. Re-scanning reuses an existing output's id for a value already
  // present, so downstream wiring survives.
  const [scan, setScan] = useState({ loading: false, error: null, info: null })
  const scanSplit = () => {
    setScan({ loading: true, error: null, info: null })
    api
      .splitScan(pid, wid, node.id, d)
      .then((r) => {
        const byVal = new Map(outputs.filter((o) => 'value' in o).map((o) => [o.value, o]))
        const next = (r.values || []).map((v, i) => {
          const ex = byVal.get(v.value)
          return ex
            ? { ...ex, value: v.value }
            : {
                id: uid(),
                label: v.value || '(vide)',
                color: OUTPUT_COLORS[i % OUTPUT_COLORS.length],
                value: v.value,
              }
        })
        // sort outputs alphabetically (natural order: 01, 02, 10) by value
        next.sort((a, b) =>
          String(a.value || '').localeCompare(String(b.value || ''), 'fr', { numeric: true }),
        )
        onChange({ outputs: next })
        setScan({
          loading: false,
          error: null,
          info: {
            distinct: r.distinct,
            truncated: r.truncated,
            total: r.total,
            found: next.length,
            samples: r.samples || [],
          },
        })
      })
      .catch((e) => setScan({ loading: false, error: e.message, info: null }))
  }

  const items = [
    ...outputs.map((o) => ({
      id: o.id,
      label: o.label || o.id,
      color: o.color,
      count: dist.counts[o.id] ?? 0,
      // 'empty' marks the split bucket whose value is "" — rendered in italic muted
      // text everywhere so the (vide) row isn't mistaken for a literal label.
      empty: 'value' in o && o.value === '',
    })),
    ...(d.else_enabled !== false
      ? [
          {
            id: 'else',
            label: d.else_label || 'Non classé',
            color: d.else_color || '#9aa3b2',
            count: dist.counts.else ?? 0,
          },
        ]
      : []),
  ]

  // Physically reorder outputs by descending count (one-shot). The else bucket
  // is not in `outputs` and stays last by design. In 'first' (Partition) mode
  // this rewrites the routing, which is on purpose — the user asked for it.
  const sortOutputsByCount = () => {
    if (!outputs.length) return
    const sorted = [...outputs].sort((a, b) => {
      const ca = dist.counts[a.id] ?? 0
      const cb = dist.counts[b.id] ?? 0
      if (cb !== ca) return cb - ca
      return outputs.indexOf(a) - outputs.indexOf(b) // stable tiebreaker
    })
    if (sorted.every((o, i) => o.id === outputs[i].id)) return // already sorted
    onChange({ outputs: sorted })
  }

  // Keep only the top-N outputs by effective count; everything else falls through
  // to the "reste" bucket (which we enable, with a friendly default label if the
  // user never named it). Useful in split mode where a scan creates dozens of
  // outputs and only a handful are worth keeping as distinct sorties.
  const pruneToTopN = () => {
    const n = Math.max(1, parseInt(topN, 10) || 1)
    const elsePatch = {
      else_enabled: true,
      else_label: d.else_label && d.else_label.trim() ? d.else_label : 'Autres',
    }
    if (outputs.length <= n) {
      onChange(elsePatch)
      return
    }
    const ranked = outputs
      .map((o, i) => ({ o, c: dist.counts[o.id] ?? 0, i }))
      .sort((a, b) => b.c - a.c || a.i - b.i) // stable: equal counts keep prior order
    const keepIds = new Set(ranked.slice(0, n).map((x) => x.o.id))
    onChange({ outputs: outputs.filter((o) => keepIds.has(o.id)), ...elsePatch })
  }

  const setOutput = (i, patch) =>
    onChange({ outputs: outputs.map((o, j) => (j === i ? { ...o, ...patch } : o)) })
  const addOutput = () =>
    onChange({
      outputs: [
        ...outputs,
        {
          id: uid(),
          label: `Sortie ${outputs.length + 1}`,
          color: OUTPUT_COLORS[outputs.length % OUTPUT_COLORS.length],
          match: { conditionId: conditions[0]?.id || '', negate: false },
        },
      ],
    })
  const delOutput = (i) => onChange({ outputs: outputs.filter((_, j) => j !== i) })
  const moveOutput = (i, dir) => {
    const j = i + dir
    if (j < 0 || j >= outputs.length) return
    const a = [...outputs]
    ;[a[i], a[j]] = [a[j], a[i]]
    onChange({ outputs: a })
  }
  // Reshuffles the palette across outputs — a Fisher-Yates over OUTPUT_COLORS,
  // then assigned in order (cycles past the palette length, but never gives the
  // same colour to two adjacent outputs as long as N <= palette size).
  const shuffleColors = () => {
    const palette = [...OUTPUT_COLORS]
    for (let i = palette.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[palette[i], palette[j]] = [palette[j], palette[i]]
    }
    onChange({
      outputs: outputs.map((o, i) => ({ ...o, color: palette[i % palette.length] })),
    })
  }

  return (
    <div className="opane">
      <div className="opane-flow">
        <div className="route-flow-head">
          <span className="ports-title">Carte des flux</span>
          {dist.loading && <span className="vtest-spin">…</span>}
          {!isSplit && (
            <div className="route-mode">
              <div className="mode-toggle sm">
                <button
                  className={routing === 'first' ? 'on' : ''}
                  onClick={() => onChange({ routing: 'first' })}
                  title="Chaque ligne va dans la PREMIÈRE sortie dont la condition est vraie (ensembles disjoints)."
                >
                  Partition
                </button>
                <button
                  className={routing === 'all' ? 'on' : ''}
                  onClick={() => onChange({ routing: 'all' })}
                  title="Une ligne peut aller dans PLUSIEURS sorties."
                >
                  Chevauchement
                </button>
              </div>
            </div>
          )}
          <button
            className="flow-sort"
            onClick={sortOutputsByCount}
            disabled={!outputs.length || dist.loading}
            title={
              routing === 'first' && !isSplit
                ? "Réordonne les sorties par effectif décroissant. Attention : en mode Partition, l'ordre détermine le routage — le tri va modifier les ensembles."
                : 'Réordonne les sorties par effectif décroissant.'
            }
          >
            <Icon name="sort" size={13} /> Trier par effectif
          </button>
          <button
            className="flow-sort"
            onClick={() => setZoom(true)}
            disabled={!items.length}
            title="Agrandir la carte des flux (utile quand il y a beaucoup de sorties)"
          >
            <Icon name="maximize" size={13} /> Agrandir
          </button>
          {onRun && (
            <button
              className={`ghost small run-btn${running ? ' run-btn-busy' : ''}`}
              onClick={() => !running && onRun()}
              disabled={running}
              title={running ? 'Exécution en cours…' : 'Exécuter ce bloc'}
              aria-busy={running || undefined}
            >
              {running ? (
                <>
                  <span className="run-spin" aria-hidden="true">
                    <span /> <span /> <span />
                  </span>{' '}
                  Exécution…
                </>
              ) : (
                <>
                  <Icon name="play" size={13} /> Exécuter
                </>
              )}
            </button>
          )}
          <span className="route-total">Entrée : {dist.total.toLocaleString('fr-FR')}</span>
        </div>
        <div className="opane-flow-body">
          {dist.error && !dist.loading ? (
            <div className="qb-warn">{dist.error}</div>
          ) : (
            <FlowMap items={items} total={dist.total} height={230} />
          )}
          {dist.loading && (
            <div className="flow-loading">
              <span className="vtest-spin">…</span> Calcul de la répartition…
            </div>
          )}
        </div>
      </div>
      {zoom && <FlowMapModal items={items} total={dist.total} onClose={() => setZoom(false)} />}

      <div className="opane-outs">
        <div className="ports-head">
          <span className="ports-title">Sorties</span>
          {isSplit ? (
            <button
              className="ghost route-add"
              style={{ marginLeft: 'auto' }}
              disabled={scan.loading}
              onClick={scanSplit}
              title="Analyser la colonne et créer une sortie par valeur distincte"
            >
              <Icon name="refresh" size={13} /> {scan.loading ? 'Scan…' : 'Scanner les valeurs'}
            </button>
          ) : (
            <span className="qb-hint" style={{ marginLeft: 'auto' }}>
              chaque sortie reçoit une condition
            </span>
          )}
          {outputs.length > 0 && (
            <button
              className="ghost small"
              onClick={shuffleColors}
              title="Réattribuer une couleur aléatoire à chaque sortie"
            >
              <Icon name="shuffle" size={13} />
            </button>
          )}
        </div>
        {isSplit &&
          (scan.error || scan.info) &&
          (scan.error ? (
            <div className="qb-warn">{scan.error}</div>
          ) : (
            <>
              <div className="qb-hint">
                {scan.info.found} sortie(s) sur {scan.info.distinct} valeur(s) distincte(s).
                {scan.info.truncated && " Plus de 200 valeurs — affinez l'extraction."}
              </div>
              {scan.info.samples?.length > 0 && (
                <div className="split-preview">
                  <div className="split-prev-title">Aperçu de l'extraction</div>
                  {scan.info.samples.map((sp, i) => (
                    <div className="split-prev-row" key={i}>
                      <span className="split-prev-raw" title={sp.raw}>
                        {sp.raw}
                      </span>
                      <span className="split-prev-arrow">→</span>
                      <code className="split-val">{sp.key === '' ? '(vide)' : sp.key}</code>
                    </div>
                  ))}
                </div>
              )}
            </>
          ))}
        {isSplit && outputs.length === 0 && !scan.loading && (
          <div className="qb-hint">
            Définissez l'extraction à gauche, puis cliquez sur <b>Scanner les valeurs</b>.
          </div>
        )}
        {isSplit && outputs.length > 1 && (
          <div className="prune-row">
            <span className="qb-lbl">Garder les</span>
            <input
              className="qb-input"
              type="number"
              min="1"
              max={outputs.length}
              style={{ width: 60 }}
              value={topN}
              onChange={(e) => setTopN(e.target.value)}
            />
            <span className="qb-lbl">principales par effectif —</span>
            <button
              className="ghost small"
              onClick={pruneToTopN}
              title="Supprime toutes les autres sorties. Les lignes qu'elles recevaient retombent dans la sortie « reste » (activée et nommée « Autres » par défaut)."
            >
              <Icon name="filter" size={12} /> Élaguer le reste
            </button>
          </div>
        )}
        <div className="opane-outs-list">
          {outputs.map((o, i) => (
            <OutputRow
              key={o.id}
              o={o}
              index={i}
              last={i === outputs.length - 1}
              conditions={conditions}
              splitMode={isSplit}
              count={dist.counts[o.id]}
              onChange={(patch) => setOutput(i, patch)}
              onDelete={() => delOutput(i)}
              onMove={(dir) => moveOutput(i, dir)}
              onPreview={() => onPreview(o.id)}
            />
          ))}
          {!isSplit && (
            <button className="ghost route-add" onClick={addOutput}>
              <Icon name="plus" /> Ajouter une sortie
            </button>
          )}
          <div className="route-else">
            <label className="qb-check">
              <input
                type="checkbox"
                checked={d.else_enabled !== false}
                onChange={(e) => onChange({ else_enabled: e.target.checked })}
              />
              Sortie « reste » pour les lignes non classées
            </label>
            {d.else_enabled !== false && (
              <div className="route-else-cfg">
                <input
                  type="color"
                  value={d.else_color || '#9aa3b2'}
                  onChange={(e) => onChange({ else_color: e.target.value })}
                />
                <input
                  className="qb-input"
                  value={d.else_label || ''}
                  placeholder="Non classé"
                  onChange={(e) => onChange({ else_label: e.target.value })}
                />
                {dist.counts.else != null && (
                  <span className="route-count">{dist.counts.else.toLocaleString('fr-FR')}</span>
                )}
                <button
                  className="mini"
                  title="Aperçu de cette sortie"
                  onClick={() => onPreview('else')}
                >
                  <Icon name="eye" />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function OutputRow({
  o,
  index,
  last,
  conditions,
  count,
  splitMode,
  onChange,
  onDelete,
  onMove,
  onPreview,
}) {
  const match = o.match || { conditionId: '', negate: false }
  const setMatch = (patch) => onChange({ match: { ...match, ...patch } })
  return (
    <div className="ocard" style={{ borderLeftColor: o.color }}>
      <div className="ocard-head">
        <input
          type="color"
          value={o.color || '#4E79A7'}
          onChange={(e) => onChange({ color: e.target.value })}
          title="Couleur de la sortie"
        />
        <input
          className="ocard-name"
          value={o.label || ''}
          placeholder="Nom de la sortie"
          onChange={(e) => onChange({ label: e.target.value })}
        />
        {count != null && <span className="route-count">{count.toLocaleString('fr-FR')}</span>}
        <button className="mini" title="Aperçu des données de cette sortie" onClick={onPreview}>
          <Icon name="eye" />
        </button>
        <button className="mini" onClick={() => onMove(-1)} disabled={index === 0}>
          <Icon name="up" />
        </button>
        <button className="mini" onClick={() => onMove(1)} disabled={last}>
          <Icon name="down" />
        </button>
        <button className="ghost danger small" onClick={onDelete}>
          <Icon name="x" />
        </button>
      </div>
      {splitMode ? (
        <div className="ocard-attr">
          <span className="qb-lbl">valeur</span>
          <code className={`split-val ${o.value === '' ? 'split-val-empty' : ''}`}>
            {o.value === '' ? '(vide)' : o.value}
          </code>
        </div>
      ) : (
        <>
          <div className="ocard-attr">
            <span className="qb-lbl">reçoit</span>
            <button
              className={`neg ${match.negate ? 'on' : ''}`}
              onClick={() => setMatch({ negate: !match.negate })}
              title="Inverser : les lignes qui NE satisfont PAS la condition"
            >
              NON
            </button>
            <select
              className="qb-select"
              value={match.conditionId || ''}
              onChange={(e) => setMatch({ conditionId: e.target.value })}
            >
              <option value="">— choisir une condition —</option>
              {conditions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name || c.id}
                </option>
              ))}
            </select>
          </div>
          {!match.conditionId && (
            <div className="qb-hint">Sans condition attribuée, cette sortie reste vide.</div>
          )}
        </>
      )}
    </div>
  )
}

// One-stage Sankey: a single input bar on the left fans out into the outputs.
export function FlowMap({ items, total, height = 380 }) {
  const W = 760,
    barW = 15,
    gap = 10,
    padL = 96,
    padR = 198
  const n = items.length
  const S = Math.max(
    1,
    items.reduce((a, it) => a + (it.count || 0), 0),
  )
  // Right-side bands get a minimum height so a tiny category (and its two-line
  // label) stays fully readable instead of collapsing onto its neighbour. The SVG
  // grows taller if the floors no longer fit, so every output is always visible.
  const minSlot = 30
  const H = Math.max(height, n * minSlot + gap * Math.max(0, n - 1))
  const usableH = Math.max(20, H - gap * Math.max(0, n - 1))
  const floor = Math.min(minSlot, usableH / Math.max(1, n))
  const extra = Math.max(0, usableH - floor * n)
  const leftX = padL,
    rightX = W - padR
  // top/bottom padding so a band's three-line label (which extends below its
  // centre) is never clipped at the edges of the SVG.
  const padT = 6,
    padB = 22
  // share of the whole input, 2 decimals, French formatting (e.g. "75,55 %")
  const pct = (c) =>
    total > 0 ? `${(((c || 0) / total) * 100).toFixed(2).replace('.', ',')} %` : ''
  let ly = 0,
    ry = 0
  const ribbons = items.map((it) => {
    const c = it.count || 0
    const lh = (c / S) * H
    const rh = floor + (c / S) * extra
    const seg = { it, ly0: ly, ly1: ly + lh, ry0: ry, ry1: ry + rh }
    ly += lh
    ry += rh + gap
    return seg
  })
  const ribbon = (x0, a0, b0, x1, a1, b1) => {
    const mx = (x0 + x1) / 2
    return `M ${x0} ${a0} C ${mx} ${a0}, ${mx} ${a1}, ${x1} ${a1} L ${x1} ${b1} C ${mx} ${b1}, ${mx} ${b0}, ${x0} ${b0} Z`
  }
  return (
    <svg
      viewBox={`0 0 ${W} ${H + padT + padB}`}
      className="flow-svg"
      preserveAspectRatio="xMidYMid meet"
    >
      <g transform={`translate(0, ${padT})`}>
        <rect x={leftX - barW} y={0} width={barW} height={H} rx={2} fill="#9aa3b2" />
        <text x={leftX - barW - 6} y={14} textAnchor="end" className="flow-in">
          Entrée
        </text>
        <text x={leftX - barW - 6} y={28} textAnchor="end" className="flow-in-n">
          {total.toLocaleString('fr-FR')}
        </text>
        {ribbons.map(({ it, ly0, ly1, ry0, ry1 }) => (
          <g key={it.id}>
            <path d={ribbon(leftX, ly0, ly1, rightX, ry0, ry1)} fill={it.color} opacity="0.5" />
            <rect
              x={rightX}
              y={ry0}
              width={barW}
              height={Math.max(1, ry1 - ry0)}
              rx={2}
              fill={it.color}
            />
            <text
              x={rightX + barW + 7}
              y={(ry0 + ry1) / 2 - 1}
              className={`flow-lbl ${it.empty ? 'flow-lbl-empty' : ''}`}
            >
              {it.label}
              <tspan className="flow-pct"> · {pct(it.count)}</tspan>
            </text>
            <text x={rightX + barW + 7} y={(ry0 + ry1) / 2 + 12} className="flow-cnt">
              {(it.count || 0).toLocaleString('fr-FR')}
            </text>
          </g>
        ))}
        {S === 1 && items.every((it) => !it.count) && (
          <text x={W / 2} y={H / 2} textAnchor="middle" className="flow-empty">
            — exécute l'amont pour voir la répartition —
          </text>
        )}
      </g>
    </svg>
  )
}

// Fullscreen flow map — height scales with the number of outputs so every band
// stays readable even with dozens of outputs (e.g. after a "split by value").
function FlowMapModal({ items, total, onClose }) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  const height = Math.max(440, items.length * 46)
  return (
    <div className="modal-backdrop" style={{ zIndex: 70 }} onClick={onClose}>
      <div className="modal flowmap-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>Carte des flux</h3>
          <span className="route-total" style={{ marginLeft: 12 }}>
            Entrée : {total.toLocaleString('fr-FR')} · {items.length} sortie(s)
          </span>
          <button className="ghost small" style={{ marginLeft: 'auto' }} onClick={onClose}>
            <Icon name="x" />
          </button>
        </div>
        <div className="flowmap-modal-body">
          <FlowMap items={items} total={total} height={height} />
        </div>
      </div>
    </div>
  )
}
