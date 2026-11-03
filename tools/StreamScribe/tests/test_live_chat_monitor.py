from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

from live_chat_monitor import YouTubeLiveChatClient, extract_form_urls, normalize_form_url


class FormUrlTests(unittest.TestCase):
    def test_extracts_direct_and_redirected_google_forms(self) -> None:
        text = "Form: forms.gle/AbC_123"
        redirect = "https://www.youtube.com/redirect?q=https%3A%2F%2Fdocs.google.com%2Fforms%2Fd%2Fabc%2Fviewform"
        self.assertEqual(
            extract_form_urls(text, [redirect]),
            [
                "https://docs.google.com/forms/d/abc/viewform",
                "https://forms.gle/AbC_123",
            ],
        )

    def test_rejects_non_form_links(self) -> None:
        self.assertIsNone(normalize_form_url("https://example.com/form"))

    def test_parses_message_and_continuation(self) -> None:
        client = YouTubeLiveChatClient("https://www.youtube.com/watch?v=QLpyWgyowQE")
        payload = {
            "continuationContents": {
                "liveChatContinuation": {
                    "continuations": [{"timedContinuationData": {"continuation": "next-token", "timeoutMs": 1000}}],
                    "actions": [{
                        "addChatItemAction": {
                            "item": {
                                "liveChatTextMessageRenderer": {
                                    "id": "message-1",
                                    "timestampUsec": "123456",
                                    "authorName": {"simpleText": "@TradeifyTV"},
                                    "message": {"runs": [{"text": "https://forms.gle/Test123"}]},
                                }
                            }
                        }
                    }],
                }
            }
        }
        messages, timeout_ms = client.parse_poll_response(payload)
        self.assertEqual(timeout_ms, 1000)
        self.assertEqual(client.continuation, "next-token")
        self.assertEqual(messages[0].author, "@TradeifyTV")
        self.assertEqual(messages[0].urls, ["https://forms.gle/Test123"])


if __name__ == "__main__":
    unittest.main()
