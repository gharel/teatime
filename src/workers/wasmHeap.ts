/// <reference lib="webworker" />
/*
 * Mesure de la mémoire WASM du worker (onnxruntime, eSpeak) : chaque tas ne fait que grandir, et
 * sur iPhone l'onglet est tué au-delà d'un seuil. Importé en premier par chaque worker de modèles,
 * pour voir passer la création des mémoires ; la taille part avec les messages (journal).
 */
const memories: WebAssembly.Memory[] = [];
const Memory = WebAssembly.Memory;

function track(m: unknown) {
  if (m instanceof Memory && !memories.includes(m)) memories.push(m);
}

try {
  const Patched = function (this: unknown, desc: WebAssembly.MemoryDescriptor) {
    const m = new Memory(desc);
    track(m);
    return m;
  } as unknown as typeof WebAssembly.Memory;
  Patched.prototype = Memory.prototype;
  (WebAssembly as { Memory: typeof WebAssembly.Memory }).Memory = Patched;

  // Instanciation synchrone (repli d'Emscripten) : la mémoire exportée est suivie aussi.
  const Instance = WebAssembly.Instance;
  const PatchedInstance = function (this: unknown, module: WebAssembly.Module, imports?: WebAssembly.Imports) {
    const inst = new Instance(module, imports);
    Object.values(inst.exports ?? {}).forEach(track);
    return inst;
  } as unknown as typeof WebAssembly.Instance;
  PatchedInstance.prototype = Instance.prototype;
  (WebAssembly as { Instance: typeof WebAssembly.Instance }).Instance = PatchedInstance;

  for (const name of ['instantiate', 'instantiateStreaming'] as const) {
    const orig = WebAssembly[name] as (...a: unknown[]) => Promise<unknown>;
    if (typeof orig !== 'function') continue;
    (WebAssembly as unknown as Record<string, unknown>)[name] = async function (this: unknown, ...args: unknown[]) {
      const r = (await orig.apply(this, args)) as { instance?: WebAssembly.Instance } & WebAssembly.Instance;
      const exp = (r.instance ?? r).exports ?? {};
      Object.values(exp).forEach(track);
      return r;
    };
  }
} catch {
  /* mesure indisponible : sans gravité */
}

/** Mémoire WASM totale du worker, en Mo. */
export function heapMB(): number {
  return Math.round(heapBytes() / 1048576);
}

/** Taille réelle (octets) de toutes les mémoires WASM du worker : buffer.byteLength, qui ne fait que grandir. */
export function heapBytes(): number {
  return memories.reduce((a, m) => a + m.buffer.byteLength, 0);
}

/** Taille de chaque mémoire WASM du worker (onnxruntime, eSpeak…), en Mo, la plus grosse d'abord. */
export function heapParts(): number[] {
  return memories
    .map((m) => Math.round((m.buffer.byteLength / 1048576) * 10) / 10)
    .filter((mb) => mb > 0)
    .sort((a, b) => b - a);
}
