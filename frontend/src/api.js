const API_BASE = import.meta.env.VITE_API_BASE || "/api";

async function request(path, options) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = await res.json();
      message = typeof body.detail === "string" ? body.detail : message;
    } catch {
      /* ignore non-JSON error body */
    }
    const error = new Error(message || "The server could not complete this request.");
    error.status = res.status;
    throw error;
  }
  return res.json();
}

export const getStatus = () => request("/status");

export const getTeams = (format) => request(`/teams?format=${encodeURIComponent(format)}`);

export const predictSeries = (payload) =>
  request("/predict", { method: "POST", body: JSON.stringify(payload) });

export const askChat = (payload) =>
  request("/chat", { method: "POST", body: JSON.stringify(payload) });

export const getLiveMatches = () => request("/live-matches");

export const searchPlayers = (q, limit = 15) =>
  request(`/players/search?q=${encodeURIComponent(q)}&limit=${limit}`);

export const comparePlayers = (payload) =>
  request("/players/compare", { method: "POST", body: JSON.stringify(payload) });

export const getDashboardLeaderboards = (format, limit = 10, team = "") =>
  request(`/dashboard/leaderboards?format=${encodeURIComponent(format)}&limit=${limit}&team=${encodeURIComponent(team)}`);

export const getDashboardRunsByYear = (format, team = "") =>
  request(`/dashboard/runs-by-year?format=${encodeURIComponent(format)}&team=${encodeURIComponent(team)}`);

export const getDashboardTeamPerformance = (team = "") => request(`/dashboard/team-performance?team=${encodeURIComponent(team)}`);
export const getDashboardTeams = () => request("/dashboard/teams");
