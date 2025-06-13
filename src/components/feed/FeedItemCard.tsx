import type { FeedItem } from '../../types/feed';
import { sanitizeAndTruncate } from '../../utils/textSanitizer';

interface FeedItemCardProps {
  item: FeedItem;
  timeAgo: string;
}

const FeedItemCard = ({ item, timeAgo }: FeedItemCardProps) => {
  const truncateContent = (content: string, maxLength: number = 300) => {
    return sanitizeAndTruncate(content, maxLength);
  };

  const getIntegrationColor = (integrationName: string) => {
    // Generate consistent colors based on integration name
    const colors = [
      { bg: 'linear-gradient(to right, #3b82f6, #1d4ed8)', text: 'white' },
      { bg: 'linear-gradient(to right, #10b981, #059669)', text: 'white' },
      { bg: 'linear-gradient(to right, #8b5cf6, #7c3aed)', text: 'white' },
      { bg: 'linear-gradient(to right, #f59e0b, #d97706)', text: 'white' },
      { bg: 'linear-gradient(to right, #ec4899, #db2777)', text: 'white' },
      { bg: 'linear-gradient(to right, #6366f1, #4f46e5)', text: 'white' },
      { bg: 'linear-gradient(to right, #ef4444, #dc2626)', text: 'white' },
      { bg: 'linear-gradient(to right, #eab308, #ca8a04)', text: 'white' },
    ];
    
    const hash = integrationName.split('').reduce((a, b) => {
      a = ((a << 5) - a) + b.charCodeAt(0);
      return a & a;
    }, 0);
    
    return colors[Math.abs(hash) % colors.length];
  };

  const displayName = item.integrationAlias || item.integrationName;
  const colorScheme = getIntegrationColor(item.integrationName);

  return (
    <div className="modern-card group" style={{ padding: '1.5rem' }}>
      {/* Header with integration label and metadata */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div 
            style={{ 
              width: '2.5rem', 
              height: '2.5rem', 
              background: colorScheme.bg,
              borderRadius: '0.75rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: colorScheme.text,
              fontWeight: 'bold',
              boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)'
            }}
          >
            {displayName.charAt(0).toUpperCase()}
          </div>
          <div>
            <span style={{ fontWeight: '600', color: '#111827', fontSize: '0.875rem' }}>
              {displayName}
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', color: '#6b7280', marginTop: '0.25rem' }}>
              <svg className="icon-sm" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>{timeAgo}</span>
            </div>
          </div>
        </div>
        
        {item.link && (
          <a
            href={item.link}
            target="_blank"
            rel="noopener noreferrer"
            className="modern-button"
            style={{
              opacity: 0,
              fontSize: '0.875rem',
              padding: '0.5rem 1rem',
              transition: 'all 0.2s ease-in-out'
            }}
            onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
            onMouseLeave={(e) => e.currentTarget.style.opacity = '0'}
          >
            <span>View</span>
            <svg className="icon-sm" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </a>
        )}
      </div>
      
      {/* Title */}
      <h3 className="title-md" style={{ marginBottom: '1rem', lineHeight: '1.4' }}>
        {item.title}
      </h3>
      
      {/* Content */}
      <div style={{ color: '#374151', lineHeight: '1.6', marginBottom: '1.5rem' }}>
        {item.contentSnippet ? (
          <p style={{ color: '#6b7280', whiteSpace: 'pre-line' }}>{truncateContent(item.contentSnippet)}</p>
        ) : (
          <p style={{ color: '#6b7280', whiteSpace: 'pre-line' }}>
            {truncateContent(item.content)}
          </p>
        )}
      </div>
      
      {/* Footer with additional metadata */}
      <div style={{ 
        paddingTop: '1rem', 
        borderTop: '1px solid #f3f4f6', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '1rem'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', fontSize: '0.875rem', color: '#6b7280' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <svg className="icon-sm" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <span>{new Date(item.pubDate).toLocaleDateString()}</span>
          </div>
          {item.feedInfo && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <svg className="icon-sm" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9.5a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
              </svg>
              <span>{item.feedInfo.title}</span>
            </div>
          )}
        </div>
        
        {(item.content.length > 300 || (item.contentSnippet && item.contentSnippet.length > 300)) && (
          <button
            onClick={() => window.open(item.link, '_blank')}
            style={{
              color: '#2563eb',
              fontWeight: '500',
              fontSize: '0.875rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.25rem',
              transition: 'color 0.2s ease-in-out',
              background: 'none',
              border: 'none',
              cursor: 'pointer'
            }}
            onMouseEnter={(e) => e.currentTarget.style.color = '#1d4ed8'}
            onMouseLeave={(e) => e.currentTarget.style.color = '#2563eb'}
          >
            Read more
            <svg className="icon-sm" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        )}
      </div>

      {/* URL pill at bottom */}
      {item.feedInfo && (
        <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'flex-start' }}>
          <div style={{ 
            display: 'inline-flex', 
            alignItems: 'center', 
            gap: '0.5rem', 
            fontSize: '0.75rem', 
            color: '#1e40af',
            backgroundColor: '#dbeafe',
            padding: '0.375rem 0.75rem',
            borderRadius: '9999px',
            border: '1px solid #bfdbfe'
          }}>
            <svg className="icon-sm" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.102m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
            </svg>
            <span style={{ 
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              maxWidth: '20rem'
            }}>
              {item.feedInfo.url}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

export default FeedItemCard; 