import unittest
from concurrent.futures import ThreadPoolExecutor
from unittest.mock import Mock, patch

import requests
from fastapi import HTTPException

from backend import main
from src import cricapi_client as client


class LiveDataTests(unittest.TestCase):
    def setUp(self):
        client._cache.clear()
        self.payload = {"data": [{"id": "fixture", "teams": ["India", "Australia"], "matchType": "t20", "matchStarted": False, "matchEnded": False, "dateTimeGMT": "2026-09-10T14:00:00"}]}

    def tearDown(self):
        client._cache.clear()

    def test_feed_is_cached_with_original_timestamp(self):
        with patch.object(client, "_get", return_value=self.payload) as fetch:
            first = client.get_current_matches_feed("test")
            second = client.get_current_matches_feed("test")
            self.assertEqual(first, second)
            self.assertEqual(first["refresh_after_seconds"], 300)
            self.assertTrue(first["fetched_at"].endswith("+00:00"))
            self.assertEqual(client.get_current_matches("test"), first["matches"])
            self.assertEqual(fetch.call_count, 1)

    def test_concurrent_readers_share_one_fetch(self):
        with patch.object(client, "_get", return_value=self.payload) as fetch:
            with ThreadPoolExecutor(max_workers=4) as executor:
                results = list(executor.map(client.get_current_matches_feed, ["test"] * 8))
            self.assertEqual(fetch.call_count, 1)
            self.assertTrue(all(result == results[0] for result in results))

    def test_cache_expires_and_is_scoped_to_api_key(self):
        with patch.object(client, "_get", return_value=self.payload) as fetch, patch.object(client.time, "monotonic", return_value=0) as clock:
            client.get_current_matches_feed("first")
            client.get_current_matches_feed("second")
            clock.return_value = 301
            client.get_current_matches_feed("first")
            self.assertEqual(fetch.call_count, 3)

    def test_failures_are_cached(self):
        with patch.object(client, "_get", side_effect=client.CricApiError("quota", 429)) as fetch:
            for attempt in range(2):
                with self.assertRaises(client.CricApiError):
                    client.get_current_matches_feed("test")
            self.assertEqual(fetch.call_count, 1)

    def test_malformed_matches_are_not_reported_as_an_empty_feed(self):
        with patch.object(client, "_get", return_value={"data": None}):
            with self.assertRaises(client.CricApiError):
                client.get_current_matches_feed("test")

    def test_upstream_errors_do_not_expose_credentials(self):
        with patch.object(client.requests, "get", side_effect=requests.HTTPError("https://api.cricapi.com?apikey=secret")):
            with self.assertRaises(client.CricApiError) as error:
                client._get("currentMatches", "secret")
            self.assertNotIn("secret", str(error.exception))

    def test_string_quota_values_map_to_429(self):
        response = Mock()
        response.json.return_value = {"status": "failure", "info": {"hitsToday": "100", "hitsLimit": "100"}}
        with patch.object(client.requests, "get", return_value=response):
            with self.assertRaises(client.CricApiError) as error:
                client._get("currentMatches", "test")
            self.assertEqual(error.exception.status_code, 429)

    def test_route_preserves_flags_timestamp_and_historical_basis(self):
        with patch.object(main, "CRICAPI_KEY", "test"), patch.object(client, "_get", return_value=self.payload):
            result = main.live_matches()
            match = result["matches"][0]
            self.assertFalse(match["match_started"])
            self.assertFalse(match["match_ended"])
            self.assertEqual(match["start_time"], "2026-09-10T14:00:00+00:00")
            self.assertEqual(match["prediction"]["basis"], "historical_series")
            self.assertEqual(result["source"], "CricAPI")

    def test_route_propagates_quota_and_retry_after(self):
        with patch.object(main, "CRICAPI_KEY", "test"), patch.object(client, "get_current_matches_feed", side_effect=client.CricApiError("quota exceeded", 429)):
            with self.assertRaises(HTTPException) as error:
                main.live_matches()
            self.assertEqual(error.exception.status_code, 429)
            self.assertEqual(error.exception.headers["Retry-After"], "300")

    def test_missing_key_is_explicit(self):
        with patch.object(main, "CRICAPI_KEY", ""):
            with self.assertRaises(HTTPException) as error:
                main.live_matches()
            self.assertEqual(error.exception.status_code, 400)


if __name__ == "__main__":
    unittest.main()