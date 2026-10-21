import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import fs from 'node:fs';
import path from 'node:path';
import { autoResponder } from './src/server/autoResponder.ts';
import { humanPauseManager } from './src/server/humanPauseManager.ts';

function evolutionApiPlugin(): Plugin {
  return {
    name: 'evolution-api-proxy',
    configureServer(server) {
      // Carrega variáveis do .env para o process.env
      const env = loadEnv('development', process.cwd(), '');
      Object.assign(process.env, env);

      // Inicia o auto-responder se houver instâncias vinculadas ativas
      const activeLinks = autoResponder.getLinks().filter(l => l.enabled);
      if (activeLinks.length > 0) {
        autoResponder.startPolling();
      }

      server.middlewares.use(async (req, res, next) => {
        // Rotas de persistência do Catálogo de Mídias
        if (req.url?.startsWith('/api/media/')) {
          res.setHeader('Content-Type', 'application/json');
          const catalogsFile = path.resolve(process.cwd(), '.agent-media-catalogs.json');

          const readAllCatalogs = (): Record<string, any[]> => {
            try {
              if (fs.existsSync(catalogsFile)) {
                return JSON.parse(fs.readFileSync(catalogsFile, 'utf-8'));
              }
            } catch {}
            return {};
          };

          const saveAllCatalogs = (data: Record<string, any[]>) => {
            try {
              fs.writeFileSync(catalogsFile, JSON.stringify(data, null, 2), 'utf-8');
            } catch (err: any) {
              console.error('[Catalogs] Erro ao salvar catálogos no disco:', err.message);
            }
          };

          // Upload de arquivo de mídia
          if (req.url === '/api/media/upload' && req.method === 'POST') {
            try {
              const chunks: Buffer[] = [];
              for await (const chunk of req) {
                chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
              }
              const body = JSON.parse(Buffer.concat(chunks).toString('utf-8') || '{}');
              const uploadsDir = path.resolve(process.cwd(), 'public', 'uploads');
              if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

              const ext = body.ext || 'jpg';
              const fileName = `media_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.${ext}`;
              const filePath = path.join(uploadsDir, fileName);

              if (body.base64) {
                const rawData = body.base64.replace(/^data:[^;]+;base64,/, '');
                fs.writeFileSync(filePath, Buffer.from(rawData, 'base64'));
              }

              return res.end(JSON.stringify({
                success: true,
                url: `/uploads/${fileName}`,
                fileName,
              }));
            } catch (err: any) {
              res.statusCode = 500;
              return res.end(JSON.stringify({ error: err.message }));
            }
          }

          // GET /api/media/catalogs (todos os agentes)
          if (req.url === '/api/media/catalogs' && req.method === 'GET') {
            return res.end(JSON.stringify(readAllCatalogs()));
          }

          // GET /api/media/catalog/:agentId
          const getMatch = req.url.match(/^\/api\/media\/catalog\/([^/?]+)/);
          if (getMatch && req.method === 'GET') {
            const agentId = getMatch[1];
            const all = readAllCatalogs();
            let catalog = all[agentId] || [];
            if (catalog.length === 0) {
              const link = (typeof autoResponder.getLinks === 'function' ? autoResponder.getLinks() : []).find(l => l.agentId === agentId);
              if (link?.mediaCatalog && link.mediaCatalog.length > 0) {
                catalog = link.mediaCatalog;
                all[agentId] = catalog;
                saveAllCatalogs(all);
              }
            }
            return res.end(JSON.stringify({ success: true, catalog }));
          }

          // POST /api/media/catalog/:agentId
          const postMatch = req.url.match(/^\/api\/media\/catalog\/([^/?]+)/);
          if (postMatch && req.method === 'POST') {
            const agentId = postMatch[1];
            const chunks: Buffer[] = [];
            for await (const chunk of req) {
              chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
            }
            const bodyStr = Buffer.concat(chunks).toString('utf-8');
            const body = bodyStr ? JSON.parse(bodyStr) : {};
            const catalog = Array.isArray(body) ? body : (body.catalog || []);

            const all = readAllCatalogs();
            all[agentId] = catalog;
            saveAllCatalogs(all);

            try {
              if (typeof (autoResponder as any).updateAgentData === 'function') {
                autoResponder.updateAgentData(agentId, undefined, catalog);
              }
            } catch {}

            console.log(`[MediaCatalog] 💾 Salvas ${catalog.length} mídias para o agente ${agentId} no disco.`);
            return res.end(JSON.stringify({ success: true, catalog }));
          }

          return next();
        }

        // Rotas do Auto-Responder com IA
        if (req.url?.startsWith('/api/responder/')) {
          res.setHeader('Content-Type', 'application/json');

          if (req.url === '/api/responder/links' && req.method === 'GET') {
            return res.end(JSON.stringify(autoResponder.getLinks()));
          }

          if (req.url === '/api/responder/logs' && req.method === 'GET') {
            return res.end(JSON.stringify(autoResponder.getLogs()));
          }

          if (req.method === 'POST') {
            const chunks: Buffer[] = [];
            for await (const chunk of req) {
              chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
            }
            const bodyStr = Buffer.concat(chunks).toString('utf-8');
            const body = bodyStr ? JSON.parse(bodyStr) : {};

            if (req.url === '/api/responder/link') {
              autoResponder.linkInstance(body);
              return res.end(JSON.stringify({ success: true, links: autoResponder.getLinks() }));
            }

            if (req.url === '/api/responder/unlink') {
              autoResponder.unlinkInstance(body.instanceName);
              return res.end(JSON.stringify({ success: true, links: autoResponder.getLinks() }));
            }

            if (req.url === '/api/responder/update-agent') {
              try {
                const catalogsFile = path.resolve(process.cwd(), '.agent-media-catalogs.json');
                let all: Record<string, any[]> = {};
                try {
                  if (fs.existsSync(catalogsFile)) all = JSON.parse(fs.readFileSync(catalogsFile, 'utf-8'));
                } catch {}

                // Se mediaCatalog foi explicitamente passado com array de itens, salva no arquivo
                if (body.agentId && Array.isArray(body.mediaCatalog) && body.mediaCatalog.length > 0) {
                  all[body.agentId] = body.mediaCatalog;
                  fs.writeFileSync(catalogsFile, JSON.stringify(all, null, 2), 'utf-8');
                }

                // Obtém o catálogo preservado (o recebido se tiver itens, ou o já salvo em disco)
                const currentCatalog = Array.isArray(body.mediaCatalog) && body.mediaCatalog.length > 0
                  ? body.mediaCatalog
                  : (all[body.agentId] || undefined);

                if (typeof (autoResponder as any).updateAgentData === 'function') {
                  autoResponder.updateAgentData(body.agentId, body.prompt, currentCatalog);
                }
              } catch (err: any) {
                console.warn('[Vite Plugin] Erro ao sincronizar agente:', err.message);
              }
              const links = typeof (autoResponder as any).getLinks === 'function' ? autoResponder.getLinks() : [];
              return res.end(JSON.stringify({ success: true, links }));
            }
          }

          return next();
        }

        // Rotas de Pausa por Atendimento Humano
        if (req.url?.startsWith('/api/pauses')) {
          res.setHeader('Content-Type', 'application/json');

          if ((req.url === '/api/pauses' || req.url === '/api/pauses/') && req.method === 'GET') {
            return res.end(JSON.stringify(humanPauseManager.getAllActivePauses()));
          }

          const pauseMatch = req.url.match(/^\/api\/pauses\/([^/?]+)\/([^/?]+)/);
          if (pauseMatch && req.method === 'GET') {
            const inst = pauseMatch[1];
            const ph = pauseMatch[2];
            const isPaused = humanPauseManager.isPaused(inst, ph);
            const record = humanPauseManager.getPause(inst, ph);
            return res.end(JSON.stringify({ isPaused, record }));
          }

          if (req.method === 'POST') {
            const chunks: Buffer[] = [];
            for await (const chunk of req) {
              chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
            }
            const bodyStr = Buffer.concat(chunks).toString('utf-8');
            const body = bodyStr ? JSON.parse(bodyStr) : {};

            if (req.url === '/api/pauses/set') {
              const rec = humanPauseManager.setPause(body.instanceName, body.phone, body.lastHumanMessage, body.durationMs);
              return res.end(JSON.stringify({ success: true, record: rec }));
            }

            if (req.url === '/api/pauses/clear') {
              const ok = humanPauseManager.clearPause(body.instanceName, body.phone);
              return res.end(JSON.stringify({ success: true, cleared: ok }));
            }
          }

          return next();
        }

        // Webhook da Evolution API (/webhook/whatsapp ou /api/webhook)
        if ((req.url === '/webhook/whatsapp' || req.url === '/api/webhook' || req.url === '/webhook') && req.method === 'POST') {
          res.setHeader('Content-Type', 'application/json');
          try {
            const chunks: Buffer[] = [];
            for await (const chunk of req) {
              chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
            }
            const bodyStr = Buffer.concat(chunks).toString('utf-8');
            const body = bodyStr ? JSON.parse(bodyStr) : {};
            if (typeof autoResponder.handleWebhook === 'function') {
              autoResponder.handleWebhook(body);
            }
            return res.end(JSON.stringify({ success: true, received: true }));
          } catch (err: any) {
            res.statusCode = 500;
            return res.end(JSON.stringify({ error: err.message }));
          }
        }

        // Proxy da Evolution API
        if (!req.url?.startsWith('/api/evolution/')) {
          return next();
        }

        const currentEnv = loadEnv('development', process.cwd(), '');
        const apiUrl = currentEnv.EVOLUTION_API_URL?.replace(/\/$/, '') || 'https://api.doratec.site';
        const apiKey = currentEnv.EVOLUTION_API_KEY || '';

        const subPath = req.url.replace('/api/evolution', '');
        const targetUrl = `${apiUrl}${subPath}`;

        try {
          let bodyData: any = undefined;
          if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
            const chunks: Buffer[] = [];
            for await (const chunk of req) {
              chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
            }
            bodyData = Buffer.concat(chunks).toString('utf-8');
          }

          const response = await fetch(targetUrl, {
            method: req.method,
            headers: {
              'Content-Type': 'application/json',
              'apikey': apiKey,
            },
            body: bodyData,
          });

          res.statusCode = response.status;
          response.headers.forEach((value, key) => {
            if (key.toLowerCase() !== 'content-encoding') {
              res.setHeader(key, value);
            }
          });

          const data = await response.text();
          res.end(data);
        } catch (error: any) {
          console.error('[Evolution Proxy Error]', error);
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: error.message || 'Internal proxy error' }));
        }
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    evolutionApiPlugin(),
  ],
});
