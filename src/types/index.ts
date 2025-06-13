// RSS Feed Types
export interface RSSFeed {
    id: string
    title: string
    description: string
    url: string
    link: string
    lastUpdated: Date
    items: RSSItem[]
  }
  
  export interface RSSItem {
    id: string
    title: string
    description: string
    link: string
    pubDate: Date
    author?: string
    categories?: string[]
    content?: string
    guid?: string
    isRead?: boolean
  }
  
  // API Response Types
  export interface FeedParseResponse {
    success: boolean
    feed?: RSSFeed
    error?: string
  }
  
  // UI State Types
  export interface FeedState {
    feeds: RSSFeed[]
    loading: boolean
    error: string | null
  }
  
  export interface FeedFilters {
    searchTerm: string
    category: string
    showUnreadOnly: boolean
    dateRange: {
      start?: Date
      end?: Date
    }
  }