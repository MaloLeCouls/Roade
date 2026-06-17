// Tests de fumée sur le client HTTP (api.js). On vérifie deux choses : la
// construction d'URL pure (downloadUrl, encodage), et un appel via fetch mocké
// (createProject) — preuve que le pipeline req() est bon.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { api } from './api'

describe('api.downloadUrl', () => {
  it('encode pid + nom + subdir dans la query string', () => {
    expect(api.downloadUrl('p 1', 'rapport final.xlsx')).toBe(
      '/api/projects/p%201/files/rapport%20final.xlsx',
    )
    expect(api.downloadUrl('p1', 'a.xlsx', 'sortie/2024')).toBe(
      '/api/projects/p1/files/a.xlsx?subdir=sortie%2F2024',
    )
  })
})

describe('api.createProject', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn()
  })
  afterEach(() => {
    delete globalThis.fetch
  })

  it('POST /projects + body JSON et retourne le projet créé', async () => {
    globalThis.fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ id: 'abc', name: 'Foo' }),
    })

    const out = await api.createProject('Foo')
    expect(out).toEqual({ id: 'abc', name: 'Foo' })

    expect(globalThis.fetch).toHaveBeenCalledWith('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Foo' }),
    })
  })

  it('lève une erreur avec le `detail` du backend en cas de 4xx', async () => {
    globalThis.fetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ detail: 'Nom de projet requis' }),
    })

    await expect(api.createProject('')).rejects.toThrow('Nom de projet requis')
  })
})
