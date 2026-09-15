import { useEffect, useState } from "react";
import { getLiveMatches } from "../api.js";

let cachedFeed = null;
let pendingRequest = null;

function loadFeed() {
  const cacheAge = Date.now() - Date.parse(cachedFeed?.fetched_at || "");
  if (cachedFeed && cacheAge < (cachedFeed.refresh_after_seconds || 300) * 1000) {
    return Promise.resolve(cachedFeed);
  }
  if (!pendingRequest) {
    pendingRequest = getLiveMatches().then((feed) => {
      cachedFeed = feed;
      return feed;
    }).finally(() => { pendingRequest = null; });
  }
  return pendingRequest;
}

export default function useLiveMatches(configured, active) {
  const [feed, setFeed] = useState(cachedFeed);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [refreshToken, setRefreshToken] = useState(0);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!configured || !active) return;
    let disposed = false;
    let busy = false;
    async function refresh() {
      if (document.hidden || busy) return;
      busy = true;
      setLoading(true);
      try {
        const result = await loadFeed();
        if (!disposed) {
          setFeed(result);
          setError(null);
          setNow(Date.now());
        }
      } catch (failure) {
        if (!disposed) {
          setError(failure);
          setAutoRefresh(false);
        }
      } finally {
        busy = false;
        if (!disposed) setLoading(false);
      }
    }
    refresh();
    return () => {
      disposed = true;
    };
  }, [configured, active, refreshToken]);

  useEffect(() => {
    if (!configured || !active) return;
    const requestRefresh = () => {
      if (!document.hidden) setRefreshToken((value) => value + 1);
    };
    const interval = autoRefresh ? window.setInterval(requestRefresh, 300_000) : null;
    const visibilityHandler = () => {
      if (autoRefresh || (!feed && !error)) requestRefresh();
    };
    document.addEventListener("visibilitychange", visibilityHandler);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", visibilityHandler);
    };
  }, [configured, active, autoRefresh, feed, error]);

  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, [active]);

  const isStale = !!feed && now - Date.parse(feed.fetched_at) >= (feed.refresh_after_seconds || 300) * 1000;
  return { feed, loading, error, autoRefresh, setAutoRefresh, isStale, refresh: () => setRefreshToken((value) => value + 1) };
}