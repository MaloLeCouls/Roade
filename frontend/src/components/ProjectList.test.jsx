// G.3 — garantie clé : l'onboarding s'auto-affiche AU PLUS UNE FOIS. Une fois
// vu (flag posé), il ne réapparaît plus jamais tout seul, même au remontage
// (= relancer l'app). Ré-ouvrable seulement à la demande.

import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import ProjectList from './ProjectList'

function mockProjects(list) {
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => list,
  })
}

describe('<ProjectList> onboarding', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => {
    cleanup()
    delete globalThis.fetch
    localStorage.clear()
  })

  it("s'auto-affiche au premier lancement (accueil vide, jamais onboardé)", async () => {
    mockProjects([])
    render(<ProjectList onOpen={() => {}} onOpenWorkflow={() => {}} />)
    expect(await screen.findByText('Bienvenue dans Roade')).toBeInTheDocument()
    // le flag est posé immédiatement
    expect(localStorage.getItem('roade:onboarded:v1')).toBe('1')
  })

  it("ne réapparaît PAS au remontage suivant (relance de l'app)", async () => {
    // 1er montage : il s'affiche et pose le flag
    mockProjects([])
    const first = render(<ProjectList onOpen={() => {}} onOpenWorkflow={() => {}} />)
    await screen.findByText('Bienvenue dans Roade')
    first.unmount()

    // 2e montage (= relance) : accueil toujours vide, mais flag présent → rien
    mockProjects([])
    render(<ProjectList onOpen={() => {}} onOpenWorkflow={() => {}} />)
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled())
    expect(screen.queryByText('Bienvenue dans Roade')).not.toBeInTheDocument()
  })

  it("ne s'affiche pas si des projets existent déjà", async () => {
    mockProjects([{ id: 'p1', name: 'Déjà là' }])
    render(<ProjectList onOpen={() => {}} onOpenWorkflow={() => {}} />)
    await screen.findByText('Déjà là')
    expect(screen.queryByText('Bienvenue dans Roade')).not.toBeInTheDocument()
  })
})
