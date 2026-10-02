/**
 * useMarvin — hook de grabación de voz para la entrevista.
 * Usa MediaRecorder API. Compatible con Chrome y Firefox.
 * No usa position:fixed. No usa localStorage.
 *
 * Extendido (rediseño Entrevista/EntrevistaVoz + skill marvin-voice-agent)
 * para soportar el flujo completo del mockup aprobado:
 *
 *   idle -> preparando -> grabando -> revisando -> enviando -> idle
 *                              |
 *                              -> interrumpiendo (limite de 120s alcanzado)
 *                                   -> rechazarFragmentar: registra tal cual
 *                                   -> aceptarFragmentar: registra y arranca
 *                                      automaticamente una nueva grabacion
 *                                      (continuacion en fragmentos)
 *
 * Ademas:
 *   - Deteccion de silencio (TC-04): AudioContext + AnalyserNode sobre el
 *     mismo stream del MediaRecorder, RMS por debajo de un umbral durante
 *     4s consecutivos -> expone `silencioDetectado=true` (no detiene la
 *     grabacion, solo informa a la UI para que MARVIN pregunte "¿sigues
 *     ahi?"). Se resetea en cuanto vuelve a haber señal por encima del
 *     umbral.
 *   - Error de microfono (TC-05): getUserMedia fallido -> estado='error'
 *     con mensaje claro; la UI (EntrevistaVoz) es responsable de ofrecer
 *     el cambio a modo texto (ver prop onErrorMicrofono).
 *
 * Estados expuestos: idle | preparando | grabando | revisando |
 *                     interrumpiendo | procesando | enviando | error
 */
import { useState, useRef, useCallback, useEffect } from 'react';
import axios from 'axios';

const BACKEND = import.meta.env.VITE_BACKEND_URL ?? '';
const LIMITE_SEGUNDOS = 120;
const UMBRAL_RMS_SILENCIO = 0.01;
const MS_SILENCIO_PARA_ALERTA = 4000;
const INTERVALO_ANALISIS_MS = 250;

export default function useMarvin({ proyectoId, bloqueActual, turnoNumero, onRespuesta }) {
  const [estado, setEstado] = useState('idle');
  const [segundosRestantes, setSegundosRestantes] = useState(LIMITE_SEGUNDOS);
  const [transcripcion, setTranscripcion] = useState('');
  const [blobUrl, setBlobUrl] = useState(null);
  const [error, setError] = useState(null);
  const [silencioDetectado, setSilencioDetectado] = useState(false);

  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const streamRef = useRef(null);
  const intervaloRef = useRef(null);
  const blobFinalRef = useRef(null);
  const continuarFragmentoRef = useRef(false);

  // --- Detección de silencio (AudioContext + AnalyserNode) --------------
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const intervaloSilencioRef = useRef(null);
  const msSilenciosAcumuladosRef = useRef(0);

  const limpiarIntervalo = useCallback(() => {
    if (intervaloRef.current) {
      clearInterval(intervaloRef.current);
      intervaloRef.current = null;
    }
  }, []);

  const detenerDeteccionSilencio = useCallback(() => {
    if (intervaloSilencioRef.current) {
      clearInterval(intervaloSilencioRef.current);
      intervaloSilencioRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    analyserRef.current = null;
    msSilenciosAcumuladosRef.current = 0;
    setSilencioDetectado(false);
  }, []);

  const iniciarDeteccionSilencio = useCallback((stream) => {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return; // navegador sin soporte -- degradar sin romper

      const audioContext = new AudioCtx();
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);

      audioContextRef.current = audioContext;
      analyserRef.current = analyser;
      msSilenciosAcumuladosRef.current = 0;

      const datos = new Uint8Array(analyser.fftSize);

      intervaloSilencioRef.current = setInterval(() => {
        analyser.getByteTimeDomainData(datos);
        let sumaCuadrados = 0;
        for (let i = 0; i < datos.length; i++) {
          const normalizado = (datos[i] - 128) / 128;
          sumaCuadrados += normalizado * normalizado;
        }
        const rms = Math.sqrt(sumaCuadrados / datos.length);

        if (rms < UMBRAL_RMS_SILENCIO) {
          msSilenciosAcumuladosRef.current += INTERVALO_ANALISIS_MS;
          if (msSilenciosAcumuladosRef.current >= MS_SILENCIO_PARA_ALERTA) {
            setSilencioDetectado(true);
          }
        } else {
          msSilenciosAcumuladosRef.current = 0;
          setSilencioDetectado(false);
        }
      }, INTERVALO_ANALISIS_MS);
    } catch (_err) {
      // Deteccion de silencio es una mejora opcional -- nunca debe romper
      // el flujo principal de grabacion si el navegador no la soporta.
    }
  }, []);

  const liberarBlobUrl = useCallback(() => {
    setBlobUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
  }, []);

  // Limpieza al desmontar el componente.
  useEffect(() => {
    return () => {
      limpiarIntervalo();
      detenerDeteccionSilencio();
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const enviarAlBackend = useCallback(async (blob) => {
    setEstado('enviando');
    setError(null);
    try {
      const form = new FormData();
      form.append('audio', blob, 'respuesta.webm');
      form.append('proyecto_id', proyectoId);
      form.append('bloque_actual', bloqueActual || '');
      form.append('turno_numero', turnoNumero || 0);

      const { data } = await axios.post(
        `${BACKEND}/api/v2/entrevistas/responder-voz`,
        form,
        { headers: { 'Content-Type': 'multipart/form-data' } }
      );
      setTranscripcion(data.transcripcion || '');
      liberarBlobUrl();
      blobFinalRef.current = null;

      if (onRespuesta) onRespuesta(data);

      if (continuarFragmentoRef.current) {
        // Fragmentación aceptada: se registró el fragmento actual, ahora
        // se arranca automáticamente la siguiente grabación en continuación.
        continuarFragmentoRef.current = false;
        setEstado('idle');
        // Pequeño respiro antes de re-arrancar para no solapar streams.
        setTimeout(() => iniciar(), 300);
      } else {
        setEstado('idle');
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Error al procesar el audio.');
      setEstado('error');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proyectoId, bloqueActual, turnoNumero, onRespuesta, liberarBlobUrl]);

  const detenerGrabacionInterna = useCallback((onListo) => {
    const recorder = mediaRecorderRef.current;
    detenerDeteccionSilencio();
    if (!recorder || recorder.state !== 'recording') {
      return;
    }
    recorder.onstop = () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
      blobFinalRef.current = blob;
      onListo(blob);
    };
    recorder.stop();
    limpiarIntervalo();
  }, [limpiarIntervalo, detenerDeteccionSilencio]);

  const iniciar = useCallback(async () => {
    setError(null);
    setTranscripcion('');
    liberarBlobUrl();
    setEstado('preparando');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setEstado('grabando');
      setSegundosRestantes(LIMITE_SEGUNDOS);
      iniciarDeteccionSilencio(stream);

      intervaloRef.current = setInterval(() => {
        setSegundosRestantes((prev) => {
          if (prev <= 1) {
            // Límite alcanzado: detener y preguntar si fragmentar.
            detenerGrabacionInterna((blob) => {
              const url = URL.createObjectURL(blob);
              setBlobUrl(url);
              setEstado('interrumpiendo');
            });
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } catch (err) {
      // TC-05: error de microfono -- estado='error' con mensaje claro.
      // La UI (EntrevistaVoz) decide como ofrecer el cambio a modo texto.
      setError('No se pudo acceder al micrófono: ' + err.message);
      setEstado('error');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liberarBlobUrl, detenerGrabacionInterna, iniciarDeteccionSilencio]);

  /**
   * registrar() es deliberadamente polimórfico segun el estado actual
   * (asi lo consume el mockup: el mismo boton/callback se usa para
   * "detener y revisar" mientras se graba, y para "confirmar y enviar"
   * una vez en la pantalla de revision).
   */
  const registrar = useCallback(() => {
    if (estado === 'grabando') {
      detenerGrabacionInterna((blob) => {
        const url = URL.createObjectURL(blob);
        setBlobUrl(url);
        setEstado('revisando');
      });
      return;
    }
    if (estado === 'revisando' && blobFinalRef.current) {
      enviarAlBackend(blobFinalRef.current);
    }
  }, [estado, detenerGrabacionInterna, enviarAlBackend]);

  const cambiar = useCallback(() => {
    // Descarta la grabación actual y vuelve a idle para re-grabar.
    liberarBlobUrl();
    blobFinalRef.current = null;
    setEstado('idle');
  }, [liberarBlobUrl]);

  const rechazarFragmentar = useCallback(() => {
    // "Registrar lo grabado": no fragmentar, enviar tal cual lo capturado.
    if (blobFinalRef.current) {
      enviarAlBackend(blobFinalRef.current);
    }
  }, [enviarAlBackend]);

  const aceptarFragmentar = useCallback(() => {
    // Envía el fragmento actual y, al terminar, arranca automáticamente
    // una nueva grabación de continuación (ver enviarAlBackend).
    continuarFragmentoRef.current = true;
    if (blobFinalRef.current) {
      enviarAlBackend(blobFinalRef.current);
    }
  }, [enviarAlBackend]);

  return {
    estado,
    segundosRestantes,
    transcripcion,
    blobUrl,
    error,
    silencioDetectado,
    iniciar,
    registrar,
    cambiar,
    aceptarFragmentar,
    rechazarFragmentar,
  };
}
