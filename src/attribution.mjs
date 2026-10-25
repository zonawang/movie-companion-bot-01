export const creditsUrl = 'https://github.com/zonawang/movie-companion-bot-01/blob/main/docs/credits.md';

export function tmdbAttribution(sources = []) {
  const links = [...new Set(sources)].filter(value => {
    try { const url = new URL(value); return url.protocol === 'https:' && url.hostname === 'www.themoviedb.org'; }
    catch { return false; }
  }).slice(0, 3);
  return [
    '資料來源：TMDB（https://www.themoviedb.org）',
    ...links,
    `關於與資料來源：${creditsUrl}`,
  ].join('\n');
}

export function aboutReply() {
  return { text: [
    '電影夥伴｜關於與資料來源',
    '電影資料來自 TMDB；評論是使用者評論，不代表專業影評或整體共識。',
    '上映清單不代表特定影城的即時場次。個人票根由你確認後儲存。',
    'This product uses the TMDB API but is not endorsed or certified by TMDB.',
    creditsUrl,
  ].join('\n') };
}
