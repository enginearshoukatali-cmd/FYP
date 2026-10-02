import sqlite3

DB_NAME = "khanmigo_fyp.db"

def run_migration():
    conn = sqlite3.connect(DB_NAME)
    c = conn.cursor()

    print("Starting database migration...")

    # 1. Create a new robust users table
    c.execute('''CREATE TABLE IF NOT EXISTS users_new (
        user_id INTEGER PRIMARY KEY AUTOINCREMENT,
        full_name TEXT,
        email TEXT UNIQUE,
        password TEXT,
        role TEXT,
        institution_mode TEXT,
        email_verified INTEGER DEFAULT 0,
        date_of_birth TEXT,
        student_id TEXT UNIQUE,
        employee_id TEXT UNIQUE,
        qualification TEXT,
        degree TEXT,
        specialization TEXT,
        teaching_level TEXT,
        years_experience INTEGER,
        designation TEXT,
        program TEXT,
        department TEXT,
        semester TEXT,
        grade TEXT,
        section TEXT,
        phone TEXT,
        account_status TEXT DEFAULT 'active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )''')

    # 2. Safely copy existing users (setting them as verified to not break them)
    try:
        c.execute('''INSERT INTO users_new (user_id, full_name, email, password, role, institution_mode, email_verified)
                     SELECT user_id, full_name, email, password, role, institution_mode, 1 FROM users''')
    except sqlite3.OperationalError:
        print("Existing users table missing or already migrated.")

    # 3. Swap tables
    c.execute("DROP TABLE IF EXISTS users")
    c.execute("ALTER TABLE users_new RENAME TO users")

    # 4. Create OTPs table for verification and password reset
    c.execute('''CREATE TABLE IF NOT EXISTS otps (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT,
        otp TEXT,
        purpose TEXT,
        expires_at TIMESTAMP
    )''')

    # 5. Create Invitations table for Staff and Teachers
    c.execute('''CREATE TABLE IF NOT EXISTS institution_invitations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        token TEXT UNIQUE,
        role TEXT,
        institution_name TEXT,
        expires_at TIMESTAMP,
        is_used INTEGER DEFAULT 0,
        created_by INTEGER
    )''')

    conn.commit()
    conn.close()
    print("Migration complete! Database is now secured and upgraded.")

if __name__ == "__main__":
    run_migration()