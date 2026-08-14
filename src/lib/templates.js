import annexDDrainage from '../data/checklists/annex-d-drainage.json';
import { PRINT_TEMPLATE_KEYS } from './checklistSchema.js';
import { isSupabaseConfigured, supabase } from './supabase.js';

const LOCAL_TEMPLATES = [
  {
    id: 'local-annex-d-drainage',
    code: annexDDrainage.code,
    title: annexDDrainage.title,
    annex_label: annexDDrainage.annexLabel,
    schema: annexDDrainage,
    print_template_key: PRINT_TEMPLATE_KEYS.ANNEX_D_DRAINAGE,
    active: true,
  },
];

export function getLocalTemplates() {
  return LOCAL_TEMPLATES;
}

export function getLocalTemplateById(id) {
  return LOCAL_TEMPLATES.find((row) => row.id === id || row.code === id) ?? null;
}

export function getLocalTemplateByPrintKey(key) {
  return LOCAL_TEMPLATES.find((row) => row.print_template_key === key) ?? null;
}

export async function listTemplates() {
  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase
      .from('checklist_templates')
      .select('*')
      .eq('active', true)
      .order('annex_label');
    if (!error && data?.length) return data;
  }
  return LOCAL_TEMPLATES;
}

export async function getTemplate(idOrCode) {
  const key = idOrCode || LOCAL_TEMPLATES[0].id;
  if (isSupabaseConfigured && supabase && !String(key).startsWith('local-')) {
    const { data } = await supabase
      .from('checklist_templates')
      .select('*')
      .or(`id.eq.${key},code.eq.${key}`)
      .maybeSingle();
    if (data) return data;
  }
  return getLocalTemplateById(key) ?? LOCAL_TEMPLATES[0];
}
