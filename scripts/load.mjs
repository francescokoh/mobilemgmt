import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv';

const root = fileURLToPath(new URL('..', import.meta.url));
const schema = JSON.parse(readFileSync(`${root}data/game.schema.json`, 'utf8'));
const validate = new Ajv({ allErrors: true }).compile(schema);

/** data/games/*.json을 읽어 스키마와 의미 검사를 거친 게임 목록을 돌려준다. 오류가 있으면 던진다. */
export function loadGames() {
  const dir = `${root}data/games`;
  const errors = [];
  const games = [];
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
    const game = JSON.parse(readFileSync(`${dir}/${file}`, 'utf8'));
    if (!validate(game)) {
      for (const e of validate.errors) errors.push(`${file}: ${e.instancePath} ${e.message}`);
      continue;
    }
    if (file !== `${game.id}.json`) errors.push(`${file}: 파일명은 id(${game.id}.json)와 같아야 한다`);
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: game.timezone });
    } catch {
      errors.push(`${file}: 알 수 없는 시간대 ${game.timezone}`);
    }
    const ids = new Set();
    for (const t of game.tasks) {
      if (ids.has(t.id)) errors.push(`${file}: 숙제 id 중복 ${t.id}`);
      ids.add(t.id);
    }
    games.push(game);
  }
  const orders = games.map((g) => g.order);
  if (new Set(orders).size !== orders.length) errors.push('게임 order 값이 중복된다');
  if (errors.length) throw new Error(errors.join('\n'));
  return games;
}
