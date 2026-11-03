from __future__ import annotations

import argparse
import time

from app import chat_monitor


def main() -> None:
    parser = argparse.ArgumentParser(description="Run StreamScribe's live-chat Google Form monitor.")
    parser.add_argument("url")
    args = parser.parse_args()
    chat_monitor.start(args.url)
    try:
        while chat_monitor.running:
            time.sleep(1)
    except KeyboardInterrupt:
        pass
    finally:
        chat_monitor.stop()


if __name__ == "__main__":
    main()
