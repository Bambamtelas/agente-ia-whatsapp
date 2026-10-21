import webhookHandler from './webhook.js';

export default async function handler(req, res) {
  // Configura CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, apikey');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { path: pathSegments = [] } = req.query;
  const pathList = Array.isArray(pathSegments) ? pathSegments : [pathSegments];
  const section = pathList[0] || '';

  // 1. Webhook da Evolution API (/api/webhook)
  if (section === 'webhook' || req.url?.includes('/webhook')) {
    return webhookHandler(req, res);
  }

  // 1. Proxy para Evolution API (/api/evolution/*)
  if (section === 'evolution') {
    const apiUrl = (process.env.EVOLUTION_API_URL || 'https://api.doratec.site').replace(/\/$/, '');
    const apiKey = process.env.EVOLUTION_API_KEY || '1003be981b063ae8c3146ba09557a56245312581afb4891d36c316281665eb28';
    
    // Reconstrói o caminho após /api/evolution/
    const subPath = '/' + pathList.slice(1).join('/');
    
    // Preserva query parameters originais
    const urlObj = new URL(req.url, `https://${req.headers.host || 'localhost'}`);
    const search = urlObj.search || '';
    const targetUrl = `${apiUrl}${subPath}${search}`;

    try {
      let bodyData = undefined;
      if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
        if (typeof req.body === 'string') {
          bodyData = req.body;
        } else if (req.body && Object.keys(req.body).length > 0) {
          bodyData = JSON.stringify(req.body);
        }
      }

      const response = await fetch(targetUrl, {
        method: req.method,
        headers: {
          'Content-Type': 'application/json',
          'apikey': apiKey,
        },
        body: bodyData,
      });

      const responseText = await response.text();
      res.status(response.status);
      res.setHeader('Content-Type', response.headers.get('content-type') || 'application/json');
      return res.send(responseText);
    } catch (err) {
      console.error('[Vercel Evolution Proxy Error]', err);
      return res.status(500).json({ error: err.message || 'Erro ao conectar à Evolution API' });
    }
  }

  // 2. Healthcheck (/api/health)
  if (section === 'health') {
    return res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
  }

  // 3. Responder Links & Updates (/api/responder/*)
  if (section === 'responder') {
    return res.status(200).json({ success: true, links: [] });
  }

  // 4. Catálogo de Mídias (/api/media/*)
  if (section === 'media') {
    global.mediaCatalogsStore = global.mediaCatalogsStore || {
      '449726e1-53d6-477f-9bed-738e654e7f77': [
        {
          id: 'img-gestor-streamings',
          title: 'Gestor de Streamings',
          url: '/uploads/media_1792515638252_h44w8.png',
          trigger_prompt: 'Envie quando o cliente perguntar sobre o Gestor de Streamings.',
          caption: '🚀 Gestor de Streamings - Gestão de clientes e cobranças automáticas no WhatsApp!',
          created_at: '2026-10-20T17:05:28.603Z'
        },
        {
          id: 'img-mvgxk5na-lh0x',
          title: 'Divulga auto 2',
          url: '/uploads/media_1792515656020_zgkrc.png',
          trigger_prompt: 'Envie quando o cliente perguntar sobre o Auto Divulga Whats.',
          caption: 'Auto Divulga Whats.',
          created_at: '2026-10-20T17:01:29.110Z'
        }
      ]
    };

    const subAction = pathList[1] || '';
    const agentId = pathList[2] || '';

    // GET /api/media/catalogs
    if (subAction === 'catalogs') {
      return res.status(200).json(global.mediaCatalogsStore);
    }

    // GET & POST /api/media/catalog/:agentId
    if (subAction === 'catalog') {
      if (req.method === 'POST') {
        const newCatalog = Array.isArray(req.body) ? req.body : (req.body?.catalog || []);
        if (agentId) {
          global.mediaCatalogsStore[agentId] = newCatalog;
        }
        return res.status(200).json({ success: true, catalog: newCatalog });
      }

      const found = (agentId && global.mediaCatalogsStore[agentId]) || [];
      return res.status(200).json({ success: true, catalog: found });
    }

    // POST /api/media/upload
    if (subAction === 'upload') {
      const base64 = req.body?.base64;
      return res.status(200).json({ success: true, url: base64 || '' });
    }

    return res.status(200).json({ success: true, catalog: global.mediaCatalogsStore['449726e1-53d6-477f-9bed-738e654e7f77'] || [] });
  }

  // 5. Pausas de Atendimento Humano (/api/pauses/*)
  if (section === 'pauses') {
    return res.status(200).json({ success: true, pauses: [] });
  }

  // 6. Webhook (/api/webhook)
  if (section === 'webhook') {
    return res.status(200).json({ success: true, received: true });
  }

  return res.status(404).json({ error: `Rota de API não encontrada: /api/${pathList.join('/')}` });
}
