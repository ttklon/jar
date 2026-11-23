/**
 * Роль → модель, а не «одна на всё» (шаг 62).
 *
 * Дефект. Одна модель делает всё: понимает фразу, планирует, пишет код,
 * разговаривает. И выходит посредственно во всём, потому что требования
 * разные и **враждебные**:
 *
 *  * понять фразу — нужно **быстро** (человек ждёт) и **дешево** (это тысячи
 *    вызовов в день), а качества хватит небольшого. Большая модель здесь
 *    тратит секунды и память впустую;
 *  * написать код — нужен **сложный** вывод, и ошибка дороже секунды. Маленькая
 *    модель здесь уверенно пишет неверное;
 *  * разговор — нужен **характер и контекст**, а не точность;
 *  * план — нужен **порядок шагов** и понимание последствий.
 *
 * Правило: у каждой роли **своя модель**, и выбор назван причиной.
 *
 * Почему не «всегда лучшую». Лучшая на каждой фразе — это секунды ожидания на
 * «открой блокнот» и гигабайты памяти, занятые ради «да». Человек судит по
 * первому ответу, а первый ответ — самый простой.
 *
 * Почему не «всегда маленькую». На коде и плане она ошибается уверенно, а
 * ошибка в плане — это выполненное не то действие.
 */

/** Роль: что именно делаем. */
export type Role = "intent" | "chat" | "plan" | "code" | "embed";

/**
 * Требование к модели: что для роли важнее.
 *
 * Названо, потому что это **причина** выбора, а не украшение: если модель не
 * отвечает требованию, видно, чем именно она не подходит.
 */
export type Need = "speed" | "quality" | "balance" | "meaning";

/** Что известно о модели, чтобы выбрать. */
export interface Model {
  /** Короткое имя для человека: «0.5B», «7B». */
  name: string;
  /** Размер в мегабайтах — от него зависит память и скорость загрузки. */
  sizeMb: number;
  /** Умеет ли писать код. */
  code: boolean;
  /** Умеет ли строить эмбеддинги (для поиска по смыслу). */
  embed: boolean;
}

/** Выбор: роль, модель и почему. */
export interface Choice {
  role: Role;
  need: Need;
  /** Выбранная модель или `null`, если подходящей нет. */
  model: Model | null;
  /** Почему выбрана именно она — или почему не выбрана никакая. */
  why: string;
}

/**
 * Порог «хватает для кода».
 *
 * Меньше 3B код пишут уверенно неверно: синтаксис помнят, смысл — нет. Порог
 * назван числом, чтобы его можно было оспорить, а не спрятать в условии.
 */
export const CODE_MIN_MB = 2000;

/**
 * Требование роли.
 *
 * `intent` — скорость важнее всего: это тысячи вызовов, и ждать их человек не
 * будет. `chat` — баланс: разговор не требует точности, но требует не тупить.
 * `plan` и `code` — качество: ошибка дороже секунды. `embed` — не генерация
 * вовсе, а смысл.
 */
export function need(role: Role): Need {
  switch (role) {
    case "intent":
      return "speed";
    case "chat":
      return "balance";
    case "plan":
    case "code":
      return "quality";
    case "embed":
      return "meaning";
  }
}

/**
 * Выбрать модель для роли.
 *
 * Выбор **объяснён**: человек должен видеть, почему «открой блокнот» отвечает
 * быстрая модель, а план — большая. Иначе разница в скорости выглядит как
 * нестабильность.
 *
 * Возвращает `null`, если подходящей нет: лучше сказать «нечем», чем взять
 * неподходящую и сделать вид, что всё хорошо.
 */
export function choose(role: Role, models: readonly Model[]): Choice {
  const want = need(role);
  const why = (model: Model, reason: string): Choice => ({ role, need: want, model, why: reason });
  const none = (reason: string): Choice => ({ role, need: want, model: null, why: reason });

  if (models.length === 0) return none("моделей нет — выбрать не из чего");

  if (want === "meaning") {
    const usable = models.filter((model) => model.embed);
    if (usable.length === 0) return none("для поиска по смыслу нужна модель эмбеддингов, а её нет");
    // Эмбеддинги — не генерация: скорость и размер важнее «ума».
    const smallest = usable.reduce((best, model) => (model.sizeMb < best.sizeMb ? model : best));
    return why(smallest, "поиск по смыслу: нужна модель эмбеддингов, и хватает самой маленькой");
  }

  if (want === "quality") {
    // Код требует умения: модель без него не берём, даже если она большая.
    const pool = role === "code" ? models.filter((model) => model.code && model.sizeMb >= CODE_MIN_MB) : models;
    if (pool.length === 0) {
      return none(
        role === "code"
          ? `для кода нужна модель от ${CODE_MIN_MB} МБ, которая умеет код, — такой нет`
          : "подходящей модели нет",
      );
    }
    const speakers = pool.filter((model) => !model.embed);
    const biggest = speakers.reduce<Model | undefined>(
      (best, model) => (best === undefined || model.sizeMb > best.sizeMb ? model : best),
      undefined,
    );
    if (biggest === undefined) return none("для ответов нужна модель, которая умеет говорить, — такой нет");
    return why(
      biggest,
      role === "code"
        ? "код: ошибка дороже секунды, берём самую сильную, которая умеет код"
        : "план: ошибка в плане — это выполненное не то действие",
    );
  }

  if (want === "speed") {
    // Только **генераторы**: модель эмбеддингов не умеет отвечать словами, и
    // взять её за «самую маленькую» значит получить пустой ответ на фразу.
    const pool = models.filter((model) => !model.embed);
    const smallest = pool.reduce<Model | undefined>(
      (best, model) => (best === undefined || model.sizeMb < best.sizeMb ? model : best),
      undefined,
    );
    return smallest
      ? why(smallest, "понять фразу: тысячи вызовов в день — скорость важнее глубины")
      : none("для ответов нужна модель, которая умеет говорить, — такой нет");
  }

  // Баланс: средняя по размеру среди генераторов. Не самая маленькая (тупит в
  // разговоре) и не самая большая (ждём зря). Эмбеддинги — не разговор.
  const sorted = models
    .filter((model) => !model.embed)
    .sort((left, right) => left.sizeMb - right.sizeMb);
  const middle = sorted[Math.floor((sorted.length - 1) / 2)];
  return middle
    ? why(middle, "разговор: нужен характер и контекст, но не точность до последней цифры")
    : none("подходящей модели нет");
}

/**
 * Собрать выбор для всех ролей сразу.
 *
 * Один раз, а не по требованию: человек должен видеть картину целиком — какие
 * модели будут работать на его машине и сколько это памяти.
 */
export function plan(models: readonly Model[]): Choice[] {
  const roles: Role[] = ["intent", "chat", "plan", "code", "embed"];
  return roles.map((role) => choose(role, models));
}

/**
 * Сколько памяти займут выбранные модели.
 *
 * Не сумма всех доступных, а сумма **выбранных**: человек решает, влезет ли это
 * на его машину (шаг 61).
 */
export function memoryMb(choices: readonly Choice[]): number {
  const seen = new Set<string>();
  let total = 0;
  for (const choice of choices) {
    if (choice.model === null) continue;
    if (seen.has(choice.model.name)) continue;
    seen.add(choice.model.name);
    total += choice.model.sizeMb;
  }
  return total;
}

/**
 * Что сказать человеку: какая модель на что и почему.
 *
 * Причина названа, а не только имя: иначе разная скорость ответов выглядит как
 * нестабильность.
 */
export function say(choices: readonly Choice[]): string[] {
  return choices.map((choice) => {
    const name = choice.model === null ? "нет модели" : choice.model.name;
    return `${roleWord(choice.role)}: ${name} — ${choice.why}`;
  });
}

/** Название роли по-русски: в интерфейсе «intent» читается как сбой. */
export function roleWord(role: Role): string {
  switch (role) {
    case "intent":
      return "понять фразу";
    case "chat":
      return "разговор";
    case "plan":
      return "план";
    case "code":
      return "код";
    case "embed":
      return "поиск по смыслу";
  }
}
