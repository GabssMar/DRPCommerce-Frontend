import process from 'node:process'
import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  // O build vai para produção: os dados de exemplo nunca entram nele.
  if (command === 'build' && env.VITE_API_MODE === 'mock') {
    throw new Error('VITE_API_MODE=mock só vale no servidor de desenvolvimento (npm run dev). Remova a variável ou use http para o build.')
  }
  return {
    plugins: [vue()],
    server: {
      // Em dev, /api vai para o Commerce.Gateway (YARP). Não é usado com VITE_API_MODE=mock.
      // O Gateway local roda em HTTPS com certificado de desenvolvimento: secure: false.
      // A loja do cliente é o primeiro segmento do caminho, como em produção:
      // http://localhost:5173/teste/ (o Vite devolve o index.html para qualquer caminho).
      proxy: {
        '/api': {
          target: env.VITE_GATEWAY_URL || 'https://localhost:5000',
          changeOrigin: false,
          secure: false,
        },
      },
    },
  }
})
