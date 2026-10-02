import { useEffect, useRef, useState } from 'react';

/**
 * useTareaPolling
 * ----------------
 * Hook genérico de polling para tareas asíncronas del backend (patrón
 * "cola asíncrona" de la plataforma NBS v2.0 -- ver skill async-queue-python).
 *
 * Recibe un `tareaId` (o null/undefined si no hay tarea activa) y hace
 * polling periódico a `GET /api/v2/tareas/<id>` hasta que el campo
 * `estado` de la respuesta sea 'completado' o 'error'.
 *
 * Regla de buena ciudadanía en el navegador: se pausa el polling cuando
 * la pestaña no está visible (document.visibilityState !== 'visible')
 * y se reanuda automáticamente al volver a estar visible, para no
 * generar tráfico innecesario ni consumir cuota del backend mientras
 * el usuario no está mirando la pantalla.
 *
 * @param {number|string|null} tareaId
 * @param {{ intervaloMs?: number }} [opciones]
 * @returns {{ tarea: object|null, cargando: boolean, error: string|null }}
 */
export default function useTareaPolling(tareaId, opciones = {}) {
  const { intervaloMs = 2500 } = opciones;

  const [tarea, setTarea] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState(null);

  const intervalRef = useRef(null);
  const visibleRef = useRef(document.visibilityState === 'visible');
  const detenidoRef = useRef(false);

  useEffect(() => {
    // Reinicia estado al cambiar de tarea.
    setTarea(null);
    setError(null);
    detenidoRef.current = false;

    if (!tareaId) {
      return undefined;
    }

    setCargando(true);

    const consultar = async () => {
      // No consultar si la pestaña está oculta ni si ya terminamos.
      if (!visibleRef.current || detenidoRef.current) {
        return;
      }
      try {
        const resp = await fetch(`/api/v2/tareas/${tareaId}`);
        if (!resp.ok) {
          throw new Error(`Error HTTP ${resp.status} al consultar la tarea`);
        }
        const data = await resp.json();
        setTarea(data);
        setError(null);

        if (data?.estado === 'completado' || data?.estado === 'error') {
          detenidoRef.current = true;
          setCargando(false);
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
        }
      } catch (err) {
        setError(err?.message || 'Error al consultar la tarea');
      }
    };

    // Primera consulta inmediata.
    consultar();

    intervalRef.current = setInterval(consultar, intervaloMs);

    const onVisibilityChange = () => {
      const visible = document.visibilityState === 'visible';
      visibleRef.current = visible;
      // Al volver a estar visible, consultar de inmediato en vez de
      // esperar al siguiente tick del intervalo.
      if (visible && !detenidoRef.current) {
        consultar();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      detenidoRef.current = true;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [tareaId, intervaloMs]);

  return { tarea, cargando, error };
}
