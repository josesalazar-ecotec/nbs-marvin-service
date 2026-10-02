import { useEffect, useState } from 'react'

// Actualizado en Sprint H (ensamblaje): `routes/jira.py` ya tiene la
// implementacion real desde Sprint F, con el ticket_key como path param:
// GET /api/v2/jira/tickets/<proyecto_id> (no query param). Se corrige aqui
// el mismatch que quedo de cuando este componente se escribio en Sprint E,
// antes de que el endpoint real existiera.
const ENDPOINT_TICKETS = (proyectoId) =>
  `/api/v2/jira/tickets/${proyectoId}`

const UMBRAL_PROXIMO_VENCIMIENTO_DIAS = 3
const UMBRAL_SYNC_DESACTUALIZADA_HORAS = 2

// `dias_vencido` viene YA calculado desde el backend (columna calculada por
// jira_service.py, Sprint F). El frontend NUNCA debe recalcularlo: solo lo
// lee del JSON y lo usa para decidir si pinta la badge roja.
function BadgeVencido({ diasVencido }) {
  if (!diasVencido || diasVencido <= 0) return null
  return (
    <span
      style={{
        backgroundColor: '#c0392b',
        color: '#fff',
        borderRadius: 4,
        padding: '0.1rem 0.45rem',
        fontSize: '0.75rem',
        marginLeft: '0.4rem',
      }}
    >
      Vencido ({diasVencido}d)
    </span>
  )
}

// Esta condición ("por vencer en <= 3 días") SÍ es un cálculo de UI en el
// frontend, distinto de `dias_vencido` (que el backend calcula solo para
// tickets YA vencidos). Se compara `fecha_fin_estimada` contra la fecha
// actual del cliente con `new Date()`.
function proximoAVencer(fechaFinEstimada, diasVencido) {
  if (!fechaFinEstimada) return false
  if (diasVencido && diasVencido > 0) return false // ya vencido, no "por vencer"
  const fin = new Date(fechaFinEstimada)
  if (Number.isNaN(fin.getTime())) return false
  const ahora = new Date()
  const msPorDia = 1000 * 60 * 60 * 24
  const diasRestantes = (fin.getTime() - ahora.getTime()) / msPorDia
  return diasRestantes >= 0 && diasRestantes <= UMBRAL_PROXIMO_VENCIMIENTO_DIAS
}

function BadgeProximoAVencer({ fechaFinEstimada, diasVencido }) {
  if (!proximoAVencer(fechaFinEstimada, diasVencido)) return null
  return (
    <span
      style={{
        backgroundColor: '#f1c40f',
        color: '#5c4400',
        borderRadius: 4,
        padding: '0.1rem 0.45rem',
        fontSize: '0.75rem',
        marginLeft: '0.4rem',
      }}
    >
      Por vencer
    </span>
  )
}

// Última sincronización desactualizada (> 2 horas): comparación de UI en
// frontend con `new Date()`, no viene calculada del backend.
function sincronizacionDesactualizada(ultimaSincronizacion) {
  if (!ultimaSincronizacion) return false
  const fecha = new Date(ultimaSincronizacion)
  if (Number.isNaN(fecha.getTime())) return false
  const horas = (Date.now() - fecha.getTime()) / (1000 * 60 * 60)
  return horas > UMBRAL_SYNC_DESACTUALIZADA_HORAS
}

function CeldaUltimaSync({ ultimaSincronizacion }) {
  const desactualizada = sincronizacionDesactualizada(ultimaSincronizacion)
  return (
    <span>
      {ultimaSincronizacion || '-'}
      {desactualizada && (
        <span
          style={{
            backgroundColor: '#e67e22',
            color: '#fff',
            borderRadius: 4,
            padding: '0.1rem 0.45rem',
            fontSize: '0.75rem',
            marginLeft: '0.4rem',
          }}
        >
          Desactualizada
        </span>
      )}
    </span>
  )
}

export default function PanelJira({ proyectoId }) {
  const [tickets, setTickets] = useState([])
  const [cargando, setCargando] = useState(true)
  const [sinDatos, setSinDatos] = useState(false)

  useEffect(() => {
    let cancelado = false

    const cargarTickets = async () => {
      setCargando(true)
      setSinDatos(false)
      try {
        const resp = await fetch(ENDPOINT_TICKETS(proyectoId))
        if (!resp.ok) {
          // Esperado mientras el Sprint F no exista: 404 u otro error.
          if (!cancelado) {
            setTickets([])
            setSinDatos(true)
          }
          return
        }
        const data = await resp.json()
        const lista = Array.isArray(data) ? data : data.tickets || []
        if (!cancelado) {
          setTickets(lista)
          setSinDatos(lista.length === 0)
        }
      } catch {
        // Fallo de red / endpoint inexistente: no romper la página.
        if (!cancelado) {
          setTickets([])
          setSinDatos(true)
        }
      } finally {
        if (!cancelado) setCargando(false)
      }
    }

    if (proyectoId) {
      cargarTickets()
    } else {
      setCargando(false)
      setSinDatos(true)
    }

    return () => {
      cancelado = true
    }
  }, [proyectoId])

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '1.5rem' }}>
      <h1>Panel Jira</h1>

      {cargando ? (
        <p>Cargando tickets…</p>
      ) : sinDatos ? (
        <p style={{ color: '#666' }}>Aún no hay tickets Jira asociados.</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '2px solid #ccc' }}>
                <th style={{ padding: '0.5rem' }}>Ticket</th>
                <th style={{ padding: '0.5rem' }}>Título</th>
                <th style={{ padding: '0.5rem' }}>Tipo</th>
                <th style={{ padding: '0.5rem' }}>Estado</th>
                <th style={{ padding: '0.5rem' }}>Asignado</th>
                <th style={{ padding: '0.5rem' }}>Inicio</th>
                <th style={{ padding: '0.5rem' }}>Vence</th>
                <th style={{ padding: '0.5rem' }}>Días vencido</th>
                <th style={{ padding: '0.5rem' }}>Última sync</th>
              </tr>
            </thead>
            <tbody>
              {tickets.map((ticket) => (
                <tr key={ticket.id ?? ticket.ticket_key} style={{ borderBottom: '1px solid #eee' }}>
                  <td style={{ padding: '0.5rem' }}>
                    {ticket.ticket_url ? (
                      <a href={ticket.ticket_url} target="_blank" rel="noreferrer">
                        {ticket.ticket_key}
                      </a>
                    ) : (
                      ticket.ticket_key
                    )}
                  </td>
                  <td style={{ padding: '0.5rem' }}>{ticket.titulo}</td>
                  <td style={{ padding: '0.5rem' }}>{ticket.tipo}</td>
                  <td style={{ padding: '0.5rem' }}>{ticket.estado}</td>
                  <td style={{ padding: '0.5rem' }}>{ticket.asignado}</td>
                  <td style={{ padding: '0.5rem' }}>{ticket.fecha_inicio || '-'}</td>
                  <td style={{ padding: '0.5rem' }}>
                    {ticket.fecha_fin_estimada || '-'}
                    <BadgeProximoAVencer
                      fechaFinEstimada={ticket.fecha_fin_estimada}
                      diasVencido={ticket.dias_vencido}
                    />
                  </td>
                  <td style={{ padding: '0.5rem' }}>
                    {ticket.dias_vencido ?? 0}
                    <BadgeVencido diasVencido={ticket.dias_vencido} />
                  </td>
                  <td style={{ padding: '0.5rem' }}>
                    <CeldaUltimaSync ultimaSincronizacion={ticket.ultima_sincronizacion} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
