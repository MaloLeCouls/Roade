import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import ColumnPicker from './ColumnPicker'

const COLS = [
  { name: 'Article', type: 'VARCHAR' },
  { name: 'Prix', type: 'DOUBLE' },
  { name: 'DateCreation', type: 'DATE' },
]

describe('<ColumnPicker> mono', () => {
  it('affiche le type en badge distinct (sélection + liste)', () => {
    render(<ColumnPicker columns={COLS} value="Prix" onChange={() => {}} />)
    // le bouton montre la colonne choisie + son badge de type
    expect(screen.getByText('Prix')).toBeInTheDocument()
    expect(screen.getByText('nombre')).toBeInTheDocument()
    // ouvrir la liste révèle les autres types
    fireEvent.click(screen.getByRole('button'))
    expect(screen.getByText('texte')).toBeInTheDocument()
    expect(screen.getByText('date')).toBeInTheDocument()
  })

  it('propage la sélection via onChange (clic dans le menu)', () => {
    const onChange = vi.fn()
    render(<ColumnPicker columns={COLS} value="" onChange={onChange} />)
    fireEvent.click(screen.getByRole('button')) // ouvre le menu
    fireEvent.click(screen.getByRole('option', { name: /Prix/ }))
    expect(onChange).toHaveBeenCalledWith('Prix')
  })
})

describe('<ColumnPicker> multi', () => {
  it('coche/décoche cumule les sélections', () => {
    const onChange = vi.fn()
    render(<ColumnPicker columns={COLS} value={['Prix']} onChange={onChange} multi />)
    // 3 cases à cocher dont 1 cochée
    const boxes = screen.getAllByRole('checkbox')
    expect(boxes).toHaveLength(3)
    expect(boxes[1]).toBeChecked() // Prix
    fireEvent.click(boxes[0]) // Article
    expect(onChange).toHaveBeenCalledWith(['Prix', 'Article'])
  })
})

describe('<ColumnPicker> vide', () => {
  it('affiche un message clair plutôt qu un select vide', () => {
    render(<ColumnPicker columns={[]} value="" onChange={() => {}} />)
    expect(screen.getByText(/aucune colonne/i)).toBeInTheDocument()
  })
})
