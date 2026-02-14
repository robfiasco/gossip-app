import { influencerAllowlist } from "./influencerAllowlist";
import { mockPosts } from "./mockMentions";

export type StoryEntity = string;

export type StoryForMentions = {
  id: string;
  title: string;
  url: string;
  entities: StoryEntity[];
};

export type Mention = {
  storyId: string;
  handle: string;
  url: string;
  postedAt: string;
  excerpt?: string;
  keyPhrases?: string[];
};

const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

const extractExcerpt = (text: string) =>
  text.replace(/\s+/g, " ").trim().slice(0, 120);

const extractKeyPhrases = (text: string, entities: string[]) => {
  const phrases: string[] = [];
  const lowerText = text.toLowerCase();
  for (const entity of entities) {
    const token = entity.toLowerCase();
    if (lowerText.includes(token)) {
      phrases.push(entity.slice(0, 20));
    }
    if (phrases.length >= 5) break;
  }
  return phrases;
};

export const matchMentions = (stories: StoryForMentions[]): Mention[] => {
  const mentions: Mention[] = [];
  const posts = mockPosts.filter((post) => influencerAllowlist.includes(post.handle));

  for (const story of stories) {
    const normalizedEntities = story.entities.map((entity) => normalize(entity)).filter(Boolean);
    for (const post of posts) {
      const normalizedPost = normalize(post.text);
      const matchesEntity = normalizedEntities.some((entity) => normalizedPost.includes(entity));
      const matchesUrl = post.url.includes(story.url);
      const entityTokens = normalizedEntities.flatMap((entity) => entity.split(" ").filter(Boolean));
      const tokenMatches = entityTokens.filter((token) => normalizedPost.includes(token));
      const matchesTokens = tokenMatches.length >= 2;

      if (matchesEntity || matchesUrl || matchesTokens) {
        const excerpt = extractExcerpt(post.text);
        const keyPhrases = extractKeyPhrases(post.text, story.entities);
        mentions.push({
          storyId: story.id,
          handle: post.handle,
          url: post.url,
          postedAt: post.postedAt,
          excerpt,
          keyPhrases: keyPhrases.length ? keyPhrases : undefined,
        });
      }
    }
  }

  return mentions;
};
