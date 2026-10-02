import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { S } from '../styles'

const TIPOS_REQUERIMIENTO = ['nuevo', 'mejora', 'modificacion', 'apendice']
const TIPOS_INFO = [
  { valor: 'nuevo', label: 'Nuevo', desc: 'No existe nada previo' },
  { valor: 'mejora', label: 'Mejora', desc: 'Mejora algo existente' },
  { valor: 'modificacion', label: 'Modificación', desc: 'Cambio puntual' },
  { valor: 'apendice', label: 'Apéndice', desc: 'Sistema externo' },
]
const MAX_ARCHIVOS = 5
const MAX_PESO_BYTES = 10 * 1024 * 1024 // 10MB

// Fuera del componente — no depende de state
const formatBytes = (bytes) => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function NuevoRequerimiento() {
  const navigate = useNavigate()
  const [nombre, setNombre] = useState('')
  const [tipo, setTipo] = useState(TIPOS_REQUERIMIENTO[0])
  const [descripcion, setDescripcion] = useState('')
  const [archivos, setArchivos] = useState([])
  const [error, setError] = useState(null)
  const [isDragging, setIsDragging] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [mensajeExito, setMensajeExito] = useState(null)
  const [esPrueba, setEsPrueba] = useState(false)

  // Función pura de acumulación — usada tanto en onChange como en onDrop.
  // Corrige el bug de sobreescritura: concatena en vez de reemplazar,
  // deduplica por nombre de archivo y respeta el límite máximo.
  const acumularArchivos = (prev, nuevos) => {
    const combinados = [...prev, ...nuevos]
    const unicos = combinados.filter(
      (f, idx, arr) => arr.findIndex((x) => x.name === f.name) === idx
    )

    const pesados = unicos.filter((f) => f.size > MAX_PESO_BYTES)
    if (pesados.length > 0) {
      setError(`Archivo muy pesado: ${pesados[0].name} (máx 10MB)`)
      return prev
    }

    if (unicos.length > MAX_ARCHIVOS) {
      setError(`Máximo ${MAX_ARCHIVOS} archivos permitidos`)
      return unicos.slice(0, MAX_ARCHIVOS)
    }

    setError(null)
    return unicos
  }

  const handleInputChange = (e) => {
    const nuevos = Array.from(e.target.files)
    setArchivos((prev) => acumularArchivos(prev, nuevos))
    e.target.value = '' // permite volver a seleccionar el mismo archivo
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setIsDragging(false)
    const nuevos = Array.from(e.dataTransfer.files)
    setArchivos((prev) => acumularArchivos(prev, nuevos))
  }

  const handleDragOver = (e) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = () => {
    setIsDragging(false)
  }

  const quitarArchivo = (nombreArchivo) => {
    setArchivos((prev) => prev.filter((f) => f.name !== nombreArchivo))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    setMensajeExito(null)
    setEnviando(true)

    try {
      const formData = new FormData()
      formData.append('nombre', nombre)
      formData.append('tipo', tipo)
      formData.append('descripcion', descripcion)
      formData.append('es_prueba', esPrueba ? '1' : '0')
      archivos.forEach((archivo) => {
        formData.append('archivos', archivo)
      })

      const respuesta = await fetch('/api/v2/requerimientos', {
        method: 'POST',
        body: formData,
      })

      if (!respuesta.ok) {
        throw new Error(`Error del servidor (${respuesta.status})`)
      }

      const data = await respuesta.json()
      setMensajeExito('Requerimiento creado correctamente. Abriendo entrevista…')
      setNombre('')
      setTipo(TIPOS_REQUERIMIENTO[0])
      setDescripcion('')
      setArchivos([])
      setEsPrueba(false)

      if (data?.id) {
        navigate(`/entrevista/${data.id}`)
      }
    } catch (err) {
      setError(
        `No se pudo crear el requerimiento: ${err.message || 'error desconocido'}`
      )
    } finally {
      setEnviando(false)
    }
  }

  const labelStyle = { display: 'block', marginBottom: 6, fontSize: 12, color: S.textoS }

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', ...S.seccion }}>
      <h1 style={S.pageTitle}>Nuevo requerimiento</h1>

      <form onSubmit={handleSubmit}>
        <div style={{ marginTop: '1.25rem', marginBottom: '1.25rem' }}>
          <label htmlFor="nombre" style={labelStyle}>
            Nombre del requerimiento
          </label>
          <input
            id="nombre"
            type="text"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            required
            style={S.input}
          />
        </div>

        <div style={{ marginBottom: '1.25rem' }}>
          <label style={labelStyle}>Tipo</label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {TIPOS_INFO.map((t) => (
              <button
                key={t.valor}
                type="button"
                onClick={() => setTipo(t.valor)}
                style={{
                  padding: '10px 14px',
                  borderRadius: 8,
                  border: '1px solid #E2E8F0',
                  cursor: 'pointer',
                  textAlign: 'left',
                  background: t.valor === tipo ? '#EFF6FF' : '#fff',
                  borderColor: t.valor === tipo ? '#2563EB' : '#E2E8F0',
                }}
              >
                <div style={{ fontWeight: 500, fontSize: 13, color: '#1E293B' }}>
                  {t.label}
                </div>
                <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 2 }}>
                  {t.desc}
                </div>
              </button>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: '1.25rem' }}>
          <label htmlFor="descripcion" style={labelStyle}>
            Descripción
          </label>
          <textarea
            id="descripcion"
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            rows={4}
            style={{ ...S.input, minHeight: 80, resize: 'vertical' }}
          />
        </div>

        <div style={{ marginBottom: '1.25rem' }}>
          <label style={{ ...labelStyle, marginBottom: 8 }}>
            Archivos adjuntos ({archivos.length}/{MAX_ARCHIVOS} archivos)
          </label>

          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            style={{
              border: `2px dashed ${isDragging ? S.acento : S.borde}`,
              backgroundColor: isDragging ? '#EFF6FF' : S.fondo,
              borderRadius: 12,
              padding: '2rem',
              textAlign: 'center',
              marginBottom: '0.75rem',
              transition: 'border-color 0.15s, background-color 0.15s',
            }}
          >
            <p style={{ margin: 0, fontSize: 13, color: S.textoS }}>
              Arrastra y suelta archivos aquí, o selecciónalos
            </p>
            <input
              type="file"
              multiple
              onChange={handleInputChange}
              style={{ marginTop: '0.75rem', fontSize: 13 }}
            />
          </div>

          {archivos.length > 0 && (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {archivos.map((archivo) => (
                <li
                  key={archivo.name}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '8px 0',
                    borderBottom: `1px solid ${S.borde}`,
                    fontSize: 13,
                    color: S.textoP,
                  }}
                >
                  <span>
                    {archivo.name} — {formatBytes(archivo.size)}
                  </span>
                  <button
                    type="button"
                    onClick={() => quitarArchivo(archivo.name)}
                    style={S.btnSecundario}
                  >
                    Quitar
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Checkbox discreto, sin jerarquía visual dominante */}
        <label style={{
          display: 'flex', alignItems: 'center', gap: 6,
          marginBottom: '1.25rem', cursor: 'pointer',
        }}>
          <input
            type="checkbox"
            checked={esPrueba}
            onChange={(e) => setEsPrueba(e.target.checked)}
          />
          <span style={{ fontSize: 12, color: S.textoM }}>
            Este es un proyecto de prueba (no indexa en ChromaDB)
          </span>
        </label>

        {error && (
          <p style={{ color: '#DC2626', marginBottom: '1rem', fontSize: 13 }}>{error}</p>
        )}
        {mensajeExito && (
          <p style={{ color: '#16A34A', marginBottom: '1rem', fontSize: 13 }}>
            {mensajeExito}
          </p>
        )}

        <button type="submit" disabled={enviando} style={S.btnPrimario}>
          {enviando ? 'Creando...' : 'Crear requerimiento'}
        </button>
      </form>
    </div>
  )
}
