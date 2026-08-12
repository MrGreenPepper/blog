import rss from '@astrojs/rss';
import { SITE_DESCRIPTION, SITE_TITLE } from '../consts';
import { getPublishedPosts } from '../utils/posts';
import { withBase } from '../utils/url';

export async function GET(context) {
	const posts = await getPublishedPosts();
	return rss({
		title: SITE_TITLE,
		description: SITE_DESCRIPTION,
		site: new URL(withBase(''), context.site),
		items: posts.map((post) => ({
			...post.data,
			link: withBase(`blog/${post.id}/`),
		})),
	});
}
