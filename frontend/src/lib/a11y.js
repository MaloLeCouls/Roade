// Helpers a11y partagés — E.7.
//
// Roade a beaucoup de `<div onClick>` (cartes projet, items de liste, brand,
// crumbs…). Un `<div>` n'est pas focusable au clavier ni annoncé comme
// cliquable par les lecteurs d'écran. La passe systématique D.8 les fera
// passer par `<Button>` / `<a>`, mais en attendant on a besoin d'un patch
// minimal qui rend ces zones utilisables au clavier — c'est `clickableProps`.

/**
 * Renvoie le set de props à étaler sur un élément non-interactif (`<div>`,
 * `<span>`…) qui se comporte comme un bouton : role + tabIndex + onClick +
 * onKeyDown (Espace / Entrée). Le caller garde la responsabilité de styliser
 * `cursor: pointer` et le focus visible (le CSS global :focus-visible y aide).
 *
 *   <div {...clickableProps(() => doX())} className="card">…</div>
 */
export function clickableProps(onClick, { label } = {}) {
  if (typeof onClick !== 'function') return {}
  return {
    role: 'button',
    tabIndex: 0,
    'aria-label': label,
    onClick,
    onKeyDown: (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        onClick(e)
      }
    },
  }
}
