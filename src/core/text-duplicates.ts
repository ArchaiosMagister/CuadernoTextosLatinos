import type { LatinText } from './model.js';

export interface PossibleDuplicateInput {
  latin: string;
  author?: string | null;
  work?: string | null;
  reference?: string | null;
}

export interface PossibleDuplicate {
  textId: string;
  title: string;
  /** Identical text, significant contiguous shared passage, or identical citation. */
  kind: 'identical' | 'overlap' | 'citation';
  sharedWords: number;
  excerpt: string;
}

interface Word {
  value: string;
  start: number;
  end: number;
}

function fold(value: string): string {
  return value.toLowerCase().replace(/æ/g, 'ae').replace(/œ/g, 'oe')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/j/g, 'i').replace(/v/g, 'u');
}

function words(text: string): Word[] {
  return [...text.matchAll(/[\p{L}\p{N}]+/gu)].map(match => ({
    value: fold(match[0]),
    start: match.index,
    end: match.index + match[0].length,
  })).filter(word => word.value.length > 0);
}

function bibliographyPart(value: string | null | undefined): string {
  return fold(value ?? '').replace(/[^a-z0-9]+/g, ' ').trim();
}

function authorName(value: string | null | undefined): string {
  const name = bibliographyPart(value);
  if (/(?:^| )(?:caesar|cesar)(?: |$)/.test(name)) return 'caesar';
  return name;
}

function workName(value: string | null | undefined): string {
  const name = bibliographyPart(value);
  if (/^(?:de )?bello gallico$|^bellum gallicum$/.test(name)) return 'caesar.bg';
  if (/^(?:de )?bello ciuili$|^bellum ciuile$/.test(name)) return 'caesar.bc';
  return name;
}

function romanValue(value: string): number | null {
  if (!/^[ivxlcdm]+$/.test(value)) return null;
  const digits: Record<string, number> = { i: 1, v: 5, x: 10, l: 50, c: 100, d: 500, m: 1000 };
  let number = 0;
  for (let i = 0; i < value.length; i++) {
    const current = digits[value[i]!]!;
    number += current < (digits[value[i + 1]!] ?? 0) ? -current : current;
  }
  return number;
}

function citation(value: string | null | undefined): string {
  const parts = bibliographyPart(value).split(' ').filter(Boolean)
    .filter(part => !['libro', 'liber', 'cap', 'capitulo', 'caput'].includes(part));
  return parts.map(part => {
    const roman = romanValue(part);
    return roman === null ? part : String(roman);
  }).join('.');
}

function sameCitation(a: PossibleDuplicateInput, b: PossibleDuplicateInput): boolean {
  const author = authorName(a.author);
  const work = workName(a.work);
  const ref = citation(a.reference);
  return Boolean(author && work && ref
    && author === authorName(b.author)
    && work === workName(b.work)
    && ref === citation(b.reference));
}

/** Finds the longest common consecutive sequence without quadratic DP memory. */
function sharedPassage(a: Word[], b: Word[]): { from: number; count: number } {
  const window = 6;
  if (a.length < window || b.length < window) return { from: 0, count: 0 };
  const index = new Map<string, number[]>();
  for (let j = 0; j <= b.length - window; j++) {
    const key = b.slice(j, j + window).map(word => word.value).join('\u0001');
    const positions = index.get(key) ?? [];
    if (positions.length < 40) positions.push(j);
    index.set(key, positions);
  }
  let bestFrom = 0;
  let best = 0;
  for (let i = 0; i <= a.length - window; i++) {
    const key = a.slice(i, i + window).map(word => word.value).join('\u0001');
    for (const start of index.get(key) ?? []) {
      let length = window;
      while (i + length < a.length && start + length < b.length
        && a[i + length]!.value === b[start + length]!.value) length++;
      if (length > best) { best = length; bestFrom = i; }
    }
  }
  return { from: bestFrom, count: best };
}

/**
 * Read-only warning system: it never deletes, merges or rewrites texts.
 * Strong overlap requires at least 8 common consecutive words and either
 * 40% of the shorter fragment or at least 15 common words.
 */
export function findPossibleDuplicates(
  existing: readonly Pick<LatinText, 'id' | 'title' | 'latin' | 'source'>[],
  input: PossibleDuplicateInput,
  excludeId?: string,
  limit = 5,
): PossibleDuplicate[] {
  const incoming = words(input.latin);
  const normalized = incoming.map(item => item.value).join(' ');
  const result: PossibleDuplicate[] = [];
  for (const old of existing) {
    if (old.id === excludeId) continue;
    const previous = words(old.latin);
    const identical = normalized.length > 0
      && normalized === previous.map(item => item.value).join(' ');
    const common = identical
      ? { from: 0, count: incoming.length }
      : sharedPassage(incoming, previous);
    const shorter = Math.min(incoming.length, previous.length);
    const significant = common.count >= 8
      && (common.count >= 15 || common.count / Math.max(1, shorter) >= 0.4);
    const kind: PossibleDuplicate['kind'] | null = identical ? 'identical'
      : significant ? 'overlap' : sameCitation(input, {
        latin: old.latin, author: old.source.author,
        work: old.source.work, reference: old.source.reference,
      }) ? 'citation' : null;
    if (!kind) continue;
    const first = incoming[common.from];
    const last = incoming[common.from + common.count - 1];
    const excerpt = first && last
      ? input.latin.slice(first.start, last.end).slice(0, 180)
      : input.latin.slice(0, 180);
    result.push({ textId: old.id, title: old.title, kind, sharedWords: common.count, excerpt });
  }
  const priority = { identical: 0, overlap: 1, citation: 2 };
  return result.sort((a, b) => priority[a.kind] - priority[b.kind]
    || b.sharedWords - a.sharedWords || a.title.localeCompare(b.title, 'es')).slice(0, limit);
}
