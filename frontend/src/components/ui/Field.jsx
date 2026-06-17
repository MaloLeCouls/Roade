// Primitives Input / Select / TextArea — D.6.
//
// Avant : 54 `<input>`, 21 `<select>`, 7 `<textarea>` bruts dans l'app, avec
// des largeurs `style={{ width: 80 }}` au cas par cas. Aucune validation
// visuelle (état `invalid`, message d'erreur sous le champ).
//
// Ces primitives proposent une API minimale + l'état `invalid` partagé. Les
// call-sites existants seront migrés en D.8.

import { useId } from 'react'

function classList(...parts) {
  return parts.filter(Boolean).join(' ')
}

function FieldWrap({ id, label, hint, error, invalid, children }) {
  // Important : on ne wrap PAS dans un `<label>` parent — sinon le contenu
  // entier (label + hint + error) entrerait dans l'accessible name de l'input.
  // Au lieu de ça, le `<label htmlFor>` cible explicitement l'input par id.
  return (
    <div className={classList('fld', invalid && 'fld-invalid')}>
      {label && (
        <label className="fld-label" htmlFor={id}>
          {label}
        </label>
      )}
      {children}
      {error ? (
        <span className="fld-error" role="alert">
          {error}
        </span>
      ) : (
        hint && <span className="fld-hint">{hint}</span>
      )}
    </div>
  )
}

export function Input({ label, hint, error, invalid, className = '', width, style, ...rest }) {
  const id = useId()
  const isInvalid = invalid || !!error
  return (
    <FieldWrap id={id} label={label} hint={hint} error={error} invalid={isInvalid}>
      <input
        id={id}
        aria-invalid={isInvalid || undefined}
        className={classList('fld-input', className)}
        style={{ ...(width ? { width } : null), ...style }}
        {...rest}
      />
    </FieldWrap>
  )
}

export function Select({
  label,
  hint,
  error,
  invalid,
  options = [],
  placeholder,
  className = '',
  width,
  style,
  children,
  ...rest
}) {
  const id = useId()
  const isInvalid = invalid || !!error
  return (
    <FieldWrap id={id} label={label} hint={hint} error={error} invalid={isInvalid}>
      <select
        id={id}
        aria-invalid={isInvalid || undefined}
        className={classList('fld-select', className)}
        style={{ ...(width ? { width } : null), ...style }}
        {...rest}
      >
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {children}
        {options.map((o) => {
          const value = typeof o === 'object' ? o.value : o
          const text = typeof o === 'object' ? (o.label ?? o.value) : o
          return (
            <option key={value} value={value}>
              {text}
            </option>
          )
        })}
      </select>
    </FieldWrap>
  )
}

export function TextArea({ label, hint, error, invalid, className = '', rows = 4, ...rest }) {
  const id = useId()
  const isInvalid = invalid || !!error
  return (
    <FieldWrap id={id} label={label} hint={hint} error={error} invalid={isInvalid}>
      <textarea
        id={id}
        rows={rows}
        aria-invalid={isInvalid || undefined}
        className={classList('fld-textarea', className)}
        {...rest}
      />
    </FieldWrap>
  )
}
