// Test de fumée du composant racine : on monte App, on vérifie qu'il affiche
// au moins son identité (le brand "Roade") et qu'il charge la liste de projets
// par défaut (mockée via fetch).

import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import App from './App'

describe('<App>', () => {
  beforeEach(() => {
    // ProjectList monte au démarrage et fait `fetch('/api/projects')`.
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => [],
    })
  })
  afterEach(() => {
    delete globalThis.fetch
  })

  it('affiche le brand "Roade" dès le rendu', async () => {
    render(<App />)
    expect(screen.getByText('Roade')).toBeInTheDocument()
    // ProjectList se monte et fait fetch en async — on attend le flush pour
    // éviter le warning React `not wrapped in act(...)`.
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled())
  })

  it('demande la liste des projets au backend', async () => {
    render(<App />)
    await waitFor(() =>
      expect(globalThis.fetch).toHaveBeenCalledWith('/api/projects', expect.anything()),
    )
  })
})
