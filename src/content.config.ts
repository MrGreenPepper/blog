import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

// A draft only needs `draft: true` — nothing else is checked, so an
// unfinished post can never break the build. Once `draft` is false/absent,
// the full schema applies.
const draftSchema = z.object({
	draft: z.literal(true),
	title: z.string().optional(),
	description: z.string().optional(),
	pubDate: z.coerce.date().optional(),
	updatedDate: z.coerce.date().optional(),
});

const publishedSchema = z.object({
	draft: z.literal(false).optional(),
	title: z.string(),
	description: z.string(),
	// Transform string to Date object
	pubDate: z.coerce.date(),
	updatedDate: z.coerce.date().optional(),
});

const blog = defineCollection({
	// Load Markdown and MDX files in the `src/content/blog/` directory.
	loader: glob({ base: './src/content/blog', pattern: '**/*.{md,mdx}' }),
	schema: z.union([draftSchema, publishedSchema]),
});

export const collections = { blog };
