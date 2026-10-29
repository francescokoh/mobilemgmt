import { describe, expect, it } from 'vitest';
import { formatRemaining, isEnded, periodOf, type GameClock } from './period';

const seoul: GameClock = { timezone: 'Asia/Seoul', resetHour: 5, weekStartsOn: 1 };
// Asia/Seoul = UTC+9, 리셋 05:00 KST = 전날 20:00Z
const at = (iso: string) => new Date(iso);

describe('daily', () => {
  it('리셋 직전은 전날, 직후는 당일', () => {
    expect(periodOf({ type: 'daily' }, seoul, at('2026-10-28T19:59:00Z')).key).toBe('d2026-10-28');
    expect(periodOf({ type: 'daily' }, seoul, at('2026-10-28T20:00:00Z')).key).toBe('d2026-10-29');
  });
  it('다음 리셋 시각', () => {
    const p = periodOf({ type: 'daily' }, seoul, at('2026-10-29T03:00:00Z'));
    expect(p.nextReset.toISOString()).toBe('2026-10-29T20:00:00.000Z');
  });
});

describe('weekly', () => {
  it('월요일 시작: 2026-10-29(목)은 10-26 주', () => {
    const p = periodOf({ type: 'weekly' }, seoul, at('2026-10-29T03:00:00Z'));
    expect(p.key).toBe('w2026-10-26');
    expect(p.nextReset.toISOString()).toBe('2026-11-01T20:00:00.000Z'); // 11-02(월) 05:00 KST
  });
  it('월요일 05시 이전은 지난 주', () => {
    expect(periodOf({ type: 'weekly' }, seoul, at('2026-10-25T20:00:00Z')).key).toBe('w2026-10-26');
    expect(periodOf({ type: 'weekly' }, seoul, at('2026-10-25T19:59:00Z')).key).toBe('w2026-10-19');
  });
  it('일요일 시작 설정', () => {
    const sun = { ...seoul, weekStartsOn: 0 };
    expect(periodOf({ type: 'weekly' }, sun, at('2026-10-29T03:00:00Z')).key).toBe('w2026-10-25');
  });
});

describe('monthly', () => {
  it('매월 1일 리셋', () => {
    const p = periodOf({ type: 'monthly' }, seoul, at('2026-10-29T03:00:00Z'));
    expect(p.key).toBe('m2026-10');
    expect(p.nextReset.toISOString()).toBe('2026-10-31T20:00:00.000Z');
  });
});

describe('everyNDays', () => {
  const c = { type: 'everyNDays', days: 28, anchor: '2026-10-01' } as const;
  it('기준일부터 N일 단위', () => {
    expect(periodOf(c, seoul, at('2026-10-15T03:00:00Z')).key).toBe('n2026-10-01');
    const p = periodOf(c, seoul, at('2026-10-29T03:00:00Z'));
    expect(p.key).toBe('n2026-10-29');
    expect(p.nextReset.toISOString()).toBe('2026-11-25T20:00:00.000Z');
  });
  it('기준일 이전도 계산된다', () => {
    expect(periodOf(c, seoul, at('2026-09-20T03:00:00Z')).key).toBe('n2026-09-03');
  });
});

describe('기타', () => {
  it('이벤트 종료일은 포함', () => {
    expect(isEnded('2026-10-29', seoul, at('2026-10-29T03:00:00Z'))).toBe(false);
    expect(isEnded('2026-10-28', seoul, at('2026-10-29T03:00:00Z'))).toBe(true);
    expect(isEnded(null, seoul, at('2026-10-29T03:00:00Z'))).toBe(false);
  });
  it('남은 시간 표기', () => {
    expect(formatRemaining(90 * 60_000)).toBe('1시간 30분');
    expect(formatRemaining(50 * 3_600_000)).toBe('2일 2시간');
  });
});
