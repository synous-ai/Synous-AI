/**
 * La bici de la sección de visión: un trazo de línea que se dibuja al entrar
 * en pantalla (lo dispara el `.reveal.is-shown` que la envuelve) y unas ruedas
 * que giran despacio. Decorativa: va con `aria-hidden`.
 *
 * Cada trazo usa `pathLength="1"`, así la animación de dibujo es la misma para
 * todos sin medir largos.
 */
export function BikeMark() {
  return (
    <svg className="pv-bike" viewBox="0 0 260 170" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="pv-bike-stroke" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.45" stopColor="#96c0ff" />
          <stop offset="1" stopColor="#383cff" />
        </linearGradient>
      </defs>

      <g stroke="url(#pv-bike-stroke)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        {/* Ruedas */}
        <circle className="pv-bike-line" pathLength={1} cx="60" cy="112" r="42" />
        <circle className="pv-bike-line" pathLength={1} cx="200" cy="112" r="42" />

        {/* Cuadro: vainas, tubo del asiento, tubo superior, diagonal y horquilla */}
        <path className="pv-bike-line" pathLength={1} d="M60 112 L120 112 L108 58 L60 112" />
        <path className="pv-bike-line" pathLength={1} d="M108 58 L176 54 L182 70 L120 112" />
        <path className="pv-bike-line" pathLength={1} d="M182 70 L200 112" />

        {/* Asiento y manubrio de ruta */}
        <path className="pv-bike-line" pathLength={1} d="M108 58 L104 44 M92 42 L116 42" />
        <path className="pv-bike-line" pathLength={1} d="M176 54 L172 40 L190 38 Q202 38 202 50 Q202 58 194 58" />

        {/* Plato y biela */}
        <circle className="pv-bike-line" pathLength={1} cx="120" cy="112" r="10" />
        <path className="pv-bike-line" pathLength={1} d="M120 112 L130 128 M124 128 L136 128" />
      </g>

      {/* Rayos: giran una vez dibujada la bici */}
      <g className="pv-bike-spokes" stroke="#96c0ff" strokeOpacity="0.35" strokeWidth="1.2">
        <g className="pv-bike-wheel">
          <path d="M60 74 V150 M22 112 H98 M33 85 L87 139 M87 85 L33 139" />
        </g>
        <g className="pv-bike-wheel">
          <path d="M200 74 V150 M162 112 H238 M173 85 L227 139 M227 85 L173 139" />
        </g>
      </g>

      {/* Hubs */}
      <circle cx="60" cy="112" r="3.5" fill="#96c0ff" />
      <circle cx="200" cy="112" r="3.5" fill="#96c0ff" />

      {/* Suelo: una línea que corre */}
      <path className="pv-bike-ground" d="M0 158 H260" stroke="#96c0ff" strokeOpacity="0.4" strokeWidth="1.5" strokeDasharray="6 10" />
    </svg>
  )
}
