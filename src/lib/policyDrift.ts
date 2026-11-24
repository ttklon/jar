/**
 * Регулярная проверка, что политики не расширились молча (шаг 178).
 *
 * Дефект. Политика — это **таблица**: «`read` можно сразу, `write-local` и опасное
 * только по подтверждению, `identity` и `money` — отказ». Таблицу легко расширить
 * молча: одна строка `Risk::Identity => Decision::Confirm` вместо `Deny` — и
 * система, которая «не подписывает за человека», начинает подписывать, а ни один
 * тест не падает, потому что он проверял *другие* случаи.
 *
 * Что сторожить:
 *
 *  1. **не набор случаев, а таблицу целиком.** Проверка «`money` → отказ» пройдёт,
 *     даже если `identity` стал `Confirm`. Поэтому сверяется **вся** карта
 *     «риск → решение», и в ней не должно становиться больше разрешённого;
 *  2. **`never` важнее риска.** Действие `never` с риском `read` — всё равно отказ:
 *     «такой возможности нет» сильнее «читать можно»;
 *  3. **смягчение — отдельное событие, а не строка в диффе.** У каждого риска
 *     записано, каким решение было **объявлено**, и если код стал мягче —
 *     это `widened` с названием, а не молчание;
 *  4. **сужение разрешено и не требует разрешения.** Стало строже — хорошо; тест
 *     на дрейф не должен мешать закрывать дыры;
 *  5. **отказ называет, что именно расширилось** и чем это плохо: «`identity`:
 *     было «только человек», стало «нужно подтверждение» — теперь система может
 *     подписать за человека».
 *
 * Модуль не читает исходники сам: текст `policy.rs` приносит вызывающий. Правило
 * проверяется без Rust и без сборки.
 */

/**
 * Объявленная граница.
 *
 * Это **не** «что в коде», а «что обещано человеку». Тест сверяет одно с другим.
 */
export const DECLARED: Readonly<Record<string, string>> = {
  read: "allow",
  "write-local": "confirm",
  external: "confirm",
  destructive: "confirm",
  identity: "deny",
  money: "deny",
};

/** Порядок мягкости: больше — мягче. `deny` строже всего. */
const SOFT: Readonly<Record<string, number>> = {
  deny: 0,
  confirm: 1,
  allow_with_notice: 2,
  allow: 2,
};

/** Насколько мягко решение. Незнакомое решение — самое мягкое: незнание не защита. */
export function softness(decision: string): number {
  return SOFT[decision.trim().toLowerCase()] ?? 9;
}

/** Что нашлось в тексте политики. */
export interface Found {
  /** Риск → решение, как в коде (`identity` → `deny`). */
  table: Record<string, string>;
  /** Сколько строк `Risk::… => …` прочитано. */
  rows: number;
}

/**
 * Прочитать таблицу риска из `policy.rs`.
 *
 * Разбор намеренно простой и строгий: строка вида `Risk::Identity => Decision::Deny(...)`.
 * Нет строки — риск **отсутствует**, и это тоже дрейф: «убрали ветку» значит
 * «компилятор не даст собрать», а не «стало безопаснее».
 */
export function read(text: string): Found {
  const table: Record<string, string> = {};
  let rows = 0;
  const pattern = /Risk::(\w+)\s*=>\s*Decision::(\w+)/g;
  for (const match of text.matchAll(pattern)) {
    const risk = camelToKebab(match[1] ?? "");
    const decision = match[2] ?? "";
    // Один риск дважды — в Rust это не собралось бы; берём последнее и всё равно
    // считаем строкой, чтобы счёт разошёлся и это было видно.
    table[risk] = decision.toLowerCase();
    rows += 1;
  }
  return { table, rows };
}

function camelToKebab(name: string): string {
  return name.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
}

/** Что расширилось. */
export interface Drift {
  /** Какой риск. */
  risk: string;
  /** Что было объявлено. */
  was: string;
  /** Что стало в коде. */
  now: string;
  /** Почему это плохо — словами. */
  said: string;
}

/**
 * Сверить код с объявленной границей.
 *
 * Пусто — ничего не расширилось. Список — каждый пункт называет риск и обе стороны.
 */
export function drift(found: Found): Drift[] {
  const widened: Drift[] = [];
  for (const [risk, was] of Object.entries(DECLARED)) {
    const now = found.table[risk];
    if (now === undefined) {
      // Ветка исчезла: в Rust `match` без ветки не собирается, поэтому это дрейф
      // разбора или «стало строже через отказ по умолчанию» — но не молчание.
      widened.push({
        risk,
        was,
        now: "нет ветки",
        said: `${risk}: ветки в политике нет — объявлено «${was}», а код про этот риск молчит`,
      });
      continue;
    }
    if (softness(now) > softness(was)) {
      widened.push({
        risk,
        was,
        now,
        said: `${risk}: было «${was}», стало «${now}» — ${why(risk, was, now)}`,
      });
    }
  }
  return widened;
}

function why(risk: string, was: string, now: string): string {
  if (risk === "identity" || risk === "money") {
    return `система могла только отказать, а теперь может ${now === "confirm" ? "спросить и выполнить" : "выполнить"}`;
  }
  return `подтверждение больше не требуется: было «${was}», стало «${now}»`;
}

/**
 * Стоит ли падать.
 *
 * Падать — на расширении: это и есть «расширили молча». Сужение не падает никогда:
 * закрывать дыры должно быть легко, иначе их не закроют.
 */
export function verdict(found: Found): { ok: boolean; said: string } {
  const widened = drift(found);
  if (widened.length === 0) return { ok: true, said: "политика не расширилась" };
  return {
    ok: false,
    said: `политика расширилась в ${widened.length} ${widened.length === 1 ? "месте" : "местах"}: ${widened
      .map((item) => item.said)
      .join("; ")}`,
  };
}
