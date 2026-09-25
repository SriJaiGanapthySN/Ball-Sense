import { useEffect, useRef, useState } from "react";
import { mergeRoomState, readRoomSession, ROOM_SESSION_KEY, roomAction, roomProtocolError, roomSocketUrl } from "../lib/handMultiplayer.js";

export default function useHandMultiplayer() {
  const [session, setSession] = useState(() => {
    try { return readRoomSession(window.sessionStorage); } catch { return null; }
  });
  const [room, setRoom] = useState(null);
  const [connection, setConnection] = useState("idle");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [pickPending, setPickPending] = useState(false);
  const [now, setNow] = useState(Date.now);
  const [retry, setRetry] = useState(0);
  const socketRef = useRef(null);
  const roomRef = useRef(null);
  const pickRef = useRef(false);
  const requestRef = useRef(null);
  const clockOffset = useRef(0);

  function remember(next) {
    try {
      if (next) window.sessionStorage.setItem(ROOM_SESSION_KEY, JSON.stringify(next));
      else window.sessionStorage.removeItem(ROOM_SESSION_KEY);
    } catch {}
    setSession(next);
  }

  useEffect(() => {
    if (!session) return;
    const interval = window.setInterval(() => setNow(Date.now() + clockOffset.current), 1000);
    return () => window.clearInterval(interval);
  }, [session]);

  useEffect(() => () => requestRef.current?.abort(), []);

  useEffect(() => {
    if (!session) return;
    let stopped = false;
    let socket;
    let reconnectTimer;
    let heartbeat;
    let attempts = 0;
    let disconnectedAt = Date.now();

    function connect() {
      if (stopped) return;
      setConnection(attempts ? "reconnecting" : "connecting");
      socket = new WebSocket(roomSocketUrl(window.location, session.code));
      socketRef.current = socket;
      socket.onopen = () => {
        socket.send(JSON.stringify({ type: "AUTH", token: session.token }));
        heartbeat = window.setInterval(() => {
          if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "PING" }));
        }, 10000);
      };
      socket.onmessage = (event) => {
        if (stopped) return;
        let message;
        try { message = JSON.parse(event.data); } catch { return; }
        if (message.serverNow) clockOffset.current = message.serverNow - Date.now();
        if (message.type === "STATE") {
          const protocolError = roomProtocolError(message);
          if (protocolError) {
            stopped = true;
            window.clearInterval(heartbeat);
            roomRef.current = null;
            setRoom(null);
            setConnection("expired");
            setError(protocolError);
            socket.close(1000, "Outdated multiplayer server");
            return;
          }
          const next = mergeRoomState(roomRef.current, message);
          roomRef.current = next;
          setRoom(next);
          setConnection("connected");
          attempts = 0;
          disconnectedAt = null;
          if (next.phase !== "playing" || next.locked.includes(next.seat)) {
            pickRef.current = false;
            setPickPending(false);
          }
        } else if (message.type === "ERROR") {
          setError(message.message || "The room could not process that action.");
          pickRef.current = false;
          setPickPending(false);
        }
      };
      socket.onclose = (event) => {
        window.clearInterval(heartbeat);
        if (stopped) return;
        pickRef.current = false;
        setPickPending(false);
        if ([4001, 4003, 4004, 1008].includes(event.code)) {
          setConnection("expired");
          setError(event.code === 4001 ? "This seat was opened in another tab." : event.code === 4004 ? "This room has expired. Create or join another room." : "Your room session could not be restored.");
          return;
        }
        setConnection("reconnecting");
        disconnectedAt ??= Date.now();
        if (Date.now() - disconnectedAt >= 60000) {
          setConnection("offline");
          setError("Connection lost. Check your network and reconnect.");
          return;
        }
        attempts += 1;
        reconnectTimer = window.setTimeout(connect, Math.min(4000, 500 * 2 ** Math.min(attempts, 3)) + Math.random() * 200);
      };
      socket.onerror = () => setConnection("reconnecting");
    }
    connect();
    return () => {
      stopped = true;
      window.clearTimeout(reconnectTimer);
      window.clearInterval(heartbeat);
      socket?.close();
      if (socketRef.current === socket) socketRef.current = null;
    };
  }, [session, retry]);

  async function enter(path, payload) {
    if (requestRef.current) return;
    const controller = new AbortController();
    requestRef.current = controller;
    let timedOut = false;
    const timeout = window.setTimeout(() => { timedOut = true; controller.abort(); }, 15000);
    setBusy(true);
    setError("");
    try {
      const response = await fetch(path, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload), signal: controller.signal,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof data.detail === "string" ? data.detail : response.status === 422 ? "Check your name and match settings." : "The multiplayer server is unavailable.");
      if (!data.code || !data.token) throw new Error("The multiplayer server returned an invalid room.");
      roomRef.current = null;
      setRoom(null);
      remember(data);
    } catch (failure) {
      if (timedOut) setError("The multiplayer server took too long to respond. Please try again.");
      else if (failure.name !== "AbortError") setError(failure instanceof TypeError ? "Cannot reach the multiplayer server. Check your connection." : failure.message);
    } finally {
      window.clearTimeout(timeout);
      if (requestRef.current === controller) requestRef.current = null;
      setBusy(false);
    }
  }

  function send(type, values = {}) {
    const socket = socketRef.current;
    if (socket?.readyState !== WebSocket.OPEN || !roomRef.current || (type === "PICK" && pickRef.current)) return false;
    if (type === "PICK") {
      pickRef.current = true;
      setPickPending(true);
    }
    setError("");
    socket.send(JSON.stringify(roomAction(roomRef.current, type, values)));
    return true;
  }

  function leave() {
    send("LEAVE");
    requestRef.current?.abort();
    remember(null);
    roomRef.current = null;
    setRoom(null);
    setError("");
    setConnection("idle");
    pickRef.current = false;
    setPickPending(false);
  }

  return {
    room, session, connection, error, busy, pickPending, now, send, leave, clockOffset: clockOffset.current,
    create: (payload) => enter("/api/hand/rooms", payload),
    join: (code, name) => enter(`/api/hand/rooms/${encodeURIComponent(code.trim().toUpperCase())}/join`, { name }),
    reconnect: () => { setError(""); setRetry((previous) => previous + 1); },
  };
}