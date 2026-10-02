/**
 * MarvinSpinner — spinner de procesamiento para generación del resumen.
 * CSS puro, sin imágenes externas, sin GIF. Estética de agente IA.
 *
 * Nota: la barra de progreso indeterminada del documento original usaba la
 * animación de rotación `marvin-spin-outer` sobre una barra delgada, lo que
 * la haría girar en el lugar en vez de deslizarse. Se corrigió usando una
 * animación de traslación dedicada (`marvin-bar-desliza`, ver index.css).
 */
import { Brain } from 'lucide-react';

export default function MarvinSpinner({ mensaje = 'Generando resumen…' }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', gap: 16, padding: '2rem 1rem',
    }}>
      {/* Spinner de doble anillo */}
      <div style={{ position: 'relative', width: 56, height: 56 }}>
        {/* Anillo exterior */}
        <div style={{
          position: 'absolute', inset: 0,
          borderRadius: '50%',
          border: '3px solid transparent',
          borderTopColor: 'var(--text-accent, #2563EB)',
          borderRightColor: 'var(--text-accent, #2563EB)',
          animation: 'marvin-spin-outer 1s linear infinite',
        }} />
        {/* Anillo interior */}
        <div style={{
          position: 'absolute', inset: 8,
          borderRadius: '50%',
          border: '2px solid transparent',
          borderTopColor: 'var(--border-accent, #93C5FD)',
          animation: 'marvin-spin-inner 0.7s linear infinite',
        }} />
        {/* Centro — ícono cerebro */}
        <div style={{
          position: 'absolute', inset: 12,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          animation: 'marvin-fade-pulse 2s ease-in-out infinite',
          color: 'var(--text-accent, #2563EB)',
        }}>
          <Brain size={20} aria-hidden="true" />
        </div>
      </div>

      {/* Mensaje animado */}
      <div style={{
        fontSize: 12, color: 'var(--text-secondary, #64748B)',
        animation: 'marvin-fade-pulse 2s ease-in-out infinite',
        textAlign: 'center',
      }}>
        {mensaje}
      </div>

      {/* Barra de progreso indeterminada */}
      <div style={{
        width: 200, height: 2,
        background: 'var(--border, #E2E8F0)',
        borderRadius: 2, overflow: 'hidden',
      }}>
        <div style={{
          height: '100%', width: '40%',
          background: 'var(--text-accent, #2563EB)',
          borderRadius: 2,
          animation: 'marvin-bar-desliza 1.5s ease-in-out infinite',
        }} />
      </div>
    </div>
  );
}
