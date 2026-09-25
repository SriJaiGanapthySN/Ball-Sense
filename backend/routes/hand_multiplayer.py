import asyncio
import json
import os
import re
import secrets
import time
from collections import deque
from contextlib import asynccontextmanager, suppress
from dataclasses import dataclass, field
from urllib.parse import urlsplit

from fastapi import APIRouter, HTTPException, Request, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, ConfigDict, Field

from src.hand_multiplayer import MatchError, ROOM_SECONDS, Room


@dataclass
class Channel:
    room: Room
    sockets: dict = field(default_factory=dict)
    lock: asyncio.Lock = field(default_factory=asyncio.Lock)

    async def broadcast(self):
        for side, socket in list(self.sockets.items()):
            try:
                await asyncio.wait_for(socket.send_json(self.room.snapshot(side)), timeout=2)
            except (RuntimeError, WebSocketDisconnect, OSError, asyncio.TimeoutError):
                if self.sockets.get(side) is socket:
                    self.sockets.pop(side, None)
                    self.room.connect(side, False)


channels = {}
attempts = {}


async def maintain_rooms():
    while True:
        await asyncio.sleep(1)
        now = time.time()
        for code, channel in list(channels.items()):
            async with channel.lock:
                if now - channel.room.updated_at > ROOM_SECONDS:
                    channels.pop(code, None)
                    for socket in list(channel.sockets.values()):
                        with suppress(RuntimeError, WebSocketDisconnect, OSError):
                            await socket.close(code=4004, reason="Room expired")
                elif channel.room.expire(now):
                    await channel.broadcast()
        for address, recent in list(attempts.items()):
            if not recent or now - recent[-1] > 60:
                attempts.pop(address, None)


@asynccontextmanager
async def lifespan(app):
    task = asyncio.create_task(maintain_rooms())
    try:
        yield
    finally:
        task.cancel()
        with suppress(asyncio.CancelledError):
            await task


router = APIRouter(prefix="/api/hand", tags=["hand cricket"], lifespan=lifespan)


class CreateRoom(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(min_length=1, max_length=24)
    overs: int = Field(default=2, strict=True)
    wicketLimit: int = Field(default=3, strict=True)


class JoinRoom(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(min_length=1, max_length=24)


def allow_attempt(address):
    now = time.time()
    recent = attempts.setdefault(address, deque())
    while recent and now - recent[0] > 60:
        recent.popleft()
    if len(recent) >= 30:
        return False
    recent.append(now)
    return True


def find_channel(code):
    normalized = code.strip().upper()
    if not re.fullmatch(r"[A-Z2-9]{6}", normalized) or normalized not in channels:
        raise HTTPException(404, "Room not found or expired. Check the code.")
    return channels[normalized]


def check_rate(request):
    if not allow_attempt(request.client.host if request.client else "unknown"):
        raise HTTPException(429, "Too many room attempts. Try again in a minute.")


@router.post("/rooms", status_code=201)
async def create_room(payload: CreateRoom, request: Request):
    check_rate(request)
    if len(channels) >= 200:
        raise HTTPException(503, "All rooms are busy. Please try again shortly.")
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    code = "".join(secrets.choice(alphabet) for _ in range(6))
    while code in channels:
        code = "".join(secrets.choice(alphabet) for _ in range(6))
    try:
        room = Room(code, payload.name, payload.overs, payload.wicketLimit)
    except MatchError as error:
        raise HTTPException(400, str(error)) from None
    channels[code] = Channel(room)
    return {"code": code, "token": room.players["you"].token}


@router.post("/rooms/{code}/join")
async def join_room(code: str, payload: JoinRoom, request: Request):
    check_rate(request)
    channel = find_channel(code)
    async with channel.lock:
        try:
            player = channel.room.join(payload.name)
        except MatchError as error:
            raise HTTPException(409, str(error)) from None
        await channel.broadcast()
        return {"code": channel.room.code, "token": player.token}


async def read_message(socket):
    raw = await asyncio.wait_for(socket.receive_text(), timeout=30)
    if len(raw.encode("utf-8")) > 2048:
        raise MatchError("Room message is too large.")
    message = json.loads(raw)
    if not isinstance(message, dict):
        raise MatchError("Invalid room message.")
    return message


@router.websocket("/rooms/{code}/ws")
async def room_socket(socket: WebSocket, code: str):
    origin = socket.headers.get("origin", "")
    parsed = urlsplit(origin)
    allowed = {value.strip() for value in os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",")}
    same_origin = parsed.scheme in ("http", "https") and parsed.netloc == socket.headers.get("host")
    if origin and not same_origin and origin not in allowed:
        await socket.close(code=1008)
        return
    if not allow_attempt(socket.client.host if socket.client else "unknown"):
        await socket.close(code=1008)
        return
    try:
        channel = find_channel(code)
    except HTTPException:
        await socket.accept()
        await socket.close(code=4004, reason="Room not found or expired")
        return
    await socket.accept()
    side = None
    recent = deque()
    try:
        message = await asyncio.wait_for(read_message(socket), timeout=10)
        if message.get("type") != "AUTH":
            raise MatchError("Authenticate before joining the match.")
        async with channel.lock:
            channel.room.expire()
            side = channel.room.authenticate(message.get("token"))
            previous = channel.sockets.get(side)
            if previous is not None:
                with suppress(RuntimeError, WebSocketDisconnect, OSError):
                    await previous.close(code=4001, reason="Session opened in another tab")
            channel.sockets[side] = socket
            channel.room.connect(side, True)
            await channel.broadcast()
        while True:
            message = await read_message(socket)
            now = time.time()
            while recent and now - recent[0] > 1:
                recent.popleft()
            recent.append(now)
            if len(recent) > 20:
                raise MatchError("Too many room messages.")
            async with channel.lock:
                if channel.sockets.get(side) is not socket:
                    break
                if channel.room.expire(now):
                    await channel.broadcast()
                if message.get("type") == "PING":
                    await socket.send_json({"type": "PONG", "serverNow": int(now * 1000)})
                    continue
                try:
                    channel.room.action(side, message, now)
                except MatchError as error:
                    await socket.send_json({"type": "ERROR", "message": str(error)})
                await channel.broadcast()
                if message.get("type") == "LEAVE":
                    await socket.close(code=1000)
                    break
    except (MatchError, json.JSONDecodeError) as error:
        with suppress(RuntimeError, WebSocketDisconnect, OSError):
            await socket.send_json({"type": "ERROR", "message": str(error) if isinstance(error, MatchError) else "Invalid room message."})
            await socket.close(code=4003)
    except (WebSocketDisconnect, asyncio.TimeoutError, RuntimeError, OSError):
        pass
    finally:
        if side is not None:
            async with channel.lock:
                if channel.sockets.get(side) is socket:
                    channel.sockets.pop(side, None)
                    channel.room.connect(side, False)
                    await channel.broadcast()