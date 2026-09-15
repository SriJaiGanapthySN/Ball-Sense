export function matchState(match) {
  const status = match.status || "";
  if (match.match_ended === true || /\bwon (?:by|the match|on)\b|\bdrawn\b|\bno result\b|\babandoned\b|\btied\b/i.test(status)) return "finished";
  if (match.match_started === false) return "upcoming";
  if (match.match_started === true || match.score?.some((entry) => Number(entry.o) > 0)) return "live";
  if (/not started|scheduled|starts|toss/i.test(status)) return "upcoming";
  return "unknown";
}

export function formatMatchDate(match) {
  const date = match.start_time || match.date;
  if (!date || Number.isNaN(Date.parse(date))) return "Time to be confirmed";
  return new Intl.DateTimeFormat("en", {
    month: "short", day: "numeric",
    ...(match.start_time ? { hour: "2-digit", minute: "2-digit", timeZoneName: "short" } : { timeZone: "UTC" }),
  }).format(new Date(date));
}

export function orderMatches(matches) {
  const order = { live: 0, upcoming: 1, finished: 2, unknown: 3 };
  return [...matches].sort((first, second) => order[matchState(first)] - order[matchState(second)]);
}