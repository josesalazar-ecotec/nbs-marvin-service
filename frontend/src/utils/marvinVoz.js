let _vozCacheada = null;

const VOCES_PREFERIDAS = [
  'Microsoft Pablo',
  'Microsoft Jorge',
  'Microsoft Alvaro',
  'Microsoft Diego',
  'Microsoft David',
  'Microsoft Mark',
  'Daniel',
  'Fred',
];

function _resolverVoz() {
  const voces = window.speechSynthesis.getVoices();
  if (!voces.length) return null;
  for (const nombre of VOCES_PREFERIDAS) {
    const v = voces.find(v => v.name.includes(nombre));
    if (v) return v;
  }
  return voces.find(v =>
    v.lang.startsWith('es') &&
    ['pablo','jorge','diego','carlos','miguel','alvaro','antonio']
      .some(x => v.name.toLowerCase().includes(x))
  ) || null;
}

// Chrome/Edge cargan la lista de voces de forma asincrona -- la primera
// llamada a getVoices() puede devolver [] antes de que dispare este evento.
// Cachear proactivamente aqui evita que obtenerVozMarvin() se quede con
// una voz null/incorrecta resuelta antes de tiempo (bug de voz doble/errónea).
if (typeof window !== 'undefined' && window.speechSynthesis) {
  window.speechSynthesis.onvoiceschanged = () => {
    _vozCacheada = _resolverVoz();
  };
}

export function obtenerVozMarvin() {
  if (_vozCacheada) return _vozCacheada;
  // Reintentar en cada llamada mientras no se haya resuelto una voz --
  // cubre el caso en que voiceschanged aun no disparo.
  _vozCacheada = _resolverVoz();
  return _vozCacheada;
}

let _audioActual = null;
let _fetchEnCurso = false;

export async function hablarMarvin(texto, onEnd) {
  if (!texto?.trim()) return;
  texto = texto.replace(/\s*_\(Pregunta \d+ de ~?\d+\)_\s*$/g, '').trim();
  if (_fetchEnCurso) return;  // bloquear llamada concurrente
  _fetchEnCurso = true;

  if (_audioActual) {
    _audioActual.pause();
    _audioActual.currentTime = 0;
    _audioActual = null;
  }

  try {
    const resp = await fetch('/api/v2/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        texto,
        voice: localStorage.getItem("marvin_voz") || "es-EC-LuisNeural",
        rate: parseFloat(localStorage.getItem("marvin_velocidad") || "1.0"),
      })
    });
    if (!resp.ok) throw new Error('TTS error');
    const blob = await resp.blob();
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    _audioActual = audio;
    audio.onended = () => {
      URL.revokeObjectURL(url);
      _audioActual = null;
      _fetchEnCurso = false;
      if (onEnd) onEnd();
    };
    audio.onerror = () => {
      _audioActual = null;
      _fetchEnCurso = false;
      if (onEnd) onEnd();
    };
    audio.play();
  } catch (e) {
    _fetchEnCurso = false;
    _audioActual = null;
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(texto);
      u.voice = obtenerVozMarvin();
      u.lang = 'es-ES';
      u.rate = 0.86;
      u.pitch = 0.80;
      if (onEnd) u.onend = onEnd;
      window.speechSynthesis.speak(u);
    } else {
      if (onEnd) onEnd();
    }
  }
}

export function detenerMarvin() {
  _fetchEnCurso = false;
  if (_audioActual) {
    _audioActual.pause();
    _audioActual.currentTime = 0;
    _audioActual = null;
  }
  if (window.speechSynthesis) window.speechSynthesis.cancel();
}
