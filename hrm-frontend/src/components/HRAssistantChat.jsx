import React, { useState, useRef, useEffect } from 'react';
import { aiService } from '../services/aiService';

const HRAssistantChat = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([
    { role: 'assistant', content: 'Hello! I am your AI HR Assistant. Ask me anything about employees, attendance, candidates, etc.' }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
    }
  }, [messages, isOpen]);

  const handleSend = async (e) => {
    e.preventDefault();
    if (!inputValue.trim()) return;

    const userMessage = inputValue.trim();
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setInputValue('');
    setIsLoading(true);

    try {
      const response = await aiService.askHRAssistant(userMessage);
      const answer = response.answer || response.message || "I am currently unable to process your request. Please try again.";
      setMessages(prev => [...prev, { role: 'assistant', content: answer }]);
    } catch (error) {
      const errMsg = error.response?.data?.answer || error.response?.data?.message || 'I am currently unable to answer that question. Please try asking in a different way.';
      setMessages(prev => [...prev, { role: 'assistant', content: errMsg }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      {/* Floating Action Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          position: 'fixed',
          bottom: '2rem',
          right: '2rem',
          width: '60px',
          height: '60px',
          borderRadius: '50%',
          backgroundColor: '#12345A',
          color: '#FFFFFF',
          border: '2px solid #0FA6A6',
          boxShadow: '0 10px 20px -3px rgba(18, 52, 90, 0.25), 0 4px 6px -2px rgba(18, 52, 90, 0.1)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '1.5rem',
          zIndex: 9999,
          transition: 'transform 0.2s, background-color 0.2s',
          transform: isOpen ? 'scale(0)' : 'scale(1)',
        }}
        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#0FA6A6'}
        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#12345A'}
      >
        💬
      </button>

      {/* Chat Window */}
      <div
        style={{
          position: 'fixed',
          bottom: '2rem',
          right: '2rem',
          width: '350px',
          height: '500px',
          backgroundColor: '#FFFFFF',
          borderRadius: '14px',
          boxShadow: '0 20px 30px -5px rgba(18, 52, 90, 0.18), 0 10px 10px -5px rgba(18, 52, 90, 0.08)',
          display: 'flex',
          flexDirection: 'column',
          zIndex: 10000,
          transform: isOpen ? 'translateY(0) scale(1)' : 'translateY(20px) scale(0.9)',
          opacity: isOpen ? 1 : 0,
          pointerEvents: isOpen ? 'auto' : 'none',
          transition: 'transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275), opacity 0.3s',
          overflow: 'hidden',
          border: '1px solid #DCE6EC'
        }}
      >
        {/* Header */}
        <div style={{
          backgroundColor: '#12345A',
          color: '#FFFFFF',
          padding: '1rem',
          borderBottom: '2px solid #0FA6A6',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span>🤖</span> BSmartHR AI Assistant
          </h3>
          <button
            onClick={() => setIsOpen(false)}
            style={{
              background: 'none',
              border: 'none',
              color: '#FFFFFF',
              cursor: 'pointer',
              fontSize: '1.25rem',
              opacity: 0.85
            }}
          >
            &times;
          </button>
        </div>

        {/* Messages */}
        <div style={{
          flex: 1,
          padding: '1rem',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem',
          backgroundColor: '#F4F8FA'
        }}>
          {messages.map((msg, idx) => (
            <div
              key={idx}
              style={{
                alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                maxWidth: '85%',
                backgroundColor: msg.role === 'user' ? '#12345A' : '#FFFFFF',
                color: msg.role === 'user' ? '#FFFFFF' : '#18324B',
                padding: '0.75rem 1rem',
                borderRadius: '12px',
                borderBottomRightRadius: msg.role === 'user' ? '4px' : '12px',
                borderBottomLeftRadius: msg.role === 'assistant' ? '4px' : '12px',
                boxShadow: '0 1px 2px rgba(18, 52, 90, 0.06)',
                border: msg.role === 'assistant' ? '1px solid #DCE6EC' : 'none',
                fontSize: '0.9rem',
                lineHeight: 1.5,
                whiteSpace: 'pre-wrap'
              }}
            >
              {msg.content}
            </div>
          ))}
          {isLoading && (
            <div style={{ alignSelf: 'flex-start', color: '#64748B', fontSize: '0.85rem', display: 'flex', gap: '0.25rem' }}>
              <span className="dot-typing" style={{ animation: 'blink 1.4s infinite both' }}>.</span>
              <span className="dot-typing" style={{ animation: 'blink 1.4s infinite both', animationDelay: '0.2s' }}>.</span>
              <span className="dot-typing" style={{ animation: 'blink 1.4s infinite both', animationDelay: '0.4s' }}>.</span>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <form onSubmit={handleSend} style={{
          padding: '1rem',
          borderTop: '1px solid #DCE6EC',
          backgroundColor: '#FFFFFF',
          display: 'flex',
          gap: '0.5rem'
        }}>
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Ask a question..."
            disabled={isLoading}
            style={{
              flex: 1,
              padding: '0.75rem 1rem',
              border: '1px solid #DCE6EC',
              color: '#18324B',
              borderRadius: '9999px',
              outline: 'none',
              fontSize: '0.9rem'
            }}
          />
          <button
            type="submit"
            disabled={isLoading || !inputValue.trim()}
            style={{
              backgroundColor: inputValue.trim() && !isLoading ? '#0FA6A6' : '#94A3B8',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: '50%',
              width: '40px',
              height: '40px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: inputValue.trim() && !isLoading ? 'pointer' : 'not-allowed',
              transition: 'background-color 0.2s'
            }}
            onMouseEnter={(e) => { if (inputValue.trim() && !isLoading) e.currentTarget.style.backgroundColor = '#0C8C8C'; }}
            onMouseLeave={(e) => { if (inputValue.trim() && !isLoading) e.currentTarget.style.backgroundColor = '#0FA6A6'; }}
          >
            ➤
          </button>
        </form>
      </div>
    </>
  );
};

export default HRAssistantChat;
