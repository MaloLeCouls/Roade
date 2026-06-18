// Backpack — inventaire de groupes de blocs réutilisables (échelle projet).
//
// Inspiration : la fonctionnalité "Backpack" de MIT App Inventor. L'utilisateur
// sélectionne plusieurs blocs sur le canevas, les glisse sur ce panneau →
// enregistrement. Plus tard (même workflow ou autre du même projet) il glisse
// l'item vers le canevas → instanciation avec de nouveaux IDs.
//
// Le composant est purement présentationnel : il ne sait rien du canevas ni
// des IDs renouvelés. Le câblage drag-in/drag-out vit dans WorkflowEditor.

import { useState } from 'react'
import Icon from './Icon'
import { notify } from '../toast'

/**
 * @param {object} props
 * @param {boolean} props.open
 * @param {() => void} props.onToggle
 * @param {Array<{id:string, name:string, nodes:any[], edges:any[], created_at:number}>} props.items
 * @param {boolean} props.dropTargetActive  - true pendant qu'une sélection est draguée
 *   sur le canevas : le panneau s'illumine pour signaler qu'il accepte le drop.
 * @param {() => void} props.onAddSelection  - bouton « + Ajouter la sélection »
 * @param {(iid: string) => void} props.onDelete
 * @param {(iid: string, name: string) => void} props.onRename
 * @param {(iid: string) => void} props.onInsert            - clic = insère au centre du viewport
 * @param {(iid: string, ev: DragEvent) => void} props.onItemDragStart  - drag d'un item vers le canevas
 */
export default function Backpack({
  open,
  onToggle,
  items = [],
  dropTargetActive = false,
  onAddSelection,
  onDelete,
  onRename,
  onInsert,
  onItemDragStart,
}) {
  return (
    <aside
      className={`backpack ${open ? 'open' : 'closed'} ${dropTargetActive ? 'drop-active' : ''}`}
      data-backpack-panel
      aria-label="Inventaire de groupes de blocs"
    >
      <button
        type="button"
        className="backpack-toggle"
        onClick={onToggle}
        title={open ? "Replier l'inventaire" : `Ouvrir l'inventaire (${items.length})`}
        aria-expanded={open}
      >
        <Icon name={open ? 'chev-right' : 'select'} size={14} />
        <span className="backpack-count" aria-label={`${items.length} item(s)`}>
          {items.length}
        </span>
      </button>
      {open && (
        <div className="backpack-body">
          <div className="backpack-head">
            <h3 className="backpack-title">Inventaire</h3>
            <button
              type="button"
              className="ghost small"
              onClick={onAddSelection}
              title="Ajouter la sélection courante à l'inventaire"
            >
              <Icon name="plus" size={12} /> Sélection
            </button>
          </div>
          {items.length === 0 ? (
            <p className="backpack-empty">
              Sélectionnez des blocs sur le canevas puis glissez-les ici (ou utilisez le bouton
              ci-dessus). Vous pourrez les ressortir dans n'importe quel workflow du projet.
            </p>
          ) : (
            <ul className="backpack-list">
              {items.map((it) => (
                <BackpackItem
                  key={it.id}
                  item={it}
                  onDelete={() => onDelete(it.id)}
                  onRename={(n) => onRename(it.id, n)}
                  onInsert={() => onInsert(it.id)}
                  onDragStart={(ev) => onItemDragStart(it.id, ev)}
                />
              ))}
            </ul>
          )}
        </div>
      )}
    </aside>
  )
}

function BackpackItem({ item, onDelete, onRename, onInsert, onDragStart }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(item.name)
  const blockCount = item.nodes?.length || 0

  const commitRename = () => {
    const next = draft.trim()
    setEditing(false)
    if (next && next !== item.name) onRename(next)
    else setDraft(item.name)
  }

  return (
    <li
      className="backpack-item"
      draggable
      onDragStart={onDragStart}
      onDragEnd={() => {
        // Indication visuelle pour l'utilisateur : le drag s'est terminé hors
        // d'une cible valide ? Le composant parent n'a rien à faire ici, c'est
        // le drop handler du canevas qui appelle l'insertion.
      }}
      title="Glissez sur le canevas pour insérer, ou cliquez pour poser au centre"
    >
      {editing ? (
        <input
          className="backpack-name-input"
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitRename}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitRename()
            if (e.key === 'Escape') {
              setDraft(item.name)
              setEditing(false)
            }
          }}
        />
      ) : (
        <button
          type="button"
          className="backpack-name"
          onClick={() => onInsert()}
          onDoubleClick={() => {
            setDraft(item.name)
            setEditing(true)
          }}
          title="Cliquer : insérer · Double-clic : renommer · Glisser : placer au curseur"
        >
          <span className="backpack-name-text">{item.name}</span>
          <span className="backpack-meta">
            {blockCount} bloc{blockCount > 1 ? 's' : ''}
          </span>
        </button>
      )}
      <button
        type="button"
        className="mini danger backpack-del"
        onClick={() => {
          if (window.confirm(`Supprimer « ${item.name} » de l'inventaire ?`)) onDelete()
        }}
        title="Supprimer de l'inventaire"
        aria-label="Supprimer de l'inventaire"
      >
        <Icon name="trash" size={11} />
      </button>
    </li>
  )
}

// Helper réutilisable côté éditeur : teste si la position screen donnée tombe
// sur le panneau (utilisé pour décider, à la fin d'un drag de sélection, si la
// sélection doit être enregistrée dans le backpack).
export function isOverBackpack(clientX, clientY) {
  const el = document.querySelector('[data-backpack-panel]')
  if (!el) return false
  const r = el.getBoundingClientRect()
  return clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom
}

// Helper utilisé par le drop handler : reconnaît qu'un dragover/drop provient
// d'un item de l'inventaire (vs un fichier OS). Le payload est sérialisé dans
// dataTransfer (voir onItemDragStart côté éditeur).
export const BACKPACK_MIME = 'application/x-roade-backpack-item'

// Notification de l'action — exposée ici pour que l'éditeur puisse appeler le
// même message qu'il fasse l'ajout via le bouton ou via le drop.
export function notifyStored(name) {
  notify(`Ajouté à l'inventaire : « ${name} »`, 'ok')
}
