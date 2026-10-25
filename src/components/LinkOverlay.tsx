import { useEffect, useState } from 'react';
import { ExternalLink, X } from 'lucide-react';

/**
 * Shows a web page inside the AR experience. Sites that refuse to be embedded
 * leave the frame blank, so an "Open in browser" button is always offered and
 * a hint appears if nothing has rendered after a few seconds.
 */
export default function LinkOverlay({ url, label, brandColor, onClose }: { url: string; label: string; brandColor: string; onClose: () => void }) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setSlow(true), 4000);
    return () => clearTimeout(t);
  }, [url]);

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 40 }} className="bg-white flex flex-col">
      <div className="flex items-center gap-2 px-3 h-12 border-b border-slate-200 flex-shrink-0" style={{ borderTopWidth: 3, borderTopColor: brandColor }}>
        <button onClick={onClose} className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center text-slate-600"><X className="w-5 h-5" /></button>
        <span className="flex-1 text-sm font-bold text-slate-800 truncate">{label}</span>
        <a href={url} target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full text-white" style={{ backgroundColor: brandColor }}>
          <ExternalLink className="w-3.5 h-3.5" /> Open in browser
        </a>
      </div>
      <div className="relative flex-1 bg-slate-50">
        <iframe src={url} title={label} className="absolute inset-0 w-full h-full border-0 bg-white"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
          referrerPolicy="no-referrer-when-downgrade" />
        {slow && (
          <div className="absolute bottom-4 left-4 right-4 bg-slate-900/85 text-white text-xs rounded-xl px-4 py-3 text-center pointer-events-none">
            If the page stays blank, this site does not allow opening inside another page. Use “Open in browser”.
          </div>
        )}
      </div>
    </div>
  );
}
