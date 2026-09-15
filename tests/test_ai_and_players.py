import os
import unittest
from unittest.mock import Mock, patch

from src import chat_assistant, player_stats
import pandas as pd
from backend import main
from backend.routes import player_comparison
from fastapi import HTTPException


class AiFallbackTests(unittest.TestCase):
    def test_keys_are_ordered_and_duplicates_removed(self):
        settings = {"GEMINI_API_KEY": "first", "GEMINI_API_KEY_3": "third",
                    "GEMINI_API_KEY_2": "second", "GEMINI_API_KEYS": "third, fourth"}
        with patch.dict(os.environ, settings, clear=True):
            self.assertEqual(chat_assistant.configured_api_keys("first"),
                             ["first", "second", "third", "fourth"])

    def test_chat_restarts_with_original_context_after_error(self):
        history = [{"role": "user", "content": "India"}]
        notice = Mock()
        with patch.dict(os.environ, {"GEMINI_API_KEY_2": "backup"}, clear=True), \
                patch.object(chat_assistant, "_ask_once", side_effect=[RuntimeError("private"), "answer"]) as request:
            self.assertEqual(chat_assistant.ask("runs?", history, "first", on_retry=notice), "answer")
            self.assertEqual(request.call_args_list[1].args[:3], ("runs?", history, "backup"))
            notice.assert_called_once_with(chat_assistant.RETRY_NOTICE)

    def test_summary_retries_empty_output(self):
        with patch.dict(os.environ, {"GEMINI_API_KEY_2": "backup"}, clear=True), \
                patch.object(chat_assistant, "_summarize_once", side_effect=["", "summary"]) as request:
            self.assertEqual(chat_assistant.summarize_player_comparison({}, {}, "first"), "summary")
            self.assertEqual(request.call_count, 2)

    def test_later_tool_round_failure_starts_a_fresh_interaction(self):
        first_client = Mock()
        backup_client = Mock()
        tool = Mock(type="function_call", arguments={"sql": "SELECT 1"}, id="lookup")
        tool.name = "run_sql"
        first_client.interactions.create.side_effect = [
            Mock(steps=[tool], id="first-conversation"), RuntimeError("provider failed"),
        ]
        backup_client.interactions.create.return_value = Mock(steps=[], output_text="Recovered answer")
        with patch.dict(os.environ, {"GEMINI_API_KEY_2": "backup"}, clear=True), \
                patch.object(chat_assistant.genai, "Client", side_effect=[first_client, backup_client]), \
                patch.object(chat_assistant, "_execute_tool_call", return_value="[]"):
            answer = chat_assistant.ask("Question", [{"role": "user", "content": "History"}], "first")
        self.assertEqual(answer, "Recovered answer")
        self.assertEqual(first_client.interactions.create.call_args.kwargs["previous_interaction_id"], "first-conversation")
        self.assertEqual(backup_client.interactions.create.call_args,
                         first_client.interactions.create.call_args_list[0])
        self.assertNotIn("previous_interaction_id", backup_client.interactions.create.call_args.kwargs)

    def test_exhaustion_is_bounded_and_hides_provider_errors(self):
        with patch.dict(os.environ, {"GEMINI_API_KEY_2": "backup"}, clear=True), \
                patch.object(chat_assistant, "_ask_once", side_effect=RuntimeError("private credential")) as request:
            with self.assertRaisesRegex(RuntimeError, "Rain stops play") as error:
                chat_assistant.ask("question", [], "first")
            self.assertNotIn("private", str(error.exception))
            self.assertEqual(request.call_count, 2)

    def test_success_does_not_retry_or_notify(self):
        notice = Mock()
        with patch.dict(os.environ, {}, clear=True), \
                patch.object(chat_assistant, "_ask_once", return_value="answer") as request:
            chat_assistant.ask("question", [], "first", on_retry=notice)
            request.assert_called_once()
            notice.assert_not_called()

    def test_chat_route_returns_retry_notice(self):
        with patch.dict(os.environ, {"GEMINI_API_KEY_2": "backup"}, clear=True), \
                patch.object(main, "GEMINI_API_KEY", "first"), \
                patch.object(chat_assistant, "_ask_once", side_effect=[RuntimeError(), "answer"]):
            response = main.chat(main.ChatRequest(question="question"))
            self.assertEqual(response.answer, "answer")
            self.assertEqual(response.notice, chat_assistant.RETRY_NOTICE)

    def test_chat_route_sanitizes_exhaustion(self):
        with patch.dict(os.environ, {}, clear=True), patch.object(main, "GEMINI_API_KEY", "first"), \
                patch.object(chat_assistant, "_ask_once", side_effect=RuntimeError("secret")):
            with self.assertRaises(HTTPException) as error:
                main.chat(main.ChatRequest(question="question"))
            self.assertEqual(error.exception.status_code, 503)
            self.assertEqual(error.exception.detail, chat_assistant.UNAVAILABLE_NOTICE)

    def test_comparison_keeps_stats_when_ai_is_unavailable(self):
        profiles = [{"player": name, "batting": {}, "bowling": {}} for name in ("A", "B")]
        with patch.dict(os.environ, {"GEMINI_API_KEY_2": "backup"}, clear=True), \
                patch.object(player_comparison.player_stats, "get_player_profile", side_effect=profiles), \
                patch.object(chat_assistant, "_summarize_once", side_effect=RuntimeError("secret")):
            response = player_comparison.compare(player_comparison.ComparePlayersRequest(player_a="A", player_b="B"))
            self.assertEqual(response.player_a.player, "A")
            self.assertIsNone(response.ai_summary)
            self.assertEqual(response.notice, chat_assistant.UNAVAILABLE_NOTICE)


class PlayerIdentityTests(unittest.TestCase):
    def test_exhibition_tags_and_country_punctuation_merge(self):
        aliases = player_stats._build_aliases(
            {"MS Dhoni (Asia/INDIA)", "MS Dhoni (INDIA)", "Rohan Mustafa (U.A.E.)", "Rohan Mustafa (UAE)"},
            {"MS Dhoni (INDIA)", "Rohan Mustafa (UAE)"},
        )
        self.assertEqual(aliases["MS Dhoni (Asia/INDIA)"], "MS Dhoni (INDIA)")
        self.assertEqual(aliases["Rohan Mustafa (U.A.E.)"], "Rohan Mustafa (UAE)")

    def test_distinct_namesakes_and_numbered_identities_stay_separate(self):
        names = {"Rashid Khan (AFG)", "Rashid Khan (2) (NEPAL)", "Imran Khan (PAK)",
                 "Imran Khan (1) (PAK)", "A Player (INDIA)", "A Player (PAK)"}
        self.assertEqual(len(set(player_stats._build_aliases(names, names).values())), len(names))

    def test_national_switch_requires_explicit_shared_tag(self):
        names = {"EJG Morgan (ENG)", "EJG Morgan (ENG/IRE)"}
        aliases = player_stats._build_aliases(names, {"EJG Morgan (ENG)"})
        self.assertEqual(set(aliases.values()), {"EJG Morgan (ENG)"})

    def test_largest_total_is_retained_not_added(self):
        frame = pd.DataFrame({"Player": ["MS Dhoni (Asia/INDIA)", "MS Dhoni (INDIA)"], "Runs": [10773, 10599]})
        result = player_stats._canonical_rows(frame, "Player", "Runs")
        self.assertEqual(len(result), 1)
        self.assertEqual(result.iloc[0]["Runs"], 10773)

    def test_real_dhoni_search_and_alias_profiles(self):
        self.assertEqual(player_stats.search_players("dhoni"), ["MS Dhoni (INDIA)"])
        canonical = player_stats.get_player_profile("MS Dhoni (INDIA)")
        alias = player_stats.get_player_profile("MS Dhoni (Asia/INDIA)")
        self.assertEqual(canonical, alias)
        self.assertGreaterEqual(canonical["batting"]["ODI"]["runs"], 10773)

    def test_route_rejects_same_player_via_alias(self):
        with self.assertRaises(HTTPException) as error:
            player_comparison.compare(player_comparison.ComparePlayersRequest(
                player_a="MS Dhoni (Asia/INDIA)", player_b="MS Dhoni (INDIA)"))
        self.assertEqual(error.exception.status_code, 400)


if __name__ == "__main__":
    unittest.main()