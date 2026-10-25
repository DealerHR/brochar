import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type Tenant = {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  brand_color: string;
  description: string | null;
  is_active: boolean;
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

export type ArEvent = {
  id: string;
  brochure_id: string;
  page_id: string | null;
  hotspot_id: string | null;
  event_type: 'session_start' | 'target_found' | 'hotspot_tapped';
  occurred_at: string;
  date_key: string;
};
