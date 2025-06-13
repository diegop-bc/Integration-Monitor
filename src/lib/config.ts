// Configuration file for environment-based settings
export const config = {
  // Base URL for the application
  baseUrl: import.meta.env.VITE_APP_URL || window.location.origin,
  
  // Supabase configuration
  supabase: {
    url: import.meta.env.VITE_SUPABASE_URL,
    anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY,
  }
};

// Helper function to get the correct redirect URL for authentication
export const getRedirectUrl = (path: string = '') => {
  const baseUrl = import.meta.env.VITE_APP_URL || window.location.origin;
  return `${baseUrl}${path}`;
}; 