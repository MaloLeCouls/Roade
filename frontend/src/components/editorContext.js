import { createContext, useContext } from 'react'

// Provides per-node runtime info + actions to custom node components without
// putting non-serializable functions into node.data (nodes are saved to disk).
export const EditorContext = createContext({
  status: {}, // nodeId -> { rows, error, ran }
  running: null, // nodeId currently running
  onPreview: () => {},
  onRunNode: () => {},
  onDeleteEdge: () => {},
  // E.5 — async confirm fourni par WorkflowEditor pour les actions destructives
  // déclenchées depuis le canevas (ex : suppression de lien depuis ButtonEdge).
  confirmDelete: null,
})

export const useEditor = () => useContext(EditorContext)
