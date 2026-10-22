import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
    plugins: [vue()],
    server: {
        // Le serveur PHP tournera ailleurs : on proxifie /api pour éviter les soucis de CORS en dev.
        proxy: { '/api': 'http://localhost:8000' },
    },
})
