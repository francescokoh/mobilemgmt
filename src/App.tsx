import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { formatRemaining, isEnded, periodOf, type Cycle, type GameClock } from './period';

interface Game extends GameClock {
  id: string;
  name: string;
}
interface Task {
  game_id: string;
  id: string;
  name: string;
  kind: 'check' | 'count';
  target: number;
  cycle: Cycle;
  ends_at: string | null;
}

const progressKey = (g: string, t: string, p: string) => `${g}/${t}/${p}`;

export function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  if (session === undefined) return <p className="center">불러오는 중…</p>;
  if (!session) {
    return (
      <div className="center">
        <h1>게임 숙제</h1>
        <button
          className="primary"
          onClick={() =>
            supabase.auth.signInWithOAuth({
              provider: 'google',
              options: { redirectTo: window.location.origin + window.location.pathname },
            })
          }
        >
          Google로 로그인
        </button>
      </div>
    );
  }
  return <Home />;
}

function Home() {
  const [games, setGames] = useState<Game[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [counts, setCounts] = useState<Map<string, number>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    (async () => {
      const [g, t] = await Promise.all([
        supabase.from('games').select('*').eq('active', true).order('sort_order'),
        supabase.from('tasks').select('*').eq('active', true).order('sort_order'),
      ]);
      if (g.error || t.error) return setError((g.error ?? t.error)!.message);
      setGames(
        g.data.map((r) => ({
          id: r.id,
          name: r.name,
          timezone: r.timezone,
          resetHour: r.reset_hour,
          weekStartsOn: r.week_starts_on,
        })),
      );
      setTasks(
        t.data.map((r) => ({
          game_id: r.game_id,
          id: r.id,
          name: r.name,
          kind: r.kind,
          target: r.target,
          ends_at: r.ends_at,
          cycle:
            r.cycle_type === 'everyNDays'
              ? { type: 'everyNDays', days: r.cycle_days, anchor: r.cycle_anchor }
              : { type: r.cycle_type },
        })),
      );
    })();
  }, []);

  const clocks = useMemo(() => new Map(games.map((g) => [g.id, g])), [games]);

  // 현재 주기 키들. 리셋이 지나 키가 바뀌면 진행도를 다시 읽는다.
  const keys = useMemo(() => {
    const out = new Set<string>();
    for (const t of tasks) {
      const g = clocks.get(t.game_id);
      if (g) out.add(periodOf(t.cycle, g, now).key);
    }
    return [...out].sort().join(',');
  }, [tasks, clocks, now]);

  const reload = useCallback(async () => {
    if (!keys) return;
    const { data, error } = await supabase.from('progress').select('*').in('period_key', keys.split(','));
    if (error) return setError(error.message);
    setCounts(new Map(data.map((r) => [progressKey(r.game_id, r.task_id, r.period_key), r.count])));
  }, [keys]);
  useEffect(() => void reload(), [reload]);

  async function setCount(t: Task, periodKey: string, next: number) {
    const count = Math.min(Math.max(next, 0), t.target);
    const k = progressKey(t.game_id, t.id, periodKey);
    setCounts((m) => new Map(m).set(k, count));
    const { error } = await supabase.from('progress').upsert({
      game_id: t.game_id,
      task_id: t.id,
      period_key: periodKey,
      count,
      done_at: count >= t.target ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    });
    if (error) {
      setError(error.message);
      reload();
    }
  }

  return (
    <main>
      <header>
        <h1>게임 숙제</h1>
        <button onClick={() => supabase.auth.signOut()}>로그아웃</button>
      </header>
      {error && <p className="error">{error}</p>}
      {games.map((g) => {
        const rows = tasks
          .filter((t) => t.game_id === g.id && !isEnded(t.ends_at, g, now))
          .map((t) => {
            const p = periodOf(t.cycle, g, now);
            return { t, p, count: counts.get(progressKey(g.id, t.id, p.key)) ?? 0 };
          });
        const left = rows.filter((r) => r.count < r.t.target).length;
        return (
          <details key={g.id} open>
            <summary>
              {g.name} <span className="badge">{left === 0 ? '완료' : `${left}개 남음`}</span>
            </summary>
            <ul>
              {rows.map(({ t, p, count }) => {
                const done = count >= t.target;
                return (
                  <li key={t.id} className={done ? 'done' : ''}>
                    <div className="label">
                      <span>{t.name}</span>
                      <small>{formatRemaining(p.nextReset.getTime() - now.getTime())} 후 리셋</small>
                    </div>
                    {t.kind === 'check' ? (
                      <input
                        type="checkbox"
                        checked={done}
                        onChange={() => setCount(t, p.key, done ? 0 : 1)}
                      />
                    ) : (
                      <div className="counter">
                        <button onClick={() => setCount(t, p.key, count - 1)}>−</button>
                        <span>
                          {count}/{t.target}
                        </span>
                        <button onClick={() => setCount(t, p.key, count + 1)}>+</button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </details>
        );
      })}
    </main>
  );
}
