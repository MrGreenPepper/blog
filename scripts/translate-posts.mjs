#!/usr/bin/env node
// Translates published German content (blog posts + static pages) into each
// language in LANGUAGES below, using the DeepL API. Run in CI on every push
// to main, before the site is built.
//
// A translation stays in sync via a content hash stored in its frontmatter
// (sourceHash) — a file is only retranslated when its German source
// actually changes. Blog drafts (`draft: true`) and anything with
// `translate: false` in its frontmatter are skipped. Translated files whose
// German source was deleted are removed.

import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import matter from 'gray-matter';

// `code` must match src/utils/i18n.ts's LANGUAGES list. `deeplTarget` is
// DeepL's target_lang code for that language.
const LANGUAGES = [
	{ code: 'en', deeplTarget: 'EN-US' },
	{ code: 'zh', deeplTarget: 'ZH' },
	{ code: 'hi', deeplTarget: 'HI' },
	{ code: 'es', deeplTarget: 'ES' },
	{ code: 'fr', deeplTarget: 'FR' },
	{ code: 'ar', deeplTarget: 'AR' },
	{ code: 'ru', deeplTarget: 'RU' },
	{ code: 'id', deeplTarget: 'ID' },
];

const DEEPL_KEY = process.env.DEEPL_KEY;
// Free-tier keys are suffixed ":fx" and use a different API host than paid keys.
const DEEPL_API_URL = DEEPL_KEY?.endsWith(':fx')
	? 'https://api-free.deepl.com/v2/translate'
	: 'https://api.deepl.com/v2/translate';

function hashContent(raw) {
	return createHash('sha256').update(raw).digest('hex').slice(0, 16);
}

async function translate(deeplTarget, title, description, body) {
	const res = await fetch(DEEPL_API_URL, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `DeepL-Auth-Key ${DEEPL_KEY}`,
		},
		body: JSON.stringify({
			text: [title, description, body],
			source_lang: 'DE',
			target_lang: deeplTarget,
			preserve_formatting: true,
		}),
	});

	if (!res.ok) {
		throw new Error(`DeepL request failed: ${res.status} ${await res.text()}`);
	}

	const data = await res.json();
	const [translatedTitle, translatedDescription, translatedBody] = data.translations.map((t) => t.text);
	if (!translatedTitle || !translatedDescription || !translatedBody) {
		throw new Error('DeepL response missing a translated field');
	}
	return { title: translatedTitle, description: translatedDescription, body: translatedBody };
}

// srcDir/destDirFor are content directories (e.g. src/content/blog and a
// function returning src/content/blog-<lang>). withDates controls whether
// pubDate/updatedDate are carried over (blog posts have them, static pages
// don't).
async function syncLanguage(lang, srcDir, destDirFor, { withDates }) {
	const destDir = destDirFor(lang.code);
	await mkdir(destDir, { recursive: true });

	const files = (await readdir(srcDir)).filter((f) => /\.(md|mdx)$/.test(f));
	const sourceSlugs = new Set();
	let changed = false;

	for (const file of files) {
		sourceSlugs.add(file.replace(/\.(md|mdx)$/, ''));

		const raw = await readFile(path.join(srcDir, file), 'utf-8');
		const parsed = matter(raw);

		if (parsed.data.draft) continue;
		if (parsed.data.translate === false) continue;

		const sourceHash = hashContent(raw);
		const destPath = path.join(destDir, file);

		let existingHash;
		try {
			existingHash = matter(await readFile(destPath, 'utf-8')).data.sourceHash;
		} catch {
			// no existing translation yet
		}
		if (existingHash === sourceHash) continue;

		console.log(`Translating ${srcDir}/${file} -> ${lang.code}...`);
		let translated;
		try {
			translated = await translate(lang.deeplTarget, parsed.data.title, parsed.data.description, parsed.content);
		} catch (err) {
			// A translation failure (billing, rate limit, an unsupported
			// language) must never take the whole site down with it — skip
			// this file and move on.
			console.error(`Skipping ${srcDir}/${file} -> ${lang.code}: ${err.message}`);
			continue;
		}

		const frontmatter = {
			title: translated.title,
			description: translated.description,
			...(withDates ? { pubDate: parsed.data.pubDate } : {}),
			...(withDates && parsed.data.updatedDate ? { updatedDate: parsed.data.updatedDate } : {}),
			sourceHash,
		};
		await writeFile(destPath, matter.stringify(`${translated.body.trim()}\n`, frontmatter));
		changed = true;
	}

	const destFiles = (await readdir(destDir)).filter((f) => /\.(md|mdx)$/.test(f));
	for (const file of destFiles) {
		if (!sourceSlugs.has(file.replace(/\.(md|mdx)$/, ''))) {
			await unlink(path.join(destDir, file));
			changed = true;
		}
	}

	return changed;
}

async function main() {
	if (!DEEPL_KEY) {
		console.log('DEEPL_KEY is not set — skipping translation.');
		return;
	}

	let changed = false;
	for (const lang of LANGUAGES) {
		try {
			changed = (await syncLanguage(lang, 'src/content/blog', (c) => `src/content/blog-${c}`, { withDates: true })) || changed;
			changed = (await syncLanguage(lang, 'src/content/pages', (c) => `src/content/pages-${c}`, { withDates: false })) || changed;
		} catch (err) {
			console.error(`Skipping ${lang.code} entirely: ${err.message}`);
		}
	}

	console.log(changed ? 'Translations updated.' : 'Translations already up to date.');
}

// Translation is best-effort: a failure here must never block the build/deploy
// that follows, so this always exits 0 — errors are logged, not fatal.
main().catch((err) => {
	console.error(err);
});
