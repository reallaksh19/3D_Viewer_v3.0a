const FLAG = '__xmlCiiRichWorkerCacheBust_v1';
const STALE_WORKER_TOKEN = 'py-worker.js?v=20260515-cii-compat-check2';
const FRESH_WORKER_TOKEN = 'py-worker.js?v=20260623-xml-cii-rich-worker-1';

function canPatchWorker() {
  return typeof window !== 'undefined' && typeof window.Worker === 'function';
}

function rewriteWorkerSpecifier(specifier) {
  const raw = String(specifier || '');
  if (!raw.includes(STALE_WORKER_TOKEN)) return specifier;
  const rewritten = raw.replace(STALE_WORKER_TOKEN, FRESH_WORKER_TOKEN);
  return specifier instanceof URL ? new URL(rewritten) : rewritten;
}

export function installXmlCiiRichWorkerCacheBust() {
  if (!canPatchWorker()) return;
  const current = window[FLAG];
  if (current?.installed) return;

  const NativeWorker = window.Worker;
  function XmlCiiWorker(specifier, options) {
    return new NativeWorker(rewriteWorkerSpecifier(specifier), options);
  }

  Object.setPrototypeOf(XmlCiiWorker, NativeWorker);
  XmlCiiWorker.prototype = NativeWorker.prototype;
  window.Worker = XmlCiiWorker;
  window[FLAG] = {
    installed: true,
    staleToken: STALE_WORKER_TOKEN,
    freshToken: FRESH_WORKER_TOKEN,
  };
}

installXmlCiiRichWorkerCacheBust();
