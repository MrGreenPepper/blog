import { getCollection, type CollectionEntry } from 'astro:content';
import type { BlogCollection } from './i18n';

export type PublishedPost = CollectionEntry<'blog'> & {
	data: {
		draft?: false;
		title: string;
		description: string;
		pubDate: Date;
		updatedDate?: Date;
	};
};

export async function getPublishedPosts(): Promise<PublishedPost[]> {
	const posts = (await getCollection('blog', ({ data }) => !data.draft)) as PublishedPost[];
	return posts.sort((a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf());
}

export type TranslatedPost = CollectionEntry<BlogCollection>;

export async function getTranslatedPosts(collection: BlogCollection): Promise<TranslatedPost[]> {
	const posts = await getCollection(collection);
	return posts.sort((a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf());
}
