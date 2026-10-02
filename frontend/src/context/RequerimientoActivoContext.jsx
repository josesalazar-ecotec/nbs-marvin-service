import { createContext, useContext, useEffect, useState } from 'react'

/**
 * Contexto minimo para que Navbar sepa si hay un "requerimiento activo" y
 * pueda mostrar/ocultar los items contextuales (Entrevista, Documentos,
 * Jira) y armar sus links con el id correcto, sin tener que pasar props
 * manualmente a traves de todo el arbol.
 *
 * Persiste en localStorage para sobrevivir refrescos de pagina (no es
 * critico, solo conveniencia de navegacion).
 */
const RequerimientoActivoContext = createContext({
  requerimientoActivo: null,
  setRequerimientoActivo: () => {},
})

const CLAVE_STORAGE = 'nbs_requerimiento_activo'

export function RequerimientoActivoProvider({ children }) {
  const [requerimientoActivo, setRequerimientoActivoState] = useState(() => {
    try {
      const guardado = localStorage.getItem(CLAVE_STORAGE)
      return guardado ? JSON.parse(guardado) : null
    } catch {
      return null
    }
  })

  useEffect(() => {
    try {
      if (requerimientoActivo) {
        localStorage.setItem(CLAVE_STORAGE, JSON.stringify(requerimientoActivo))
      } else {
        localStorage.removeItem(CLAVE_STORAGE)
      }
    } catch {
      // localStorage no disponible -- no es critico, se ignora.
    }
  }, [requerimientoActivo])

  function setRequerimientoActivo(requerimiento) {
    // requerimiento: {id, nombre, codigo} o null para limpiar la seleccion.
    setRequerimientoActivoState(requerimiento)
  }

  return (
    <RequerimientoActivoContext.Provider value={{ requerimientoActivo, setRequerimientoActivo }}>
      {children}
    </RequerimientoActivoContext.Provider>
  )
}

export function useRequerimientoActivo() {
  return useContext(RequerimientoActivoContext)
}
