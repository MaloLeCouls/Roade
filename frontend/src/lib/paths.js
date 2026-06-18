/** Nom du sous-dossier `exports/<ici>/` — miroir de `storage._safe_folder` côté backend. */
export function exportSubdir(wfName) {
  const s = String(wfName || '')
    .trim()
    .replace(/[\\/:*?"<>|]/g, '_')
  return s || 'Workflow'
}
