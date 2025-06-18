import type { PublicGroup } from '../../types/group';

interface PublicGroupStatsProps {
  group: PublicGroup;
}

export function PublicGroupStats({ group }: PublicGroupStatsProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {/* Members Count */}
      <div className="bg-gray-50 rounded-lg p-4">
        <div className="flex items-center">
          <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
            <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          </div>
          <div className="ml-4">
            <h3 className="text-lg font-semibold text-gray-900">{group.member_count}</h3>
            <p className="text-sm text-gray-600">
              {group.member_count === 1 ? 'Member' : 'Members'}
            </p>
          </div>
        </div>
      </div>

      {/* Integrations Count */}
      <div className="bg-gray-50 rounded-lg p-4">
        <div className="flex items-center">
          <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
            <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9.5a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
            </svg>
          </div>
          <div className="ml-4">
            <h3 className="text-lg font-semibold text-gray-900">{group.feed_count}</h3>
            <p className="text-sm text-gray-600">
              {group.feed_count === 1 ? 'Integration' : 'Integrations'}
            </p>
          </div>
        </div>
      </div>

      {/* Total Updates Count */}
      <div className="bg-gray-50 rounded-lg p-4">
        <div className="flex items-center">
          <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
            <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <div className="ml-4">
            <h3 className="text-lg font-semibold text-gray-900">{group.total_feed_items}</h3>
            <p className="text-sm text-gray-600">Total Updates</p>
          </div>
        </div>
      </div>
    </div>
  );
} 