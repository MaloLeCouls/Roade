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

// E.8 — gestes avancés du canevas (pas de raccourci, juste à connaître).
const GESTURES = [
  {
    name: 'Drop sur une arête',
    desc: 'Faites glisser un bloc sur un lien existant : il est inséré au milieu.',
  },
  {
    name: 'Drill-down depuis le profil',
    desc: "Cliquez une valeur fréquente dans l'aperçu profil → filtre exact appliqué dans la table.",
  },
  {
    name: 'Bouchon collé',
    desc: 'Posez un Bouchon sur la sortie d\'un bloc : il marque cette sortie comme "fermée" sans la débrancher.',
  },
]

export default function ShortcutsHelp({ open, onClose }) {
  return (
    <Modal open={open} onClose={onClose} size="md" title="Raccourcis & gestes">
      <h3 className="shortcuts-section">Raccourcis clavier</h3>
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

      <h3 className="shortcuts-section">Gestes avancés du canevas</h3>
      <ul className="shortcuts-list">
        {GESTURES.map((g, i) => (
          <li key={i} className="shortcuts-row">
            <span className="shortcuts-keys">{g.name}</span>
            <span>{g.desc}</span>
          </li>
        ))}
      </ul>
    </Modal>
  )
}
