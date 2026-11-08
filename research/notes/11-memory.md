# 11 — Память: чтобы система умнела от использования

Без памяти ассистент каждый раз «новый знакомый». С памятью — он помнит, что вы просили,
как вы это называете, какие папки ваши, что уже пробовали и не сработало.

## 1. Пять видов памяти

| Вид | Что хранит | Где | Срок |
| --- | --- | --- | --- |
| **Рабочая (working)** | текущая задача, шаги, открытые вкладки | RAM + таблица `job_steps` | на время задачи |
| **Эпизодическая** | «что было»: диалоги, действия, результаты | SQLite `episodes` | 30–90 дней |
| **Семантическая** | факты о пользователе и мире: «мой рабочий стол = D:\Desk», «проект X на Python» | SQLite `facts` + векторы | долго, с TTL и подтверждением |
| **Процедурная** | как делать: скиллы, рецепты, «в CapCut экспорт здесь» | `skills/`, `profiles/` | долго |
| **Документная (RAG)** | содержимое файлов/заметок/сайтов, которые пользователь дал | `documents` + `chunks` + vec | по политике |

## 2. Схема данных (SQLite + sqlite-vec + FTS5)

```sql
CREATE TABLE episodes (
  id TEXT PRIMARY KEY, ts INT, session_id TEXT, job_id TEXT,
  kind TEXT,            -- "utterance"|"action"|"observation"|"outcome"
  text TEXT, meta_json TEXT,
  embedding BLOB        -- vec0 virtual table ссылается по rowid
);
CREATE VIRTUAL TABLE episodes_vec USING vec0(embedding float[1024]);

CREATE TABLE facts (
  id TEXT PRIMARY KEY, subject TEXT, predicate TEXT, object TEXT,
  confidence REAL, source TEXT,        -- "user-told"|"inferred"|"observed"
  created_at INT, last_used INT, ttl_days INT, pinned INT
);
CREATE UNIQUE INDEX facts_uq ON facts(subject, predicate, object);

CREATE TABLE documents (
  id TEXT PRIMARY KEY, path TEXT, sha256 TEXT, title TEXT,
  added_at INT, tags TEXT, size INT, mtime INT
);
CREATE TABLE chunks (
  id TEXT PRIMARY KEY, doc_id TEXT, idx INT, text TEXT, page INT,
  embedding BLOB
);
CREATE VIRTUAL TABLE chunks_fts USING fts5(text, content='chunks', content_rowid='rowid');
```

Почему так:
- один файл → бэкап и перенос тривиальны;
- `sqlite-vec` даёт ANN в том же процессе, без сервера (`sources/memory-and-rag/asg017__sqlite-vec/`);
- FTS5 нужен для точных совпадений (имена файлов, артикулы, редкие слова) — гибридный поиск
  BM25+вектор всегда лучше чистого вектора на коротких запросах.

## 3. Что и когда запоминать

**Записываем автоматически:**
- предпочтения, сказанные явно («всегда сохраняй в D:\Проекты») → `facts`, confidence 0.9;
- успешные последовательности действий → кандидат в `skills` (после второго повтора);
- «не сработало» → негативный факт (не повторять тот же путь).

**Спрашиваем перед записью:**
- всё, что касается личного (имена, адреса, здоровье, финансы);
- выводы, сделанные моделью («пользователь, кажется, любит тёмную тему»).

**Никогда:**
- пароли, токены, номера карт (даже в зашифрованном виде — не наша зона);
- содержимое буфера обмена по умолчанию;
- аудио и скриншоты «на всякий случай».

## 4. Извлечение (retrieval) на каждый запрос

```
query → normalize (язык, опечатки, раскрытие аббревиатур)
      → [FTS5 BM25: top 20]  +  [vector: top 20]
      → RRF-слияние (reciprocal rank fusion)
      → rerank (bge-reranker) → top 6
      → сжатие до 600–800 токенов с сохранением цифр/путей/имён
      → в промпт с маркерами источника
```

Правила:
- **Свежесть важнее похожести**: при равном score предпочитаем более новое (для «что я говорил
  вчера»), кроме фактов с `pinned`.
- **Разрешение конфликтов**: новый факт с `source=user-told` перекрывает `inferred`, старый
  помечается `superseded_by`.
- **Забывание**: TTL + LRU по `last_used`; «архив» вместо удаления (можно восстановить).
- **Дедупликация**: одинаковые чанки из разных файлов схлопываем (хэш текста).

## 5. Консолидация (ночью или по простою)

1. Суммаризовать эпизоды дня → 5–15 «событий» (что делали, чем закончилось).
2. Извлечь факты-кандидаты → дедуп против существующих → предложить пользователю пачкой
   («вот что я понял о вас, поправьте»).
3. Пересчитать эмбеддинги для изменившихся документов.
4. Удалить шум (episodes с `outcome=abandoned`, без обращений).
5. Обновить статистику скиллов (что работает, что нет) — влияет на retrieval инструментов.

Это дешёвая версия идей Mem0/Letta/Graphiti, но без их веса: см.
`sources/memory-and-rag/mem0ai__mem0/`, `letta-ai__letta/`, `getzep__graphiti/`.

## 6. Память и приватность

- Всё локально; экспорт/удаление по кнопке («покажи всё, что ты обо мне знаешь» — обязательная
  функция, это вопрос доверия).
- Категории с отдельными выключателями: проекты / предпочтения / история действий / документы.
- Шифрование файла БД опционально (SQLCipher) — но тогда поиск медленнее; по умолчанию DPAPI
  для секретов, БД — обычная (локальный диск).
- «Забыть это» голосом → удаление по семантическому поиску с подтверждением списка.

## 7. Документы и RAG для «прочитай и перескажи»

Конвейер загрузки: `detect(type) → parse → chunk → embed → index`, где
- PDF: `docling`/`marker` (таблицы, колонки), OCR для сканов;
- DOCX/XLSX/PPTX: нативные парсеры (не «текст из XML» на глаз);
- изображения: OCR + (опц.) VLM-описание;
- видео/аудио: ASR с таймкодами → чанки по 30–60 с;
- веб: `readability` + markdown.

Чанкинг: 400–800 токенов с перекрытием 15 %, по границам разделов; для кода — по функциям
(tree-sitter); для таблиц — «строка = чанк» с заголовками.

## 8. Память диалога (короткая)

- Последние 6–10 реплик — дословно.
- Далее — «сжатое резюме» (обновляется инкрементально, 1.7B моделью).
- Явные «закладки» пользователя («запомни это») → `facts` с `pinned=1`.
- Не тащим в контекст сырые логи инструментов — только их `summary` (это экономит 70–90 %
  токенов на длинных задачах).

## 9. Источники в vault

| Тема | Файл |
| --- | --- |
| sqlite-vec | `sources/memory-and-rag/asg017__sqlite-vec/README.md` |
| better-sqlite3 | `sources/memory-and-rag/WiseLibs__better-sqlite3/README.md` |
| LanceDB / Chroma / Qdrant / FAISS (сравнение) | `sources/memory-and-rag/lancedb__lancedb/`, `chroma-core__chroma/`, `qdrant__qdrant/`, `facebookresearch__faiss/` |
| Mem0 (факты + консолидация) | `sources/memory-and-rag/mem0ai__mem0/README.md` |
| Letta (memory blocks, self-editing) | `sources/memory-and-rag/letta-ai__letta/README.md` |
| Graphiti (темпоральный граф знаний) | `sources/memory-and-rag/getzep__graphiti/README.md` |
| Cognee / LlamaIndex / txtAI | `sources/memory-and-rag/topoteretes__cognee/`, `run-llama__llama_index/`, `neuml__txtai/` |
| basic-memory (markdown-память) | `sources/mcp-and-tools/basicmachines-co__basic-memory/README.md` |
| Docling / unstructured (парсинг документов) | `sources/screen-understanding/docling-project__docling/`, `Unstructured-IO__unstructured/` |
| BM25/гибрид | `sources/memory-and-rag/pypi__rank-bm25.md` |

## 10. Открытые вопросы

- Нужен ли граф знаний (Graphiti-подобный) или хватит фактов + векторов? Гипотеза: для v1 —
  таблица `facts` (subject-predicate-object) + векторы; граф — если появятся запросы
  «связанные сущности».
- Эмбеддинги: bge-m3 (1024d, multilingual, 560M) vs Qwen3-Embedding-0.6B vs EmbeddingGemma-300M.
  Замерить скорость на CPU T1 и качество на русских запросах.
- Сколько эпизодов хранить: 90 дней сырых + вечные суммаризации — проверить размер БД
  (оценка: ~50 МБ/мес при активном использовании).
