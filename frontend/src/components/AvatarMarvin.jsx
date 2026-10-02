/**
 * AvatarMarvin — avatar animado con ondas de voz (opción A).
 * Reemplaza el ícono de cerebro estático en EntrevistaVoz.jsx.
 * Las barras animan con marvin-onda (index.css) solo cuando `activo`
 * es true (grabando o procesando); en reposo quedan estáticas a media
 * altura, sin animación.
 */
const ALTURAS_BARRA = [10, 18, 24, 16, 11];

export default function AvatarMarvin({ activo = false, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: 60, height: 60, borderRadius: '50%',
        background: 'var(--bg-accent, #dbeafe)',
        border: '0.5px solid var(--border-accent, #93c5fd)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        gap: 3,
        cursor: 'pointer',
      }}
      aria-label="MARVIN — pulsa para repetir la pregunta"
    >
      {ALTURAS_BARRA.map((alto, i) => (
        <span
          key={i}
          style={{
            width: 4,
            height: alto,
            borderRadius: 2,
            background: 'var(--text-accent, #2563eb)',
            display: 'inline-block',
            transformOrigin: 'center',
            animation: activo ? `marvin-onda ${0.7 + i * 0.1}s ease-in-out infinite` : 'none',
            animationDelay: `${i * 0.08}s`,
            transform: activo ? undefined : 'scaleY(0.55)',
          }}
        />
      ))}
    </button>
  );
}
