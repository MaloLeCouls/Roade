import { Component } from 'react'

/*
 * Keeps a render crash in one block's result panel from taking down the whole
 * app. On a thrown error React unmounts up to the nearest boundary; without one
 * that's the root, so the editor just freezes (e.g. the "_fmtCell is not
 * defined" class of bug). Here we catch it, show a localized card, and clear it
 * when `resetKey` changes (the user opens another block) or hits « Réessayer ».
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { err: null }
  }

  static getDerivedStateFromError(err) {
    return { err }
  }

  componentDidCatch(err, info) {
    console.error('Block panel crashed:', err, info)
  }

  componentDidUpdate(prev) {
    if (prev.resetKey !== this.props.resetKey && this.state.err) this.setState({ err: null })
  }

  render() {
    if (!this.state.err) return this.props.children
    return (
      <div className="be-crash">
        <p className="be-crash-h">Cet affichage a planté.</p>
        <pre>{String(this.state.err.message || this.state.err)}</pre>
        <p className="muted">
          Le reste de l'éditeur reste utilisable. Réessayez après avoir réexécuté le bloc.
        </p>
        <button className="ghost small" onClick={() => this.setState({ err: null })}>
          Réessayer
        </button>
      </div>
    )
  }
}
