import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { FolderOpen } from 'lucide-react'
import { useRequerimientoActivo } from '../context/RequerimientoActivoContext'
import { S } from '../styles'

const BADGE_ESTADO = {
  borrador: { bg: '#F1F5F9', color: '#64748B', label: 'Borrador' },
  entrevista_en_proceso: { bg: '#DBEAFE', color: '#1D4ED8', label: 'Entrevista en proceso' },
  entrevista_realizada: { bg: '#CFFAFE', color: '#0E7490', label: 'Entrevista realizada' },
  levantamiento_completado: { bg: '#DCFCE7', color: '#166534', label: 'Levantamiento completado' },
  en_desarrollo: { bg: '#FFEDD5', color: '#9A3412', label: 'En desarrollo' },
  completado: { bg: '#D1FAE5', color: '#065F46', label: 'Completado' },
  cancelado: { bg: '#FEE2E2', color: '#991B1B', label: 'Cancelado' },
}

function BadgeEstado({ estado }) {
  const info = BADGE_ESTADO[estado] || { bg: '#F1F5F9', color: '#64748B', label: estado }
  return <span style={S.badge(info.bg, info.color)}>{info.label}</span>
}

function CardRequerimiento({ requerimiento, onAbrir }) {
  const [hover, setHover] = useState(false)
  const docsAprobados = requerimiento.documentos_aprobados ?? 0
  const docsTotal = requerimiento.documentos_total ?? 7
  const porcentaje = Math.round((docsAprobados / docsTotal) * 100)

  return (
    <div
      onClick={() => onAbrir(requerimiento)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        ...S.card,
        cursor: 'pointer',
        transition: 'box-shadow 0.15s',
        boxShadow: hover ? '0 4px 12px rgba(0,0,0,0.08)' : 'none',
      }}
    >
      <div style={{ fontSize: 11, color: S.textoM, fontFamily: 'monospace' }}>
        {requerimiento.codigo}
      </div>
      <div style={{ fontSize: 14, fontWeight: 500, color: S.textoP, marginBottom: 10 }}>
        {requerimiento.nombre}
      </div>
      <div style={{ marginBottom: 12 }}>
        <BadgeEstado estado={requerimiento.estado_ciclo} />
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: 10,
          color: S.textoM,
          marginBottom: 4,
        }}
      >
        <span>Documentos</span>
        <span>{docsAprobados}/{docsTotal}</span>
      </div>
      <div style={{ height: 4, borderRadius: 4, background: '#F1F5F9' }}>
        <div
          style={{
            height: 4,
            borderRadius: 4,
            background: S.acento,
            width: `${porcentaje}%`,
          }}
        />
      </div>
    </div>
  )
}

export default function Dashboard() {
  const [requerimientos, setRequerimientos] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)
  const { setRequerimientoActivo } = useRequerimientoActivo()
  const navigate = useNavigate()

  useEffect(() => {
    cargarRequerimientos()
  }, [])

  async function cargarRequerimientos() {
    setCargando(true)
    setError(null)
    try {
      const resp = await fetch('/api/v2/requerimientos')
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      const data = await resp.json()
      setRequerimientos(Array.isArray(data) ? data : [])
    } catch (err) {
      setError('No se pudo cargar la lista de requerimientos.')
      setRequerimientos([])
    } finally {
      setCargando(false)
    }
  }

  function seleccionar(requerimiento) {
    setRequerimientoActivo({
      id: requerimiento.id,
      nombre: requerimiento.nombre,
      codigo: requerimiento.codigo,
    })
    navigate(`/entrevista/${requerimiento.id}`)
  }

  return (
    <div>
      <div style={S.pageHeader}>
        <h1 style={S.pageTitle}>Requerimientos</h1>
        <Link to="/requerimientos/nuevo" style={S.btnPrimario}>
          + Nuevo requerimiento
        </Link>
      </div>

      {cargando && (
        <p style={{ ...S.seccion, fontSize: 13, color: S.textoS }}>Cargando requerimientos…</p>
      )}
      {error && <p style={{ ...S.seccion, fontSize: 13, color: '#DC2626' }}>{error}</p>}

      {!cargando && !error && requerimientos.length === 0 && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '5rem 1.5rem',
            textAlign: 'center',
          }}
        >
          <FolderOpen size={48} color="#CBD5E0" />
          <p style={{ marginTop: 12, fontSize: 13, color: S.textoM }}>
            No hay requerimientos todavía
          </p>
          <Link to="/requerimientos/nuevo" style={{ ...S.btnPrimario, marginTop: 16 }}>
            Crear primer requerimiento
          </Link>
        </div>
      )}

      {!cargando && requerimientos.length > 0 && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: 16,
            padding: '0 1.5rem 1.5rem',
          }}
        >
          {requerimientos.map((r) => (
            <CardRequerimiento key={r.id} requerimiento={r} onAbrir={seleccionar} />
          ))}
        </div>
      )}
    </div>
  )
}
