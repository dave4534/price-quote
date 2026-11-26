import {defineConfig, loadEnv} from 'vite';
import react from '@vitejs/plugin-react';

// In development the same API handler that runs on Vercel is mounted on /api.
const localApi = () => ({
  name: 'local-api',
  configureServer(server) {
    server.middlewares.use(async (req, res, next) => {
      if (!req.url.startsWith('/api/')) return next();
      const {default: handler} = await server.ssrLoadModule('/lib/router.js');
      await handler(req, res);
    });
  },
});

export default defineConfig(({mode}) => {
  Object.assign(process.env, loadEnv(mode, process.cwd(), ''));
  return {plugins: [react(), localApi()]};
});
