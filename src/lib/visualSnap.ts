/**
 * Шаг 246: снимок «до/после» для каждой крупной правки интерфейса.
 *
 * Почему не картинки. `toHaveScreenshot` в этом репозитории не работает: браузера
 * в CI нет, а снимок, который не с кем сравнить, — это файл в репозитории, а не
 * проверка. Пиксельное сравнение к тому же ловит любую правку шрифта и молчит о
 * настоящем: «всё сдвинулось на 1 px» и «кнопка пропала» для него одно и то же.
 *
 * Что вместо: **описание экрана, которое можно сравнить**. Для каждой крупной
 * правки сохраняется перечень того, что обязано быть видно: имя экрана, элементы,
 * их порядок, подписи и признаки (доступность, фокус, цели касания). Сравнение
 * двух описаний отвечает на вопрос, который задают на самом деле: **что
 * изменилось и было ли это нарочно**.
 *
 * Правила:
 *
 *  1. **снимок — данные, а не картинка.** Его можно прочитать в отчёте и понять,
 *     что сломалось, не открывая файл;
 *  2. **сравнение называет разницу**, а не «не совпало»: «кнопка «Отменить»
 *     пропала», «подпись «Повторить» стала «Повторить ещё раз»»;
 *  3. **пропавшее — важнее появившегося.** Новая кнопка обычно нарочно;
 *     исчезнувшая — почти всегда регрессия, и она называется первой;
 *  4. **снимок не «обновляется» молча.** Если описание не совпало, это либо
 *     правка (тогда снимок меняют осознанно, вместе с причиной), либо поломка.
 *     Автоматическое «перезаписать» делает проверку бесполезной в первый же день.
 */

/** Один видимый элемент экрана — то, что обязано быть на месте. */
export interface Element {
  /** Устойчивый ключ: по нему сравнивают, а не по подписи. */
  readonly key: string;
  /** Что написано человеку. */
  readonly label: string;
  /** Роль для диктора: `button`, `link`, `heading` … */
  readonly role: string;
  /** Доступен ли с клавиатуры: у кнопки, которую нельзя нажать с Tab, это ложь. */
  readonly focusable: boolean;
  /** Цель касания, px. Ноль — не интерактивный элемент. */
  readonly target: number;
}

/** Снимок экрана: имя и элементы в порядке появления. */
export interface Snapshot {
  /** Экран: `Главная`, `Настройки`, `Руки` … */
  readonly screen: string;
  /** Зачем снят — правка, к которой он относится. */
  readonly why: string;
  /** Элементы **в порядке** появления: порядок — часть интерфейса. */
  readonly elements: readonly Element[];
}

/** Разница между двумя снимками — по видам, а не списком строк. */
export interface Diff {
  /** Пропало: почти всегда регрессия, называется первой. */
  readonly gone: readonly string[];
  /** Появилось: обычно нарочно, но требует объяснения. */
  readonly added: readonly string[];
  /** Изменилось: подпись, роль, доступность, цель. */
  readonly changed: readonly string[];
  /** Переставили: порядок — часть интерфейса, а не оформление. */
  readonly moved: readonly string[];
}

/** Пусто ли: снимки совпали. */
export function empty(diff: Diff): boolean {
  return (
    diff.gone.length === 0 &&
    diff.added.length === 0 &&
    diff.changed.length === 0 &&
    diff.moved.length === 0
  );
}

/**
 * Сравнить два снимка.
 *
 * Ключ элемента — его `key`, а не подпись: переименование подписи не должно
 * выглядеть как «пропал один, появился другой». Иначе каждая правка текста
 * давала бы два события вместо одного, и настоящая пропажа тонула бы в шуме.
 */
export function diff(before: Snapshot, after: Snapshot): Diff {
  const was = new Map(before.elements.map((element) => [element.key, element]));
  const now = new Map(after.elements.map((element) => [element.key, element]));

  const gone: string[] = [];
  const added: string[] = [];
  const changed: string[] = [];
  const moved: string[] = [];

  for (const [key, element] of was) {
    const other = now.get(key);
    if (!other) {
      gone.push(`«${element.label}» (${element.role}) пропал`);
      continue;
    }
    if (element.label !== other.label) {
      changed.push(`подпись «${element.label}» стала «${other.label}»`);
    }
    if (element.role !== other.role) {
      changed.push(`элемент «${other.label}»: роль ${element.role} → ${other.role}`);
    }
    if (element.focusable !== other.focusable) {
      // Это не «мелочь вёрстки»: кнопка, которую нельзя нажать с клавиатуры,
      // для части людей не существует.
      changed.push(
        element.focusable
          ? `элемент «${other.label}» перестал быть доступен с клавиатуры`
          : `элемент «${other.label}» теперь доступен с клавиатуры`,
      );
    }
    if (element.target !== other.target) {
      changed.push(`цель касания «${other.label}»: ${element.target} → ${other.target} px`);
    }
  }

  for (const [key, element] of now) {
    if (!was.has(key)) added.push(`«${element.label}» (${element.role}) появился`);
  }

  // Порядок сравнивается по общим элементам: пропавшие и новые уже названы.
  const shared = before.elements
    .map((element) => element.key)
    .filter((key) => now.has(key));
  const sharedAfter = after.elements
    .map((element) => element.key)
    .filter((key) => was.has(key));
  for (let index = 0; index < Math.min(shared.length, sharedAfter.length); index += 1) {
    if (shared[index] !== sharedAfter[index]) {
      const key = sharedAfter[index]!;
      moved.push(`«${now.get(key)!.label}» переехал с места ${index + 1}`);
    }
  }

  return { gone, added, changed, moved };
}

/**
 * Строка для отчёта: сначала пропавшее, потом переставленное, потом изменённое,
 * потом новое.
 *
 * Порядок не косметический: пропажа — регрессия, и её видно первой. Новое
 * обычно нарочно и читается последним.
 */
export function report(before: Snapshot, after: Snapshot): string {
  const got = diff(before, after);
  if (empty(got)) {
    return `${after.screen}: без изменений (${after.elements.length} элементов)`;
  }
  const parts: string[] = [];
  if (got.gone.length > 0) parts.push(`пропало ${got.gone.length}: ${got.gone.join("; ")}`);
  if (got.moved.length > 0) parts.push(`переехало ${got.moved.length}: ${got.moved.join("; ")}`);
  if (got.changed.length > 0) parts.push(`изменилось ${got.changed.length}: ${got.changed.join("; ")}`);
  if (got.added.length > 0) parts.push(`появилось ${got.added.length}: ${got.added.join("; ")}`);
  return `${after.screen}: ${parts.join("; ")}`;
}

/**
 * Можно ли принять разницу за правку.
 *
 * Правка называется **вслух**: у неё есть причина и список того, что меняется.
 * Иначе снимок молча перезаписывается, и проверка перестаёт что-либо значить —
 * это главная причина, по которой визуальные тесты отключают.
 */
export function accepted(got: Diff, why: string): { ok: boolean; said: string } {
  if (empty(got)) return { ok: true, said: "разницы нет — правка не потребовалась" };
  if (!why.trim()) {
    return {
      ok: false,
      said: "разница есть, а причины нет: снимок не перезаписывается молча",
    };
  }
  if (got.gone.length > 0) {
    return {
      ok: false,
      said: `пропало ${got.gone.length} — правка не может убирать элементы без явного списка`,
    };
  }
  return { ok: true, said: `правка принята: ${why}` };
}
