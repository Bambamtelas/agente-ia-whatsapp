import React, { useState, useEffect, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Save,
  Bot,
  CheckCircle,
  Database,
  Image as ImageIcon,
  Plus,
  Trash2,
  Edit2,
  Upload,
  Eye,
  X,
  Sparkles,
  HelpCircle,
  Mic,
  Volume2,
  Square,
} from 'lucide-react';
import { AI_PROVIDERS } from '../types';
import type { Agent, AIProvider, AgentMediaItem } from '../types';
import { isSupabaseConfigured } from '../lib/supabase';
import { fetchAgentById, saveAgent } from '../lib/agentsService';
import toast from 'react-hot-toast';

const defaultAgent: Partial<Agent> = {
  name: '',
  description: '',
  prompt: '',
  ai_provider: 'gemini',
  ai_model: 'gemini-3.5-flash-lite',
  is_active: true,
  media_catalog: [],
};

// Redimensiona imagem automaticamente para manter leveza e envio instantâneo no WhatsApp
function compressAndResizeImage(file: File, maxWidth = 1200, maxHeight = 1200, quality = 0.82): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(e.target?.result as string);
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = reject;
      img.src = e.target?.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

const AgentForm: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isNew = id === 'new';

  const [form, setForm] = useState<Partial<Agent>>(defaultAgent);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(!isNew);
  const [saved, setSaved] = useState(false);

  // Estados do Modal de Adicionar/Editar Mídia (Imagens e Áudios)
  const [isMediaModalOpen, setIsMediaModalOpen] = useState(false);
  const [editingMediaIndex, setEditingMediaIndex] = useState<number | null>(null);
  const [mediaType, setMediaType] = useState<'image' | 'audio'>('image');
  const [mediaTitle, setMediaTitle] = useState('');
  const [mediaTrigger, setMediaTrigger] = useState('');
  const [mediaCaption, setMediaCaption] = useState('');
  const [mediaDataUrl, setMediaDataUrl] = useState('');
  const [mediaUrlInput, setMediaUrlInput] = useState('');
  const [isUploadingFile, setIsUploadingFile] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [previewZoomUrl, setPreviewZoomUrl] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingTimerRef = useRef<any>(null);

  useEffect(() => {
    if (!isNew && id) {
      setIsLoading(true);
      fetchAgentById(id)
        .then(found => {
          if (found) {
            setForm({
              ...found,
              media_catalog: found.media_catalog || [],
            });
          }
        })
        .finally(() => setIsLoading(false));
    }
  }, [id, isNew]);

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!form.name?.trim()) errs.name = 'Nome do agente é obrigatório';
    if (!form.prompt?.trim()) errs.prompt = 'Prompt do sistema é obrigatório';
    if (!form.ai_provider) errs.ai_provider = 'Selecione um provedor de IA';
    if (!form.ai_model) errs.ai_model = 'Selecione um modelo';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setIsSaving(true);
    try {
      const savedAgent = await saveAgent(form as any);
      setSaved(true);

      // Notifica o backend em tempo real para sincronizar o catálogo de mídias imediatamente
      if (savedAgent?.id) {
        fetch('/api/responder/update-agent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            agentId: savedAgent.id,
            prompt: savedAgent.prompt,
            mediaCatalog: savedAgent.media_catalog || form.media_catalog || [],
          }),
        }).catch(() => {});
      }

      toast.success(isNew ? 'Agente criado com sucesso no Supabase!' : 'Agente e mídias atualizados com sucesso!');
      setTimeout(() => {
        navigate('/agents');
      }, 1000);
    } catch (err: any) {
      const msg = err.message || '';
      if (msg.includes('row-level security')) {
        toast.error('Erro de permissão no Supabase (RLS). Execute a política anônima no SQL Editor do Supabase.');
      } else {
        toast.error(`Erro ao salvar: ${msg}`);
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleProviderChange = (provider: AIProvider) => {
    setForm(f => ({
      ...f,
      ai_provider: provider,
      ai_model: AI_PROVIDERS[provider].models[0],
    }));
  };

  // Abre modal para cadastrar nova imagem ou áudio
  const handleOpenAddMedia = (initialType: 'image' | 'audio' = 'image') => {
    setEditingMediaIndex(null);
    setMediaType(initialType);
    setMediaTitle('');
    setMediaTrigger(
      initialType === 'audio'
        ? 'Envie este áudio quando o cliente perguntar como funciona o sistema, pedir explicação detalhada ou áudio explicativo.'
        : ''
    );
    setMediaCaption('');
    setMediaDataUrl('');
    setMediaUrlInput('');
    setIsRecording(false);
    setRecordingSeconds(0);
    setIsMediaModalOpen(true);
  };

  // Abre modal para editar mídia existente
  const handleOpenEditMedia = (index: number) => {
    const item = (form.media_catalog || [])[index];
    if (!item) return;
    setEditingMediaIndex(index);
    setMediaType(item.type || 'image');
    setMediaTitle(item.title);
    setMediaTrigger(item.trigger_prompt);
    setMediaCaption(item.caption || '');
    setMediaDataUrl(item.url || '');
    setMediaUrlInput(item.url?.startsWith('http') ? item.url : '');
    setIsRecording(false);
    setRecordingSeconds(0);
    setIsMediaModalOpen(true);
  };

  // Iniciar Gravação de Áudio de Voz diretamente pelo Microfone
  const handleStartRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      const chunks: Blob[] = [];

      mediaRecorder.ondataavailable = e => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(chunks, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64 = reader.result as string;
          setMediaDataUrl(base64);
          if (!mediaTitle.trim()) {
            setMediaTitle(`Áudio Explicativo (${new Date().toLocaleDateString('pt-BR')})`);
          }
          if (!mediaTrigger.trim()) {
            setMediaTrigger('Envie este áudio quando o cliente perguntar como funciona o sistema ou pedir explicação detalhada.');
          }
          toast.success('Áudio gravado com sucesso! Clique no play para ouvir.');
        };
        reader.readAsDataURL(audioBlob);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingSeconds(0);
      recordingTimerRef.current = setInterval(() => {
        setRecordingSeconds(s => s + 1);
      }, 1000);
    } catch {
      toast.error('Não foi possível acessar o microfone. Verifique as permissões do navegador ou faça upload de arquivo de áudio.');
    }
  };

  // Parar gravação de voz
  const handleStopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
      }
    }
  };

  // Excluir mídia do catálogo
  const handleDeleteMedia = (index: number) => {
    const list = [...(form.media_catalog || [])];
    const removed = list.splice(index, 1);
    setForm(f => ({ ...f, media_catalog: list }));

    if (id && id !== 'new') {
      try {
        localStorage.setItem(`agent_media_catalog_${id}`, JSON.stringify(list));
      } catch {}
      fetch(`/api/media/catalog/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(list),
      }).catch(() => {});
    }

    toast.success(`Mídia "${removed[0]?.title || 'item'}" removida do catálogo.`);
  };

  // Processa o upload do arquivo no input (Imagem ou Áudio)
  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (mediaType === 'image') {
      if (!file.type.startsWith('image/')) {
        toast.error('Por favor, selecione um arquivo de imagem (PNG, JPG, WEBP).');
        return;
      }

      setIsUploadingFile(true);
      try {
        const base64 = await compressAndResizeImage(file);
        setMediaDataUrl(base64);

        // Envia ao backend para salvar o arquivo físico em public/uploads/
        try {
          const uploadRes = await fetch('/api/media/upload', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              base64,
              ext: file.type.includes('png') ? 'png' : 'jpg',
            }),
          }).then(r => r.json());

          if (uploadRes?.url) {
            setMediaDataUrl(uploadRes.url);
          }
        } catch {}

        if (!mediaTitle.trim()) {
          const cleanName = file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
          setMediaTitle(cleanName.charAt(0).toUpperCase() + cleanName.slice(1));
        }

        toast.success('Imagem carregada com sucesso!');
      } catch {
        toast.error('Erro ao processar imagem.');
      } finally {
        setIsUploadingFile(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    } else {
      // Arquivo de Áudio
      const isAudio = file.type.startsWith('audio/') || file.name.match(/\.(mp3|ogg|wav|m4a|aac|opus)$/i);
      if (!isAudio) {
        toast.error('Por favor, selecione um arquivo de áudio (MP3, OGG, WAV, M4A).');
        return;
      }

      setIsUploadingFile(true);
      try {
        const reader = new FileReader();
        reader.onload = async (ev) => {
          const base64 = ev.target?.result as string;
          setMediaDataUrl(base64);

          try {
            const ext = file.name.split('.').pop() || 'mp3';
            const uploadRes = await fetch('/api/media/upload', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ base64, ext }),
            }).then(r => r.json());

            if (uploadRes?.url) {
              setMediaDataUrl(uploadRes.url);
            }
          } catch {}

          if (!mediaTitle.trim()) {
            const cleanName = file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
            setMediaTitle(cleanName.charAt(0).toUpperCase() + cleanName.slice(1));
          }
          if (!mediaTrigger.trim()) {
            setMediaTrigger('Envie este áudio quando o cliente perguntar como funciona o sistema, pedir explicação detalhada ou áudio explicativo.');
          }

          toast.success('Áudio carregado com sucesso!');
          setIsUploadingFile(false);
        };
        reader.onerror = () => {
          toast.error('Erro ao ler arquivo de áudio.');
          setIsUploadingFile(false);
        };
        reader.readAsDataURL(file);
      } catch {
        toast.error('Erro ao processar áudio.');
        setIsUploadingFile(false);
      } finally {
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    }
  };

  // Salva mídia no catálogo do agente (Imagem ou Áudio)
  const handleSaveMedia = () => {
    const finalUrl = mediaDataUrl || mediaUrlInput.trim();
    if (!finalUrl) {
      toast.error(mediaType === 'audio' ? 'Selecione, grave ou informe o áudio.' : 'Selecione uma imagem ou informe a URL da foto.');
      return;
    }
    if (!mediaTitle.trim()) {
      toast.error(mediaType === 'audio' ? 'Informe um título/nome para o áudio.' : 'Informe um título/nome para a imagem.');
      return;
    }
    if (!mediaTrigger.trim()) {
      toast.error('Defina a instrução/gatilho para a IA saber quando enviar este item.');
      return;
    }

    const prefix = mediaType === 'audio' ? 'aud' : 'img';
    const newItem: AgentMediaItem = {
      id: editingMediaIndex !== null && form.media_catalog?.[editingMediaIndex]?.id
        ? form.media_catalog[editingMediaIndex].id
        : `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`,
      type: mediaType,
      title: mediaTitle.trim(),
      url: finalUrl,
      trigger_prompt: mediaTrigger.trim(),
      caption: mediaCaption.trim() || undefined,
      created_at: new Date().toISOString(),
    };

    const currentList = [...(form.media_catalog || [])];
    if (editingMediaIndex !== null) {
      currentList[editingMediaIndex] = newItem;
      toast.success(mediaType === 'audio' ? 'Áudio atualizado no catálogo!' : 'Imagem atualizada no catálogo!');
    } else {
      currentList.push(newItem);
      toast.success(mediaType === 'audio' ? 'Áudio cadastrado com sucesso no catálogo!' : 'Imagem cadastrada com sucesso no catálogo!');
    }

    setForm(f => ({ ...f, media_catalog: currentList }));
    setIsMediaModalOpen(false);

    // Salva imediatamente em disco e localStorage para garantir persistência instantânea
    if (id && id !== 'new') {
      try {
        localStorage.setItem(`agent_media_catalog_${id}`, JSON.stringify(currentList));
      } catch {}
      fetch(`/api/media/catalog/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(currentList),
      }).catch(() => {});
    }
  };

  const selectedModels = form.ai_provider ? AI_PROVIDERS[form.ai_provider as AIProvider]?.models || [] : [];
  const mediaCount = form.media_catalog?.length || 0;

  if (isLoading) {
    return (
      <div className="glass-card" style={{ padding: '60px', textAlign: 'center', maxWidth: '600px', margin: '40px auto' }}>
        <div className="loader" style={{ margin: '0 auto 16px' }} />
        <div style={{ color: '#8fa3c8' }}>Carregando dados do agente...</div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto', paddingBottom: '60px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '28px', flexWrap: 'wrap' }}>
        <Link to="/agents" style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '36px',
          height: '36px',
          background: 'rgba(19, 28, 53, 0.8)',
          border: '1px solid rgba(99, 179, 237, 0.12)',
          borderRadius: '8px',
          color: '#8fa3c8',
          textDecoration: 'none',
          transition: 'all 0.2s',
        }}>
          <ArrowLeft size={18} />
        </Link>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
            <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#e8f0fe' }}>
              {isNew ? 'Novo Agente de IA' : `Editar: ${form.name}`}
            </h2>
            {isSupabaseConfigured && (
              <span style={{
                fontSize: '11px',
                padding: '2px 8px',
                borderRadius: '12px',
                background: 'rgba(16, 185, 129, 0.15)',
                color: '#10b981',
                border: '1px solid rgba(16, 185, 129, 0.3)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px'
              }}>
                <Database size={11} /> Supabase
              </span>
            )}
          </div>
          <p style={{ fontSize: '13px', color: '#8fa3c8' }}>
            Configure o comportamento, catálogo de imagens anexas e o motor de IA do agente
          </p>
        </div>

        {saved && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#10b981', fontSize: '13px' }}>
            <CheckCircle size={16} /> Salvo
          </div>
        )}

        <button
          className="btn-primary"
          onClick={handleSave}
          disabled={isSaving}
          style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
        >
          {isSaving ? (
            <>
              <div className="loader" style={{ width: '14px', height: '14px' }} />
              Salvando...
            </>
          ) : (
            <>
              <Save size={15} />
              Salvar Agente
            </>
          )}
        </button>
      </div>

      {/* Grid Principal: Info Básica + Provedor & Prompt */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '24px' }}>
        {/* Left column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Basic Info Card */}
          <div className="glass-card" style={{ padding: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
              <Bot size={16} color="#3b82f6" />
              <span style={{ fontSize: '15px', fontWeight: 600, color: '#e8f0fe' }}>Informações Básicas</span>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label className="form-label">Nome do Agente *</label>
              <input
                type="text"
                className="input-field"
                placeholder="Ex: James - Atendente Comercial"
                value={form.name || ''}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              />
              {errors.name && <div className="form-error">{errors.name}</div>}
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label className="form-label">Descrição</label>
              <textarea
                className="input-field"
                placeholder="Descreva o propósito e funcionamento deste agente..."
                value={form.description || ''}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                rows={2}
                style={{ resize: 'vertical', minHeight: '60px' }}
              />
            </div>

            {/* Status toggle */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '8px', borderTop: '1px solid rgba(99, 179, 237, 0.08)' }}>
              <div>
                <div style={{ fontSize: '14px', fontWeight: 500, color: '#e8f0fe', marginBottom: '2px' }}>
                  Agente Ativo
                </div>
                <div style={{ fontSize: '12px', color: '#4a6080' }}>
                  Quando ativo, responde mensagens automaticamente
                </div>
              </div>
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={form.is_active ?? true}
                  onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))}
                />
                <span className="toggle-slider" />
              </label>
            </div>
          </div>

          {/* AI Provider Card */}
          <div className="glass-card" style={{ padding: '24px' }}>
            <div style={{ fontSize: '15px', fontWeight: 600, color: '#e8f0fe', marginBottom: '16px' }}>
              Provedor e Modelo de IA
            </div>

            {/* Provider selection */}
            <div style={{ marginBottom: '16px' }}>
              <label className="form-label">Provedor *</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                {Object.entries(AI_PROVIDERS).map(([key, { label }]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => handleProviderChange(key as AIProvider)}
                    style={{
                      padding: '10px 12px',
                      borderRadius: '8px',
                      border: `1px solid ${form.ai_provider === key ? 'rgba(59, 130, 246, 0.5)' : 'rgba(99, 179, 237, 0.12)'}`,
                      background: form.ai_provider === key ? 'rgba(59, 130, 246, 0.15)' : 'rgba(15, 22, 41, 0.6)',
                      color: form.ai_provider === key ? '#60a5fa' : '#8fa3c8',
                      cursor: 'pointer',
                      fontSize: '13px',
                      fontWeight: form.ai_provider === key ? 600 : 400,
                      transition: 'all 0.2s',
                      textAlign: 'center',
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {errors.ai_provider && <div className="form-error">{errors.ai_provider}</div>}
            </div>

            {/* Model selection */}
            <div>
              <label className="form-label">Modelo *</label>
              <select
                className="input-field"
                value={form.ai_model || ''}
                onChange={e => setForm(f => ({ ...f, ai_model: e.target.value }))}
              >
                {selectedModels.map(model => (
                  <option key={model} value={model}>{model}</option>
                ))}
              </select>
              {errors.ai_model && <div className="form-error">{errors.ai_model}</div>}
              {form.ai_provider === 'gemini' && (
                <div style={{ fontSize: '11px', color: '#10b981', marginTop: '6px' }}>
                  ✓ gemini-3.5-flash-lite ativo com fallback automático de cotas.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right column - Prompt */}
        <div className="glass-card" style={{ padding: '24px', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <div>
              <div style={{ fontSize: '15px', fontWeight: 600, color: '#e8f0fe', marginBottom: '2px' }}>
                Prompt do Sistema *
              </div>
              <div style={{ fontSize: '12px', color: '#8fa3c8' }}>
                Instruções gerais, identidade e tom de voz
              </div>
            </div>
            <div style={{ fontSize: '12px', color: '#4a6080' }}>
              {form.prompt?.length || 0} caracteres
            </div>
          </div>

          <textarea
            className="input-field"
            placeholder={`Você é um assistente virtual comercial humanizado de atendimento via WhatsApp...`}
            value={form.prompt || ''}
            onChange={e => setForm(f => ({ ...f, prompt: e.target.value }))}
            style={{
              width: '100%',
              flex: 1,
              minHeight: '280px',
              resize: 'vertical',
              fontFamily: 'inherit',
              lineHeight: 1.6,
            }}
          />
          {errors.prompt && <div className="form-error">{errors.prompt}</div>}

          <div style={{
            marginTop: '12px',
            padding: '10px 12px',
            background: 'rgba(15, 22, 41, 0.6)',
            borderRadius: '6px',
            fontSize: '12px',
            color: '#8fa3c8',
            lineHeight: 1.5,
          }}>
            💡 <strong style={{ color: '#60a5fa' }}>Dica:</strong> As imagens cadastradas na seção abaixo serão integradas automaticamente às instruções da IA pelo motor de atendimento!
          </div>
        </div>
      </div>

      {/* SEÇÃO NOBRE: Catálogo de Mídias do Agente (Imagens & Áudios) */}
      <div className="glass-card" style={{ padding: '28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
              <div style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: 'rgba(139, 92, 246, 0.15)',
                border: '1px solid rgba(139, 92, 246, 0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#a78bfa',
              }}>
                <Volume2 size={18} />
              </div>
              <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#e8f0fe' }}>
                Catálogo de Mídias do Agente (Imagens & Áudios)
              </h3>
              <span style={{
                fontSize: '12px',
                fontWeight: 600,
                padding: '2px 10px',
                borderRadius: '12px',
                background: mediaCount > 0 ? 'rgba(139, 92, 246, 0.2)' : 'rgba(255,255,255,0.06)',
                color: mediaCount > 0 ? '#c4b5fd' : '#8fa3c8',
                border: '1px solid rgba(139, 92, 246, 0.25)',
              }}>
                {mediaCount} {mediaCount === 1 ? 'mídia' : 'mídias'}
              </span>
            </div>
            <p style={{ fontSize: '13px', color: '#8fa3c8' }}>
              Faça upload de fotos dos planos, banners promocionais ou mensagens de áudio gravadas com instruções para a IA enviar pelo WhatsApp no momento certo
            </p>
          </div>

          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => handleOpenAddMedia('audio')}
              style={{
                background: 'rgba(16, 185, 129, 0.15)',
                border: '1px solid rgba(16, 185, 129, 0.4)',
                color: '#34d399',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontWeight: 600,
              }}
            >
              <Mic size={16} /> Adicionar Áudio / Voz
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={() => handleOpenAddMedia('image')}
              style={{
                background: 'linear-gradient(135deg, #7c3aed 0%, #6366f1 100%)',
                border: '1px solid rgba(167, 139, 250, 0.4)',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <Plus size={16} /> Adicionar Imagem / Mídia
            </button>
          </div>
        </div>

        {/* Como funciona banner */}
        <div style={{
          padding: '14px 16px',
          background: 'rgba(124, 58, 237, 0.08)',
          border: '1px solid rgba(139, 92, 246, 0.2)',
          borderRadius: '10px',
          fontSize: '12.5px',
          color: '#c4b5fd',
          lineHeight: 1.5,
          marginBottom: '20px',
          display: 'flex',
          alignItems: 'flex-start',
          gap: '10px',
        }}>
          <Sparkles size={18} color="#a78bfa" style={{ flexShrink: 0, marginTop: '2px' }} />
          <div>
            <strong>Como a IA utiliza essas imagens e áudios no WhatsApp?</strong>
            <div style={{ color: '#8fa3c8', marginTop: '3px' }}>
              Para cada mídia cadastrada, você define o <strong>gatilho/instrução</strong> (ex: <em>"Envie este áudio quando o cliente perguntar como funciona"</em> ou <em>"Envie esta imagem quando pedir a tabela de planos"</em>). Durante a conversa, o robô responderá em texto e disparará o arquivo (foto ou mensagem de voz) diretamente no WhatsApp do cliente!
            </div>
          </div>
        </div>

        {/* Lista de Imagens & Áudios Cadastrados */}
        {(!form.media_catalog || form.media_catalog.length === 0) ? (
          <div style={{
            border: '2px dashed rgba(99, 179, 237, 0.15)',
            borderRadius: '12px',
            padding: '40px 20px',
            textAlign: 'center',
            background: 'rgba(15, 22, 41, 0.3)',
          }}>
            <Volume2 size={38} color="#4a6080" style={{ margin: '0 auto 12px' }} />
            <div style={{ fontSize: '15px', fontWeight: 600, color: '#e8f0fe', marginBottom: '6px' }}>
              Nenhuma mídia cadastrada para este agente
            </div>
            <p style={{ fontSize: '13px', color: '#8fa3c8', maxWidth: '520px', margin: '0 auto 16px' }}>
              Cadastre fotos de planos, banners ou áudios gravados de explicação para o agente oferecer automaticamente aos clientes no WhatsApp.
            </p>
            <div style={{ display: 'inline-flex', gap: '10px', flexWrap: 'wrap', justifyContent: 'center' }}>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => handleOpenAddMedia('image')}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              >
                <ImageIcon size={15} /> Cadastrar Imagem
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => handleOpenAddMedia('audio')}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: 'rgba(16, 185, 129, 0.15)',
                  color: '#34d399',
                  border: '1px solid rgba(16, 185, 129, 0.35)',
                }}
              >
                <Mic size={15} /> Gravar ou Enviar Áudio
              </button>
            </div>
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))',
            gap: '16px',
          }}>
            {form.media_catalog.map((item, idx) => {
              const isAudio = item.type === 'audio';

              return (
                <div
                  key={item.id || idx}
                  style={{
                    background: 'rgba(15, 22, 41, 0.7)',
                    border: isAudio
                      ? '1px solid rgba(16, 185, 129, 0.3)'
                      : '1px solid rgba(99, 179, 237, 0.15)',
                    borderRadius: '10px',
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column',
                    transition: 'all 0.2s',
                  }}
                >
                  {/* Preview Top Area */}
                  {isAudio ? (
                    <div style={{
                      position: 'relative',
                      width: '100%',
                      height: '160px',
                      background: 'linear-gradient(135deg, rgba(6, 78, 59, 0.35) 0%, rgba(15, 23, 42, 0.95) 100%)',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: '16px',
                      borderBottom: '1px solid rgba(16, 185, 129, 0.2)',
                    }}>
                      <div style={{
                        width: '44px',
                        height: '44px',
                        borderRadius: '50%',
                        background: 'rgba(16, 185, 129, 0.2)',
                        border: '1px solid rgba(16, 185, 129, 0.5)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#34d399',
                        marginBottom: '10px',
                        boxShadow: '0 0 15px rgba(16, 185, 129, 0.2)',
                      }}>
                        <Mic size={22} />
                      </div>

                      <audio
                        controls
                        controlsList="nodownload"
                        src={item.url}
                        style={{ width: '100%', height: '36px' }}
                      />

                      <div style={{
                        position: 'absolute',
                        top: '8px',
                        right: '8px',
                        display: 'flex',
                        gap: '6px',
                        zIndex: 10,
                      }}>
                        <button
                          type="button"
                          onClick={() => handleOpenEditMedia(idx)}
                          style={{
                            background: 'rgba(59, 130, 246, 0.9)',
                            border: '1px solid rgba(96, 165, 250, 0.5)',
                            color: '#fff',
                            borderRadius: '6px',
                            width: '30px',
                            height: '30px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                          }}
                          title="Editar Áudio"
                        >
                          <Edit2 size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteMedia(idx)}
                          style={{
                            background: 'rgba(239, 68, 68, 0.9)',
                            border: '1px solid rgba(248, 113, 113, 0.5)',
                            color: '#fff',
                            borderRadius: '6px',
                            width: '30px',
                            height: '30px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                          }}
                          title="Excluir Áudio"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ position: 'relative', width: '100%', height: '160px', background: '#0a0f1d', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <ImageIcon size={32} color="#2a3b5c" style={{ position: 'absolute' }} />
                      <img
                        src={item.url}
                        alt={item.title}
                        onError={(e) => { (e.currentTarget as HTMLElement).style.opacity = '0'; }}
                        style={{ width: '100%', height: '100%', objectFit: 'cover', position: 'relative', zIndex: 1, transition: 'opacity 0.2s' }}
                      />
                      <div style={{
                        position: 'absolute',
                        top: '8px',
                        right: '8px',
                        display: 'flex',
                        gap: '6px',
                        zIndex: 10,
                      }}>
                        <button
                          type="button"
                          onClick={() => setPreviewZoomUrl(item.url)}
                          style={{
                            background: 'rgba(0,0,0,0.75)',
                            border: '1px solid rgba(255,255,255,0.2)',
                            color: '#fff',
                            borderRadius: '6px',
                            width: '30px',
                            height: '30px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                            boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
                          }}
                          title="Ampliar Imagem"
                        >
                          <Eye size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleOpenEditMedia(idx)}
                          style={{
                            background: 'rgba(59, 130, 246, 0.9)',
                            border: '1px solid rgba(96, 165, 250, 0.5)',
                            color: '#fff',
                            borderRadius: '6px',
                            width: '30px',
                            height: '30px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                            boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
                          }}
                          title="Editar Informações"
                        >
                          <Edit2 size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteMedia(idx)}
                          style={{
                            background: 'rgba(239, 68, 68, 0.9)',
                            border: '1px solid rgba(248, 113, 113, 0.5)',
                            color: '#fff',
                            borderRadius: '6px',
                            width: '30px',
                            height: '30px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                            boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
                          }}
                          title="Excluir Mídia"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Conteúdo do Card */}
                  <div style={{ padding: '14px', flex: 1, display: 'flex', flexDirection: 'column' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <span style={{
                        fontSize: '11px',
                        fontWeight: 600,
                        padding: '2px 8px',
                        borderRadius: '6px',
                        background: isAudio ? 'rgba(16, 185, 129, 0.15)' : 'rgba(139, 92, 246, 0.15)',
                        color: isAudio ? '#34d399' : '#c4b5fd',
                        border: isAudio ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(139, 92, 246, 0.3)',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}>
                        {isAudio ? <><Mic size={11} /> Áudio / Voz WhatsApp</> : <><ImageIcon size={11} /> Imagem / Banner</>}
                      </span>
                    </div>

                    <div style={{ fontSize: '15px', fontWeight: 700, color: '#e8f0fe', marginBottom: '8px' }}>
                      {item.title}
                    </div>

                    <div style={{
                      fontSize: '12px',
                      color: '#8fa3c8',
                      background: 'rgba(255,255,255,0.03)',
                      border: '1px solid rgba(255,255,255,0.06)',
                      borderRadius: '6px',
                      padding: '8px 10px',
                      marginBottom: '8px',
                      lineHeight: 1.4,
                      flex: 1,
                    }}>
                      <strong style={{ color: isAudio ? '#34d399' : '#a78bfa', display: 'block', marginBottom: '2px' }}>
                        Gatilho da IA:
                      </strong>
                      {item.trigger_prompt}
                    </div>

                    {item.caption && (
                      <div style={{ fontSize: '11.5px', color: '#60a5fa', marginBottom: '4px' }}>
                        💬 <strong style={{ color: '#8fa3c8' }}>{isAudio ? 'Acompanhamento:' : 'Legenda:'}</strong> "{item.caption}"
                      </div>
                    )}

                    {/* Barra inferior de ações claras */}
                    <div style={{
                      marginTop: '12px',
                      paddingTop: '10px',
                      borderTop: '1px solid rgba(255,255,255,0.08)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '8px',
                    }}>
                      {!isAudio ? (
                        <button
                          type="button"
                          onClick={() => setPreviewZoomUrl(item.url)}
                          style={{
                            background: 'rgba(255,255,255,0.06)',
                            border: '1px solid rgba(255,255,255,0.12)',
                            color: '#94a3b8',
                            padding: '6px 12px',
                            borderRadius: '6px',
                            fontSize: '12px',
                            fontWeight: 500,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px',
                            cursor: 'pointer',
                          }}
                        >
                          <Eye size={13} /> Visualizar
                        </button>
                      ) : (
                        <span style={{ fontSize: '11.5px', color: '#34d399', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          <Volume2 size={13} /> Mensagem de Voz
                        </span>
                      )}

                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button
                          type="button"
                          onClick={() => handleOpenEditMedia(idx)}
                          style={{
                            background: 'rgba(59, 130, 246, 0.2)',
                            border: '1px solid rgba(59, 130, 246, 0.4)',
                            color: '#60a5fa',
                            padding: '6px 14px',
                            borderRadius: '6px',
                            fontSize: '12px',
                            fontWeight: 600,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px',
                            cursor: 'pointer',
                          }}
                        >
                          <Edit2 size={13} /> Editar
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDeleteMedia(idx)}
                          style={{
                            background: 'rgba(239, 68, 68, 0.15)',
                            border: '1px solid rgba(239, 68, 68, 0.35)',
                            color: '#f87171',
                            padding: '6px 10px',
                            borderRadius: '6px',
                            fontSize: '12px',
                            fontWeight: 600,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px',
                            cursor: 'pointer',
                          }}
                          title="Excluir item"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* MODAL: Adicionar / Editar Imagem ou Áudio */}
      {isMediaModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.85)',
            zIndex: 100,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
            backdropFilter: 'blur(5px)',
          }}
          onClick={() => {
            if (isRecording) handleStopRecording();
            setIsMediaModalOpen(false);
          }}
        >
          <div
            className="glass-card animate-scale-in"
            style={{ width: '100%', maxWidth: '600px', maxHeight: '92vh', overflowY: 'auto', padding: '26px' }}
            onClick={e => e.stopPropagation()}
          >
            {/* Cabeçalho do Modal */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px' }}>
              <div>
                <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#e8f0fe', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {mediaType === 'audio' ? <Mic size={20} color="#34d399" /> : <ImageIcon size={20} color="#a78bfa" />}
                  {editingMediaIndex !== null
                    ? (mediaType === 'audio' ? 'Editar Mensagem de Voz / Áudio' : 'Editar Imagem do Catálogo')
                    : (mediaType === 'audio' ? 'Adicionar Mensagem de Voz / Áudio' : 'Adicionar Nova Imagem')}
                </h3>
                <p style={{ fontSize: '12.5px', color: '#8fa3c8', marginTop: '2px' }}>
                  {mediaType === 'audio'
                    ? 'Grave sua voz ou envie um áudio para a IA responder como mensagem de voz no WhatsApp'
                    : 'Defina a imagem e a instrução para o robô enviá-la no WhatsApp'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (isRecording) handleStopRecording();
                  setIsMediaModalOpen(false);
                }}
                style={{ background: 'none', border: 'none', color: '#8fa3c8', cursor: 'pointer', padding: '4px' }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Alternador de Tipo: Imagem vs Áudio */}
            <div style={{
              display: 'flex',
              gap: '8px',
              background: 'rgba(255, 255, 255, 0.04)',
              padding: '4px',
              borderRadius: '10px',
              marginBottom: '20px',
              border: '1px solid rgba(255, 255, 255, 0.08)'
            }}>
              <button
                type="button"
                onClick={() => {
                  if (isRecording) handleStopRecording();
                  setMediaType('image');
                }}
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  padding: '9px 12px',
                  borderRadius: '8px',
                  fontSize: '13px',
                  fontWeight: 600,
                  border: 'none',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  background: mediaType === 'image' ? 'linear-gradient(135deg, #7c3aed 0%, #6366f1 100%)' : 'transparent',
                  color: mediaType === 'image' ? '#fff' : '#94a3b8',
                  boxShadow: mediaType === 'image' ? '0 4px 12px rgba(124, 58, 237, 0.35)' : 'none',
                }}
              >
                <ImageIcon size={16} /> Imagem / Banner
              </button>

              <button
                type="button"
                onClick={() => {
                  setMediaType('audio');
                  if (!mediaTrigger.trim()) {
                    setMediaTrigger('Envie este áudio quando o cliente perguntar como funciona o sistema, pedir explicação detalhada ou áudio explicativo.');
                  }
                }}
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  padding: '9px 12px',
                  borderRadius: '8px',
                  fontSize: '13px',
                  fontWeight: 600,
                  border: 'none',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  background: mediaType === 'audio' ? 'linear-gradient(135deg, #059669 0%, #10b981 100%)' : 'transparent',
                  color: mediaType === 'audio' ? '#fff' : '#94a3b8',
                  boxShadow: mediaType === 'audio' ? '0 4px 12px rgba(16, 185, 129, 0.35)' : 'none',
                }}
              >
                <Mic size={16} /> Mensagem de Voz / Áudio
              </button>
            </div>

            {/* SEÇÃO ÁUDIO */}
            {mediaType === 'audio' ? (
              <div style={{ marginBottom: '18px' }}>
                <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Volume2 size={15} color="#34d399" /> Conteúdo do Áudio *
                </label>

                {/* Se estiver gravando pelo microfone */}
                {isRecording ? (
                  <div style={{
                    background: 'rgba(239, 68, 68, 0.12)',
                    border: '2px solid rgba(239, 68, 68, 0.5)',
                    borderRadius: '12px',
                    padding: '24px 20px',
                    textAlign: 'center',
                    marginBottom: '12px',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '10px' }}>
                      <span style={{
                        width: '12px',
                        height: '12px',
                        borderRadius: '50%',
                        background: '#ef4444',
                        boxShadow: '0 0 14px #ef4444',
                        display: 'inline-block',
                      }} />
                      <span style={{ fontSize: '15px', fontWeight: 700, color: '#fca5a5' }}>
                        Gravando sua voz agora...
                      </span>
                    </div>
                    <div style={{ fontSize: '32px', fontWeight: 800, color: '#fff', fontFamily: 'monospace', marginBottom: '14px' }}>
                      00:{recordingSeconds < 10 ? `0${recordingSeconds}` : recordingSeconds}
                    </div>
                    <button
                      type="button"
                      onClick={handleStopRecording}
                      style={{
                        background: '#ef4444',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '8px',
                        padding: '10px 22px',
                        fontSize: '13px',
                        fontWeight: 700,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '8px',
                        cursor: 'pointer',
                        boxShadow: '0 4px 15px rgba(239, 68, 68, 0.4)',
                      }}
                    >
                      <Square size={16} fill="white" /> Concluir e Salvar Gravação
                    </button>
                  </div>
                ) : (
                  <>
                    {/* Se já tiver áudio gravado ou carregado */}
                    {mediaDataUrl ? (
                      <div style={{
                        background: 'rgba(16, 185, 129, 0.08)',
                        border: '1px solid rgba(16, 185, 129, 0.35)',
                        borderRadius: '10px',
                        padding: '16px',
                        marginBottom: '12px',
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                          <span style={{ fontSize: '13px', fontWeight: 600, color: '#34d399', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Volume2 size={16} /> Prévia da Mensagem de Voz:
                          </span>
                          <button
                            type="button"
                            onClick={() => { setMediaDataUrl(''); setMediaUrlInput(''); }}
                            style={{
                              background: 'rgba(239, 68, 68, 0.2)',
                              border: '1px solid rgba(239, 68, 68, 0.4)',
                              color: '#f87171',
                              borderRadius: '6px',
                              padding: '4px 10px',
                              fontSize: '11px',
                              fontWeight: 600,
                              cursor: 'pointer',
                            }}
                          >
                            Trocar / Regravar
                          </button>
                        </div>

                        <audio controls src={mediaDataUrl} style={{ width: '100%', outline: 'none', borderRadius: '8px' }} />

                        <div style={{ fontSize: '11px', color: '#10b981', marginTop: '8px' }}>
                          ✅ Pronto! O WhatsApp enviará como áudio gravado na hora com microfone verde (PTT).
                        </div>
                      </div>
                    ) : (
                      /* Opções de Gravar com Microfone ou Subir Arquivo */
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                        <button
                          type="button"
                          onClick={handleStartRecording}
                          style={{
                            background: 'rgba(16, 185, 129, 0.1)',
                            border: '1.5px dashed rgba(16, 185, 129, 0.45)',
                            borderRadius: '10px',
                            padding: '22px 14px',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '8px',
                            cursor: 'pointer',
                            color: '#e8f0fe',
                            transition: 'all 0.2s',
                          }}
                        >
                          <div style={{
                            width: '44px',
                            height: '44px',
                            borderRadius: '50%',
                            background: 'rgba(16, 185, 129, 0.2)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#34d399',
                          }}>
                            <Mic size={22} />
                          </div>
                          <span style={{ fontSize: '13px', fontWeight: 700 }}>Gravar com Microfone</span>
                          <span style={{ fontSize: '11px', color: '#8fa3c8', textAlign: 'center' }}>
                            Fale sua explicação direto pelo navegador
                          </span>
                        </button>

                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          style={{
                            background: 'rgba(59, 130, 246, 0.08)',
                            border: '1.5px dashed rgba(59, 130, 246, 0.4)',
                            borderRadius: '10px',
                            padding: '22px 14px',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '8px',
                            cursor: 'pointer',
                            color: '#e8f0fe',
                            transition: 'all 0.2s',
                          }}
                        >
                          <div style={{
                            width: '44px',
                            height: '44px',
                            borderRadius: '50%',
                            background: 'rgba(59, 130, 246, 0.2)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#60a5fa',
                          }}>
                            <Upload size={22} />
                          </div>
                          <span style={{ fontSize: '13px', fontWeight: 700 }}>
                            {isUploadingFile ? 'Carregando áudio...' : 'Enviar Arquivo de Áudio'}
                          </span>
                          <span style={{ fontSize: '11px', color: '#8fa3c8', textAlign: 'center' }}>
                            MP3, OGG, WAV, M4A ou AAC
                          </span>
                        </button>
                      </div>
                    )}
                  </>
                )}

                {/* Ou Link Direto de Áudio */}
                <div style={{ marginTop: '8px' }}>
                  <span style={{ fontSize: '11px', color: '#64748b', display: 'block', marginBottom: '4px' }}>
                    Ou cole o link direto de um áudio na web (opcional):
                  </span>
                  <input
                    type="url"
                    className="input-field"
                    placeholder="https://exemplo.com/audios/explicacao.mp3"
                    value={mediaUrlInput}
                    onChange={e => {
                      setMediaUrlInput(e.target.value);
                      if (e.target.value.startsWith('http')) {
                        setMediaDataUrl(e.target.value);
                      }
                    }}
                    style={{ fontSize: '12px', padding: '8px 12px' }}
                  />
                </div>
              </div>
            ) : (
              /* SEÇÃO IMAGEM */
              <div style={{ marginBottom: '18px' }}>
                <label className="form-label">Arquivo de Imagem *</label>

                {mediaDataUrl ? (
                  <div style={{
                    position: 'relative',
                    width: '100%',
                    height: '200px',
                    borderRadius: '10px',
                    overflow: 'hidden',
                    background: '#0a0f1d',
                    border: '1px solid rgba(99, 179, 237, 0.2)',
                    marginBottom: '10px',
                  }}>
                    <img
                      src={mediaDataUrl}
                      alt="Preview"
                      style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                    />
                    <button
                      type="button"
                      onClick={() => { setMediaDataUrl(''); setMediaUrlInput(''); }}
                      style={{
                        position: 'absolute',
                        top: '8px',
                        right: '8px',
                        background: 'rgba(239, 68, 68, 0.9)',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '6px',
                        padding: '4px 10px',
                        fontSize: '11px',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      Trocar Imagem
                    </button>
                  </div>
                ) : (
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    style={{
                      border: '2px dashed rgba(139, 92, 246, 0.4)',
                      borderRadius: '10px',
                      padding: '30px 20px',
                      textAlign: 'center',
                      background: 'rgba(124, 58, 237, 0.05)',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      marginBottom: '10px',
                    }}
                  >
                    <Upload size={32} color="#a78bfa" style={{ margin: '0 auto 10px' }} />
                    <div style={{ fontSize: '14px', fontWeight: 600, color: '#e8f0fe', marginBottom: '4px' }}>
                      {isUploadingFile ? 'Processando imagem...' : 'Clique para selecionar a imagem do seu computador'}
                    </div>
                    <div style={{ fontSize: '12px', color: '#8fa3c8' }}>
                      Formatos suportados: PNG, JPG, JPEG ou WEBP (otimizada automaticamente)
                    </div>
                  </div>
                )}

                {/* Ou informar URL externa */}
                <div style={{ marginTop: '8px' }}>
                  <span style={{ fontSize: '11px', color: '#4a6080', display: 'block', marginBottom: '4px' }}>
                    Ou cole um link direto de imagem na web (opcional):
                  </span>
                  <input
                    type="url"
                    className="input-field"
                    placeholder="https://exemplo.com/imagem-do-plano.jpg"
                    value={mediaUrlInput}
                    onChange={e => {
                      setMediaUrlInput(e.target.value);
                      if (e.target.value.startsWith('http')) {
                        setMediaDataUrl(e.target.value);
                      }
                    }}
                    style={{ fontSize: '12px', padding: '8px 12px' }}
                  />
                </div>
              </div>
            )}

            {/* Input de Arquivo oculto (compartilhado entre Imagem e Áudio) */}
            <input
              ref={fileInputRef}
              type="file"
              accept={mediaType === 'audio' ? 'audio/*,.mp3,.ogg,.wav,.m4a,.aac,.opus' : 'image/*'}
              style={{ display: 'none' }}
              onChange={handleFileSelected}
            />

            {/* Título */}
            <div style={{ marginBottom: '16px' }}>
              <label className="form-label">
                {mediaType === 'audio' ? 'Título / Nome do Áudio *' : 'Título / Nome do Item *'}
              </label>
              <input
                type="text"
                className="input-field"
                placeholder={mediaType === 'audio' ? 'Ex: Explicação de como funciona o Gestor de Streamings' : 'Ex: Tabela de Planos Gestor de Streamings'}
                value={mediaTitle}
                onChange={e => setMediaTitle(e.target.value)}
              />
            </div>

            {/* Instrução / Gatilho para a IA */}
            <div style={{ marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                <label className="form-label" style={{ marginBottom: 0 }}>
                  {mediaType === 'audio' ? 'Gatilho da IA (Quando enviar este áudio?) *' : 'Gatilho da IA (Quando enviar esta imagem?) *'}
                </label>
                <span title="Explique em palavras simples quando a IA deve disparar este item" style={{ display: 'inline-flex', cursor: 'help' }}>
                  <HelpCircle size={14} color="#8fa3c8" />
                </span>
              </div>
              <textarea
                className="input-field"
                placeholder={
                  mediaType === 'audio'
                    ? 'Ex: Envie este áudio quando o cliente perguntar como funciona o sistema, pedir explicação detalhada, ou pedir um áudio explicando o produto.'
                    : 'Ex: Envie esta imagem quando o cliente demonstrar interesse no Gestor de Streamings, perguntar sobre valores, pedir tabela de preços ou querer ver como funciona.'
                }
                value={mediaTrigger}
                onChange={e => setMediaTrigger(e.target.value)}
                rows={3}
                style={{ resize: 'vertical' }}
              />
              <div style={{ fontSize: '11px', color: mediaType === 'audio' ? '#34d399' : '#a78bfa', marginTop: '4px' }}>
                {mediaType === 'audio'
                  ? '🎙️ A IA entenderá o contexto da conversa e disparará o áudio oficial como nota de voz no WhatsApp!'
                  : '💡 A IA lerá esta instrução e decidirá de forma autônoma o momento exato de enviar a foto durante a conversa.'}
              </div>
            </div>

            {/* Legenda / Acompanhamento Opcional */}
            <div style={{ marginBottom: '24px' }}>
              <label className="form-label">
                {mediaType === 'audio' ? 'Mensagem de Texto de Acompanhamento (Opcional)' : 'Legenda no WhatsApp (Opcional)'}
              </label>
              <input
                type="text"
                className="input-field"
                placeholder={
                  mediaType === 'audio'
                    ? 'Ex: Ouça este áudio rápido que preparei para você com a explicação! 🎧'
                    : 'Ex: Segue a nossa tabela oficial de planos! 🚀'
                }
                value={mediaCaption}
                onChange={e => setMediaCaption(e.target.value)}
              />
              <div style={{ fontSize: '11px', color: '#8fa3c8', marginTop: '4px' }}>
                {mediaType === 'audio'
                  ? 'Se preenchido, o robô enviará este texto acompanhando a mensagem de voz.'
                  : 'Se preenchido, este texto acompanhará a foto como legenda no WhatsApp.'}
              </div>
            </div>

            {/* Botões do modal */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  if (isRecording) handleStopRecording();
                  setIsMediaModalOpen(false);
                }}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={handleSaveMedia}
                style={{
                  background: mediaType === 'audio'
                    ? 'linear-gradient(135deg, #059669 0%, #10b981 100%)'
                    : 'linear-gradient(135deg, #7c3aed 0%, #6366f1 100%)'
                }}
              >
                {editingMediaIndex !== null
                  ? 'Salvar Alterações'
                  : (mediaType === 'audio' ? 'Adicionar Áudio ao Catálogo' : 'Adicionar Imagem ao Catálogo')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL ZOOM DE PREVIEW */}
      {previewZoomUrl && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.92)',
          zIndex: 200,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '30px',
        }} onClick={() => setPreviewZoomUrl(null)}>
          <div style={{ position: 'relative', maxWidth: '90vw', maxHeight: '90vh' }}>
            <img
              src={previewZoomUrl}
              alt="Zoom Preview"
              style={{ maxWidth: '100%', maxHeight: '85vh', borderRadius: '8px', boxShadow: '0 20px 50px rgba(0,0,0,0.8)' }}
            />
            <button
              type="button"
              onClick={() => setPreviewZoomUrl(null)}
              style={{
                position: 'absolute',
                top: '-40px',
                right: '0',
                background: 'rgba(255,255,255,0.2)',
                border: 'none',
                color: '#fff',
                borderRadius: '50%',
                width: '32px',
                height: '32px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
              }}
            >
              <X size={18} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default AgentForm;
