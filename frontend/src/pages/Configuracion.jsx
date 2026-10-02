import { useEffect, useState } from 'react'
import { S } from '../styles'
import useTareaPolling from '../hooks/useTareaPolling'
import MarvinConfig from '../components/MarvinConfig'

const COMPONENTES_SALUD = [
  { clave: 'backend', label: 'Backend API' },
  { clave: 'mysql', label: 'MySQL' },
  { clave: 'chromadb', label: 'ChromaDB' },
  { clave: 'whisper', label: 'Whisper' },
  { clave: 'ffmpeg', label: 'ffmpeg' },
  { clave: 'mcp_rag', label: 'MCP RAG (8300)' },
  { clave: 'jira', label: 'Jira API' },
]

// Colores de borde izquierdo por estado, según el sistema de diseño.
const COLOR_BORDE_ESTADO = {
  operativo: '#10B981',
  lento: '#F59E0B',
  no_disponible: '#EF4444',
}

const COLOR_TEXTO_ESTADO = {
  operativo: '#166534',
  lento: '#92400E',
  no_disponible: '#991B1B',
}

const ICONO_ESTADO = { operativo: '🟢', lento: '🟡', no_disponible: '🔴' }

function CardComponenteSalud({ nombreLabel, info, cargando, onVerificar }) {
  const estado = info?.estado || (cargando ? null : 'no_disponible')
  const colorBorde = COLOR_BORDE_ESTADO[estado] || '#CBD5E0'
  const colorTexto = COLOR_TEXTO_ESTADO[estado] || S.textoS

  return (
    <div
      style={{
        ...S.card,
        borderLeft: `3px solid ${colorBorde}`,
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        minWidth: 220,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <strong style={{ fontSize: 13, color: S.textoP }}>{nombreLabel}</strong>
        <button
          type="button"
          onClick={onVerificar}
          disabled={cargando}
          title="Verificar estado"
          style={{ ...S.btnSecundario, padding: '3px 8px', fontSize: 12 }}
        >
          🔄
        </button>
      </div>

      {cargando && <span style={{ fontSize: 12, color: S.textoS }}>Verificando…</span>}

      {!cargando && info && (
        <div style={{ fontSize: 12, color: colorTexto }}>
          <div>
            {ICONO_ESTADO[estado]}{' '}
            {estado === 'operativo' && `Operativo — ${info.latencia_ms ?? '?'}ms`}
            {estado === 'lento' && `Lento — ${info.latencia_ms ?? '?'}ms (umbral superado)`}
            {estado === 'no_disponible' && `No disponible — ${info.error || 'motivo desconocido'}`}
          </div>
          {nombreLabel === 'ChromaDB' && info.colecciones && (
            <div style={{ marginTop: 4, color: S.textoS }}>
              Colecciones: {info.colecciones.length ? info.colecciones.join(', ') : 'ninguna'}
            </div>
          )}
          {nombreLabel === 'Whisper' && (
            <div style={{ marginTop: 4, color: S.textoS }}>
              Modelo: {info.modelo} {info.modelo_en_cache ? '(en caché)' : '(no descargado)'}
            </div>
          )}
          {nombreLabel === 'Backend API' && (
            <div style={{ marginTop: 4, color: S.textoS }}>
              v{info.version} — uptime {info.uptime_segundos ?? 0}s
            </div>
          )}
          {nombreLabel === 'Jira API' && info.workspace && (
            <div style={{ marginTop: 4, color: S.textoS }}>{info.workspace}</div>
          )}
        </div>
      )}

      {!cargando && !info && <span style={{ fontSize: 12, color: S.textoM }}>Sin datos todavía.</span>}
    </div>
  )
}

function SeccionSalud() {
  const [salud, setSalud] = useState({})
  const [jiraSalud, setJiraSalud] = useState(null)
  const [cargandoTodo, setCargandoTodo] = useState(false)
  const [cargandoIndividual, setCargandoIndividual] = useState({})

  async function verificarSalud() {
    setCargandoIndividual((prev) => ({ ...prev, __salud: true }))
    try {
      const resp = await fetch('/api/v2/salud')
      const data = await resp.json()
      setSalud(data)
    } catch {
      setSalud({})
    } finally {
      setCargandoIndividual((prev) => ({ ...prev, __salud: false }))
    }
  }

  async function verificarJira() {
    setCargandoIndividual((prev) => ({ ...prev, jira: true }))
    try {
      const resp = await fetch('/api/v2/jira/salud')
      const data = await resp.json()
      setJiraSalud({ ...data, estado: data.ok ? 'operativo' : 'no_disponible' })
    } catch (err) {
      setJiraSalud({ ok: false, estado: 'no_disponible', error: 'No se pudo contactar al backend.' })
    } finally {
      setCargandoIndividual((prev) => ({ ...prev, jira: false }))
    }
  }

  async function verificarTodo() {
    setCargandoTodo(true)
    await Promise.all([verificarSalud(), verificarJira()])
    setCargandoTodo(false)
  }

  // Solo al cargar la pagina -- NUNCA polling automatico despues de esto.
  useEffect(() => {
    verificarTodo()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function infoPara(clave) {
    if (clave === 'jira') return jiraSalud
    return salud[clave]
  }

  return (
    <section style={{ marginBottom: '2rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
        <h2 style={{ fontSize: 14, fontWeight: 500, color: S.textoP, margin: 0 }}>Estado del sistema</h2>
        <button type="button" onClick={verificarTodo} disabled={cargandoTodo} style={S.btnPrimario}>
          🔄 Verificar todo
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
        {COMPONENTES_SALUD.map((c) => (
          <CardComponenteSalud
            key={c.clave}
            nombreLabel={c.label}
            info={infoPara(c.clave)}
            cargando={cargandoTodo || cargandoIndividual[c.clave] || cargandoIndividual.__salud}
            onVerificar={c.clave === 'jira' ? verificarJira : verificarSalud}
          />
        ))}
      </div>
    </section>
  )
}

const LABELS_PARAMETRO = {
  claude_modelo_entrevistador: 'Modelo Claude — Entrevistador',
  claude_modelo_documentador: 'Modelo Claude — Documentador',
  whisper_modelo: 'Modelo Whisper',
  chroma_umbral_conocimiento: 'Umbral similitud — conocimiento_nbs',
  chroma_umbral_codigo: 'Umbral similitud — nbs_codigo',
  jira_sync_intervalo_min: 'Intervalo sincronización Jira (min)',
  max_workers_async: 'Workers async máximos',
  voz_habilitada: 'Modo voz (MARVIN)',
}

function FilaParametro({ parametro, onGuardar }) {
  const [valor, setValor] = useState(parametro.valor)
  const [guardando, setGuardando] = useState(false)
  const [mensaje, setMensaje] = useState(null)

  const esToggleVoz = parametro.clave === 'voz_habilitada'

  async function guardar(nuevoValor) {
    setGuardando(true)
    setMensaje(null)
    try {
      await onGuardar(parametro.clave, nuevoValor)
      setValor(nuevoValor)
      setMensaje('Guardado.')
    } catch (err) {
      setMensaje(err.message || 'Error al guardar.')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <tr style={{ borderBottom: `1px solid ${S.borde}` }}>
      <td style={{ padding: '10px 14px', fontSize: 13, color: S.textoP }}>
        {LABELS_PARAMETRO[parametro.clave] || parametro.clave}
      </td>
      <td style={{ padding: '10px 14px' }}>
        {esToggleVoz ? (
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={valor === '1'}
              disabled={guardando}
              onChange={(e) => guardar(e.target.checked ? '1' : '0')}
            />
            <span style={{ fontSize: 13, color: S.textoS }}>{valor === '1' ? 'Activado' : 'Desactivado'}</span>
          </label>
        ) : (
          <input
            type="text"
            value={valor}
            disabled={guardando}
            onChange={(e) => setValor(e.target.value)}
            style={{ ...S.input, maxWidth: 220 }}
          />
        )}
      </td>
      <td style={{ padding: '10px 14px', textAlign: 'right' }}>
        {!esToggleVoz && (
          <button
            type="button"
            onClick={() => guardar(valor)}
            disabled={guardando}
            style={{ ...S.btnSecundario, padding: '4px 10px', fontSize: 12 }}
          >
            Guardar
          </button>
        )}
        {mensaje && <span style={{ marginLeft: 8, fontSize: 12, color: S.textoS }}>{mensaje}</span>}
      </td>
    </tr>
  )
}

function SeccionConfiguracion() {
  const [parametros, setParametros] = useState([])
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    cargar()
  }, [])

  async function cargar() {
    setCargando(true)
    try {
      const resp = await fetch('/api/v2/configuracion')
      const data = await resp.json()
      setParametros(Array.isArray(data) ? data : [])
    } catch {
      setParametros([])
    } finally {
      setCargando(false)
    }
  }

  async function guardarValor(clave, valor) {
    const resp = await fetch(`/api/v2/configuracion/${clave}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ valor }),
    })
    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}))
      throw new Error(data.error || `Error HTTP ${resp.status}`)
    }
  }

  return (
    <section style={{ marginBottom: '2rem' }}>
      <h2 style={{ fontSize: 14, fontWeight: 500, color: S.textoP, marginBottom: 12 }}>
        Configuración del sistema
      </h2>
      {cargando && <p style={{ fontSize: 13, color: S.textoS }}>Cargando parámetros…</p>}
      {!cargando && parametros.length === 0 && (
        <p style={{ fontSize: 13, color: S.textoM }}>No hay parámetros visibles.</p>
      )}
      {!cargando && parametros.length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse', ...S.card, padding: 0 }}>
          <thead>
            <tr style={{ background: S.fondo, borderBottom: `1px solid ${S.borde}` }}>
              <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: 12, color: S.textoS, fontWeight: 500 }}>
                Parámetro
              </th>
              <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: 12, color: S.textoS, fontWeight: 500 }}>
                Valor
              </th>
              <th />
            </tr>
          </thead>
          <tbody>
            {parametros.map((p) => (
              <FilaParametro key={p.clave} parametro={p} onGuardar={guardarValor} />
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}

// El drawer "Acerca de" (José + MARVIN) vive a nivel de App.jsx y se abre
// desde el enlace al pie del Navbar -- ver components/DrawerAcercaDe.jsx.
// Esta pagina ya no tiene su propio acceso ni estado de drawer.

function SeccionBootstrap() {
  const [tareaId, setTareaId] = useState(null)
  const [error, setError] = useState(null)
  const { tarea } = useTareaPolling(tareaId)

  async function ejecutar() {
    if (!window.confirm(
      '¿Ejecutar bootstrap? Lee la base anterior (agente_po_proyectos) en modo '
      + 'solo lectura y carga conocimiento institucional en ChromaDB. Puede tardar '
      + 'varios minutos.'
    )) return
    setError(null)
    try {
      const resp = await fetch('/api/v2/bootstrap/iniciar', { method: 'POST' })
      const data = await resp.json()
      if (!resp.ok) throw new Error(data.error || `Error HTTP ${resp.status}`)
      setTareaId(data.tarea_id)
    } catch (err) {
      setError(err.message || 'No se pudo iniciar el bootstrap.')
    }
  }

  const ejecutando = tarea && tarea.estado !== 'completado' && tarea.estado !== 'error'

  return (
    <section style={{ marginBottom: '2rem' }}>
      <h2 style={{ fontSize: 14, fontWeight: 500, color: S.textoP, marginBottom: 12 }}>
        Bootstrap de conocimiento institucional
      </h2>
      <p style={{ fontSize: 13, color: S.textoS, marginBottom: 10, maxWidth: 560 }}>
        Extrae reglas de negocio, patrones de entrevista y actores institucionales
        desde la base anterior (agente_po_proyectos, solo lectura) y los indexa en
        ChromaDB para que MARVIN los use como contexto.
      </p>
      <button
        type="button"
        onClick={ejecutar}
        disabled={ejecutando}
        style={S.btnPrimario}
      >
        {ejecutando ? 'Ejecutando…' : '▶ Ejecutar bootstrap'}
      </button>
      {error && (
        <p style={{ fontSize: 12, color: '#991B1B', marginTop: 8 }}>{error}</p>
      )}
      {tarea && (
        <div style={{ ...S.card, marginTop: 10, maxWidth: 560 }}>
          <div style={{ fontSize: 13, color: S.textoP, marginBottom: 4 }}>
            Estado: <strong>{tarea.estado}</strong>
            {typeof tarea.progreso === 'number' && ` — ${tarea.progreso}%`}
          </div>
          {tarea.estado === 'error' && (
            <div style={{ fontSize: 12, color: '#991B1B' }}>
              {tarea.error || 'Error desconocido durante el bootstrap.'}
            </div>
          )}
          {tarea.estado === 'completado' && tarea.resultado && (
            <pre style={{
              fontSize: 11, color: S.textoS, whiteSpace: 'pre-wrap',
              marginTop: 6, maxHeight: 200, overflow: 'auto',
            }}>
              {typeof tarea.resultado === 'string' ? tarea.resultado : JSON.stringify(tarea.resultado, null, 2)}
            </pre>
          )}
        </div>
      )}
    </section>
  )
}

export default function Configuracion() {
  return (
    <div>
      <div style={S.pageHeader}>
        <h1 style={S.pageTitle}>Configuración</h1>
      </div>
      <div style={S.seccion}>
        <SeccionSalud />
        <SeccionConfiguracion />
        <SeccionBootstrap />

        <details style={{ marginTop: '1.5rem' }}>
          <summary style={{
            fontSize: 13, fontWeight: 600, color: S.textoP,
            cursor: 'pointer', padding: '10px 0',
            borderTop: `.5px solid ${S.borde}`,
            listStyle: 'none', display: 'flex',
            alignItems: 'center', gap: 6,
          }}>
            🎙 Personalidad de MARVIN
            <span style={{ fontSize: 10, color: S.textoM, fontWeight: 400 }}>
              — frases editables por evento
            </span>
          </summary>
          <div style={{ paddingTop: 8 }}>
            <MarvinConfig />
          </div>
        </details>
      </div>
    </div>
  )
}
