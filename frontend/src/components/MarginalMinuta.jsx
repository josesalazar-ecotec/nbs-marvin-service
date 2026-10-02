/**
 * MarginalMinuta — panel lateral de minuta animada.
 * Muestra preguntas de MARVIN y respuestas del usuario
 * tal como llegan, con animación de entrada por turno.
 * Compartido entre modo voz y modo texto.
 *
 * Nota: el documento de diseño original usa Tabler Icons (`<i className="ti
 * ti-...">`), que no está cargado en este proyecto (ni el HTML ni el
 * package.json lo referencian) y su propia regla dice "sin librerías de UI
 * externas nuevas". Se sustituyen por lucide-react, ya establecido en el
 * proyecto desde el Diseño A.
 */
import { useEffect, useRef } from 'react';
import { NotebookPen, FileText, Paperclip } from 'lucide-react';
import { limpiarMarkdown } from '../utils/limpiarMarkdown';

const BLOQUES_LABELS = {
  A: 'contexto', B: 'actores', C: 'proceso',
  D: 'reglas',   E: 'datos',   F: 'técnico', G: 'cierre',
};

export default function MarginalMinuta({ historial = [], bloqueActual, totalPreguntas = 12 }) {
  const cursorRef = useRef(null);

  useEffect(() => {
    cursorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [historial.length]);

  // Determinar bloques completados
  const bloquesVistos = [...new Set(historial.map(t => t.bloque_tematico).filter(Boolean))];
  const BLOQUES = ['A', 'B', 'C', 'D', 'E'];

  return (
    <div style={{
      width: 196,
      flexShrink: 0,
      display: 'flex',
      flexDirection: 'column',
      gap: 6,
      borderLeft: '0.5px solid var(--border, #e2e8f0)',
      paddingLeft: 10,
    }}>
      {/* Header minuta */}
      <div style={{
        fontSize: 10,
        color: 'var(--text-muted, #94a3b8)',
        fontWeight: 500,
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        paddingBottom: 4,
        borderBottom: '0.5px solid var(--border, #e2e8f0)',
        display: 'flex',
        alignItems: 'center',
        gap: 4,
      }}>
        <NotebookPen size={12} aria-hidden="true" />
        Minuta
      </div>

      {/* Turnos */}
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        overflowY: 'auto',
        maxHeight: 420,
        paddingRight: 2,
      }}>
        {historial.map((turno, idx) => (
          <div
            key={turno.id || idx}
            style={{
              animation: 'marvin-entrada 0.35s ease both',
              animationDelay: `${Math.min(idx * 0.05, 0.3)}s`,
            }}
          >
            {turno.es_pregunta ? (
              // Turno de MARVIN
              <div>
                <div style={{
                  fontSize: 9,
                  color: 'var(--text-muted, #94a3b8)',
                  fontWeight: 500,
                  marginBottom: 2,
                }}>
                  MARVIN{turno.bloque_tematico ? ` — bloque ${turno.bloque_tematico}` : ''}
                </div>
                <div style={{
                  fontSize: 11,
                  color: 'var(--text-secondary, #64748b)',
                  lineHeight: 1.5,
                  borderLeft: '2px solid var(--border-accent, #93c5fd)',
                  paddingLeft: 7,
                }}>
                  {limpiarMarkdown(turno.contenido)}
                </div>
              </div>
            ) : (
              // Turno del usuario
              <div>
                <div style={{
                  fontSize: 9,
                  color: 'var(--text-muted, #94a3b8)',
                  fontWeight: 500,
                  marginBottom: 2,
                }}>
                  Respuesta{turno.archivo_adjunto_md ? ' + archivo' : ''}
                </div>
                <div style={{
                  fontSize: 11,
                  color: 'var(--text-primary, #1e293b)',
                  lineHeight: 1.5,
                  background: 'var(--surface-2, #f1f5f9)',
                  borderRadius: 6,
                  padding: '5px 7px',
                }}>
                  {turno.contenido}
                </div>
                {turno.archivo_adjunto_md && (
                  <div style={{
                    marginTop: 3,
                    fontSize: 10,
                    background: 'var(--surface-2, #f1f5f9)',
                    borderRadius: 6,
                    padding: '4px 7px',
                    borderLeft: '2px solid var(--border-success, #86efac)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    color: 'var(--text-success, #166534)',
                    fontWeight: 500,
                  }}>
                    <FileText size={11} aria-hidden="true" />
                    archivo adjunto
                    <span style={{ color: 'var(--text-muted, #94a3b8)', marginLeft: 'auto', fontSize: 9 }}>
                      extraído
                    </span>
                  </div>
                )}

                {/* Interpretación de documento adjunto (Fase 4) -- viene
                    del payload enriquecido tras subir un adjunto vía
                    /api/v2/entrevistas/adjunto (ver subirAdjuntosPendientes
                    en Entrevista.jsx). Si el campo no existe en el
                    historial cargado desde BD, simplemente no se
                    renderiza -- no es un error. */}
                {!turno.es_pregunta && turno.resumen_ia_adjunto && (
                  <div style={{
                    marginTop: 4,
                    fontSize: 10,
                    background: 'var(--surface-2, #f1f5f9)',
                    borderRadius: 6,
                    padding: '5px 8px',
                    borderLeft: '2px solid #10B981',
                    color: '#065F46',
                    lineHeight: 1.5,
                    fontStyle: 'italic',
                  }}>
                    <span style={{ fontWeight: 600, fontStyle: 'normal', display: 'block', marginBottom: 2 }}>
                      Lo que entendí de este documento:
                    </span>
                    {turno.resumen_ia_adjunto}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}

        {/* Cursor animado — siempre al final */}
        <div ref={cursorRef} style={{ display: 'flex', gap: 3, alignItems: 'center', padding: '4px 0' }}>
          {[0, 0.2, 0.4].map((delay, i) => (
            <span key={i} style={{
              width: 5, height: 5, borderRadius: '50%',
              background: 'var(--text-accent, #2563eb)',
              display: 'inline-block',
              animation: `marvin-punto 1.4s infinite ${delay}s`,
            }} />
          ))}
        </div>
      </div>

      {/* Bloques temáticos */}
      <div style={{ borderTop: '0.5px solid var(--border, #e2e8f0)', paddingTop: 8 }}>
        <div style={{ fontSize: 9, color: 'var(--text-muted, #94a3b8)', marginBottom: 4, fontWeight: 500 }}>
          BLOQUES
        </div>
        <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
          {BLOQUES.map(b => {
            const completado = bloquesVistos.includes(b) && b !== bloqueActual;
            const activo = b === bloqueActual;
            return (
              <span key={b} style={{
                fontSize: 9,
                padding: '2px 7px',
                borderRadius: 10,
                background: completado ? 'var(--bg-success, #dcfce7)' : activo ? 'var(--bg-accent, #dbeafe)' : 'var(--surface-2, #f1f5f9)',
                color: completado ? 'var(--text-success, #166534)' : activo ? 'var(--text-accent, #2563eb)' : 'var(--text-muted, #94a3b8)',
                border: (!completado && !activo) ? '0.5px solid var(--border, #e2e8f0)' : 'none',
              }}>
                {b} {BLOQUES_LABELS[b]}
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}
