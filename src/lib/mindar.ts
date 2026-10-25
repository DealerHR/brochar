/*
  Shared MindAR loader used by the admin compiler and the public AR player.

  MindAR 1.1.4 is loaded from a CDN at runtime. Its worker scripts cannot be
  started cross-origin, so we fetch them as text, wrap them in blob URLs and
  patch window.Worker while MindAR is initialising.
*/

export const MINDAR_CDN = 'https://cdn.jsdelivr.net/gh/hiukim/mind-ar-js@1.1.4/dist/';

/* eslint-disable @typescript-eslint/no-explicit-any */
export type ThreeNS = any;

export interface MindARCompiler {
  compileImageTargets: (imgs: HTMLImageElement[], cb: (p: number) => void) => Promise<unknown>;
  exportData: () => Promise<ArrayBuffer>;
}

export interface MindARAnchor {
  group: any;
  onTargetFound: () => void;
  onTargetLost: () => void;
}

export interface MindARThree {
  renderer: any;
  scene: any;
  camera: any;
  start: () => Promise<void>;
  stop: () => void;
  addAnchor: (targetIndex: number) => MindARAnchor;
}

declare global {
  interface Window {
    MINDAR?: {
      IMAGE: {
        Compiler: new () => MindARCompiler;
        MindARThree?: new (opts: unknown) => MindARThree;
        THREE?: ThreeNS;
      };
    };
    pdfjsLib?: any;
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export function loadScript(src: string): Promise<void> {
  return new Promise((res, rej) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
    if (existing) {
      if (existing.dataset.loaded === 'true') { res(); return; }
      existing.addEventListener('load', () => res());
      existing.addEventListener('error', () => rej(new Error(`Failed to load ${src}`)));
      return;
    }
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => { s.dataset.loaded = 'true'; res(); };
    s.onerror = () => rej(new Error(`Failed to load ${src}`));
    document.head.appendChild(s);
  });
}

/**
 * Fetches MindAR's two workers, patches window.Worker so MindAR gets blob URLs,
 * runs `fn`, then restores window.Worker and frees the blobs.
 */
export async function withMindARWorkers<T>(fn: () => Promise<T>): Promise<T> {
  const [cr, ctr] = await Promise.all([
    fetch(MINDAR_CDN + 'compiler.worker.prod.js'),
    fetch(MINDAR_CDN + 'controller.worker.prod.js'),
  ]);
  if (!cr.ok || !ctr.ok) throw new Error('Could not download the AR engine workers.');
  const compilerBlob = URL.createObjectURL(new Blob([await cr.text()], { type: 'application/javascript' }));
  const controllerBlob = URL.createObjectURL(new Blob([await ctr.text()], { type: 'application/javascript' }));

  const OriginalWorker = window.Worker;
  const PatchedWorker = function (url: string | URL, opts?: WorkerOptions) {
    let target = typeof url === 'string' ? url : url.toString();
    if (!target.startsWith('blob:')) {
      if (/compiler[./]worker/.test(target)) target = compilerBlob;
      if (/controller[./]worker/.test(target)) target = controllerBlob;
    }
    return new OriginalWorker(target, opts);
  } as unknown as typeof Worker;

  window.Worker = PatchedWorker;
  try {
    return await fn();
  } finally {
    window.Worker = OriginalWorker;
    URL.revokeObjectURL(compilerBlob);
    URL.revokeObjectURL(controllerBlob);
  }
}

export function requireMindAR() {
  if (!window.MINDAR) throw new Error('AR engine did not load.');
  return window.MINDAR;
}
