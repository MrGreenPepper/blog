#!/usr/bin/env node
// Translates published German posts in src/content/blog into English versions
// under src/content/blog-en, using the OpenAI API. Run in CI on every push to
// main, before the site is built, so new/changed posts get an English
// counterpart automatically.
//
// A post keeps its English translation up to date via a content hash stored
// in the translated file's frontmatter (sourceHash) — it's only retranslated
// when the German source actually changes. Drafts (`draft: true`) and posts
// with `translate: false` in their frontmatter are skipped. English files
// whose German source was deleted are removed.

import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import matter from 'gray-matter';

const DE_DIR = 'src/content/blog';
const EN_DIR = 'src/content/blog-en';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

function hashContent(raw) {
	return createHash('sha256').update(raw).digest('hex').slice(0, 16);
}

async function translate(title, description, body) {
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
						'You translate blog posts from German to English for a personal tech blog. ' +
						'Keep the tone natural and informal, matching the source. Preserve Markdown ' +
						'syntax, code blocks, and links exactly as-is — translate only prose. Respond ' +
						'with strict JSON of the shape {"title": string, "description": string, "body": string} ' +
						'and nothing else.',
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

async function main() {
	if (!OPENAI_API_KEY) {
		console.log('OPENAI_API_KEY is not set — skipping translation.');
		return;
	}

	await mkdir(EN_DIR, { recursive: true });

	const files = (await readdir(DE_DIR)).filter((f) => /\.(md|mdx)$/.test(f));
	const sourceSlugs = new Set();
	let changed = false;

	for (const file of files) {
		const slug = file.replace(/\.(md|mdx)$/, '');
		sourceSlugs.add(slug);

		const raw = await readFile(path.join(DE_DIR, file), 'utf-8');
		const parsed = matter(raw);

		if (parsed.data.draft) continue;
		if (parsed.data.translate === false) continue;

		const sourceHash = hashContent(raw);
		const enPath = path.join(EN_DIR, file);

		let existingHash;
		try {
			existingHash = matter(await readFile(enPath, 'utf-8')).data.sourceHash;
		} catch {
			// no existing translation yet
		}
		if (existingHash === sourceHash) continue;

		console.log(`Translating ${file}...`);
		const translated = await translate(parsed.data.title, parsed.data.description, parsed.content);

		const out = matter.stringify(`${translated.body.trim()}\n`, {
			title: translated.title,
			description: translated.description,
			pubDate: parsed.data.pubDate,
			...(parsed.data.updatedDate ? { updatedDate: parsed.data.updatedDate } : {}),
			sourceHash,
		});

		await writeFile(enPath, out);
		changed = true;
	}

	const enFiles = (await readdir(EN_DIR)).filter((f) => /\.(md|mdx)$/.test(f));
	for (const file of enFiles) {
		const slug = file.replace(/\.(md|mdx)$/, '');
		if (!sourceSlugs.has(slug)) {
			await unlink(path.join(EN_DIR, file));
			changed = true;
		}
	}

	console.log(changed ? 'Translations updated.' : 'Translations already up to date.');
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
