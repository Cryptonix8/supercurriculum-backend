/**
 * Ensures generated activity JSON always has explicit questions in content.items.
 * AI and legacy imports sometimes store only hints/clues.
 */
export function normalizeActivityContent(content: any, locale = 'en-GB'): any {
  const isEl = locale === 'el-GR';
  const fallbackTask = (n: number) =>
    isEl
      ? `Άσκηση ${n}: Απάντησε στην ερώτηση παρακάτω με δικά σου λόγια.`
      : `Question ${n}: Answer the question below in your own words.`;

  if (!content || typeof content !== 'object') {
    return { type: 'problems', items: [{ question: fallbackTask(1) }] };
  }

  const out: any = { ...content };
  const type = typeof content.type === 'string' ? content.type : 'problems';
  out.type = type;

  let items = Array.isArray(content.items) ? [...content.items] : [];

  if (items.length === 0 && Array.isArray(content.clues)) {
    items = content.clues.map((c: any, i: number) =>
      typeof c === 'string'
        ? { question: `${fallbackTask(i + 1)}\nClue: "${c}"`, hint: c }
        : c,
    );
  }
  if (items.length === 0 && Array.isArray(content.hints)) {
    items = content.hints.map((h: any, i: number) =>
      typeof h === 'string' ? { question: fallbackTask(i + 1), hint: h } : h,
    );
  }

  out.items = items.map((raw: any, index: number) => {
    const n = index + 1;
    if (typeof raw === 'string') {
      const q = raw.trim();
      return { question: q.length > 0 ? q : fallbackTask(n) };
    }
    if (!raw || typeof raw !== 'object') {
      return { question: fallbackTask(n) };
    }
    const hint = raw.hint ?? raw.tips ?? raw.clue;
    let question =
      raw.question ||
      raw.prompt ||
      raw.text ||
      raw.task ||
      raw.problem ||
      raw.stem ||
      raw.title;
    if (!question || String(question).trim().length === 0) {
      if (hint != null && String(hint).trim().length > 0) {
        const h = String(hint).trim();
        question = isEl
          ? `Άσκηση ${n}: Χρησιμοποίησε το βοήθημα και απάντησε.\n«${h}»`
          : `Question ${n}: Use the clue below and write your answer.\n"${h}"`;
      } else {
        question = fallbackTask(n);
      }
    }
    return {
      ...raw,
      question: String(question).trim(),
      ...(hint != null && String(hint).trim().length > 0
        ? { hint: String(hint).trim() }
        : {}),
    };
  });

  if (!Array.isArray(out.items) || out.items.length === 0) {
    out.items = [{ question: fallbackTask(1) }];
  }

  return out;
}

export function sanitizeActivityResources(
  resources: unknown,
  locale = 'en-GB',
): Record<string, unknown> | undefined {
  if (!resources || typeof resources !== 'object') {
    return resources as Record<string, unknown> | undefined;
  }
  const r = { ...(resources as Record<string, unknown>) };
  if (r.content) {
    r.content = normalizeActivityContent(r.content, locale);
  }
  return r;
}

export function formatCurriculumTopicDisplay(topic: {
  topicName: string;
  nationalCurriculumRef?: string | null;
}): string {
  const name = (topic.topicName || '').trim();
  const unitRef = (topic.nationalCurriculumRef || '').trim();
  if (unitRef && name && unitRef.toLowerCase() !== name.toLowerCase()) {
    return `${unitRef} — ${name}`;
  }
  if (unitRef) return unitRef;
  return name || 'Unit';
}
