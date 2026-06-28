export type WikiLang = 'fr' | 'en' | 'de' | 'es' | 'zh-HK' | 'br' | 'ca';

export interface WikiSection {
  type: 'h2' | 'h3' | 'p' | 'ul' | 'ol' | 'tip' | 'warning' | 'kbd';
  text?: string;
  items?: string[];
  shortcuts?: { key: string; desc: string }[];
}

export type LangContent = Partial<Record<WikiLang, WikiSection[]>> & { fr: WikiSection[]; en: WikiSection[] };
export type LangTitle  = Partial<Record<WikiLang, string>>        & { fr: string; en: string };

export interface WikiArticle {
  id: string;
  icon: string;
  category: 'start' | 'competition' | 'phases' | 'remote' | 'advanced';
  title: LangTitle;
  content: LangContent;
}
