import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import useTareaPolling from '../hooks/useTareaPolling';
import EntrevistaVoz, { AdjuntosZona } from './EntrevistaVoz';
import MarginalMinuta from '../components/MarginalMinuta';
import MarvinSpinner from '../components/MarvinSpinner';
import { hablarMarvin } from '../utils/marvinVoz';
import { limpiarMarkdown } from '../utils/limpiarMarkdown';

// Bloques temáticos de la entrevista (Sprint C/D): A -> G.
const BLOQUES = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];

// Detección semántica de fin de entrevista -- el agente entrevistador a
// veces indica que terminó con una frase en lenguaje natural en vez de un
// campo estructurado; se complementa con el límite duro de 12 preguntas
// (ver entrevistaFinalizada más abajo).
const INDICADORES_FIN_ENTREVISTA = [
  'ha sido completada',
  'no hay una siguiente pregunta',
  'hemos terminado',
  'entrevista terminada',
  'gracias por tu tiempo',
  'cerramos la entrevista',
  'no hay más preguntas',
];

function detectarFinEntrevista(pregunta) {
  if (!pregunta) return false;
  const lower = pregunta.toLowerCase();
  return INDICADORES_FIN_ENTREVISTA.some(i => lower.includes(i));
}

/**
 * Página de Entrevista -- plataforma NBS v2.0.
 *
 * Modo de operación: chat "one-question-at-a-time". Se muestra el turno
 * más reciente del entrevistador como pregunta, con un input de texto
 * para responder. El modo texto es el único modo por defecto; el modo
 * voz es una capa opcional condicionada por configuración remota (ver
 * bloque "MODO VOZ" más abajo).
 *
 * @param {{ proyectoId: number|string }} props
 */
export default function Entrevista({ proyectoId }) {
  const navigate = useNavigate();
  const [turnoActual, setTurnoActual] = useState(null); // { pregunta, bloque_tematico, ... }
  const [historial, setHistorial] = useState([]);
  const [respuesta, setRespuesta] = useState('');
  const [pausada, setPausada] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [errorGeneral, setErrorGeneral] = useState(null);
  const [entrevistaFinalizada, setEntrevistaFinalizada] = useState(false);

  // --- Upload de archivo durante la entrevista -----------------------
  // NOTA: el servicio real backend/services/archivo_service.py todavía
  // no expone un endpoint HTTP dedicado (Sprint D). Este input maneja el
  // estado en el frontend como placeholder funcional de UI; se conectará
  // al endpoint real cuando routes/proyectos.py (o un endpoint dedicado)
  // lo exponga en un sprint posterior.
  const [archivoSeleccionado, setArchivoSeleccionado] = useState(null);
  const [tareaUploadId, setTareaUploadId] = useState(null);
  const [subiendoArchivo, setSubiendoArchivo] = useState(false);
  const fileInputRef = useRef(null);

  // Reutilizamos el hook de polling genérico para seguir el progreso de
  // una eventual tarea asíncrona generada por la subida del archivo
  // (por ejemplo, indexación/transcripción en background).
  const { tarea: tareaUpload } = useTareaPolling(tareaUploadId);

  // --- MODO VOZ --------------------------------------------------------
  // El tab de voz se muestra siempre que el navegador soporte grabación
  // (MediaRecorder + getUserMedia), sin depender de configuración remota.
  const vozDisponible = typeof navigator !== 'undefined' &&
                        navigator.mediaDevices !== undefined &&
                        typeof MediaRecorder !== 'undefined';

  // Tab texto/voz -- FASE 3: el panel de voz (EntrevistaVoz.jsx) reemplaza
  // al botón MARVIN placeholder anterior (que solo hacía console.log) con
  // la implementación real de grabación + transcripción + orquestador
  // paralelo. La pestaña "voz" solo se ofrece si vozDisponible es true,
  // consistente con la regla del proyecto de nunca mostrar UI de voz si
  // voz_habilitada='0' o el navegador no soporta la API.
  const [tabActiva, setTabActiva] = useState('texto'); // 'texto' | 'voz'

  // TC-05 (skill marvin-voice-agent): si useMarvin reporta error de
  // micrófono, EntrevistaVoz ofrece este callback para caer a modo texto
  // sin bloquear al usuario.
  const onErrorMicrofono = () => setTabActiva('texto');

  // --- Adjuntos multi-turno compartidos entre modo texto y modo voz -----
  // (rediseño MarginalMinuta/AdjuntosZona) -- acumulación local en el
  // cliente, máximo 5 archivos; el envío real al backend ocurre cuando el
  // servicio de archivos exponga el endpoint dedicado (ver nota en
  // subirArchivo más abajo, que se conserva intacta).
  const [archivosAdjuntos, setArchivosAdjuntos] = useState([]);

  const onAgregarArchivo = (nuevos) => {
    setArchivosAdjuntos(prev => {
      const combinados = [...prev, ...nuevos];
      return combinados.slice(0, 5);
    });
  };
  const onQuitarArchivo = (idx) => {
    setArchivosAdjuntos(prev => prev.filter((_, i) => i !== idx));
  };

  /**
   * Sube los adjuntos pendientes DESPUÉS de que el turno ya existe en BD
   * (orden pedido explícitamente): primero se registra la respuesta
   * (texto o voz) vía /responder o /responder-async, y solo con el `id`
   * real que retorna ese turno se llama a POST /adjunto por cada archivo.
   * Nunca se sube un adjunto "adelantado" a un turno que aún no existe.
   */
  const subirAdjuntosPendientes = async (datosTurno) => {
    if (!archivosAdjuntos.length || !datosTurno?.id) return;

    const turnoId = datosTurno.id;
    const numeroTurno = datosTurno.turno_numero ?? 0;
    const bloqueDelTurno = datosTurno.bloque_tematico || bloqueActual;

    const resultados = [];
    for (const archivo of archivosAdjuntos) {
      try {
        const formData = new FormData();
        // Tercer argumento explícito: preserva el nombre original del
        // File incluso si el navegador no lo infiere solo del objeto.
        formData.append('archivo', archivo, archivo.name);
        formData.append('proyecto_id', String(proyectoId));
        formData.append('turno_id', String(turnoId));
        formData.append('turno_numero', String(numeroTurno));
        if (bloqueDelTurno) formData.append('bloque_actual', bloqueDelTurno);

        const resp = await fetch('/api/v2/entrevistas/adjunto', {
          method: 'POST',
          body: formData,
        });
        if (resp.ok) {
          const data = await resp.json();
          resultados.push(data);
        }
      } catch (_err) {
        // Best-effort: un adjunto fallido no debe romper el flujo de la
        // entrevista, que ya avanzó al siguiente turno.
      }
    }
    setArchivosAdjuntos([]);

    // Si algún documento (no imagen) produjo resumen_ia, lo agregamos al
    // turno correspondiente en la minuta -- best-effort, opcional (ver
    // nota del documento de Fase 4: si el campo no está, simplemente no
    // se renderiza, no es un error).
    const conResumen = resultados.filter(r => r?.resumen_ia);
    if (conResumen.length > 0) {
      setHistorial(prev => prev.map(t => (
        t.id === turnoId
          ? { ...t, resumen_ia_adjunto: conResumen.map(r => r.resumen_ia).join(' ') }
          : t
      )));
    }
  };

  // --- Modo prueba (por proyecto, columna proyectos.es_prueba) -----------
  // Cuando es_prueba=1: aprendiz.py no indexa en ChromaDB, adjunto_service
  // guarda en adjuntos/prueba/{id}/, y generar-resumen no persiste el HTML
  // en disco/BD (solo se muestra en pantalla). Se lee/actualiza aquí, en
  // ausencia de una página de "detalle de proyecto" dedicada en el
  // frontend (no existe todavía como componente propio) -- se colocó el
  // toggle en esta misma página, que es la vista principal del proyecto.
  const [esPrueba, setEsPrueba] = useState(false);
  const [estadoCiclo, setEstadoCiclo] = useState(null);
  const [entrevistaCompletadaEn, setEntrevistaCompletadaEn] = useState(null);
  const [avisoActivacionPrueba, setAvisoActivacionPrueba] = useState(false);
  const [cambiandoModoPrueba, setCambiandoModoPrueba] = useState(false);
  const [limpiandoPrueba, setLimpiandoPrueba] = useState(false);
  const [mostrarModalLimpiar, setMostrarModalLimpiar] = useState(false);

  // --- Modal de bienvenida al iniciar una entrevista NUEVA (sin historial
  // previo) -- no aparece al retomar una entrevista existente.
  const [mostrarBienvenida, setMostrarBienvenida] = useState(false);

  useEffect(() => {
    if (!proyectoId) return;
    let cancelado = false;
    fetch(`/api/v2/requerimientos/${proyectoId}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!cancelado && data) {
          setEsPrueba(data.es_prueba === 1 || data.es_prueba === true);
          setEstadoCiclo(data.estado_ciclo || null);
          setEntrevistaCompletadaEn(data.entrevista_completada_en || null);
        }
      })
      .catch(() => {
        // Fail-safe: si no se puede leer, se asume que no es prueba (no
        // oculta accidentalmente el banner de "produccion" real).
      });
    return () => { cancelado = true; };
  }, [proyectoId]);

  const alternarModoPrueba = async () => {
    if (!proyectoId || cambiandoModoPrueba) return;
    const nuevoValor = !esPrueba;
    setCambiandoModoPrueba(true);
    try {
      const resp = await fetch(`/api/v2/requerimientos/${proyectoId}/modo-prueba`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ es_prueba: nuevoValor ? 1 : 0 }),
      });
      if (resp.ok) {
        const data = await resp.json();
        const valorConfirmado = data.es_prueba === 1 || data.es_prueba === true;
        setEsPrueba(valorConfirmado);
        // Al ACTIVAR (0->1): mostrar aviso de limpieza manual pendiente.
        // Al DESACTIVAR (1->0): no hacer nada automático.
        if (valorConfirmado) {
          setAvisoActivacionPrueba(true);
        }
      }
    } catch (_err) {
      // Silencioso: el toggle simplemente no cambia visualmente si falla.
    } finally {
      setCambiandoModoPrueba(false);
    }
  };

  const confirmarLimpiarDatosPrueba = async () => {
    setMostrarModalLimpiar(false);
    if (!proyectoId || limpiandoPrueba) return;

    setLimpiandoPrueba(true);
    try {
      const resp = await fetch(`/api/v2/requerimientos/${proyectoId}/limpiar-prueba`, {
        method: 'DELETE',
      });
      const data = await resp.json().catch(() => ({}));
      if (resp.ok) {
        // limpiar-prueba ahora elimina el PROYECTO completo (no solo sus
        // turnos) -- no hay nada que reinicializar en esta página, se
        // redirige a la lista de requerimientos.
        const e = data.eliminados || {};
        window.alert(
          `Proyecto de prueba eliminado: ${e.turnos ?? 0} turnos, ${e.adjuntos ?? 0} adjuntos, ${e.archivos_disco ?? 0} archivos en disco.`
        );
        navigate('/');
      } else {
        window.alert(data.error || 'No se pudo limpiar los datos de prueba.');
      }
    } catch (_err) {
      window.alert('No se pudo limpiar los datos de prueba.');
    } finally {
      setLimpiandoPrueba(false);
    }
  };

  // --- Resumen HTML descargable (o inline si es_prueba=1) ----------------
  const [generandoResumen, setGenerandoResumen] = useState(false);
  const [urlResumen, setUrlResumen] = useState(null);
  const [urlMinutaDocx, setUrlMinutaDocx] = useState(null);
  const [htmlResumenPrueba, setHtmlResumenPrueba] = useState(null);
  const [errorResumen, setErrorResumen] = useState(null);

  const generarResumen = async () => {
    if (!proyectoId || generandoResumen) return;

    // Frase de voz detectada por MARVIN, si el navegador soporta TTS.
    hablarMarvin('Dame unos segundos mientras preparo el resumen completo de nuestra conversación.');

    setGenerandoResumen(true);
    setErrorResumen(null);

    try {
      // 1. Cerrar la entrevista antes de generar el resumen (estado_sesion
      // -> 'completada'). Si ya estaba cerrada, el backend simplemente
      // vuelve a marcarla como completada (no es un error real) -- solo
      // se bloquea el resumen si /cerrar falla por una razón distinta.
      const respCerrar = await fetch('/api/v2/entrevistas/cerrar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proyecto_id: proyectoId }),
      });
      if (!respCerrar.ok && respCerrar.status !== 400) {
        const errCerrar = await respCerrar.json().catch(() => ({}));
        throw new Error(errCerrar.error || 'No se pudo cerrar la entrevista.');
      }

      // 2. Generar el resumen (HTML + docx, en paralelo en el backend).
      const resp = await fetch('/api/v2/entrevistas/generar-resumen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          proyecto_id: proyectoId,
          nombre_proyecto: `Requerimiento ${proyectoId}`,
        }),
      });

      const data = await resp.json();

      if (!resp.ok) {
        throw new Error(data.error || 'No se pudo generar el resumen.');
      }

      // Modo prueba: el backend genera el HTML pero no lo persiste (sin
      // url_descarga) -- se muestra inline en un iframe con srcDoc.
      if (data.modo === 'prueba') {
        setHtmlResumenPrueba(data.html_content);
        setUrlResumen(null);
        setUrlMinutaDocx(null);
      } else {
        setUrlResumen(data.url_descarga_html || data.url_descarga);
        setUrlMinutaDocx(data.url_descarga_docx || null);
        setHtmlResumenPrueba(null);
      }

      if (data.modo !== 'prueba') {
        setEstadoCiclo('entrevista_realizada');
        setEntrevistaCompletadaEn(new Date().toISOString());
      }

      hablarMarvin('Listo. El resumen está disponible para descargar.');
    } catch (err) {
      setErrorResumen(err.message || 'Error al generar el resumen.');
    } finally {
      setGenerandoResumen(false);
    }
  };

  // --- Carga inicial: retomar entrevista existente o iniciar una nueva --
  // Extraída del useEffect para poder re-invocarla manualmente después de
  // limpiar los datos de prueba (ver limpiarDatosPrueba más abajo).
  const inicializar = async (cancelado = { current: false }) => {
    setCargando(true);
    setErrorGeneral(null);
    try {
      const respHistorial = await fetch(`/api/v2/entrevistas/historial/${proyectoId}`);
      if (respHistorial.ok) {
        const data = await respHistorial.json();
        const turnos = data?.turnos || [];
        if (turnos.length > 0) {
          if (!cancelado.current) {
            setHistorial(turnos);
            setTurnoActual(turnos[turnos.length - 1]);
            setCargando(false);
          }
          return;
        }
      }

      // No hay historial previo: iniciar entrevista nueva.
      const respIniciar = await fetch('/api/v2/entrevistas/iniciar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proyecto_id: proyectoId }),
      });
      if (!respIniciar.ok) {
        const errData = await respIniciar.json().catch(() => ({}));
        throw new Error(errData?.error || 'No se pudo iniciar la entrevista.');
      }
      const dataIniciar = await respIniciar.json();
      if (!cancelado.current) {
        setTurnoActual(dataIniciar);
        // Normalizado a la forma es_pregunta/contenido para que la
        // minuta (MarginalMinuta.jsx) lo renderice como turno de MARVIN.
        setHistorial([{
          ...dataIniciar, es_pregunta: true, contenido: dataIniciar.pregunta,
        }]);
        setMostrarBienvenida(true);
      }
    } catch (err) {
      if (!cancelado.current) {
        setErrorGeneral(err?.message || 'Error al cargar la entrevista.');
      }
    } finally {
      if (!cancelado.current) {
        setCargando(false);
      }
    }
  };

  useEffect(() => {
    if (!proyectoId) {
      setCargando(false);
      return;
    }
    const cancelado = { current: false };
    inicializar(cancelado);
    return () => {
      cancelado.current = true;
    };
  }, [proyectoId]);

  const enviarRespuesta = async (evento) => {
    evento.preventDefault();
    if (!respuesta.trim() || !proyectoId || enviando) {
      return;
    }
    setEnviando(true);
    setErrorGeneral(null);
    try {
      const resp = await fetch('/api/v2/entrevistas/responder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proyecto_id: proyectoId, contenido: respuesta }),
      });
      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({}));
        throw new Error(errData?.error || 'No se pudo enviar la respuesta.');
      }
      const data = await resp.json();
      setTurnoActual(data);
      setHistorial((prev) => [...prev, data]);
      setRespuesta('');
      if (detectarFinEntrevista(data.pregunta || data.siguiente_pregunta || data.contenido)) {
        setEntrevistaFinalizada(true);
        hablarMarvin('La entrevista ha concluido. Puedes generar el resumen cuando estés listo.');
      }
      // Orden pedido: el turno ya existe en BD (data.id) -> recién ahora
      // se suben los adjuntos pendientes referenciando ese turno_id real.
      await subirAdjuntosPendientes(data);
    } catch (err) {
      setErrorGeneral(err?.message || 'Error al enviar la respuesta.');
    } finally {
      setEnviando(false);
    }
  };

  const pausarEntrevista = async () => {
    if (!proyectoId) return;
    try {
      const resp = await fetch('/api/v2/entrevistas/pausar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proyecto_id: proyectoId }),
      });
      if (resp.ok) {
        setPausada(true);
      }
    } catch (_err) {
      setErrorGeneral('No se pudo pausar la entrevista.');
    }
  };

  const retomarEntrevista = async () => {
    if (!proyectoId) return;
    try {
      const resp = await fetch('/api/v2/entrevistas/retomar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proyecto_id: proyectoId }),
      });
      if (resp.ok) {
        setPausada(false);
      }
    } catch (_err) {
      setErrorGeneral('No se pudo retomar la entrevista.');
    }
  };

  const onSeleccionarArchivo = (evento) => {
    const archivo = evento.target.files?.[0] || null;
    setArchivoSeleccionado(archivo);
  };

  const subirArchivo = async () => {
    if (!archivoSeleccionado || !proyectoId) return;
    setSubiendoArchivo(true);
    setErrorGeneral(null);
    try {
      // Placeholder de UI: aún no existe un endpoint HTTP dedicado para
      // subir archivos durante la entrevista (backend/services/
      // archivo_service.py no lo expone todavía, Sprint D). Se conectará
      // al endpoint real cuando esté disponible en un sprint posterior.
      const formData = new FormData();
      formData.append('archivo', archivoSeleccionado);
      formData.append('proyecto_id', String(proyectoId));

      // Intento best-effort a un endpoint aún no confirmado; si falla,
      // se maneja de forma silenciosa sin romper el flujo de entrevista.
      const resp = await fetch('/api/v2/requerimientos/subir-archivo', {
        method: 'POST',
        body: formData,
      });
      if (resp.ok) {
        const data = await resp.json().catch(() => ({}));
        if (data?.tarea_id) {
          setTareaUploadId(data.tarea_id);
        }
      }
    } catch (_err) {
      // Silencioso: endpoint aún no disponible en este sprint.
    } finally {
      setSubiendoArchivo(false);
      setArchivoSeleccionado(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // CORRECCIÓN 3: límite duro de 12 preguntas -- garantiza el bloqueo del
  // input aunque el agente nunca declare explícitamente que terminó.
  useEffect(() => {
    if (historial.filter(t => t.es_pregunta).length >= 12) {
      setEntrevistaFinalizada(true);
    }
  }, [historial]);

  const bloqueActual = turnoActual?.bloque_tematico || null;
  const indiceBloqueActual = bloqueActual ? BLOQUES.indexOf(bloqueActual) : -1;

  if (!proyectoId) {
    return (
      <div className="entrevista-contenedor">
        <p>No se ha especificado un requerimiento para la entrevista.</p>
      </div>
    );
  }

  const turnoNumeroActual = turnoActual?.turno_numero ?? 0;
  const preguntaParaMostrar = limpiarMarkdown(
    turnoActual?.pregunta || turnoActual?.siguiente_pregunta ||
    turnoActual?.mensaje || turnoActual?.contenido || ''
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, height: '100%', padding: '1rem' }}>

      {/* Modal de bienvenida -- solo en entrevistas nuevas, sin historial previo */}
      {mostrarBienvenida && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Bienvenida a la entrevista"
          style={{
            position: 'fixed', inset: 0, zIndex: 50,
            background: 'rgba(15, 23, 42, 0.45)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <div style={{
            background: 'var(--surface-1, #ffffff)',
            borderRadius: 14,
            padding: '28px 26px',
            maxWidth: 420,
            boxShadow: '0 12px 32px rgba(0,0,0,0.18)',
          }}>
            <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary, #1e293b)', margin: '0 0 8px' }}>
              Bienvenido a la entrevista NBS
            </h2>
            <p style={{ fontSize: 13, color: 'var(--text-secondary, #64748b)', lineHeight: 1.6, margin: '0 0 16px' }}>
              MARVIN te hará preguntas puntuales para levantar tu requerimiento,
              organizadas en bloques temáticos (alcance, actores, proceso, reglas,
              datos). Puedes responder por texto o por voz, y adjuntar archivos de
              soporte en cualquier momento. Cuando termines, podrás generar un
              resumen HTML de toda la conversación.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setMostrarBienvenida(false)}
                style={{
                  padding: '7px 18px', borderRadius: 20,
                  border: '0.5px solid var(--border-accent, #93c5fd)',
                  background: 'var(--bg-accent, #dbeafe)',
                  fontSize: 12, cursor: 'pointer',
                  color: 'var(--text-accent, #2563eb)', fontWeight: 500,
                }}
              >
                Comenzar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de limpieza de datos de prueba -- mismo estilo que el de
          bienvenida, reemplaza confirm()/alert() nativos del navegador. */}
      {mostrarModalLimpiar && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Limpiar entrevista de prueba"
          style={{
            position: 'fixed', inset: 0, zIndex: 50,
            background: 'rgba(15, 23, 42, 0.45)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <div style={{
            background: 'var(--surface-1, #ffffff)',
            borderRadius: 14,
            padding: '28px 26px',
            maxWidth: 420,
            boxShadow: '0 12px 32px rgba(0,0,0,0.18)',
          }}>
            <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary, #1e293b)', margin: '0 0 8px' }}>
              🧹 Limpiar entrevista de prueba
            </h2>
            <p style={{ fontSize: 13, color: 'var(--text-secondary, #64748b)', lineHeight: 1.6, margin: '0 0 16px' }}>
              Se eliminará este proyecto de prueba por completo: sus respuestas,
              archivos adjuntos y el requerimiento mismo. Podrás crear uno nuevo
              cuando quieras.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button
                onClick={() => setMostrarModalLimpiar(false)}
                style={{
                  padding: '7px 18px', borderRadius: 20,
                  border: '0.5px solid var(--border, #e2e8f0)',
                  background: 'var(--surface-1, #ffffff)',
                  fontSize: 12, cursor: 'pointer',
                  color: 'var(--text-secondary, #64748b)', fontWeight: 500,
                }}
              >
                Cancelar
              </button>
              <button
                onClick={confirmarLimpiarDatosPrueba}
                style={{
                  padding: '7px 18px', borderRadius: 20,
                  border: '0.5px solid #FECACA',
                  background: '#FEF2F2',
                  fontSize: 12, cursor: 'pointer',
                  color: '#DC2626', fontWeight: 500,
                }}
              >
                Limpiar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Banner de entrevista ya completada -- se agrega ARRIBA del
          contenido existente, sin reemplazarlo. Aparece cuando el backend
          confirma proyectos.entrevista_completada_en (seteado al cerrar
          entrevista + generar resumen con éxito, ver routes/entrevistas.py
          ::generar_resumen). No fusiona esta página con Documentos.jsx --
          solo ofrece un enlace de navegación hacia ella. */}
      {entrevistaCompletadaEn && (
        <div style={{
          background: '#F0FDF4',
          border: '0.5px solid #BBF7D0',
          borderRadius: 10,
          padding: '12px 14px',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#166534' }}>
            ✅ Entrevista completada el {new Date(entrevistaCompletadaEn).toLocaleString()}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {urlResumen && (
              <a
                href={urlResumen}
                download
                style={{
                  padding: '5px 14px', borderRadius: 20, fontSize: 11,
                  border: '0.5px solid #86EFAC', background: '#DCFCE7',
                  color: '#166534', fontWeight: 500,
                  textDecoration: 'none',
                }}
              >
                ⬇ Descargar resumen HTML
              </a>
            )}
            {urlMinutaDocx && (
              <a
                href={urlMinutaDocx}
                download
                style={{
                  padding: '5px 14px', borderRadius: 20, fontSize: 11,
                  border: '0.5px solid #86EFAC', background: '#DCFCE7',
                  color: '#166534', fontWeight: 500,
                  textDecoration: 'none',
                }}
              >
                ⬇ Descargar minuta Word
              </a>
            )}
          </div>
          <div style={{ fontSize: 12, color: '#166534' }}>
            Revisa y aprueba los documentos en la sección Documentos.
          </div>
          <div>
            <button
              onClick={() => navigate(`/documentos/${proyectoId}`)}
              style={{
                padding: '6px 16px', borderRadius: 20,
                border: 'none', background: '#16A34A',
                color: '#fff', fontSize: 12, fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Ir a Documentos →
            </button>
          </div>
        </div>
      )}

      {/* Error general */}
      {errorGeneral && (
        <div role="alert" style={{
          background: 'var(--bg-danger, #fef2f2)',
          border: '0.5px solid var(--border-danger, #fecaca)',
          borderRadius: 8, padding: '8px 12px',
          fontSize: 12, color: 'var(--text-danger, #991b1b)',
        }}>
          {errorGeneral}
        </div>
      )}

      {/* Cargando */}
      {cargando && (
        <div style={{ fontSize: 12, color: 'var(--text-muted, #94a3b8)', padding: '1rem 0' }}>
          Cargando entrevista…
        </div>
      )}

      {/* Banner modo prueba -- persistente mientras es_prueba=1, sin botón
          de cierre; solo desaparece al desactivar el toggle del header. */}
      {esPrueba && (
        <div style={{
          background: '#FEF3C7',
          border: '0.5px solid #FDE68A',
          borderRadius: 8,
          padding: '8px 12px',
          fontSize: 12,
          color: '#92400E',
          fontWeight: 500,
        }}>
          🧪 Modo prueba — esta entrevista no se indexa en ChromaDB
        </div>
      )}

      {/* Aviso al ACTIVAR el modo prueba (0→1) -- no aparece al desactivar */}
      {avisoActivacionPrueba && (
        <div style={{
          background: '#FFFBEB',
          border: '0.5px solid #FDE68A',
          borderRadius: 8,
          padding: '8px 12px',
          fontSize: 11,
          color: '#92400E',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 8,
        }}>
          <span>
            Los datos de esta entrevista de prueba deben limpiarse manualmente
            antes de usar este proyecto en producción.
          </span>
          <button
            type="button"
            onClick={() => setAvisoActivacionPrueba(false)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#92400E', fontSize: 12 }}
            aria-label="Cerrar aviso"
          >
            ×
          </button>
        </div>
      )}

      {/* Pausada */}
      {!cargando && pausada && (
        <div style={{
          background: 'var(--bg-warning, #fef3c7)',
          border: '0.5px solid var(--border-warning, #fde68a)',
          borderRadius: 10, padding: '12px 14px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <span style={{ fontSize: 12, color: 'var(--text-warning, #92400e)', fontWeight: 500 }}>
            Entrevista pausada
          </span>
          <button
            onClick={retomarEntrevista}
            style={{
              padding: '4px 14px', borderRadius: 20,
              border: '0.5px solid var(--border-warning, #fde68a)',
              background: 'var(--bg-warning, #fef3c7)',
              fontSize: 11, cursor: 'pointer', color: 'var(--text-warning, #92400e)',
            }}
          >
            Retomar
          </button>
        </div>
      )}

      {!cargando && !pausada && turnoActual && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0, flex: 1 }}>

          {/* Header: tabs + contador */}
          <div style={{
            display: 'flex', gap: 4, alignItems: 'center',
            paddingBottom: 8, borderBottom: '0.5px solid var(--border, #e2e8f0)',
            marginBottom: 8,
          }}>
            {/* Tab Voz — solo si disponible (voz_habilitada='1' Y navegador
                soporta la API); si no, ni siquiera se muestra el selector:
                la entrevista opera en modo texto puro, silencioso. */}
            {vozDisponible && (
              <button
                onClick={() => setTabActiva('voz')}
                style={{
                  padding: '5px 14px', borderRadius: 20, fontSize: 11,
                  fontWeight: 500, cursor: 'pointer',
                  background: tabActiva === 'voz' ? 'var(--bg-accent, #dbeafe)' : 'transparent',
                  color: tabActiva === 'voz' ? 'var(--text-accent, #2563eb)' : 'var(--text-secondary, #64748b)',
                  border: tabActiva === 'voz'
                    ? '0.5px solid var(--border-accent, #93c5fd)'
                    : '0.5px solid var(--border, #e2e8f0)',
                }}
              >
                🎙 Voz — MARVIN
              </button>
            )}
            <button
              onClick={() => setTabActiva('texto')}
              style={{
                padding: '5px 14px', borderRadius: 20, fontSize: 11,
                fontWeight: 500, cursor: 'pointer',
                background: tabActiva === 'texto' ? 'var(--bg-accent, #dbeafe)' : 'transparent',
                color: tabActiva === 'texto' ? 'var(--text-accent, #2563eb)' : 'var(--text-secondary, #64748b)',
                border: tabActiva === 'texto'
                  ? '0.5px solid var(--border-accent, #93c5fd)'
                  : '0.5px solid var(--border, #e2e8f0)',
              }}
            >
              ⌨ Escrito
            </button>
            <div style={{ flex: 1 }} />
            {/* Contador preguntas */}
            <span style={{
              fontSize: 10, padding: '2px 8px', borderRadius: 10,
              background: 'var(--bg-accent, #dbeafe)', color: 'var(--text-accent, #2563eb)', fontWeight: 500,
            }}>
              {historial.filter(t => t.es_pregunta).length} / 12
            </span>

            {/* Resumen HTML — botón / spinner / descarga (o vista inline en modo prueba) */}
            {!generandoResumen && !urlResumen && !htmlResumenPrueba && (
              <button
                onClick={generarResumen}
                style={{
                  padding: '5px 14px', borderRadius: 20, fontSize: 11,
                  border: '0.5px solid var(--border, #e2e8f0)',
                  background: 'var(--surface-1, #ffffff)',
                  cursor: 'pointer', color: 'var(--text-secondary, #64748b)',
                  display: 'flex', alignItems: 'center', gap: 4,
                }}
                title="Generar resumen HTML de la entrevista"
              >
                ⬇ Generar resumen
              </button>
            )}
            {htmlResumenPrueba && (
              <span style={{
                padding: '5px 14px', borderRadius: 20, fontSize: 11,
                border: '0.5px solid #FDE68A', background: '#FEF3C7',
                color: '#92400E', fontWeight: 500,
              }}>
                🧪 Resumen generado (no persistido — ver abajo)
              </span>
            )}
            {urlResumen && (
              <a
                href={urlResumen}
                download
                style={{
                  padding: '5px 14px', borderRadius: 20, fontSize: 11,
                  border: '0.5px solid var(--border-accent, #93c5fd)',
                  background: 'var(--bg-accent, #dbeafe)',
                  color: 'var(--text-accent, #2563eb)', fontWeight: 500,
                  textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4,
                }}
              >
                ⬇ Descargar resumen HTML
              </a>
            )}
            {urlMinutaDocx && (
              <a
                href={urlMinutaDocx}
                download
                style={{
                  padding: '5px 14px', borderRadius: 20, fontSize: 11,
                  border: '0.5px solid var(--border-accent, #93c5fd)',
                  background: 'var(--bg-accent, #dbeafe)',
                  color: 'var(--text-accent, #2563eb)', fontWeight: 500,
                  textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4,
                }}
              >
                ⬇ Descargar minuta Word
              </a>
            )}
            {errorResumen && (
              <span style={{ fontSize: 10, color: 'var(--text-danger, #991b1b)' }}>
                {errorResumen}
              </span>
            )}
            {/* Toggle modo prueba -- vista de detalle del proyecto */}
            <label
              title="Modo prueba activo"
              style={{
                display: 'flex', alignItems: 'center', gap: 4,
                fontSize: 10, color: 'var(--text-secondary, #64748b)',
                cursor: cambiandoModoPrueba ? 'default' : 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={esPrueba}
                disabled={cambiandoModoPrueba}
                onChange={alternarModoPrueba}
              />
              Modo prueba
            </label>

            {/* Limpiar datos de prueba -- solo visible con es_prueba=1 */}
            {esPrueba && (
              <button
                onClick={() => setMostrarModalLimpiar(true)}
                disabled={limpiandoPrueba}
                style={{
                  padding: '3px 10px', borderRadius: 20, fontSize: 10,
                  border: '0.5px solid #FDE68A',
                  background: '#FFFBEB',
                  cursor: limpiandoPrueba ? 'default' : 'pointer',
                  color: '#92400E',
                  opacity: limpiandoPrueba ? 0.6 : 1,
                }}
                title="Elimina lógicamente entrevistas/adjuntos y borra los archivos físicos de esta prueba"
              >
                🧹 {limpiandoPrueba ? 'Limpiando…' : 'Limpiar datos de prueba'}
              </button>
            )}

            {/* Pausa */}
            <button
              onClick={pausarEntrevista}
              style={{
                padding: '3px 10px', borderRadius: 20, fontSize: 10,
                border: '0.5px solid var(--border, #e2e8f0)',
                background: 'var(--surface-1, #ffffff)',
                cursor: 'pointer', color: 'var(--text-secondary, #64748b)',
              }}
              aria-label="Pausar entrevista"
            >
              ⏸
            </button>
          </div>

          {/* Spinner de generación de resumen -- bloque completo, no cabe
              en la fila delgada del header junto al botón/contador. */}
          {generandoResumen && (
            <MarvinSpinner mensaje="Preparando resumen…" />
          )}

          {/* Vista inline del resumen en modo prueba -- no hay archivo
              persistido que descargar, se muestra directamente. */}
          {htmlResumenPrueba && (
            <div style={{ border: '0.5px solid var(--border, #e2e8f0)', borderRadius: 10, overflow: 'hidden' }}>
              <iframe
                title="Resumen de entrevista (modo prueba)"
                srcDoc={htmlResumenPrueba}
                style={{ width: '100%', height: 500, border: 'none' }}
              />
            </div>
          )}

          {/* Panel de cierre automático -- aparece al detectar fin de
              entrevista (semántico o límite duro de 12 preguntas). El
              botón cambia según haya o no un resumen ya generado, para no
              duplicar el botón "Generar resumen" del header: si ya existe
              (urlResumen/urlMinutaDocx/htmlResumenPrueba) ofrece "Descargar
              minuta" en su lugar. */}
          {entrevistaFinalizada && (
            <div style={{
              background: '#F0FDF4',
              border: '.5px solid #BBF7D0',
              borderRadius: 12,
              padding: '1rem 1.25rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              marginBottom: 8,
            }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#166534', marginBottom: 4 }}>
                  Entrevista completada
                </div>
                <div style={{ fontSize: 12, color: '#166534' }}>
                  MARVIN registró toda la información necesaria.
                  {urlMinutaDocx || urlResumen || htmlResumenPrueba
                    ? ' El resumen y la minuta ya están disponibles para descargar.'
                    : ' Genera el resumen para obtener los documentos.'}
                </div>
              </div>
              {urlMinutaDocx ? (
                <a
                  href={urlMinutaDocx}
                  download
                  style={{
                    padding: '8px 20px', borderRadius: 10,
                    border: 'none', background: '#16A34A',
                    color: '#fff', fontSize: 12,
                    fontWeight: 600, cursor: 'pointer',
                    whiteSpace: 'nowrap', flexShrink: 0,
                    textDecoration: 'none',
                  }}
                >
                  ⬇ Descargar minuta
                </a>
              ) : (
                <button
                  onClick={generarResumen}
                  disabled={generandoResumen || !!(urlResumen || htmlResumenPrueba)}
                  style={{
                    padding: '8px 20px', borderRadius: 10,
                    border: 'none', background: '#16A34A',
                    color: '#fff', fontSize: 12,
                    fontWeight: 600, cursor: 'pointer',
                    whiteSpace: 'nowrap', flexShrink: 0,
                    opacity: (urlResumen || htmlResumenPrueba) ? 0.6 : 1,
                  }}
                >
                  {generandoResumen ? 'Generando…' : '⬇ Generar resumen'}
                </button>
              )}
            </div>
          )}

          {/* Cuerpo: panel principal + minuta */}
          <div style={{ display: 'flex', gap: 10, flex: 1 }}>

            {/* Panel principal */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>

              {/* MODO VOZ */}
              {vozDisponible && tabActiva === 'voz' && (
                <EntrevistaVoz
                  proyectoId={proyectoId}
                  bloqueActual={bloqueActual}
                  turnoNumero={turnoNumeroActual}
                  preguntaActual={preguntaParaMostrar}
                  archivos={archivosAdjuntos}
                  onAgregarArchivo={onAgregarArchivo}
                  onQuitarArchivo={onQuitarArchivo}
                  onErrorMicrofono={onErrorMicrofono}
                  deshabilitado={entrevistaFinalizada}
                  onRespuesta={(data) => {
                    setTurnoActual(data);
                    // /responder-voz retorna un solo objeto que combina la
                    // transcripción del usuario (transcripcion) y la
                    // siguiente pregunta de MARVIN (siguiente_pregunta) --
                    // la minuta espera un turno por mensaje con es_pregunta,
                    // así que se descompone en dos entradas separadas.
                    setHistorial(prev => [
                      ...prev,
                      { id: `${data.id}-usuario`, es_pregunta: false, contenido: data.transcripcion },
                      { id: data.id, es_pregunta: true, contenido: data.siguiente_pregunta, bloque_tematico: data.bloque_tematico },
                    ]);
                    if (detectarFinEntrevista(data.pregunta || data.siguiente_pregunta || data.contenido)) {
                      setEntrevistaFinalizada(true);
                      hablarMarvin('La entrevista ha concluido. Puedes generar el resumen cuando estés listo.');
                    }
                    // Mismo orden que en modo texto: el turno ya existe
                    // (data.id) antes de subir cualquier adjunto pendiente.
                    subirAdjuntosPendientes(data);
                  }}
                />
              )}

              {/* MODO TEXTO */}
              {tabActiva === 'texto' && (
                <>
                  {/* Pregunta */}
                  <div style={{
                    background: 'var(--surface-2, #f1f5f9)',
                    border: '0.5px solid var(--border, #e2e8f0)',
                    borderRadius: 10, padding: '12px 14px',
                  }}>
                    <div style={{
                      display: 'flex', alignItems: 'center',
                      justifyContent: 'space-between', marginBottom: 5,
                    }}>
                      <div style={{
                        fontSize: 9, color: 'var(--text-muted, #94a3b8)',
                        fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em',
                      }}>
                        Pregunta actual
                      </div>
                      {/* Escuchar en modo texto */}
                      <button
                        onClick={() => hablarMarvin(preguntaParaMostrar)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 4,
                          padding: '3px 9px', borderRadius: 20,
                          border: '0.5px solid var(--border, #e2e8f0)',
                          background: 'var(--surface-1, #ffffff)',
                          fontSize: 10, color: 'var(--text-secondary, #64748b)', cursor: 'pointer',
                        }}
                        aria-label="Escuchar pregunta"
                      >
                        🔊 Escuchar
                      </button>
                    </div>
                    <p style={{
                      fontSize: 13, color: 'var(--text-primary, #1e293b)',
                      lineHeight: 1.6, margin: 0,
                    }}>
                      {preguntaParaMostrar}
                    </p>
                  </div>

                  {/* Textarea respuesta */}
                  <textarea
                    value={respuesta}
                    onChange={e => setRespuesta(e.target.value)}
                    placeholder={entrevistaFinalizada ? 'La entrevista ha concluido.' : 'Escribe tu respuesta aquí…'}
                    rows={4}
                    disabled={enviando || entrevistaFinalizada}
                    style={{
                      width: '100%', fontSize: 13, resize: 'vertical',
                      borderRadius: 8, padding: '9px 12px',
                      border: '0.5px solid var(--border, #e2e8f0)',
                      background: 'var(--surface-2, #f1f5f9)',
                      color: 'var(--text-primary, #1e293b)',
                      lineHeight: 1.6,
                    }}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) enviarRespuesta(e);
                    }}
                  />

                  {/* Adjuntos modo texto */}
                  <AdjuntosZona
                    archivos={archivosAdjuntos}
                    onAgregar={onAgregarArchivo}
                    onQuitar={onQuitarArchivo}
                    modo="texto"
                  />

                  {/* Enviar */}
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <button
                      onClick={enviarRespuesta}
                      disabled={enviando || !respuesta.trim() || entrevistaFinalizada}
                      style={{
                        padding: '6px 18px', borderRadius: 20,
                        border: '0.5px solid var(--border-accent, #93c5fd)',
                        background: 'var(--bg-accent, #dbeafe)',
                        fontSize: 12, cursor: 'pointer',
                        color: 'var(--text-accent, #2563eb)', fontWeight: 500,
                        opacity: (enviando || !respuesta.trim()) ? 0.5 : 1,
                      }}
                    >
                      {enviando ? 'Enviando…' : 'Enviar respuesta'}
                    </button>
                  </div>
                </>
              )}
            </div>

            {/* Minuta lateral */}
            <MarginalMinuta
              historial={historial}
              bloqueActual={bloqueActual}
              totalPreguntas={12}
            />
          </div>
        </div>
      )}
    </div>
  );
}
