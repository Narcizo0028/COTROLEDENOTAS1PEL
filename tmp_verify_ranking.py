import sqlite3
import server

conn = server.connect()
conn.row_factory = sqlite3.Row
conn.execute('BEGIN')

def user_summary(student_id):
    rows = server.ranking(conn)
    row = next((item for item in rows if item['id'] == student_id), None)
    return row

before = user_summary('1870179')
print('BEFORE', before)

conn.execute('UPDATE scores SET exam1=2.5 WHERE student_id=? AND subject_id=?', ('1870179', 20))
after = user_summary('1870179')
print('AFTER', after)

conn.rollback()
restored = user_summary('1870179')
print('RESTORED', restored)

row = conn.execute('SELECT exam1 FROM scores WHERE student_id=? AND subject_id=?', ('1870179', 20)).fetchone()
print('ROW', row['exam1'] if row else None)
conn.close()
