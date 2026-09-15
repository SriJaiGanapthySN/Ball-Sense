import { useState } from "react";
import { flagUrl } from "./countryFlags.js";

const GRADIENTS = [
  ["#385747", "#547a61"],
  ["#505943", "#756c4e"],
  ["#425366", "#59768d"],
  ["#645044", "#887361"],
  ["#4b535b", "#626b74"],
  ["#455f5a", "#637b6f"],
];

function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

export function teamGradient(name) {
  const [a, b] = GRADIENTS[hashString(name || "") % GRADIENTS.length];
  return `linear-gradient(135deg, ${a}, ${b})`;
}

export function teamInitials(name) {
  if (!name) return "?";
  const words = name.replace(/[()]/g, "").split(/\s+/).filter(Boolean);
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

/** Real flag image when a single national flag applies to `name`, else gradient initials
 * (composite teams like "West Indies"/"ICC World XI", or a broken image load). */
export default function TeamBadge({ name, size = 56, showLabel = true }) {
  const [brokenUrl, setBrokenUrl] = useState(null);
  const url = flagUrl(name, Math.max(40, size));
  const showFlag = url && brokenUrl !== url;

  return (
    <div className="team-badge">
      {showFlag ? (
        <img
          src={url}
          alt={name}
          className="avatar player-photo"
          style={{ width: size, height: size }}
          onError={() => setBrokenUrl(url)}
        />
      ) : (
        <div
          className="avatar"
          style={{ width: size, height: size, fontSize: size * 0.32, background: teamGradient(name) }}
        >
          {teamInitials(name)}
        </div>
      )}
      {showLabel && <span>{name}</span>}
    </div>
  );
}
