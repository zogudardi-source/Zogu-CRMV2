import React, { createContext, useState, useEffect, useContext, ReactNode, useCallback } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '../services/supabase';
import { Profile } from '../types';
import { useNavigate } from 'react-router-dom';
import { useTrace } from './TraceContext';

interface AuthContextType {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  permissions: string[] | null;
  permissionsLoaded: boolean;
  loading: boolean;
  signOut: () => Promise<void>;
  refetchProfile: () => Promise<void>;
  refetchPermissions: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [permissions, setPermissions] = useState<string[] | null>(null);
  const [permissionsLoaded, setPermissionsLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const { addTrace } = useTrace();

  const fetchPermissions = useCallback(async (currentProfile: Profile | null) => {
    if (currentProfile?.role && currentProfile?.org_id) {
      addTrace('Profile detected. Fetching permissions...', 'pending', { role: currentProfile.role, orgId: currentProfile.org_id });
      try {
        const { data, error } = await supabase
          .from('role_permissions')
          .select('permissions')
          .eq('org_id', currentProfile.org_id)
          .eq('role', currentProfile.role)
          .single();

        if (error && error.code !== 'PGRST116') { // Ignore "no rows" error
          throw error;
        }
        
        const modules = data?.permissions?.modules;

        if (modules && Array.isArray(modules)) {
          setPermissions(modules);
          addTrace('Successfully fetched permissions from DB.', 'success', modules);
        } else {
          setPermissions(null); // Explicitly set to null if no permissions are found or data is malformed
          if (modules) { // Log if the data was present but not an array
             addTrace('Permissions format from DB is invalid (not an array). Will use defaults.', 'error', modules);
          } else {
             addTrace('No permissions configured for this role in the DB. Will use defaults.', 'info');
          }
        }
      } catch (err: any) {
        // A Supabase error is an object with a `message` property, not an instance of Error.
        // We check for `err.message` to provide a useful log.
        const errorMessage = err?.message || 'An unknown error occurred while fetching permissions.';
        addTrace('Failed to fetch permissions. Will use defaults.', 'error', { error: errorMessage, details: err });
        setPermissions(null); // Fallback to default permissions on error
      }
    } else {
      setPermissions(null); // No profile, no permissions
    }
    setPermissionsLoaded(true);
  }, [addTrace]);

  useEffect(() => {
    addTrace('Auth provider mounted. Setting up auth state listener.', 'pending');
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      addTrace('Auth state change event received.', 'info', { event: _event, hasSession: !!session });
      if (_event === 'PASSWORD_RECOVERY') {
        addTrace('Password recovery event detected. Navigating to reset page.', 'info');
        navigate('/reset-password');
      }
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
      if (_event !== 'PASSWORD_RECOVERY') {
        addTrace('Initial auth state resolved. App is ready.', 'success');
      }
    });

    return () => {
      authListener.subscription.unsubscribe();
      addTrace('Auth provider unmounted. Listener cleaned up.', 'info');
    };
  }, [addTrace, navigate]);

  useEffect(() => {
    const fetchProfileAndPermissions = async () => {
        if (user) {
            addTrace('User detected. Fetching profile...', 'pending', { userId: user.id });
            const { data, error } = await supabase.from('profiles').select('*').eq('id', user.id).single();

            if (error && error.code !== 'PGRST116') {
                addTrace('Profile fetch failed.', 'error', { message: error.message });
                setProfile(null);
                setPermissionsLoaded(true);
            } else {
                addTrace('Profile fetch successful.', 'success', data);
                setProfile(data);
                // After fetching profile, fetch permissions
                await fetchPermissions(data);
            }
        } else {
            setProfile(null);
            setPermissions(null);
            setPermissionsLoaded(true);
        }
    };
    fetchProfileAndPermissions();
  }, [user, addTrace, fetchPermissions]);


  const signOut = useCallback(async () => {
    addTrace('Sign out initiated.', 'pending');
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error('Error signing out:', error.message);
      addTrace('Sign out failed.', 'error', { message: error.message });
      alert(`Sign out failed: ${error.message}`);
    } else {
      addTrace('Supabase signOut completed.', 'success');
      // The onAuthStateChange listener should handle state clearing,
      // but we navigate manually to ensure a clean redirect.
      navigate('/auth');
    }
  }, [addTrace, navigate]);

  const refetchProfile = useCallback(async () => {
    addTrace('Manual profile refetch triggered.', 'pending');
    if (user) {
      const { data, error } = await supabase.from('profiles').select('*').eq('id', user.id).single();
      if (error && error.code !== 'PGRST116') {
        console.error('Error refetching profile:', error.message);
        addTrace('Manual profile refetch failed.', 'error', { code: error.code, message: error.message });
      } else {
        setProfile(data);
        addTrace('Manual profile refetch successful.', 'success', data);
        // Also refetch permissions as role might have changed
        await fetchPermissions(data);
      }
    } else {
       addTrace('Cannot refetch profile, no user is logged in.', 'info');
    }
  }, [user, addTrace, fetchPermissions]);

  const refetchPermissions = useCallback(async () => {
      await fetchPermissions(profile);
  }, [profile, fetchPermissions]);


  const value = {
    session,
    user,
    profile,
    permissions,
    permissionsLoaded,
    loading,
    signOut,
    refetchProfile,
    refetchPermissions
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};