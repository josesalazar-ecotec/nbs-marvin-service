import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import {
  ClipboardList,
  MessageSquare,
  FileText,
  GitBranch,
  Search,
  Database,
  Settings,
} from 'lucide-react'
import { useRequerimientoActivo } from '../context/RequerimientoActivoContext'

const ITEMS_SIEMPRE_VISIBLES = [
  { to: '/', icono: ClipboardList, label: 'Requerimientos', exact: true },
  { to: '/consultor', icono: Search, label: 'Consultor NBS' },
  { to: '/modelos', icono: Database, label: 'Modelos de Datos' },
]

function itemsContextuales(requerimientoId) {
  return [
    { to: `/entrevista/${requerimientoId}`, icono: MessageSquare, label: 'Entrevista' },
    { to: `/documentos/${requerimientoId}`, icono: FileText, label: 'Documentos' },
    { to: `/jira/${requerimientoId}`, icono: GitBranch, label: 'Jira' },
  ]
}

function ItemNav({ to, icono: Icono, label, exact }) {
  const [hover, setHover] = useState(false)

  return (
    <NavLink
      to={to}
      end={exact}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={({ isActive }) => ({
        display: 'flex',
        alignItems: 'center',
        gap: '0.6rem',
        margin: '2px 8px',
        padding: isActive ? '8px 12px 8px 9px' : '8px 12px',
        borderRadius: 6,
        fontSize: 14,
        textDecoration: 'none',
        color: isActive ? '#fff' : 'rgba(255,255,255,0.6)',
        background: isActive
          ? '#2563EB'
          : hover
          ? 'rgba(255,255,255,0.07)'
          : 'transparent',
        borderLeft: isActive ? '3px solid #93C5FD' : '3px solid transparent',
        transition: 'background-color 0.12s',
      })}
    >
      <Icono size={17} strokeWidth={2} />
      <span>{label}</span>
    </NavLink>
  )
}

export default function Navbar({ onAcercaDe }) {
  const { requerimientoActivo } = useRequerimientoActivo()
  const [hoverAcerca, setHoverAcerca] = useState(false)

  return (
    <nav
      style={{
        width: '220px',
        minHeight: '100vh',
        background: '#1B3A6B',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        flexShrink: 0,
      }}
    >
      <div>
        {/* Logo */}
        <div
          style={{
            padding: '1.25rem 1rem 1rem',
            borderBottom: '1px solid rgba(255,255,255,0.1)',
          }}
        >
          <div>
            <span style={{ fontSize: 22, fontWeight: 700, color: '#fff' }}>NBS</span>
            <sup style={{ fontSize: 10, color: '#93C5FD', marginLeft: 2, fontWeight: 700 }}>
              PO
            </sup>
          </div>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>
            Platform v2.0
          </div>
        </div>

        {/* Items siempre visibles */}
        <div style={{ marginTop: 12 }}>
          {ITEMS_SIEMPRE_VISIBLES.map((item) => (
            <ItemNav key={item.to} {...item} />
          ))}
        </div>

        {/* Items contextuales -- solo con requerimiento activo */}
        {requerimientoActivo && (
          <div
            style={{
              marginTop: 16,
              paddingTop: 12,
              borderTop: '1px solid rgba(255,255,255,0.1)',
            }}
          >
            <div
              style={{
                padding: '0 16px 4px',
                fontSize: 10,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                color: 'rgba(255,255,255,0.35)',
              }}
            >
              {requerimientoActivo.codigo || 'Requerimiento activo'}
            </div>
            {itemsContextuales(requerimientoActivo.id).map((item) => (
              <ItemNav key={item.to} {...item} />
            ))}
          </div>
        )}
      </div>

      {/* Configuración + Acerca de -- al fondo */}
      <div
        style={{
          paddingTop: 4,
          paddingBottom: 12,
          borderTop: '1px solid rgba(255,255,255,0.1)',
        }}
      >
        <ItemNav to="/configuracion" icono={Settings} label="Configuración" />
        <button
          type="button"
          onClick={onAcercaDe}
          onMouseEnter={() => setHoverAcerca(true)}
          onMouseLeave={() => setHoverAcerca(false)}
          style={{
            display: 'block',
            width: '100%',
            textAlign: 'left',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: '8px 20px 0',
            fontSize: 10,
            color: hoverAcerca ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.3)',
          }}
        >
          Acerca de
        </button>
      </div>
    </nav>
  )
}
