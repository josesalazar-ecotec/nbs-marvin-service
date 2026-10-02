import { useState } from 'react'
import { BrowserRouter, Routes, Route, useParams } from 'react-router-dom'
import { RequerimientoActivoProvider } from './context/RequerimientoActivoContext'
import Navbar from './components/Navbar'
import DrawerAcercaDe from './components/DrawerAcercaDe'
import Dashboard from './pages/Dashboard'
import NuevoRequerimiento from './pages/NuevoRequerimiento'
import Entrevista from './pages/Entrevista'
import Documentos from './pages/Documentos'
import PanelJira from './pages/PanelJira'
import ConsultorNBS from './pages/ConsultorNBS'
import ModelosDatos from './pages/ModelosDatos'
import Configuracion from './pages/Configuracion'

function EntrevistaRoute() {
  const { id } = useParams()
  return <Entrevista proyectoId={id} />
}

function DocumentosRoute() {
  const { id } = useParams()
  return <Documentos proyectoId={id} />
}

function JiraRoute() {
  const { id } = useParams()
  return <PanelJira proyectoId={id} />
}

export default function App() {
  const [drawerAbierto, setDrawerAbierto] = useState(false)

  return (
    <RequerimientoActivoProvider>
      <BrowserRouter>
        <div style={{ position: 'relative', display: 'flex', height: '100vh', overflow: 'hidden' }}>
          <Navbar onAcercaDe={() => setDrawerAbierto(true)} />
          <main style={{ flex: 1, overflowY: 'auto', background: '#F8FAFC' }}>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/requerimientos/nuevo" element={<NuevoRequerimiento />} />
              <Route path="/entrevista/:id" element={<EntrevistaRoute />} />
              <Route path="/documentos/:id" element={<DocumentosRoute />} />
              <Route path="/jira/:id" element={<JiraRoute />} />
              <Route path="/consultor" element={<ConsultorNBS />} />
              <Route path="/modelos" element={<ModelosDatos />} />
              <Route path="/configuracion" element={<Configuracion />} />
            </Routes>
          </main>

          <DrawerAcercaDe abierto={drawerAbierto} onCerrar={() => setDrawerAbierto(false)} />
        </div>
      </BrowserRouter>
    </RequerimientoActivoProvider>
  )
}
