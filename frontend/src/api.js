// HTTP client for the Roade backend. The Vite dev server proxies /api to the
// FastAPI server (see vite.config.js). All methods return parsed JSON, except
// downloadUrl (a string) and runStream (an EventSource).

const BASE = '/api'

async function req(path, options = {}) {
  const res = await fetch(BASE + path, options)
  if (!res.ok) {
    let detail = res.statusText
    try {
      const body = await res.json()
      detail = body.detail || body.error || detail
    } catch { /* non-JSON error body */ }
    throw new Error(detail || `Erreur ${res.status}`)
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

  // ---- files ----
  listFiles: (pid) => getJSON(`/projects/${enc(pid)}/files`),
  uploadFile: (pid, file) => {
    const fd = new FormData()
    fd.append('file', file)
    return req(`/projects/${enc(pid)}/files`, { method: 'POST', body: fd })
  },
  deleteFile: (pid, name) =>
    req(`/projects/${enc(pid)}/files/${enc(name)}`, { method: 'DELETE' }),
  openFile: (pid, name) =>
    sendJSON(`/projects/${enc(pid)}/files/${enc(name)}/open`, 'POST'),
  openFilesFolder: (pid) =>
    sendJSON(`/projects/${enc(pid)}/files/open-folder`, 'POST'),
  downloadUrl: (pid, name) => `${BASE}/projects/${enc(pid)}/files/${enc(name)}`,
  peek: (pid, file, sheet, headerRow) =>
    getJSON(`/projects/${enc(pid)}/peek${qs({ file, sheet, header_row: headerRow })}`),

  // ---- workflows ----
  listWorkflows: (pid) => getJSON(`/projects/${enc(pid)}/workflows`),
  createWorkflow: (pid, name) =>
    sendJSON(`/projects/${enc(pid)}/workflows`, 'POST', { name }),
  getWorkflow: (pid, wid) => getJSON(`/projects/${enc(pid)}/workflows/${enc(wid)}`),
  documentUrl: (pid, wid) => `${BASE}/projects/${enc(pid)}/workflows/${enc(wid)}/document`,
  saveWorkflow: (pid, wf) =>
    sendJSON(`/projects/${enc(pid)}/workflows/${enc(wf.id)}`, 'PUT', wf),
  deleteWorkflow: (pid, wid) =>
    req(`/projects/${enc(pid)}/workflows/${enc(wid)}`, { method: 'DELETE' }),

  // ---- preview / profile ----
  preview: (pid, wid, nodeId, opts = {}) => {
    const { limit, offset, handle, sort, dir, q, filters } = opts
    const params = {
      limit, offset, handle, sort, dir, q,
      filters: filters && filters.length ? JSON.stringify(filters) : undefined,
    }
    return getJSON(
      `/projects/${enc(pid)}/workflows/${enc(wid)}/nodes/${enc(nodeId)}/preview${qs(params)}`)
  },
  profile: (pid, wid, nodeId, column, handle = 'out') =>
    getJSON(
      `/projects/${enc(pid)}/workflows/${enc(wid)}/nodes/${enc(nodeId)}/profile${qs({ column, handle })}`),
  // ---- « Clés multiples » group drill-down ----
  keysGroup: (pid, wid, nodeId, key, q, handle = 'out') =>
    getJSON(
      `/projects/${enc(pid)}/workflows/${enc(wid)}/nodes/${enc(nodeId)}/group${qs({ key: (key || []).join(','), q, handle })}`),

  // ---- validation tester ----
  validateTest: (config, samples) =>
    sendJSON('/validate/test', 'POST', { config, samples }),

  // ---- routing: live distribution preview (no materialization) ----
  routePreview: (pid, wid, nodeId, config) =>
    sendJSON(`/projects/${enc(pid)}/workflows/${enc(wid)}/nodes/${enc(nodeId)}/route-preview`, 'POST', config),
  // ---- split by value: discover distinct extracted values ----
  splitScan: (pid, wid, nodeId, config) =>
    sendJSON(`/projects/${enc(pid)}/workflows/${enc(wid)}/nodes/${enc(nodeId)}/split-scan`, 'POST', config),

  // ---- streaming run (Server-Sent Events) ----
  runStream: (pid, wid, onlyNode, onEvent, force = false, allExports = false) => {
    const url = `${BASE}/projects/${enc(pid)}/workflows/${enc(wid)}/run-stream${qs({ only_node: onlyNode, force: force ? 1 : undefined, all_exports: allExports ? 1 : undefined })}`
    const es = new EventSource(url)
    let finished = false
    const stop = () => { finished = true; es.close() }
    es.onmessage = (e) => {
      let ev
      try { ev = JSON.parse(e.data) } catch { return }
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
}
