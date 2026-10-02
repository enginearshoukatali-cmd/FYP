import sqlite3

# Database se connect karein
conn = sqlite3.connect("khanmigo_fyp.db")
c = conn.cursor()

# Users table ka sara data delete karein
c.execute("DELETE FROM users")
conn.commit()
conn.close()

print("✅ All users and emails have been deleted successfully!")