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

* `src/app.tsx:249` — useEffect(() => {
* `src/app.tsx:260` — useEffect(() => {
* `src/app.tsx:269` — useEffect(() => {
* `src/app.tsx:334` — useEffect(() => {
* `src/app.tsx:353` — useEffect(() => {
* `src/app.tsx:370` — useEffect(() => {
* `src/app.tsx:377` — useEffect(() => {
* `src/screens/Apps.tsx:24` — useEffect(() => {
* `src/screens/Ask.tsx:147` — useEffect(() => {
* `src/screens/DataPlaces.tsx:52` — useEffect(() => {
* `src/screens/DataPlaces.tsx:66` — useEffect(() => {
* `src/screens/Flows.tsx:26` — useEffect(() => {
* `src/screens/Hands.tsx:36` — useEffect(() => {
* `src/screens/Journal.tsx:198` — useEffect(load, [load]);
* `src/screens/Models.tsx:221` — useEffect(load, [load]);
* `src/screens/Settings.tsx:58` — useEffect(() => {
* `src/screens/StateRoute.tsx:37` — useEffect(() => {
* `src/screens/StateRoute.tsx:78` — useEffect(() => {
* `src/screens/Undo.tsx:68` — useEffect(load, [load]);
* `src/screens/Voice.tsx:648` — useEffect(() => {
* `src/screens/Voice.tsx:914` — useEffect(() => {
* `src/screens/Voice.tsx:979` — useEffect(() => {
* `src/screens/Voice.tsx:983` — useEffect(
* `src/screens/Voice.tsx:1047` — useEffect(() => {
* `src/screens/Voice.tsx:1108` — useEffect(() => {
* `src/screens/Voice.tsx:2319` — useEffect(() => {
* `src/screens/Voice.tsx:2374` — useEffect(() => {
* `src/screens/Voice.tsx:2384` — useEffect(() => {
* `src/screens/Voice.tsx:2406` — useEffect(() => {
* `src/screens/Voice.tsx:2577` — useEffect(() => {
* `src/screens/Voice.tsx:2610` — useEffect(() => {
* `src/screens/Voice.tsx:2635` — useEffect(() => {
* `src/screens/Voice.tsx:2656` — useEffect(() => {
* `src/screens/Voice.tsx:2662` — useEffect(() => {
* `src/screens/Voice.tsx:2669` — useEffect(() => {
* `src/screens/Voice.tsx:2694` — useEffect(() => {
* `src/screens/Voice.tsx:2709` — useEffect(() => {
* `src/screens/Voice.tsx:2735` — useEffect(() => {
* `src/screens/Voice.tsx:2783` — useEffect(() => {
* `src/screens/Voice.tsx:2789` — useEffect(() => {
* `src/screens/Voice.tsx:2805` — useEffect(() => {
* `src/screens/Voice.tsx:3044` — useEffect(() => {
* `src/screens/Voice.tsx:3076` — useEffect(
* `src/components/DownloadBar.tsx:73` — useEffect(() => {
* `src/components/DownloadBar.tsx:80` — useEffect(() => {
* `src/components/MemoryBackups.tsx:87` — useEffect(() => {
* `src/components/MemoryNote.tsx:65` — useEffect(() => {
* `src/components/MicrophoneCheck.tsx:22` — useEffect(() => {
* `src/components/NetworkCard.tsx:78` — useEffect(() => {
* `src/components/ReadinessCard.tsx:99` — useEffect(() => {
* `src/components/ReadinessCard.tsx:143` — useEffect(() => {
* `src/components/ReadinessCard.tsx:164` — useEffect(() => {
* `src/components/ReadinessCard.tsx:169` — useEffect(() => {
* `src/components/ReadinessCard.tsx:176` — useEffect(() => {
* `src/components/ReadinessCard.tsx:201` — useEffect(() => {
* `src/components/ReadinessCard.tsx:365` — useEffect(() => { if (!status?.engine_running) setSmoke(null); }, [status?.engine_running]);
* `src/components/ReadinessCard.tsx:366` — useEffect(() => { setSmoke(null); }, [status?.engine_program, status?.model_name]);
* `src/components/RecentFailures.tsx:58` — useEffect(() => {
* `src/components/ResourceReport.tsx:58` — useEffect(load, []);
* `src/lib/useVoice.ts:662` — useEffect(() => {
* `src/lib/useVoice.ts:699` — useEffect(
* `src/lib/useVoice.ts:712` — useEffect(() => {
* `src/lib/useVoice.ts:719` — useEffect(() => {

## Сетевые вызовы и запись

| Где | Строка | Как вызывается |
| --- | --- | --- |
| `src/components/ReadinessCard.tsx` | 643 | по нажатию |
| `src/components/ReadinessCard.tsx` | 670 | по нажатию |
| `src/components/ReadinessCard.tsx` | 704 | по нажатию |
| `src/components/ReadinessCard.tsx` | 735 | по нажатию |

## Что это значит

Если в колонке «как вызывается» появилось **САМО** у вызова, который пишет
или ходит в сеть, — это и есть незаметная автономность, и `--check` валит
сборку. Чтение состояния из эффекта при открытии — не она: без него экран
пуст, и оно ничего не меняет.
