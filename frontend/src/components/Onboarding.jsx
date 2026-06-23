// G.3 — onboarding : une orientation des 3 concepts (projet → blocs → exécuter)
// + un encart « à savoir » (où sont les fichiers, la fenêtre noire, les tutos).
// Montré UNE fois au premier lancement (cf. lib/onboarding), ré-ouvrable via
// « Découvrir Roade ». Sobre, et il funnel vers le projet d'exemple (G.2).

import Icon from './Icon'
import Button from './ui/Button'
import Modal from './ui/Modal'

const STEPS = [
  [
    'folder',
    'Un projet',
    'Un dossier sur votre PC qui regroupe vos fichiers importés, vos workflows et leurs résultats. Vous en créez un par sujet (ex. « Codif Sermatec »).',
  ],
  [
    'flow',
    'Des blocs',
    'Importez un Excel/CSV, posez un bloc Source, puis enchaînez les blocs (nettoyer, calculer une colonne, contrôler une codification, exporter…) en les reliant d’un trait sur le canevas.',
  ],
  [
    'play',
    'Exécuter',
    'Un clic sur « Exécuter le workflow » et tout se recalcule en cascade — avec un aperçu par bloc, un temps restant, et l’export en .xlsx / .csv.',
  ],
]

const NOTES = [
  [
    'import',
    'Vos fichiers sont rangés dans ',
    'Documents\\Roade-projets',
    '. Les exports y sont classés par workflow (dossier exports\\…). Pour sauvegarder : copiez ce dossier.',
  ],
  [
    'stop',
    'Une petite ',
    'fenêtre noire',
    ' reste ouverte pendant l’utilisation : c’est le moteur. Ne la fermez pas (la fermer = quitter Roade).',
  ],
  [
    'file',
    'Des ',
    'tutoriels PDF',
    ' (Guide général, bloc Validation, bloc Calcul) accompagnent l’outil — gardez-les sous la main.',
  ],
]

export default function Onboarding({ open, onClose, onOpenExample }) {
  return (
    <Modal open={open} title="Bienvenue dans Roade" size="md" onClose={onClose}>
      <p className="onb-intro muted">
        Roade transforme vos fichiers Excel/CSV en assemblant des blocs — la logique d’un traitement
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

      <div className="onb-note">
        <div className="onb-note-title">Bon à savoir</div>
        {NOTES.map(([icon, before, strong, after]) => (
          <div className="onb-note-row" key={icon}>
            <Icon name={icon} size={13} />
            <span className="muted">
              {before}
              <b>{strong}</b>
              {after}
            </span>
          </div>
        ))}
      </div>

      <p className="onb-intro muted" style={{ marginTop: 10 }}>
        La meilleure façon d’apprendre : ouvrez l’exemple ci-dessous et suivez les tutoriels.
      </p>
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
