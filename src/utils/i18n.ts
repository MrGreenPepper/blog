// Central registry of translation target languages. To add a language, add
// one entry here, one pair of collections in content.config.ts, and one
// entry in scripts/translate-posts.mjs's LANGUAGES list — everything else
// (routes, header switcher, cross-links) is driven from this list.
export const LANGUAGES = [
	{ code: 'en', label: 'English', flag: '🇬🇧', dir: 'ltr', blog: 'blogEn', pages: 'pagesEn' },
	{ code: 'zh', label: '中文', flag: '🇨🇳', dir: 'ltr', blog: 'blogZh', pages: 'pagesZh' },
	{ code: 'hi', label: 'हिन्दी', flag: '🇮🇳', dir: 'ltr', blog: 'blogHi', pages: 'pagesHi' },
	{ code: 'es', label: 'Español', flag: '🇪🇸', dir: 'ltr', blog: 'blogEs', pages: 'pagesEs' },
	{ code: 'fr', label: 'Français', flag: '🇫🇷', dir: 'ltr', blog: 'blogFr', pages: 'pagesFr' },
	{ code: 'ar', label: 'العربية', flag: '🇸🇦', dir: 'rtl', blog: 'blogAr', pages: 'pagesAr' },
	{ code: 'ru', label: 'Русский', flag: '🇷🇺', dir: 'ltr', blog: 'blogRu', pages: 'pagesRu' },
] as const;

export type LangCode = (typeof LANGUAGES)[number]['code'];
export type BlogCollection = (typeof LANGUAGES)[number]['blog'];
export type PagesCollection = (typeof LANGUAGES)[number]['pages'];

export const DE = { code: 'de' as const, label: 'Deutsch', flag: '🇩🇪', dir: 'ltr' as const };

export function findLanguage(code: string) {
	return LANGUAGES.find((l) => l.code === code);
}

// Given a request pathname and the site's base path, figures out which
// language section it's in — 'de' (the source language) if it doesn't
// match any /blog/<lang>/ prefix.
export function currentLangFromPath(pathname: string, basePrefix: string): LangCode | 'de' {
	for (const lang of LANGUAGES) {
		const prefix = `${basePrefix}/${lang.code}`;
		if (pathname === prefix || pathname.startsWith(`${prefix}/`)) return lang.code;
	}
	return 'de';
}
