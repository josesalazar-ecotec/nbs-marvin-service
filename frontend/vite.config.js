import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5201,
    allowedHosts: true,
    proxy: {
      '/api/v2': 'http://localhost:8500',
      '/entrevista': 'http://localhost:8500',
      '/proyectos': 'http://localhost:8500',
      '/documentos': 'http://localhost:8500',
      '/supervision': 'http://localhost:8500',
    }
  }
})
