from datetime import datetime, timedelta, timezone
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

from core import (
    LikeMilestoneTracker,
    TranscriptStore,
    TriggerDetector,
    build_alert_html,
    compile_trigger_pattern,
    highlight_trigger_html,
    validate_youtube_url,
)
from telegram_client import TelegramClient


class LikeMilestoneTrackerTests(unittest.TestCase):
    def test_alerts_on_new_hundreds_and_persists(self) -> None:
        with TemporaryDirectory() as directory:
            state_file = Path(directory) / "likes.json"
            tracker = LikeMilestoneTracker(state_file, step=100, target=600)
            self.assertEqual(tracker.observe("video-one", 550), [])
            self.assertEqual(tracker.observe("video-one", 599), [])
            self.assertEqual(tracker.observe("video-one", 605), [600])
            self.assertEqual(tracker.observe("video-one", 710), [700])
            self.assertEqual(tracker.observe("video-one", 690), [])

            reloaded = LikeMilestoneTracker(state_file, step=100, target=600)
            self.assertEqual(reloaded.observe("video-one", 720), [])
            self.assertEqual(reloaded.highest("video-one"), 720)

    def test_fresh_video_above_target_sends_only_target(self) -> None:
        with TemporaryDirectory() as directory:
            tracker = LikeMilestoneTracker(Path(directory) / "likes.json", step=100, target=600)
            self.assertEqual(tracker.observe("video-two", 620), [600])
            self.assertEqual(tracker.observe("video-two", 705), [700])


class TriggerDetectorTests(unittest.TestCase):
    def test_matches_whole_word_case_insensitively(self) -> None:
        detector = TriggerDetector(["giveaway"], cooldown_seconds=90)
        self.assertEqual(detector.match("Our GIVEAWAY starts now"), "GIVEAWAY")

    def test_does_not_match_inside_word(self) -> None:
        detector = TriggerDetector(["giveaway"], cooldown_seconds=0)
        self.assertEqual(detector.match("giveaways are plural"), "giveaways")
        self.assertIsNone(detector.match("preGiveawaySuffix"))

    def test_cooldown_suppresses_repeat(self) -> None:
        detector = TriggerDetector(["giveaway"], cooldown_seconds=90)
        now = datetime(2026, 8, 21, tzinfo=timezone.utc)
        self.assertEqual(detector.match("giveaway", now), "giveaway")
        self.assertIsNone(detector.match("giveaway again", now + timedelta(seconds=30)))
        self.assertEqual(detector.match("giveaway again", now + timedelta(seconds=91)), "giveaway")

    def test_html_highlight_escapes_context(self) -> None:
        pattern = compile_trigger_pattern(["giveaway"])
        result = highlight_trigger_html("<tag> giveaway", pattern)
        self.assertEqual(result, "&lt;tag&gt; <b>giveaway</b>")

    def test_youtube_url_validation_blocks_non_youtube_hosts(self) -> None:
        valid = "https://www.youtube.com/watch?v=MihqTPiu1oE"
        self.assertEqual(validate_youtube_url(valid), valid)
        with self.assertRaisesRegex(ValueError, "valid HTTPS YouTube URL"):
            validate_youtube_url("https://example.com/watch?v=MihqTPiu1oE")
        with self.assertRaisesRegex(ValueError, "identify a video"):
            validate_youtube_url("https://www.youtube.com/")


class StoreTests(unittest.TestCase):
    def test_context_and_alert_message(self) -> None:
        with TemporaryDirectory() as directory:
            store = TranscriptStore(Path(directory))
            store.start_session("Creator live")
            first = store.add_transcript("We are nearly ready.")
            second = store.add_transcript("The giveaway begins now.")
            self.assertIsNotNone(first)
            self.assertIsNotNone(second)
            detector = TriggerDetector(["giveaway"], cooldown_seconds=0)
            store.mark_trigger(second.id, "giveaway")
            message = build_alert_html(
                "giveaway", store.source, store.recent_context(4, second.id), detector.pattern
            )
            self.assertIn("We are nearly ready.", message)
            self.assertIn("<b>giveaway</b>", message)
            self.assertIn("Creator live", message)

            alert = store.add_alert(second.id, "giveaway", second.text, delivered=True)
            self.assertEqual(alert.entry_id, second.id)
            self.assertTrue(alert.delivered)


class TelegramClientTests(unittest.TestCase):
    def test_message_header_is_prepended_and_escaped(self) -> None:
        client = TelegramClient("x" * 20, "123", header="LUCID <STREAM>")
        captured = {}

        def fake_request(method, payload):
            captured["method"] = method
            captured["payload"] = payload
            return {"ok": True}

        client._request = fake_request
        client.send_html("<b>Giveaway detected</b>")

        self.assertEqual(captured["method"], "sendMessage")
        self.assertEqual(
            captured["payload"]["text"],
            "<b>LUCID &lt;STREAM&gt;</b>\n<b>Giveaway detected</b>",
        )


if __name__ == "__main__":
    unittest.main()
