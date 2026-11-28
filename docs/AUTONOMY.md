# Что приложение делает само, без спроса

Сгенерировано `tools/autonomy.py`. Не править руками.

Правило шага 20: автономность не должна быть незаметной. Здесь либо пусто,
либо названо — но никогда не «кое-что по мелочи». Незаметное действие
опаснее названного: названное человек может запретить.

## Итог

* действий **по нажатию**: 4 — их человек вызывает сам;
* действий **само**: 0 — ни одного.

## Эффекты при открытии экрана

Места, где код выполняется сам при появлении экрана. Сами по себе они не
опасны: чтение статуса нужно, иначе экран пустой. Опасным было бы **писать**
или **ходить в сеть** из такого эффекта — и вот этого здесь быть не должно.

* `src/app.tsx:295` — useEffect(() => {
* `src/app.tsx:365` — useEffect(() => {
* `src/app.tsx:381` — useEffect(() => {
* `src/app.tsx:403` — useEffect(() => {
* `src/app.tsx:419` — useEffect(() => {
* `src/app.tsx:445` — useEffect(() => {
* `src/app.tsx:542` — useEffect(() => {
* `src/app.tsx:562` — useEffect(() => {
* `src/app.tsx:583` — useEffect(() => {
* `src/app.tsx:609` — useEffect(() => {
* `src/app.tsx:616` — useEffect(() => {
* `src/app.tsx:623` — useEffect(() => {
* `src/screens/Apps.tsx:24` — useEffect(() => {
* `src/screens/Ask.tsx:159` — useEffect(() => {
* `src/screens/DataPlaces.tsx:52` — useEffect(() => {
* `src/screens/DataPlaces.tsx:66` — useEffect(() => {
* `src/screens/Flows.tsx:26` — useEffect(() => {
* `src/screens/Hands.tsx:55` — useEffect(() => {
* `src/screens/Journal.tsx:196` — useEffect(() => {
* `src/screens/Journal.tsx:387` — useEffect(load, [load]);
* `src/screens/Models.tsx:221` — useEffect(load, [load]);
* `src/screens/People.tsx:81` — useEffect(load, [load]);
* `src/screens/People.tsx:89` — useEffect(() => {
* `src/screens/Schedule.tsx:145` — useEffect(load, [load]);
* `src/screens/Settings.tsx:87` — useEffect(() => {
* `src/screens/StateRoute.tsx:37` — useEffect(() => {
* `src/screens/StateRoute.tsx:78` — useEffect(() => {
* `src/screens/Undo.tsx:68` — useEffect(load, [load]);
* `src/screens/Voice.tsx:680` — useEffect(() => {
* `src/screens/Voice.tsx:1024` — useEffect(() => {
* `src/screens/Voice.tsx:1089` — useEffect(() => {
* `src/screens/Voice.tsx:1093` — useEffect(
* `src/screens/Voice.tsx:1157` — useEffect(() => {
* `src/screens/Voice.tsx:1218` — useEffect(() => {
* `src/screens/Voice.tsx:1886` — useEffect(() => {
* `src/screens/Voice.tsx:1902` — useEffect(() => {
* `src/screens/Voice.tsx:2480` — useEffect(() => {
* `src/screens/Voice.tsx:2535` — useEffect(() => {
* `src/screens/Voice.tsx:2545` — useEffect(() => {
* `src/screens/Voice.tsx:2567` — useEffect(() => {
* `src/screens/Voice.tsx:2738` — useEffect(() => {
* `src/screens/Voice.tsx:2771` — useEffect(() => {
* `src/screens/Voice.tsx:2796` — useEffect(() => {
* `src/screens/Voice.tsx:2807` — useEffect(() => {
* `src/screens/Voice.tsx:2865` — useEffect(() => {
* `src/screens/Voice.tsx:2871` — useEffect(() => {
* `src/screens/Voice.tsx:2878` — useEffect(() => {
* `src/screens/Voice.tsx:2903` — useEffect(() => {
* `src/screens/Voice.tsx:2918` — useEffect(() => {
* `src/screens/Voice.tsx:2944` — useEffect(() => {
* `src/screens/Voice.tsx:2992` — useEffect(() => {
* `src/screens/Voice.tsx:2998` — useEffect(() => {
* `src/screens/Voice.tsx:3014` — useEffect(() => {
* `src/screens/Voice.tsx:3253` — useEffect(() => {
* `src/screens/Voice.tsx:3288` — useEffect(
* `src/screens/Voice.tsx:3377` — useEffect(() => {
* `src/components/DownloadBar.tsx:73` — useEffect(() => {
* `src/components/DownloadBar.tsx:80` — useEffect(() => {
* `src/components/EveryDayCard.tsx:56` — useEffect(() => {
* `src/components/HotkeyCard.tsx:86` — useEffect(() => {
* `src/components/MemoryBackups.tsx:87` — useEffect(() => {
* `src/components/MemoryFacts.tsx:76` — useEffect(load, [load]);
* `src/components/MemoryNote.tsx:65` — useEffect(() => {
* `src/components/MicrophoneCheck.tsx:22` — useEffect(() => {
* `src/components/NetworkCard.tsx:78` — useEffect(() => {
* `src/components/PauseSwitch.tsx:21` — useEffect(() => {
* `src/components/PauseSwitch.tsx:37` — useEffect(() => {
* `src/components/ReadinessCard.tsx:116` — useEffect(() => {
* `src/components/ReadinessCard.tsx:167` — useEffect(() => {
* `src/components/ReadinessCard.tsx:188` — useEffect(() => {
* `src/components/ReadinessCard.tsx:193` — useEffect(() => {
* `src/components/ReadinessCard.tsx:200` — useEffect(() => {
* `src/components/ReadinessCard.tsx:228` — useEffect(() => {
* `src/components/ReadinessCard.tsx:422` — useEffect(() => { if (!status?.engine_running) setSmoke(null); }, [status?.engine_running]);
* `src/components/ReadinessCard.tsx:423` — useEffect(() => { setSmoke(null); }, [status?.engine_program, status?.model_name]);
* `src/components/RecentFailures.tsx:58` — useEffect(() => {
* `src/components/ResourceReport.tsx:58` — useEffect(load, []);
* `src/components/RightNowCard.tsx:40` — useEffect(() => {
* `src/components/SleepCard.tsx:44` — useEffect(() => {
* `src/components/StartupCard.tsx:35` — useEffect(() => {
* `src/components/TrustCard.tsx:72` — useEffect(() => {
* `src/components/UpdateCard.tsx:70` — useEffect(() => {
* `src/components/WeekStatsCard.tsx:57` — useEffect(() => {
* `src/lib/useVoice.ts:672` — useEffect(() => {
* `src/lib/useVoice.ts:709` — useEffect(
* `src/lib/useVoice.ts:722` — useEffect(() => {
* `src/lib/useVoice.ts:729` — useEffect(() => {

## Сетевые вызовы и запись

| Где | Строка | Как вызывается |
| --- | --- | --- |
| `src/components/ReadinessCard.tsx` | 700 | по нажатию |
| `src/components/ReadinessCard.tsx` | 727 | по нажатию |
| `src/components/ReadinessCard.tsx` | 761 | по нажатию |
| `src/components/ReadinessCard.tsx` | 792 | по нажатию |

## Что это значит

Если в колонке «как вызывается» появилось **САМО** у вызова, который пишет
или ходит в сеть, — это и есть незаметная автономность, и `--check` валит
сборку. Чтение состояния из эффекта при открытии — не она: без него экран
пуст, и оно ничего не меняет.
