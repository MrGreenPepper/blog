#!/usr/bin/env node
// Translates published German content (blog posts + static pages) into each
// language in LANGUAGES below, using the OpenAI API. Run in CI on every push
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

// Keep in sync with src/utils/i18n.ts's LANGUAGES list.
const LANGUAGES = [
	{ code: 'en', name: 'English' },
	{ code: 'zh', name: 'Mandarin Chinese (Simplified script)' },
	{ code: 'hi', name: 'Hindi' },
	{ code: 'es', name: 'Spanish' },
	{ code: 'fr', name: 'French' },
	{ code: 'ar', name: 'Modern Standard Arabic' },
	{ code: 'ru', name: 'Russian' },
];

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

function hashContent(raw) {
	return createHash('sha256').update(raw).digest('hex').slice(0, 16);
}

async function translate(languageName, title, description, body) {
	const res = await fetch('https://api.openai.com/v1/chat/completions', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${OPENAI_API_KEY}`,
		},
		body: JSON.stringify({
			model: OPENAI_MODEL,
			response_format: { type: 'json_object' },
			messages: [
				{
					role: 'system',
					content:
						`You translate blog content from German to ${languageName} for a personal ` +
						'tech blog. Keep the tone natural and informal, matching the source. Preserve ' +
						'Markdown syntax, code blocks, and links exactly as-is — translate only prose. ' +
						'Respond with strict JSON of the shape ' +
						'{"title": string, "description": string, "body": string} and nothing else.',
				},
				{ role: 'user', content: JSON.stringify({ title, description, body }) },
			],
		}),
	});

	if (!res.ok) {
		throw new Error(`OpenAI request failed: ${res.status} ${await res.text()}`);
	}

	const data = await res.json();
	const result = JSON.parse(data.choices[0].message.content);
	for (const field of ['title', 'description', 'body']) {
		if (typeof result[field] !== 'string' || !result[field].trim()) {
			throw new Error(`Translation response missing "${field}"`);
		}
	}
	return result;
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
			translated = await translate(lang.name, parsed.data.title, parsed.data.description, parsed.content);
		} catch (err) {
			// A translation failure (billing, rate limit, a flaky response) must
			// never take the whole site down with it — skip this file and move on.
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
	if (!OPENAI_API_KEY) {
		console.log('OPENAI_API_KEY is not set — skipping translation.');
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
