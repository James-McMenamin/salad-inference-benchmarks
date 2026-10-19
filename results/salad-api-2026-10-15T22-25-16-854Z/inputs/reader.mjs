export function parseJson(text) {
  const m = String(text ?? '').match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}



export const READ_PROMPT = [
  'You read one chat line from a Discord server about the video game Monsters & Memories (MnM), the way a player in that chat would.',
  'You get the recent chat before it, and for some short words the things they can stand for in the game, numbered. Reply with JSON only, no other text:',
  '{"asks": "", "meant": {}, "refers": "", "question": "", "more": [], "unclear": ""}',
  '- asks: "where" if they want to know where something is or how to get there; else "what", "how", "which", "who", "when" or "other".',
  '- meant: for each numbered short word, the meaning they mean, copied exactly from its list. Choose like this:',
  '  1. If asks is "where", the word names a place, so choose a zone or a place, never a game term or stat.',
  '  2. Else if the recent chat talks about mobs, camps, hunting or being somewhere in that word, it is a place: choose the zone or place.',
  '  3. Else if the recent chat is about gear, stats or a class, choose the game term.',
  '  4. Else if only one meaning is a zone or place and the line is about going, hunting, leveling or a camp, choose it.',
  '  5. Else leave it out of meant and put the word in unclear.',
  '- refers: if the line says "it", "there", "that", "them", "he" or "she" for something named in the recent chat (lines marked "(the bot answered)" count: "where is he?" after the bot named Fisher Mardan is Fisher Mardan), that thing; else "".',
  '- question: the line rewritten to stand alone, with each meant word and the refers thing written out. Never add facts or answer it.',
  '- more: if the line asks two or more separate things ("where is the bank and the inn in night harbor"), question is the first, written out in full, and more holds the others, each written out in full ("where is the inn in night harbor"); else [].',
  'Every question in more must stand alone: resolve "there" and other pointers from the first question. "what level is keepers bight and what do i hunt there" becomes "what level is Keeper\'s Bight" plus "what can i hunt in Keeper\'s Bight".',
  '- unclear: a word whose meaning you could not choose and the answer depends on; else "".',
  '',
  'Example. Recent chat: "anyone want to duo the skeletons in AC tonight?". Line: "what is AC". AC: 1. Ancient Crypt (a zone) 2. Armor Class (a game term or stat).',
  '{"asks": "what", "meant": {"AC": "Ancient Crypt"}, "refers": "", "question": "what is Ancient Crypt", "unclear": ""}',
  'Example. Recent chat: none. Line: "Were is AC?". AC: 1. Ancient Crypt (a zone) 2. Armor Class (a game term or stat).',
  '{"asks": "where", "meant": {"AC": "Ancient Crypt"}, "refers": "", "question": "Where is Ancient Crypt?", "unclear": ""}',
  'Example. Recent chat: "the ashira supplier sells good stuff". Line: "where is it?".',
  '{"asks": "where", "meant": {}, "refers": "the ashira supplier", "question": "where is the ashira supplier?", "unclear": ""}',
  'Example. Recent chat: "who sells fishing poles?", "(the bot answered) who sells fishing poles?: Fisher Mardan in Sungreet Strand sells them.". Line: "where is he?".',
  '{"asks": "where", "meant": {}, "refers": "Fisher Mardan", "question": "where is Fisher Mardan?", "more": [], "unclear": ""}',
  'A line like "what about X", "and X", "how about at 30" asks the last question in the recent chat again with X in place of what it asked about: write that whole question out.',
  'Example. Recent chat: "how do i raise steel talons faction", "(the bot answered) ...". Line: "what about blacktide orcs".',
  '{"asks": "what", "meant": {}, "refers": "Steel Talons", "question": "does killing Blacktide orcs raise Steel Talons faction", "more": [], "unclear": ""}',
  'Only for an actual follow-up with recent faction chat, a bare mob or enemy group in "what about X" can ask whether killing X changes the faction already discussed. Preserve that faction as the target. Never rewrite a standalone "how do I raise X faction" into a question about killing X. If the line explicitly asks to raise X faction instead, answer about X.',
  'Example. Recent chat: "what level does a shaman get slow", "(the bot answered) ...". Line: "what about a pet".',
  '{"asks": "what", "meant": {}, "refers": "", "question": "what level does a shaman get a pet", "more": [], "unclear": ""}',
  'Example. Recent chat: "were is the crocs camp in dunes", "(the bot answered) ...". Line: "and the bandits".',
  '{"asks": "where", "meant": {}, "refers": "", "question": "where is the bandit camp in dunes", "more": [], "unclear": ""}',
  'Example. Recent chat: "where can i solo as a 22 shaman", "(the bot answered) ...". Line: "what about at 30".',
  '{"asks": "where", "meant": {}, "refers": "", "question": "where can i solo as a 30 shaman", "more": [], "unclear": ""}',
  'Example. Recent chat: none. Line: "what level does a necro get a pet and when do they get charm".',
  '{"asks": "what", "meant": {}, "refers": "", "question": "what level does a necromancer get a pet", "more": ["what level does a necromancer get charm"], "unclear": ""}',
  'Example. Recent chat: none. Line: "where is the bank and the inn in night harbor".',
  '{"asks": "where", "meant": {}, "refers": "", "question": "where is the bank in night harbor", "more": ["where is the inn in night harbor"], "unclear": ""}',
  'Example. Recent chat: none. Line: "what is AC". AC: 1. Ancient Crypt (a zone) 2. Armor Class (a game term or stat).',
  '{"asks": "what", "meant": {}, "refers": "", "question": "what is AC", "unclear": "AC"}',
].join('\n');

/** How each kind of meaning (mnm-lore meanings.js) reads to the model. */
const KINDS = { zone: 'a zone', place: 'a place', 'wiki redirect': 'a wiki page', 'wiki text': 'a game term or stat' };

/** Words that point at something said before. */
const POINTERS = /^(it|its|there|that|this|them|they|those|these|he|she|him|her|one|ones|that one|this one)$/i;

/** The recent lines, oldest first, words only (never who said them), each cut short. */
export function recentText(recent) {
  return (recent ?? []).map((t) => String(t).replace(/\s+/g, ' ').trim().slice(0, 240)).filter(Boolean).slice(-8);
}

/**
 * What the line asks: { asks, question, unclear } or null when the model gave nothing usable (the
 * line is then answered as typed). `meanings` is mnm-lore meaningsOf(bundle, line).
 */
export async function readQuestion(model, line, { recent = [], meanings = [] } = {}) {
  // An explicit faction goal stands on its own. Recent kill-effect answers must not replace it.
  const goal = String(line).trim().match(/^how\s+(?:do|can|should)\s+(?:i|we|you|u)\s+(?:raise|lower|improve|increase|decrease)\s+(?:my\s+)?(.+?)\s+faction[?.!]*$/i);
  if (goal && !/\b(?:it|its|that|this|their|theirs|what|where|how|when|who|and|or)\b/i.test(goal[1])) {
    return { asks: 'how', question: String(line).trim(), meant: {}, refers: '', more: [], unclear: '' };
  }
  const parts = [];
  const before = recentText(recent);
  parts.push(before.length ? `Recent chat, oldest first:\n${before.map((t) => `- ${t}`).join('\n')}` : 'Recent chat: none.');
  parts.push(meanings.length
    ? `Short words and what they can stand for:\n${meanings.map((m) => `- ${m.word}: ${m.meanings.map((x, i) => `${i + 1}. ${x.meaning} (${KINDS[x.kind] ?? x.kind})`).join(' ')}`).join('\n')}`
    : 'Short words and what they can stand for: none.');
  parts.push(`The line: ${line}`);
  const out = parseJson(await model.complete(READ_PROMPT, parts.join('\n\n'), 260));
  if (!out || typeof out.question !== 'string' || !out.question.trim()) return null;
  const asks = String(out.asks ?? '').trim().toLowerCase() || 'other';
  let question = out.question.trim().slice(0, 300);
  // A chosen meaning counts only when it is one the sources gave for that word; it is written into
  // the question even when the model's rewrite left the short word in.
  const meant = {};
  for (const m of meanings) {
    const said = String(out.meant?.[m.word] ?? out.meant?.[m.word.toUpperCase()] ?? out.meant?.[m.word.toLowerCase()] ?? '').trim();
    const pick = m.meanings.find((x) => x.meaning.toLowerCase() === said.toLowerCase())
      ?? m.meanings.find((x) => said && x.meaning.toLowerCase().startsWith(said.toLowerCase()));
    if (!pick) continue;
    const name = pick.meaning.replace(/ \(a place in .*\)$/, '');
    meant[m.word] = name;
    if (!question.toLowerCase().includes(name.toLowerCase())) question = question.replace(new RegExp(`\\b${m.word}\\b`, 'gi'), name);
  }
  let unclear = String(out.unclear ?? '').trim();
  // Unclear only names a word the line says (measured 2026-10-13: the model's own "no_think").
  if (unclear === '""' || meant[unclear] || !new RegExp(`\\b${unclear.replace(/[^\w ']/g, '')}\\b`, 'i').test(line)) unclear = '';
  // Unclear means it could be more than one thing (a short word with several meanings in the
  // sources), or an "it" or "there" the chat does not settle. A name the model has not heard of is
  // not unclear: the search knows the game, the model does not (measured 2026-10-13: "can i get a
  // map of Ail'vorith" after talk of the pit was held back as unclear).
  const several = meanings.some((m) => m.word.toLowerCase() === unclear.toLowerCase() && m.meanings.length > 1);
  if (unclear && !several && !POINTERS.test(unclear)) unclear = '';
  // With no chat to read it by, a word that can be a place or a game term is not known: "what is
  // AC" alone could be Ancient Crypt or armor class. A where-question already says it is a place.
  if (!before.length && asks !== 'where') {
    for (const m of meanings) {
      const kinds = new Set(m.meanings.map((x) => (x.kind === 'zone' || x.kind === 'place' ? 'place' : 'term')));
      if (kinds.size > 1) { unclear ||= m.word; delete meant[m.word]; }
    }
    if (unclear) return { asks, question: line, meant, refers: '', unclear };
  }
  // The other questions in the line, each to answer on its own (at most two more).
  // Each must ask about something the line itself says (a word of four letters or more beyond the
  // question words), never the model's own tokens (measured 2026-10-13: "what level is /no_think").
  const lineWords = new Set(String(line).toLowerCase().match(/[\p{L}\p{N}']{4,}/gu) ?? []);
  const ASKING = new Set(['what', 'where', 'when', 'which', 'level', 'does', 'they', 'them', 'there', 'about', 'with']);
  const more = (Array.isArray(out.more) ? out.more : []).map((x) => String(x ?? '').trim())
    .filter((x) => x.length > 5 && !/no_think/i.test(x) && x.toLowerCase() !== question.toLowerCase()
      && (x.toLowerCase().match(/[\p{L}\p{N}']{4,}/gu) ?? []).some((w) => !ASKING.has(w) && lineWords.has(w)))
    .slice(0, 2);
  // A rewrite may resolve a name or pronoun, but cannot turn a requested map into
  // directions to the zone. Preserve the resolved target while keeping map intent.
  if(!more.length&&/\bmaps?\b/i.test(line)&&!/\bmaps?\b/i.test(question))question=`show a map: ${question}`;
  return { asks, question, meant, refers: String(out.refers ?? '').trim(), more, unclear: unclear.slice(0, 60) };
}

export const SAYS_WHERE_PROMPT = [
  'You check an answer a bot gave in a Discord chat about the video game Monsters & Memories.',
  'The question asks where something is. Does the answer say where it is in the game world (a zone, an area, a spot, or how to get there)?',
  'Defining what something is, or describing it, is not saying where it is. Placing it only by itself ("the pit is by the ramp up from the pit"), or saying the sources do not give the spot, is not saying where it is either. Reply YES or NO only.',
  'For "where do I get" an item, saying what drops it, who sells it or what quest gives it is saying where. Measured 2026-10-13: "where do i get tattered cloth pantaloons" was thrown out.',
  'Example. Question: where do i get tattered cloth pantaloons? Answer: Tattered Cloth Pantaloons drop from a decaying skeleton in Night Harbor. -> YES',
  'Example. Question: where is the pit in fallen pass? Answer: The pit in Fallen Pass is located at the ramp up from the pit, where Mia Tarcut is found. The sources do not specify the exact location. -> NO',
  'Example. Question: Where is Ancient Crypt? Answer: AC (Armor Class) is a statistic that mitigates physical damage. -> NO',
  'Example. Question: where is the ashira supplier? Answer: An ashira supplier is in Tel Ekir, near the shaman scribe. -> YES',
  'Example. Question: where do I farm tin? Answer: Tin is used to make bronze. -> NO',
].join('\n');

/** Does this answer say where? false only on a clear NO. */
export async function saysWhere(model, question, answer, places = []) {
  // An answer that names a zone the question did not is saying where; no model needed. The model
  // judged the same "defeat Dario Numas in the Tomb of the Last Wyrmsbane" YES one run and NO the
  // next (measured 2026-10-13, battery). It still judges answers that name no place ("AC is armor class").
  const low = (s) => ` ${String(s ?? '').toLowerCase().replace(/[^\p{L}\p{N}']+/gu, ' ')} `;
  const q = low(question), a = low(answer);
  if (places.some((p) => { const n = low(p).trim(); return n.length >= 4 && a.includes(` ${n} `) && !q.includes(` ${n} `); })) return true;
  const out = String(await model.complete(SAYS_WHERE_PROMPT, `Question: ${question}\nAnswer: ${answer}`, 4)).trim().toUpperCase();
  return !out.startsWith('NO');
}

/**
 * What kind of thing an unanswered question asks for, to decide between "I don't know that one yet"
 * and saying nothing: WORLD (the game's world, items, places, how it plays) and COMPANY (support,
 * accounts, refunds) get "don't know yet"; NEWS (patches, release dates, who is online) and OPINION
 * (is it worth it, pay to win, the best class) get silence. Owner's test run, 2026-10-14: "when is the
 * next patch" and "is mnm pay to win" should keep its mouth shut; the support phone number should
 * say it doesn't know.
 */
export const TOPIC_PROMPT = [
  'Classify a question someone asked in a Discord server about the video game Monsters & Memories.',
  'WORLD: about the game itself: its world, items, places, monsters, quests, classes, skills, mechanics, how to do something.',
  'COMPANY: about the company running it: support, accounts, billing, refunds, contacting them.',
  'NEWS: about news, plans or live status: patches, updates, release dates, server status, how many are playing.',
  'OPINION: asks for a judgement: is it good or worth it, pay to win, the best class, what people think.',
  'Reply with exactly one word: WORLD, COMPANY, NEWS or OPINION.',
].join('\n');
export async function topicOf(model, question) {
  const out = String(await model.complete(TOPIC_PROMPT, `Question: ${String(question).slice(0, 300)}`, 4)).trim().toUpperCase();
  return ['WORLD', 'COMPANY', 'NEWS', 'OPINION'].find((t) => out.startsWith(t)) ?? 'WORLD';
}
