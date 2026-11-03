import unittest
from unittest.mock import Mock, patch

import httpx

from telegram_client import TelegramClient, TelegramError


class TelegramClientTests(unittest.TestCase):
    @patch("telegram_client.httpx.post")
    def test_send_html_uses_target_chat(self, post: Mock) -> None:
        post.return_value.json.return_value = {"ok": True, "result": {}}
        client = TelegramClient("1234567890:abcdefghijklmnopqrstuvwxyz", "998877")
        client.send_html("<b>Giveaway detected</b>")

        _, kwargs = post.call_args
        self.assertEqual(kwargs["json"]["chat_id"], "998877")
        self.assertEqual(kwargs["json"]["parse_mode"], "HTML")

    @patch("telegram_client.httpx.post")
    def test_network_error_does_not_expose_bot_token(self, post: Mock) -> None:
        token = "1234567890:super-secret-token"
        post.side_effect = httpx.ConnectError("connection refused")
        client = TelegramClient(token, "998877")

        with self.assertRaises(TelegramError) as raised:
            client.send_html("test")
        self.assertNotIn(token, str(raised.exception))


if __name__ == "__main__":
    unittest.main()
