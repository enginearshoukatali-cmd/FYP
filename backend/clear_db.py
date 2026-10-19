"""Delete all local user accounts after an explicit confirmation.

The database is backed up before any rows are removed. Run this script from
any working directory with --confirm to perform the deletion.
"""

import argparse
import sqlite3
from datetime import datetime
from pathlib import Path


BACKEND_DIR = Path(__file__).resolve().parent
DB_PATH = BACKEND_DIR / "khanmigo_fyp.db"


def clear_users() -> int:
    if not DB_PATH.is_file():
        raise FileNotFoundError(f"Database not found: {DB_PATH}")

    backup_dir = BACKEND_DIR / "backups" / f"pre-reset-{datetime.now():%Y%m%d-%H%M%S}"
    backup_dir.mkdir(parents=True, exist_ok=False)
    backup_path = backup_dir / DB_PATH.name

    with sqlite3.connect(DB_PATH) as connection:
        count = connection.execute("SELECT COUNT(*) FROM users").fetchone()[0]
        with sqlite3.connect(backup_path) as backup:
            connection.backup(backup)
        connection.execute("DELETE FROM users")

    print(f"Deleted {count} user account(s). Database backup: {backup_path}")
    return count


def main() -> None:
    parser = argparse.ArgumentParser(description="Delete all local user accounts.")
    parser.add_argument(
        "--confirm",
        action="store_true",
        help="confirm account deletion (a database backup is created first)",
    )
    args = parser.parse_args()
    if not args.confirm:
        parser.error("refusing to delete accounts without --confirm")
    clear_users()


if __name__ == "__main__":
    main()
