import { useState, useRef, useEffect } from "react";
import { Send, Loader2, MessageSquare, Trash2 } from "lucide-react";
import { chatWithLlm } from "@/lib/data-provider";

interface Message {
  role: "user" | "assistant";
  content: string;
}

export function AiChatTest() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  async function handleSend() {
    const text = input.trim();
    if (!text || loading) return;

    setInput("");
    const userMsg: Message = { role: "user", content: text };
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);

    try {
      const reply = await chatWithLlm(text);
      setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      setMessages((prev) => [...prev, { role: "assistant", content: `Error: ${errMsg}` }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-lg bg-surface-1 ring-1 ring-edge-1 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-edge-2">
        <div className="flex items-center gap-1.5">
          <MessageSquare className="h-3.5 w-3.5 text-purple-400" />
          <span className="text-[11px] font-semibold text-body">Test Chat</span>
          <span className="text-[10px] text-dim ml-1">Verify the model responds</span>
        </div>
        {messages.length > 0 && (
          <button
            onClick={() => setMessages([])}
            className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-dim hover:text-body hover:bg-surface-2 transition-colors"
          >
            <Trash2 className="h-2.5 w-2.5" /> Clear
          </button>
        )}
      </div>

      <div
        ref={scrollRef}
        className="h-[200px] overflow-y-auto p-3 space-y-2"
      >
        {messages.length === 0 && !loading && (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <MessageSquare className="h-6 w-6 text-dim/30 mb-2" />
            <p className="text-[11px] text-dim">Send a message to test the AI model.</p>
            <p className="text-[10px] text-faint mt-0.5">Try: &quot;What is HbA1c?&quot;</p>
          </div>
        )}
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[85%] rounded-lg px-3 py-2 text-[12px] leading-relaxed ${
                msg.role === "user"
                  ? "bg-purple-600/90 text-white"
                  : "bg-surface-2 text-body ring-1 ring-edge-1"
              }`}
            >
              {msg.content}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="flex items-center gap-2 rounded-lg bg-surface-2 px-3 py-2 ring-1 ring-edge-1">
              <Loader2 className="h-3 w-3 text-purple-400 animate-spin" />
              <span className="text-[11px] text-dim">Thinking...</span>
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 px-3 py-2 border-t border-edge-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleSend(); }}
          placeholder="Ask the AI something..."
          disabled={loading}
          className="flex-1 rounded-lg border border-edge-2 bg-surface-2 px-3 py-1.5 text-[12px] text-body placeholder-dim focus:border-purple-500/40 focus:outline-none focus:ring-1 focus:ring-purple-500/20 disabled:opacity-50"
        />
        <button
          onClick={handleSend}
          disabled={loading || !input.trim()}
          className="flex items-center justify-center rounded-lg bg-purple-600 p-2 text-white transition-colors hover:bg-purple-500 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
        </button>
      </div>
    </div>
  );
}
