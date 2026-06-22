// G.3 — onboarding léger : une orientation des 3 concepts (projet → blocs →
// exécuter), montrée UNE seule fois au premier lancement (cf. lib/onboarding).
// Non intrusif : sobre, sans flèches ni spotlight « product tour » génériques,
// et il funnel vers le projet d'exemple (G.2) pour apprendre en faisant.

import Icon from './Icon'
import Button from './ui/Button'
import Modal from './ui/Modal'

const STEPS = [
  [
    'folder',
    'Un projet',
    'Un dossier sur votre disque qui regroupe vos fichiers, vos workflows et leurs résultats.',
  ],
  [
    'flow',
    'Des blocs',
    'Importez un Excel/CSV, posez un bloc Source, puis enchaînez les blocs (nettoyer, calculer, contrôler…) en les reliant sur le canevas.',
  ],
  [
    'play',
    'Exécuter',
    'Un clic, et tout se recalcule en cascade — avec aperçu par bloc, contrôle de conformité, et export en .xlsx / .csv.',
  ],
]

export default function Onboarding({ open, onClose, onOpenExample }) {
  return (
    <Modal open={open} title="Bienvenue dans Roade" size="md" onClose={onClose}>
      <p className="onb-intro muted">
        Roade transforme vos fichiers Excel/CSV en assemblant des blocs — la logique d'un traitement
        SQL, sans écrire de SQL. Trois idées pour démarrer :
      </p>
      <ol className="onb-steps">
        {STEPS.map(([icon, title, desc]) => (
          <li className="onb-step" key={icon}>
            <span className="onb-step-ico" aria-hidden="true">
              <Icon name={icon} size={16} />
            </span>
            <span className="onb-step-txt">
              <b>{title}</b>
              <span className="muted">{desc}</span>
            </span>
          </li>
        ))}
      </ol>
      <div className="onb-actions">
        <Button variant="ghost" onClick={onClose}>
          Explorer par moi-même
        </Button>
        <Button variant="primary" icon={<Icon name="play" size={13} />} onClick={onOpenExample}>
          Ouvrir l'exemple
        </Button>
      </div>
    </Modal>
  )
}
