// Motor de geração de IA para os Agentes de Atendimento
export async function generateAIResponse(params: {
  provider: 'gemini' | 'openai' | 'groq' | 'anthropic' | string;
  model: string;
  systemPrompt: string;
  userMessage: string;
  conversationHistory?: Array<{ role: 'user' | 'assistant'; text: string }>;
  apiKeys: {
    gemini?: string;
    openai?: string;
    groq?: string;
    anthropic?: string;
  };
}): Promise<string> {
  const { provider, model, systemPrompt, userMessage, conversationHistory = [], apiKeys } = params;

  if (provider === 'gemini') {
    const key = apiKeys.gemini;
    if (!key || key.startsWith('AIzaSy...')) {
      throw new Error('Chave GEMINI_API_KEY não configurada no arquivo .env');
    }

    let preferredModel = model || 'gemini-3.5-flash-lite';
    if (preferredModel.includes('2.0') || preferredModel.includes('1.5') || preferredModel.includes('2.5')) {
      preferredModel = 'gemini-3.5-flash-lite';
    }

    const candidateModels = [preferredModel];
    if (preferredModel !== 'gemini-3.5-flash-lite') candidateModels.push('gemini-3.5-flash-lite');
    if (preferredModel !== 'gemini-3.5-flash') candidateModels.push('gemini-3.5-flash');

    // Garante que o histórico não comece com mensagem de assistente/model
    let validHistory = [...conversationHistory];
    while (validHistory.length > 0 && validHistory[0].role === 'assistant') {
      validHistory.shift();
    }

    // Agrupa mensagens consecutivas do mesmo papel (Gemini exige alternância de turnos user/model)
    const contents: any[] = [];
    for (const h of validHistory) {
      const geminiRole = h.role === 'assistant' ? 'model' : 'user';
      if (contents.length > 0 && contents[contents.length - 1].role === geminiRole) {
        contents[contents.length - 1].parts[0].text += '\n\n' + h.text;
      } else {
        contents.push({
          role: geminiRole,
          parts: [{ text: h.text }],
        });
      }
    }

    if (contents.length > 0 && contents[contents.length - 1].role === 'user') {
      contents[contents.length - 1].parts[0].text += '\n\n' + userMessage;
    } else {
      contents.push({
        role: 'user',
        parts: [{ text: userMessage }],
      });
    }

    let lastError: any = null;
    for (const currentModel of candidateModels) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${currentModel}:generateContent?key=${key}`;
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            system_instruction: {
              parts: [{ text: systemPrompt }],
            },
            contents,
            generationConfig: {
              temperature: 0.7,
              maxOutputTokens: 1000,
            },
          }),
        });

        if (!res.ok) {
          const err: any = await res.json().catch(() => ({}));
          lastError = new Error(`Erro Gemini ${currentModel} (${res.status}): ${err.error?.message || res.statusText}`);
          if (res.status === 429 || res.status === 503 || res.status === 404) {
            console.warn(`[AIEngine] Modelo ${currentModel} retornou ${res.status}. Tentando próximo modelo...`);
            continue;
          }
          throw lastError;
        }

        const data: any = await res.json();
        const replyText = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!replyText) {
          throw new Error('Gemini não retornou texto na resposta');
        }
        return replyText.trim();
      } catch (err: any) {
        lastError = err;
      }
    }

    throw lastError || new Error('Não foi possível obter resposta de nenhum modelo Gemini');
  }

  if (provider === 'openai') {
    const key = apiKeys.openai;
    if (!key || key.startsWith('sk-...')) {
      throw new Error('Chave OPENAI_API_KEY não configurada no arquivo .env');
    }

    const actualModel = model || 'gpt-4o-mini';
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: actualModel,
        messages: [
          { role: 'system', content: systemPrompt },
          ...conversationHistory.map(h => ({ role: h.role, content: h.text })),
          { role: 'user', content: userMessage },
        ],
        temperature: 0.7,
      }),
    });

    if (!res.ok) {
      const err: any = await res.json().catch(() => ({}));
      throw new Error(`Erro OpenAI (${res.status}): ${err.error?.message || res.statusText}`);
    }

    const data: any = await res.json();
    return data.choices?.[0]?.message?.content?.trim() || '';
  }

  throw new Error(`Provedor de IA "${provider}" ainda não suportado no motor.`);
}
