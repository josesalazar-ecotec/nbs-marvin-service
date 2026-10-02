import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import useTareaPolling from '../hooks/useTareaPolling'

// Los 7 tipos de documento del Plan Maestro (Sprint D), en el orden en que
// deben mostrarse siempre, independientemente del orden en que vengan del
// backend.
const TIPOS_DOCUMENTO = [
  'levantamiento',
  'casos_uso',
  'esquema_bd',
  'prompt_ux',
  'prompt_bd',
  'gantt',
  'resumen_ejecutivo',
]

const ETIQUETAS_TIPO = {
  levantamiento: 'Levantamiento de requerimientos',
  casos_uso: 'Casos de uso',
  esquema_bd: 'Esquema de base de datos',
  prompt_ux: 'Prompt UX',
  prompt_bd: 'Prompt BD',
  gantt: 'Cronograma (Gantt)',
  resumen_ejecutivo: 'Resumen ejecutivo',
}

const ETIQUETAS_ESTADO = {
  pendiente: 'Pendiente',
  borrador: 'Borrador',
  aprobado: 'Aprobado',
}

const COLOR_ESTADO = {
  pendiente: '#888',
  borrador: '#b8860b',
  aprobado: '#27ae60',
}

/**
 * Renderizador Markdown -> HTML MINIMO Y CASERO.
 * No hay ninguna librería de markdown instalada en el proyecto (ver
 * package.json), así que en vez de agregar una dependencia nueva se
 * implementa aquí una conversión básica y suficiente para la preview del
 * editor: encabezados (#, ##, ###), negritas **texto**, itálicas *texto*,
 * listas simples con "- " y saltos de línea. No pretende ser un parser
 * Markdown completo/robusto.
 */
function renderizarMarkdownBasico(md) {
  if (!md) return ''

  const escaparHtml = (s) =>
    s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')

  const lineas = md.split('\n')
  const htmlLineas = []
  let enLista = false

  for (const lineaOriginal of lineas) {
    let linea = escaparHtml(lineaOriginal)

    // Encabezados
    const matchH = linea.match(/^(#{1,6})\s+(.*)$/)

    // Negrita e itálica (aplicadas antes de decidir el tipo de línea)
    linea = linea
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')

    const esItem = /^-\s+/.test(lineaOriginal)

    if (matchH) {
      if (enLista) {
        htmlLineas.push('</ul>')
        enLista = false
      }
      const nivel = matchH[1].length
      const contenido = linea.replace(/^(#{1,6})\s+/, '')
      htmlLineas.push(`<h${nivel}>${contenido}</h${nivel}>`)
    } else if (esItem) {
      if (!enLista) {
        htmlLineas.push('<ul>')
        enLista = true
      }
      htmlLineas.push(`<li>${linea.replace(/^-\s+/, '')}</li>`)
    } else {
      if (enLista) {
        htmlLineas.push('</ul>')
        enLista = false
      }
      if (linea.trim() === '') {
        htmlLineas.push('<br/>')
      } else {
        htmlLineas.push(`<p>${linea}</p>`)
      }
    }
  }
  if (enLista) htmlLineas.push('</ul>')

  return htmlLineas.join('\n')
}

function BarraProgreso({ porcentaje }) {
  return (
    <div
      style={{
        width: '100%',
        height: 10,
        backgroundColor: '#eee',
        borderRadius: 6,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          width: `${porcentaje}%`,
          height: '100%',
          backgroundColor: '#27ae60',
          transition: 'width 0.3s ease',
        }}
      />
    </div>
  )
}

function GeneradorDocumento({ proyectoId, tipo, onCompletado }) {
  const [tareaId, setTareaId] = useState(null)
  const [errorLocal, setErrorLocal] = useState(null)
  const [generando, setGenerando] = useState(false)
  const { tarea, error: errorPolling } = useTareaPolling(tareaId)

  const iniciarGeneracion = async () => {
    setErrorLocal(null)
    setGenerando(true)
    try {
      const resp = await fetch('/api/v2/documentos/generar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proyecto_id: proyectoId, tipo }),
      })
      if (resp.status !== 202 && !resp.ok) {
        throw new Error(`Error del servidor (${resp.status})`)
      }
      const data = await resp.json()
      setTareaId(data.tarea_id)
    } catch (err) {
      setErrorLocal(err?.message || 'No se pudo iniciar la generación')
      setGenerando(false)
    }
  }

  useEffect(() => {
    if (tarea?.estado === 'completado') {
      setGenerando(false)
      onCompletado()
    }
    if (tarea?.estado === 'error') {
      setGenerando(false)
    }
  }, [tarea, onCompletado])

  if (!generando && !tareaId) {
    return (
      <button type="button" onClick={iniciarGeneracion}>
        Generar con IA
      </button>
    )
  }

  return (
    <div style={{ minWidth: 200 }}>
      {tarea && tarea.estado !== 'completado' && tarea.estado !== 'error' && (
        <>
          <BarraProgreso porcentaje={tarea.progreso || 0} />
          <p style={{ fontSize: '0.8rem', margin: '0.25rem 0 0' }}>
            {tarea.mensaje || 'Generando…'} ({tarea.progreso || 0}%)
          </p>
        </>
      )}
      {tarea?.estado === 'error' && (
        <p style={{ color: '#c0392b', fontSize: '0.85rem' }}>
          Error al generar: {tarea.mensaje || 'error desconocido'}
        </p>
      )}
      {errorPolling && (
        <p style={{ color: '#c0392b', fontSize: '0.85rem' }}>{errorPolling}</p>
      )}
      {errorLocal && (
        <p style={{ color: '#c0392b', fontSize: '0.85rem' }}>{errorLocal}</p>
      )}
    </div>
  )
}

function SubirRevision({ documentoId, onSubido }) {
  const [subiendo, setSubiendo] = useState(false)
  const [error, setError] = useState(null)
  const inputRef = useRef(null)

  const onSeleccionar = async (evento) => {
    const archivo = evento.target.files?.[0]
    evento.target.value = ''
    if (!archivo) return

    setSubiendo(true)
    setError(null)
    try {
      const formData = new FormData()
      formData.append('archivo', archivo, archivo.name)
      const resp = await fetch(`/api/v2/documentos/${documentoId}/subir-revision`, {
        method: 'POST',
        body: formData,
      })
      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}))
        throw new Error(data.error || `Error del servidor (${resp.status})`)
      }
      onSubido()
    } catch (err) {
      setError(err?.message || 'No se pudo subir la revision')
    } finally {
      setSubiendo(false)
    }
  }

  return (
    <span style={{ display: 'inline-block' }}>
      <input
        ref={inputRef}
        type="file"
        accept=".md"
        onChange={onSeleccionar}
        style={{ display: 'none' }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={subiendo}
        style={{ marginRight: '0.5rem' }}
      >
        {subiendo ? 'Subiendo…' : 'Subir revisión'}
      </button>
      {error && <span style={{ color: '#c0392b', fontSize: '0.8rem' }}>{error}</span>}
    </span>
  )
}

function EditorDocumento({ documento, soloLectura, onCerrar, onGuardado }) {
  const [contenido, setContenido] = useState(documento.contenido_md || '')
  const [guardando, setGuardando] = useState(false)
  const [errorGuardado, setErrorGuardado] = useState(null)
  const [guardadoOk, setGuardadoOk] = useState(false)

  const htmlPreview = useMemo(
    () => renderizarMarkdownBasico(contenido),
    [contenido]
  )

  const guardar = async () => {
    setGuardando(true)
    setErrorGuardado(null)
    setGuardadoOk(false)
    try {
      const resp = await fetch(`/api/v2/documentos/${documento.id}/contenido`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contenido_md: contenido }),
      })

      if (resp.status === 403) {
        const data = await resp.json().catch(() => ({}))
        // Mostramos el mensaje EXACTO que envía el backend cuando el
        // documento ya está aprobado y bloqueado para edición.
        setErrorGuardado(
          data.error ||
            'Documento aprobado — no editable. Descarga la versión actual o crea una nueva revisión.'
        )
        return
      }

      if (!resp.ok) {
        throw new Error(`Error del servidor (${resp.status})`)
      }

      setGuardadoOk(true)
      onGuardado()
    } catch (err) {
      setErrorGuardado(err?.message || 'No se pudo guardar el documento')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div
      style={{
        border: '1px solid #ddd',
        borderRadius: 8,
        padding: '1rem',
        marginTop: '0.75rem',
        backgroundColor: '#fafafa',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '0.5rem',
        }}
      >
        <h3 style={{ margin: 0 }}>
          {ETIQUETAS_TIPO[documento.tipo] || documento.tipo}{' '}
          {soloLectura ? '(solo lectura)' : '(editor)'}
        </h3>
        <button type="button" onClick={onCerrar}>
          Cerrar
        </button>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '0.75rem',
        }}
      >
        <textarea
          value={contenido}
          onChange={(e) => setContenido(e.target.value)}
          readOnly={soloLectura}
          rows={18}
          style={{
            width: '100%',
            fontFamily: 'monospace',
            fontSize: '0.85rem',
            padding: '0.5rem',
            boxSizing: 'border-box',
          }}
        />
        <div
          style={{
            border: '1px solid #ddd',
            borderRadius: 4,
            padding: '0.5rem 0.75rem',
            backgroundColor: '#fff',
            overflowY: 'auto',
            maxHeight: 420,
          }}
          // Renderizado casero de markdown -> HTML (ver renderizarMarkdownBasico).
          // El contenido se escapa dentro de esa función antes de insertarse.
          dangerouslySetInnerHTML={{ __html: htmlPreview }}
        />
      </div>

      {!soloLectura && (
        <div style={{ marginTop: '0.75rem' }}>
          <button type="button" onClick={guardar} disabled={guardando}>
            {guardando ? 'Guardando…' : 'Guardar'}
          </button>
          {guardadoOk && (
            <span style={{ color: '#27ae60', marginLeft: '0.75rem' }}>
              Guardado correctamente.
            </span>
          )}
          {errorGuardado && (
            <p style={{ color: '#c0392b', marginTop: '0.5rem' }}>
              {errorGuardado}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function descargarComoArchivo(nombreArchivo, contenido) {
  const blob = new Blob([contenido || ''], { type: 'text/markdown' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = nombreArchivo
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

function FilaFormato({ tipo }) {
  const [subiendo, setSubiendo] = useState(false)
  const [error, setError] = useState(null)
  const [ok, setOk] = useState(false)
  const inputRef = useRef(null)

  const onSeleccionar = async (evento) => {
    const archivo = evento.target.files?.[0]
    evento.target.value = ''
    if (!archivo) return

    setSubiendo(true)
    setError(null)
    setOk(false)
    try {
      const formData = new FormData()
      formData.append('archivo', archivo, archivo.name)
      const resp = await fetch(`/api/v2/formatos/${tipo}`, {
        method: 'POST',
        body: formData,
      })
      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}))
        throw new Error(data.error || `Error del servidor (${resp.status})`)
      }
      setOk(true)
    } catch (err) {
      setError(err?.message || 'No se pudo subir la plantilla')
    } finally {
      setSubiendo(false)
    }
  }

  return (
    <tr style={{ borderBottom: '1px solid #eee' }}>
      <td style={{ padding: '0.5rem' }}>{ETIQUETAS_TIPO[tipo] || tipo}</td>
      <td style={{ padding: '0.5rem' }}>
        <a href={`/api/v2/formatos/${tipo}`} download>
          Descargar plantilla
        </a>
      </td>
      <td style={{ padding: '0.5rem' }}>
        <input
          ref={inputRef}
          type="file"
          accept=".md"
          onChange={onSeleccionar}
          style={{ display: 'none' }}
        />
        <button type="button" onClick={() => inputRef.current?.click()} disabled={subiendo}>
          {subiendo ? 'Subiendo…' : 'Subir plantilla'}
        </button>
        {ok && <span style={{ color: '#27ae60', marginLeft: '0.5rem', fontSize: '0.8rem' }}>Actualizada</span>}
        {error && <span style={{ color: '#c0392b', marginLeft: '0.5rem', fontSize: '0.8rem' }}>{error}</span>}
      </td>
    </tr>
  )
}

function FormatosPlantilla() {
  const [abierto, setAbierto] = useState(false)

  return (
    <div
      style={{
        border: '1px solid #ddd',
        borderRadius: 8,
        padding: '1rem',
        marginBottom: '1.5rem',
        backgroundColor: '#fafafa',
      }}
    >
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        style={{ background: 'none', border: 'none', cursor: 'pointer', fontWeight: 'bold', padding: 0 }}
      >
        {abierto ? '▾' : '▸'} Formatos de plantilla (usados en futuras generaciones con IA)
      </button>
      {abierto && (
        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '0.75rem' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '2px solid #ccc' }}>
              <th style={{ padding: '0.5rem' }}>Tipo</th>
              <th style={{ padding: '0.5rem' }}>Plantilla actual</th>
              <th style={{ padding: '0.5rem' }}>Reemplazar</th>
            </tr>
          </thead>
          <tbody>
            {TIPOS_DOCUMENTO.map((tipo) => (
              <FilaFormato key={tipo} tipo={tipo} />
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

export default function Documentos({ proyectoId }) {
  const [documentos, setDocumentos] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)
  const [editorAbierto, setEditorAbierto] = useState(null) // { documento, soloLectura }

  // La minuta (F08) NO vive en la tabla `documentos` (su ENUM `tipo` no la
  // incluye, ver schema.sql) sino en `entrevista_outputs`, generada desde
  // la página Entrevista. Se muestra aquí como sección aparte, no como fila
  // más de la tabla de los 7 documentos.
  const [outputsEntrevista, setOutputsEntrevista] = useState(null)

  const cargarOutputsEntrevista = useCallback(async () => {
    if (!proyectoId) return
    try {
      const resp = await fetch(`/api/v2/entrevistas/outputs/${proyectoId}`)
      if (resp.ok) {
        setOutputsEntrevista(await resp.json())
      }
    } catch (_err) {
      // Silencioso: la sección de minuta simplemente no aparece si falla.
    }
  }, [proyectoId])

  useEffect(() => {
    cargarOutputsEntrevista()
  }, [cargarOutputsEntrevista])

  const cargarDocumentos = useCallback(async () => {
    if (!proyectoId) return
    setCargando(true)
    setError(null)
    try {
      const resp = await fetch(`/api/v2/documentos/proyecto/${proyectoId}`)
      if (!resp.ok) {
        throw new Error(`Error del servidor (${resp.status})`)
      }
      const data = await resp.json()
      setDocumentos(Array.isArray(data) ? data : data.documentos || [])
    } catch (err) {
      setError(err?.message || 'No se pudieron cargar los documentos')
    } finally {
      setCargando(false)
    }
  }, [proyectoId])

  useEffect(() => {
    cargarDocumentos()
  }, [cargarDocumentos])

  // Mapa tipo -> documento, para poder mostrar los 7 tipos siempre en el
  // mismo orden aunque el backend todavía no haya creado el registro
  // (caso "pendiente" implícito, sin fila en BD).
  const documentosPorTipo = useMemo(() => {
    const mapa = {}
    documentos.forEach((doc) => {
      mapa[doc.tipo] = doc
    })
    return mapa
  }, [documentos])

  const aprobados = documentos.filter((d) => d.estado === 'aprobado').length
  const totalTipos = TIPOS_DOCUMENTO.length
  const porcentajeAprobado = Math.round((aprobados / totalTipos) * 100)

  const aprobarDocumento = async (documento) => {
    try {
      const resp = await fetch(`/api/v2/documentos/${documento.id}/aprobar`, {
        method: 'POST',
      })
      if (!resp.ok) {
        throw new Error(`Error del servidor (${resp.status})`)
      }
      await cargarDocumentos()
    } catch (err) {
      setError(err?.message || 'No se pudo aprobar el documento')
    }
  }

  const abrirEditor = async (documento) => {
    try {
      const resp = await fetch(`/api/v2/documentos/${documento.id}`)
      if (!resp.ok) {
        throw new Error(`Error del servidor (${resp.status})`)
      }
      const data = await resp.json()
      setEditorAbierto({ documento: data, soloLectura: data.estado === 'aprobado' })
    } catch (err) {
      setError(err?.message || 'No se pudo abrir el documento')
    }
  }

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: '1.5rem' }}>
      <h1>Documentos del requerimiento</h1>

      {/* Plantillas institucionales -- separadas del ciclo de documentos de
          ESTE requerimiento: afectan generaciones futuras con IA para
          cualquier proyecto, no el contenido ya generado. */}
      <FormatosPlantilla />

      <div
        style={{
          border: '1px solid #ddd',
          borderRadius: 8,
          padding: '1rem',
          marginBottom: '1.5rem',
          backgroundColor: '#fafafa',
        }}
      >
        <p style={{ margin: '0 0 0.5rem', fontWeight: 'bold' }}>
          {aprobados}/{totalTipos} documentos aprobados
        </p>
        <BarraProgreso porcentaje={porcentajeAprobado} />
      </div>

      {/* Minuta de la entrevista -- documento separado del ciclo de los 7
          tipos (ver nota en cargarOutputsEntrevista). Se muestra siempre
          que exista al menos un output registrado. */}
      {outputsEntrevista && (outputsEntrevista.url_descarga_docx || outputsEntrevista.url_descarga_html) && (
        <div
          style={{
            border: '1px solid #ddd',
            borderRadius: 8,
            padding: '1rem',
            marginBottom: '1.5rem',
            backgroundColor: '#f0fdf4',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '0.5rem',
          }}
        >
          <div>
            <p style={{ margin: 0, fontWeight: 'bold' }}>Minuta de la entrevista</p>
            <p style={{ margin: 0, fontSize: '0.85rem', color: '#555' }}>
              Generada al cerrar la entrevista — no forma parte de los 7 documentos.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            {outputsEntrevista.url_descarga_docx && (
              <a href={outputsEntrevista.url_descarga_docx} download>
                ⬇ Descargar minuta Word
              </a>
            )}
            {outputsEntrevista.url_descarga_html && (
              <a href={outputsEntrevista.url_descarga_html} download>
                ⬇ Descargar resumen HTML
              </a>
            )}
          </div>
        </div>
      )}

      {error && <p style={{ color: '#c0392b' }}>{error}</p>}

      {cargando ? (
        <p>Cargando documentos…</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '2px solid #ccc' }}>
              <th style={{ padding: '0.5rem' }}>Tipo</th>
              <th style={{ padding: '0.5rem' }}>Estado</th>
              <th style={{ padding: '0.5rem' }}>Versión</th>
              <th style={{ padding: '0.5rem' }}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {TIPOS_DOCUMENTO.map((tipo) => {
              const documento = documentosPorTipo[tipo]
              const estado = documento?.estado || 'pendiente'

              return (
                <tr key={tipo} style={{ borderBottom: '1px solid #eee' }}>
                  <td style={{ padding: '0.5rem' }}>
                    {ETIQUETAS_TIPO[tipo] || tipo}
                  </td>
                  <td style={{ padding: '0.5rem' }}>
                    <span
                      style={{
                        color: '#fff',
                        backgroundColor: COLOR_ESTADO[estado] || '#888',
                        borderRadius: 4,
                        padding: '0.15rem 0.5rem',
                        fontSize: '0.8rem',
                      }}
                    >
                      {ETIQUETAS_ESTADO[estado] || estado}
                    </span>
                  </td>
                  <td style={{ padding: '0.5rem' }}>
                    {documento?.version ?? '-'}
                  </td>
                  <td style={{ padding: '0.5rem' }}>
                    {estado === 'pendiente' && (
                      <GeneradorDocumento
                        proyectoId={proyectoId}
                        tipo={tipo}
                        onCompletado={cargarDocumentos}
                      />
                    )}
                    {estado === 'borrador' && documento && (
                      <>
                        <button
                          type="button"
                          onClick={() => abrirEditor(documento)}
                          style={{ marginRight: '0.5rem' }}
                        >
                          Revisar
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            descargarComoArchivo(
                              `${documento.tipo}_v${documento.version ?? 1}.md`,
                              documento.contenido_md
                            )
                          }
                          style={{ marginRight: '0.5rem' }}
                        >
                          Descargar
                        </button>
                        <button
                          type="button"
                          onClick={() => aprobarDocumento(documento)}
                          style={{ marginRight: '0.5rem' }}
                        >
                          Aprobar
                        </button>
                        <SubirRevision documentoId={documento.id} onSubido={cargarDocumentos} />
                      </>
                    )}
                    {estado === 'aprobado' && documento && (
                      <>
                        <button
                          type="button"
                          onClick={() => abrirEditor(documento)}
                          style={{ marginRight: '0.5rem' }}
                        >
                          Ver
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            descargarComoArchivo(
                              `${documento.tipo}_v${documento.version ?? 1}.md`,
                              documento.contenido_md
                            )
                          }
                          style={{ marginRight: '0.5rem' }}
                        >
                          Descargar MD
                        </button>
                        <SubirRevision documentoId={documento.id} onSubido={cargarDocumentos} />
                      </>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}

      {editorAbierto && (
        <EditorDocumento
          documento={editorAbierto.documento}
          soloLectura={editorAbierto.soloLectura}
          onCerrar={() => setEditorAbierto(null)}
          onGuardado={() => {
            cargarDocumentos()
            setEditorAbierto(null)
          }}
        />
      )}
    </div>
  )
}
