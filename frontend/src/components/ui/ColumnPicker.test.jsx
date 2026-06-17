import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import ColumnPicker from './ColumnPicker'

const COLS = [
  { name: 'Article', type: 'VARCHAR' },
  { name: 'Prix', type: 'DOUBLE' },
  { name: 'DateCreation', type: 'DATE' },
]

describe('<ColumnPicker> mono', () => {
  it('affiche le type à côté du nom (anti-slop : on ne cache jamais le type)', () => {
    render(<ColumnPicker columns={COLS} value="Prix" onChange={() => {}} />)
    const select = screen.getByRole('combobox')
    // Les libellés des options contiennent le type FR court
    expect(select.innerHTML).toMatch(/nombre/)
    expect(select.innerHTML).toMatch(/texte/)
    expect(select.innerHTML).toMatch(/date/)
  })

  it('propage la sélection via onChange', () => {
    const onChange = vi.fn()
    render(<ColumnPicker columns={COLS} value="" onChange={onChange} />)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Prix' } })
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
