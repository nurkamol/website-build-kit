import { getCollection, type CollectionEntry } from 'astro:content';
import { business } from '../data/business';

export type Post = CollectionEntry<'blog'>;

/** Published posts, newest first. Drafts never reach a build. */
export async function getPosts(): Promise<Post[]> {
  const posts = await getCollection('blog', ({ data }) => !data.draft);
  return posts.sort((a, b) => b.data.publishedAt.getTime() - a.data.publishedAt.getTime());
}

export async function getPostsByCategory(categoryName: string): Promise<Post[]> {
  const posts = await getPosts();
  return posts.filter((post) => post.data.categories.includes(categoryName));
}

/**
 * Related posts: prefer ones sharing the most categories, then the most recent.
 * "General" is on nearly everything, so it is worth little as a signal.
 */
export function relatedPosts(post: Post, all: Post[], limit = 3): Post[] {
  const weight = (name: string) => (name === 'General' ? 1 : 4);
  return all
    .filter((candidate) => candidate.id !== post.id)
    .map((candidate) => ({
      candidate,
      score: candidate.data.categories
        .filter((c) => post.data.categories.includes(c))
        .reduce((sum, c) => sum + weight(c), 0),
    }))
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.candidate.data.publishedAt.getTime() - a.candidate.data.publishedAt.getTime(),
    )
    .slice(0, limit)
    .map((entry) => entry.candidate);
}

/** ~230 wpm, rounded up. Matches what Rank Math reported on the old site. */
export function readingMinutes(body: string): number {
  const words = body.trim().split(/\s+/).length;
  return Math.max(1, Math.round(words / 230));
}

/**
 * ⚠ `timeZone: 'UTC'` is load-bearing, not a default being spelled out.
 *
 * `publishedAt: 2026-08-21` in frontmatter becomes 2026-08-21T00:00:00Z, and
 * formatting that instant in the BUILD MACHINE's zone renders 20 August
 * anywhere west of Greenwich. Measured: US Pacific and US Eastern both shift
 * it; London and Tokyo do not. So the same commit published a different date
 * depending on who ran the build, and nothing anywhere reported it.
 *
 * The locale still comes from the business — that decides the ORDER and the
 * wording. Only the zone is pinned.
 */
export const formatDate = (date: Date) =>
  date.toLocaleDateString(business.locale, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
