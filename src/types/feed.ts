export interface FeedItem {
  id: string;
  title: string;
  link: string;
  content: string;
  contentSnippet?: string;
  pubDate: string;
  integrationName: string;
  integrationAlias?: string;
  createdAt: string;
  // Optional feed metadata for unified feed view
  feedInfo?: {
    id: string;
    title: string;
    url: string;
  };
}

export interface Feed {
  id: string;
  url: string;
  title: string;
  description?: string;
  integrationName: string;
  integrationAlias?: string;
  lastFetched: string;
  createdAt: string;
  updatedAt: string;
}

export interface FeedError {
  code: string;
  message: string;
  details?: unknown;
} 