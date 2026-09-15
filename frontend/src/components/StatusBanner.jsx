import { CheckCircle2, XCircle } from "lucide-react";

export default function StatusBanner({ status }) {
  if (!status) return null;
  return (
    <div className="status-row">
      <span className="status-pill">
        {status.gemini_configured ? (
          <CheckCircle2 className="on" size={14} />
        ) : (
          <XCircle className="off" size={14} />
        )}
        Gemini {status.gemini_configured ? "connected" : "not configured"}
      </span>
      <span className="status-pill">
        {status.cricapi_configured ? (
          <CheckCircle2 className="on" size={14} />
        ) : (
          <XCircle className="off" size={14} />
        )}
        CricAPI {status.cricapi_configured ? "connected" : "not configured"}
      </span>
    </div>
  );
}
