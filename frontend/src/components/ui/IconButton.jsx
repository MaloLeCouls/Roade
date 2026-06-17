// IconButton — variante de Button pour les boutons icône-only.
// `aria-label` est *obligatoire* : sans texte visible, c'est la seule chose
// qu'un lecteur d'écran a pour comprendre l'action. L'audit 05 en a recensé
// dix-sept manquants côté Roade.

import Button from './Button'

export default function IconButton({ ariaLabel, icon, ...rest }) {
  if (!ariaLabel) {
    // Ne casse pas la prod, mais signale l'oubli en dev (anti-slop).
    // eslint-disable-next-line no-console
    console.warn("<IconButton> sans ariaLabel — invisible aux lecteurs d'écran")
  }
  return <Button {...rest} aria-label={ariaLabel} icon={icon} className="btn-iconly" />
}
