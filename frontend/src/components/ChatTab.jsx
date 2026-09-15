import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Bot, Loader2, MessageCircle, Send, User } from "lucide-react";
import { askChat } from "../api.js";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const ANSWER_COMPONENTS = {
  table: ({ children }) => <div className="answer-table-scroll" role="region" aria-label="Answer data table" tabIndex={0}><table>{children}</table></div>,
  a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>,
};

export default function ChatTab({ geminiConfigured }) {
  const [history, setHistory] = useState([]);
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const logRef = useRef(null);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [history, loading]);

  async function handleSend(e) {
    e.preventDefault();
    const q = question.trim();
    if (!q || loading || !geminiConfigured) return;
    const nextHistory = [...history, { role: "user", content: q }];
    setHistory(nextHistory);
    setQuestion("");
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      const res = await askChat({ question: q, history });
      setNotice(res.notice);
      setHistory([...nextHistory, { role: "assistant", content: res.answer }]);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card chat-workspace">
      <h3 className="section-title">
        <MessageCircle size={19} /> The analyst's desk
      </h3>
      <p className="section-caption">
        Career leaderboards / Bilateral series history
      </p>
      {!geminiConfigured && (
        <div className="hint-banner">The assistant is offline. Gemini is not configured on the server.</div>
      )}
      {error && <div className="error-banner">Error: {error}</div>}
      {notice && <div className="hint-banner" role="status">{notice}</div>}

      <div className="chat-log" ref={logRef} role="log" aria-label="Conversation" aria-live="polite">
        {history.length === 0 && (
          <div className="chat-welcome">
            <Bot size={40} strokeWidth={1.3} />
            <h4>Cricket, in context.</h4>
            <div className="chat-prompts">{["Who has the most ODI runs?", "Compare Kohli and Tendulkar's ODI strike rates", "Which team has won the most T20I series?"].map((prompt) => <button key={prompt} onClick={() => setQuestion(prompt)} disabled={!geminiConfigured}>{prompt}<ArrowUpRight size={15} /></button>)}</div>
          </div>
        )}
        {history.map((m, i) => (
          <div key={i} className={`msg-row ${m.role}`}>
            <div className={`avatar ${m.role}`}>{m.role === "user" ? <User size={16} /> : <Bot size={17} />}</div>
            <div className={`msg ${m.role}`}>
              {m.role === "assistant" ? <div className="analyst-answer"><span className="answer-eyebrow">FROM THE ANALYST'S DESK</span><ReactMarkdown remarkPlugins={[remarkGfm]} components={ANSWER_COMPONENTS} skipHtml disallowedElements={["img"]}>{m.content}</ReactMarkdown></div> : m.content}
            </div>
          </div>
        ))}
        {loading && (
          <div className="msg-row assistant">
            <div className="avatar assistant">
              <Bot size={17} />
            </div>
            <div className="msg assistant typing-dots">
              <span />
              <span />
              <span />
            </div>
          </div>
        )}
      </div>

      <form className="chat-input-row" onSubmit={handleSend}>
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="e.g. Compare Kohli and Tendulkar's ODI strike rate"
          aria-label="Cricket question"
          disabled={!geminiConfigured || loading}
        />
        <button className="icon-btn" type="submit" disabled={!geminiConfigured || loading || !question.trim()} aria-label="Send" title="Send question">
          {loading ? <Loader2 size={18} className="spin" /> : <Send size={18} />}
        </button>
      </form>
    </div>
  );
}
