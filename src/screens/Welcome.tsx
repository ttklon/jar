import { useMemo, useState } from "react";
import { Button, Input, makeStyles, Text, tokens } from "@fluentui/react-components";
import { ReadinessCard } from "../components/ReadinessCard";
import { welcome } from "../i18n/ru";
import { cleanName, readName, saveName } from "../lib/person";
import { decide, readFacts } from "../lib/platform";
import { checkFirstRun, summarizeFirstRun } from "../lib/firstRunCheck";

/**
 * Экран знакомства — то, что человек видит при первом запуске.
 *
 * Карточка готовности читает реальные состояния и называет только то, чего не хватает;
 * скачивание и запуск — только по явной кнопке на карточке, а не сами. Так первый экран
 * не может стать первым неожиданным действием.
 *
 * Оговорка про браузер стоит на экране, а не в документации: в браузере приложение
 * показывает состав и политику, но ничего не выполняет, и человек должен узнать это
 * здесь, а не из упавшей кнопки.
 */

const useStyles = makeStyles({
  root: { display: "flex", flexDirection: "column", gap: "20px", maxWidth: "760px" },
  // Фраза — главное на первом экране: человек должен увидеть, что можно просто
  // сказать, а не изучать карточки. Поэтому она стоит выше правил.
  firstPhrase: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: "10px",
    padding: "14px 16px",
    borderRadius: tokens.borderRadiusLarge,
    backgroundColor: tokens.colorNeutralBackground3,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  phrase: {
    fontFamily: tokens.fontFamilyMonospace,
    fontSize: tokens.fontSizeBase300,
    color: tokens.colorNeutralForeground1,
  },
  lead: { color: tokens.colorNeutralForeground2, lineHeight: tokens.lineHeightBase300 },
  rules: { display: "flex", flexDirection: "column", gap: "12px" },
  card: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
    padding: "14px 16px",
    borderRadius: tokens.borderRadiusLarge,
    backgroundColor: tokens.colorNeutralBackground2,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  ruleText: { color: tokens.colorNeutralForeground2 },
  actions: { display: "flex", flexWrap: "wrap", gap: "8px" },
  note: { color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200 },
  sideways: { display: "flex", flexWrap: "wrap", gap: "4px", alignItems: "center" },
  nameCard: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
    maxWidth: "320px",
    padding: "14px 16px",
    borderRadius: tokens.borderRadiusLarge,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
  },
});

export type WelcomeTarget = "ask" | "catalog" | "journal" | "models";

export function Welcome({
  source,
  onStart,
  onOpen,
}: {
  source: string;
  onStart: () => void;
  onOpen: (target: WelcomeTarget) => void;
}) {
  const styles = useStyles();
  // Имя читается один раз при открытии: это первый запуск, и здесь оно ещё не
  // записано. В состоянии — чтобы подпись «запомнил: …» менялась сразу.
  const [name, setName] = useState(() => readName());
  // Проверка читается один раз: версия системы и движка за сеанс не меняются.
  const verdict = useMemo(() => decide(readFacts(globalThis.navigator)), []);
  // Проверка пути первого запуска (шаг 27): что осталось непройденным.
  const firstRun = useMemo(() => summarizeFirstRun(checkFirstRun()), []);

  return (
    <div className={styles.root}>
      <div>
        <Text as="h2" size={700} weight="semibold">
          {welcome.title}
        </Text>
        <Text className={styles.lead} block>
          {welcome.lead}
        </Text>
      </div>

      {/*
        Первое дело — до настройки. Пока модель качается, реестр уже отвечает на
        «что умею», «где данные», «сколько места». Человек получает ответ, а не
        анкету; остальное догружается в фоне.
      */}
      <div className={styles.firstPhrase}>
        <Text weight="semibold">{welcome.firstPhraseTitle}</Text>
        {/* Пример фразы, а не вторая кнопка «начать»: два входа в одно действие
            заставляли выбором там, где его быть не должно (шаги 21/29). */}
        <Text className={styles.phrase}>«{welcome.firstPhraseExample}»</Text>
      </div>

      <div className={styles.rules}>
        {welcome.rules.map((rule) => (
          <div key={rule.title} className={styles.card}>
            <Text weight="semibold">{rule.title}</Text>
            <Text className={styles.ruleText}>{rule.text}</Text>
          </div>
        ))}
      </div>

      {/*
        Шаг 35: проверка Windows и WebView2 — **до** первого разговора. Самая
        частая причина «белого окна» узнаётся человеком уже после того, как
        экрана нет; здесь она названа заранее и с действием. «Не прочитал» —
        отдельная строка, не «подходит»: обещать проверенное там, где не
        проверял, — это ровно тот самообман, из-за которого такие проверки и
        перестают делать.
      */}
      <Text className={styles.note} block>
        {verdict.state === "ok"
          ? welcome.platformOk(`Windows ${verdict.facts.osVersion}`, verdict.facts.engineMajor ?? 0)
          : verdict.state === "unknown"
            ? welcome.platformUnknown
            : `${welcome.platformProblem(verdict.reason)} ${welcome.platformWhere}`}
      </Text>

      {/* Шаг 37: один вопрос за весь первый запуск. Стоит выше карточки, потому
          что это про человека, а не про железо, — и потому что ответ на него
          ничего не блокирует. */}
      <div className={styles.nameCard}>
        <Text weight="semibold">{welcome.nameAsk}</Text>
        <Input
          value={name}
          aria-label={welcome.nameAsk}
          placeholder={welcome.namePlaceholder}
          onChange={(_, data) => {
            // Как только человек ответил — запоминаем сразу: он может уйти
            // с этого экрана, не нажимая ничего больше (шаг 37).
            setName(data.value);
            saveName(data.value);
          }}
        />
        <Text className={styles.note}>
          {name.trim() === "" ? welcome.nameSkip : welcome.nameKept(cleanName(name))}
        </Text>
      </div>

      {/*
        Шаг 27: видно, что путь первого запуска остался пройденным. Строка стоит
        над карточкой готовности, потому что говорит о человеке и его настройке,
        а карточка — о железе. Показывается, только если есть чего не хватает:
        «пройдено 3 из 3» на каждом открытии — это шум, а не проверка.
      */}
      {firstRun.missing.length > 0 ? (
        <Text className={styles.note} block>
          {welcome.firstRunCheck(firstRun.done, firstRun.total)}{" "}
          {welcome.firstRunCheckMissing(
            firstRun.missing.map((item) => welcome.firstRunStep[item.step] ?? item.step).join(", "),
          )}
        </Text>
      ) : null}

      <ReadinessCard
        onToVoice={onStart}
        onToModels={() => onOpen("models")}
      />

      {/*
        Один путь, а не меню (шаги 21/29). До правки здесь было пять кнопок, и три
        из них делали одно и то же — вели в разговор. Человек, впервые открывший
        приложение, видел выбор, которого не просил, и должен был решать, чем
        «К разговору» отличается от «Спросить словами» и «Сказать первое дело».
        Разница была только в словах: действия одинаковые. Осталось одно действие
        и три тихих ссылки вбок — не потому, что они не нужны, а потому, что они
        не первый шаг.
      */}
      <div className={styles.actions}>
        <Button appearance="primary" size="large" onClick={onStart}>
          {welcome.start}
        </Button>
        <Text className={styles.note}>{welcome.sideways}</Text>
        <div className={styles.sideways}>
          <Button appearance="transparent" size="small" onClick={() => onOpen("models")}>
            {welcome.setupAI}
          </Button>
          <Button appearance="transparent" size="small" onClick={() => onOpen("catalog")}>
            {welcome.openCatalog}
          </Button>
          <Button appearance="transparent" size="small" onClick={() => onOpen("journal")}>
            {welcome.openJournal}
          </Button>
        </div>
      </div>

      <Text className={styles.note} block>
        {welcome.sourceNote(source)}
      </Text>
    </div>
  );
}
