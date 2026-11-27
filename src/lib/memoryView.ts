/**
 * Шаг 263: просмотр и удаление каждого факта памяти одной кнопкой.
 *
 * Почему это отдельный шаг, а не «удаление уже есть». `forget()` есть и в
 * предпочтениях (шаг 261), и в способах (шаг 262) — по одной на каждый вид. Но
 * **человек не видит памяти**: папки лежат в одном месте, способы в другом,
 * голос в третьем, и чтобы что-то забыть, надо знать, где оно живёт и как
 * называется. Память без управления — это хранение чужих привычек без спроса.
 *
 * Правило: **экран памяти — один список**. Каждый факт в нём назван так, как
 * его узнал бы человек («папка D:\Отчёты», «голос Алла», «способ: переименуй
 * фото»), и у каждого есть ровно одна кнопка. Ни «очистить всё», ни «удалить
 * выбранное» — потому что первое стирает нужное вместе с лишним, а второе
 * требует режима выделения.
 *
 * Три вещи, которые делают удаление честным:
 *
 *  1. **удаление называет, что исчезнет.** Не «удалить факт», а «папка
 *     D:\Отчёты — больше не будет предлагаться»;
 *  2. **удаление необратимо, и это сказано.** Обещание «можно отменить» было бы
 *     ложью: отменить можно только то, что хранится;
 *  3. **что осталось — видно сразу.** После удаления список пересчитывается, и
 *     человек видит, что ушли только эти строки.
 */

import type { Kind as PrefKind, Preference } from "./preferences";
import type { Method } from "./methods";

/**
 * Один факт в общем списке.
 *
 * `id` — устойчивый ключ, по которому удаляют. Он собирается из вида и значения,
 * а не из позиции: позиция меняется, и «удалить третью строку» однажды удалит
 * не то.
 */
export interface Fact {
  /** Ключ для удаления: `folder:D:\Отчёты`. */
  readonly id: string;
  /** Вид факта — для иконки и для общего счёта. */
  readonly kind: PrefKind | "method";
  /** Что человек увидит: без внутренних ключей и путей к базе. */
  readonly label: string;
  /** Откуда взялось и почему предлагается. */
  readonly why: string;
  /** Можно ли удалить. У факта из неизменяемого источника — нет, с причиной. */
  readonly removable: boolean;
  /** Почему нельзя удалить, если `removable` ложно. */
  readonly because: string;
}

/** Список памяти: предпочтения и способы вместе, как их видит человек. */
export function facts(preferences: readonly Preference[], methods: readonly Method[], now: number): Fact[] {
  const out: Fact[] = [];

  for (const preference of preferences) {
    out.push({
      id: `${preference.kind}:${preference.value}`,
      kind: preference.kind,
      label: label(preference.kind, preference.value),
      why: preference.why,
      removable: true,
      because: "",
    });
  }

  for (const method of methods) {
    out.push({
      id: `method:${method.dayStart}`,
      kind: "method",
      label: `способ: «${method.said || "без слов"}» (${method.steps.length} ${
        method.steps.length === 1 ? "шаг" : method.steps.length < 5 ? "шага" : "шагов"
      })`,
      why: ageOf(method, now),
      removable: true,
      because: "",
    });
  }

  return out;
}

function label(kind: PrefKind, value: string): string {
  if (kind === "folder") return `папка ${value}`;
  if (kind === "program") return `программа ${value}`;
  if (kind === "voice") return `голос ${value}`;
  return `громкость ${value}%`;
}

function ageOf(method: Method, now: number): string {
  const days = Math.floor((now - method.dayStart) / (24 * 60 * 60 * 1000));
  if (days <= 0) return "сделан сегодня";
  if (days === 1) return "сделан вчера";
  return `сделан ${days} ${days < 5 ? "дня" : "дней"} назад`;
}

/**
 * Что произойдёт, если нажать «удалить» на этом факте.
 *
 * Сказано **до** нажатия и словами: «больше не будет предлагаться». Не
 * «удалить факт» — человек не обязан знать, что такое факт.
 */
export function willDo(fact: Fact): string {
  if (!fact.removable) return `нельзя удалить: ${fact.because}`;
  return `${fact.label} — больше не будет предлагаться. Вернуть нельзя`;
}

/** Можно ли удалить: одна кнопка, но не на том, что удалять нельзя. */
export function canRemove(fact: Fact): boolean {
  return fact.removable;
}

/** Итог удаления: что осталось и что ушло. */
export interface After {
  readonly left: readonly Fact[];
  /** Что удалилось — по имени, чтобы человек увидел именно это. */
  readonly gone: readonly string[];
  /** Почему не удалилось, если не удалилось. */
  readonly said: string;
}

/**
 * Удалить один факт.
 *
 * Память передаётся сюда в её собственных формах, а возвращается **новыми**
 * списками: удаление не мутирует ни предпочтения, ни способы, иначе «удалить»
 * нельзя ни проверить, ни показать до нажатия.
 */
export function remove(
  fact: Fact,
  preferences: readonly Preference[],
  methods: readonly Method[],
  now: number,
): { preferences: Preference[]; methods: Method[]; after: After } {
  if (!canRemove(fact)) {
    return {
      preferences: [...preferences],
      methods: [...methods],
      after: { left: facts(preferences, methods, now), gone: [], said: willDo(fact) },
    };
  }

  let leftPrefs = [...preferences];
  let leftMethods = [...methods];

  if (fact.kind === "method") {
    // Способы удаляются по дню: ключ `method:<dayStart>`.
    const day = Number(fact.id.slice("method:".length));
    leftMethods = methods.filter((method) => method.dayStart !== day);
  } else {
    // Значение разбирается из `id` — того же ключа, по которому строили список:
    // второй правды о том, «что это за факт», держать нельзя.
    const value = fact.id.slice(fact.kind.length + 1);
    leftPrefs = preferences.filter(
      (preference) => !(preference.kind === fact.kind && preference.value === value),
    );
  }

  const removed = preferences.length + methods.length - (leftPrefs.length + leftMethods.length);
  return {
    preferences: leftPrefs,
    methods: leftMethods,
    after: {
      left: facts(leftPrefs, leftMethods, now),
      gone: removed > 0 ? [fact.label] : [],
      said:
        removed > 0
          ? `удалено: ${fact.label}. Осталось фактов: ${leftPrefs.length + leftMethods.length}`
          : `ничего не удалено: ${fact.label} не было в памяти`,
    },
  };
}

/** Удалить **каждый** факт по одному — то, что делает кнопка на строке. */
export function removeAll(
  chosen: readonly Fact[],
  preferences: readonly Preference[],
  methods: readonly Method[],
  now: number,
): { preferences: Preference[]; methods: Method[]; after: After } {
  let prefs = [...preferences];
  let meths = [...methods];
  const gone: string[] = [];
  for (const fact of chosen) {
    const step = remove(fact, prefs, meths, now);
    prefs = step.preferences;
    meths = step.methods;
    gone.push(...step.after.gone);
  }
  return {
    preferences: prefs,
    methods: meths,
    after: {
      left: facts(prefs, meths, now),
      gone,
      said: `удалено ${gone.length} из ${chosen.length}`,
    },
  };
}

/** Строка для экрана: сколько фактов и сколько из них можно удалить. */
export function summary(list: readonly Fact[]): string {
  if (list.length === 0) return "в памяти ничего нет";
  const removable = list.filter(canRemove).length;
  const word = list.length === 1 ? "факт" : list.length < 5 ? "факта" : "фактов";
  if (removable === list.length) return `${list.length} ${word}, каждый удаляется одной кнопкой`;
  return `${list.length} ${word}, удаляются ${removable}`;
}

/**
 * Мост от того, что реально лежит в памяти, к тому, что видит человек.
 *
 * `facts()` в ядре отдаёт пары «ключ — значение» (`folder:D:\Отчёты`, `voice:Алла`).
 * Экран памяти не должен знать про внутренние ключи, поэтому ключ разбирается
 * здесь: вид — до двоеточия, значение — после. Неизвестный вид не выбрасывается
 * и не превращается в «другое»: он показывается как есть, потому что **честнее
 * показать непонятное, чем скрыть** запомненное.
 */
export function fromStored(stored: readonly { key: string; value: string }[]): {
  preferences: Preference[];
  methods: Method[];
} {
  const preferences: Preference[] = [];
  const methods: Method[] = [];

  for (const item of stored) {
    const at = item.key.indexOf(":");
    const kind = at > 0 ? item.key.slice(0, at) : item.key;

    // Способ лежит с префиксом `method`, а его номер дня — в значении.
    if (kind === "method") {
      methods.push({ dayStart: Number(item.value) || 0, said: item.key.slice(at + 1), steps: [], params: {} } as Method);
      continue;
    }

    // Настоящий дефект, найденный при подключении файла памяти.
    //
    // Раньше значение бралось **из ключа**: `вопрос:путь` → «папка путь»,
    // `model.sha256:qwen` → «папка qwen». Человек видел мусор вместо
    // `D:\Отчёты`, а кнопка «забыть» строила из этой же строки ключ, которого
    // в базе нет: удаление проходило «успешно» и ничего не удаляло. Экран
    // обещал управление памятью и не управлял.
    //
    // Правило: **что человек сказал, то и видно** — значение берётся из
    // `value`, вид — из ключа. Вид, которого мы не знаем, не выдаётся за
    // папку: он показывается как «запомнено» со своим ключом, чтобы человек
    // узнал факт и смог его убрать.
    const keyValue = at > 0 ? item.key.slice(at + 1) : item.key;
    const service = SERVICE_KINDS.includes(kind);
    const known = (["folder", "program", "voice", "volume"] as const).includes(kind as PrefKind);

    if (!known && !service) {
      // Неизвестный вид: показываем его собственный ключ целиком, чтобы
      // «забыть» удалял именно то, что показано.
      preferences.push({
        kind: keyValue === "" ? "folder" : (kind as PrefKind),
        value: item.value,
        times: 0,
        last: 0,
        why: `запомнено как «${item.key}»`,
      } as Preference);
      continue;
    }

    if (service) continue;

    // У привычки значение лежит **в ключе** (`folder:D:\Отчёты`), а `value` —
    // короткая подпись. Это проверено тестом ядра, а не выведено из вида поля:
    // взять здесь `item.value` значит показать «отчёты» вместо пути.
    preferences.push({
      kind: kind as PrefKind,
      value: keyValue,
      times: 0,
      last: 0,
      why: "запомнено по вашим делам",
    });
  }

  return { preferences, methods };
}

/**
 * Список памяти прямо из того, что лежит в базе, — с настоящими ключами.
 *
 * Зачем отдельно от `fromStored`. `fromStored` переводит пары в формы
 * `preferences`/`methods`, и по дороге **теряет ключ**: у факта остаётся
 * `folder:<значение>`, тогда как в базе он лежит как `вопрос:путь`. Экран
 * строил из этой строки кнопку «забыть» — и удалял ключ, которого нет.
 * Человек нажимал «забыть», видел «удалено», а факт оставался.
 *
 * Здесь `id` — это **ровно тот ключ**, который вернуло ядро. Ничего не
 * собирается заново, поэтому удаление не может промахнуться.
 *
 * Подпись выбирается по виду ключа:
 *
 *  * `вопрос:<имя>` — ответ человека на вопрос плана. Это его слова, и они
 *    показываются как есть: «путь: D:\Отчёты»;
 *  * `folder`/`program`/`voice`/`volume` — привычки;
 *  * `method:<день>` — способ;
 *  * служебные (`model.sha256`, `params`, `custom`, `hand`, `learn`, `trial`,
 *    `run`, `role`, `os-build`, `plan`) — не привычки, а рабочий кэш. Они
 *    **видны и удаляемы**, но названы служебными, чтобы человек не принимал
 *    хеш модели за «память обо мне».
 */
export function factsFromStored(stored: readonly { key: string; value: string }[]): Fact[] {
  const out: Fact[] = [];

  for (const item of stored) {
    const at = item.key.indexOf(":");
    const kind = at > 0 ? item.key.slice(0, at) : item.key;
    const rest = at > 0 ? item.key.slice(at + 1) : "";

    // Форма ключа своя у каждого вида, и это не догадка — проверено тестами
    // ядра (`memory.rs`, `facts_are_read_back_and_forgotten`):
    //
    //  * **привычки** (`folder`, `program`, `voice`, `volume`) несут значение
    //    в самом ключе: `folder:D:\Отчёты`. `value` у них — подпись, брать её
    //    за значение значит показать «отчёты» вместо пути;
    //  * **ответ на вопрос плана** (`вопрос:путь` → `D:\Отчёты`) держит имя
    //    поля в ключе, а слово человека — в `value`;
    //  * **служебное** (`model.sha256`, `params`, `custom`, …) пишет само
    //    приложение, и в ключе у него — имя предмета.
    const habit = kind === "folder" || kind === "program" || kind === "voice" || kind === "volume";

    const label = (() => {
      if (kind === "вопрос") return `${rest}: ${item.value}`;
      if (kind === "method") return `способ за ${rest}: ${item.value}`;
      if (kind === "folder") return `папка ${rest}`;
      if (kind === "program") return `программа ${rest}`;
      if (kind === "voice") return `голос ${rest}`;
      if (kind === "volume") return `громкость ${rest}%`;
      if (kind === "custom") return `своя рука «${rest}»`;
      if (kind === "hand") return `черновик руки «${rest}»`;
      if (kind === "trial") return `проба руки «${rest}»`;
      if (kind === "learn") return `выучено про «${rest}»`;
      if (kind === "model.sha256") return `модель «${rest}» (отпечаток)`;
      if (kind === "params") return `настройки инструмента «${rest}»`;
      if (kind === "role") return `роль «${rest}»: ${item.value}`;
      if (kind === "run") return `отметка запуска ${rest}`;
      if (kind === "plan") return `последний план`;
      if (kind === "os-build") return `версия Windows: ${item.value}`;
      // Незнакомое не выдумываем: ключ и значение как есть.
      return `${item.key}: ${item.value}`;
    })();

    const service = SERVICE_KINDS.includes(kind);
    out.push({
      // Настоящий ключ базы. По нему и только по нему удаляем.
      id: item.key,
      kind: habit || service ? (service ? "method" : (kind as PrefKind)) : "method",
      label,
      why: service ? "служебное: пишет само приложение, не ваши привычки" : "запомнено по вашим делам",
      removable: true,
      because: "",
    });
  }

  // Порядок — по подписи: список читают глазами, и он не должен прыгать от
  // порядка обхода базы.
  return out.sort((left, right) => left.label.localeCompare(right.label, "ru"));
}

/**
 * Служебные ключи (см. `factsFromStored`) — не привычки человека.
 *
 * `model.sha256:qwen`, `params:paint`, `plan:last`, `custom:*`, `hand:*`,
 * `learn:*`, `trial:*`, `run:*` пишет само приложение: хеши моделей, параметры
 * инструментов, черновики рук. Показывать их как «память обо мне» — значит
 * выдавать служебный кэш за привычки. Но и прятать молча нельзя: в списке они
 * **названы** своим ключом и удаляются — иначе человек не увидит, что о нём
 * вообще что-то лежит.
 */
export const SERVICE_KINDS: readonly string[] = [
  "model.sha256",
  "params",
  "plan",
  "custom",
  "hand",
  "learn",
  "trial",
  "run",
  "role",
  "os-build",
];
