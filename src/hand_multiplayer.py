import copy
import secrets
import time
import uuid
from dataclasses import dataclass, field


SIDES = ("you", "computer")
TURN_SECONDS = 45
RECONNECT_SECONDS = 60
ROOM_SECONDS = 900
TOSS_STAGE_SECONDS = {"flipping": 2.2, "landed": 0.9, "handshake": 2.0}


class MatchError(ValueError):
    pass


def other_side(side):
    return "computer" if side == "you" else "you"


def initial_context(overs, wicket_limit):
    return {
        "overs": overs, "wicketLimit": wicket_limit, "innings": 1,
        "batting": "you", "battingFirst": "you",
        "scores": {side: {"runs": 0, "wickets": 0, "balls": 0} for side in SIDES},
        "target": None, "history": [], "lastBall": None, "result": None,
        "tossWinner": None, "coin": None,
    }


@dataclass
class Player:
    name: str
    token: str = field(default_factory=lambda: secrets.token_urlsafe(32))
    connected: bool = False
    disconnected_at: float = field(default_factory=time.time)


class Room:
    def __init__(self, code, name, overs=2, wicket_limit=3, now=None):
        if type(overs) is not int or overs not in (1, 2, 5):
            raise MatchError("Choose 1, 2, or 5 overs.")
        if type(wicket_limit) is not int or wicket_limit not in (1, 3, 5):
            raise MatchError("Choose 1, 3, or 5 wickets.")
        self.code = code
        self.call = None
        self.toss_stage = "none"
        self.toss_coin = None
        self.toss_started_at = None
        self.toss_stage_started_at = None
        self.players = {"you": Player(self.clean_name(name))}
        self.context = initial_context(overs, wicket_limit)
        self.phase = "lobby"
        self.match_id = uuid.uuid4().hex
        self.version = 0
        self.turn = 0
        self.pending = {}
        self.ready = set()
        self.rematch = set()
        self.deadline = None
        self.after_reveal = None
        self.updated_at = time.time() if now is None else now
        self.players["you"].disconnected_at = self.updated_at

    @staticmethod
    def clean_name(name):
        if not isinstance(name, str):
            raise MatchError("Enter a player name.")
        cleaned = " ".join(name.split())
        if not 1 <= len(cleaned) <= 24 or any(ord(char) < 32 for char in cleaned):
            raise MatchError("Player names must contain 1 to 24 characters.")
        return cleaned

    def touch(self, now):
        self.version += 1
        self.updated_at = now

    def join(self, name, now=None):
        if len(self.players) >= 2 or self.phase != "lobby":
            raise MatchError("This room already has two players.")
        now = time.time() if now is None else now
        player = Player(self.clean_name(name), disconnected_at=now)
        self.players["computer"] = player
        self.touch(now)
        return player

    def authenticate(self, token):
        if not isinstance(token, str) or not token.isascii():
            raise MatchError("Your room session is invalid.")
        for side, player in self.players.items():
            if secrets.compare_digest(player.token, token):
                return side
        raise MatchError("Your room session has expired. Join a new room.")

    def connect(self, side, connected, now=None):
        now = time.time() if now is None else now
        self.players[side].connected = connected
        self.players[side].disconnected_at = None if connected else now
        if connected and len(self.players) == 2 and all(player.connected for player in self.players.values()):
            if self.phase != "toss" or self.toss_stage not in TOSS_STAGE_SECONDS:
                self.deadline = now + TURN_SECONDS if self.phase not in ("lobby", "finished") else None
        self.touch(now)

    def transition(self, phase, now):
        self.phase = phase
        self.ready.clear()
        self.deadline = now + TURN_SECONDS if phase not in ("lobby", "finished") else None

    def stage_toss(self, stage, now):
        self.toss_stage = stage
        self.toss_stage_started_at = now
        self.ready.clear()
        self.deadline = now + TOSS_STAGE_SECONDS.get(stage, TURN_SECONDS)
        if stage == "flipping":
            self.toss_started_at = now

    def finish(self, winner, margin, reason, now):
        self.pending.clear()
        self.context["result"] = {"winner": winner, "margin": margin, "reason": reason}
        self.transition("finished", now)

    def action(self, side, message, now=None):
        now = time.time() if now is None else now
        if not isinstance(message, dict):
            raise MatchError("Invalid room message.")
        if message.get("matchId") != self.match_id or message.get("phase") != self.phase or message.get("turn") != self.turn:
            raise MatchError("The match has moved on. Please try again.")
        if not self.players[side].connected:
            raise MatchError("Reconnect before playing.")
        event = message.get("type")
        if event == "LEAVE":
            if self.context["result"] is not None:
                self.transition("finished", now)
            elif self.phase != "finished":
                self.finish(other_side(side), "Opponent left the match", "forfeit", now)
            self.players[side].token = secrets.token_urlsafe(32)
            self.connect(side, False, now)
            return
        if len(self.players) != 2 or not all(player.connected for player in self.players.values()):
            raise MatchError("Waiting for your opponent to connect.")
        if event == "REMATCH" and self.phase == "finished":
            self.rematch.add(side)
            if len(self.rematch) == 2:
                self.context = initial_context(self.context["overs"], self.context["wicketLimit"])
                self.match_id = uuid.uuid4().hex
                self.turn = 0
                self.pending.clear()
                self.rematch.clear()
                self.call = None
                self.toss_stage = "none"
                self.toss_coin = None
                self.toss_started_at = None
                self.toss_stage_started_at = None
                self.transition("lobby", now)
        elif event == "READY" and self.phase in ("lobby", "ready", "reveal", "inningsBreak"):
            self.ready.add(side)
            if len(self.ready) == 2:
                if self.phase == "lobby":
                    self.transition("toss", now)
                    self.stage_toss("call", now)
                elif self.phase == "inningsBreak":
                    self.context.update(innings=2, batting=other_side(self.context["battingFirst"]), lastBall=None)
                    self.transition("playing", now)
                else:
                    self.transition(self.after_reveal if self.phase == "reveal" else "playing", now)
        elif event == "CALL_TOSS" and self.phase == "toss" and self.toss_stage == "call":
            if side != "computer":
                raise MatchError("The away captain calls the toss. Wait for your friend.")
            if message.get("call") not in ("heads", "tails"):
                raise MatchError("Choose heads or tails.")
            self.call = message["call"]
            self.toss_coin = secrets.choice(("heads", "tails"))
            self.stage_toss("flipping", now)
        elif event == "CONTINUE_TOSS" and self.phase == "toss" and self.toss_stage == "result":
            self.ready.add(side)
            if len(self.ready) == 2:
                self.stage_toss("handshake", now)
        elif event == "CHOOSE" and self.phase == "toss" and self.toss_stage == "complete":
            if side != self.context["tossWinner"] or message.get("choice") not in ("bat", "bowl"):
                raise MatchError("Only the toss winner can choose bat or bowl.")
            batting = side if message["choice"] == "bat" else other_side(side)
            self.context.update(batting=batting, battingFirst=batting)
            self.transition("ready", now)
        elif event == "PICK" and self.phase == "playing":
            pick = message.get("pick")
            if type(pick) is not int or not 1 <= pick <= 6 or message.get("turn") != self.turn:
                raise MatchError("Choose a number from 1 to 6 for the current ball.")
            if side in self.pending:
                raise MatchError("Your number is already locked.")
            self.pending[side] = pick
            if len(self.pending) == 2:
                self.score(now)
        else:
            raise MatchError("That action is not available now.")
        self.touch(now)

    def score(self, now):
        context = self.context
        batting = context["batting"]
        wicket = self.pending["you"] == self.pending["computer"]
        runs = 0 if wicket else self.pending[batting]
        score = context["scores"][batting]
        score["runs"] += runs
        score["wickets"] += int(wicket)
        score["balls"] += 1
        dismissal = secrets.choice(("bowled", "caught", "lbw", "runout")) if wicket else None
        overthrow = not wicket and runs in (2, 3) and secrets.randbelow(100) < 30
        delivery = {
            **self.pending, "runs": runs, "wicket": wicket, "batting": batting,
            "ball": score["balls"], "innings": context["innings"],
            "length": secrets.choice(("yorker", "good length", "short")),
            "dismissal": dismissal, "side": secrets.choice((-1, 1)),
            "fielderIndex": secrets.randbelow(10 if dismissal == "caught" else 9),
            "noBall": not wicket and runs == 5, "batRuns": 4 if runs == 5 else runs,
            "extras": int(not wicket and runs == 5), "overthrow": overthrow,
            "directHit": not wicket and not overthrow and runs in (1, 2, 3) and secrets.randbelow(100) < 25,
        }
        context["lastBall"] = delivery
        context["history"].append(delivery)
        self.pending.clear()
        self.turn += 1
        innings_over = score["wickets"] >= context["wicketLimit"] or score["balls"] >= context["overs"] * 6
        chased = context["innings"] == 2 and score["runs"] >= context["target"]
        if context["innings"] == 2 and (chased or innings_over):
            difference = context["scores"]["you"]["runs"] - context["scores"]["computer"]["runs"]
            remaining = context["wicketLimit"] - score["wickets"]
            margin = "Scores level" if difference == 0 else (
                f"{remaining} wicket{'s' if remaining != 1 else ''}" if chased
                else f"{abs(difference)} run{'s' if abs(difference) != 1 else ''}"
            )
            context["result"] = {"winner": "tie" if difference == 0 else "you" if difference > 0 else "computer", "margin": margin, "reason": "completed"}
            self.after_reveal = "finished"
        elif innings_over:
            context["target"] = score["runs"] + 1
            self.after_reveal = "inningsBreak"
        else:
            self.after_reveal = "playing"
        self.transition("reveal", now)

    def expire(self, now=None):
        now = time.time() if now is None else now
        if self.phase == "finished" or len(self.players) < 2:
            return False
        progressed = False
        while self.phase == "toss" and self.toss_stage in TOSS_STAGE_SECONDS and now >= self.deadline:
            stage_time = self.deadline
            if self.toss_stage == "flipping":
                self.context["coin"] = self.toss_coin
                self.stage_toss("landed", stage_time)
            elif self.toss_stage == "landed":
                self.context["tossWinner"] = "computer" if self.toss_coin == self.call else "you"
                self.stage_toss("result", stage_time)
            else:
                self.stage_toss("complete", stage_time)
            progressed = True
        disconnected = [side for side, player in self.players.items() if not player.connected]
        if disconnected and self.context["result"] is not None:
            self.transition("finished", now)
        elif disconnected:
            expired = [side for side in disconnected if now - self.players[side].disconnected_at >= RECONNECT_SECONDS]
            if not expired:
                if progressed:
                    self.touch(now)
                return progressed
            winner = "tie" if len(disconnected) == 2 else other_side(expired[0])
            self.finish(winner, "Match abandoned" if winner == "tie" else "Opponent disconnected", "abandoned" if winner == "tie" else "forfeit", now)
        elif self.deadline is not None and now >= self.deadline:
            if self.phase == "toss" and self.toss_stage == "call":
                self.finish("you", "Away captain's toss call timed out", "timeout", now)
            elif self.phase == "toss" and self.toss_stage == "complete":
                self.finish(other_side(self.context["tossWinner"]), "Toss choice timed out", "timeout", now)
            elif self.phase == "reveal":
                self.transition(self.after_reveal, now)
            else:
                waiting = self.pending if self.phase == "playing" else self.ready
                winner = next(iter(waiting)) if len(waiting) == 1 else "tie"
                self.finish(winner, "Turn timed out" if winner != "tie" else "Match abandoned", "timeout" if winner != "tie" else "abandoned", now)
        elif not progressed:
            return False
        self.touch(now)
        return True

    def snapshot(self, side):
        return {
            "type": "STATE", "code": self.code, "seat": side, "matchId": self.match_id,
            "version": self.version, "turn": self.turn, "phase": self.phase,
            "context": copy.deepcopy(self.context), "call": self.call,
            "toss": {"stage": self.toss_stage, "caller": "computer",
                "startedAt": None if self.toss_started_at is None else int(self.toss_started_at * 1000),
                "stageStartedAt": None if self.toss_stage_started_at is None else int(self.toss_stage_started_at * 1000),
                "nextStageAt": int(self.deadline * 1000) if self.phase == "toss" and self.toss_stage in TOSS_STAGE_SECONDS else None},
            "players": {seat: {"name": player.name, "connected": player.connected, "role": "home" if seat == "you" else "away",
                "reconnectUntil": None if player.disconnected_at is None else int((player.disconnected_at + RECONNECT_SECONDS) * 1000)}
                for seat, player in self.players.items()},
            "locked": list(self.pending), "ready": list(self.ready), "rematch": list(self.rematch),
            "deadline": None if self.deadline is None else int(self.deadline * 1000),
            "serverNow": int(time.time() * 1000),
        }