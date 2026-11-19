/// <reference lib="webworker" />
/* LLM open source exécuté dans le navigateur via WebGPU (WebLLM / MLC). */
import { WebWorkerMLCEngineHandler } from '@mlc-ai/web-llm';

const handler = new WebWorkerMLCEngineHandler();
self.onmessage = (msg: MessageEvent) => handler.onmessage(msg);
