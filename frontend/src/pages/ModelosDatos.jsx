import { useEffect, useState } from 'react'
import { S } from '../styles'

const MAX_PESO_BYTES = 10 * 1024 * 1024 // 10MB

const TIPOS_ORDEN = ['tabla', 'vista', 'indice', 'funcion', 'procedimiento', 'foreign_key']
const ETIQUETAS_TIPO = {
  tabla: 'Tablas',
  vista: 'Vistas',
  indice: 'Índices',
  funcion: 'Funciones',
  procedimiento: 'Procedimientos',
  foreign_key: 'Foreign Keys',
}

function ModelosDatos() {
  const [archivo, setArchivo] = useState(null)
  const [baseDatos, setBaseDatos] = useState('')
  const [moduloNbs, setModuloNbs] = useState('')
  const [error, setError] = useState('')
  const [cargando, setCargando] = useState(false)
  const [isDragging, setIsDragging] = useState(false)

  const [basesDatos, setBasesDatos] = useState([])
  const [baseSeleccionada, setBaseSeleccionada] = useState('')
  const [objetos, setObjetos] = useState(null)
  const [busqueda, setBusqueda] = useState('')

  const refrescarBasesDatos = async () => {
    try {
      const resp = await fetch('/api/v2/modelos')
      const datos = await resp.json()
      setBasesDatos(Array.isArray(datos) ? datos : [])
    } catch (e) {
      setBasesDatos([])
    }
  }

  const cargarObjetosDe = async (base) => {
    if (!base) {
      setObjetos(null)
      return
    }
    try {
      const resp = await fetch(`/api/v2/modelos/${encodeURIComponent(base)}`)
      const datos = await resp.json()
      setObjetos(datos)
    } catch (e) {
      setObjetos(null)
    }
  }

  useEffect(() => {
    refrescarBasesDatos()
  }, [])

  useEffect(() => {
    cargarObjetosDe(baseSeleccionada)
  }, [baseSeleccionada])

  // Sigue el patron de acumulacion/deduplicacion de NuevoRequerimiento.jsx,
  // adaptado a un solo archivo por carga: valida peso maximo antes de
  // aceptar la seleccion.
  const seleccionarArchivo = (nuevoArchivo) => {
    if (!nuevoArchivo) return
    if (nuevoArchivo.size > MAX_PESO_BYTES) {
      setError(`Archivo muy pesado: ${nuevoArchivo.name} (máx 10MB)`)
      return
    }
    const extension = nuevoArchivo.name.split('.').pop()?.toLowerCase()
    if (!['csv', 'sql'].includes(extension)) {
      setError('Solo se aceptan archivos .csv o .sql')
      return
    }
    setError('')
    setArchivo(nuevoArchivo)
  }

  const handleFileChange = (e) => {
    seleccionarArchivo(e.target.files[0])
    e.target.value = ''
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setIsDragging(false)
    seleccionarArchivo(e.dataTransfer.files[0])
  }

  const handleCargar = async () => {
    setError('')
    if (!archivo) {
      setError('Selecciona un archivo .csv o .sql')
      return
    }
    if (!baseDatos.trim()) {
      setError('El campo base de datos es obligatorio')
      return
    }

    const formData = new FormData()
    formData.append('archivo', archivo)
    formData.append('base_datos', baseDatos.trim())
    if (moduloNbs.trim()) {
      formData.append('modulo_nbs', moduloNbs.trim())
    }

    setCargando(true)
    try {
      const resp = await fetch('/api/v2/modelos/cargar', {
        method: 'POST',
        body: formData,
      })
      const datos = await resp.json()
      if (!resp.ok) {
        setError(datos.error || 'Error al cargar el archivo')
        return
      }
      setArchivo(null)
      await refrescarBasesDatos()
      setBaseSeleccionada(baseDatos.trim())
    } catch (e) {
      setError(`Error de red: ${e.message}`)
    } finally {
      setCargando(false)
    }
  }

  const filtrarObjetos = (lista) => {
    if (!busqueda.trim()) return lista
    const termino = busqueda.trim().toLowerCase()
    return lista.filter((obj) => obj.nombre_objeto.toLowerCase().includes(termino))
  }

  const tituloSeccion = { fontSize: 14, fontWeight: 500, color: S.textoP, marginBottom: 12 }

  return (
    <div>
      <div style={S.pageHeader}>
        <h1 style={S.pageTitle}>Modelos de Datos Externos</h1>
      </div>

      <div style={S.seccion}>
        <section style={{ ...S.card, marginBottom: '1.5rem' }}>
          <h2 style={tituloSeccion}>Cargar catálogo (CSV o SQL)</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxWidth: 420 }}>
            <div
              onDragOver={(e) => {
                e.preventDefault()
                setIsDragging(true)
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              style={{
                border: `2px dashed ${isDragging ? S.acento : S.borde}`,
                backgroundColor: isDragging ? '#EFF6FF' : S.fondo,
                borderRadius: 12,
                padding: '2rem',
                textAlign: 'center',
                transition: 'border-color 0.15s, background-color 0.15s',
              }}
            >
              <p style={{ margin: 0, fontSize: 13, color: S.textoS }}>
                Arrastra un archivo .csv o .sql aquí, o selecciónalo
              </p>
              <input
                type="file"
                accept=".csv,.sql"
                onChange={handleFileChange}
                style={{ marginTop: '0.75rem', fontSize: 13 }}
              />
              {archivo && (
                <p style={{ marginTop: 8, fontSize: 12, color: S.textoP }}>
                  Archivo seleccionado: {archivo.name}
                </p>
              )}
            </div>

            <input
              type="text"
              placeholder="Base de datos (obligatorio)"
              value={baseDatos}
              onChange={(e) => setBaseDatos(e.target.value)}
              style={S.input}
            />
            <input
              type="text"
              placeholder="Módulo NBS (opcional)"
              value={moduloNbs}
              onChange={(e) => setModuloNbs(e.target.value)}
              style={S.input}
            />
            <button type="button" onClick={handleCargar} disabled={cargando} style={S.btnPrimario}>
              {cargando ? 'Cargando...' : 'Cargar'}
            </button>
            {error && <span style={{ color: '#DC2626', fontSize: 13 }}>{error}</span>}
          </div>
        </section>

        <section style={{ marginBottom: '1.5rem' }}>
          <h2 style={tituloSeccion}>Bases de datos cargadas</h2>
          {basesDatos.length === 0 && (
            <p style={{ textAlign: 'center', color: S.textoM, fontSize: 13, padding: '1rem 0' }}>
              No hay bases de datos cargadas
            </p>
          )}
          <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {basesDatos.map((b) => (
              <li key={b.base_datos}>
                <button
                  type="button"
                  onClick={() => setBaseSeleccionada(b.base_datos)}
                  style={{
                    ...S.btnSecundario,
                    width: '100%',
                    justifyContent: 'flex-start',
                    fontWeight: b.base_datos === baseSeleccionada ? 600 : 400,
                    borderColor: b.base_datos === baseSeleccionada ? S.acento : S.borde,
                  }}
                >
                  {b.base_datos} {b.modulo_nbs ? `(${b.modulo_nbs})` : ''} — {b.total_objetos} objetos
                </button>
              </li>
            ))}
          </ul>
        </section>

        {baseSeleccionada && (
          <section>
            <h2 style={tituloSeccion}>Objetos de "{baseSeleccionada}"</h2>
            <input
              type="text"
              placeholder="Buscar por nombre de objeto..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              style={{ ...S.input, marginBottom: '1rem', maxWidth: 420 }}
            />

            {objetos === null && <p style={{ fontSize: 13, color: S.textoS }}>Cargando objetos...</p>}

            {objetos && TIPOS_ORDEN.map((tipo) => {
              const lista = filtrarObjetos(objetos[tipo] || [])
              if (lista.length === 0) return null
              return (
                <div key={tipo} style={{ marginBottom: '1.25rem' }}>
                  <h3 style={{ fontSize: 13, fontWeight: 500, color: S.textoP, marginBottom: 6 }}>
                    {ETIQUETAS_TIPO[tipo]}
                  </h3>
                  <ul style={{ listStyle: 'none', padding: 0 }}>
                    {lista.map((obj) => (
                      <li
                        key={obj.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          padding: '6px 0',
                          borderBottom: `1px solid ${S.borde}`,
                          fontSize: 13,
                          color: S.textoP,
                        }}
                      >
                        {obj.nombre_objeto}
                        <span style={S.badge(obj.indexado_chroma ? '#DCFCE7' : '#FEF3C7', obj.indexado_chroma ? '#166534' : '#92400E')}>
                          {obj.indexado_chroma ? 'Indexado' : 'Pendiente'}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )
            })}
          </section>
        )}
      </div>
    </div>
  )
}

export default ModelosDatos
