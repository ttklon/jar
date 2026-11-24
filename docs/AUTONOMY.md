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
* `src/screens/Voice.tsx:601` — useEffect(() => {
* `src/screens/Voice.tsx:814` — useEffect(() => {
* `src/screens/Voice.tsx:878` — useEffect(() => {
* `src/screens/Voice.tsx:882` — useEffect(
* `src/screens/Voice.tsx:946` — useEffect(() => {
* `src/screens/Voice.tsx:989` — useEffect(() => {
* `src/screens/Voice.tsx:2188` — useEffect(() => {
* `src/screens/Voice.tsx:2243` — useEffect(() => {
* `src/screens/Voice.tsx:2253` — useEffect(() => {
* `src/screens/Voice.tsx:2275` — useEffect(() => {
* `src/screens/Voice.tsx:2446` — useEffect(() => {
* `src/screens/Voice.tsx:2476` — useEffect(() => {
* `src/screens/Voice.tsx:2501` — useEffect(() => {
* `src/screens/Voice.tsx:2522` — useEffect(() => {
* `src/screens/Voice.tsx:2528` — useEffect(() => {
* `src/screens/Voice.tsx:2535` — useEffect(() => {
* `src/screens/Voice.tsx:2560` — useEffect(() => {
* `src/screens/Voice.tsx:2575` — useEffect(() => {
* `src/screens/Voice.tsx:2601` — useEffect(() => {
* `src/screens/Voice.tsx:2649` — useEffect(() => {
* `src/screens/Voice.tsx:2655` — useEffect(() => {
* `src/screens/Voice.tsx:2671` — useEffect(() => {
* `src/screens/Voice.tsx:2853` — useEffect(() => {
* `src/screens/Voice.tsx:2885` — useEffect(
* `src/components/DownloadBar.tsx:73` — useEffect(() => {
* `src/components/DownloadBar.tsx:80` — useEffect(() => {
* `src/components/MemoryBackups.tsx:80` — useEffect(() => {
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
