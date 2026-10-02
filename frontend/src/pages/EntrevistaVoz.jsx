/**
 * EntrevistaVoz — panel de modo voz MARVIN.
 * UI basada en mockup aprobado (entrevista_ui_v3_marvin_habla) + skill
 * marvin-voice-agent (TC-01 a TC-05).
 * No usa position:fixed. Iconos lucide-react (Tabler no está cargado en
 * el proyecto -- ver nota en MarginalMinuta.jsx).
 */
import { useEffect, useState } from 'react';
import {
  Repeat, Square, Loader2, Mic,
  Paperclip, Plus, File, FileText, FileSpreadsheet, FileCode2, Image as ImageIcon,
} from 'lucide-react';
import useMarvin from '../hooks/useMarvin';
import { hablarMarvin, detenerMarvin } from '../utils/marvinVoz';
import { limpiarMarkdown } from '../utils/limpiarMarkdown';
import AvatarMarvin from '../components/AvatarMarvin';

const TIPOS_ACEPTADOS = '.pdf,.txt,.xlsx,.xls,.csv,.md,.jpg,.jpeg,.png,.tiff';

const ICONO_POR_EXT = {
  pdf: FileText, xlsx: FileSpreadsheet, xls: FileSpreadsheet, csv: FileSpreadsheet,
  txt: FileText, md: FileCode2,
  jpg: ImageIcon, jpeg: ImageIcon, png: ImageIcon, tiff: ImageIcon,
};
const COLOR_POR_EXT = {
  pdf: '#DC2626', xlsx: '#16A34A', xls: '#16A34A', csv: '#16A34A',
  txt: '#64748B', md: '#2563EB',
  jpg: '#D97706', jpeg: '#D97706', png: '#D97706', tiff: '#D97706',
};
function extInfo(nombre) {
  const ext = nombre.split('.').pop().toLowerCase();
  return { Icono: ICONO_POR_EXT[ext] || File, color: COLOR_POR_EXT[ext] || '#94A3B8' };
}

export default function EntrevistaVoz({
  proyectoId, bloqueActual, turnoNumero, preguntaActual, onRespuesta,
  archivos, onAgregarArchivo, onQuitarArchivo, onErrorMicrofono,
  deshabilitado = false,
}) {
  const {
    estado, segundosRestantes, transcripcion, blobUrl, error, silencioDetectado,
    iniciar, registrar, cambiar, aceptarFragmentar, rechazarFragmentar,
  } = useMarvin({ proyectoId, bloqueActual, turnoNumero, onRespuesta });

  const [marvinHablando, setMarvinHablando] = useState(false);

  // MARVIN habla la pregunta al montarse o cuando cambia
  useEffect(() => {
    if (!preguntaActual) return;
    setMarvinHablando(true);
    hablarMarvin(preguntaActual, () => setMarvinHablando(false));
  }, [preguntaActual]);

  function repetir() {
    setMarvinHablando(true);
    hablarMarvin(preguntaActual, () => setMarvinHablando(false));
  }

  function iniciarConVoz() {
    // Al activar el micrófono, MARVIN debe dejar de hablar de inmediato.
    detenerMarvin();
    setMarvinHablando(false);
    iniciar();
  }

  const estaGrabando = estado === 'grabando';
  const estaRevisando = estado === 'revisando';
  const estaInterrumpiendo = estado === 'interrumpiendo';
  const estaProcesando = estado === 'procesando' || estado === 'enviando';

  const pct = Math.round((segundosRestantes / 120) * 100);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>

      {/* Pregunta con botón repetir */}
      <div style={{
        background: 'var(--surface-2, #f1f5f9)',
        border: '0.5px solid var(--border, #e2e8f0)',
        borderRadius: 10,
        padding: '12px 14px',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', marginBottom: 5,
        }}>
          <div style={{
            fontSize: 9, color: 'var(--text-muted, #94a3b8)',
            fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em',
          }}>
            MARVIN pregunta
          </div>
          <button
            onClick={repetir}
            style={{
              display: 'flex', alignItems: 'center', gap: 4,
              padding: '3px 9px', borderRadius: 20,
              border: '0.5px solid var(--border, #e2e8f0)',
              background: 'var(--surface-1, #ffffff)',
              fontSize: 10, color: 'var(--text-secondary, #64748b)', cursor: 'pointer',
            }}
            aria-label="Repetir pregunta"
          >
            <Repeat size={12} aria-hidden="true" />
            Repetir
          </button>
        </div>
        <p style={{
          fontSize: 13, color: 'var(--text-primary, #1e293b)',
          lineHeight: 1.6, margin: 0,
        }}>
          {limpiarMarkdown(preguntaActual)}
        </p>
      </div>

      {/* Avatar + estado + controles */}
      <div style={{
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', gap: 8,
      }}>
        {/* Barra de tiempo */}
        {estaGrabando && (
          <div style={{
            width: '100%', height: 3,
            background: 'var(--border, #e2e8f0)', borderRadius: 2, overflow: 'hidden',
          }}>
            <div style={{
              height: '100%', borderRadius: 2,
              background: pct < 20 ? '#DC2626' : 'var(--text-accent, #2563eb)',
              width: pct + '%',
              transition: 'width 1s linear, background 0.5s',
            }} />
          </div>
        )}

        {/* Avatar — ondas de voz animadas (opción A), clickeable para repetir */}
        <AvatarMarvin activo={marvinHablando || estaProcesando} onClick={repetir} />

        <p style={{
          fontSize: 11, color: 'var(--text-muted, #94a3b8)',
          textAlign: 'center', minHeight: 16,
          fontStyle: 'italic', margin: 0,
        }}>
          {estado === 'preparando' && 'Un momento…'}
          {estaGrabando && !silencioDetectado && `Grabando — ${segundosRestantes}s restantes`}
          {estaGrabando && silencioDetectado && '¿Sigues ahí? No detecto audio…'}
          {estaRevisando && '¿Escuchamos antes de registrar?'}
          {estaInterrumpiendo && '¿Lo hacemos en fragmentos?'}
          {estaProcesando && 'Procesando tu respuesta…'}
        </p>

        {/* TC-05: error de micrófono -- ofrecer modo texto, sin bloquear */}
        {estado === 'error' && (
          <div style={{
            width: '100%',
            background: 'var(--bg-danger, #fef2f2)',
            border: '0.5px solid var(--border-danger, #fecaca)',
            borderRadius: 8,
            padding: '10px 12px',
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
          }}>
            <span style={{ fontSize: 12, color: 'var(--text-danger, #991b1b)' }}>
              {error || 'No se pudo acceder al micrófono.'}
            </span>
            <button
              type="button"
              onClick={() => onErrorMicrofono && onErrorMicrofono()}
              style={{
                alignSelf: 'flex-start',
                padding: '4px 12px',
                borderRadius: 20,
                border: '0.5px solid var(--border-danger, #fecaca)',
                background: '#fff',
                fontSize: 11,
                color: 'var(--text-danger, #991b1b)',
                cursor: 'pointer',
              }}
            >
              Cambiar a modo texto
            </button>
          </div>
        )}

        {/* Botón grabar — solo en idle/preparando/grabando */}
        {estado !== 'error' && !estaRevisando && !estaInterrumpiendo && (
          <button
            onClick={estado === 'idle' ? iniciarConVoz : estaGrabando ? registrar : undefined}
            disabled={deshabilitado || estaProcesando || estado === 'preparando'}
            style={{
              width: 58, height: 58, borderRadius: '50%',
              border: 'none', cursor: (deshabilitado || estaProcesando) ? 'not-allowed' : 'pointer',
              background: estaGrabando ? 'var(--bg-danger, #fee2e2)' : 'var(--bg-accent, #dbeafe)',
              color: estaGrabando ? '#DC2626' : 'var(--text-accent, #2563eb)',
              fontSize: 24,
              opacity: deshabilitado ? 0.5 : 1,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
            aria-label={estaGrabando ? 'Detener grabación' : 'Iniciar grabación'}
          >
            {estaProcesando ? (
              <Loader2 size={22} className="marvin-spin" aria-hidden="true" />
            ) : estaGrabando ? (
              <Square size={20} aria-hidden="true" />
            ) : (
              <Mic size={22} aria-hidden="true" />
            )}
          </button>
        )}

        {/* Fragmentación */}
        {estaInterrumpiendo && (
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={rechazarFragmentar} style={{
              padding: '5px 14px', borderRadius: 20,
              border: '0.5px solid var(--border, #e2e8f0)',
              background: 'var(--surface-1, #ffffff)',
              fontSize: 11, cursor: 'pointer', color: 'var(--text-secondary, #64748b)',
            }}>
              Registrar lo grabado
            </button>
            <button onClick={aceptarFragmentar} style={{
              padding: '5px 14px', borderRadius: 20,
              border: '0.5px solid var(--border-accent, #93c5fd)',
              background: 'var(--bg-accent, #dbeafe)',
              fontSize: 11, cursor: 'pointer',
              color: 'var(--text-accent, #2563eb)', fontWeight: 500,
            }}>
              Fragmentar
            </button>
          </div>
        )}

        {/* Playback + acciones en revisando */}
        {estaRevisando && blobUrl && (
          <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <audio
              src={blobUrl} controls
              style={{ width: '100%', height: 32 }}
              aria-label="Tu respuesta grabada"
            />
            <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
              <button onClick={cambiar} style={{
                padding: '4px 13px', borderRadius: 20,
                border: '0.5px solid var(--border, #e2e8f0)',
                background: 'var(--surface-1, #ffffff)',
                fontSize: 11, cursor: 'pointer', color: 'var(--text-secondary, #64748b)',
              }}>
                Cambiar
              </button>
              <button onClick={registrar} style={{
                padding: '4px 13px', borderRadius: 20,
                border: '0.5px solid var(--border-accent, #93c5fd)',
                background: 'var(--bg-accent, #dbeafe)',
                fontSize: 11, cursor: 'pointer',
                color: 'var(--text-accent, #2563eb)', fontWeight: 500,
              }}>
                Registrar
              </button>
            </div>
          </div>
        )}

        {/* Transcripción confirmada */}
        {transcripcion && (
          <div style={{
            width: '100%',
            background: 'var(--bg-success, #f0fdf4)',
            border: '0.5px solid var(--border-success, #bbf7d0)',
            borderRadius: 8, padding: '6px 10px',
            fontSize: 11, color: 'var(--text-success, #166534)', lineHeight: 1.5,
          }}>
            {transcripcion}
          </div>
        )}
      </div>

      {/* Zona de adjuntos — compartida con modo texto via props */}
      <AdjuntosZona
        archivos={archivos}
        onAgregar={onAgregarArchivo}
        onQuitar={onQuitarArchivo}
        modo="voz"
      />
    </div>
  );
}

export function AdjuntosZona({ archivos = [], onAgregar, onQuitar }) {
  return (
    <div style={{ border: '0.5px solid var(--border, #e2e8f0)', borderRadius: 10, overflow: 'hidden' }}>
      <div style={{
        padding: '7px 12px', background: 'var(--surface-2, #f1f5f9)',
        borderBottom: '0.5px solid var(--border, #e2e8f0)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <span style={{ fontSize: 10, color: 'var(--text-secondary, #64748b)', fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <Paperclip size={12} aria-hidden="true" />
          Adjuntos{' '}
          <span style={{ color: 'var(--text-muted, #94a3b8)' }}>{archivos.length} / 5</span>
        </span>
        {archivos.length < 5 && (
          <label style={{
            fontSize: 10, color: 'var(--text-accent, #2563eb)',
            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3,
          }}>
            <Plus size={12} aria-hidden="true" />
            Agregar
            <input
              type="file" multiple
              accept={TIPOS_ACEPTADOS}
              style={{ display: 'none' }}
              onChange={e => onAgregar && onAgregar(Array.from(e.target.files))}
            />
          </label>
        )}
      </div>
      <div style={{ padding: '6px 12px', display: 'flex', flexWrap: 'wrap', gap: 5, minHeight: 26 }}>
        {archivos.length === 0 ? (
          <span style={{ fontSize: 10, color: 'var(--text-muted, #94a3b8)' }}>
            PDF, Excel, imagen, CSV, Markdown — máx. 5
          </span>
        ) : (
          archivos.map((f, i) => {
            const { Icono, color } = extInfo(f.name);
            const label = f.name.length > 18 ? f.name.slice(0, 16) + '…' : f.name;
            return (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 4,
                padding: '3px 8px', borderRadius: 20,
                background: 'var(--surface-2, #f1f5f9)',
                border: '0.5px solid var(--border, #e2e8f0)',
                fontSize: 10, color: 'var(--text-secondary, #64748b)',
              }}>
                <Icono size={12} color={color} aria-hidden="true" />
                {label}
                <span
                  onClick={() => onQuitar && onQuitar(i)}
                  style={{ cursor: 'pointer', color: 'var(--text-muted, #94a3b8)', fontSize: 14, lineHeight: 1, marginLeft: 2 }}
                  aria-label="Quitar archivo"
                >
                  ×
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
