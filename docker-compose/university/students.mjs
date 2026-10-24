import {student} from './credentials.mjs';

// Fictional registrar records. The college login selects the authoritative
// student record; a wallet profile cannot choose the name printed on an ID.
const accounts = new Map([
  ['student', {password: 'student-local-password', record: student}],
  ['nisha', {password: 'nisha-local-password', record: Object.freeze({
    ...student, studentId: 'HU-2026-0002', fullName: 'Nisha Gurung'
  })}],
  ['alumni', {password: 'student-local-password', record: Object.freeze({
    ...student, studentId: 'HU-2022-0062', fullName: 'Maya Tamang', enrollmentStatus: 'graduated'
  })}]
]);

export function authenticateStudent(username, password) {
  const account = accounts.get(username);
  return account && account.password === password ? username : null;
}

export function studentRecord(username) {
  const account = accounts.get(username);
  if(!account) throw Error('No registered student record');
  return account.record;
}
