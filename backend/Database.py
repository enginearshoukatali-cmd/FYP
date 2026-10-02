import os
import re
import sqlite3

DB_NAME = "khanmigo_fyp.db"
DATABASE_URL = os.environ.get('DATABASE_URL', '').strip()
POSTGRES_TABLES_WITH_ID = {
    'assignments',
    'assignment_submissions',
    'announcements',
    'attendance',
    'classroom_activities',
    'classes',
    'differentiation_plans',
    'enrollments',
    'exit_tickets',
    'lesson_plans',
    'parent_messages',
    'progress_reports',
    'quizzes',
    'quiz_attempts',
    'results',
    'student_groups',
    'teacher_resources',
    'teacher_rubrics',
    'timetable',
}


def postgres_sql(sql):
    statement = re.sub(
        r'\bINTEGER\s+PRIMARY\s+KEY\s+AUTOINCREMENT\b',
        'BIGSERIAL PRIMARY KEY',
        sql,
        flags=re.IGNORECASE,
    ).replace('?', '%s')
    match = re.match(
        r'\s*INSERT\s+INTO\s+([a-z_][a-z0-9_]*)\s*\(([^)]*)\)',
        statement,
        flags=re.IGNORECASE,
    )
    returning_id = False
    if match and match.group(1).lower() in POSTGRES_TABLES_WITH_ID:
        columns = {column.strip().strip('"').lower() for column in match.group(2).split(',')}
        if 'id' not in columns and not re.search(r'\bRETURNING\b', statement, re.IGNORECASE):
            statement = statement.rstrip().rstrip(';') + ' RETURNING id'
            returning_id = True
    return statement, returning_id


class PostgresCursor:
    def __init__(self, cursor, lastrowid=None):
        self._cursor = cursor
        self.lastrowid = lastrowid

    @property
    def rowcount(self):
        return self._cursor.rowcount

    def fetchone(self):
        return self._cursor.fetchone()

    def fetchall(self):
        return self._cursor.fetchall()


class PostgresConnection:
    def __init__(self, connection, psycopg):
        self._connection = connection
        self._psycopg = psycopg

    def execute(self, sql, parameters=()):
        statement, returning_id = postgres_sql(sql)
        try:
            cursor = self._connection.execute(statement, parameters)
            lastrowid = cursor.fetchone()['id'] if returning_id else None
            return PostgresCursor(cursor, lastrowid)
        except self._psycopg.IntegrityError as exc:
            raise sqlite3.IntegrityError(str(exc)) from exc

    def commit(self):
        self._connection.commit()

    def close(self):
        self._connection.close()

def get_connection(database_path=DB_NAME):
    if DATABASE_URL:
        import psycopg
        from psycopg.rows import dict_row

        conn = psycopg.connect(
            DATABASE_URL,
            row_factory=dict_row,
            connect_timeout=10,
        )
        return PostgresConnection(conn, psycopg)

    conn = sqlite3.connect(database_path)
    conn.row_factory = sqlite3.Row
    conn.execute('PRAGMA foreign_keys=ON')
    return conn


def get_columns(connection, table):
    if DATABASE_URL:
        rows = connection.execute(
            'SELECT column_name AS name FROM information_schema.columns '
            'WHERE table_schema = current_schema() AND table_name = ?',
            (table,),
        ).fetchall()
        return {row['name'] for row in rows}

    return {
        row['name']
        for row in connection.execute(f'PRAGMA table_info({table})').fetchall()
    }