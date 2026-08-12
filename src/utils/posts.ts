import { getCollection, type CollectionEntry } from 'astro:content';

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
