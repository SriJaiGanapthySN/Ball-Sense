import json
import unittest
from unittest.mock import patch

from src.hand_multiplayer import MatchError, Room


class HandMultiplayerTests(unittest.TestCase):
    def make_room(self, overs=1, wickets=1):
        room = Room("ABC234", "Host", overs, wickets, now=100)
        room.join("Guest", now=100)
        room.connect("you", True, 100)
        room.connect("computer", True, 100)
        return room

    def action(self, room, side, event, **values):
        room.action(side, {"type": event, "matchId": room.match_id, "phase": room.phase, "version": room.version, "turn": room.turn, **values}, now=room.updated_at)

    def start(self, room):
        self.finish_toss(room)
        self.action(room, "you", "CHOOSE", choice="bat")
        self.both_ready(room)

    def finish_toss(self, room, coin="tails", call="heads"):
        self.both_ready(room)
        with patch("src.hand_multiplayer.secrets.choice", return_value=coin):
            self.action(room, "computer", "CALL_TOSS", call=call)
        room.expire(room.deadline)
        room.expire(room.deadline)
        self.action(room, "you", "CONTINUE_TOSS")
        self.action(room, "computer", "CONTINUE_TOSS")
        room.expire(room.deadline)

    def both_ready(self, room):
        self.action(room, "you", "READY")
        self.action(room, "computer", "READY")

    def ball(self, room, host, guest):
        self.action(room, "you", "PICK", pick=host)
        self.action(room, "computer", "PICK", pick=guest)

    def test_picks_and_tokens_stay_private_until_both_commit(self):
        room = self.make_room()
        self.start(room)
        self.action(room, "you", "PICK", pick=6)
        snapshot = room.snapshot("computer")
        self.assertEqual(snapshot["locked"], ["you"])
        self.assertEqual(snapshot["context"]["history"], [])
        self.assertIsNone(snapshot["context"]["lastBall"])
        self.assertNotIn("pending", snapshot)
        self.assertNotIn(room.players["you"].token, json.dumps(snapshot))
        with self.assertRaises(MatchError):
            self.action(room, "you", "PICK", pick=1)
        self.action(room, "computer", "PICK", pick=2)
        self.assertEqual(room.context["scores"]["you"], {"runs": 6, "wickets": 0, "balls": 1})
        self.assertEqual(room.phase, "reveal")
        with self.assertRaises(MatchError):
            self.action(room, "computer", "PICK", pick=2)

    def test_two_innings_chase_and_joint_rematch(self):
        room = self.make_room()
        self.start(room)
        self.ball(room, 5, 1)
        self.assertEqual(room.context["lastBall"]["batRuns"], 4)
        self.assertEqual(room.context["lastBall"]["extras"], 1)
        self.both_ready(room)
        self.ball(room, 5, 5)
        self.both_ready(room)
        self.assertEqual(room.phase, "inningsBreak")
        self.assertEqual(room.context["target"], 6)
        self.both_ready(room)
        self.ball(room, 1, 6)
        self.assertEqual(room.context["result"]["winner"], "computer")
        self.assertEqual(room.context["result"]["margin"], "1 wicket")
        self.both_ready(room)
        match_id = room.match_id
        self.action(room, "you", "REMATCH")
        self.assertEqual(room.phase, "finished")
        self.action(room, "computer", "REMATCH")
        self.assertEqual(room.phase, "lobby")
        self.assertNotEqual(room.match_id, match_id)
        self.assertEqual(room.context["history"], [])
        self.assertIsNone(room.call)
        self.assertIsNone(room.toss_coin)
        self.assertEqual(room.toss_stage, "none")

    def test_stale_invalid_and_unauthorized_actions_are_rejected(self):
        room = self.make_room()
        self.start(room)
        for pick in (0, 7, True, 1.5, "6", None):
            with self.assertRaises(MatchError):
                self.action(room, "you", "PICK", pick=pick)
        with self.assertRaises(MatchError):
            room.action("you", {"type": "PICK", "pick": 6, "matchId": "old", "version": room.version, "turn": 0})
        with self.assertRaises(MatchError):
            room.authenticate("not-a-token")
        with self.assertRaises(MatchError):
            room.join("Third")
        self.assertEqual(room.context["history"], [])

    def test_disconnect_preserves_pick_and_expiry_forfeits(self):
        room = self.make_room()
        self.start(room)
        self.action(room, "you", "PICK", pick=4)
        room.connect("computer", False, 110)
        self.assertFalse(room.expire(169))
        room.connect("computer", True, 169)
        self.assertEqual(room.pending, {"you": 4})
        self.assertEqual(room.deadline, 214)
        room.connect("computer", False, 170)
        self.assertTrue(room.expire(230))
        self.assertEqual(room.context["result"]["winner"], "you")
        self.assertEqual(room.context["result"]["reason"], "forfeit")

    def test_turn_deadline_and_abandonment(self):
        room = self.make_room()
        self.start(room)
        self.action(room, "you", "PICK", pick=3)
        self.assertTrue(room.expire(room.deadline + 1))
        self.assertEqual(room.context["result"]["winner"], "you")
        self.assertEqual(room.context["scores"]["you"]["balls"], 0)
        room = self.make_room()
        self.start(room)
        self.assertTrue(room.expire(room.deadline + 1))
        self.assertEqual(room.context["result"]["reason"], "abandoned")

    def test_snapshot_is_detached_from_authoritative_state(self):
        room = self.make_room()
        snapshot = room.snapshot("you")
        snapshot["context"]["scores"]["you"]["runs"] = 999
        self.assertEqual(room.context["scores"]["you"]["runs"], 0)

    def test_simultaneous_picks_accept_the_same_snapshot_version(self):
        room = self.make_room()
        self.start(room)
        message = {"type": "PICK", "phase": "playing", "matchId": room.match_id, "version": room.version, "turn": room.turn}
        room.action("you", {**message, "pick": 6}, now=101)
        room.action("computer", {**message, "pick": 1}, now=101)
        self.assertEqual(room.context["scores"]["you"]["runs"], 6)
        self.assertEqual(len(room.context["history"]), 1)

    def test_leaving_or_disconnecting_after_final_ball_preserves_the_winner(self):
        for leaving in (True, False):
            room = self.make_room()
            self.start(room)
            self.ball(room, 1, 1)
            self.both_ready(room)
            self.both_ready(room)
            self.ball(room, 1, 6)
            result = dict(room.context["result"])
            self.assertEqual(room.phase, "reveal")
            if leaving:
                self.action(room, "computer", "LEAVE")
            else:
                room.connect("computer", False, 105)
                room.expire(106)
            self.assertEqual(room.phase, "finished")
            self.assertEqual(room.context["result"], result)

    def test_toss_winner_alone_controls_batting_and_all_overs_end(self):
        for winner in ("you", "computer"):
            for choice in ("bat", "bowl"):
                room = self.make_room(wickets=3)
                self.finish_toss(room, coin="tails" if winner == "you" else "heads")
                loser = "computer" if winner == "you" else "you"
                with self.assertRaises(MatchError):
                    self.action(room, loser, "CHOOSE", choice=choice)
                self.action(room, winner, "CHOOSE", choice=choice)
                batting = winner if choice == "bat" else loser
                self.assertEqual(room.context["battingFirst"], batting)
                self.both_ready(room)
                for _ in range(6):
                    self.ball(room, 5 if batting == "you" else 1, 5 if batting == "computer" else 1)
                    self.both_ready(room)
                self.assertEqual(room.phase, "inningsBreak")
                self.assertEqual(room.context["scores"][batting], {"runs": 30, "wickets": 0, "balls": 6})

    def test_tie_and_defended_target_results(self):
        for first_runs in (0, 4):
            room = self.make_room()
            self.start(room)
            if first_runs:
                self.ball(room, first_runs, 1)
                self.both_ready(room)
            self.ball(room, 1, 1)
            self.both_ready(room)
            self.both_ready(room)
            self.ball(room, 2, 2)
            self.assertEqual(room.context["result"]["winner"], "you" if first_runs else "tie")
            self.assertEqual(room.context["result"]["margin"], "4 runs" if first_runs else "Scores level")

    def test_old_ball_and_old_rematch_cannot_mutate_current_game(self):
        room = self.make_room()
        self.start(room)
        old = {"type": "PICK", "phase": "playing", "matchId": room.match_id, "turn": room.turn, "pick": 6}
        self.ball(room, 6, 1)
        self.both_ready(room)
        with self.assertRaises(MatchError):
            room.action("you", old, now=101)
        token = room.players["you"].token
        self.action(room, "you", "LEAVE")
        with self.assertRaises(MatchError):
            room.authenticate(token)
        with self.assertRaises(MatchError):
            room.authenticate("\u00e9" * 40)

    def test_away_alone_calls_toss_and_both_players_see_shared_stages(self):
        room = self.make_room()
        self.both_ready(room)
        self.assertEqual(room.toss_stage, "call")
        self.assertIsNone(room.context["coin"])
        self.assertIsNone(room.call)
        with self.assertRaises(MatchError):
            self.action(room, "you", "CALL_TOSS", call="heads")
        with self.assertRaises(MatchError):
            self.action(room, "computer", "CALL_TOSS", call="invalid")
        with patch("src.hand_multiplayer.secrets.choice", return_value="heads") as random_coin:
            self.action(room, "computer", "CALL_TOSS", call="heads")
            with self.assertRaises(MatchError):
                self.action(room, "computer", "CALL_TOSS", call="tails")
            random_coin.assert_called_once()
        self.assertEqual(room.toss_stage, "flipping")
        self.assertIsNone(room.snapshot("you")["context"]["coin"])
        self.assertEqual(room.snapshot("you")["toss"], room.snapshot("computer")["toss"])
        self.assertEqual(room.snapshot("you")["players"]["computer"]["role"], "away")
        with self.assertRaises(MatchError):
            self.action(room, "computer", "CHOOSE", choice="bat")
        room.expire(room.deadline)
        self.assertEqual(room.toss_stage, "landed")
        self.assertEqual(room.context["coin"], "heads")
        self.assertIsNone(room.context["tossWinner"])
        room.expire(room.deadline)
        self.assertEqual(room.toss_stage, "result")
        self.assertEqual(room.context["tossWinner"], "computer")
        self.action(room, "you", "CONTINUE_TOSS")
        self.assertEqual(room.toss_stage, "result")
        self.action(room, "computer", "CONTINUE_TOSS")
        self.assertEqual(room.toss_stage, "handshake")
        with self.assertRaises(MatchError):
            self.action(room, "computer", "CHOOSE", choice="bat")
        room.expire(room.deadline)
        self.action(room, "computer", "CHOOSE", choice="bowl")
        self.assertEqual(room.context["battingFirst"], "you")

    def test_reconnect_during_toss_preserves_coin_and_animation_clock(self):
        room = self.make_room()
        self.both_ready(room)
        self.action(room, "computer", "CALL_TOSS", call="tails")
        before = room.snapshot("you")["toss"]
        coin = room.toss_coin
        room.connect("computer", False, 100.4)
        room.connect("computer", True, 101)
        self.assertEqual(room.snapshot("computer")["toss"], before)
        room.expire(104)
        self.assertEqual(room.toss_stage, "result")
        self.assertEqual(room.context["coin"], coin)

    def test_toss_call_timeout_belongs_to_away_and_winner_choice_timeout_is_separate(self):
        room = self.make_room()
        self.both_ready(room)
        room.expire(room.deadline + 1)
        self.assertEqual(room.context["result"]["winner"], "you")
        room = self.make_room()
        self.finish_toss(room, coin="heads")
        room.expire(room.deadline + 1)
        self.assertEqual(room.context["result"]["winner"], "you")


class HandMultiplayerTransportTests(unittest.TestCase):
    def test_two_websockets_share_results_without_pending_pick_leaks(self):
        from fastapi import FastAPI
        from fastapi.testclient import TestClient
        from backend.routes import hand_multiplayer as routes

        routes.channels.clear()
        routes.attempts.clear()
        app = FastAPI()
        app.include_router(routes.router)
        with TestClient(app) as client:
            host = client.post("/api/hand/rooms", json={"name": "Host", "overs": 1, "wicketLimit": 1}).json()
            code = host["code"]
            guest = client.post(f"/api/hand/rooms/{code}/join", json={"name": "Guest"}).json()
            self.assertEqual(client.post(f"/api/hand/rooms/{code}/join", json={"name": "Third"}).status_code, 409)
            with client.websocket_connect(f"/api/hand/rooms/{code}/ws") as host_socket:
                host_socket.send_json({"type": "AUTH", "token": host["token"]})
                host_socket.receive_json()
                with client.websocket_connect(f"/api/hand/rooms/{code}/ws") as guest_socket:
                    guest_socket.send_json({"type": "AUTH", "token": guest["token"]})
                    state = host_socket.receive_json()
                    guest_socket.receive_json()

                    def send(socket, event, **values):
                        socket.send_json({"type": event, "matchId": state["matchId"], "phase": state["phase"], "turn": state["turn"], **values})
                        host_state = host_socket.receive_json()
                        guest_state = guest_socket.receive_json()
                        self.assertEqual(host_state["context"], guest_state["context"])
                        return host_state

                    state = send(host_socket, "READY")
                    state = send(guest_socket, "READY")

                    def wait_toss(stage):
                        host_state = host_socket.receive_json()
                        while host_state["toss"]["stage"] != stage:
                            host_state = host_socket.receive_json()
                        guest_state = guest_socket.receive_json()
                        while guest_state["toss"]["stage"] != stage:
                            guest_state = guest_socket.receive_json()
                        self.assertEqual(host_state["toss"], guest_state["toss"])
                        self.assertEqual(host_state["context"], guest_state["context"])
                        return host_state

                    self.assertEqual(state["toss"]["stage"], "call")
                    state = send(guest_socket, "CALL_TOSS", call="heads")
                    self.assertEqual(state["toss"]["stage"], "flipping")
                    state = wait_toss("result")
                    state = send(host_socket, "CONTINUE_TOSS")
                    state = send(guest_socket, "CONTINUE_TOSS")
                    self.assertEqual(state["toss"]["stage"], "handshake")
                    state = wait_toss("complete")
                    winner_socket = host_socket if state["context"]["tossWinner"] == "you" else guest_socket
                    state = send(winner_socket, "CHOOSE", choice="bat")
                    state = send(host_socket, "READY")
                    state = send(guest_socket, "READY")
                    state = send(host_socket, "PICK", pick=6)
                    self.assertIsNone(state["context"]["lastBall"])
                    self.assertNotIn("pending", state)
                    self.assertNotIn("token", json.dumps(state))
                    state = send(guest_socket, "PICK", pick=6)
                    self.assertTrue(state["context"]["lastBall"]["wicket"])
                    self.assertEqual(len(state["context"]["history"]), 1)

    def test_validation_missing_rooms_and_origin_rejection(self):
        from fastapi import FastAPI, WebSocketDisconnect
        from fastapi.testclient import TestClient
        from backend.routes import hand_multiplayer as routes

        routes.channels.clear()
        routes.attempts.clear()
        app = FastAPI()
        app.include_router(routes.router)
        with TestClient(app) as client:
            self.assertEqual(client.post("/api/hand/rooms", json={"name": "", "overs": 1}).status_code, 422)
            self.assertEqual(client.post("/api/hand/rooms", json={"name": "Test", "overs": 10}).status_code, 400)
            self.assertEqual(client.post("/api/hand/rooms", json={"name": "Test", "call": "heads"}).status_code, 422)
            self.assertEqual(client.post("/api/hand/rooms/ABC234/join", json={"name": "Test"}).status_code, 404)
            with self.assertRaises(WebSocketDisconnect):
                with client.websocket_connect("/api/hand/rooms/ABC234/ws", headers={"origin": "https://untrusted.example"}):
                    pass


if __name__ == "__main__":
    unittest.main()