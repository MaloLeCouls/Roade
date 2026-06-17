import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Input, Select, TextArea } from './Field'

describe('<Input>', () => {
  it('rend label + input liés par htmlFor (a11y)', () => {
    render(<Input label="Nom" defaultValue="Roade" />)
    const input = screen.getByLabelText('Nom')
    expect(input).toHaveValue('Roade')
  })

  it("marque aria-invalid + affiche l'erreur quand error est fourni", () => {
    render(<Input label="Email" error="Format invalide" />)
    const input = screen.getByLabelText('Email')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByRole('alert')).toHaveTextContent('Format invalide')
  })
})

describe('<Select>', () => {
  it('rend les options depuis le tableau et expose la valeur', () => {
    render(
      <Select
        label="Format"
        defaultValue="csv"
        options={[
          { value: 'xlsx', label: 'Excel' },
          { value: 'csv', label: 'CSV' },
        ]}
      />,
    )
    expect(screen.getByLabelText('Format')).toHaveValue('csv')
  })
})

describe('<TextArea>', () => {
  it('rend une zone de texte avec le nombre de lignes demandé', () => {
    render(<TextArea label="Note" rows={6} />)
    expect(screen.getByLabelText('Note')).toHaveAttribute('rows', '6')
  })
})
