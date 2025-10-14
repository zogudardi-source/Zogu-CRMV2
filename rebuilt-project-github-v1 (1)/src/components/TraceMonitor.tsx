import React, { useState, useRef, useEffect } from 'react';
import { BugAntIcon, XMarkIcon, TrashIcon } from '@heroicons/react/24/solid';
import { useTrace, TraceMessage, TraceStatus } from '../contexts/TraceContext';

const statusStyles: { [key in TraceStatus]: { dot: string; text: string } } = {
  info: { dot: 'bg-blue-400', text: 'text-blue-300' },
  success: { dot: 'bg-green-400', text: 'text-green-300' },
  error: { dot: 'bg-red-400', text: 'text-red-300' },
  pending: { dot: 'bg-yellow-400', text: 'text-yellow-300' },
};

const TraceMonitor: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const { traces, clearTraces } = useTrace();
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [traces, isOpen]);

  const formatTimestamp = (date: Date) => {
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const seconds = date.getSeconds().toString().padStart(2, '0');
    const milliseconds = date.getMilliseconds().toString().padStart(3, '0');
    return `${hours}:${minutes}:${seconds}.${milliseconds}`;
  };
  
  const renderData = (data: any) => {
    if (!data) return null;
    try {
      const prettyData = JSON.stringify(data, null, 2);
      return (
        <pre className="mt-1 p-2 text-xs bg-gray-900 text-gray-400 rounded-md overflow-x-auto">
          <code>{prettyData}</code>
        </pre>
      );
    } catch {
      return null;
    }
  };


  return (
    <>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-6 left-6 w-16 h-16 bg-gray-800 rounded-full text-white flex items-center justify-center shadow-lg hover:bg-gray-700 transition-transform transform hover:scale-110 z-50 border-2 border-gray-600"
        aria-label="Toggle Trace Monitor"
      >
        {isOpen ? <XMarkIcon className="w-8 h-8"/> : <BugAntIcon className="w-8 h-8" />}
      </button>

      {isOpen && (
        <div className="fixed bottom-0 left-0 right-0 h-2/5 bg-gray-900/95 backdrop-blur-sm border-t border-gray-700 text-white flex flex-col z-[49] animate-fade-in-up">
          <header className="flex items-center justify-between p-2 border-b border-gray-700 shrink-0">
            <h3 className="font-bold text-lg">Auth Trace Monitor</h3>
            <button
              onClick={clearTraces}
              className="p-2 text-gray-400 hover:text-white rounded-md hover:bg-gray-700"
              aria-label="Clear Traces"
            >
              <TrashIcon className="w-5 h-5" />
            </button>
          </header>

          <div className="flex-1 p-2 overflow-y-auto font-mono text-sm">
            {traces.map((trace, index) => (
              <div key={index} className="mb-1">
                <div className="flex items-center">
                    <span className="text-gray-500">[{formatTimestamp(trace.timestamp)}]</span>
                    <span className={`w-2.5 h-2.5 rounded-full mx-2 shrink-0 ${statusStyles[trace.status].dot}`}></span>
                    <span className={`${statusStyles[trace.status].text}`}>{trace.message}</span>
                </div>
                {renderData(trace.data)}
              </div>
            ))}
            <div ref={logsEndRef} />
          </div>
        </div>
      )}
    </>
  );
};

export default TraceMonitor;