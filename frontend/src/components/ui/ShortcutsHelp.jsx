// Aide « ? » — liste des raccourcis clavier (E.6).
//
// S'ouvre via `?` (sans modificateur) ou via la palette Ctrl+K.

import Modal from './Modal'

const ITEMS = [
  { keys: ['Ctrl', 'S'], desc: 'Sauvegarder maintenant (flush du debounce)' },
  { keys: ['Ctrl', 'K'], desc: 'Palette de commandes' },
  { keys: ['Ctrl', 'D'], desc: 'Dupliquer le bloc sélectionné' },
  { keys: ['Ctrl', 'Z'], desc: 'Annuler la dernière suppression (bloc ou lien)' },
  { keys: ['Suppr'], desc: 'Supprimer la sélection' },
  { keys: ['Échap'], desc: "Fermer l'aperçu ou un dialog" },
  { keys: ['?'], desc: 'Afficher cette aide' },
]

export default function ShortcutsHelp({ open, onClose }) {
  return (
    <Modal open={open} onClose={onClose} size="sm" title="Raccourcis clavier">
      <ul className="shortcuts-list">
        {ITEMS.map((it, i) => (
          <li key={i} className="shortcuts-row">
            <span className="shortcuts-keys">
              {it.keys.map((k, j) => (
                <span key={j}>
                  {j > 0 && <span className="shortcuts-plus">+</span>}
                  <kbd>{k}</kbd>
                </span>
              ))}
            </span>
            <span>{it.desc}</span>
          </li>
        ))}
      </ul>
    </Modal>
  )
}
