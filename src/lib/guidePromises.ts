/**
 * Шаг 462: каждое обещание GUIDE проверяется тестом или ссылкой на реестр.
 *
 * Документация обещает: «почистит загрузки», «покажет список до удаления»,
 * «спросит подтверждение». Каждое такое обещание должно быть **связано** с чем-то
 * проверяемым — тестом или записью в реестре действий. Иначе через полгода в
 * руководстве останутся обещания, которых никто не проверял, и одно из них
 * окажется ложью.
 *
 * Как связать. В GUIDE у каждого обещания — невидимая ссылка: `[фраза](#action:id)`
 * или `<!-- test: src/lib/dangerPolicy.test.ts -->`. Проверка идёт по ссылкам:
 *
 *  * **обещание без ссылки** — ошибка: его нечем проверить;
 *  * **ссылка на несуществующее** — ошибка: обещание устарело;
 *  * **ссылка на тест, которого нет** — тоже.
 *
 * Главное: проверка идёт **в CI**, а не глазами при правке (шаг 470).
 */

/** Обещание в документе. */
export interface Promise_ {
  /** Что обещано — фраза из GUIDE. */
  readonly text: string;
  /** Ссылка: `action:...` или `test:...`; `null` — не связано. */
  readonly link: string | null;
}

/**
 * Найти непроверяемые обещания.
 *
 * Возвращает **их тексты**, а не число: при падении нужно видеть, что именно
 * осталось без проверки.
 */
export function unchecked(promises: readonly Promise_[]): string[] {
  return promises.filter((promise) => promise.link === null || promise.link.trim() === "").map((promise) => promise.text);
}

/**
 * Проверить ссылки.
 *
 * `known` — что существует: id действий из реестра и пути тестов.
 */
export function broken(promises: readonly Promise_[], known: readonly string[]): { text: string; link: string; why: string }[] {
  const out: { text: string; link: string; why: string }[] = [];

  for (const promise of promises) {
    if (promise.link === null || promise.link.trim() === "") continue;
    const [kind, target] = splitLink(promise.link);

    if (kind === null) {
      out.push({ text: promise.text, link: promise.link, why: "ссылка не по форме: нужно `action:…` или `test:…`" });
      continue;
    }
    if (target === "") {
      out.push({ text: promise.text, link: promise.link, why: "ссылка пустая: после двоеточия ничего нет" });
      continue;
    }
    if (!known.includes(promise.link)) {
      out.push({ text: promise.text, link: promise.link, why: kind === "test" ? "такого теста нет: обещание устарело" : "такого действия нет в реестре" });
    }
  }

  return out;
}

/** Разобрать ссылку. */
function splitLink(link: string): [string | null, string] {
  const at = link.indexOf(":");
  if (at === -1) return [null, ""];
  const kind = link.slice(0, at);
  if (kind !== "action" && kind !== "test") return [null, ""];
  return [kind, link.slice(at + 1)];
}

/**
 * Сводка для CI.
 *
 * Пустой список — можно мержить. Иначе — ошибка с перечнем.
 */
export function report(promises: readonly Promise_[], known: readonly string[]): { ok: boolean; said: string } {
  const without = unchecked(promises);
  const bad = broken(promises, known);
  if (without.length === 0 && bad.length === 0) return { ok: true, said: `все ${promises.length} обещаний связаны с проверкой` };

  const parts: string[] = [];
  if (without.length > 0) parts.push(`без проверки: ${without.join("; ")}`);
  if (bad.length > 0) parts.push(...bad.map((item) => `«${item.link}» — ${item.why}`));
  return { ok: false, said: parts.join(". ") };
}

/**
 * Что считается проверкой.
 *
 * Два вида ссылок, и третьего нет: «мы проверили руками» — не проверка.
 */
export function kinds(): string[] {
  return ["action:<id> — действие в реестре", "test:<путь> — тест, который падает при поломке"];
}

/**
 * Что не делает связывание.
 *
 * Три запрета, и все про честность ссылок.
 */
export function notDo(): string[] {
  return [
    "не считает проверкой «мы посмотрели глазами»: только тест или реестр",
    "не разрешает обещание без ссылки: такое обещание устареет первым",
    "не пропускает ссылку на несуществующий тест: это обещание, которого уже нет",
  ];
}
