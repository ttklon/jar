import { useCallback, useEffect, useState } from "react";
import { Button, Input, makeStyles, Text, tokens } from "@fluentui/react-components";
import { MicRegular } from "@fluentui/react-icons";
import { planFor, speechStatus, transcribeLocal } from "../ipc";
import type { PlanItem, SpeechStatus } from "../ipc";
import { speak } from "../lib/voice";
import { useVoice } from "../lib/useVoice";
import { ActionList } from "../components/ActionList";
import { voice } from "../i18n/ru";

/**
 * Главный экран. Человек ничего здесь не выбирает: он держит кнопку, говорит задачу,
 * отпускает — и слышит, что приложение об этом думает.
 *
 * Почему так, а не списком экранов: задача приходит словами, ответ должен приходить
 * словами тоже. Реестр, руки и журнал не убраны — они за кнопкой «Под капотом», для
 * тех случаев, когда человек хочет проверить, а не поработать.
 */

const LIMIT = 8;

const useStyles = makeStyles({
  root: { display: "flex", flexDirection: "column", gap: "16px", maxWidth: "96ch" },
  lead: { color: tokens.colorNeutralForeground2, maxWidth: "78ch" },
  note: {
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase200,
    maxWidth: "78ch",
  },
  mic: {
    minHeight: "92px",
    fontSize: tokens.fontSizeBase500,
    fontWeight: tokens.fontWeightSemibold,
    justifyContent: "center",
    gap: "12px",
  },
  micListening: {
    minHeight: "92px",
    fontSize: tokens.fontSizeBase500,
    fontWeight: tokens.fontWeightSemibold,
    justifyContent: "center",
    gap: "12px",
    backgroundColor: tokens.colorPaletteRedBackground2,
    color: tokens.colorPaletteRedForeground2,
  },
  bar: { display: "flex", gap: "10px", alignItems: "center" },
  input: { flex: 1 },
  error: { color: tokens.colorPaletteRedForeground2 },
  spoken: { color: tokens.colorNeutralForeground3, fontStyle: "italic" },
  localReady: {
    color: tokens.colorPaletteGreenForeground2,
    fontSize: tokens.fontSizeBase200,
    maxWidth: "78ch",
  },
  hood: {
    display: "flex",
    gap: "10px",
    alignItems: "center",
    flexWrap: "wrap",
    paddingTop: "10px",
    borderTop: `1px solid ${tokens.colorNeutralStroke2}`,
  },
});

export interface VoiceScreenProps {
  /** Переход к доказательству: реестр, руки, сценарии, история. */
  onOpen?: (screen: string) => void;
}

export function Voice({ onOpen }: VoiceScreenProps) {
  const styles = useStyles();
  const [text, setText] = useState("");
  const [items, setItems] = useState<PlanItem[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [spoken, setSpoken] = useState<string | null>(null);
  const [speech, setSpeech] = useState<SpeechStatus | null>(null);

  const search = useCallback((phrase: string) => {
    const query = phrase.trim();
    if (query.length === 0) {
      setItems(null);
      return;
    }

    setBusy(true);
    setError(null);
    planFor(query, LIMIT)
      .then((found) => {
        setItems(found);
        // Отвечаем вслух: человек, который говорит, не смотрит в экран.
        const phraseOut =
          found.length === 0
            ? voice.spokenNothing
            : found.some((item) => Boolean(item.tool))
              ? voice.spokenFound(found.length)
              : voice.spokenOnlyDescription;
        setSpoken(speak(phraseOut) ? voice.said(phraseOut) : voice.silent);
      })
      .catch((reason: unknown) =>
        setError(reason instanceof Error ? reason.message : String(reason)),
      )
      .finally(() => setBusy(false));
  }, []);

  // Свой движок есть — пишем звук и отдаём ему: это единственный путь, где звук не
  // покидает компьютер. Нет — слушаем тем, что даёт система, и говорим об этом выше.
  const localEngine =
    speech && speech.found && speech.model
      ? { transcribe: (wav: Uint8Array) => transcribeLocal(Array.from(wav)) }
      : null;

  const mic = useVoice({
    local: localEngine,
    onText: (heard) => {
      setVoiceError(null);
      setText(heard);
      search(heard);
    },
    onError: (message) => setVoiceError(message),
  });

  // Чем распознаём — видно сразу: пока своего движка нет, звук уходит наружу, и
  // человек должен знать это до того, как заговорит, а не после.
  useEffect(() => {
    speechStatus()
      .then(setSpeech)
      .catch(() => setSpeech(null));
  }, []);

  useEffect(() => {
    if (!mic.listening) {
      setSeconds(0);
      return;
    }
    const timer = setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, [mic.listening]);

  return (
    <div className={styles.root}>
      <div>
        <Text as="h1" size={700}>
          {voice.title}
        </Text>
        <Text className={styles.lead} block>
          {voice.lead}
        </Text>
      </div>

      <Button
        className={mic.listening ? styles.micListening : styles.mic}
        appearance="primary"
        icon={<MicRegular />}
        aria-label={voice.hold}
        onPointerDown={(event) => {
          event.preventDefault();
          mic.start();
        }}
        onPointerUp={() => mic.stop()}
        onPointerLeave={() => mic.stop()}
        onPointerCancel={() => mic.stop()}
        onKeyDown={(event) => {
          if (event.key !== " " && event.key !== "Enter") return;
          event.preventDefault();
          if (!event.repeat) mic.start();
        }}
        onKeyUp={(event) => {
          if (event.key !== " " && event.key !== "Enter") return;
          event.preventDefault();
          mic.stop();
        }}
      >
        {mic.listening ? voice.listening(seconds) : voice.hold}
      </Button>

      <Text className={styles.note}>{voice.hotkey}</Text>
      <Text className={styles.note}>{voice.privacy}</Text>
      {speech ? (
        <Text className={speech.found && speech.model ? styles.localReady : styles.note}>
          {speech.found && speech.model
            ? voice.localReady(speech.program ?? "")
            : speech.found
              ? voice.localNoModel(speech.models_dir)
              : voice.localNone(speech.search_dir)}
        </Text>
      ) : null}

      {voiceError ? <Text className={styles.error}>{voiceError}</Text> : null}

      <form
        className={styles.bar}
        onSubmit={(event) => {
          event.preventDefault();
          search(text);
        }}
      >
        <Input
          className={styles.input}
          value={text}
          aria-label={voice.heard}
          placeholder={voice.heardPlaceholder}
          onChange={(_, data) => setText(data.value)}
        />
        <Button type="submit" disabled={busy}>
          {voice.find}
        </Button>
      </form>

      {spoken ? <Text className={styles.spoken}>{spoken}</Text> : null}

      {error ? (
        <Text className={styles.error}>{`${voice.loadError}: ${error}`}</Text>
      ) : items === null ? (
        <Text className={styles.note}>{voice.nothingYet}</Text>
      ) : items.length === 0 ? (
        <Text className={styles.note}>{voice.spokenNothing}</Text>
      ) : (
        <ActionList items={items} />
      )}

      {onOpen ? (
        <div className={styles.hood}>
          <Text className={styles.note}>{voice.underHood}</Text>
          <Button appearance="subtle" size="small" onClick={() => onOpen("catalog")}>
            {voice.openCatalog}
          </Button>
          <Button appearance="subtle" size="small" onClick={() => onOpen("hands")}>
            {voice.openHands}
          </Button>
          <Button appearance="subtle" size="small" onClick={() => onOpen("flows")}>
            {voice.openFlows}
          </Button>
          <Button appearance="subtle" size="small" onClick={() => onOpen("journal")}>
            {voice.openJournal}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
