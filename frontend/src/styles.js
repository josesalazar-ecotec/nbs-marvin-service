// Sistema de estilos unificado -- NBS Platform v2.0 (Diseño Propuesta A).
// Objeto de constantes reutilizables para style inline consistente en toda
// la app. Ver components/Navbar.jsx y App.jsx para el layout raiz (esos ya
// quedaron fijos con style inline puro tras el fix de Tailwind).

export const S = {
  // Colores
  azul: '#1B3A6B',
  acento: '#2563EB',
  acentoHover: '#1D4ED8',
  fondo: '#F8FAFC',
  blanco: '#FFFFFF',
  borde: '#E2E8F0',
  textoP: '#1E293B',
  textoS: '#64748B',
  textoM: '#94A3B8',

  // Componentes reutilizables
  card: {
    background: '#FFFFFF',
    border: '0.5px solid #E2E8F0',
    borderRadius: 12,
    padding: '1.25rem',
  },
  input: {
    width: '100%',
    border: '1px solid #E2E8F0',
    borderRadius: 8,
    padding: '9px 13px',
    fontSize: 13,
    color: '#1E293B',
    background: '#FFFFFF',
    outline: 'none',
  },
  btnPrimario: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    background: '#2563EB',
    color: '#FFFFFF',
    border: 'none',
    borderRadius: 8,
    padding: '8px 16px',
    fontSize: 13,
    cursor: 'pointer',
  },
  btnSecundario: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    background: '#FFFFFF',
    color: '#374151',
    border: '1px solid #E2E8F0',
    borderRadius: 8,
    padding: '8px 14px',
    fontSize: 13,
    cursor: 'pointer',
  },
  badge: (bg, color) => ({
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    padding: '3px 10px',
    borderRadius: 20,
    fontSize: 10,
    fontWeight: 500,
    background: bg,
    color: color,
  }),
  seccion: {
    padding: '1.5rem',
  },
  separador: {
    borderTop: '0.5px solid #E2E8F0',
    margin: '1rem 0',
  },
  tab: (activo) => ({
    padding: '6px 16px',
    borderRadius: 8,
    fontSize: 13,
    cursor: 'pointer',
    border: 'none',
    background: activo ? '#2563EB' : 'transparent',
    color: activo ? '#FFFFFF' : '#64748B',
    fontWeight: activo ? 500 : 400,
  }),
  pageHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '1.25rem 1.5rem',
    background: '#FFFFFF',
    borderBottom: '0.5px solid #E2E8F0',
  },
  pageTitle: {
    fontSize: 15,
    fontWeight: 500,
    color: '#0F172A',
  },
}
