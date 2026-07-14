#!/usr/bin/env python3
"""
garmin_login.py — ONE-TIME interactive Garmin login, run on the HOST.

Produces the OAuth token store that push_to_garmin.py loads inside the coach
container. Your Garmin password is used only for this login and is never
stored — only the refreshable tokens are written to disk.

Usage (host, interactive TTY required for MFA):

    python garmin_login.py [--tokenstore <dir>]

You'll be prompted for email, password, and (if enabled) an MFA code. On
success it writes the token store and prints its path. Mount that directory
into the coach container at /workspace/agent/.garminconnect (the container's
GARMIN_TOKENSTORE default).
"""

from __future__ import annotations

import argparse
import getpass
import sys


def main() -> int:
    parser = argparse.ArgumentParser(description="One-time Garmin login → token store")
    parser.add_argument(
        "--tokenstore",
        default=None,
        help="Directory to write the token store (default: the coach group's .garminconnect)",
    )
    args = parser.parse_args()

    try:
        from garminconnect import Garmin
    except ImportError:
        print("garminconnect is not installed in this interpreter.", file=sys.stderr)
        print("Run with the venv that has it, e.g. gcvenv/bin/python garmin_login.py", file=sys.stderr)
        return 2

    tokenstore = args.tokenstore or "./.garminconnect"

    email = input("Garmin email: ").strip()
    password = getpass.getpass("Garmin password: ")

    # prompt_mfa is called only if Garmin requires a code for this login.
    def prompt_mfa() -> str:
        return input("MFA code (from your authenticator/email): ").strip()

    client = Garmin(email, password, prompt_mfa=prompt_mfa)
    try:
        client.login(tokenstore)
    except Exception as e:
        print(f"Login failed: {e}", file=sys.stderr)
        return 1

    print(f"\n✅ Logged in. Token store written to: {tokenstore}")
    print("Mount this directory into the coach container at /workspace/agent/.garminconnect")
    return 0


if __name__ == "__main__":
    sys.exit(main())
