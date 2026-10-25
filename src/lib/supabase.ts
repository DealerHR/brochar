import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export const STORAGE_BUCKET = 'brochure-assets';

export type TenantRole = 'owner' | 'editor' | 'viewer';

export type Tenant = {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  brand_color: string;
  description: string | null;
  is_active: boolean;
  whatsapp_number: string | null;
  phone_number: string | null;
  enquiry_email: string | null;
  created_at: string;
};

export type TenantMember = {
  user_id: string;
  email: string;
  role: TenantRole;
  created_at: string;
};

export type Product = {
  id: string;
  tenant_id: string;
  name: string;
  slug: string;
  thumbnail_url: string | null;
  description: string | null;
  display_order: number;
  is_active: boolean;
  created_at: string;
};

export type Brochure = {
  id: string;
  product_id: string;
  title: string;
  status: 'draft' | 'active' | 'inactive';
  mind_file_url: string | null;
  compiled_at: string | null;
  pages_changed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type BrochurePage = {
  id: string;
  brochure_id: string;
  page_index: number;
  image_url: string;
  label: string | null;
  created_at: string;
};

export type Hotspot = {
  id: string;
  page_id: string;
  label: string;
  description: string | null;
  pos_x: number;
  pos_y: number;
  dot_color: string;
  audio_type: 'tts' | 'upload' | 'none';
  audio_url: string | null;
  video_type: 'none' | 'youtube' | 'upload';
  video_ref: string | null;
  image_url: string | null;
  display_order: number;
  created_at: string;
};

export type BlockKind = 'link' | 'gallery' | 'spec_table' | 'pdf' | 'action' | 'quiz' | 'pitch';

export type LinkData = { url: string; label: string; open_mode: 'overlay' | 'newtab' };
export type GalleryData = { images: string[] };
export type SpecTableData = { title: string; rows: { label: string; value: string }[] };
export type PdfData = { url: string; label: string };
export type ActionData = { type: 'call' | 'whatsapp' | 'enquiry'; label: string; phone: string; message: string };
export type QuizData = { question: string; options: string[]; correct: number; explanation: string };
export type PitchData = { pitch: string; objection: string; response: string };

export type BlockData = LinkData | GalleryData | SpecTableData | PdfData | ActionData | QuizData | PitchData;

export type HotspotBlock = {
  id: string;
  hotspot_id: string;
  kind: BlockKind;
  position: number;
  data: BlockData;
  created_at?: string;
};

/** Blocks only shown in learn mode. */
export const LEARN_ONLY_KINDS: BlockKind[] = ['quiz', 'pitch'];

export function emptyBlockData(kind: BlockKind): BlockData {
  switch (kind) {
    case 'link': return { url: '', label: 'Open link', open_mode: 'overlay' };
    case 'gallery': return { images: [] };
    case 'spec_table': return { title: '', rows: [{ label: '', value: '' }] };
    case 'pdf': return { url: '', label: 'View document' };
    case 'action': return { type: 'whatsapp', label: '', phone: '', message: '' };
    case 'quiz': return { question: '', options: ['', ''], correct: 0, explanation: '' };
    case 'pitch': return { pitch: '', objection: '', response: '' };
  }
}

export type Lead = {
  id: string;
  tenant_id: string | null;
  product_id: string | null;
  brochure_id: string;
  hotspot_id: string | null;
  session_id: string | null;
  name: string;
  phone: string;
  email: string | null;
  message: string | null;
  source: string | null;
  status: 'new' | 'contacted' | 'closed';
  created_at: string;
};

export type ArEventType = 'session_start' | 'target_found' | 'hotspot_tapped' | 'media_played';

export type ArEvent = {
  id: string;
  brochure_id: string;
  tenant_id: string | null;
  product_id: string | null;
  session_id: string | null;
  page_id: string | null;
  hotspot_id: string | null;
  event_type: ArEventType;
  platform: 'ios' | 'android' | 'desktop' | 'other' | null;
  source: 'qr' | 'link' | 'learn' | null;
  occurred_at: string;
  date_key: string;
};
