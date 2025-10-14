import React, { useState, useRef, useEffect } from 'react';
import { PaperAirplaneIcon, ChatBubbleOvalLeftEllipsisIcon, XMarkIcon } from '@heroicons/react/24/solid';
import { askChatbot, isGeminiConfigured } from '../services/geminiService';
import { Message } from '../types';

const Chatbot: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);

  const initialMessageText = isGeminiConfigured
    ? "Hello! I'm your ZOGU Solutions assistant. How can I help you today?"
    : "AI Assistant is not configured. Please add your Gemini API key in `services/geminiService.ts` to enable this feature.";

  const [messages, setMessages] = useState<Message[]>([
    { role: 'model', parts: [{ text: initialMessageText }] }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(scrollToBottom, [messages]);

  const handleSend = async () => {
    if (input.trim() === '' || loading || !isGeminiConfigured) return;

    const userMessage: Message = { role: 'user', parts: [{ text: input }] };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setLoading(true);
    
    const history = messages.slice(); // Send current history
    const responseText = await askChatbot(input, history);
    
    const modelMessage: Message = { role: 'model', parts: [{ text: responseText }] };
    setMessages(prev => [...prev, modelMessage]);
    setLoading(false);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSend();
    }
  };

  return (
    <>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-6 right-6 w-16 h-16 bg-primary-600 rounded-full text-white flex items-center justify-center shadow-lg hover:bg-primary-700 transition-transform transform hover:scale-110 z-50"
        aria-label="Toggle Chatbot"
      >
        {isOpen ? <XMarkIcon className="w-8 h-8"/> : <ChatBubbleOvalLeftEllipsisIcon className="w-8 h-8" />}
      </button>

      {isOpen && (
        <div className="fixed bottom-24 right-6 w-80 h-[28rem] bg-white dark:bg-gray-800 rounded-lg shadow-2xl flex flex-col z-50 animate-fade-in-up">
          <header className="bg-primary-600 text-white p-4 rounded-t-lg flex justify-between items-center">
            <h3 className="font-bold">Zogu Assistant</h3>
          </header>

          <div className="flex-1 p-4 overflow-y-auto">
            <div className="space-y-4">
              {messages.map((msg, index) => (
                <div key={index} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-xs px-4 py-2 rounded-lg ${
                      msg.role === 'user' ? 'bg-primary-500 text-white' : 'bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-gray-200'
                    }`}
                  >
                    <p className="text-sm">{msg.parts[0].text}</p>
                  </div>
                </div>
              ))}
              {loading && (
                 <div className="flex justify-start">
                    <div className="max-w-xs px-4 py-2 rounded-lg bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-gray-200">
                        <div className="flex items-center space-x-1">
                            <span className="w-2 h-2 bg-gray-500 rounded-full animate-pulse"></span>
                            <span className="w-2 h-2 bg-gray-500 rounded-full animate-pulse delay-75"></span>
                            <span className="w-2 h-2 bg-gray-500 rounded-full animate-pulse delay-150"></span>
                        </div>
                    </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          </div>

          <div className="p-2 border-t dark:border-gray-700">
            <div className="flex items-center space-x-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder={isGeminiConfigured ? "Ask something..." : "AI not configured"}
                className="flex-1 p-2 border rounded-md dark:bg-gray-700 dark:border-gray-600 focus:ring-primary-500 focus:border-primary-500"
                disabled={loading || !isGeminiConfigured}
              />
              <button
                onClick={handleSend}
                disabled={loading || !isGeminiConfigured}
                className="p-2 bg-primary-600 text-white rounded-md disabled:bg-gray-400"
              >
                <PaperAirplaneIcon className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default Chatbot;