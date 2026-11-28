import { useEffect, useState } from "react";
import { Button, Text } from "@fluentui/react-components";
import { isTauri, pauseExplains, paused, setPaused } from "../ipc";

/**
 * Пауза — один переключатель, одна мысль: «не сейчас».
 *
 * Что она останавливает и чего не трогает, сказано словами и рядом, а не в
 * справке: человек нажимает «пауза» в спешке, и ему нужно знать, побежит ли
 * запись по расписанию в этом же виде. Запись в журнале, память и модель
 * пауза не трогает — иначе «поставить на паузу» означало бы «потерять».
 */
export function PauseSwitch() {
  const [on, setOn] = useState(false);
  const [words, setWords] = useState<{ stops: string[]; keeps: string[] }>({
    stops: [],
    keeps: [],
  });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    void paused().then((now) => {
      if (alive) setOn(now);
    });
    void pauseExplains().then((next) => {
      if (alive) setWords(next);
    });
    return () => {
      alive = false;
    };
  }, []);

  // Паузу ставят и из трея, окно при этом может быть закрыто. Когда оно
  // откроется, кнопка обязана показывать настоящее состояние, а не то, что
  // было при запуске: иначе человек нажимает «пауза» дважды и снимает её.
  useEffect(() => {
    if (!isTauri()) return;
    let stop: (() => void) | null = null;
    let alive = true;
    void import("@tauri-apps/api/event")
      .then(({ listen }) =>
        listen<boolean>("pause://changed", (event) => {
          if (alive) setOn(event.payload);
        }),
      )
      .then((off) => {
        if (alive) stop = off;
        else off();
      })
      .catch(() => {
        // Событий нет — кнопка всё равно работает через команду.
      });
    return () => {
      alive = false;
      stop?.();
    };
  }, []);

  async function toggle(next: boolean) {
    setBusy(true);
    try {
      setOn(await setPaused(next));
    } catch {
      // В браузере пауза не ставится — кнопка честно остаётся как была.
      setOn(false);
    } finally {
      setBusy(false);
    }
  }

  if (words.stops.length === 0 && words.keeps.length === 0 && !on) {
    return null;
  }

  return (
    <section aria-label="пауза">
      <Button
        appearance={on ? "primary" : "secondary"}
        disabled={busy}
        aria-pressed={on}
        onClick={() => void toggle(!on)}
      >
        {on ? "Пауза — идёт" : "Пауза"}
      </Button>
      {on ? (
        <Text size={200}>
          остановлено: {words.stops.join(", ")}
          {words.keeps.length > 0 ? `; не тронуто: ${words.keeps.join(", ")}` : ""}
        </Text>
      ) : null}
    </section>
  );
}
