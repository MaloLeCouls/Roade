// Minimal monochrome SVG icons (no emojis). `inherit` stroke/fill = currentColor.
const P = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round' }

export default function Icon({ name, size = 14 }) {
  const s = { width: size, height: size, display: 'block' }
  switch (name) {
    case 'play':
      return <svg style={s} viewBox="0 0 16 16"><path {...P} fill="currentColor" stroke="none" d="M5 3.5v9l7-4.5z" /></svg>
    case 'eye':
      return <svg style={s} viewBox="0 0 16 16"><path {...P} d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z" /><circle {...P} cx="8" cy="8" r="2" /></svg>
    case 'list':
      return <svg style={s} viewBox="0 0 16 16"><path {...P} d="M5 4h9M5 8h9M5 12h9M2 4h.01M2 8h.01M2 12h.01" /></svg>
    case 'lock':
      return <svg style={s} viewBox="0 0 16 16"><rect {...P} x="3.5" y="7" width="9" height="6" rx="1" /><path {...P} d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" /></svg>
    case 'search':
      return <svg style={s} viewBox="0 0 16 16"><circle {...P} cx="7" cy="7" r="4.5" /><path {...P} d="M13.5 13.5l-3-3" /></svg>
    case 'filter':
      return <svg style={s} viewBox="0 0 16 16"><path {...P} d="M2 3.5h12l-4.5 5v4l-3 1.5v-5.5z" /></svg>
    case 'x':
      return <svg style={s} viewBox="0 0 16 16"><path {...P} d="M4 4l8 8M12 4l-8 8" /></svg>
    case 'check':
      return <svg style={s} viewBox="0 0 16 16"><path {...P} d="M3.5 8.5l3 3 6-7" /></svg>
    case 'refresh':
      return <svg style={s} viewBox="0 0 16 16"><path {...P} d="M13 8a5 5 0 1 1-1.5-3.5M13 2.5V5h-2.5" /></svg>
    case 'plus':
      return <svg style={s} viewBox="0 0 16 16"><path {...P} d="M8 3v10M3 8h10" /></svg>
    case 'download':
      return <svg style={s} viewBox="0 0 16 16"><path {...P} d="M8 2v8m0 0l3-3m-3 3L5 7M3 13h10" /></svg>
    case 'chev-left':
      return <svg style={s} viewBox="0 0 16 16"><path {...P} d="M10 3L5 8l5 5" /></svg>
    case 'chev-right':
      return <svg style={s} viewBox="0 0 16 16"><path {...P} d="M6 3l5 5-5 5" /></svg>
    case 'sort':
      return <svg style={s} viewBox="0 0 16 16"><path {...P} d="M8 3v10M5 6l3-3 3 3M5 10l3 3 3-3" /></svg>
    case 'up':
      return <svg style={s} viewBox="0 0 16 16"><path {...P} d="M4 10l4-4 4 4" /></svg>
    case 'down':
      return <svg style={s} viewBox="0 0 16 16"><path {...P} d="M4 6l4 4 4-4" /></svg>
    case 'trash':
      return <svg style={s} viewBox="0 0 16 16"><path {...P} d="M3 4.5h10M6 4.5V3h4v1.5M4.5 4.5l.5 8h6l.5-8" /></svg>
    case 'file':
      return <svg style={s} viewBox="0 0 16 16"><path {...P} d="M4 2h5l3 3v9H4z" /><path {...P} d="M9 2v3h3" /></svg>
    case 'folder':
      return <svg style={s} viewBox="0 0 16 16"><path {...P} d="M2 4h4l1.5 1.5H14V13H2z" /></svg>
    case 'flow':
      return <svg style={s} viewBox="0 0 16 16"><rect {...P} x="2" y="6" width="4" height="4" rx="1" /><rect {...P} x="10" y="6" width="4" height="4" rx="1" /><path {...P} d="M6 8h4" /></svg>
    case 'info':
      return <svg style={s} viewBox="0 0 16 16"><circle {...P} cx="8" cy="8" r="6.5" /><path {...P} d="M8 7.3v3.6" /><path {...P} d="M8 5.1h.01" /></svg>
    case 'external':
      return <svg style={s} viewBox="0 0 16 16"><path {...P} d="M12.5 9V13H3V3.5h4" /><path {...P} d="M9.5 3H13v3.5" /><path {...P} d="M13 3L7.5 8.5" /></svg>
    default:
      return null
  }
}
