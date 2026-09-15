import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import TeamBadge from "./TeamBadge.jsx";

/** Custom team dropdown showing a real flag (or gradient-initials fallback) next to every
 * option — a native <select> can't render images inside its options, so this replaces it
 * wherever the user needs to see flags while choosing, not just after a result comes back. */
export default function TeamSelect({ id, label, teams, value, onChange }) {
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="team-select" ref={boxRef} onKeyDown={(event) => {
      if (event.key === "Escape") { setOpen(false); boxRef.current?.querySelector(".team-select-trigger")?.focus(); }
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        if (!open) { setOpen(true); return; }
        const options = [...boxRef.current.querySelectorAll(".team-select-option")];
        const currentIndex = options.indexOf(document.activeElement);
        options[(currentIndex + (event.key === "ArrowDown" ? 1 : -1) + options.length) % options.length]?.focus();
      }
    }}>
      {label && <label htmlFor={id}>{label}</label>}
      <button
        type="button"
        id={id}
        className="team-select-trigger"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={label || "Select team"}
        aria-controls={`${id}-options`}
      >
        <TeamBadge name={value} size={28} showLabel={false} />
        <span className="team-select-value">{value || "Select team…"}</span>
        <ChevronDown size={16} className={`team-select-chevron${open ? " open" : ""}`} />
      </button>
      {open && (
        <div className="team-select-dropdown" id={`${id}-options`}>
          {teams.map((t) => (
            <button
              key={t}
              type="button"
              aria-label={t}
              className={`team-select-option${t === value ? " active" : ""}`}
              onClick={() => {
                onChange(t);
                setOpen(false);
                boxRef.current?.querySelector(".team-select-trigger")?.focus();
              }}
            >
              <TeamBadge name={t} size={24} showLabel={false} />
              <span>{t}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
