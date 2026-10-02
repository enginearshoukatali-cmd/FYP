import sqlite3

DB_NAME = "khanmigo_fyp.db"

def get_connection():
    conn = sqlite3.connect(DB_NAME)
    conn.row_factory = sqlite3.Row
    return conn