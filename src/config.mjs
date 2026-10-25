import 'dotenv/config';

export function config(env = process.env, { line = false } = {}) {
  const mode = env.MOVIE_DATA_MODE || 'demo';
  if (!['demo', 'tmdb'].includes(mode)) throw new Error('MOVIE_DATA_MODE 請設為 demo 或 tmdb');
  const required = ['GEMINI_API_KEY'];
  if (line) required.push('LINE_CHANNEL_SECRET', 'LINE_CHANNEL_ACCESS_TOKEN');
  if (mode === 'tmdb') required.push('TMDB_READ_ACCESS_TOKEN');
  const missing = required.filter(key => !env[key]?.trim());
  if (missing.length) throw new Error(`請在本機 .env 填入：${missing.join(', ')}`);
  const port = Number(env.PORT || 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT 必須介於 1～65535');
  return {
    mode, port, model: env.GEMINI_MODEL || 'gemini-3.5-flash-lite',
    database: env.SQLITE_PATH || './data/movie-bot.sqlite',
    channelSecret: env.LINE_CHANNEL_SECRET,
    channelToken: env.LINE_CHANNEL_ACCESS_TOKEN,
    tmdbToken: env.TMDB_READ_ACCESS_TOKEN?.trim(),
  };
}
