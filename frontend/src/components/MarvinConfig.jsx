/**
 * MarvinConfig — UI editable de frases de MARVIN.
 * Se monta como sección colapsable en Configuracion.jsx.
 */
import { useState, useEffect } from 'react';
import { hablarMarvin } from '../utils/marvinVoz';

const EVENTOS_LABELS = {
  inicio_turno:        'Al iniciar cada turno',
  antes_registrar:     'Antes de registrar la respuesta',
  cambiar_confirmado:  'Al cambiar la respuesta',
  respuesta_larga:     'Si la respuesta supera 120 segundos',
  silencio_detectado:  'Si detecta silencio prolongado',
  error_microfono:     'Si el micrófono falla',
  fragmento_guardado:  'Al guardar un fragmento',
  entrevista_completa: 'Al finalizar la entrevista',
};

export default function MarvinConfig() {
  const [frases, setFrases] = useState({});
  const [editando, setEditando] = useState({});
  const [guardando, setGuardando] = useState({});
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    fetch('/api/v2/marvin/frases')
      .then(r => r.ok ? r.json() : {})
      .then(data => setFrases(data))
      .catch(() => setFrases({}))
      .finally(() => setCargando(false));
  }, []);

  async function guardar(evento) {
    const texto = editando[evento]?.trim();
    if (!texto) return;
    setGuardando(g => ({ ...g, [evento]: true }));
    try {
      const resp = await fetch(`/api/v2/marvin/frases/${evento}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texto }),
      });
      if (resp.ok) {
        setFrases(f => ({ ...f, [evento]: { ...f[evento], texto } }));
        setEditando(e => { const n = { ...e }; delete n[evento]; return n; });
      }
    } finally {
      setGuardando(g => ({ ...g, [evento]: false }));
    }
  }

  if (cargando) return (
    <div style={{ fontSize: 11, color: '#94A3B8', padding: '8px 0' }}>
      Cargando frases de MARVIN…
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {Object.entries(EVENTOS_LABELS).map(([evento, label]) => {
        const frase = frases[evento];
        const texto = editando[evento] ?? frase?.texto ?? '';
        const modificado = evento in editando;

        return (
          <div key={evento} style={{
            padding: '10px 0',
            borderBottom: '.5px solid #F1F5F9',
            display: 'flex', flexDirection: 'column', gap: 5,
          }}>
            <div style={{ fontSize: 11, color: '#475569', fontWeight: 500 }}>
              {label}
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
              <textarea
                value={texto}
                onChange={e => setEditando(ed => ({ ...ed, [evento]: e.target.value }))}
                rows={2}
                style={{
                  flex: 1, fontSize: 12, resize: 'vertical',
                  borderRadius: 6, padding: '5px 8px',
                  border: '.5px solid #E2E8F0',
                  background: '#F8FAFC',
                  color: '#1E293B',
                  lineHeight: 1.5,
                }}
              />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <button
                  type="button"
                  onClick={() => hablarMarvin(texto)}
                  style={{
                    padding: '4px 10px', borderRadius: 6, fontSize: 10,
                    border: '.5px solid #E2E8F0', background: '#fff',
                    cursor: 'pointer', color: '#64748B',
                  }}
                >
                  ▶ Escuchar
                </button>
                {modificado && (
                  <button
                    type="button"
                    onClick={() => guardar(evento)}
                    disabled={guardando[evento]}
                    style={{
                      padding: '4px 10px', borderRadius: 6, fontSize: 10,
                      border: '.5px solid #BFDBFE', background: '#EFF6FF',
                      cursor: 'pointer', color: '#1D4ED8', fontWeight: 500,
                    }}
                  >
                    {guardando[evento] ? '…' : 'Guardar'}
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
