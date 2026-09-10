#!/usr/bin/env python3
"""Stage the reviewed Trilogy follow-up on the existing Hermes board. No dispatch."""
import argparse
import datetime
import json
import sqlite3
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
DB = Path('/home/tom/.hermes/kanban.db')
p = argparse.ArgumentParser(description=__doc__)
p.add_argument('--apply', action='store_true', help='Write blocked cards; otherwise only validate and preview')
args = p.parse_args()
payload = json.loads((HERE / 'kanban-cards.json').read_text())
assert payload['board'] == 'default'
assert payload['namespace'] == 'trilogy-inner-review-20260909'
assert Path(payload['review']).is_file()
cards = payload['cards']
seen = set()
for card in cards:
    assert card['key'] not in seen
    assert set(card['depends_on']) <= seen, 'Parents must precede children'
    assert card['initial_status'] == 'blocked'
    assert card['work'] and card['acceptance']
    seen.add(card['key'])
assert len(cards) == 10

with sqlite3.connect(f'file:{DB}?mode=ro', uri=True) as c:
    existing = dict(c.execute('SELECT idempotency_key,id FROM tasks WHERE idempotency_key LIKE ? AND status != ?', (payload['namespace'] + ':%', 'archived')).fetchall())
print(json.dumps({'mode': 'apply' if args.apply else 'dry-run', 'board': str(DB), 'cards': len(cards), 'existing': len(existing), 'initial_status': 'blocked', 'dispatch': False}))
if not args.apply:
    for card in cards:
        print(f"{card['key']}: {card['title']} (after {','.join(card['depends_on']) or 'none'})")
    sys.exit(0)

sys.path.insert(0, '/home/tom/.hermes/hermes-agent')
from hermes_cli import kanban_db as kb

conn = sqlite3.connect(str(DB))
conn.row_factory = sqlite3.Row
conn.execute('PRAGMA busy_timeout = 8000')
ids = {}
with kb.write_txn(conn):
    for card in cards:
        body = '\n'.join([
            'PLAN STAGED ONLY. Do not execute until Tom asks to start this follow-up.',
            f"Canonical plan: {HERE / 'PLAN.md'}",
            f"Audit and evidence: {HERE / 'REVIEW.md'}",
            f"Repository: {payload['repository']}",
            'Scope: Trilogy newsletter pages 2 and 3. Existing outer pages remain fixed.',
            'Integrate each accepted change into the candidate branch before the next card. Completion requires tested integrated SHA and rendered evidence, not just a branch or worker summary.',
            'No deployment is authorized by this card import. Preserve prior approvals, completed tasks, and existing untracked work. Keep provider/model choices under the established Hermes user configuration.',
            f"Related existing tasks: {', '.join(card['related_existing_tasks'])}",
            f"Target files/components: {', '.join(card['files'])}",
            f"Relative size: {card['size']}",
            '', 'Work:', *[f'{i}. {s}' for i,s in enumerate(card['work'], 1)],
            '', 'Acceptance:', *['- ' + s for s in card['acceptance']],
        ])
        task_id = kb.create_task(
            conn, title=f"Trilogy {card['key']}: {card['title']}", body=body,
            assignee=card['assignee'], created_by='codex-trilogy-review',
            workspace_kind='dir', workspace_path=payload['repository'],
            priority=card['priority'], parents=[ids[k] for k in card['depends_on']],
            idempotency_key=payload['namespace'] + ':' + card['key'],
            initial_status='blocked', board='default',
        )
        ids[card['key']] = task_id
    rows = [dict(conn.execute('SELECT id,title,status,worker_pid,claim_lock FROM tasks WHERE id=?', (v,)).fetchone()) for v in ids.values()]
    assert all(r['status'] == 'blocked' and r['worker_pid'] is None and r['claim_lock'] is None for r in rows), 'Cards must remain parked; transaction rolled back'
conn.close()
with sqlite3.connect(f'file:{DB}?mode=ro', uri=True) as c:
    states = {task_id: c.execute('SELECT status,worker_pid,claim_lock FROM tasks WHERE id=?', (task_id,)).fetchone() for task_id in ids.values()}
assert all(s == ('blocked', None, None) for s in states.values()), states
manifest = {'createdAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'board':str(DB),'namespace':payload['namespace'],'taskIds':ids,'states':states,'workersStarted':False}
(HERE / 'hermes-import-manifest.json').write_text(json.dumps(manifest, indent=2)+'\n')
print(json.dumps(manifest, indent=2))
