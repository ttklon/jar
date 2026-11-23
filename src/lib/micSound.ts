/**
 * «Слушаю» и «обрабатываю» — разными звуками (шаг 52).
 *
 * Дефект. Оба состояния выглядели одинаково: слово на экране менялось, но тот,
 * кто говорит и не смотрит на экран, этого не замечал. А разница
 * принципиальная: пока «слушаю» — можно перебить словом, после «обрабатываю» —
 * уже поздно, надо ждать. Человек говорит в «обрабатываю» и удивляется, почему
 * его вторая фраза не сработала.
 *
 * Правило: у каждого состояния **свой звук**, и звук несёт смысл:
 *
 *  * **слушаю** — короткий подъём. «Я открылся». Тон повышается: начало, а не
 *    конец;
 *  * **обрабатываю** — короткий спуск. «Я закрылся, разбирайся». Тон понижается:
 *    конец разговора, дальше жди;
 *  * **ошибка** — два низких удара. Не мелодия: ошибка не должна звучать
 *    приятно, иначе её пропускают.
 *
 * Почему подъём и спуск, а не две разные ноты. Подъём звучит как вопрос «да?» и
 * читается как начало; спуск — как точка. Это слышно без обучения и не зависит
 * от абсолютного слуха: разница в направлении, а не в высоте.
 *
 * Почему не настраиваемый звук «на всё». Настраиваемый набор звуков — это
 * настройка, которую никто не настраивает; смысл в том, чтобы два состояния
 * **всегда** различались, а не различались у тех, кто зашёл в настройки.
 */

/** Что озвучивается. Только переходы: «слушаю» один раз, а не на каждый кадр. */
export type Cue = "listening" | "working" | "error";

/** Один звук: частота в герцах, длительность в миллисекундах, задержка от начала. */
export interface Tone {
  frequency: number;
  ms: number;
  /** Задержка перед этим тоном, от начала сигнала. */
  after: number;
}

/**
 * Звук для состояния.
 *
 * Частоты в разговорном диапазоне (600–900 Гц): ниже — плохо слышно на
 * ноутбучных динамиках, выше — режет слух. Длительности короткие (60–90 мс):
 * сигнал не должен задерживать речь.
 */
export function cue(cue_: Cue): Tone[] {
  switch (cue_) {
    case "listening":
      // Подъём: 660 → 880. Начало разговора.
      return [
        { frequency: 660, ms: 60, after: 0 },
        { frequency: 880, ms: 60, after: 60 },
      ];
    case "working":
      // Спуск: 880 → 660. Конец приёма, дальше жди.
      return [
        { frequency: 880, ms: 60, after: 0 },
        { frequency: 660, ms: 60, after: 60 },
      ];
    case "error":
      // Два низких удара, с паузой: не мелодия, а «стоп».
      return [
        { frequency: 400, ms: 90, after: 0 },
        { frequency: 400, ms: 90, after: 140 },
      ];
  }
}

/**
 * Направление сигнала — то, что слышно без обучения.
 *
 * `up` — начало, `down` — конец, `flat` — предупреждение. Функция нужна тесту и
 * документации: направление и есть смысл.
 */
export function direction(cue_: Cue): "up" | "down" | "flat" {
  const tones = cue(cue_);
  const first = tones[0]?.frequency ?? 0;
  const last = tones[tones.length - 1]?.frequency ?? 0;
  if (last > first) return "up";
  if (last < first) return "down";
  return "flat";
}

/**
 * Два состояния различимы на слух.
 *
 * Не «звуки разные» (это может быть одна нота на две длительности — их
 * перепутают), а **направления разные**: подъём против спуска слышно даже на
 * плохом динамике.
 */
export function distinguishable(): boolean {
  return direction("listening") === "up" && direction("working") === "down";
}

/** Сколько длится сигнал целиком — чтобы не задерживать речь. */
export function totalMs(cue_: Cue): number {
  return cue(cue_).reduce((sum, tone) => Math.max(sum, tone.after + tone.ms), 0);
}

/**
 * Как это назвать человеку — в подсказке.
 *
 * Сказано, **что звук значит**, а не «звуковой сигнал включён»: иначе человек
 * слышит два звука и не знает, какой из них про что.
 */
export function cueWord(cue_: Cue): string {
  switch (cue_) {
    case "listening":
      return "короткий подъём — слушаю, говорите";
    case "working":
      return "короткий спуск — принял, разбираю";
    case "error":
      return "два низких удара — не получилось";
  }
}

/**
 * Каким звуком отвечать на состояние микрофона из шага 49.
 *
 * Не у каждого состояния свой звук, и это осознанно: `closed` — «не слушаю»,
 * это не переход, а покой; `asking` — вопрос уже задан голосом, второй сигнал
 * только мешает. Звучат те три, где человеку **нужно знать, его очередь или
 * нет**: открылся, принял, сломался.
 */
export function cueForState(state: string): Cue | null {
  switch (state) {
    case "listening":
      return "listening";
    case "parsing":
    case "thinking":
      return "working";
    case "error":
      return "error";
    default:
      return null;
  }
}

/**
 * Проиграть сигнал.
 *
 * Молча ничего не делает там, где звука нет (браузер без разрешения, тесты,
 * серверный рендер): подсказка не должна ломать экран. Ошибку звука тоже
 * глотаем — человек пришёл говорить, а не читать отчёт об аудио.
 *
 * Атака и затухание короткие (5 мс): без них получается щелчок, а щелчок
 * слышится как сбой.
 */
export function playCue(tones: readonly Tone[]): void {
  try {
    const Ctor =
      typeof window === "undefined"
        ? undefined
        : (window.AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext })
            .webkitAudioContext);
    if (!Ctor) return;
    const context = new Ctor();
    const start = context.currentTime;
    for (const tone of tones) {
      const at = start + tone.after / 1000;
      const seconds = tone.ms / 1000;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = tone.frequency;
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(0.12, at + 0.005);
      gain.gain.setValueAtTime(0.12, at + seconds - 0.005);
      gain.gain.linearRampToValueAtTime(0, at + seconds);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(at);
      oscillator.stop(at + seconds);
    }
    const last = tones.reduce((sum, tone) => Math.max(sum, tone.after + tone.ms), 0);
    // Закрываем контекст после сигнала: иначе на некоторых системах остаётся
    // открытое аудиоустройство и микрофон начинает «шипеть».
    window.setTimeout(() => {
      void context.close().catch(() => {});
    }, last + 100);
  } catch {
    // Звук — подсказка, а не условие работы.
  }
}
