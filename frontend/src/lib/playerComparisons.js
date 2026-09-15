export const NOTEBOOK_KEY = "gans-matchup-notebook-v1";
export const NOTEBOOK_LIMIT = 6;

function isProfile(profile) {
  return profile && typeof profile.player === "string" && profile.player.trim()
    && [profile.batting, profile.bowling].every((stats) => stats && typeof stats === "object" && !Array.isArray(stats));
}

export function matchupId(result) {
  return JSON.stringify([result.player_a.player, result.player_b.player].sort());
}

export function loadNotebook(storage) {
  try {
    const saved = JSON.parse(storage.getItem(NOTEBOOK_KEY) || "[]");
    if (!Array.isArray(saved)) return [];
    const seen = new Set();
    return saved.filter((entry) => {
      if (!isProfile(entry?.result?.player_a) || !isProfile(entry?.result?.player_b)
        || entry.result.player_a.player === entry.result.player_b.player
        || typeof entry.savedAt !== "string" || !Number.isFinite(Date.parse(entry.savedAt))) return false;
      const id = matchupId(entry.result);
      if (entry.id !== id || seen.has(id)) return false;
      seen.add(id);
      return true;
    }).slice(0, NOTEBOOK_LIMIT);
  } catch {
    return [];
  }
}

export function saveMatchup(entries, result, now = new Date()) {
  const id = matchupId(result);
  const snapshot = {
    player_a: result.player_a,
    player_b: result.player_b,
    ai_summary: result.ai_summary || null,
    notice: null,
  };
  return [{ id, savedAt: now.toISOString(), result: snapshot }, ...entries.filter((entry) => entry.id !== id)]
    .slice(0, NOTEBOOK_LIMIT);
}