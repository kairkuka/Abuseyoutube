from __future__ import annotations

import argparse
import time

from app import like_monitor


def main() -> None:
    parser = argparse.ArgumentParser(description="Run StreamScribe's YouTube like monitor.")
    parser.add_argument("url")
    args = parser.parse_args()
    like_monitor.start(args.url)
    try:
        while like_monitor.running:
            time.sleep(1)
    except KeyboardInterrupt:
        pass
    finally:
        like_monitor.stop()


if __name__ == "__main__":
    main()
