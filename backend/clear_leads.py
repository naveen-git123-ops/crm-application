#!/usr/bin/env python3
"""Clear all lead data and related rows (activities, history, reminders, attachments)."""
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
    'lead_activities',
    'lead_status_history',
    'lead_reminders',
    'lead_attachments',
    'leads',
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

        # Unlink orders from leads (keep order records)
        if table_exists(connection, 'orders'):
            r = connection.execute(text('SELECT COUNT(*) FROM orders WHERE lead_id IS NOT NULL'))
            linked = r.scalar() or 0
            if linked:
                connection.execute(text('UPDATE orders SET lead_id = NULL WHERE lead_id IS NOT NULL'))
                print(f'  orders: cleared lead_id on {linked} row(s)')

        if DATABASE_URL.startswith('mysql'):
            connection.execute(text('SET FOREIGN_KEY_CHECKS = 1'))

        print(f'Done. Removed {total_deleted} lead-related row(s).')
except Exception as e:
    print(f'Error: {e}')
    sys.exit(1)
