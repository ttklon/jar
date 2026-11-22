//! Ядро ZShelper: каркас приложения, каталог действий и первые «руки».
//!
//! Порядок этапов и контракты — `docs/BUILD-GUIDE.md`. Что уже умеет ядро:
//! * читает реестр и отдаёт его UI (`registry`);
//! * проводит каждое действие через политику риска (`policy`) и журнал (`audit`);
//! * выполняет инструменты (`tools`) с независимой проверкой результата (`verifier`);
//! * собирает их в сценарии (`flows`) — план из шагов, каждый со своим подтверждением;
//! * показывает, что было сделано: журнал (`audit`) читается экраном «История»;
//! * помнит удачные запуски и их параметры в SQLite (`memory`), чтобы не спрашивать
//!   одно и то же дважды;
//! * по фразе человека находит действия в реестре (`planner`) и честно говорит, что из
//!   них выполнимо;
//! * читает папку моделей (`models`) и показывает, какие `.gguf` там лежат и целы ли они;
//! * скачивает файл модели через системный `curl` (`download`): сначала `.part`, потом
//!   проверка sha256, и только затем переименование;
//! * показывает, сколько занимают модели и сколько свободно на диске, и удаляет файл
//!   только после подтверждения человеком;
//! * умеет запускать локальный сервер модели и ждать от него ответа (`server`), а не
//!   только «процесс стартовал»; конкретные флаги `llama-server` живут в `llama`;
//! * знает, как это делается в 87 программах (`profiles`), и честно показывает, что из
//!   этого уже исполняется;
//! * вызывается из любой программы по `Ctrl+Alt+Z` (`hotkey`);
//! * разбирает систему: процессы и службы, автозапуск, диски и SMART, температуры,
//!   здоровье накопителей, свободное место, сеть и порты (`tools`);
//! * работает с файлами: создать, прочитать, записать, заменить, найти, сравнить,
//!   распаковать, сжать, отправить на сервер — с проверкой результата, а не с «готово»;
//! * прогоняет тесты проекта и ищет слово в коде (`dev-code`), сжимает видео через
//!   ffmpeg — а если ffmpeg нет, говорит об этом и не ставит его сама;
//! * ведёт очередь дел и петлю «сделать — посмотреть — поправить», помня счёт по цели.
//!
//! Чего ещё нет, и это сказано в интерфейсе, а не только здесь: сервера обновлений и
//! лицензий (M1.5, M7), моделей и голоса в комплекте — их приносит человек (M2, M3),
//! MCP-клиента (M4).

pub mod audit;
pub mod autostart;
pub mod backup;
pub mod budget;
pub mod container;
pub mod custom;
pub mod diagnostics;
pub mod download;
pub mod enginecheck;
pub mod evals;
pub mod executor;
pub mod flows;
pub mod hand;
pub mod hotkey;
pub mod idle;
pub mod intent;
pub mod ipc;
pub mod isolation;
pub mod learn;
pub mod llama;
pub mod llm;
pub mod logging;
pub mod machine;
pub mod memory;
pub mod models;
pub mod osupdate;
pub mod places;
pub mod plan;
pub mod planner;
pub mod policy;
pub mod profiles;
pub mod readiness;
pub mod registry;
pub mod reply;
pub mod restricted;
pub mod roles;
pub mod runtime;
pub mod sandbox;
pub mod schedule;
pub mod selfcheck;
pub mod server;
pub mod services;
pub mod step;
pub mod stt;
pub mod stt_audio;
pub mod stt_http;
pub mod stt_session;
pub mod timing;
pub mod tools;
pub mod tray;
pub mod trial;
pub mod uia;
pub mod undo;
pub mod verifier;
pub mod window;

use std::sync::atomic::AtomicBool;
use std::sync::Arc;

use tauri::Manager;

use audit::Audit;
use ipc::{AppState, Inner};
use memory::Memory;
use policy::PolicyState;
use registry::Registry;

pub fn run() {
    // Засечка до всего остального: «старт» — это от входа в main до окна,
    // и всё, что мы успели сделать, должно в него попасть (шаг 381).
    timing::mark_start();
    let log_file = logging::init();
    tracing::info!(
        version = env!("CARGO_PKG_VERSION"),
        log = %log_file.display(),
        "ZShelper запускается"
    );
    let app_dir = logging::ensure_app_dir();

    // Реестр встроен в бинарник и проверен CI. Если он не разбирается — это
    // ошибка сборки, а не пользователя: лучше явно упасть на старте.
    let registry = Registry::load().expect("встроенный реестр обязан разбираться");
    tracing::info!(
        actions = registry.len(),
        domains = registry.stats().domains,
        verbs = registry.stats().verbs,
        tools = tools::all().len(),
        flows = flows::all().len(),
        "реестр загружен"
    );

    let base = app_dir.unwrap_or_else(std::env::temp_dir);
    let audit = Audit::new(base.join("audit.jsonl"));

    // Журнал отката — рядом с журналом действий, но отвечает на другой вопрос: не «что
    // сделали», а «как вернуть». Без него приложение работает, просто не обещает откат.
    if !undo::init(base.join("undo.jsonl")) {
        tracing::warn!("журнал отката уже был открыт — вторая инициализация пропущена");
    }

    // Служебные файлы рук (например, базис замера «до/после») — там же, рядом с журналами:
    // человек ищет свои данные в одном месте, а не по трём.
    tools::set_scratch_dir(base.clone());

    // Память не должна мешать запуску: без неё приложение работает, просто не помнит
    // прошлые параметры. Поэтому ошибка уходит в лог, а не в панику.
    // Повреждённая база — не повод не запускаться, но и не повод молчать: человек
    // должен узнать, что память пуста не «сама по себе», а потому что файл битый.
    // Раньше приложение тихо переезжало на временную базу, и это была настоящая
    // тихая потеря: прошлые параметры исчезали без единого слова.
    // Копия делается ДО открытия: если открыть битую базу и копировать после,
    // копия будет битой. Пять копий — предел, чтобы папка данных не стала складом.
    let mut memory_note: Option<String> = None;
    let seconds = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|value| value.as_secs())
        .unwrap_or(0);
    // Метка в секундах, а не в человеческом виде: у нас нет календаря в зависимостях,
    // а придумывать свой — значит ошибиться в високосном году. Секунды сортируются
    // по имени так же честно, и их видно в `backups/` без разбора.
    let stamp = format!("{seconds:012}");
    let note_copy = |error: String| {
        // Не беда, если копии не будет: приложение всё равно должно запуститься.
        // Но и молча глотать нельзя — это единственная страховка памяти.
        tracing::warn!(%error, "резервная копия памяти не сделана");
    };
    // До открытия: копия рабочей базы, какой она была в прошлый раз.
    if let Err(error) = backup::make(
        &base.join("memory.db"),
        &backup::dir(&base),
        &stamp,
        (seconds % u32::MAX as u64) as u32,
        backup::KEEP,
    ) {
        note_copy(error);
    }

    let memory = match Memory::open(base.join("memory.db")) {
        Ok(memory) => memory,
        Err(error) => {
            tracing::warn!(%error, "память недоступна — продолжаю без неё");
            // Говорим три вещи, и все три человеку нужны: что случилось, что
            // теперь будет и что можно сделать. Строки собираются по одной:
            // длинный литерал с переносами однажды уже превратился в текст с
            // тридцатью шестью пробелами посреди фразы, и человек это прочитал.
            let mut note = format!(
                "База памяти не открылась: {error}. Работаю на временной — прошлые \
настройки и история этого запуска не сохранятся, сам файл базы не тронут."
            );
            match backup::best_usable(&backup::dir(&base)) {
                // Имя кнопки — настоящее: в настройках она подписана «Вернуть».
                // Текст, который называет несуществующую кнопку, хуже молчания:
                // человек ищет её и не находит.
                Some(copy) => note.push_str(&format!(
                    "\n\nЕсть целая копия ({}, {} КБ): в настройках, в разделе \
«Резервные копии памяти», у неё есть кнопка «Вернуть».",
                    copy.file,
                    copy.bytes / 1024
                )),
                None => {
                    note.push_str(
                        "\n\nЦелых копий нет: восстанавливать не из чего, файл оставлен для разбора.",
                    );
                }
            }
            memory_note = Some(note);
            Memory::open(std::env::temp_dir().join("zshelper-memory.db"))
                .expect("временная память обязана открыться")
        }
    };

    // После открытия: если копий нет вовсе (первый запуск — копировать было
    // нечего), снимаем первую прямо сейчас. Иначе у человека, у которого база
    // только что создалась, страховки нет до следующего запуска, и живая
    // проверка `memory-backup-on-start` это честно поймала.
    if backup::list(&backup::dir(&base)).is_empty() {
        if let Err(error) = backup::make(
            &base.join("memory.db"),
            &backup::dir(&base),
            &format!("{stamp}-0"),
            (seconds % u32::MAX as u64) as u32,
            backup::KEEP,
        ) {
            note_copy(error);
        }
    }

    let state = AppState {
        inner: Arc::new(Inner {
            registry,
            audit,
            memory,
            models_dir: models::dir(&base),
            base_dir: base.clone(),
            engine: std::sync::Mutex::new(None),
            asr: Arc::default(),
            policy: PolicyState::new(),
            cancel: AtomicBool::new(false),
            presence: std::sync::Mutex::new(None),
            engine_idle: std::sync::Mutex::new(crate::idle::Idle::default()),
            memory_note,
        }),
        log_file: log_file.display().to_string(),
    };

    tauri::Builder::default()
        // Второй запуск не открывает второе приложение: показываем уже работающее.
        // Без этого трей и горячая клавиша удваиваются, а журнал пишется из двух мест.
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            tracing::info!("повторный запуск — показываю открытое окно");
            hotkey::reveal_main(app);
        }))
        .manage(state)
        .invoke_handler(tauri::generate_handler![
            ipc::registry_snapshot,
            ipc::app_status,
            ipc::list_tools,
            ipc::list_flows,
            ipc::audit_tail,
            ipc::memory_runs,
            ipc::plan_for,
            ipc::list_models,
            ipc::verify_model,
            ipc::download_model,
            ipc::cancel_download,
            ipc::download_progress,
            ipc::readiness_status,
            ipc::network_addresses,
            ipc::probe_network,
            ipc::download_runtime,
            ipc::remove_runtime,
            ipc::smoke_check,
            ipc::remove_model,
            ipc::remove_everything,
            ipc::think_stream,
            ipc::say,
            ipc::memory_backups,
            ipc::diagnostics_pack,
            ipc::memory_restore,
            ipc::engine_status,
            ipc::start_engine,
            ipc::stop_engine,
            ipc::list_roles,
            ipc::assign_role,
            ipc::clear_role,
            ipc::check_plan,
            ipc::save_plan,
            ipc::last_plan,
            ipc::draft_plan,
            ipc::fill_plan,
            ipc::request_learning,
            ipc::learning_requests,
            ipc::search_episodes,
            ipc::run_plan,
            ipc::speech_status,
            ipc::set_voice_tray_status,
            ipc::isolation_status,
            ipc::foreground_window,
            ipc::data_places,
            ipc::resource_report,
            ipc::self_check,
            ipc::repair,
            ipc::repair_memory,
            ipc::undo_report,
            ipc::undo_apply,
            ipc::autostart_status,
            ipc::autostart_enable,
            ipc::autostart_disable,
            ipc::ui_dump,
            ipc::ui_press,
            ipc::ui_type,
            ipc::machine_state,
            ipc::declare_presence,
            ipc::model_prompt,
            ipc::think,
            ipc::draft_hand,
            ipc::hand_drafts,
            ipc::trial_hand,
            ipc::trial_report,
            ipc::adopt_hand,
            ipc::custom_hands,
            ipc::remove_custom_hand,
            ipc::run_custom_hand,
            ipc::custom_run_report,
            ipc::forget_hand,
            ipc::facts,
            ipc::remember_fact,
            ipc::forget_fact,
            ipc::begin_transcription,
            ipc::cancel_transcription,
            ipc::transcribe_local,
            ipc::list_profiles,
            ipc::policy_for,
            ipc::confirm_tool,
            ipc::run_tool,
            ipc::cancel_tool
        ])
        .setup(|app| {
            hotkey::install(app);
            if let Err(error) = tray::install(app.handle()) {
                // Без трея приложение работает — окно открыто, логи есть.
                tracing::warn!(%error, "трей не установлен");
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() != "main" {
                return;
            }
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                // X означает «убрать окно»: выход — только явным пунктом трея,
                // иначе скрытый PTT исчез бы вместе с окном.
                api.prevent_close();
                if let Err(error) = window.hide() {
                    tracing::warn!(%error, "окно не удалось скрыть при закрытии");
                }
            }
        })
        .build(tauri::generate_context!())
        .expect("приложение не собралось")
        .run(|app, event| {
            // Движок — дочерний процесс: закрыть окно и оставить его работать нельзя,
            // иначе следующий запуск найдёт занятый порт и «чужой» сервер.
            if !matches!(
                event,
                tauri::RunEvent::ExitRequested { .. } | tauri::RunEvent::Exit
            ) {
                return;
            }

            let Some(state) = app.try_state::<AppState>() else {
                return;
            };
            state.inner.asr.shutdown();
            let taken = state
                .inner
                .engine
                .lock()
                .ok()
                .and_then(|mut guard| guard.take());
            let Some(mut server) = taken else { return };

            match server.stop() {
                Ok(()) => tracing::info!("движок остановлен при выходе"),
                Err(error) => tracing::warn!(%error, "движок не остановился при выходе"),
            }
        });
}
