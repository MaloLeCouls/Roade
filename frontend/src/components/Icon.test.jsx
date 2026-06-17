// Tests de fumée du composant Icon : noms connus -> SVG, nom inconnu -> rien.

import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import Icon from './Icon'

describe('<Icon>', () => {
  it('rend un SVG pour les icônes connues', () => {
    for (const name of ['play', 'eye', 'list']) {
      const { container, unmount } = render(<Icon name={name} />)
      const svg = container.querySelector('svg')
      expect(svg).not.toBeNull()
      unmount()
    }
  })

  it('respecte la prop `size` (défaut 14)', () => {
    const { container } = render(<Icon name="play" size={24} />)
    const svg = container.querySelector('svg')
    expect(svg).toHaveStyle({ width: '24px', height: '24px' })
  })

  it('ne rend rien pour un nom inconnu (anti-slop : pas de fallback générique)', () => {
    const { container } = render(<Icon name="this-icon-does-not-exist" />)
    expect(container.querySelector('svg')).toBeNull()
  })
})
