import { useEffect } from 'react';
import { Hotspot, HotspotBlock, Tenant } from '../lib/supabase';
import BlockView, { LeadSubmit } from './BlockView';
import { X } from 'lucide-react';

type Props = {
  hotspot: Hotspot;
  blocks: HotspotBlock[];
  tenant: Tenant;
  brandColor: string;
  learnMode: boolean;
  onClose: () => void;
  onLinkOpen: (url: string, label: string, mode: 'overlay' | 'newtab') => void;
  onLead: LeadSubmit;
  onMedia: () => void;
};

/**
 * The content card for one hotspot. Sits centred over the live camera view,
 * grows with its content up to most of the screen, scrolls inside after that.
 * The first audio or video block is allowed to autoplay.
 */
export default function HotspotCard({ hotspot, blocks, tenant, brandColor, learnMode, onClose, onLinkOpen, onLead, onMedia }: Props) {
  const firstMediaId = blocks.find(b => b.kind === 'audio' || b.kind === 'video')?.id;
  const fallbackSpeech = `${hotspot.label}. ${blocks.filter(b => b.kind === 'text').map(b => (b.data as { text: string }).text).join(' ')}`;

  // Escape closes on desktop testing
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 30 }} className="flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/45" onClick={onClose} />
      <div
        className="relative bg-white rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-card-in"
        style={{ width: 'min(92vw, 440px)', maxHeight: '82vh' }}
        role="dialog" aria-label={hotspot.label}
      >
        <div className="h-1.5 flex-shrink-0" style={{ backgroundColor: brandColor }} />
        <div className="flex items-start gap-3 px-5 pt-4 pb-2 flex-shrink-0">
          <span className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-black flex-shrink-0 mt-0.5" style={{ backgroundColor: hotspot.dot_color }}>
            {hotspot.display_order + 1}
          </span>
          <h2 className="text-lg font-bold text-slate-900 leading-snug flex-1">{hotspot.label}</h2>
          <button onClick={onClose} aria-label="Close"
            className="flex-shrink-0 w-9 h-9 -mr-2 -mt-1 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200 active:scale-95 transition">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="px-5 pb-5 overflow-y-auto space-y-3 overscroll-contain">
          {blocks.length === 0 && <p className="text-sm text-slate-400">No content yet.</p>}
          {blocks.map(b => (
            <BlockView key={b.id} block={b} tenant={tenant} brandColor={brandColor} learnMode={learnMode}
              fallbackSpeech={fallbackSpeech} autoplay={b.id === firstMediaId}
              onLinkOpen={onLinkOpen} onLead={onLead} onMedia={onMedia} />
          ))}
        </div>
      </div>
    </div>
  );
}
