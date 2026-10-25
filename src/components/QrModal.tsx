import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Product, Tenant } from '../lib/supabase';
import { X, Download, Copy, Check, GraduationCap, QrCode } from 'lucide-react';

/**
 * QR codes for a product's AR link, ready for the designer to place on the
 * printed brochure. The customer code carries ?src=qr so analytics can tell
 * QR scans from shared links. The learn code opens learn mode.
 */
export default function QrModal({ tenant, product, onClose }: { tenant: Tenant; product: Product; onClose: () => void }) {
  const [mode, setMode] = useState<'customer' | 'learn'>('customer');
  const [png, setPng] = useState('');
  const [svg, setSvg] = useState('');
  const [copied, setCopied] = useState(false);

  const base = `${window.location.origin}/${tenant.slug}/${product.slug}`;
  const url = mode === 'learn' ? `${base}/learn` : `${base}?src=qr`;
  const color = mode === 'learn' ? '#B45309' : tenant.brand_color;

  useEffect(() => {
    const opts = { errorCorrectionLevel: 'M' as const, margin: 2, color: { dark: color, light: '#FFFFFF' } };
    QRCode.toDataURL(url, { ...opts, width: 1024 }).then(setPng);
    QRCode.toString(url, { ...opts, type: 'svg', width: 512 }).then(setSvg);
  }, [url, color]);

  function download(href: string, ext: string) {
    const a = document.createElement('a');
    a.href = href;
    a.download = `${tenant.slug}-${product.slug}${mode === 'learn' ? '-learn' : ''}-qr.${ext}`;
    a.click();
  }

  async function copyUrl() {
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* blocked */ }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-lg font-black text-brand-navy flex items-center gap-2"><QrCode className="w-5 h-5 text-brand-cerise" /> QR code</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-brand-navy"><X className="w-5 h-5" /></button>
        </div>
        <p className="text-xs text-slate-400 mb-4">{product.name} · {tenant.name}</p>

        <div className="flex gap-1 bg-slate-100 rounded-xl p-1 mb-4">
          <button onClick={() => setMode('customer')}
            className={`flex-1 text-xs font-bold py-2 rounded-lg transition ${mode === 'customer' ? 'bg-white text-brand-navy shadow-sm' : 'text-slate-500'}`}>
            For the brochure
          </button>
          <button onClick={() => setMode('learn')}
            className={`flex-1 text-xs font-bold py-2 rounded-lg transition inline-flex items-center justify-center gap-1 ${mode === 'learn' ? 'bg-white text-amber-700 shadow-sm' : 'text-slate-500'}`}>
            <GraduationCap className="w-3.5 h-3.5" /> For sales training
          </button>
        </div>

        <div className="flex justify-center mb-3">
          {png ? <img src={png} alt="QR code" className="w-56 h-56 rounded-xl border border-slate-100" /> : <div className="w-56 h-56 rounded-xl bg-slate-100 animate-pulse" />}
        </div>
        <p className="text-[11px] text-slate-400 text-center mb-4 leading-snug">
          {mode === 'customer'
            ? 'Print at 20 mm or larger. Scans from this code are counted separately in Analytics.'
            : 'Share with sales executives only. Opens learn mode with pitches, objections and quick checks.'}
        </p>

        <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 mb-4">
          <span className="text-xs font-mono text-slate-600 flex-1 truncate">{url}</span>
          <button onClick={copyUrl} className="text-slate-400 hover:text-brand-navy" title="Copy link">{copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}</button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => png && download(png, 'png')} disabled={!png}
            className="inline-flex items-center justify-center gap-2 bg-brand-navy hover:bg-brand-navy/90 disabled:opacity-50 text-white text-sm font-bold py-2.5 rounded-xl transition">
            <Download className="w-4 h-4" /> PNG
          </button>
          <button onClick={() => svg && download(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`, 'svg')} disabled={!svg}
            className="inline-flex items-center justify-center gap-2 bg-white border-2 border-slate-200 hover:border-brand-navy text-brand-navy text-sm font-bold py-2.5 rounded-xl transition">
            <Download className="w-4 h-4" /> SVG (print)
          </button>
        </div>
      </div>
    </div>
  );
}
