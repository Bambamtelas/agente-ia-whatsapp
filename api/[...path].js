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
    return res.status(200).json({ success: true, catalog: [] });
  }

  return res.status(404).json({ error: `Rota de API não encontrada: /api/${pathList.join('/')}` });
}
