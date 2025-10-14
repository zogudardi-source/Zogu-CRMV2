import React, { createContext, useState, useContext, ReactNode, useCallback } from 'react';

export type TraceStatus = 'info' | 'success' | 'error' | 'pending';

export interface TraceMessage {
  timestamp: Date;
  message: string;
  status: TraceStatus;
  data?: any;
}

interface TraceContextType {
  traces: TraceMessage[];
  addTrace: (message: string, status?: TraceStatus, data?: any) => void;
  clearTraces: () => void;
}

const TraceContext = createContext<TraceContextType | undefined>(undefined);

export const TraceProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [traces, setTraces] = useState<TraceMessage[]>([]);

  const addTrace = useCallback((message: string, status: TraceStatus = 'info', data?: any) => {
    const newTrace: TraceMessage = {
      timestamp: new Date(),
      message,
      status,
      data,
    };
    setTraces(prevTraces => [...prevTraces, newTrace]);
  }, []);

  const clearTraces = useCallback(() => {
    setTraces([]);
  }, []);

  const value = {
    traces,
    addTrace,
    clearTraces,
  };

  return <TraceContext.Provider value={value}>{children}</TraceContext.Provider>;
};

export const useTrace = () => {
  const context = useContext(TraceContext);
  if (context === undefined) {
    throw new Error('useTrace must be used within a TraceProvider');
  }
  return context;
};
