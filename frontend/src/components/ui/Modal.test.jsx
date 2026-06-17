import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import Modal from './Modal'

describe('<Modal>', () => {
  it("ne rend rien quand open=false (pas de div fantôme dans l'arbre)", () => {
    const { container } = render(<Modal open={false}>contenu</Modal>)
    expect(container.firstChild).toBeNull()
  })

  it('rend un dialog avec role + aria-modal quand open', () => {
    render(
      <Modal open title="Mon titre" onClose={() => {}}>
        contenu
      </Modal>,
    )
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveAttribute('aria-label', 'Mon titre')
    expect(screen.getByText('Mon titre')).toBeInTheDocument()
  })

  it('Escape ferme la modale', () => {
    const onClose = vi.fn()
    render(
      <Modal open title="t" onClose={onClose}>
        x
      </Modal>,
    )
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('clic sur le bouton de fermeture ferme la modale', () => {
    const onClose = vi.fn()
    render(
      <Modal open title="t" onClose={onClose}>
        x
      </Modal>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Fermer' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
