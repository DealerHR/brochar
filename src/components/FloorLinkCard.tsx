import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Tenant } from '../lib/supabase';
import { ScanSearch, Copy, Check, Download, ExternalLink } from 'lucide-react';

/**
 * The client's sales floor link: one URL the sales team saves to their phone.
 * Shows every product's team content, so it is for staff, never for the printed
 * brochure.
 */
export default function FloorLinkCard({ tenant }: { tenant: Tenant }) {
  const url = `${window.location.origin}/${tenant.slug}/floor`;
  const [png, setPng] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    QRCode.toDataURL(url, { errorCorrectionLevel: 'M', margin: 2, width: 512, color: { dark: '#B45309', light: '#FFFFFF' } }).then(setPng);
  }, [url]);

  async function copyUrl() {
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* blocked */ }
  }
  function download() {
    const a = document.createElement('a');
    a.href = png; a.download = `${tenant.slug}-sales-floor-qr.png`; a.click();
  }

  return (
    <div className="bg-amber-50 rounded-2xl border border-amber-200 p-5 mb-6 flex gap-5 items-start">
      {png ? <img src={png} alt="Sales floor QR" className="w-24 h-24 rounded-xl border border-amber-200 bg-white flex-shrink-0" /> : <div className="w-24 h-24 rounded-xl bg-white/60 flex-shrink-0" />}
      <div className="flex-1 min-w-0">
        <h3 className="font-black text-amber-900 flex items-center gap-2 mb-1"><ScanSearch className="w-4 h-4" /> Sales floor app</h3>
        <p className="text-xs text-amber-900/80 mb-3 leading-snug">
          The sales team scans this once and saves it to the home screen. On the floor they point the phone at any product, tap, and its
          features and Ask AI open. Shows sales-team content for every product: share with staff only, never print it on a brochure.
        </p>
        <div className="flex items-center gap-2 bg-white border border-amber-200 rounded-xl px-3 py-2 mb-3">
          <span className="text-xs font-mono text-slate-600 flex-1 truncate">{url}</span>
          <button onClick={copyUrl} className="text-slate-400 hover:text-brand-navy" title="Copy link">{copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}</button>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={download} disabled={!png} className="inline-flex items-center gap-1.5 bg-amber-700 hover:bg-amber-800 disabled:opacity-50 text-white text-xs font-bold px-3 py-2 rounded-lg transition">
            <Download className="w-3.5 h-3.5" /> QR (PNG)
          </button>
          <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 bg-white border border-amber-300 text-amber-900 text-xs font-bold px-3 py-2 rounded-lg transition hover:border-amber-500">
            <ExternalLink className="w-3.5 h-3.5" /> Open
          </a>
        </div>
      </div>
    </div>
  );
}
