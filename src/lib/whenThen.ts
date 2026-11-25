/**
 * Шаг 284: Home Assistant — автоматизации и триггеры описываются человеком.
 *
 * Что взято. В Home Assistant автоматизацию делает человек, и делает её
 * **словами**: «когда я прихожу домой — включи свет». Не «выберите триггер из
 * списка, потом условие, потом действие» — а «когда… тогда…», как он думает.
 *
 * Что **не** взято:
 *
 *  * **YAML**. У Home Assistant всё под капотом — YAML, и это его сила и его
 *    боль: человек с идеей, но без навыка упирается в отступы. У нас правило
 *    хранится структурой, а не текстом, и правка — руками в интерфейсе;
 *  * **библиотека готовых автоматизаций.** У них тысячи чужих сценариев; у нас
 *    чужой сценарий включает чужие устройства и чужие права;
 *  * **молчаливое срабатывание.** Автоматизация, о которой не сказано, — это
 *    приложение, которое делает то, чего человек не просил.
 *
 * Правила:
 *
 *  1. **«когда» — событие, «тогда» — действие, и оба названы.** Без «когда»
 *     правило становится «всегда», без «тогда» — пустым;
 *  2. **опасное действие спрашивает, даже в правиле.** «Когда прихожу — удали
 *     Temp» звучит удобно, и именно поэтому удаляет без человека;
 *  3. **правило можно выключить, не удаляя.** Удаление — потеря, а выключение —
 *     решение «сейчас не надо»;
 *  4. **сработавшее называется.** Человек должен видеть, что правило сделало, а
 *     не обнаруживать последствия.
 */

/** Вид триггера — тем, как человек это называет. */
export type When =
  | { kind: "time"; at: string }
  | { kind: "app"; name: string }
  | { kind: "file"; path: string }
  | { kind: "said"; phrase: string };

/** Правило «когда — тогда». */
export interface Rule {
  /** Ключ: без него «выключить» нечего. */
  readonly id: string;
  readonly when: When;
  /** Что сделать: фраза человека. */
  readonly then: string;
  /** Опасное действие требует подтверждения при срабатывании (шаг 82). */
  readonly risky: boolean;
  /** Включено ли. Выключенное правило не удалено — оно отложено. */
  readonly on: boolean;
  /** Сколько раз срабатывало: числом, а не «работает». */
  readonly fired: number;
}

/**
 * Разобрать «когда … тогда …».
 *
 * Не набор регулярных выражений на все случаи: важно узнать **границу** между
 * условием и действием, а понимание условия — дело триггера.
 */
export function parse(phrase: string, id: string): { rule: Rule | null; said: string } {
  const clean = phrase.trim();

  const head = /^(?:когда|если)\s+/i.exec(clean);
  if (head === null) {
    return {
      rule: null,
      said: "скажите «когда …, тогда …» — например «когда я открою Chrome, тогда включи музыку»",
    };
  }

  const rest = clean.slice(head[0].length);
  // Граница ищется явно, а не одной регуляркой: `(.+?)\s*(?:то|тогда)` находила
  // «то» **внутри** слова «тогда» и оставляла «гда включи музыку».
  const cut = /\s*,?\s*(?:тогда|то)\s+/i.exec(rest) ?? /\s*,?\s*(?:тогда|то)\s*$/i.exec(rest);
  if (cut === null) {
    return {
      rule: null,
      said: "не хватает второй половины: «когда …, тогда …» — что сделать, когда это случится?",
    };
  }

  const condition = rest.slice(0, cut.index).trim().replace(/,$/, "").trim();
  const action = rest.slice(cut.index + cut[0].length).trim();
  if (action === "") {
    return { rule: null, said: "действие не названо: «тогда» без действия ничего не делает" };
  }

  const when = conditionOf(condition);
  if (when === null) {
    return {
      rule: null,
      said: `не понял условие «${condition}» — бывает время («когда 18:00»), программа, файл или фраза`,
    };
  }

  return {
    rule: { id, when, then: action, risky: riskyAction(action), on: true, fired: 0 },
    said: `правило: ${describe(when)} — ${action}${riskyAction(action) ? " (спрошу перед выполнением)" : ""}`,
  };
}

/**
 * Действия, которые нельзя выполнять молча.
 *
 * Список по глаголам, а не по объектам: «удали» и «сотри» опасны с чем угодно.
 */
const RISKY: readonly string[] = ["удали", "сотри", "снеси", "вымой", "очисти", "перезапусти", "выключи"];

export function riskyAction(action: string): boolean {
  const clean = action.toLowerCase().replace(/ё/g, "е");
  return RISKY.some((word) => clean.includes(word.replace(/ё/g, "е")));
}

function conditionOf(text: string): When | null {
  const clean = text.toLowerCase();
  if (/^\d{1,2}:\d{2}$/.test(clean.trim())) return { kind: "time", at: clean.trim() };
  if (/^(?:я\s+)?(?:открою|запущу|включу)\s+(.+)$/.test(clean)) {
    const name = /(?:открою|запущу|включу)\s+(.+)$/.exec(clean)![1]!.trim();
    return { kind: "app", name };
  }
  if (/^(?:я\s+)?скажу\s+(.+)$/.test(clean)) {
    return { kind: "said", phrase: /скажу\s+(.+)$/.exec(clean)![1]!.trim() };
  }
  if (/появ|измен|созда/.test(clean)) {
    return { kind: "file", path: text.trim() };
  }
  return null;
}

function describe(when: When): string {
  if (when.kind === "time") return `в ${when.at}`;
  if (when.kind === "app") return `откроется ${when.name}`;
  if (when.kind === "said") return `вы скажете «${when.phrase}»`;
  return `файл ${when.path}`;
}

/**
 * Что сделать при срабатывании.
 *
 * Три исхода, и все три называются: выполнить, спросить, не выполнять. Четвёртого
 * «выполнить молча и сделать вид, что так и надо» нет.
 */
export function fire(rule: Rule): { run: boolean; ask: boolean; said: string } {
  if (!rule.on) {
    return { run: false, ask: false, said: `правило «${rule.then}» выключено — ничего не делаю` };
  }
  if (rule.risky) {
    return {
      run: false,
      ask: true,
      said: `правило «${rule.then}» сработало, но действие опасное: подтвердите`,
    };
  }
  return { run: true, ask: false, said: `правило: ${rule.then}` };
}

/** Выключить, не удаляя: решение «сейчас не надо», а не потеря. */
export function off(rules: readonly Rule[], id: string): Rule[] {
  return rules.map((rule) => (rule.id === id ? { ...rule, on: false } : rule));
}

/** Включить обратно. */
export function on(rules: readonly Rule[], id: string): Rule[] {
  return rules.map((rule) => (rule.id === id ? { ...rule, on: true } : rule));
}

/** Что сказать про список правил. */
export function summary(rules: readonly Rule[]): string {
  if (rules.length === 0) return "правил нет: автоматизации появляются, когда вы их опишете";
  const live = rules.filter((rule) => rule.on).length;
  const risky = rules.filter((rule) => rule.risky && rule.on).length;
  const off_ = rules.length - live;
  const parts = [`правил ${rules.length}`, `включено ${live}`];
  if (off_ > 0) parts.push(`выключено ${off_}`);
  if (risky > 0) parts.push(`спрашивают подтверждение ${risky}`);
  return parts.join(", ");
}
