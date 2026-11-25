/**
 * Шаг 280: тест — поправленный факт заменяет старый, а не дублирует.
 *
 * Шаг 274 научил править факт. Но правка — это две записи (старая и новая), и
 * между ними живёт окно, в котором память знает **обе**: показать их рядом,
 * подставить старую, посчитать два факта вместо одного. Проверяется это не
 * описанием, а тестом на настоящих данных памяти — включая то, что видно
 * человеку, а не только внутренние списки.
 *
 * Три места, где дубль появляется даже после правки:
 *
 *  1. **старый `id` остаётся в списке.** Список фактов берётся из предпочтений,
 *     и если правка не тронула старую запись — в списке две строки, и человек
 *     удаляет ту, которую уже поправил;
 *  2. **счётчики расходятся.** У старой записи `times` был 4, у новой 1 —
 *     подсказка перестаёт появляться, и «правка» тихо стирает привычку;
 *  3. **правка в значение, которое уже есть.** Тогда в памяти снова две записи
 *     про одно, и любая из них может «победить» в подстановке.
 *
 * Тест здесь — не замена шага 274, а его **стража**: он проверяет не «функция
 * вернула ok», а что в памяти после правки не осталось следов старого факта.
 */

import { edit, type Edited } from "./factEdit";
import type { Preference } from "./preferences";
import type { Method } from "./methods";
import { facts, type Fact } from "./memoryView";

/** Одна строка проверки: что именно не так, если не так. */
export interface Check {
  readonly ok: boolean;
  readonly said: string;
}

/**
 * Проверить, что после правки старого факта в памяти нет.
 *
 * Вызывается **после** `edit()`. Возвращает не «успех/неуспех», а список
 * найденных проблем: одна ошибка не должна скрывать остальные, иначе починишь
 * первую, а вторая всплывёт через месяц.
 */
export function afterEdit(
  before: { preferences: readonly Preference[]; methods: readonly Method[] },
  edited: Edited,
  oldId: string,
  newValue: string,
): { checks: Check[]; ok: boolean; said: string } {
  const checks: Check[] = [];

  if (!edited.ok) {
    // Правка не состоялась — проверять нечего, но и молчать нельзя.
    return {
      checks: [{ ok: true, said: "правка не состоялась: проверять нечего" }],
      ok: true,
      said: "правка не состоялась: проверять нечего",
    };
  }

  const kind = oldId.slice(0, oldId.indexOf(":"));
  const oldValue = oldId.slice(oldId.indexOf(":") + 1);

  // 1. Старое значение не должно остаться в списке.
  const stillOld = edited.preferences.filter(
    (preference) => preference.kind === kind && preference.value === oldValue && oldValue !== newValue,
  );
  checks.push({
    ok: stillOld.length === 0,
    said:
      stillOld.length === 0
        ? "старого значения в памяти нет"
        : `старое значение осталось: ${oldValue} — в списке две строки вместо одной`,
  });

  // 2. Новое значение должно быть, и ровно одно.
  const nowNew = edited.preferences.filter((preference) => preference.kind === kind && preference.value === newValue);
  checks.push({
    ok: nowNew.length === 1,
    said:
      nowNew.length === 1
        ? "новое значение есть, и оно одно"
        : nowNew.length === 0
          ? `нового значения нет: ${newValue} — правка потерялась`
          : `новых значений ${nowNew.length}: две записи про одно и то же`,
  });

  // 3. Привычка не должна исчезнуть: счётчик и причина — на новом значении.
  const oldPref = before.preferences.find((preference) => `${preference.kind}:${preference.value}` === oldId);
  if (oldPref !== undefined && nowNew.length === 1) {
    checks.push({
      // Счётчик не должен уменьшиться: правка переносит привычку, а не
      // создаёт её заново. `Math.min(oldPref.times, 1)` здесь было бессмыслицей —
      // оно пропускало любое `times >= 1`, то есть 4 → 1 считалось нормой.
      ok: nowNew[0]!.times >= oldPref.times,
      said:
        nowNew[0]!.times === oldPref.times
          ? `счётчик сохранён: ${oldPref.times}`
          : `счётчик стал ${nowNew[0]!.times} вместо ${oldPref.times} — привычка ослабла`,
    });
  }

  // 4. В списке для человека — одна строка, а не две.
  const shown = facts(edited.preferences, edited.methods, before.preferences[0]?.last ?? 0);
  const twins = shown.filter((fact: Fact) => fact.kind === kind && (fact.id.endsWith(`:${oldValue}`) || fact.id.endsWith(`:${newValue}`)));
  checks.push({
    ok: twins.length === 1,
    said:
      twins.length === 1
        ? "в списке одна строка"
        : `в списке ${twins.length} строки про этот факт: человек видит дубль`,
  });

  const failed = checks.filter((check) => !check.ok);
  return {
    checks,
    ok: failed.length === 0,
    said: failed.length === 0 ? "правка чистая: старый факт заменён" : failed.map((check) => check.said).join("; "),
  };
}

/**
 * Полный прогон: поправить и сразу проверить.
 *
 * Одна функция, потому что проверка, которую нужно не забыть вызвать, не
 * вызывается. Здесь она вызывается всегда.
 */
export function editAndCheck(
  oldId: string,
  newValue: string,
  preferences: readonly Preference[],
  methods: readonly Method[],
): { edited: Edited; checks: ReturnType<typeof afterEdit> } {
  const edited = edit({ id: oldId, value: newValue }, preferences, methods);
  const checks = afterEdit({ preferences, methods }, edited, oldId, newValue.trim());
  return { edited, checks };
}
