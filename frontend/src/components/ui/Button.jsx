// Primitive Button — D.4.
//
// Source unique pour tous les boutons de Roade. Avant : 25+ combinaisons de
// classes (`primary`, `ghost`, `ghost small`, `ghost danger small`, etc.)
// éparpillées dans 30 composants ; certains boutons « Exécuter » étaient
// réécrits à la main avec un `style={{ marginLeft: 'auto' }}` (cf. audit 06).
//
// Les call-sites existants seront migrés en D.8 (passe systématique). Tout
// *nouveau* bouton doit passer par cette primitive — pas de class `primary`
// posée à la main.

import { forwardRef } from 'react'

const VARIANTS = new Set(['primary', 'secondary', 'ghost', 'danger'])
const SIZES = new Set(['sm', 'md', 'lg'])

function classList(...parts) {
  return parts.filter(Boolean).join(' ')
}

const Button = forwardRef(function Button(
  {
    variant = 'secondary',
    size = 'md',
    icon = null,
    loading = false,
    disabled = false,
    type = 'button',
    className = '',
    children,
    ...rest
  },
  ref,
) {
  const v = VARIANTS.has(variant) ? variant : 'secondary'
  const s = SIZES.has(size) ? size : 'md'
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={classList('btn', `btn-${v}`, `btn-${s}`, loading && 'btn-loading', className)}
      {...rest}
    >
      {icon && <span className="btn-icon">{icon}</span>}
      {children && <span className="btn-label">{children}</span>}
    </button>
  )
})

export default Button
