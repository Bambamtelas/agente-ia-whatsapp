import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { autoResponder } from './src/server/autoResponder.ts';

// Carrega variáveis do arquivo .env se existir localmente
const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
      const idx = trimmed.indexOf('=');
      const key = trimmed.substring(0, idx).trim();
      const val = trimmed.substring(idx + 1).trim();
      if (!process.env[key]) {
        process.env[key] = val;
      }
    }
  }
}

const PORT = process.env.PORT || 3000;
const UPLOADS_DIR = path.resolve(process.cwd(), 'public', 'uploads');
const DIST_DIR = path.resolve(process.cwd(), 'dist');
const CATALOGS_FILE = path.resolve(process.cwd(), '.agent-media-catalogs.json');

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Inicia o motor do WhatsApp se houver agentes ativos
console.log('[Server] 🚀 Inicializando servidor de produção para Koyeb / Cloud...');
try {
  const activeLinks = autoResponder.getLinks().filter(l => l.enabled);
  console.log(`[Server] Instâncias vinculadas ativas: ${activeLinks.length}`);
  autoResponder.startPolling();
} catch (err) {
  console.error('[Server] Erro ao iniciar AutoResponder:', err);
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
};

function readAllCatalogs() {
  try {
    if (fs.existsSync(CATALOGS_FILE)) {
      return JSON.parse(fs.readFileSync(CATALOGS_FILE, 'utf-8'));
    }
  } catch {}
  return {};
}

function saveAllCatalogs(data) {
  try {
    fs.writeFileSync(CATALOGS_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error('[Catalogs] Erro ao salvar catálogos:', err.message);
  }
}

async function parseBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  const str = Buffer.concat(chunks).toString('utf-8');
  return str ? JSON.parse(str) : {};
}

const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;

  // 1. Healthcheck (usado por Koyeb e UptimeRobot)
  if (pathname === '/health' || pathname === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({
      status: 'ok',
      uptime: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
      activeLinks: autoResponder.getLinks().length,
    }));
  }

  // 2. Rotas de Mídias (/api/media/*)
  if (pathname.startsWith('/api/media/')) {
    res.setHeader('Content-Type', 'application/json');

    // Upload
    if (pathname === '/api/media/upload' && req.method === 'POST') {
      try {
        const body = await parseBody(req);
        const ext = body.ext || 'jpg';
        const fileName = `media_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.${ext}`;
        const filePath = path.join(UPLOADS_DIR, fileName);

        if (body.base64) {
          const rawData = body.base64.replace(/^data:image\/\w+;base64,/, '');
          fs.writeFileSync(filePath, Buffer.from(rawData, 'base64'));
        }

        return res.end(JSON.stringify({ success: true, url: `/uploads/${fileName}`, fileName }));
      } catch (err) {
        res.statusCode = 500;
        return res.end(JSON.stringify({ error: err.message }));
      }
    }

    // Todos os catálogos
    if (pathname === '/api/media/catalogs' && req.method === 'GET') {
      return res.end(JSON.stringify(readAllCatalogs()));
    }

    // Catálogo individual
    const catMatch = pathname.match(/^\/api\/media\/catalog\/([^/?]+)/);
    if (catMatch) {
      const agentId = catMatch[1];
      if (req.method === 'GET') {
        const all = readAllCatalogs();
        let catalog = all[agentId] || [];
        if (catalog.length === 0) {
          const link = autoResponder.getLinks().find(l => l.agentId === agentId);
          if (link?.mediaCatalog && link.mediaCatalog.length > 0) {
            catalog = link.mediaCatalog;
            all[agentId] = catalog;
            saveAllCatalogs(all);
          }
        }
        return res.end(JSON.stringify({ success: true, catalog }));
      }

      if (req.method === 'POST') {
        try {
          const body = await parseBody(req);
          const catalog = Array.isArray(body) ? body : (body.catalog || []);
          const all = readAllCatalogs();
          all[agentId] = catalog;
          saveAllCatalogs(all);

          if (typeof autoResponder.updateAgentData === 'function') {
            autoResponder.updateAgentData(agentId, undefined, catalog);
          }

          return res.end(JSON.stringify({ success: true, catalog }));
        } catch (err) {
          res.statusCode = 500;
          return res.end(JSON.stringify({ error: err.message }));
        }
      }
    }

    res.statusCode = 404;
    return res.end(JSON.stringify({ error: 'Endpoint não encontrado' }));
  }

  // 3. Rotas do Auto-Responder (/api/responder/*)
  if (pathname.startsWith('/api/responder/')) {
    res.setHeader('Content-Type', 'application/json');

    if (pathname === '/api/responder/links' && req.method === 'GET') {
      return res.end(JSON.stringify(autoResponder.getLinks()));
    }

    if (pathname === '/api/responder/logs' && req.method === 'GET') {
      return res.end(JSON.stringify(autoResponder.getLogs()));
    }

    if (req.method === 'POST') {
      try {
        const body = await parseBody(req);

        if (pathname === '/api/responder/link') {
          autoResponder.linkInstance(body);
          return res.end(JSON.stringify({ success: true, links: autoResponder.getLinks() }));
        }

        if (pathname === '/api/responder/unlink') {
          autoResponder.unlinkInstance(body.instanceName);
          return res.end(JSON.stringify({ success: true, links: autoResponder.getLinks() }));
        }

        if (pathname === '/api/responder/update-agent') {
          const all = readAllCatalogs();
          if (body.agentId && Array.isArray(body.mediaCatalog) && body.mediaCatalog.length > 0) {
            all[body.agentId] = body.mediaCatalog;
            saveAllCatalogs(all);
          }
          const currentCatalog = Array.isArray(body.mediaCatalog) && body.mediaCatalog.length > 0
            ? body.mediaCatalog
            : (all[body.agentId] || undefined);

          if (typeof autoResponder.updateAgentData === 'function') {
            autoResponder.updateAgentData(body.agentId, body.prompt, currentCatalog);
          }
          return res.end(JSON.stringify({ success: true, links: autoResponder.getLinks() }));
        }
      } catch (err) {
        res.statusCode = 500;
        return res.end(JSON.stringify({ error: err.message }));
      }
    }

    res.statusCode = 404;
    return res.end(JSON.stringify({ error: 'Endpoint não encontrado' }));
  }

  // 4. Proxy da Evolution API (/api/evolution/*)
  if (pathname.startsWith('/api/evolution/')) {
    const apiUrl = (process.env.EVOLUTION_API_URL || 'https://api.doratec.site').replace(/\/$/, '');
    const apiKey = process.env.EVOLUTION_API_KEY || '';
    const subPath = pathname.replace('/api/evolution', '');
    const targetUrl = `${apiUrl}${subPath}${parsedUrl.search}`;

    try {
      let bodyData = undefined;
      if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
        const chunks = [];
        for await (const chunk of req) {
          chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
        }
        bodyData = Buffer.concat(chunks);
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
      return res.end(data);
    } catch (err) {
      console.error('[Evolution Proxy Error]', err);
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ error: err.message || 'Erro no proxy Evolution' }));
    }
  }

  // 5. Arquivos estáticos de uploads (/uploads/*)
  if (pathname.startsWith('/uploads/')) {
    const relFile = pathname.replace(/^\/uploads\//, '');
    const filePath = path.join(UPLOADS_DIR, relFile);
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
      return fs.createReadStream(filePath).pipe(res);
    }
    res.statusCode = 404;
    return res.end('Arquivo de upload não encontrado');
  }

  // 6. Frontend compilado (Vite dist/) e SPA Fallback
  let staticPath = path.join(DIST_DIR, pathname);
  if (fs.existsSync(staticPath) && fs.statSync(staticPath).isFile()) {
    const ext = path.extname(staticPath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
    return fs.createReadStream(staticPath).pipe(res);
  }

  // SPA fallback para index.html
  const indexPath = path.join(DIST_DIR, 'index.html');
  if (fs.existsSync(indexPath)) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return fs.createReadStream(indexPath).pipe(res);
  }

  res.statusCode = 404;
  res.end('Execute `npm run build` para gerar os arquivos estáticos do frontend.');
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[Server] ✅ Servidor de produção ativo na porta ${PORT}`);
  console.log(`[Server] 🌐 Acesse: http://localhost:${PORT}`);
  console.log(`[Server] 💓 Health check: http://localhost:${PORT}/health`);
});
