// @vitest-environment jsdom
import React, { useState } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import AlertBanner from '../components/common/AlertBanner';
import { NotificationProvider } from '../context/NotificationContext';
import { useNotification } from '../hooks/useNotification';

describe('AlertBanner notification lifecycle & design', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('auto-dismisses success notifications after 4 seconds', () => {
    const onClose = vi.fn();
    render(<AlertBanner type="success" message="Saved successfully" onClose={onClose} />);

    expect(screen.getByText('Saved successfully')).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(3999);
    });
    expect(onClose).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('auto-dismisses info notifications after 4 seconds', () => {
    const onClose = vi.fn();
    render(<AlertBanner type="info" message="FYI update" onClose={onClose} />);

    act(() => {
      vi.advanceTimersByTime(3999);
    });
    expect(onClose).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('auto-dismisses error and warning notifications after 6 seconds', () => {
    const onErrorClose = vi.fn();
    const onWarnClose = vi.fn();
    render(
      <>
        <AlertBanner type="error" message="Something failed" onClose={onErrorClose} />
        <AlertBanner type="warning" message="Watch out" onClose={onWarnClose} />
      </>
    );

    act(() => {
      vi.advanceTimersByTime(5999);
    });
    expect(onErrorClose).not.toHaveBeenCalled();
    expect(onWarnClose).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onErrorClose).toHaveBeenCalledTimes(1);
    expect(onWarnClose).toHaveBeenCalledTimes(1);
  });

  it('allows manual dismissal with the close button and cancels timer', () => {
    const onClose = vi.fn();
    render(<AlertBanner type="error" message="Dismissible error" onClose={onClose} />);

    const closeBtn = screen.getByRole('button', { name: /close notification/i });
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalledTimes(1);

    act(() => {
      vi.advanceTimersByTime(10000);
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('cleans up active timer on unmount', () => {
    const onClose = vi.fn();
    const { unmount } = render(
      <AlertBanner type="success" message="Will unmount" onClose={onClose} />
    );

    unmount();

    act(() => {
      vi.advanceTimersByTime(10000);
    });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('cancels old timer when replaced by a new notification and does not reset on parent re-render', () => {
    function Harness() {
      const [tick, setTick] = useState(0);
      const [msg, setMsg] = useState({ key: 1, text: 'First notice', type: 'success' });

      return (
        <div>
          <button onClick={() => setTick((t) => t + 1)}>Tick {tick}</button>
          <button onClick={() => setMsg({ key: 2, text: 'Second notice', type: 'success' })}>
            Replace
          </button>
          <AlertBanner
            type={msg.type}
            message={msg.text}
            triggerKey={msg.key}
            onClose={() => setMsg({ key: 0, text: '', type: '' })}
          />
        </div>
      );
    }

    render(<Harness />);
    expect(screen.getByText('First notice')).toBeTruthy();

    // Advance 2.5s and trigger parent re-render + inline callback recreation
    act(() => {
      vi.advanceTimersByTime(2500);
    });
    fireEvent.click(screen.getByText('Tick 0'));

    // Replace with second notification at t=2.5s
    fireEvent.click(screen.getByText('Replace'));
    expect(screen.getByText('Second notice')).toBeTruthy();

    // At t=4.5s (2s after second, past 4s of first), second must STILL be visible
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(screen.queryByText('Second notice')).toBeTruthy();

    // At t=6.5s (full 4s after second), second dismisses cleanly
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(screen.queryByText('Second notice')).toBeNull();
  });

  it('does not auto-dismiss persistent banners when autoDismiss={false}', () => {
    const onClose = vi.fn();
    render(
      <AlertBanner
        type="info"
        message="Persistent informational state"
        onClose={onClose}
        autoDismiss={false}
      />
    );

    act(() => {
      vi.advanceTimersByTime(30000);
    });
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText('Persistent informational state')).toBeTruthy();
  });
});

describe('NotificationProvider toast notifications', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('auto-dismisses toasts by severity (4s success/info, 6s error/warning) and supports manual close & replacement', () => {
    function DemoActions() {
      const notify = useNotification();
      return (
        <div>
          <button onClick={() => notify.success('Toast saved')}>Trigger Success</button>
          <button onClick={() => notify.error('Toast failed')}>Trigger Error</button>
          <button onClick={() => notify.warning('Toast warning')}>Trigger Warning</button>
          <button onClick={() => notify.info('Toast info')}>Trigger Info</button>
          <button onClick={() => notify.success('Replaced toast', { replace: true })}>
            Replace Toast
          </button>
        </div>
      );
    }

    render(
      <NotificationProvider>
        <DemoActions />
      </NotificationProvider>
    );

    fireEvent.click(screen.getByText('Trigger Success'));
    fireEvent.click(screen.getByText('Trigger Error'));

    expect(screen.getByText('Toast saved')).toBeTruthy();
    expect(screen.getByText('Toast failed')).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(4000);
    });
    expect(screen.queryByText('Toast saved')).toBeNull();
    expect(screen.queryByText('Toast failed')).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(screen.queryByText('Toast failed')).toBeNull();

    // Test replace stops older timer cleanly
    fireEvent.click(screen.getByText('Trigger Warning'));
    expect(screen.getByText('Toast warning')).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    fireEvent.click(screen.getByText('Replace Toast'));
    expect(screen.queryByText('Toast warning')).toBeNull();
    expect(screen.getByText('Replaced toast')).toBeTruthy();

    // Dismiss manually via X button
    const closeBtn = screen.getByRole('button', { name: /close notification/i });
    fireEvent.click(closeBtn);
    expect(screen.queryByText('Replaced toast')).toBeNull();
  });
});

