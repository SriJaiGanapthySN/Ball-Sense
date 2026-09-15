import { useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";
import { searchPlayers } from "../api.js";

/** Reusable searchable player dropdown: debounced query against /api/players/search. */
export default function PlayerSearchSelect({ label, value, onChange, excludePlayer }) {
  const [query, setQuery] = useState(value || "");
  const [options, setOptions] = useState([]);
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);

  useEffect(() => {
    setQuery(value || "");
  }, [value]);

  useEffect(() => {
    let cancelled = false;
    const handle = setTimeout(() => {
      searchPlayers(query, 12)
        .then((res) => {
          if (cancelled) return;
          setOptions(res.players.filter((p) => p !== excludePlayer));
        })
        .catch(() => !cancelled && setOptions([]));
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [query, excludePlayer]);

  useEffect(() => {
    function handleClickOutside(e) {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="player-select" ref={boxRef}>
      <label>{label}</label>
      <div className="player-select-input">
        <Search size={15} />
        <input
          type="text"
          placeholder="Search player…"
          value={query}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
        />
      </div>
      {open && options.length > 0 && (
        <div className="player-select-dropdown">
          {options.map((p) => (
            <button
              key={p}
              type="button"
              className="player-select-option"
              onClick={() => {
                onChange(p);
                setQuery(p);
                setOpen(false);
              }}
            >
              {p}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
