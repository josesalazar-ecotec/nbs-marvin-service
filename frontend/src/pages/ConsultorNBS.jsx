import { useEffect, useState } from 'react'
import { S } from '../styles'

// Página del Agente Arquitecto (Sprint G) — dos modos:
//  - CONSULTA: solo lectura contra `POST /api/v2/consultor/consultar`
//  - DISEÑO: genera propuestas vía `POST /api/v2/consultor/disenar`,
//    guardadas EXCLUSIVAMENTE en MySQL (`propuestas_diseno`). Nunca se
//    aplican automáticamente al sistema ni se indexan en ChromaDB.
//
// REGLA: ningún estilo usa `position: fixed` en este componente.

const OPCIONES_SCOPE = [
  { value: 'todo', label: 'Todo' },
  { value: 'backend', label: 'Backend PHP' },
  { value: 'frontend', label: 'Frontend TSX' },
  { value: 'bd', label: 'BD' },
  { value: 'integraciones', label: 'Integraciones' },
]

const OPCIONES_TIPO_DISENO = [
  { value: 'endpoint', label: 'Endpoint' },
  { value: 'componente', label: 'Componente' },
  { value: 'tabla_bd', label: 'Tabla BD' },
  { value: 'flujo', label: 'Flujo' },
  { value: 'integracion', label: 'Integración' },
]

const ADVERTENCIA_DISENO_TEXTO =
  '⚠️ Propuesta — no aplicada al sistema. Requiere tu aprobación.'

function BannerAdvertenciaDiseno() {
  return (
    <div
      style={{
        backgroundColor: '#FEF3C7',
        color: '#92400E',
        border: '1px solid #FDE68A',
        borderRadius: 8,
        padding: '0.75rem 1rem',
        marginBottom: '1rem',
        fontWeight: 600,
        fontSize: 13,
      }}
    >
      {ADVERTENCIA_DISENO_TEXTO}
    </div>
  )
}

function TabConsulta() {
  const [scope, setScope] = useState('todo')
  const [pregunta, setPregunta] = useState('')
  const [resultado, setResultado] = useState(null)
  const [cargando, setCargando] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [pendienteGuardado, setPendienteGuardado] = useState(false)

  async function consultar() {
    if (!pregunta.trim()) return
    setCargando(true)
    setErrorMsg('')
    setResultado(null)
    setPendienteGuardado(false)
    try {
      const resp = await fetch('/api/v2/consultor/consultar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pregunta, scope }),
      })
      const data = await resp.json()
      setResultado(data)
    } catch (e) {
      setErrorMsg('No fue posible consultar en este momento. Intenta de nuevo.')
    } finally {
      setCargando(false)
    }
  }

  async function marcarPendiente() {
    if (!pregunta.trim()) return
    try {
      const resp = await fetch('/api/v2/consultor/pendiente', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pregunta }),
      })
      if (resp.ok) {
        setPendienteGuardado(true)
      }
    } catch (e) {
      // Silencioso: no bloquea la UI si falla el registro del pendiente.
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        <select
          value={scope}
          onChange={(e) => setScope(e.target.value)}
          style={{ ...S.input, width: 'fit-content' }}
        >
          {OPCIONES_SCOPE.map((op) => (
            <option key={op.value} value={op.value}>
              {op.label}
            </option>
          ))}
        </select>
        <input
          type="text"
          placeholder="Escribe tu pregunta sobre el código NBS..."
          value={pregunta}
          onChange={(e) => setPregunta(e.target.value)}
          style={{ ...S.input, flex: 1, minWidth: 260 }}
        />
        <button onClick={consultar} disabled={cargando || !pregunta.trim()} style={S.btnPrimario}>
          {cargando ? 'Consultando...' : 'Consultar'}
        </button>
      </div>

      {errorMsg && <p style={{ color: '#DC2626', fontSize: 13 }}>{errorMsg}</p>}

      {resultado && (
        <div style={{ ...S.card, marginTop: '0.5rem' }}>
          {resultado.contexto_disponible === false && (
            <p style={{ color: '#92400E', fontWeight: 600, fontSize: 13 }}>
              Sin contexto NBS disponible (MCP RAG no respondió). Respuesta degradada.
            </p>
          )}
          <p style={{ whiteSpace: 'pre-wrap', fontSize: 13, color: S.textoP }}>{resultado.respuesta}</p>
          {(resultado.fuente || resultado.similitud) && (
            <p style={{ fontSize: 12, color: S.textoS }}>
              Fuente: {resultado.fuente ?? 'N/D'} | Similitud: {resultado.similitud ?? 'N/D'}
            </p>
          )}
          <button
            onClick={marcarPendiente}
            disabled={pendienteGuardado}
            style={{ ...S.btnSecundario, marginTop: '0.5rem' }}
          >
            {pendienteGuardado ? 'Marcado como pendiente' : 'Marcar como pendiente'}
          </button>
        </div>
      )}
    </div>
  )
}

function TabDiseno() {
  const [tipo, setTipo] = useState(OPCIONES_TIPO_DISENO[0].value)
  const [descripcion, setDescripcion] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [ultimaRespuesta, setUltimaRespuesta] = useState(null)
  const [propuestas, setPropuestas] = useState([])
  const [cargandoLista, setCargandoLista] = useState(false)

  async function cargarPropuestas() {
    setCargandoLista(true)
    try {
      const resp = await fetch('/api/v2/consultor/propuestas')
      const data = await resp.json()
      setPropuestas(Array.isArray(data) ? data : [])
    } catch (e) {
      setPropuestas([])
    } finally {
      setCargandoLista(false)
    }
  }

  useEffect(() => {
    cargarPropuestas()
  }, [])

  async function guardarPropuesta() {
    if (!descripcion.trim()) return
    setGuardando(true)
    setUltimaRespuesta(null)
    try {
      const resp = await fetch('/api/v2/consultor/disenar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ descripcion, tipo }),
      })
      const data = await resp.json()
      setUltimaRespuesta(data)
      await cargarPropuestas()
    } catch (e) {
      setUltimaRespuesta({ error: 'No fue posible guardar la propuesta en este momento.' })
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div>
      <BannerAdvertenciaDiseno />

      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        <select
          value={tipo}
          onChange={(e) => setTipo(e.target.value)}
          style={{ ...S.input, width: 'fit-content' }}
        >
          {OPCIONES_TIPO_DISENO.map((op) => (
            <option key={op.value} value={op.value}>
              {op.label}
            </option>
          ))}
        </select>
        <textarea
          placeholder="Describe la necesidad a diseñar..."
          value={descripcion}
          onChange={(e) => setDescripcion(e.target.value)}
          rows={3}
          style={{ ...S.input, flex: 1, minWidth: 260, resize: 'vertical' }}
        />
        <button onClick={guardarPropuesta} disabled={guardando || !descripcion.trim()} style={S.btnPrimario}>
          {guardando ? 'Guardando...' : 'Guardar propuesta'}
        </button>
      </div>

      {ultimaRespuesta && (
        <div style={{ ...S.card, marginBottom: '1rem' }}>
          {ultimaRespuesta.error && <p style={{ color: '#DC2626', fontSize: 13 }}>{ultimaRespuesta.error}</p>}
          {ultimaRespuesta.contenido && (
            <p style={{ whiteSpace: 'pre-wrap', fontSize: 13, color: S.textoP }}>{ultimaRespuesta.contenido}</p>
          )}
          {ultimaRespuesta.advertencia && (
            <p style={{ fontWeight: 600, color: '#92400E', fontSize: 13 }}>{ultimaRespuesta.advertencia}</p>
          )}
        </div>
      )}

      <h3 style={{ fontSize: 14, fontWeight: 500, color: S.textoP }}>Propuestas guardadas</h3>
      {cargandoLista && <p style={{ fontSize: 13, color: S.textoS }}>Cargando...</p>}
      {!cargandoLista && propuestas.length === 0 && (
        <p style={{ fontSize: 13, color: S.textoM }}>No hay propuestas guardadas todavía.</p>
      )}
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {propuestas.map((p) => (
          <li key={p.id} style={{ ...S.card, marginBottom: 8, padding: '0.75rem 1rem' }}>
            <strong style={{ fontSize: 13, color: S.textoP }}>[{p.tipo}]</strong>{' '}
            <span style={{ fontSize: 13, color: S.textoP }}>
              {p.titulo || (p.contenido ? String(p.contenido).slice(0, 80) : 'Sin título')}
            </span>
            <div style={{ fontSize: 12, color: S.textoS, marginTop: 4 }}>
              Estado: {p.aprobado ? 'Aprobado' : 'Pendiente de aprobación'} | Creado: {p.created_at}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default function ConsultorNBS() {
  const [tabActiva, setTabActiva] = useState('consulta')

  return (
    <div>
      <div style={S.pageHeader}>
        <h1 style={S.pageTitle}>Consultor / Arquitecto NBS</h1>
      </div>

      <div style={S.seccion}>
        <div
          style={{
            display: 'flex',
            gap: 4,
            padding: 4,
            background: '#F1F5F9',
            borderRadius: 10,
            width: 'fit-content',
            marginBottom: '1.25rem',
          }}
        >
          <button onClick={() => setTabActiva('consulta')} style={S.tab(tabActiva === 'consulta')}>
            Consulta
          </button>
          <button onClick={() => setTabActiva('diseno')} style={S.tab(tabActiva === 'diseno')}>
            Diseño
          </button>
        </div>

        {tabActiva === 'consulta' ? <TabConsulta /> : <TabDiseno />}
      </div>
    </div>
  )
}
