import React, { createContext, useState, useContext, ReactNode, useCallback, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { useLanguage } from './LanguageContext';
import { allNavLinks } from '../constants';

export interface Tab {
  key: string; // Unique identifier, usually the path
  path: string;
  label: string;
  isPermanent?: boolean;
  labelKey?: string;
}

interface TabContextType {
  tabs: Tab[];
  cachedPages: Record<string, React.ReactNode>;
  activeTabKey: string | null;
  openTab: (tabData: Omit<Tab, 'key' | 'isPermanent' | 'labelKey'> & { label: string, state?: any, labelKey?: string }) => void;
  closeTab: (keyToClose: string) => void;
  updateTabLabel: (path: string, newLabel: string) => void;
  replaceTab: (oldPath: string, newTab: Omit<Tab, 'key' | 'isPermanent' | 'labelKey'> & { label: string, labelKey?: string }) => void;
  closeAllTabs: () => void;
  cacheCurrentPage: (path: string, page: React.ReactNode) => void;
}

const TabContext = createContext<TabContextType | undefined>(undefined);

const NON_TABBABLE_PATHS = ['/auth', '/reset-password'];

export const TabProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { t, language } = useLanguage();

  const DASHBOARD_TAB: Tab = {
    key: '/',
    path: '/',
    label: t('dashboard'),
    labelKey: 'dashboard',
    isPermanent: true,
  };

  const [tabs, setTabs] = useState<Tab[]>([DASHBOARD_TAB]);
  const [activeTabKey, setActiveTabKey] = useState<string | null>(DASHBOARD_TAB.key);
  const [cachedPages, setCachedPages] = useState<Record<string, React.ReactNode>>({});
  
  const { profile, session, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Effect 1: URL/Auth changes drive the tab list state (opening/activating tabs).
  useEffect(() => {
    if (loading) return;
    if (!session) {
        setTabs([DASHBOARD_TAB]);
        setActiveTabKey(DASHBOARD_TAB.key);
        setCachedPages({});
        return;
    }
    
    const currentPath = location.pathname;
    if (NON_TABBABLE_PATHS.includes(currentPath)) return;

    // Add new tab if it doesn't exist
    setTabs(prevTabs => {
      const existingTab = prevTabs.find(tab => tab.path === currentPath);
      if (existingTab) return prevTabs;

      const locationState = location.state as { __tabLabel?: string, __tabLabelKey?: string } | null;
      const labelKeyFromState = locationState?.__tabLabelKey;
      const labelFromState = locationState?.__tabLabel;
      
      let newLabel = 'Page';
      let labelKey: string | undefined = undefined;

      if (labelKeyFromState) {
          labelKey = labelKeyFromState;
          newLabel = t(labelKey as any);
      } else if (labelFromState) {
          newLabel = labelFromState;
      } else {
        const navLink = allNavLinks.find(link => link.to === currentPath);
        if (navLink) {
            labelKey = navLink.label;
            newLabel = t(labelKey as any);
        } else {
            const segments = currentPath.split('/').filter(Boolean);
            if (segments.length > 0) {
                let lastSegment = segments[segments.length - 1];
                if (!isNaN(parseInt(lastSegment, 10)) && segments.length > 1) {
                    newLabel = segments[segments.length - 2];
                } else {
                    newLabel = lastSegment;
                }
                newLabel = newLabel.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
            }
        }
      }
      
      const newTab: Tab = {
        key: currentPath,
        path: currentPath,
        label: newLabel,
        labelKey,
      };
      return [...prevTabs, newTab];
    });

    setActiveTabKey(currentPath);
  }, [location.pathname, location.state, session, loading, t]);

  // Effect 2: Tab list state drives the URL (handling tab closures).
  useEffect(() => {
    const activeTabExists = tabs.some(tab => tab.key === activeTabKey);
    if (!activeTabExists && tabs.length > 0) {
      const newActiveTab = tabs[tabs.length - 1];
      if (newActiveTab && location.pathname !== newActiveTab.path) {
        navigate(newActiveTab.path, { replace: true });
      }
    }
  }, [tabs, activeTabKey, navigate, location.pathname]);

  // Effect 3: Language change re-translates tabs
  useEffect(() => {
    setTabs(prevTabs => prevTabs.map(tab => tab.labelKey ? { ...tab, label: t(tab.labelKey as any) } : tab));
  }, [language, t]);

  const cacheCurrentPage = useCallback((path: string, page: React.ReactNode) => {
    setCachedPages(prev => {
      if (prev[path]) {
        return prev;
      }
      return { ...prev, [path]: page };
    });
  }, []);

  const openTab = useCallback((tabData: Omit<Tab, 'key' | 'isPermanent' | 'labelKey'> & { label: string, state?: any, labelKey?: string }) => {
    const stateWithLabel = { ...tabData.state, __tabLabel: tabData.label, __tabLabelKey: tabData.labelKey };
    navigate(tabData.path, { state: stateWithLabel });
  }, [navigate]);

  const closeTab = useCallback((keyToClose: string) => {
    const tabToClose = tabs.find(tab => tab.key === keyToClose);
    if (!tabToClose || tabToClose.isPermanent) return;

    setTabs(prevTabs => prevTabs.filter(tab => tab.key !== keyToClose));
    setCachedPages(prevCache => {
      const newCache = { ...prevCache };
      delete newCache[keyToClose];
      return newCache;
    });
  }, [tabs]);
  
  const updateTabLabel = useCallback((path: string, newLabel: string) => {
    setTabs(prevTabs =>
      prevTabs.map(tab =>
        tab.path === path && tab.label !== newLabel ? { ...tab, label: newLabel, labelKey: undefined } : tab
      )
    );
  }, []);

  const replaceTab = useCallback((oldPath: string, newTab: Omit<Tab, 'key' | 'isPermanent' | 'labelKey'> & { label: string, labelKey?: string }) => {
    const newPath = newTab.path;
    setTabs(prevTabs =>
      prevTabs.map(tab =>
        tab.path === oldPath
          ? { ...newTab, key: newPath, isPermanent: false }
          : tab
      )
    );
    setActiveTabKey(newPath);

    setCachedPages(prevCache => {
      const newCache = { ...prevCache };
      delete newCache[oldPath];
      return newCache;
    });
    navigate(newPath, { replace: true, state: { __tabLabel: newTab.label, __tabLabelKey: newTab.labelKey } });
  }, [navigate]);

  const closeAllTabs = useCallback(() => {
    setTabs(prevTabs => prevTabs.filter(tab => tab.isPermanent));
    setCachedPages(prevCache => {
      const newCache: Record<string, React.ReactNode> = {};
      if (prevCache['/']) {
        newCache['/'] = prevCache['/'];
      }
      return newCache;
    });
    navigate('/');
  }, [navigate]);

  const value = {
    tabs,
    cachedPages,
    activeTabKey,
    openTab,
    closeTab,
    updateTabLabel,
    replaceTab,
    closeAllTabs,
    cacheCurrentPage,
  };

  return <TabContext.Provider value={value}>{children}</TabContext.Provider>;
};

export const useTabs = () => {
  const context = useContext(TabContext);
  if (context === undefined) {
    throw new Error('useTabs must be used within a TabProvider');
  }
  return context;
};