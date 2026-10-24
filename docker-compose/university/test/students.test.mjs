import test from 'node:test';
import assert from 'node:assert/strict';
import {authenticateStudent, studentRecord} from '../students.mjs';

test('college authentication selects Nisha\'s registered record, independently of a wallet profile', () => {
  const account = authenticateStudent('nisha', 'nisha-local-password');
  assert.equal(account, 'nisha');
  assert.equal(studentRecord(account).fullName, 'Nisha Gurung');
  assert.equal(studentRecord(account).studentId, 'HU-2026-0002');
  assert.equal(studentRecord('student').fullName, 'Aarav Sharma');
  assert.equal(studentRecord('alumni').enrollmentStatus, 'graduated');
});

test('unregistered users and mismatched student passwords cannot obtain a registered identity', () => {
  assert.equal(authenticateStudent('nisha', 'student-local-password'), null);
  assert.equal(authenticateStudent('unknown', 'nisha-local-password'), null);
  assert.equal(authenticateStudent('toString', 'anything'), null);
  assert.throws(() => studentRecord('unknown'), /No registered student/);
});
