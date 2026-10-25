import { useEffect, useRef, useState } from 'react';
import { loadScript } from '../lib/mindar';
import { ExternalLink, X } from 'lucide-react';

const PDFJS_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/';

/**
 * Shows a PDF inside the AR experience. Phones cannot embed PDFs in a page
 * reliably (Android Chrome downloads them), so the pages are rendered to
 * canvases with pdf.js and shown as a scrollable, fit-to-width list.
 */
export default function PdfOverlay({ url, label, brandColor, onClose }: { url: string; label: string; brandColor: string; onClose: () => void }) {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [pageCount, setPageCount] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await loadScript(PDFJS_CDN + 'pdf.min.js');
        const pdfjs = window.pdfjsLib;
        if (!pdfjs) throw new Error('no pdfjs');
        pdfjs.GlobalWorkerOptions.workerSrc = PDFJS_CDN + 'pdf.worker.min.js';
        const pdf = await pdfjs.getDocument({ url }).promise;
        if (cancelled) return;
        setPageCount(pdf.numPages);
        const width = (listRef.current?.clientWidth ?? window.innerWidth) - 24;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        for (let n = 1; n <= pdf.numPages; n++) {
          if (cancelled || !listRef.current) return;
          const page = await pdf.getPage(n);
          const base = page.getViewport({ scale: 1 });
          const scale = width / base.width;
          const viewport = page.getViewport({ scale: scale * dpr });
          const canvas = document.createElement('canvas');
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          canvas.style.width = `${width}px`;
          canvas.style.height = `${viewport.height / dpr}px`;
          canvas.className = 'block mx-auto mb-3 bg-white shadow-sm rounded';
          listRef.current.appendChild(canvas);
          await page.render({ canvasContext: canvas.getContext('2d')!, viewport }).promise;
          if (n === 1) setStatus('ready');
        }
      } catch {
        if (!cancelled) setStatus('error');
      }
    })();
    return () => { cancelled = true; };
  }, [url]);

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 40 }} className="bg-slate-100 flex flex-col">
      <div className="flex items-center gap-2 px-3 h-12 bg-white border-b border-slate-200 flex-shrink-0" style={{ borderTopWidth: 3, borderTopColor: brandColor }}>
        <button onClick={onClose} className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center text-slate-600"><X className="w-5 h-5" /></button>
        <span className="flex-1 text-sm font-bold text-slate-800 truncate">{label}{pageCount > 0 && <span className="text-slate-400 font-medium"> · {pageCount} page{pageCount === 1 ? '' : 's'}</span>}</span>
        <a href={url} target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full text-white" style={{ backgroundColor: brandColor }}>
          <ExternalLink className="w-3.5 h-3.5" /> Open
        </a>
      </div>
      <div ref={listRef} className="flex-1 overflow-y-auto overscroll-contain p-3">
        {status === 'loading' && (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400 text-sm">
            <div className="w-7 h-7 border-2 border-slate-300 border-t-transparent rounded-full animate-spin mb-3" style={{ borderTopColor: 'transparent', borderColor: brandColor, borderTopWidth: 2 }} />
            Loading document…
          </div>
        )}
        {status === 'error' && (
          <div className="text-center py-20 text-sm text-slate-500">
            Could not show this document here. Use “Open” to view it in your browser.
          </div>
        )}
      </div>
    </div>
  );
}
