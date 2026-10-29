// data/games/*.json -> Supabase. 사용: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 환경변수 필요.
// 같은 id는 내용만 갱신(체크 상태·이력 유지), JSON에서 사라진 게임/숙제는 active=false로 비활성 처리한다.
import { createClient } from '@supabase/supabase-js';
import { loadGames } from './load.mjs';

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 환경변수가 필요하다');
  process.exit(1);
}

const games = loadGames();
const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const check = ({ error }) => {
  if (error) throw new Error(error.message);
};

const gameRows = games.map((g) => ({
  id: g.id,
  name: g.name,
  sort_order: g.order,
  timezone: g.timezone,
  reset_hour: g.resetHour,
  week_starts_on: g.weekStartsOn,
  source_url: g.source.url,
  checked_at: g.source.checkedAt,
  active: true,
}));
const taskRows = games.flatMap((g) =>
  g.tasks.map((t, i) => ({
    game_id: g.id,
    id: t.id,
    name: t.name,
    kind: t.kind,
    target: t.kind === 'count' ? t.target : 1,
    cycle_type: t.cycle.type,
    cycle_days: t.cycle.days ?? null,
    cycle_anchor: t.cycle.anchor ?? null,
    ends_at: t.endsAt ?? null,
    sort_order: i,
    active: true,
  })),
);

check(await db.from('games').upsert(gameRows));
check(await db.from('tasks').upsert(taskRows));

// 사라진 항목 비활성화
const gameIds = new Set(gameRows.map((g) => g.id));
const taskKeys = new Set(taskRows.map((t) => `${t.game_id}/${t.id}`));
const { data: dbGames, error: e1 } = await db.from('games').select('id').eq('active', true);
check({ error: e1 });
for (const { id } of dbGames) {
  if (!gameIds.has(id)) check(await db.from('games').update({ active: false }).eq('id', id));
}
const { data: dbTasks, error: e2 } = await db.from('tasks').select('game_id,id').eq('active', true);
check({ error: e2 });
for (const t of dbTasks) {
  if (!taskKeys.has(`${t.game_id}/${t.id}`)) {
    check(await db.from('tasks').update({ active: false }).eq('game_id', t.game_id).eq('id', t.id));
  }
}
console.log(`동기화 완료: 게임 ${gameRows.length}개, 숙제 ${taskRows.length}개`);
