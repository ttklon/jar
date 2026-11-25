/**
 * Шаг 288: Ollama — одна команда, и работает; фоновый сервис.
 *
 * Что взято. У Ollama запуск — одна команда, и она же **всё делает**: скачивает
 * модель, поднимает сервис, отвечает. Ни конфигурации, ни «сначала настройте
 * пути»: человек вводит `ollama run llama3` и через минуту разговаривает.
 *
 * Что не взято и почему:
 *
 *  * **сервис, который живёт сам.** Ollama поднимает фоновый сервер на порту и
 *    держит его, пока машина включена. У нас так нельзя: фоновый сервис — это
 *    то, о чём человек забывает, а потом находит на диске 40 ГБ и открытый порт.
 *    Наш «сервис» — это **пока разговор**, и он кончается;
 *  * **командная строка как единственный вход.** `ollama run` — хорошо для
 *    терминала и плохо для человека, который запускает приложение мышкой. У нас
 *    та же простота, но словами и кнопкой.
 *
 * Правило: **одно действие запускает всё, и человек видит, что происходит**.
 * Молчаливая пауза на загрузку двух гигабайт — это «сломалось», даже когда всё
 * идёт хорошо.
 */

/** Этап запуска: то, что человек видит по шагам, а не «загрузка…». */
export type Stage =
  | { readonly what: "check"; readonly said: string }
  | { readonly what: "download"; readonly said: string; readonly mb: number }
  | { readonly what: "load"; readonly said: string }
  | { readonly what: "ready"; readonly said: string }
  | { readonly what: "failed"; readonly said: string; readonly why: string };

/**
 * План запуска: одна команда, разложенная на этапы.
 *
 * Этапы нужны не для красоты: на каждом можно сказать «сколько ещё» и «что
 * делать, если не идёт». Без этого единственный текст — «подождите».
 */
export function plan(available: boolean, sizeMb: number): Stage[] {
  const stages: Stage[] = [{ what: "check", said: "проверяю, что есть на диске" }];
  if (!available) {
    stages.push({
      what: "download",
      said: `нужно скачать ${Math.round(sizeMb / 100) / 10} ГБ — это займёт время`,
      mb: sizeMb,
    });
  }
  stages.push({ what: "load", said: "загружаю в память" });
  stages.push({ what: "ready", said: "готово — можно говорить" });
  return stages;
}

/**
 * Сколько ещё — по-русски и без ложной точности.
 *
 * «Осталось 3 минуты» на загрузке, которая может занять двадцать, — обещание,
 * которое человек запомнит. Поэтому до половины — «несколько минут», после —
 * число.
 */
export function left(doneMb: number, totalMb: number, seconds: number): string {
  if (totalMb <= 0) return "скачиваю";
  if (doneMb >= totalMb) return "скачано";
  const share = doneMb / totalMb;
  if (share < 0.05) return "начал скачивать";
  if (seconds < 60) return "меньше минуты";
  if (share < 0.5) return `примерно ${Math.round(seconds / 60)} мин`;
  return `осталось около ${Math.round(seconds / 60)} мин`;
}

/**
 * Кончился разговор — кончилась работа сервиса.
 *
 * Не «остановить вручную»: то, что надо останавливать руками, останавливают
 * забывчивые. Поэтому выгрузка — часть конца разговора, а не отдельная кнопка.
 */
export function after(): { unload: true; said: string } {
  return {
    unload: true,
    said: "модель выгружена из памяти: без разговора она не занимает ни память, ни диск заново",
  };
}

/**
 * Что делать, если не идёт.
 *
 * Отказ называет шаг, а не «ошибка загрузки»: человеку важно знать, где именно
 * встало — диск, сеть или память.
 */
export function failure(stage: Stage["what"], why: string): Stage {
  const where: Record<string, string> = {
    check: "не смог проверить диск",
    download: "не скачивается",
    load: "не хватает памяти",
    ready: "запустилось, но не отвечает",
    failed: "не получилось",
  };
  return {
    what: "failed",
    said: `${where[stage] ?? "не получилось"}: ${why}`,
    why,
  };
}

/** Один текст для человека: «одна команда» и есть одна строка. */
export function oneLine(stages: readonly Stage[]): string {
  const last = stages[stages.length - 1];
  if (last === undefined) return "ничего не запущено";
  return last.said;
}
