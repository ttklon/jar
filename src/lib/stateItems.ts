/**
 * Сборка списка для экрана «Состояние» (шаг 1).
 *
 * Каждый пункт берётся из источника, который **уже** решает этот вопрос, а не
 * из нового опроса. Иначе на экране состояния появилась бы третья правда,
 * которая расходится с «Моделями» и «Руками» на первой же перезагрузке.
 *
 * Соответствие источников:
 *  * движок, модель, распознавание — `ReadinessStatus` (тот же, что у карточки
 *    готовности);
 *  * руки и их права — реестр действий (`RegistrySnapshot`), единственный
 *    источник «что разрешено»;
 *  * автозапуск — `autostart_status`, который читают настройки;
 *  * журнал — история запусков: там видно, что падало.
 *
 * Признак «проверено **здесь**» ставится не за факт наличия файла, а за
 * прогон. Файл на диске доказывает, что он скачан, и ничего не говорит о том,
 * что движок запускается на этой машине. Поэтому `proven-here` требует явного
 * подтверждения, и здесь его ставить не за что, кроме `engine_running`: процесс
 * действительно поднялся и ответил.
 */

import type { ReadinessStatus } from "../ipc/types";
import type { StateItem } from "./state";
import { describe, type PlatformVerdict } from "./platform";

/** Что известно о мире на момент показа. Всё — из существующих источников. */
export interface StateInput {
  readiness: ReadinessStatus | null;
  /** Сколько действий в реестре — «сколько я умею». */
  actions: number | null;
  /** Сколько из них рискованных (пишут, ходят наружу, необратимы). */
  risky: number | null;
  /** Автозапуск включён; `null` — не спросили или платформа не умеет. */
  autostart: boolean | null;
  /**
   * Что система сказала о себе (шаг 17). `null` — не спрашивали.
   *
   * Без этого поддержка — угадывание: на старом WebView2 приложение ведёт себя
   * иначе, и понять это можно только зная версию. Поэтому факты системы стоят в
   * «Состоянии» наравне с движком, а не прячутся в «О программе».
   */
  platform: PlatformVerdict | null;
}

/**
 * Пункты состояния.
 *
 * Порядок — по вопросу человека: «чем думает» → «что знает» → «слышит ли» →
 * «что может» → «запускается ли само». Не по алфавиту и не по коду.
 */
export function stateItems(input: StateInput): StateItem[] {
  const r = input.readiness;

  const engine: StateItem = !r
    ? notKnownYet("engine", "Движок", "то, что запускает модель на этой машине", "models")
    : r.engine_found
      ? {
          id: "engine",
          title: "Движок",
          hint: "то, что запускает модель на этой машине",
          // Запущенный процесс — единственное настоящее доказательство «здесь
          // работает»: файл на диске доказывает только скачивание.
          condition: r.engine_running ? "proven-here" : "not-checked",
          evidence: r.engine_running ? "процесс запущен и отвечает" : null,
          screen: "models",
        }
      : {
          id: "engine",
          title: "Движок",
          hint: "то, что запускает модель на этой машине",
          condition: "not-installed",
          evidence: null,
          screen: "models",
        };

  const model: StateItem = !r
    ? notKnownYet("model", "Модель", "то, чем приложение думает", "models")
    : r.model_present
      ? {
          id: "model",
          title: "Модель",
          hint: "то, чем приложение думает",
          // Файл есть — но «работает» это не доказывает. Честно: не проверено.
          condition: "not-checked",
          evidence: null,
          screen: "models",
        }
      : {
          id: "model",
          title: "Модель",
          hint: "то, чем приложение думает",
          condition: "not-installed",
          evidence: null,
          screen: "models",
        };

  const speech: StateItem = !r
    ? notKnownYet("speech", "Распознавание речи", "слышит ли приложение голос", "models")
    : r.speech_found
      ? {
          id: "speech",
          title: "Распознавание речи",
          hint: "слышит ли приложение голос",
          condition: "not-checked",
          evidence: null,
          screen: "models",
        }
      : {
          id: "speech",
          title: "Распознавание речи",
          hint: "слышит ли приложение голос",
          condition: "not-installed",
          evidence: null,
          screen: "models",
        };

  // «Что умею» — реестр. Он собран из данных и проверен генераторами, и это
  // подтверждение: не «мы думаем», а «в реестре столько, и CI сверяет реестр с
  // данными на каждой сборке».
  const actions: StateItem =
    input.actions === null
      ? notKnownYet("abilities", "Что умею", "сколько действий описано и проверено", "catalog")
      : {
          id: "abilities",
          title: "Что умею",
          hint: "сколько действий описано и проверено",
          condition: input.actions > 0 ? "proven-here" : "not-installed",
          evidence:
            input.actions > 0
              ? `${input.actions} ${plural(input.actions, "действие", "действия", "действий")}, сверено генератором`
              : null,
          screen: "catalog",
        };

  // Права: сколько действий опасных. Это не «провал» — это знание, и оно
  // показывается числом, а не оценкой.
  const permissions: StateItem = {
    id: "permissions",
    title: "Разрешённое",
    // «Или изменить файлы» сюда не подходит: подпись обещала бы риск у «создай
    // папку», а след считается только необратимый.
    hint: "что нельзя вернуть нажатием «отменить»: наружу, разрушение, деньги, подпись",
    condition: input.risky === null ? "not-checked" : input.risky === 0 ? "not-installed" : "proven-here",
    evidence:
      input.risky === null
        ? null
        : input.risky === 0
          ? null
          : `${input.risky} ${plural(input.risky, "действие", "действия", "действий")} с необратимым следом`,
    screen: "hands",
  };

  // Автозапуск: включён — работает; выключен — «не установлено», и это не
  // поломка. Выключенный автозапуск — законный выбор человека.
  const autostart: StateItem = {
    id: "autostart",
    title: "Запуск при входе",
    hint: "появляется ли само после входа в Windows",
    condition: input.autostart === null ? "not-checked" : input.autostart ? "proven-here" : "not-installed",
    evidence: input.autostart === null ? null : input.autostart ? "запись автозапуска на месте" : null,
    screen: "settings",
  };

  // Система: версия Windows и WebView2. `ok` — доказано здесь (прочитано с этой
  // машины), `unsupported` — провал с причиной, `unknown` — не проверено.
  const system: StateItem =
    input.platform === null
      ? notKnownYet("system", "Система", "версия Windows и движка WebView2", "settings")
      : {
          id: "system",
          title: "Система",
          hint: "версия Windows и движка WebView2",
          condition:
            input.platform.state === "ok"
              ? "proven-here"
              : input.platform.state === "unsupported"
                ? "failed"
                : "not-checked",
          // Факты читаются с этой машины — значит это и есть доказательство
          // «здесь». Строка называет версии, а не «подходит».
          evidence: describe(input.platform),
          screen: "settings",
        };

  return [system, engine, model, speech, actions, permissions, autostart];
}

/** Пункт, о котором ещё ничего не спросили: «не проверено», а не «нет». */
function notKnownYet(id: string, title: string, hint: string, screen: string): StateItem {
  return { id, title, hint, condition: "not-checked", evidence: null, screen };
}

function plural(count: number, one: string, few: string, many: string): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

/**
 * Сколько действий с **необратимым** следом — из реестра, а не из настроения.
 *
 * Дефект (шаг 255). Сюда входило `write-local`, и на настоящем реестре число
 * выходило **513 из 835** — 47% действий. Но «создай папку» пишет на диск и
 * необратимым не является; человек, прочитав «513 действий с необратимым следом»,
 * перестаёт читать это число вовсе — и не заметит настоящих 129.
 *
 * Необратимое — это то, что нельзя вернуть нажатием «отменить»: ходит наружу
 * (письмо ушло), разрушает (файл стёрт), тратит деньги, ставит подпись.
 */
export function riskyCount(actions: readonly { risk: string }[]): number {
  const RISKY = new Set(["external", "destructive", "money", "identity"]);
  return actions.filter((action) => RISKY.has(action.risk)).length;
}
