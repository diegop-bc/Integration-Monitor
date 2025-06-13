# Integration Monitor

A modern RSS-based changelog monitoring tool built with React, TypeScript, and Vite. Track updates across all your integrations and third-party services in one unified timeline.

![Integration Monitor](https://img.shields.io/badge/React-19+-blue.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-5+-blue.svg)
![Vite](https://img.shields.io/badge/Vite-6+-purple.svg)
![Tailwind CSS](https://img.shields.io/badge/Tailwind%20CSS-4+-teal.svg)

## ✨ Features

### 🎯 Core Functionality
- **RSS Feed Monitoring**: Add and monitor RSS feeds from your favorite integrations
- **Unified Timeline**: View all updates from multiple integrations in one place
- **Real-time Updates**: Automatic feed refresh with live notifications
- **Smart Content Parsing**: HTML sanitization with preserved list formatting

### 🎨 Modern UI/UX
- **Dark Blue Gradient Theme**: Beautiful gradient background with optimized contrast
- **Timeline-Style Layout**: Clean, modern interface inspired by social media feeds
- **Responsive Design**: Works seamlessly on desktop, tablet, and mobile
- **Integration Cards**: Color-coded cards with circular avatars for easy identification

### 🛠️ Management Features
- **Inline Editing**: Edit integration names and aliases directly in the interface
- **Safe Deletion**: Delete integrations with confirmation dialogs
- **Flexible Organization**: Support for both integration names and custom aliases
- **URL Display**: Clean URL pills showing feed sources

### 🔧 Technical Features
- **Client & Server Parsing**: Dual RSS parsing for development and production
- **HTML Sanitization**: Secure content display with XSS protection
- **List Preservation**: Maintains bullet points and numbered lists from RSS content
- **Performance Optimized**: Efficient rendering with minimal re-renders

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ 
- npm or yarn
- Supabase account (for database)

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd integration-monitor
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env.local
   ```
   
   Configure your Supabase credentials:
   ```env
   VITE_SUPABASE_URL=your_supabase_url
   VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
   ```

4. **Start development server**
   ```bash
   npm run dev
   ```

5. **Open your browser**
   Navigate to `http://localhost:5173`

## 📖 Usage

### Adding Integrations

1. Click the **"Add Integration"** button on the dashboard
2. Fill in the form:
   - **Integration Name**: The service name (e.g., "GitHub", "Stripe")
   - **Alias**: Optional custom name (e.g., "Payment API", "Main Repo")
   - **RSS Feed URL**: The changelog RSS feed URL
3. Click **"Add Integration"** to save

### Managing Integrations

- **Edit**: Hover over an integration card and click the pencil icon
- **Delete**: Hover over an integration card and click the trash icon
- **View Updates**: Click on any integration card to see its specific updates

### Viewing Updates

- **Dashboard**: See recent updates from all integrations
- **Updates Page**: View the complete timeline of all updates
- **Individual Feeds**: Click on integration cards to see specific feed updates

## 🏗️ Architecture

### Frontend Stack
- **React 18+**: Modern React with hooks and functional components
- **TypeScript**: Full type safety and enhanced developer experience
- **Vite**: Lightning-fast build tool and development server
- **Tailwind CSS 4**: Utility-first CSS framework with custom design system
- **React Query**: Powerful data fetching and caching
- **React Router**: Client-side routing

### Backend Services
- **Supabase**: PostgreSQL database with real-time subscriptions
- **Vercel Functions**: Serverless RSS parsing for production
- **CORS Proxy**: Development RSS parsing with AllOrigins

### Key Components

```
src/
├── components/
│   ├── feed/
│   │   ├── FeedItemCard.tsx     # Individual update cards
│   │   └── UnifiedFeed.tsx      # Main timeline view
│   └── layout/
│       └── Layout.tsx           # App shell with navigation
├── pages/
│   ├── Dashboard.tsx            # Main dashboard with integrations
│   ├── FeedView.tsx            # Individual feed view
│   └── UnifiedFeedPage.tsx     # Complete updates timeline
├── services/
│   ├── feedService.ts          # CRUD operations for feeds
│   └── feedUpdateService.ts    # Real-time update handling
├── utils/
│   ├── rssParser.ts           # RSS feed parsing logic
│   └── textSanitizer.ts       # HTML content sanitization
└── hooks/
    └── useFeedUpdates.ts      # Real-time updates hook
```

### Manual Deployment

1. **Build the project**
   ```bash
   npm run build
   ```

2. **Deploy the `dist` folder** to your hosting provider

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request