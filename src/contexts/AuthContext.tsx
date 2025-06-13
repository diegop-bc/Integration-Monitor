import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { AuthContextType, AuthState } from '../types/auth';

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

interface AuthProviderProps {
  children: React.ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [state, setState] = useState<AuthState>({
    user: null,
    session: null,
    loading: true,
    initialized: false,
  });

  useEffect(() => {
    let mounted = true;

    // Get initial session
    const getInitialSession = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (mounted) {
          if (error) {
            console.error('Error getting session:', error);
          }
          
          setState({
            user: session?.user ?? null,
            session,
            loading: false,
            initialized: true,
          });
        }
      } catch (error) {
        console.error('Unexpected error getting session:', error);
        if (mounted) {
          setState({
            user: null,
            session: null,
            loading: false,
            initialized: true,
          });
        }
      }
    };

    getInitialSession();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (mounted) {
          setState({
            user: session?.user ?? null,
            session,
            loading: false,
            initialized: true,
          });

          // Optional: Handle specific auth events
          if (event === 'SIGNED_OUT') {
            // Clear any cached data here if needed
            console.log('User signed out');
          } else if (event === 'SIGNED_IN') {
            console.log('User signed in');
          }
        }
      }
    );

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      
      return { error: error ? new Error(error.message) : null };
    } catch (error) {
      return { 
        error: error instanceof Error ? error : new Error('An unexpected error occurred') 
      };
    }
  };

  const signUp = async (email: string, password: string) => {
    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
      });
      
      return { error: error ? new Error(error.message) : null };
    } catch (error) {
      return { 
        error: error instanceof Error ? error : new Error('An unexpected error occurred') 
      };
    }
  };

  const signOut = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) {
        console.error('Error signing out:', error);
      }
    } catch (error) {
      console.error('Unexpected error signing out:', error);
    }
  };

  const resetPassword = async (email: string) => {
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      
      return { error: error ? new Error(error.message) : null };
    } catch (error) {
      return { 
        error: error instanceof Error ? error : new Error('An unexpected error occurred') 
      };
    }
  };

  const value: AuthContextType = {
    ...state,
    signIn,
    signUp,
    signOut,
    resetPassword,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
} 