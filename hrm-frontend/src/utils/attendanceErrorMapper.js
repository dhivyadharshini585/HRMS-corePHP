export const ATTENDANCE_ERROR_MESSAGES = {
  ALREADY_RECORDED:
    'Attendance for today has already been recorded. You cannot create another attendance entry for the same date.',
  ALREADY_CHECKED_IN:
    'You are already checked in. Please complete your check-out before attempting another attendance action.',
  ALREADY_COMPLETED:
    'You have already completed your attendance for today. Duplicate attendance entries are not allowed.',
};

export function extractApiErrorMessage(err, fallback = '') {
  if (!err) return fallback;
  if (typeof err === 'string') return err;

  const data = err.response?.data;
  if (data) {
    if (typeof data.message === 'string' && data.message.trim()) {
      return data.message;
    }
    if (typeof data.error === 'string' && data.error.trim()) {
      return data.error;
    }
    if (data.errors && typeof data.errors === 'object') {
      const firstKey = Object.keys(data.errors)[0];
      const firstVal = data.errors[firstKey];
      if (Array.isArray(firstVal) && firstVal[0]) return String(firstVal[0]);
      if (typeof firstVal === 'string' && firstVal.trim()) return firstVal;
    }
  }

  if (typeof err.message === 'string' && err.message.trim()) {
    return err.message;
  }

  return fallback;
}

export function isRawDatabaseError(message) {
  if (!message || typeof message !== 'string') return false;
  return /db error|sqlstate|integrity constraint violation|1062\s+duplicate\s+entry|duplicate\s+entry.*for\s+key|pdoexception|attendances_employee_id_attendance_date_unique|syntax error or access violation|mysql/i.test(
    message
  );
}

export function isDuplicateAttendanceError(err, rawMessage = '') {
  const text = String(rawMessage || extractApiErrorMessage(err, '')).toLowerCase();
  const status = err?.response?.status;

  if (
    text.includes('attendances_employee_id_attendance_date_unique') ||
    text.includes('1062') ||
    text.includes('duplicate entry') ||
    text.includes('integrity constraint violation') ||
    text.includes('sqlstate[23000]') ||
    text.includes('already checked in') ||
    text.includes('active session in progress') ||
    text.includes('already recorded') ||
    text.includes('duplicate attendance')
  ) {
    return true;
  }

  if (status === 409 && (text.includes('attendance') || text.includes('already'))) {
    return true;
  }

  return false;
}

/**
 * Translates backend and database attendance errors into clear, user-friendly
 * messages without exposing raw SQL/PDO internals.
 */
export function mapAttendanceError(
  err,
  { action = 'check_in', attendanceState = null, fallback = '' } = {}
) {
  const raw = extractApiErrorMessage(err, '');
  const lower = raw.toLowerCase();

  const hasCheckIn = Boolean(attendanceState?.check_in);
  const hasCheckOut = Boolean(attendanceState?.check_out);

  // Case 2: Employee currently has an active check-in session (not yet checked out)
  if (lower.includes('already checked in') || lower.includes('active session in progress')) {
    return ATTENDANCE_ERROR_MESSAGES.ALREADY_CHECKED_IN;
  }

  if (isDuplicateAttendanceError(err, raw)) {
    if (action === 'check_in' && hasCheckIn && !hasCheckOut) {
      return ATTENDANCE_ERROR_MESSAGES.ALREADY_CHECKED_IN;
    }

    if ((hasCheckIn && hasCheckOut) || lower.includes('already checked out') || lower.includes('completed')) {
      return ATTENDANCE_ERROR_MESSAGES.ALREADY_COMPLETED;
    }

    return ATTENDANCE_ERROR_MESSAGES.ALREADY_RECORDED;
  }

  if (lower.includes('already checked out')) {
    return ATTENDANCE_ERROR_MESSAGES.ALREADY_COMPLETED;
  }

  // Guard against any other raw database / SQL exception leaking to end users
  if (isRawDatabaseError(raw)) {
    if (action === 'check_in') {
      return 'Unable to complete check-in right now. Please try again.';
    }
    if (action === 'check_out') {
      return 'Unable to complete check-out right now. Please try again.';
    }
    return fallback || 'Unable to process the attendance request right now. Please try again.';
  }

  if (raw) {
    return raw;
  }

  if (fallback) {
    return fallback;
  }

  if (action === 'check_in') return 'Check-in failed.';
  if (action === 'check_out') return 'Check-out failed.';
  return 'Unable to process attendance request.';
}

