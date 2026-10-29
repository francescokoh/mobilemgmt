import { loadGames } from './load.mjs';

try {
  const games = loadGames();
  console.log(`OK: 게임 ${games.length}개, 숙제 ${games.reduce((n, g) => n + g.tasks.length, 0)}개`);
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
