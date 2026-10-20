# 🤖 Sistema Agente de IA para Atendimento WhatsApp

Sistema completo de atendimento comercial automatizado com Inteligência Artificial (Google Gemini) integrado ao WhatsApp via Evolution API, catálogo de imagens/banners e painel administrativo.

---

## 🚀 Como subir para o GitHub

1. Crie um novo repositório vazio no seu [GitHub](https://github.com/new) (ex: `sistema-agente-ia`).
2. No seu computador, abra o terminal nesta pasta e execute:

```bash
git remote add origin https://github.com/SEU_USUARIO/NOME_DO_REPOSITORIO.git
git push -u origin main
```

---

## ☁️ Deploy no Koyeb (Passo a Passo)

1. Acesse **[Koyeb.com](https://app.koyeb.com/)** e faça login (pode entrar com o GitHub).
2. Clique em **"Create App"** ou **"Create Service"**.
3. Escolha **GitHub** como fonte e selecione o repositório que você acabou de subir.
4. Na tela de configuração:
   - **Service Type:** Web Service
   - **Instance Type:** `Free` (Nano)
   - **Build Command:** `npm run build`
   - **Run Command:** `npm start`
   - **Port:** `3000` (ou deixe o padrão do Koyeb que detecta a variável `PORT`)
5. Em **Environment variables (Variáveis de Ambiente)**, adicione:

| Chave | Valor |
| :--- | :--- |
| `VITE_SUPABASE_URL` | Sua URL do Supabase |
| `VITE_SUPABASE_ANON_KEY` | Sua Anon Key do Supabase |
| `EVOLUTION_API_URL` | `https://api.doratec.site` (ou sua URL) |
| `EVOLUTION_API_KEY` | Sua Chave da Evolution API |
| `GEMINI_API_KEY` | Sua Chave do Google Gemini |

6. Clique em **"Deploy"**! Em cerca de 2 minutos seu sistema estará no ar com link seguro `https://sua-app.koyeb.app`.

---

## 💓 Como manter 24/7 Gratuito sem Dormir

O plano gratuito do Koyeb hiberna se passar 1 hora sem visitas. Para manter o robô ativo 24 horas por dia:

1. Acesse o **[UptimeRobot.com](https://uptimerobot.com/)** (grátis) e crie uma conta.
2. Clique em **"+ Add New Monitor"**:
   - **Monitor Type:** `HTTP(s)`
   - **Friendly Name:** `Agente WhatsApp`
   - **URL (or IP):** `https://sua-app.koyeb.app/health`
   - **Monitoring Interval:** `5 minutes`
3. Salve o monitor! 

Pronto! O UptimeRobot fará um ping a cada 5 minutos no endpoint `/health`, mantendo o seu servidor e o robô **sempre acordados 24/7 sem nenhum custo**.
