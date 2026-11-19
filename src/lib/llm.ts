/* ------------------------------------------------------------------
 * Moteurs de dialogue, tous gratuits :
 *  - webllm  : LLM open source dans le navigateur (WebGPU, Web Worker)
 *  - ollama  : serveur local http://localhost:11434 (modèles plus gros)
 *  - chrome  : IA intégrée de Chrome (Gemini Nano, Prompt API) si présente
 *  - scripted: pas d'IA, questions prédéfinies + correcteur par règles
 * ------------------------------------------------------------------ */
import { getState, type LlmProvider } from './store';
import type { EngineStatus } from './tts';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface GenerateOptions {
  onToken?: (delta: string, full: string) => void;
  signal?: AbortSignal;
  temperature?: number;
  maxTokens?: number;
}

export const WEBLLM_MODELS: { id: string; label: string; size: string; note: string }[] = [
  { id: 'Llama-3.2-3B-Instruct-q4f16_1-MLC', label: 'Llama 3.2 3B', size: '≈ 1,8 Go', note: 'Recommandé : naturel et fiable (GPU ≥ 3 Go)' },
  { id: 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC', label: 'Qwen 2.5 1.5B', size: '≈ 1 Go', note: 'Léger et rapide' },
  { id: 'Llama-3.2-1B-Instruct-q4f16_1-MLC', label: 'Llama 3.2 1B', size: '≈ 0,7 Go', note: 'Très léger (corrections moins fiables)' },
  { id: 'Phi-3.5-mini-instruct-q4f16_1-MLC', label: 'Phi 3.5 mini', size: '≈ 2,2 Go', note: 'Bon en grammaire (GPU ≥ 4 Go)' },
  { id: 'Llama-3.1-8B-Instruct-q4f16_1-MLC', label: 'Llama 3.1 8B', size: '≈ 4,6 Go', note: 'Le plus précis (GPU ≥ 6 Go)' },
];

type Listener = () => void;

export async function hasWebGPU(): Promise<boolean> {
  try {
    const gpu = (navigator as any).gpu;
    if (!gpu) return false;
    return !!(await gpu.requestAdapter());
  } catch {
    return false;
  }
}

class LlmService {
  status: EngineStatus = { status: 'idle', progress: 0 };
  private engine: any = null;
  private loadedModel = '';
  private listeners = new Set<Listener>();
  private loadPromise: Promise<void> | null = null;

  subscribe(l: Listener) {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }
  private emit() {
    this.listeners.forEach((l) => l());
  }
  private set(st: EngineStatus) {
    this.status = st;
    this.emit();
  }

  provider(): LlmProvider {
    return getState().settings.llmProvider;
  }

  /** Prépare le moteur choisi (téléchargement du modèle pour WebLLM). */
  load(): Promise<void> {
    const p = this.provider();
    if (p === 'scripted') {
      this.set({ status: 'ready', progress: 1, detail: 'Mode scripté (sans IA)' });
      return Promise.resolve();
    }
    if (p === 'webllm') {
      const model = getState().settings.webllmModel;
      if (this.status.status === 'ready' && this.loadedModel === model && this.engine) return Promise.resolve();
      if (this.loadPromise && this.loadedModel === model) return this.loadPromise;
      this.loadedModel = model;
      this.loadPromise = this.loadWebLLM(model).finally(() => (this.loadPromise = null));
      return this.loadPromise;
    }
    if (p === 'ollama') return this.checkOllama();
    return this.checkChrome();
  }

  private async loadWebLLM(model: string) {
    if (!(await hasWebGPU())) {
      this.set({ status: 'unsupported', progress: 0, detail: 'WebGPU indisponible sur ce navigateur : utilisez Chrome/Edge récent, Ollama ou le mode scripté.' });
      return;
    }
    this.set({ status: 'loading', progress: 0, detail: 'Chargement du modèle…' });
    try {
      if (this.engine) {
        await this.engine.unload?.();
        this.engine = null;
      }
      const webllm = await import('@mlc-ai/web-llm');
      const worker = new Worker(new URL('../workers/llm.worker.ts', import.meta.url), { type: 'module' });
      this.engine = await webllm.CreateWebWorkerMLCEngine(worker, model, {
        initProgressCallback: (r: { progress: number; text: string }) => {
          this.set({ status: 'loading', progress: r.progress, detail: frenchifyProgress(r.text) });
        },
      });
      // Préchauffage : compile les shaders GPU maintenant plutôt qu'à la première réponse d'Emma.
      this.set({ status: 'loading', progress: 1, detail: 'Préparation du GPU…' });
      try {
        await this.engine.chat.completions.create({ messages: [{ role: 'user', content: 'Hi' }], max_tokens: 2, temperature: 0 });
        await this.engine.resetChat?.();
      } catch {
        /* sans gravité */
      }
      this.set({ status: 'ready', progress: 1, detail: `${model.split('-q4')[0]} prêt (local, WebGPU)` });
    } catch (err) {
      this.engine = null;
      this.set({ status: 'error', progress: 0, detail: String((err as Error)?.message ?? err) });
    }
  }

  private async checkOllama() {
    const { ollamaUrl, ollamaModel } = getState().settings;
    this.set({ status: 'loading', progress: 0.5, detail: 'Connexion à Ollama…' });
    try {
      const r = await fetch(`${ollamaUrl.replace(/\/$/, '')}/api/tags`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = (await r.json()) as { models?: { name: string }[] };
      const names = (data.models ?? []).map((m) => m.name);
      if (!names.some((n) => n === ollamaModel || n.startsWith(ollamaModel + ':') || n.split(':')[0] === ollamaModel)) {
        this.set({ status: 'error', progress: 0, detail: `Modèle « ${ollamaModel} » absent. Lancez : ollama pull ${ollamaModel}` });
        return;
      }
      this.set({ status: 'ready', progress: 1, detail: `Ollama · ${ollamaModel}` });
    } catch {
      this.set({
        status: 'error',
        progress: 0,
        detail: 'Ollama injoignable. Lancez Ollama avec OLLAMA_ORIGINS=* (voir README).',
      });
    }
  }

  private async checkChrome() {
    const LM = (self as any).LanguageModel;
    if (!LM) {
      this.set({ status: 'unsupported', progress: 0, detail: 'IA intégrée de Chrome non disponible sur ce navigateur.' });
      return;
    }
    try {
      const a = await LM.availability({ expectedInputs: [{ type: 'text', languages: ['en'] }], expectedOutputs: [{ type: 'text', languages: ['en'] }] });
      if (a === 'unavailable') throw new Error('indisponible');
      this.set({ status: 'ready', progress: 1, detail: a === 'available' ? 'Gemini Nano (Chrome) prêt' : 'Gemini Nano : téléchargement au premier message' });
    } catch {
      this.set({ status: 'unsupported', progress: 0, detail: 'IA intégrée de Chrome indisponible sur cet appareil.' });
    }
  }

  /** Le modèle WebLLM choisi est-il déjà dans le cache du navigateur ? */
  async isCached(): Promise<boolean> {
    if (this.provider() !== 'webllm') return false;
    try {
      const webllm = await import('@mlc-ai/web-llm');
      return await webllm.hasModelInCache(getState().settings.webllmModel);
    } catch {
      return false;
    }
  }

  get ready() {
    return this.status.status === 'ready' && this.provider() !== 'scripted';
  }

  async generate(messages: ChatMessage[], opts: GenerateOptions = {}): Promise<string> {
    const p = this.provider();
    if (p === 'webllm') return this.genWebLLM(messages, opts);
    if (p === 'ollama') return this.genOllama(messages, opts);
    if (p === 'chrome') return this.genChrome(messages, opts);
    throw new Error('Aucun moteur IA');
  }

  interrupt() {
    try {
      this.engine?.interruptGenerate?.();
    } catch {
      /* ignore */
    }
  }

  private async genWebLLM(messages: ChatMessage[], opts: GenerateOptions) {
    if (!this.engine) throw new Error('Modèle non chargé');
    const stream = await this.engine.chat.completions.create({
      messages,
      stream: true,
      temperature: opts.temperature ?? 0.7,
      top_p: 0.9,
      max_tokens: opts.maxTokens ?? 220,
    });
    let full = '';
    for await (const chunk of stream) {
      if (opts.signal?.aborted) {
        this.interrupt();
        break;
      }
      const d: string = chunk.choices?.[0]?.delta?.content ?? '';
      if (d) {
        full += d;
        opts.onToken?.(d, full);
      }
    }
    return full;
  }

  private async genOllama(messages: ChatMessage[], opts: GenerateOptions) {
    const { ollamaUrl, ollamaModel } = getState().settings;
    const r = await fetch(`${ollamaUrl.replace(/\/$/, '')}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: ollamaModel,
        messages,
        stream: true,
        options: { temperature: opts.temperature ?? 0.7, num_predict: opts.maxTokens ?? 220 },
      }),
      signal: opts.signal,
    });
    if (!r.ok || !r.body) throw new Error(`Ollama HTTP ${r.status}`);
    const reader = r.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    let full = '';
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let nl: number;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        try {
          const j = JSON.parse(line) as { message?: { content?: string } };
          const d = j.message?.content ?? '';
          if (d) {
            full += d;
            opts.onToken?.(d, full);
          }
        } catch {
          /* ligne partielle */
        }
      }
    }
    return full;
  }

  private async genChrome(messages: ChatMessage[], opts: GenerateOptions) {
    const LM = (self as any).LanguageModel;
    const last = messages[messages.length - 1];
    const session = await LM.create({
      initialPrompts: messages.slice(0, -1),
      temperature: opts.temperature ?? 0.7,
      topK: 40,
      expectedInputs: [{ type: 'text', languages: ['en'] }],
      expectedOutputs: [{ type: 'text', languages: ['en'] }],
    });
    try {
      const stream: ReadableStream<string> = session.promptStreaming(last.content, { signal: opts.signal });
      const reader = stream.getReader();
      let full = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done || value == null) break;
        // Anciennes versions : chaînes cumulées ; récentes : deltas.
        const d = value.startsWith(full) && full ? value.slice(full.length) : value;
        full += d;
        opts.onToken?.(d, full);
      }
      return full;
    } finally {
      session.destroy?.();
    }
  }
}

function frenchifyProgress(text: string): string {
  const m = text.match(/(\d+)%/);
  if (/Fetching|Loading model from cache|fetch/i.test(text) && m) return `Téléchargement du modèle : ${m[1]} %`;
  if (/cache/i.test(text) && m) return `Chargement depuis le cache : ${m[1]} %`;
  if (/shader|GPU/i.test(text)) return 'Préparation du GPU…';
  return text.length > 90 ? text.slice(0, 90) + '…' : text;
}

export const llm = new LlmService();
