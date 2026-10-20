export const SOURCE_CATEGORIES = [
  'Government and Official Sources',
  'Academic Research',
  'News and Journalism',
  'Reports and Statistical Data',
  'Websites and Articles',
  'Videos and YouTube',
  'Books and Other Publications',
];

export function sourceHost(url) {
  try {
    return new URL(url).hostname.replace(/^www\./i, '');
  } catch {
    return '';
  }
}

function isOfficialSource(item, host) {
  return /\.(gov|gov\.[a-z]{2}|gc\.ca|gouv\.fr)$/i.test(host) ||
    /(^|\.)((europa\.eu)|(un\.org)|(who\.int)|(worldbank\.org)|(imf\.org)|(oecd\.org)|(data\.gov))$/i.test(host) ||
    /\b(legislation|court judgment|company filing|government report|public dataset)\b/i.test(
      `${item.title} ${item.type} ${item.publisher}`,
    );
}

export function categoryFor(item) {
  const host = sourceHost(item.url);
  const type = `${item.type} ${item.title}`.toLocaleLowerCase();
  if (item.kind === 'video') return 'Videos and YouTube';
  if (isOfficialSource(item, host)) return 'Government and Official Sources';
  if (/\b(book|book[- ]chapter|edited[- ]book|monograph|reference[- ]book)\b/.test(type)) {
    return 'Books and Other Publications';
  }
  let pathname = '';
  try {
    pathname = new URL(item.url).pathname;
  } catch {
    pathname = '';
  }
  if (/\b(report|dataset|statistics|statistical|data release|working paper)\b/.test(type) ||
    /\/(reports?|datasets?|statistics|data)(\/|$)/i.test(pathname)) {
    return 'Reports and Statistical Data';
  }
  if (item.kind === 'academic') return 'Academic Research';
  if (/\b(reuters\.com|apnews\.com|bbc\.(com|co\.uk)|theguardian\.com|npr\.org|nytimes\.com|washingtonpost\.com|aljazeera\.com|pbs\.org|theconversation\.com|politico\.com|cnn\.com|dw\.com|france24\.com)\b/i.test(host)) {
    return 'News and Journalism';
  }
  return 'Websites and Articles';
}

export function sourceDateLabel(value) {
  if (!value) return 'Not available';
  if (/^(19|20)\d{2}$/.test(String(value))) return String(value);
  const yearMonth = String(value).match(/^((?:19|20)\d{2})-(0[1-9]|1[0-2])$/);
  if (yearMonth) {
    return `${new Date(Number(yearMonth[1]), Number(yearMonth[2]) - 1, 1).toLocaleString('en', { month: 'short' })} ${yearMonth[1]}`;
  }
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleDateString() : 'Not available';
}
