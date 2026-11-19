/**
 * Окно перед человеком — не украшение экрана, а подсказка при выборе действия.
 *
 * Человек говорит «поставь на паузу» или «включи субтитры», стоя перед браузером; в реестре
 * на эти слова находится десяток рук — плеер, музыка, видео, презентация. Без подсказки
 * приложение выбирает по алфавиту, то есть наугад.
 *
 * Поэтому порядок подсказок поднимает тех, кто про эту программу, если человек сейчас в ней.
 * Что здесь **не** делается: решения не меняются (опасное остаётся опасным), счёт не
 * подделывается, из поиска ничего не выбрасывается — только порядок. Если совпадений нет,
 * порядок остаётся прежним: угадывать по имени процесса, которого мы не знаем, нельзя.
 */

import type { PlanItem } from "../ipc";
import { terms } from "./planner";

/** Что перед человеком: то, что читает ядро. */
export interface Around {
  title: string;
  process: string;
}

/**
 * Программы, про которые у реестра есть слова. Ключ — имя exe в нижнем регистре,
 * значения — слова, которыми человек и реестр называют эту программу.
 */
const KNOWN: Record<string, string[]> = {
  "chrome.exe": ["браузер", "хром", "chrome", "вкладк", "сайт"],
  "msedge.exe": ["браузер", "edge", "вкладк", "сайт"],
  "firefox.exe": ["браузер", "firefox", "вкладк", "сайт"],
  "opera.exe": ["браузер", "opera", "вкладк"],
  "yandex.exe": ["браузер", "яндекс", "вкладк"],
  "vlc.exe": ["видео", "плеер", "vlc", "фильм"],
  "wmplayer.exe": ["видео", "плеер", "фильм"],
  "mpc-hc64.exe": ["видео", "плеер", "фильм"],
  "notepad.exe": ["блокнот", "текст", "заметк", "файл"],
  "explorer.exe": ["проводник", "папк", "файл", "рабочий стол"],
  "code.exe": ["редактор", "код", "vs code", "файл"],
  "winword.exe": ["word", "документ", "текст"],
  "excel.exe": ["excel", "таблиц", "ячейк"],
  "powerpnt.exe": ["powerpoint", "презентац", "слайд"],
  "acrord32.exe": ["pdf", "документ"],
  "telegram.exe": ["telegram", "телеграм", "сообщени", "чат"],
  "discord.exe": ["discord", "чат", "сообщени"],
  "spotify.exe": ["музык", "spotify", "плеер", "трек"],
  "zoom.exe": ["zoom", "встреч", "звонок"],
  "mstsc.exe": ["удалённый стол", "rdp"],
};

/** Слова, которыми эта программа называется в реестре. Пусто — не знаем её. */
export function aliases(process: string): string[] {
  const name = process.trim().toLowerCase();
  if (name.length === 0) return [];
  return KNOWN[name] ?? [];
}

/**
 * Порядок подсказок с учётом окна: сначала то, что про программу перед человеком.
 *
 * `moved` — сколько строк поднялось; ноль означает «подсказка ничего не изменила», и тогда
 * лучше промолчать, чем делать вид, что учли контекст.
 */
export function rankForWindow(
  items: PlanItem[],
  around: Around | null,
): { items: PlanItem[]; moved: number } {
  if (!around) return { items, moved: 0 };

  const words = aliases(around.process);
  if (words.length === 0) return { items, moved: 0 };

  const related = (item: PlanItem): boolean => {
    const text = terms(item.example).concat(terms(item.key));
    return text.some((word) => words.some((alias) => word.startsWith(alias) || alias.startsWith(word)));
  };

  const first = items.filter(related);
  if (first.length === 0 || first.length === items.length) return { items, moved: 0 };

  const rest = items.filter((item) => !related(item));
  const reordered = [...first, ...rest];

  // Считаем только реальные перестановки — иначе «подняли» превращается в ложь.
  const moved = reordered.filter((item, index) => item !== items[index]).length;
  return { items: reordered, moved };
}

/** Фраза для экрана: что именно учтено. */
export function aroundPhrase(around: Around): string {
  const title = around.title.trim();
  const process = around.process.trim();
  if (title.length === 0) return process;
  return `${title} — ${process}`;
}
