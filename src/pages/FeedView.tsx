import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { getFeedItems } from '../services/feedService'
import { useFeedUpdates } from '../hooks/useFeedUpdates'
import { sanitizeAndTruncate } from '../utils/textSanitizer'
import type { FeedItem } from '../types/feed'

const FeedView = () => {
  const { feedId } = useParams<{ feedId: string }>()

  // Fetch feed items
  const { data: itemsData, isLoading, error, refetch } = useQuery({
    queryKey: ['feedItems', feedId],
    queryFn: () => getFeedItems(feedId!),
    enabled: !!feedId,
  })

  // Listen for updates for this specific feed
  const { newItems } = useFeedUpdates(feedId)

  const items = itemsData?.items || []

  const handleRefresh = () => {
    refetch()
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const truncateContent = (content: string, maxLength: number = 200) => {
    return sanitizeAndTruncate(content, maxLength);
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-900">
          Feed Items
        </h2>
        <button 
          onClick={handleRefresh}
          disabled={isLoading}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
        >
          {isLoading ? 'Refreshing...' : 'Refresh Feed'}
        </button>
      </div>

      {/* New Items Notification */}
      {newItems.length > 0 && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-green-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-green-800">
                {newItems.length} new item{newItems.length > 1 ? 's' : ''} available!
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Feed Items */}
      <div className="space-y-4">
        {isLoading ? (
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
            <p className="text-gray-500 mt-2">Loading feed items...</p>
          </div>
        ) : error ? (
          <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
            <p className="text-red-600">Error loading feed items. Please try again.</p>
          </div>
        ) : items.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-6 text-center">
            <p className="text-gray-500">No feed items found.</p>
            <p className="text-sm text-gray-400 mt-2">Items will appear here once the feed is processed.</p>
          </div>
        ) : (
          items.map((item: FeedItem) => (
            <div key={item.id} className="bg-white rounded-lg shadow p-6 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full font-medium">
                    {item.integrationAlias || item.integrationName}
                  </span>
                  <span className="text-xs text-gray-500">
                    {formatDate(item.pubDate)}
                  </span>
                </div>
                {item.link && (
                  <a
                    href={item.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                  >
                    View Original →
                  </a>
                )}
              </div>
              
              <h3 className="text-lg font-semibold text-gray-900 mb-3">
                {item.title}
              </h3>
              
              <div className="text-gray-700 leading-relaxed">
                {item.contentSnippet ? (
                  <p>{truncateContent(item.contentSnippet)}</p>
                ) : (
                  <p>{truncateContent(item.content)}</p>
                )}
              </div>
              
              {(item.content.length > 200 || (item.contentSnippet && item.contentSnippet.length > 200)) && (
                <button
                  onClick={() => window.open(item.link, '_blank')}
                  className="mt-3 text-blue-600 hover:text-blue-800 text-sm font-medium"
                >
                  Read more →
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}

export default FeedView