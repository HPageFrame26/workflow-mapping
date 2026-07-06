import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/workflow-mapping/',   // ← exact repo name, slashes both sides
})
