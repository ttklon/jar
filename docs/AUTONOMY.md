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

* `src/app.tsx:262` — useEffect(() => {
* `src/app.tsx:278` — useEffect(() => {
* `src/app.tsx:300` — useEffect(() => {
* `src/app.tsx:316` — useEffect(() => {
* `src/app.tsx:342` — useEffect(() => {
* `src/app.tsx:439` — useEffect(() => {
* `src/app.tsx:459` — useEffect(() => {
* `src/app.tsx:480` — useEffect(() => {
* `src/app.tsx:506` — useEffect(() => {
* `src/app.tsx:513` — useEffect(() => {
* `src/app.tsx:520` — useEffect(() => {
* `src/screens/Apps.tsx:24` — useEffect(() => {
* `src/screens/Ask.tsx:159` — useEffect(() => {
* `src/screens/DataPlaces.tsx:52` — useEffect(() => {
* `src/screens/DataPlaces.tsx:66` — useEffect(() => {
* `src/screens/Flows.tsx:26` — useEffect(() => {
* `src/screens/Hands.tsx:55` — useEffect(() => {
* `src/screens/Journal.tsx:280` — useEffect(load, [load]);
* `src/screens/Models.tsx:221` — useEffect(load, [load]);
* `src/screens/Settings.tsx:81` — useEffect(() => {
* `src/screens/StateRoute.tsx:37` — useEffect(() => {
* `src/screens/StateRoute.tsx:78` — useEffect(() => {
* `src/screens/Undo.tsx:68` — useEffect(load, [load]);
* `src/screens/Voice.tsx:662` — useEffect(() => {
* `src/screens/Voice.tsx:1006` — useEffect(() => {
* `src/screens/Voice.tsx:1071` — useEffect(() => {
* `src/screens/Voice.tsx:1075` — useEffect(
* `src/screens/Voice.tsx:1139` — useEffect(() => {
* `src/screens/Voice.tsx:1200` — useEffect(() => {
* `src/screens/Voice.tsx:2411` — useEffect(() => {
* `src/screens/Voice.tsx:2466` — useEffect(() => {
* `src/screens/Voice.tsx:2476` — useEffect(() => {
* `src/screens/Voice.tsx:2498` — useEffect(() => {
* `src/screens/Voice.tsx:2669` — useEffect(() => {
* `src/screens/Voice.tsx:2702` — useEffect(() => {
* `src/screens/Voice.tsx:2727` — useEffect(() => {
* `src/screens/Voice.tsx:2748` — useEffect(() => {
* `src/screens/Voice.tsx:2754` — useEffect(() => {
* `src/screens/Voice.tsx:2761` — useEffect(() => {
* `src/screens/Voice.tsx:2786` — useEffect(() => {
* `src/screens/Voice.tsx:2801` — useEffect(() => {
* `src/screens/Voice.tsx:2827` — useEffect(() => {
* `src/screens/Voice.tsx:2875` — useEffect(() => {
* `src/screens/Voice.tsx:2881` — useEffect(() => {
* `src/screens/Voice.tsx:2897` — useEffect(() => {
* `src/screens/Voice.tsx:3136` — useEffect(() => {
* `src/screens/Voice.tsx:3168` — useEffect(
* `src/components/DownloadBar.tsx:73` — useEffect(() => {
* `src/components/DownloadBar.tsx:80` — useEffect(() => {
* `src/components/MemoryBackups.tsx:87` — useEffect(() => {
* `src/components/MemoryFacts.tsx:50` — useEffect(load, [load]);
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
