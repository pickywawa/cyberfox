import { test } from 'node:test';
import assert from 'node:assert/strict';
import { replayProposal } from '../electron/proposal-replay.js';
import { makeNode } from '../shared/model.js';

test('replay rechecks guards, skips failed guards and runs their configured children', async () => {
  const check = makeNode('test', 'Guard', ['android']);
  const action = makeNode('action', 'Guarded', ['android']);
  const fallback = makeNode('test', 'Fallback', ['android']);
  action.preconditionId = check.id;
  action.childrenOnPreconditionFailure = true;
  action.children = [fallback];
  let calls = 0;
  const events: any[] = [];
  await replayProposal(
    [check, action],
    'android',
    async () => {
      if (++calls === 2) throw new Error('Guard changed');
    },
    async (e) => {
      events.push(e);
    },
    new AbortController().signal,
  );
  assert.equal(calls, 3);
  assert.ok(events.some((e) => e.nodeId === action.id && e.status === 'skipped'));
  assert.ok(events.some((e) => e.nodeId === fallback.id && e.status === 'passed'));
});

test('blocking failures prevent later replay actions', async () => {
  const action = makeNode('action', 'Blocking', ['android']);
  action.blocking = true;
  const later = makeNode('test', 'Later', ['android']);
  let calls = 0;
  await assert.rejects(
    replayProposal(
      [action, later],
      'android',
      async () => {
        calls++;
        throw new Error('broken');
      },
      async () => {},
      new AbortController().signal,
    ),
    /broken/,
  );
  assert.equal(calls, 1);
});
