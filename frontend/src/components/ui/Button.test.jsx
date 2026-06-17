import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import Button from './Button'
import IconButton from './IconButton'

describe('<Button>', () => {
  it('rend un label visible avec le variant et la taille demandés', () => {
    render(
      <Button variant="primary" size="sm">
        Exécuter
      </Button>,
    )
    const btn = screen.getByRole('button', { name: 'Exécuter' })
    expect(btn).toHaveClass('btn', 'btn-primary', 'btn-sm')
  })

  it('clic déclenche onClick', () => {
    const onClick = vi.fn()
    render(<Button onClick={onClick}>OK</Button>)
    fireEvent.click(screen.getByRole('button', { name: 'OK' }))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('loading désactive et expose aria-busy', () => {
    const onClick = vi.fn()
    render(
      <Button loading onClick={onClick}>
        Sauver
      </Button>,
    )
    const btn = screen.getByRole('button')
    expect(btn).toBeDisabled()
    expect(btn).toHaveAttribute('aria-busy', 'true')
    fireEvent.click(btn)
    expect(onClick).not.toHaveBeenCalled()
  })

  it('variant inconnu retombe sur "secondary" (anti-slop : pas de classe invalide)', () => {
    render(<Button variant="cosmique">x</Button>)
    expect(screen.getByRole('button')).toHaveClass('btn-secondary')
  })
})

describe('<IconButton>', () => {
  it('expose ariaLabel sur le bouton', () => {
    render(<IconButton ariaLabel="Supprimer" icon={<svg />} />)
    expect(screen.getByRole('button', { name: 'Supprimer' })).toBeInTheDocument()
  })

  it('avertit en console si ariaLabel est absent', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    render(<IconButton icon={<svg />} />)
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })
})
