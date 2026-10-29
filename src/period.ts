// 주기 계산. 서버 스케줄러 없이 "지금 시각 -> 현재 주기 키"만 구해서 리셋을 판정한다.
// "게임 날짜" = 게임 시간대의 벽시계 시각에서 resetHour만큼 뺀 날짜(05:00 리셋이면 04:59는 전날).

export type Cycle =
  | { type: 'daily' | 'weekly' | 'monthly' }
  | { type: 'everyNDays'; days: number; anchor: string };

export interface GameClock {
  timezone: string;
  resetHour: number;
  weekStartsOn: number; // 0=일 … 6=토
}

export interface Period {
  key: string;
  nextReset: Date;
}

const DAY = 86_400_000;

/** 게임 날짜를 UTC 자정 ms로 표현한다(달력 연산용). */
type DayMs = number;

function wallClock(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  }).formatToParts(date);
  const n = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  return Date.UTC(n('year'), n('month') - 1, n('day'), n('hour'), n('minute'), n('second'));
}

/** 시간대의 벽시계 시각(날짜+시)에 해당하는 실제 시각. */
function zonedToInstant(day: DayMs, hour: number, timeZone: string): Date {
  const wall = day + hour * 3_600_000;
  let guess = wall - (wallClock(new Date(wall), timeZone) - wall);
  guess = wall - (wallClock(new Date(guess), timeZone) - guess);
  return new Date(guess);
}

export function gameDay(now: Date, clock: GameClock): DayMs {
  const shifted = wallClock(now, clock.timezone) - clock.resetHour * 3_600_000;
  return Math.floor(shifted / DAY) * DAY;
}

export function parseDay(iso: string): DayMs {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

export function formatDay(day: DayMs): string {
  return new Date(day).toISOString().slice(0, 10);
}

export function periodOf(cycle: Cycle, clock: GameClock, now: Date): Period {
  const day = gameDay(now, clock);
  let key: string;
  let next: DayMs;
  switch (cycle.type) {
    case 'daily':
      key = `d${formatDay(day)}`;
      next = day + DAY;
      break;
    case 'weekly': {
      const back = (new Date(day).getUTCDay() - clock.weekStartsOn + 7) % 7;
      const start = day - back * DAY;
      key = `w${formatDay(start)}`;
      next = start + 7 * DAY;
      break;
    }
    case 'monthly': {
      const d = new Date(day);
      const start = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
      key = `m${formatDay(start).slice(0, 7)}`;
      next = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
      break;
    }
    case 'everyNDays': {
      const anchor = parseDay(cycle.anchor);
      const idx = Math.floor((day - anchor) / DAY / cycle.days);
      const start = anchor + idx * cycle.days * DAY;
      key = `n${formatDay(start)}`;
      next = start + cycle.days * DAY;
      break;
    }
  }
  return { key, nextReset: zonedToInstant(next, clock.resetHour, clock.timezone) };
}

/** 이벤트 종료일(포함)이 지났는지. */
export function isEnded(endsAt: string | null, clock: GameClock, now: Date): boolean {
  return endsAt !== null && gameDay(now, clock) > parseDay(endsAt);
}

export function formatRemaining(ms: number): string {
  const min = Math.max(0, Math.floor(ms / 60_000));
  const d = Math.floor(min / 1440);
  const h = Math.floor((min % 1440) / 60);
  const m = min % 60;
  if (d > 0) return `${d}일 ${h}시간`;
  if (h > 0) return `${h}시간 ${m}분`;
  return `${m}분`;
}
