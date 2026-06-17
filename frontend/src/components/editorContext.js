import { createContext, useContext } from 'react'

// Provides per-node runtime info + actions to custom node components without
// putting non-serializable functions into node.data (nodes are saved to disk).
export const EditorContext = createContext({
  status: {}, // nodeId -> { rows, error, ran }
  running: null, // nodeId currently running
  onPreview: () => {},
  onRunNode: () => {},
  onDeleteEdge: () => {},
})

export const useEditor = () => useContext(EditorContext)
