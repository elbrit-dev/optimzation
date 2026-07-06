import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { firestoreService } from '@/app/graphql-playground/services/firestoreService';
import { configureSmartDataLogging, logSmartDataEvent, _flushSmartDataLogs } from '../smartDataLogger.js';

describe('smartDataLogger', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Reset singleton state: disable clears the buffer and stops timers.
    configureSmartDataLogging({ enabled: false });
  });

  afterEach(() => {
    configureSmartDataLogging({ enabled: false });
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('is a no-op while disabled', async () => {
    const spy = vi.spyOn(firestoreService, 'writeLogs').mockResolvedValue();
    logSmartDataEvent('info', 'fetch', 'fetch:start', { viewId: 'v1' });
    await _flushSmartDataLogs();
    expect(spy).not.toHaveBeenCalled();
  });

  it('buffers events and flushes once the size threshold is reached', async () => {
    const spy = vi.spyOn(firestoreService, 'writeLogs').mockResolvedValue();
    configureSmartDataLogging({ enabled: true, source: 'test-report' });

    for (let i = 0; i < 25; i++) {
      logSmartDataEvent('debug', 'interaction', `event-${i}`, { i });
    }
    // The 25th push triggers an async flush; let microtasks resolve.
    await Promise.resolve();
    await Promise.resolve();

    expect(spy).toHaveBeenCalledTimes(1);
    const entries = spy.mock.calls[0][0];
    expect(entries).toHaveLength(25);
    expect(entries[0]).toMatchObject({ level: 'debug', category: 'interaction', message: 'event-0', source: 'test-report' });
    expect(entries[0]).toHaveProperty('sessionId');
    expect(entries[0]).toHaveProperty('timestamp');
  });

  it('flushes on the interval timer', async () => {
    const spy = vi.spyOn(firestoreService, 'writeLogs').mockResolvedValue();
    configureSmartDataLogging({ enabled: true, source: 'test-report' });

    logSmartDataEvent('info', 'refresh', 'refresh:triggered', {});
    await vi.advanceTimersByTimeAsync(4000);

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0]).toHaveLength(1);
  });

  it('clears the buffer when disabled, dropping unflushed events', async () => {
    const spy = vi.spyOn(firestoreService, 'writeLogs').mockResolvedValue();
    configureSmartDataLogging({ enabled: true, source: 'test-report' });
    logSmartDataEvent('info', 'lifecycle', 'view:registered', { viewId: 'v1' });

    configureSmartDataLogging({ enabled: false });
    await _flushSmartDataLogs();

    expect(spy).not.toHaveBeenCalled();
  });

  it('swallows flush failures without throwing', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(firestoreService, 'writeLogs').mockRejectedValue(new Error('offline'));
    configureSmartDataLogging({ enabled: true, source: 'test-report' });

    logSmartDataEvent('error', 'fetch', 'fetch:error', {});
    await expect(_flushSmartDataLogs()).resolves.toBeUndefined();
    expect(warnSpy).toHaveBeenCalled();
  });
});
