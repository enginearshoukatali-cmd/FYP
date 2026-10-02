import React, { useState } from 'react';
import { Code, Mic, MessageSquare, Sparkles, Send, Loader2 } from 'lucide-react';

type AcademicTier = 'PRIMARY' | 'BS_GRADUATION';

interface Message {
  sender: 'user' | 'assistant';
  content: string;
}

interface WorkspaceProps {
  userTier: AcademicTier;
  subjectName: string;
  isRtl?: boolean; // Added prop to support Urdu/Arabic alignment
}

export const AdaptiveWorkspace: React.FC<WorkspaceProps> = ({ userTier, subjectName, isRtl = false }) => {
  const [activeTier, setActiveTier] = useState<AcademicTier>(userTier);
  const [code, setCode] = useState<string>('// Write your solution here\nfunction solveProblem() {\n  \n}');
  const [messages, setMessages] = useState<Message[]>([
    {
      sender: 'assistant',
      content: userTier === 'PRIMARY' 
        ? 'Hi there! 👋 What fun story or problem are we exploring today?' 
        : 'Welcome! What concept or line of code would you like to discuss first?'
    }
  ]);
  const [input, setInput] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const handleSendMessage = async () => {
    if (!input.trim() || isLoading) return;

    const userMsg = input;
    setInput('');
    setMessages((prev) => [...prev, { sender: 'user', content: userMsg }]);
    setIsLoading(true);

    // Placeholder for streaming assistant response
    setMessages((prev) => [...prev, { sender: 'assistant', content: '' }]);

    try {
      const response = await fetch('http://127.0.0.1:8000/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_message: userMsg,
          academic_tier: activeTier,
          subject_name: subjectName,
          workspace_context: activeTier === 'BS_GRADUATION' ? code : ''
        }),
      });

      if (!response.body) throw new Error('No response body');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let assistantResponse = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value, { stream: true });
        assistantResponse += chunk;

        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = { sender: 'assistant', content: assistantResponse };
          return updated;
        });
      }
    } catch (error) {
      console.error('Error streaming response:', error);
      setMessages((prev) => [
        ...prev,
        { sender: 'assistant', content: 'Connection error. Please check if the FastAPI backend is running.' }
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-slate-900 text-slate-100 font-sans">
      {/* Top Header */}
      <header className="flex items-center justify-between px-6 py-3 bg-slate-800 border-b border-slate-700">
        <div className="flex items-center gap-3">
          <Sparkles className="w-6 h-6 text-indigo-400" />
          <h1 className="font-bold text-lg">{subjectName} Tutor</h1>
        </div>

        {/* Tier Mode Switcher */}
        <div className="flex bg-slate-900 p-1 rounded-lg border border-slate-700 text-xs">
          <button
            onClick={() => setActiveTier('PRIMARY')}
            className={`px-3 py-1.5 rounded-md font-medium transition ${
              activeTier === 'PRIMARY' ? 'bg-amber-500 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            Primary Mode (Grades 1-5)
          </button>
          <button
            onClick={() => setActiveTier('BS_GRADUATION')}
            className={`px-3 py-1.5 rounded-md font-medium transition ${
              activeTier === 'BS_GRADUATION' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            BS Graduation Mode
          </button>
        </div>
      </header>

      {/* Main Workspace Layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Panel */}
        <main className="w-2/3 border-r border-slate-700 p-6 overflow-y-auto bg-slate-950">
          {activeTier === 'PRIMARY' ? (
            <div className="flex flex-col items-center justify-center h-full space-y-6 text-center">
              <div className="bg-amber-500/10 border-2 border-amber-500/30 p-8 rounded-3xl max-w-lg">
                <span className="text-6xl mb-4 block">🎨</span>
                <h2 className="text-2xl font-bold text-amber-400 mb-2">Let's Learn Together!</h2>
                <p className="text-slate-300 text-lg">Type your question or topic in the chat drawer to begin.</p>
              </div>
              <button className="flex items-center justify-center gap-3 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xl px-8 py-6 rounded-full shadow-lg">
                <Mic className="w-8 h-8" /> Tap & Speak
              </button>
            </div>
          ) : (
            <div className="flex flex-col h-full space-y-4">
              <div className="flex items-center justify-between bg-slate-800 px-4 py-2 rounded-t-lg border border-slate-700">
                <div className="flex items-center gap-2 text-sm text-slate-300 font-mono">
                  <Code className="w-4 h-4 text-indigo-400" />
                  <span>workspace.js</span>
                </div>
              </div>
              <textarea
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="w-full flex-1 bg-slate-900 border border-slate-700 rounded-b-lg p-4 font-mono text-sm text-indigo-200 focus:outline-none resize-none"
              />
            </div>
          )}
        </main>

        {/* Right Panel: AI Chat Drawer */}
        <aside className="w-1/3 flex flex-col bg-slate-900">
          <div className="p-4 border-b border-slate-800 bg-slate-800/50 flex items-center gap-3">
            <MessageSquare className="w-5 h-5 text-indigo-400" />
            <h3 className="font-semibold text-sm">Socratic AI Mentor</h3>
          </div>

          {/* Chat Messages */}
          <div 
            className="flex-1 p-4 overflow-y-auto space-y-4 text-sm"
            style={{ 
              direction: isRtl ? "rtl" : "ltr", 
              textAlign: isRtl ? "right" : "left" 
            }}
          >
            {messages.map((msg, index) => (
              <div
                key={index}
                className={`p-3 rounded-2xl border max-w-[85%] ${
                  msg.sender === 'user'
                    ? 'bg-indigo-600 text-white border-indigo-500 ml-auto rounded-tr-none'
                    : 'bg-slate-800 text-slate-200 border-slate-700 mr-auto rounded-tl-none'
                }`}
              >
                <p className="whitespace-pre-wrap">{msg.content}</p>
              </div>
            ))}
          </div>

          {/* Input Field */}
          <div className="p-4 border-t border-slate-800 flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
              placeholder="Ask a question..."
              style={{ direction: isRtl ? "rtl" : "ltr" }}
              className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-4 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
            />
            <button
              onClick={handleSendMessage}
              disabled={isLoading}
              className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-xl text-sm font-medium flex items-center justify-center transition disabled:opacity-50"
            >
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
};

export default AdaptiveWorkspace;