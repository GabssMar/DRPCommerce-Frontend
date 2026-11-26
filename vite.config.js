import process from 'node:process'
import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [vue()],
    server: {
      // Em dev, /api vai para o Commerce.Gateway (YARP). Só usado com VITE_API_MODE=http.
      // O Gateway local roda em HTTPS com certificado de desenvolvimento: secure: false.
      // A loja do cliente vai no caminho (storefront/{slug}/...). Sem VITE_STORE_SLUG, o
      // front usa o subdomínio como slug: abra em http://teste.stores.localhost:5173.
      proxy: {
        '/api': {
          target: env.VITE_GATEWAY_URL || 'https://localhost:5000',
          changeOrigin: false,
          secure: false,
        },
      },
      // Libera os subdomínios das lojas no servidor de desenvolvimento.
      allowedHosts: ['.stores.localhost'],
    },
  }
})
