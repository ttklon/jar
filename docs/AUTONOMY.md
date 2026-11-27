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

* `src/app.tsx:267` — useEffect(() => {
* `src/app.tsx:283` — useEffect(() => {
* `src/app.tsx:305` — useEffect(() => {
* `src/app.tsx:321` — useEffect(() => {
* `src/app.tsx:347` — useEffect(() => {
* `src/app.tsx:444` — useEffect(() => {
* `src/app.tsx:464` — useEffect(() => {
* `src/app.tsx:485` — useEffect(() => {
* `src/app.tsx:511` — useEffect(() => {
* `src/app.tsx:518` — useEffect(() => {
* `src/app.tsx:525` — useEffect(() => {
* `src/screens/Apps.tsx:24` — useEffect(() => {
* `src/screens/Ask.tsx:159` — useEffect(() => {
* `src/screens/DataPlaces.tsx:52` — useEffect(() => {
* `src/screens/DataPlaces.tsx:66` — useEffect(() => {
* `src/screens/Flows.tsx:26` — useEffect(() => {
* `src/screens/Hands.tsx:55` — useEffect(() => {
* `src/screens/Journal.tsx:194` — useEffect(() => {
* `src/screens/Journal.tsx:385` — useEffect(load, [load]);
* `src/screens/Models.tsx:221` — useEffect(load, [load]);
* `src/screens/Schedule.tsx:144` — useEffect(load, [load]);
* `src/screens/Settings.tsx:83` — useEffect(() => {
* `src/screens/StateRoute.tsx:37` — useEffect(() => {
* `src/screens/StateRoute.tsx:78` — useEffect(() => {
* `src/screens/Undo.tsx:68` — useEffect(load, [load]);
* `src/screens/Voice.tsx:665` — useEffect(() => {
* `src/screens/Voice.tsx:1009` — useEffect(() => {
* `src/screens/Voice.tsx:1074` — useEffect(() => {
* `src/screens/Voice.tsx:1078` — useEffect(
* `src/screens/Voice.tsx:1142` — useEffect(() => {
* `src/screens/Voice.tsx:1203` — useEffect(() => {
* `src/screens/Voice.tsx:2414` — useEffect(() => {
* `src/screens/Voice.tsx:2469` — useEffect(() => {
* `src/screens/Voice.tsx:2479` — useEffect(() => {
* `src/screens/Voice.tsx:2501` — useEffect(() => {
* `src/screens/Voice.tsx:2672` — useEffect(() => {
* `src/screens/Voice.tsx:2705` — useEffect(() => {
* `src/screens/Voice.tsx:2730` — useEffect(() => {
* `src/screens/Voice.tsx:2764` — useEffect(() => {
* `src/screens/Voice.tsx:2770` — useEffect(() => {
* `src/screens/Voice.tsx:2777` — useEffect(() => {
* `src/screens/Voice.tsx:2802` — useEffect(() => {
* `src/screens/Voice.tsx:2817` — useEffect(() => {
* `src/screens/Voice.tsx:2843` — useEffect(() => {
* `src/screens/Voice.tsx:2891` — useEffect(() => {
* `src/screens/Voice.tsx:2897` — useEffect(() => {
* `src/screens/Voice.tsx:2913` — useEffect(() => {
* `src/screens/Voice.tsx:3152` — useEffect(() => {
* `src/screens/Voice.tsx:3184` — useEffect(
* `src/components/DownloadBar.tsx:73` — useEffect(() => {
* `src/components/DownloadBar.tsx:80` — useEffect(() => {
* `src/components/HotkeyCard.tsx:86` — useEffect(() => {
* `src/components/MemoryBackups.tsx:87` — useEffect(() => {
* `src/components/MemoryFacts.tsx:76` — useEffect(load, [load]);
* `src/components/MemoryNote.tsx:65` — useEffect(() => {
* `src/components/MicrophoneCheck.tsx:22` — useEffect(() => {
* `src/components/NetworkCard.tsx:78` — useEffect(() => {
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
* `src/components/TrustCard.tsx:72` — useEffect(() => {
* `src/components/UpdateCard.tsx:70` — useEffect(() => {
* `src/components/WeekStatsCard.tsx:57` — useEffect(() => {
* `src/lib/useVoice.ts:662` — useEffect(() => {
* `src/lib/useVoice.ts:699` — useEffect(
* `src/lib/useVoice.ts:712` — useEffect(() => {
* `src/lib/useVoice.ts:719` — useEffect(() => {

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
