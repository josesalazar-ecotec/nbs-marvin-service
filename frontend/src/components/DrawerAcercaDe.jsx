import { useEffect, useState } from 'react'
import { X, Mic } from 'lucide-react'

// Datos de identidad basica (nombre/cargo/institucion/email/footer) SIEMPRE
// vienen de GET /api/v2/autor (que lee backend/config_autor.json) -- nunca
// hardcodeados aqui. La trayectoria/CV extendida es copy estatico de la UI
// (no es dato de negocio editable), igual que cualquier otro texto de la
// interfaz, y vive en este componente.

const ESTADISTICAS = [
  { valor: '25+', label: 'años experiencia' },
  { valor: '8+', label: 'empresas' },
  { valor: '3', label: 'ERPs implementados' },
  { valor: '12+', label: 'certificaciones' },
]

const TIMELINE = [
  {
    empresa: 'Universidad ECOTEC',
    cargo: 'Subdirector TI',
    periodo: 'Ene 2024 - Presente',
    items: [
      'Arquitectura de software, estándares y seguridades de desarrollo',
      'Liderazgo: desarrollo NBS, soporte, infraestructura, Big Data e Innovación',
      'Implementación Cubos de Inteligencia de Negocios',
      'Mesa de ayuda para gestión de requerimientos',
    ],
  },
  {
    empresa: 'Universidad ECOTEC',
    cargo: 'Coordinador Software',
    periodo: 'Ago-Dic 2023',
    items: [
      'Líder de desarrollo plataforma inhouse NBS versión ECOTEC',
      'Diseño y desarrollo de bases de datos',
      'Toma de requerimientos y planificación de plataforma educativa NBS',
    ],
  },
  {
    empresa: 'Links',
    cargo: 'Chief Software Officer',
    periodo: 'Oct 2021 - Ago 2023',
    items: [
      'Preventa y desarrollo de plataforma NBS para administración educativa',
      'Reestructuración área de soporte y desarrollo de software',
    ],
  },
  {
    empresa: 'Livansud S.A.',
    cargo: 'Jefe de Tecnología',
    periodo: 'May 2020 - May 2021',
    items: [
      'SAP B1 v9.3 HANA: WMS con HandHeld, comisiones, extracto bancario (DIAPI)',
      'Implementación Firewall Forti Net, EDR Kaspersky, VeamBackup',
      'Facturación electrónica POS (MicroPOS), Cubos BI Cuentas por Cobrar',
    ],
  },
  {
    empresa: 'Diteca Komatsu SA',
    cargo: 'Coordinador Proyectos IT',
    periodo: 'Sep 2018 - Abr 2020',
    items: [
      'SAP B1 HANA v9.2→9.3: Komtrax, Webservice CLARO, Android Talleres',
      'Plan anual de proyectos alineado a objetivos estratégicos',
      'Indicadores de gestión mensuales de área y proyectos',
    ],
  },
  {
    empresa: 'Erco Energía',
    cargo: 'Analista Programador Senior',
    periodo: '2015 - 2018',
    items: [
      'Dynamics AX 2009: facturación electrónica (EcuaNexus), picking & packing',
      'BI con QlikView, automatización almacenaje pernos y tuercas',
      'OsTicket: servicio de atención cliente interno',
    ],
  },
  {
    empresa: 'Casa del Ruliman',
    cargo: null,
    periodo: 'Abr-Sep 2015',
    items: [
      'Módulo de comisiones AX 2012, cuadros de mando, KPIs & KGIs',
      'Levantamiento de procesos por área, socialización de procedimientos',
    ],
  },
  {
    empresa: 'Liris SA',
    cargo: 'Jefe de Sistemas',
    periodo: '2009 - 2013',
    items: [
      'Migración a ERP Dynamics AX 2009 con Novatech',
      'Módulos .NET: financieros, producción aves/reses, POS',
      'Soporte 24/7 equipo desarrollo',
    ],
  },
  {
    empresa: 'AmautaCorp + Telefirst SA',
    cargo: null,
    periodo: '2008 - 2009',
    items: [
      'Co-fundador Telefirst SA — asesoría ERP, CRM, SCM, BI',
      'Implementación ERP ADempiere — módulos administrativos financieros',
    ],
  },
  {
    empresa: 'Colegio Espíritu Santo / BuscaPersonas / Nestlé',
    cargo: null,
    periodo: '2000 - 2008',
    items: [
      'Programación FoxPro, VB.NET, .NET C#',
      'Nestlé: módulo control barredura JD Edwards',
      'Inicio de carrera en soporte técnico y atención a clientes',
    ],
  },
]

const HABILIDADES_BLANDAS = [
  'Liderazgo bajo presión',
  'Gestión de equipos multidisciplinarios',
  'Comunicación técnica y ejecutiva',
  'Innovación orientada a resultados',
  'Toma de decisiones basada en datos',
  'Mentoría y desarrollo de talento',
  'Negociación con proveedores',
  'Planificación estratégica',
]

const HABILIDADES_DURAS = [
  { categoria: 'ERP', valor: 'SAP B1 v9.2/9.3 HANA · Dynamics AX 2009/2012 · Dynamics 365 · ADempiere' },
  { categoria: 'BI & Datos', valor: 'Power BI · QlikView · Pentaho · SQL Server BI · ETL' },
  { categoria: 'Desarrollo', valor: 'Python · C# .NET · PHP · Java · Ax++ · PL/SQL · DIAPI SAP · VB.NET' },
  { categoria: 'Bases de datos', valor: 'SQL Server · HANA · MySQL · PostgreSQL · DBF' },
  { categoria: 'Gestión', valor: 'SCRUM · ITIL v3 · RPA · Balanced Scorecard · Supply Chain · PMBOK' },
  { categoria: 'Infraestructura', valor: 'Forti Net · Kaspersky EDR · VeamBackup · Redes estructuradas' },
]

const CERTIFICACIONES = [
  { titulo: 'Diplomado Arquitectura Software', entidad: 'U. Autónoma de Chile', fecha: '2026, en curso' },
  { titulo: 'Automatización Inteligente RPA', entidad: 'UESS', fecha: 'nov 2024', id: 'QmSMhmyNhernpfaQRYStnwvMsFGE6dC7FMnn7GrNKtWuKh' },
  { titulo: 'Gestión Procesos Automatización e Innovación', entidad: 'EELA Institute', fecha: 'ene 2025', id: 'DLI-EELA-00018567894041' },
  { titulo: 'Leadership Agility Certified', entidad: 'EAI', fecha: 'sep 2022' },
  { titulo: 'Planificación Supply Chain', entidad: 'ELITELOGIS', fecha: '2021', id: 'CP-SCM-ONL-2021-10011' },
  { titulo: 'SCRUM Master', entidad: 'AIBES', fecha: '2020', id: '21171624' },
  { titulo: 'Official SCRUM Fundamentals', entidad: 'AIBES', fecha: '2020', id: '21171588' },
  { titulo: 'Fundamentos SCRUM', entidad: 'CertiProf', fecha: '2020', id: 'CLVPSFSN-SSVLGTGH-XHRSYYYTXP' },
  { titulo: 'ITIL Foundation v3', entidad: 'INFOTRAINING', fecha: '2016', id: 'ITIL-21052016-09205' },
  { titulo: 'SAP B1 v9.2/9.3 HANA', entidad: 'Finanzas, Ventas, Compras, Producción, Inventario' },
  { titulo: 'ERP Dynamics AX 2009/2012', entidad: 'Módulos completos + Programación Ax++' },
]

const FORMACION = [
  { titulo: 'Ingeniería en Sistemas Inteligentes', entidad: 'ECOTEC', fecha: '2025, cursando' },
  { titulo: 'Diplomado Arquitectura Software', entidad: 'U. Autónoma de Chile', fecha: '2026, en curso' },
  { titulo: 'Ingeniería en Sistemas', entidad: 'UEES', fecha: 'último semestre 2006' },
  { titulo: 'Tecnólogo en Sistemas', entidad: 'Tecnológico Espíritu Santo', fecha: '2003-2004' },
  { titulo: 'Analista de Sistemas', entidad: 'Tecnológico Espíritu Santo', fecha: '2003' },
  { titulo: 'Bachillerato en Ciencias Informáticas', entidad: 'Colegio Cristóbal Colón' },
]

function Estadistica({ valor, label }) {
  return (
    <div className="text-center">
      <div className="text-lg font-bold text-ecotec-azul">{valor}</div>
      <div className="text-[10px] text-slate-500 leading-tight">{label}</div>
    </div>
  )
}

function TrayectoriaJose() {
  return (
    <div className="mt-3 space-y-5 text-sm">
      <section>
        <div className="grid grid-cols-4 gap-2 py-2">
          {ESTADISTICAS.map((e) => (
            <Estadistica key={e.label} {...e} />
          ))}
        </div>
      </section>

      <section>
        <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
          Trayectoria profesional
        </h4>
        <div className="space-y-3">
          {TIMELINE.map((t) => (
            <div key={t.empresa + t.periodo} className="border-l-2 border-ecotec-claro pl-3">
              <div className="text-[13px] font-medium text-slate-800">
                {t.empresa}
                {t.cargo && <span className="text-slate-500"> — {t.cargo}</span>}
              </div>
              <div className="text-[11px] text-slate-400 mb-1">{t.periodo}</div>
              <ul className="list-disc list-inside text-[12px] text-slate-600 space-y-0.5">
                {t.items.map((it) => (
                  <li key={it}>{it}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
          Habilidades blandas
        </h4>
        <div className="flex flex-wrap gap-1.5">
          {HABILIDADES_BLANDAS.map((h) => (
            <span key={h} className="text-[11px] bg-ecotec-claro text-ecotec-azul px-2 py-1 rounded-full">
              {h}
            </span>
          ))}
        </div>
      </section>

      <section>
        <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
          Habilidades duras
        </h4>
        <div className="grid grid-cols-2 gap-2">
          {HABILIDADES_DURAS.map((h) => (
            <div key={h.categoria} className="text-[11px]">
              <div className="font-semibold text-slate-700">{h.categoria}</div>
              <div className="text-slate-500">{h.valor}</div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
          Certificaciones
        </h4>
        <ul className="space-y-1.5">
          {CERTIFICACIONES.map((c) => (
            <li key={c.titulo + c.fecha} className="text-[12px]">
              <span className="font-medium text-slate-700">{c.titulo}</span>
              <span className="text-slate-400"> — {c.entidad}{c.fecha ? ` (${c.fecha})` : ''}</span>
              {c.id && <div className="text-[10px] text-slate-400">ID: {c.id}</div>}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
          Formación académica
        </h4>
        <ul className="space-y-1">
          {FORMACION.map((f) => (
            <li key={f.titulo} className="text-[12px] text-slate-600">
              <span className="font-medium text-slate-700">{f.titulo}</span> — {f.entidad}
              {f.fecha ? ` (${f.fecha})` : ''}
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

function TarjetaJose({ autor }) {
  const [expandido, setExpandido] = useState(false)

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4">
      <p className="font-semibold text-slate-800">{autor?.nombre || '—'}</p>
      <p className="text-[13px] text-slate-500">{autor?.cargo || '—'}</p>
      <p className="text-[13px] text-slate-500">{autor?.institucion || '—'}</p>
      <p className="text-[13px] text-slate-500">{autor?.email || '—'}</p>

      <button
        type="button"
        onClick={() => setExpandido((v) => !v)}
        className="mt-3 text-[12px] font-medium text-ecotec-acento hover:underline"
      >
        {expandido ? 'Ocultar trayectoria' : 'Ver trayectoria →'}
      </button>

      {expandido && <TrayectoriaJose />}
    </div>
  )
}

function TarjetaMarvin() {
  return (
    <div className="bg-[#241B3D] border border-[#3B2F5E] rounded-xl p-4 text-white">
      <div className="flex items-center justify-between">
        <p className="font-semibold tracking-wide">MARVIN</p>
        <span className="flex items-center gap-1 text-[11px] text-emerald-300">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
          </span>
          Disponible
        </span>
      </div>
      <p className="text-[11px] text-violet-300 mt-0.5">
        Model for AI Requirements Voice INtelligence
      </p>
      <span className="inline-block mt-2 text-[10px] bg-violet-800/50 text-violet-200 px-2 py-0.5 rounded-full">
        Asistente IA · NBS Platform
      </span>

      <dl className="mt-3 space-y-1.5 text-[11px] text-violet-200">
        <div>
          <dt className="text-violet-400">Función</dt>
          <dd>Entrevistador oral de requerimientos de software</dd>
        </div>
        <div>
          <dt className="text-violet-400">Modelo base</dt>
          <dd>Claude Haiku · Anthropic · Procesamiento en tiempo real</dd>
        </div>
        <div>
          <dt className="text-violet-400">Idioma</dt>
          <dd>Español (Ecuador) · Web Speech API + Whisper base</dd>
        </div>
        <div>
          <dt className="text-violet-400">Privacidad</dt>
          <dd>STT local (Whisper base) · TTS Microsoft Edge (es-EC-LuisNeural)</dd>
        </div>
        <div>
          <dt className="text-violet-400">Nombre elegido por</dt>
          <dd>José Salazar Campodónico</dd>
        </div>
      </dl>
    </div>
  )
}

const VOCES_DISPONIBLES = [
  { id: "es-EC-LuisNeural", label: "Luis — Ecuador (masculina)" },
  { id: "es-ES-AlvaroNeural", label: "Álvaro — España (masculina)" },
  { id: "es-MX-JorgeNeural", label: "Jorge — México (masculina)" },
  { id: "es-ES-ElviraNeural", label: "Elvira — España (femenina)" },
  { id: "es-MX-DaliaNeural", label: "Dalia — México (femenina)" },
];

function ConfigVozMarvin() {
  const [voz, setVoz] = useState(
    localStorage.getItem("marvin_voz") || "es-EC-LuisNeural"
  );
  const [velocidad, setVelocidad] = useState(
    parseFloat(localStorage.getItem("marvin_velocidad") || "1.0")
  );
  const [probando, setProbando] = useState(false);

  const guardar = () => {
    localStorage.setItem("marvin_voz", voz);
    localStorage.setItem("marvin_velocidad", velocidad.toString());
  };

  const probar = async () => {
    setProbando(true);
    try {
      const r = await fetch("/api/v2/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          texto: "Hola, soy MARVIN del sistema NBS de ECOTEC. Esta es mi voz configurada.",
          voice: voz,
          rate: velocidad,
        }),
      });
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.onended = () => { URL.revokeObjectURL(url); setProbando(false); };
      audio.play();
    } catch { setProbando(false); }
  };

  return (
    <div style={{ marginTop: "1rem", padding: "1rem",
      border: "1px solid var(--border)", borderRadius: 8,
      backgroundColor: "var(--surface-1)" }}>
      <div style={{ fontWeight: 600, fontSize: 12, color: "var(--text-muted)",
        textTransform: "uppercase", letterSpacing: ".06em", marginBottom: ".75rem" }}>
        Configuración de voz
      </div>

      <label style={{ fontSize: 12, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>
        Voz
      </label>
      <select value={voz} onChange={e => setVoz(e.target.value)}
        style={{ width: "100%", padding: "6px 8px", borderRadius: 6,
          border: "1px solid var(--border)", fontSize: 12,
          backgroundColor: "var(--surface-2)", color: "var(--text-primary)",
          marginBottom: ".75rem" }}>
        {VOCES_DISPONIBLES.map(v => (
          <option key={v.id} value={v.id}>{v.label}</option>
        ))}
      </select>

      <label style={{ fontSize: 12, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>
        Velocidad: {velocidad.toFixed(1)}x
      </label>
      <input type="range" min="0.5" max="1.5" step="0.1"
        value={velocidad} onChange={e => setVelocidad(parseFloat(e.target.value))}
        style={{ width: "100%", marginBottom: ".75rem" }} />

      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={probar} disabled={probando}
          style={{ flex: 1, padding: "6px 0", borderRadius: 6, border: "none",
            backgroundColor: "var(--text-accent)", color: "#fff",
            fontSize: 12, cursor: probando ? "not-allowed" : "pointer" }}>
          {probando ? "▶ Reproduciendo..." : "▶ Probar voz"}
        </button>
        <button onClick={guardar}
          style={{ flex: 1, padding: "6px 0", borderRadius: 6,
            border: "1px solid var(--border)", fontSize: 12,
            backgroundColor: "var(--surface-2)", color: "var(--text-primary)",
            cursor: "pointer" }}>
          Guardar
        </button>
      </div>
    </div>
  );
}

export default function DrawerAcercaDe({ abierto, onCerrar }) {
  const [autor, setAutor] = useState(null)

  useEffect(() => {
    if (abierto && !autor) {
      fetch('/api/v2/autor')
        .then((r) => r.json())
        .then(setAutor)
        .catch(() => setAutor({ nombre: '', cargo: '', institucion: '', email: '', footer_documento: '' }))
    }
  }, [abierto, autor])

  if (!abierto) return null

  return (
    <div
      onClick={onCerrar}
      className="absolute inset-0 bg-black/35 flex justify-end z-50"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-[380px] max-w-[92%] h-full bg-white shadow-2xl flex flex-col"
      >
        <div className="flex items-center justify-between px-5 pt-5">
          <div className="flex items-baseline gap-1">
            <span className="text-xl font-bold text-ecotec-azul">NBS</span>
            <sup className="text-[10px] font-bold text-ecotec-acento">PO</sup>
          </div>
          <button type="button" onClick={onCerrar} className="text-slate-400 hover:text-slate-600">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {!autor && <p className="text-sm text-slate-400">Cargando…</p>}
          {autor && (
            <>
              <TarjetaJose autor={autor} />
              <TarjetaMarvin />
              <ConfigVozMarvin />
            </>
          )}
        </div>

        <footer className="px-5 py-3 border-t border-slate-100 text-[11px] text-slate-400">
          NBS Platform v2.0
          <br />
          {autor?.footer_documento || 'Documento elaborado mediante uso de herramientas de IA'}
        </footer>
      </div>
    </div>
  )
}
