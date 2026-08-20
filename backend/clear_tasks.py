#!/usr/bin/env python3
"""Delete all Tasks-screen records and related rows."""
import os
import sys
from sqlalchemy import create_engine, text
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.environ.get('DATABASE_URL')
if not DATABASE_URL:
    print('DATABASE_URL not found in .env')
    sys.exit(1)

TABLES_IN_ORDER = [
    'task_attachments',
    'task_time_logs',
    'task_comments',
    'task_approvals',
    'tasks',
]


def table_exists(connection, name: str) -> bool:
    if DATABASE_URL.startswith('mysql'):
        r = connection.execute(
            text(
                'SELECT COUNT(*) FROM information_schema.tables '
                'WHERE table_schema = DATABASE() AND table_name = :t'
            ),
            {'t': name},
        )
    else:
        r = connection.execute(
            text(
                "SELECT COUNT(*) FROM information_schema.tables "
                "WHERE table_schema = 'public' AND table_name = :t"
            ),
            {'t': name},
        )
    return (r.scalar() or 0) > 0


def count_rows(connection, name: str) -> int:
    r = connection.execute(text(f'SELECT COUNT(*) FROM {name}'))
    return r.scalar() or 0


print('Connecting to database...')
try:
    engine = create_engine(DATABASE_URL)
    with engine.begin() as connection:
        if DATABASE_URL.startswith('mysql'):
            connection.execute(text('SET FOREIGN_KEY_CHECKS = 0'))

        total_deleted = 0
        for table in TABLES_IN_ORDER:
            if not table_exists(connection, table):
                print(f'  skip {table} (table not found)')
                continue
            before = count_rows(connection, table)
            if before == 0:
                print(f'  {table}: already empty')
                continue
            connection.execute(text(f'DELETE FROM {table}'))
            print(f'  {table}: deleted {before} row(s)')
            total_deleted += before

        if DATABASE_URL.startswith('mysql'):
            connection.execute(text('SET FOREIGN_KEY_CHECKS = 1'))

        remaining = count_rows(connection, 'tasks') if table_exists(connection, 'tasks') else 0
        print(f'Done. Removed {total_deleted} task-related row(s). Tasks remaining: {remaining}')
except Exception as e:
    print(f'Error: {e}')
    sys.exit(1)
