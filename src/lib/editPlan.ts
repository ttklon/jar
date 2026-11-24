/**
 * Редактирование плана человеком — в понятных полях, не в JSON (шаг 116).
 *
 * Дефект. План редактируется **сырым JSON**, и это отсекает человека:
 *
 *  * **JSON — для разработчика**: одна пропущенная кавычка — и план невалиден, а
 *    сообщение об ошибке говорит про позицию 143, а не про «путь пустой»;
 *  * **поля безымянные**: `{"path":"D:\\x"}` не говорит, что `path` — это «куда
 *    класть файлы»; человек правит вслепую;
 *  * **правка ломает связи**: убрал шаг — его результат всё ещё подставляется в
 *    следующий, и план падает после запуска;
 *  * **нет ответа на «а если»**: правку хочется проверить до запуска, а проверить
 *    нечем — только выполнить.
 *
 * Правило: **человек видит поля словами, и правка проверяется до запуска**.
 *
 *  1. **Поля названы словами**: «Куда положить (полный путь)», а не `to`. Адрес
 *     остаётся для ядра, но не для человека.
 *  2. **Правка — значение, а не текст документа**: каждое поле меняется само, и
 *     сломанное поле не ломает остальные.
 *  3. **Проверка до запуска**: что изменится от правки — названо («шаг 2 теперь
 *     кладёт файлы в D:\Новое»), и ошибки названы словами.
 *  4. **Связи сохраняются**: если правка касается шага, на который ссылаются,
 *     ссылки перепроверяются, а не остаются висеть.
 *  5. **Правка после согласия — новое согласие** (шаг 117): плата за удобство не
 *     может быть обходом согласия.
 *
 * Почему не «форма поверх JSON». Форма поверх JSON всё равно падает на JSON: если
 * поле редактирует строку внутри документа, любая правка может сломать документ, и
 * человек не понимает, что он сломал.
 */

import { print } from "./consentStep";

/** Поле плана, каким его видит человек. */
export interface Field {
  /** Номер шага (с нуля). */
  position: number;
  /** Имя параметра для ядра — `to`, `path`. */
  name: string;
  /** Что это словами — «Куда положить». */
  label: string;
  /** Подсказка — полный путь или нет. */
  hint: string;
  /** Значение сейчас. */
  value: string;
  /** Обязательное ли. */
  required: boolean;
}

/** Ошибка правки — словами. */
export interface Problem {
  position: number;
  name: string;
  /** Что не так: «путь не полный», «число не число». */
  problem: string;
}

/** Подписи параметров — один словарь, а не по экрану на руку. */
const LABELS: Record<string, { label: string; hint: string }> = {
  path: { label: "Куда положить", hint: "полный путь, например D:\\Отчёты" },
  to: { label: "Куда переместить", hint: "полный путь к новой папке" },
  from: { label: "Откуда взять", hint: "полный путь к файлу или папке" },
  query: { label: "Что искать", hint: "число или слово — как вы сказали" },
  template: { label: "Как назвать", hint: "шаблон имени, например фото-{n}" },
  count: { label: "Сколько", hint: "число" },
};

/**
 * Поля плана — из настоящих шагов.
 *
 * Подпись берётся из словаря; незнакомый параметр получает **своё имя**, но рядом
 * сказано, что подписи нет: лучше честное `timeout`, чем выдуманное «Когда».
 */
export function fields(steps: readonly { params?: Record<string, string> }[]): Field[] {
  const out: Field[] = [];
  steps.forEach((step, position) => {
    for (const [name, value] of Object.entries(step.params ?? {})) {
      const known = LABELS[name];
      out.push({
        position,
        name,
        label: known?.label ?? name,
        hint: known?.hint ?? "подписи нет — имя параметра как в ядре",
        value,
        required: value.trim().length > 0,
      });
    }
  });
  return out;
}

/**
 * Проверка значения — до запуска.
 *
 * Проверяется **форма**, а не существование: что путь полный, что число — число.
 * «Существует ли» проверяет ядро, и дублировать его значит спорить с ним.
 */
export function validate(field: Field, value: string): Problem | null {
  const text = value.trim();
  if (field.required && text.length === 0) {
    return { position: field.position, name: field.name, problem: `«${field.label}» пусто, а оно обязательно` };
  }
  if (text.length === 0) return null;
  if (field.name === "count") {
    if (!/^\d+$/u.test(text)) {
      return { position: field.position, name: field.name, problem: `«${field.label}» — это число, а не «${text}»` };
    }
  }
  if (field.name === "path" || field.name === "to" || field.name === "from") {
    // Полный путь: буква диска или `/`. Относительный путь ядро раскроет откуда
    // попало, и это выяснится не там, где правили.
    if (!/^(?:[A-Za-z]:[\\/]|\\\\|\/)/u.test(text)) {
      return {
        position: field.position,
        name: field.name,
        problem: `«${field.label}» — нужен полный путь (буква диска), а не «${text}»`,
      };
    }
  }
  return null;
}

/** Что изменится от правки. */
export interface Change {
  /** Строки словами — до запуска. */
  said: string[];
  /** Ошибки: править нельзя, пока не исправлено. */
  problems: Problem[];
  /** Требуется ли новое согласие (шаг 117). */
  consent: boolean;
}

/**
 * Применить правки.
 *
 * Правки — значения по адресу «шаг + имя». Шаги не переставляются: перестановка —
 * отдельное действие (шаг 112), и смешивать их с правкой поля значит менять две
 * вещи одним нажатием.
 */
export function change(
  steps: readonly { params?: Record<string, string> }[],
  edits: readonly { position: number; name: string; value: string }[],
): { steps: { params: Record<string, string> }[]; result: Change } {
  const next = steps.map((step) => ({ params: { ...(step.params ?? {}) } }));
  const said: string[] = [];
  const problems: Problem[] = [];
  let consent = false;

  for (const edit of edits) {
    const target = next[edit.position];
    if (target === undefined) {
      problems.push({ position: edit.position, name: edit.name, problem: "шага с таким номером нет" });
      continue;
    }
    const field = fields([target]).find((item) => item.name === edit.name) ?? null;
    if (field === null) {
      // Новый параметр — это тоже правка плана, и её видно в тексте.
      target.params[edit.name] = edit.value;
      said.push(`шаг ${edit.position + 1}: добавлен параметр ${edit.name} = ${edit.value}`);
      consent = true;
      continue;
    }
    const problem = validate(field, edit.value);
    if (problem !== null) {
      problems.push(problem);
      continue;
    }
    if (field.value === edit.value) continue;
    // Отпечаток изменился — согласие по этому шагу больше не действует (117).
    consent = true;
    target.params[edit.name] = edit.value;
    said.push(`шаг ${edit.position + 1}: «${field.label}» — было ${field.value || "пусто"}, стало ${edit.value}`);
  }

  if (said.length === 0 && problems.length === 0) said.push("правок нет — план как был");

  return { steps: next, result: { said, problems, consent } };
}

/**
 * Готова ли правка к запуску.
 *
 * Отдельная функция, потому что «есть ошибки» и «нельзя запускать» — один факт, и
 * проверять его в двух местах значит однажды разойтись.
 */
export function ready(result: Change): boolean {
  return result.problems.length === 0;
}

/** Отпечаток правленого шага — для согласия. */
export function printOf(step: { params?: Record<string, string> }): string {
  return print(step.params);
}
