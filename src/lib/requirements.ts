/**
 * Шаг 231: минимальные требования и окно «машина слабее — вот что будет иначе».
 *
 * Почему «что будет иначе», а не «не поддерживается». Слабая машина — не отказ.
 * На 8 ГБ приложение запустится и будет работать: медленнее, без больших моделей,
 * без части удобств. Сказать «не поддерживается» — соврать в обе стороны: и про
 * то, что не запустится, и про то, что всё будет как на сильной.
 *
 * Порядок, который держит этот модуль:
 *
 *  1. **минимум назван числами**, и он — порог запуска, а не порог комфорта;
 *  2. **между минимумом и комфортом** человек получает окно со списком «чего не
 *     будет» — до начала работы, а не после первой неудачи;
 *  3. **ниже минимума** — честный отказ с причиной, а не тихая попытка, которая
 *     зависнет на загрузке модели;
 *  4. **на сильной машине окна нет**: предупреждение там, где всё в порядке, —
 *     шум, и его перестают читать.
 *
 * Отдельно: «иначе» — это список **следствий**, а не чисел. «8 ГБ» человек не
 * переводит в ожидание; «большая модель не поместится, ответы будут короче и
 * проще» — переводит.
 */

import type { Class, Profile } from "./machineProfile";

/** Порог запуска. Ниже — приложение не обещает работать. */
export const MINIMUM = {
  ramMb: 4 * 1024,
  cores: 2,
  /** Место для самого приложения и одной маленькой модели. */
  freeDiskMb: 3 * 1024,
} as const;

/** Порог комфорта: ниже него — работа, но с оговорками. */
export const COMFORT = {
  ramMb: 16 * 1024,
  cores: 8,
} as const;

/** Что человеку сказали. */
export type Verdict =
  | { state: "fine"; why: string }
  | { state: "reduced"; why: string; lost: string[] }
  | { state: "below"; why: string; what: string };

/** Что именно будет иначе на такой машине — следствия, а не числа. */
export function lost(profile: Profile): string[] {
  const items: string[] = [];
  const ramGb = profile.ramMb / 1024;

  if (ramGb < 8) {
    items.push("большая модель не поместится: ответы будут короче и проще");
  } else if (ramGb < COMFORT.ramMb / 1024) {
    items.push("модель побольше не поместится вместе с открытыми программами");
  }
  if (profile.cores < COMFORT.cores) {
    items.push("считать будет медленнее: ответ начнётся позже, чем на 8 ядрах");
  }
  if (!profile.gpu.found || profile.gpu.vramMb < 2048) {
    items.push("без видеокарты считает процессор — медленнее, но работает");
  }
  if (profile.disk === "hdd") {
    items.push("первый запуск дольше: модель читается с медленного диска");
  }
  return items;
}

/**
 * Решение по машине.
 *
 * Три состояния, а не «ок/не ок»: `fine` (как обещано), `reduced` (работает,
 * но иначе — со списком), `below` (не обещаем). `reduced` — не ошибка, и текст
 * это говорит.
 */
export function judge(profile: Profile): Verdict {
  const ramGb = Math.round(profile.ramMb / 1024);

  if (profile.ramMb < MINIMUM.ramMb || profile.cores < MINIMUM.cores) {
    return {
      state: "below",
      why:
        `нужно не меньше ${MINIMUM.ramMb / 1024} ГБ памяти и ${MINIMUM.cores} ядер, ` +
        `а на этой машине ${ramGb} ГБ и ${profile.cores} ${profile.cores === 1 ? "ядро" : "ядер"}`,
      what:
        "Приложение не обещает работать на этой машине: модель не поместится, и запуск " +
        "закончится не отказом, а зависанием — это хуже отказа, поэтому говорю заранее.",
    };
  }

  const items = lost(profile);
  if (items.length > 0) {
    return {
      state: "reduced",
      why: `${ramGb} ГБ памяти, ${profile.cores} ядер — работать будет, но не так, как на сильной`,
      lost: items,
    };
  }

  return {
    state: "fine",
    why: `${ramGb} ГБ памяти, ${profile.cores} ядер — всё как обещано`,
  };
}

/** Нужно ли показать окно. На сильной машине — нет: шум перестают читать. */
export function needsWindow(verdict: Verdict): boolean {
  return verdict.state !== "fine";
}

/** Можно ли начинать работу. `below` — нет, и это сказано причиной. */
export function canStart(verdict: Verdict): boolean {
  return verdict.state !== "below";
}

/** Строка для окна: одна мысль, а не абзац. */
export function headline(verdict: Verdict): string {
  switch (verdict.state) {
    case "fine":
      return "Машина подходит.";
    case "reduced":
      return "Машина слабее рекомендуемой: работать будет, но вот что иначе.";
    default:
      return "Машина слабее минимальной.";
  }
}

/**
 * Класс машины из `machineProfile` → вердикт. Две правды об одном не должны
 * расходиться: если `grade` говорит «слабая», а `judge` — «fine», это дефект.
 */
export function consistent(profile: Profile): boolean {
  const klass: Class = profile.ramMb / 1024 >= 16 || profile.cores >= 8 || (profile.gpu.found && profile.gpu.vramMb >= 2048)
    ? "medium"
    : "weak";
  const verdict = judge(profile);
  if (klass === "weak") return verdict.state !== "fine";
  return true;
}
