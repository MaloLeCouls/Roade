// HTTP client for the Roade backend. The Vite dev server proxies /api to the
// FastAPI server (see vite.config.js). All methods return parsed JSON, except
// downloadUrl (a string) and runStream (an EventSource).
//
// API versionnée (B.6 / graine cloud 1) : on parle à `/api/v1`. Le backend
// accepte aussi `/api` (rétro-compat), mais le front s'en tient à la version
// courante pour qu'un futur `/api/v2` puisse cohabiter sans casser.
const BASE = '/api/v1'

// Toute erreur de l'API arrive sous l'enveloppe `{code, message}` (B.6). On en
// fait une `Error` dont le `.code` est exploitable par l'appelant (réagir au
// type d'erreur sans parser le message FR), tout en gardant `.message` lisible.
function errorFromBody(body, fallback) {
  const msg = (body && (body.message || body.detail || body.error)) || fallback
  const err = new Error(msg || 'Erreur inconnue')
  if (body && body.code) err.code = body.code
  return err
}

async function req(path, options = {}) {
  const res = await fetch(BASE + path, options)
  if (!res.ok) {
    let body = null
    try {
      body = await res.json()
    } catch {
      /* non-JSON error body */
    }
    throw errorFromBody(body, res.statusText || `Erreur ${res.status}`)
  }
  if (res.status === 204) return null
  const ct = res.headers.get('content-type') || ''
  return ct.includes('application/json') ? res.json() : res.text()
}

const getJSON = (path) => req(path)
const sendJSON = (path, method, body) =>
  req(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  })

const enc = encodeURIComponent
const qs = (obj) => {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined && v !== null && v !== '') p.set(k, v)
  }
  const s = p.toString()
  return s ? `?${s}` : ''
}

export const api = {
  // ---- projects ----
  listProjects: () => getJSON('/projects'),
  createProject: (name) => sendJSON('/projects', 'POST', { name }),
  getProject: (pid) => getJSON(`/projects/${enc(pid)}`),
  deleteProject: (pid) => req(`/projects/${enc(pid)}`, { method: 'DELETE' }),
  // G.2 — crée le projet de démonstration embarqué (renvoie {project_id, workflow_id, name}).
  openDemo: () => sendJSON('/demo', 'POST'),

  // ---- files ----
  listFiles: (pid) => getJSON(`/projects/${enc(pid)}/files`),
  // Upload via XHR plutôt que fetch : on a besoin de `xhr.upload.onprogress`
  // pour afficher une barre côté UI (un Excel de 80 Mo figeait l'app sans
  // aucun signal — cf. todo C.5). Le contrat reste une Promise.
  uploadFile: (pid, file, onProgress) =>
    new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      xhr.open('POST', `${BASE}/projects/${enc(pid)}/files`)
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total)
      }
      xhr.onload = () => {
        if (xhr.status < 200 || xhr.status >= 300) {
          let body = null
          try {
            body = JSON.parse(xhr.responseText)
          } catch {
            /* non-JSON error body */
          }
          reject(errorFromBody(body, xhr.statusText || `Erreur ${xhr.status}`))
          return
        }
        try {
          resolve(JSON.parse(xhr.responseText))
        } catch {
          resolve(null)
        }
      }
      xhr.onerror = () => reject(new Error('Erreur réseau'))
      xhr.onabort = () => reject(new Error('Upload annulé'))
      const fd = new FormData()
      fd.append('file', file)
      xhr.send(fd)
    }),
  deleteFile: (pid, name, subdir) =>
    req(`/projects/${enc(pid)}/files/${enc(name)}${qs({ subdir })}`, { method: 'DELETE' }),
  openFile: (pid, name, subdir) =>
    sendJSON(`/projects/${enc(pid)}/files/${enc(name)}/open${qs({ subdir })}`, 'POST'),
  openFilesFolder: (pid, subdir, file) =>
    sendJSON(`/projects/${enc(pid)}/files/open-folder${qs({ subdir, file })}`, 'POST'),
  downloadUrl: (pid, name, subdir) =>
    `${BASE}/projects/${enc(pid)}/files/${enc(name)}${qs({ subdir })}`,
  peek: (pid, file, sheet, headerRow, opts = {}) =>
    getJSON(
      `/projects/${enc(pid)}/peek${qs({
        file,
        sheet,
        header_row: headerRow,
        encoding: opts.encoding,
        decimal: opts.decimal,
        thousands: opts.thousands,
      })}`,
    ),

  // ---- workflows ----
  listWorkflows: (pid) => getJSON(`/projects/${enc(pid)}/workflows`),
  createWorkflow: (pid, name) => sendJSON(`/projects/${enc(pid)}/workflows`, 'POST', { name }),
  getWorkflow: (pid, wid) => getJSON(`/projects/${enc(pid)}/workflows/${enc(wid)}`),
  documentUrl: (pid, wid) => `${BASE}/projects/${enc(pid)}/workflows/${enc(wid)}/document`,
  saveWorkflow: (pid, wf) => sendJSON(`/projects/${enc(pid)}/workflows/${enc(wf.id)}`, 'PUT', wf),
  deleteWorkflow: (pid, wid) =>
    req(`/projects/${enc(pid)}/workflows/${enc(wid)}`, { method: 'DELETE' }),

  // ---- preview / profile ----
  preview: (pid, wid, nodeId, opts = {}) => {
    const { limit, offset, handle, sort, dir, q, filters } = opts
    const params = {
      limit,
      offset,
      handle,
      sort,
      dir,
      q,
      filters: filters && filters.length ? JSON.stringify(filters) : undefined,
    }
    return getJSON(
      `/projects/${enc(pid)}/workflows/${enc(wid)}/nodes/${enc(nodeId)}/preview${qs(params)}`,
    )
  },
  profile: (pid, wid, nodeId, column, handle = 'out') =>
    getJSON(
      `/projects/${enc(pid)}/workflows/${enc(wid)}/nodes/${enc(nodeId)}/profile${qs({ column, handle })}`,
    ),
  // ---- « Clés multiples » group drill-down ----
  keysGroup: (pid, wid, nodeId, key, q, handle = 'out') =>
    getJSON(
      `/projects/${enc(pid)}/workflows/${enc(wid)}/nodes/${enc(nodeId)}/group${qs({ key: (key || []).join(','), q, handle })}`,
    ),

  // ---- validation tester ----
  validateTest: (config, samples) => sendJSON('/validate/test', 'POST', { config, samples }),

  // ---- routing: live distribution preview (no materialization) ----
  routePreview: (pid, wid, nodeId, config) =>
    sendJSON(
      `/projects/${enc(pid)}/workflows/${enc(wid)}/nodes/${enc(nodeId)}/route-preview`,
      'POST',
      config,
    ),
  // ---- split by value: discover distinct extracted values ----
  splitScan: (pid, wid, nodeId, config) =>
    sendJSON(
      `/projects/${enc(pid)}/workflows/${enc(wid)}/nodes/${enc(nodeId)}/split-scan`,
      'POST',
      config,
    ),
  // ---- filter: live dry-run (kept / excluded counts, no materialization) ----
  filterPreview: (pid, wid, nodeId, config) =>
    sendJSON(
      `/projects/${enc(pid)}/workflows/${enc(wid)}/nodes/${enc(nodeId)}/filter-preview`,
      'POST',
      config,
    ),
  // ---- dedup: live dry-run (duplicate counts + output sizes, no materialization) ----
  dedupPreview: (pid, wid, nodeId, config) =>
    sendJSON(
      `/projects/${enc(pid)}/workflows/${enc(wid)}/nodes/${enc(nodeId)}/dedup-preview`,
      'POST',
      config,
    ),

  // ---- streaming run (Server-Sent Events) ----
  runStream: (
    pid,
    wid,
    onlyNode,
    onEvent,
    force = false,
    allExports = false,
    forceNodes = null,
  ) => {
    const url = `${BASE}/projects/${enc(pid)}/workflows/${enc(wid)}/run-stream${qs({
      only_node: onlyNode,
      force: force ? 1 : undefined,
      all_exports: allExports ? 1 : undefined,
      // Recalcul forcé ciblé (sélection) : ids séparés par des virgules.
      force_nodes: forceNodes && forceNodes.length ? forceNodes.join(',') : undefined,
    })}`
    const es = new EventSource(url)
    let finished = false
    const stop = () => {
      finished = true
      es.close()
    }
    es.onmessage = (e) => {
      let ev
      try {
        ev = JSON.parse(e.data)
      } catch {
        return
      }
      onEvent(ev)
      if (ev.event === 'done' || ev.event === 'error') stop()
    }
    es.onerror = () => {
      if (finished) return
      stop()
      onEvent({ event: 'error', message: 'Connexion au serveur interrompue.' })
    }
    return es
  },

  // E.2 — annule un run en cours côté serveur (le runner check entre 2 blocs).
  cancelRun: (pid, wid) => sendJSON(`/projects/${enc(pid)}/workflows/${enc(wid)}/cancel`, 'POST'),

  // ---- Inventaire (« backpack ») — groupes de blocs réutilisables ----
  listBackpack: (pid) => getJSON(`/projects/${enc(pid)}/backpack`),
  addBackpack: (pid, item) => sendJSON(`/projects/${enc(pid)}/backpack`, 'POST', item),
  renameBackpack: (pid, iid, name) =>
    sendJSON(`/projects/${enc(pid)}/backpack/${enc(iid)}`, 'PATCH', { name }),
  deleteBackpack: (pid, iid) =>
    req(`/projects/${enc(pid)}/backpack/${enc(iid)}`, { method: 'DELETE' }),
}
