// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import {
  ATTENDANCE_ERROR_MESSAGES,
  mapAttendanceError,
} from '../utils/attendanceErrorMapper';
import Attendance from '../pages/Attendance';
import attendanceService from '../services/attendanceService';

vi.mock('../context/AuthContext', () => ({
  useAuthContext: () => ({
    user: { id: 10, employee_id: 5, roles: ['Employee'] },
    employeeId: 5,
  }),
}));

vi.mock('../services/attendanceService', () => {
  const mockService = {
    getTodayState: vi.fn(),
    getAttendanceList: vi.fn(),
    checkIn: vi.fn(),
    checkOut: vi.fn(),
    getMyAttendanceCorrections: vi.fn(),
    getPendingAttendanceCorrections: vi.fn(),
  };
  return {
    default: mockService,
    ...mockService,
  };
});

describe('mapAttendanceError', () => {
  const duplicateSqlError = {
    response: {
      status: 500,
      data: {
        message:
          "DB Error: SQLSTATE[23000]: Integrity constraint violation: 1062 Duplicate entry '5-2026-11-10' for key 'attendances.attendances_employee_id_attendance_date_unique'",
      },
    },
  };

  it('maps duplicate entry without completed check-in/out to Case 1', () => {
    const result = mapAttendanceError(duplicateSqlError, {
      action: 'check_in',
      attendanceState: null,
    });
    expect(result).toBe(ATTENDANCE_ERROR_MESSAGES.ALREADY_RECORDED);
    expect(result).not.toMatch(/SQLSTATE|1062|DB Error/i);
  });

  it('maps already checked in error to Case 2', () => {
    const activeErr = {
      response: {
        status: 400,
        data: { message: 'Already checked in (active session in progress)' },
      },
    };
    expect(
      mapAttendanceError(activeErr, {
        action: 'check_in',
        attendanceState: { check_in: '2026-11-10 09:00:00', check_out: null },
      })
    ).toBe(ATTENDANCE_ERROR_MESSAGES.ALREADY_CHECKED_IN);

    expect(
      mapAttendanceError(duplicateSqlError, {
        action: 'check_in',
        attendanceState: { check_in: '2026-11-10 09:00:00', check_out: null },
      })
    ).toBe(ATTENDANCE_ERROR_MESSAGES.ALREADY_CHECKED_IN);
  });

  it('maps duplicate entry after completed check-in and check-out to Case 3', () => {
    const result = mapAttendanceError(duplicateSqlError, {
      action: 'check_in',
      attendanceState: {
        check_in: '2026-11-10 09:00:00',
        check_out: '2026-11-10 18:00:00',
      },
    });
    expect(result).toBe(ATTENDANCE_ERROR_MESSAGES.ALREADY_COMPLETED);
  });
});

describe('Attendance page notifications & duplicate punch-in handling', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    attendanceService.getAttendanceList.mockResolvedValue({
      data: [],
      current_page: 1,
      last_page: 1,
      total: 0,
    });
    attendanceService.getMyAttendanceCorrections.mockResolvedValue({ data: [] });
    attendanceService.getPendingAttendanceCorrections.mockResolvedValue({ data: [] });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('supports normal Punch In and Punch Out with 4-second auto-dismissing success banners', async () => {
    attendanceService.getTodayState.mockResolvedValue({ today_attendance: null });
    attendanceService.checkIn.mockResolvedValue({
      message: 'Checked in successfully',
      attendance: {
        id: 42,
        attendance_date: '2026-11-10',
        check_in: '2026-11-10T09:00:00',
        check_out: null,
        status: 'Present',
      },
    });
    attendanceService.checkOut.mockResolvedValue({
      message: 'Checked out successfully',
      attendance: {
        id: 42,
        attendance_date: '2026-11-10',
        check_in: '2026-11-10T09:00:00',
        check_out: '2026-11-10T18:00:00',
        working_minutes: 540,
        status: 'Present',
      },
    });

    await act(async () => {
      render(<Attendance />);
    });

    // Normal Punch In
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Punch In' }));
    });
    expect(screen.getByText('Checked in successfully')).toBeTruthy();

    // Verify 1s clock ticks do NOT reset timer and banner vanishes after 4s
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(screen.getByText('Checked in successfully')).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.queryByText('Checked in successfully')).toBeNull();

    // Normal Punch Out
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Punch Out' }));
    });
    expect(screen.getByText('Checked out successfully')).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(4000);
    });
    expect(screen.queryByText('Checked out successfully')).toBeNull();
  });

  it('shows friendly duplicate error instead of raw SQLSTATE and auto-dismisses after 6 seconds', async () => {
    attendanceService.getTodayState.mockResolvedValue({
      today_attendance: {
        id: 42,
        attendance_date: '2026-11-10',
        check_in: '2026-11-10T09:00:00',
        check_out: '2026-11-10T18:00:00',
        working_minutes: 540,
        status: 'Present',
      },
    });

    attendanceService.checkIn.mockRejectedValue({
      response: {
        status: 500,
        data: {
          message:
            "DB Error: SQLSTATE[23000]: Integrity constraint violation: 1062 Duplicate entry '5-2026-11-10' for key 'attendances.attendances_employee_id_attendance_date_unique'",
        },
      },
    });

    await act(async () => {
      render(<Attendance />);
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Punch In' }));
    });

    expect(
      screen.getByText(ATTENDANCE_ERROR_MESSAGES.ALREADY_COMPLETED)
    ).toBeTruthy();
    expect(screen.queryByText(/SQLSTATE|1062|DB Error/i)).toBeNull();

    // Still present at 5s, disappears at 6s despite live clock ticks every 1s
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(
      screen.getByText(ATTENDANCE_ERROR_MESSAGES.ALREADY_COMPLETED)
    ).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(
      screen.queryByText(ATTENDANCE_ERROR_MESSAGES.ALREADY_COMPLETED)
    ).toBeNull();

    // Repeat click restarts timer and can be dismissed manually with X
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Punch In' }));
    });
    expect(
      screen.getByText(ATTENDANCE_ERROR_MESSAGES.ALREADY_COMPLETED)
    ).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /close notification/i }));
    expect(
      screen.queryByText(ATTENDANCE_ERROR_MESSAGES.ALREADY_COMPLETED)
    ).toBeNull();
  });
});

