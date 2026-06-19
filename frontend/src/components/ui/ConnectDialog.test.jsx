import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import ConnectDialog from './ConnectDialog'

const SAMPLE_NODES = [
  { id: 'src', type: 'source', data: { label: 'Ma Source' } },
  { id: 'sql1', type: 'sql', data: { label: 'Jointure' } },
  { id: 'exp', type: 'export', data: { label: 'Export' } },
  { id: 'frame', type: 'frame', data: {} },
]

// Définitions minimales miroir de NODE_INPUTS / NODE_OUTPUTS du WorkflowEditor :
// le dialog ne connaît pas le détail des blocs, il consomme deux callbacks.
const outputsFor = (n) => {
  if (!n || n.type === 'frame' || n.type === 'export') return []
  return [{ handle: 'out', label: '' }]
}
const inputsFor = (n) => {
  if (!n || n.type === 'source' || n.type === 'frame') return []
  if (n.type === 'sql') {
    return [
      { handle: 'in1', label: 'Entrée principale (FROM)' },
      { handle: 'in2', label: 'Entrée à joindre (optionnelle)' },
    ]
  }
  return [{ handle: 'in', label: '' }]
}

describe('<ConnectDialog>', () => {
  it('propose les blocs cibles, exclut la source elle-même et ceux sans entrée', () => {
    render(
      <ConnectDialog
        open
        sourceId="src"
        nodes={SAMPLE_NODES}
        edges={[]}
        outputsFor={outputsFor}
        inputsFor={inputsFor}
        onConfirm={() => {}}
        onClose={() => {}}
      />,
    )
    const options = screen.getAllByRole('option').map((o) => o.textContent)
    // 'src' (elle-même) et 'frame' (sans entrée) ne doivent pas apparaître.
    expect(options.some((o) => o.includes('Jointure'))).toBe(true)
    expect(options.some((o) => o.includes('Export'))).toBe(true)
    expect(options.some((o) => o.includes('Ma Source'))).toBe(false)
  })

  it("affiche un select 'Port d'entrée' quand la cible a plusieurs entrées (SQL)", () => {
    render(
      <ConnectDialog
        open
        sourceId="src"
        nodes={SAMPLE_NODES}
        edges={[]}
        outputsFor={outputsFor}
        inputsFor={inputsFor}
        onConfirm={() => {}}
        onClose={() => {}}
      />,
    )
    // sql est le premier candidat dans la liste → ses deux ports d'entrée
    // doivent apparaître dans un second select.
    expect(screen.getByText("Port d'entrée")).toBeInTheDocument()
    expect(screen.getByText('Entrée principale (FROM)')).toBeInTheDocument()
  })

  it('confirme avec les valeurs sélectionnées', () => {
    const onConfirm = vi.fn()
    render(
      <ConnectDialog
        open
        sourceId="src"
        nodes={SAMPLE_NODES}
        edges={[]}
        outputsFor={outputsFor}
        inputsFor={inputsFor}
        onConfirm={onConfirm}
        onClose={() => {}}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Connecter' }))
    expect(onConfirm).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'src',
        sourceHandle: 'out',
        target: 'sql1',
        targetHandle: 'in1',
      }),
    )
  })

  it('avertit quand le port cible est déjà connecté (sauf union)', () => {
    render(
      <ConnectDialog
        open
        sourceId="src"
        nodes={SAMPLE_NODES}
        edges={[{ id: 'e1', source: 'other', target: 'sql1', targetHandle: 'in1' }]}
        outputsFor={outputsFor}
        inputsFor={inputsFor}
        onConfirm={() => {}}
        onClose={() => {}}
      />,
    )
    expect(screen.getByText(/sera remplacé/)).toBeInTheDocument()
  })
})
