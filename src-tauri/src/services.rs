//! База знаний о службах и системных процессах Windows.
//!
//! Зачем отдельным модулем: `tools.rs` — про то, **как** выполнять, а это про то, **что это такое**.
//! Вопрос «а что это за служба и можно ли её выключить?» задают чаще всего, и отвечать на него
//! догадками нельзя.
//!
//! Правила базы:
//!
//!  * **только то, что можно сказать уверенно.** Ни одной записи «на всякий случай»: выдуманное
//!    имя хуже отсутствующего, потому что выглядит как знание;
//!  * **у каждой записи названа причина.** «Можно отключить» без объяснения, что именно
//!    перестанет работать, — это не совет, а подсказка наугад;
//!  * **критичность и отключаемость — разные вещи.** Служба может быть необязательной, но с
//!    оговоркой: печать не нужна всем, но у кого принтер — без неё не напечатает;
//!  * **пометка «нельзя» не бывает пустой.** Записи с `Disable::Never` обязаны объяснять почему, и
//!    это проверяется тестом, а не обещанием;
//!  * **база не спорит с фактами.** Она говорит, что известно про имя, а состояние, путь и подпись
//!    берутся с машины: таблица не заменяет проверку.

/// Насколько запись важна для работы системы.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Criticality {
    /// Без этого Windows не загрузится или не пустит в систему.
    Core,
    /// Не ядро, но ломается что-то нужное: сеть, звук, обновления.
    Important,
    /// Нужно для конкретной функции: не нужна — можно не держать.
    Optional,
}

impl Criticality {
    /// Как назвать критичность человеку.
    pub fn label(self) -> &'static str {
        match self {
            Criticality::Core => "ядро системы",
            Criticality::Important => "важно для работы",
            Criticality::Optional => "по желанию",
        }
    }
}

/// Можно ли это отключать.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Disable {
    /// Нельзя: причина названа всегда.
    Never,
    /// Можно, но с оговоркой: что именно перестанет работать.
    WithCare,
    /// Можно спокойно.
    Yes,
}

impl Disable {
    /// Как назвать отключаемость человеку.
    pub fn label(self) -> &'static str {
        match self {
            Disable::Never => "нельзя",
            Disable::WithCare => "только с оговоркой",
            Disable::Yes => "можно",
        }
    }
}

/// Запись базы: что это, насколько важно, можно ли отключать и почему именно так.
#[derive(Debug, Clone, Copy)]
pub struct Note {
    /// Имя службы или процесса так, как его пишет система.
    pub name: &'static str,
    /// Что это такое, своими словами.
    pub what: &'static str,
    /// Насколько важно для работы системы.
    pub criticality: Criticality,
    /// Можно ли отключать.
    pub disable: Disable,
    /// Почему именно так: что перестанет работать или почему трогать нельзя.
    pub because: &'static str,
}

/// Записи базы. Порядок — по смыслу (ядро, службы, устройства, программы), а не по алфавиту:
/// читать её будут глазами, когда захотят добавить новую.
const NOTES: &[Note] = &[
    Note {
        name: "system",
        what: "ядро Windows в пользовательском виде; под этим именем обычно драйвер",
        criticality: Criticality::Core,
        disable: Disable::Never,
        because: "это не программа, а часть системы: останавливать нечего",
    },
    Note {
        name: "smss",
        what: "менеджер сеансов: создаёт сеансы пользователей при входе",
        criticality: Criticality::Core,
        disable: Disable::Never,
        because: "без него вход в систему не начинается",
    },
    Note {
        name: "csrss",
        what: "клиент-сервер подсистемы Windows: консоль и базовые вызовы",
        criticality: Criticality::Core,
        disable: Disable::Never,
        because: "остановка валит систему в синий экран, а не «выключает службу»",
    },
    Note {
        name: "wininit",
        what: "инициализация Windows при загрузке: запускает ключевые службы",
        criticality: Criticality::Core,
        disable: Disable::Never,
        because: "работает только на старте системы, трогать нечего",
    },
    Note {
        name: "winlogon",
        what: "вход в систему, блокировка экрана, смена пользователя",
        criticality: Criticality::Core,
        disable: Disable::Never,
        because: "без него не работает Ctrl+Alt+Del и блокировка",
    },
    Note {
        name: "services",
        what: "диспетчер управления службами: запускает и останавливает все службы",
        criticality: Criticality::Core,
        disable: Disable::Never,
        because: "останавливать его значит останавливать управление службами целиком",
    },
    Note {
        name: "lsass",
        what: "проверка входа в систему и политики безопасности",
        criticality: Criticality::Core,
        disable: Disable::Never,
        because: "остановка приводит к перезагрузке: Windows считает это атакой",
    },
    Note {
        name: "samss",
        what: "менеджер учётных записей: хранит и проверяет пароли локальных пользователей",
        criticality: Criticality::Core,
        disable: Disable::Never,
        because: "без него не проверяется ни один вход",
    },
    Note {
        name: "rpcss",
        what: "удалённый вызов процедур: на нём держится почти всё общение программ",
        criticality: Criticality::Core,
        disable: Disable::Never,
        because: "отключение не даёт системе загрузиться до рабочего стола",
    },
    Note {
        name: "dcomlaunch",
        what: "запуск служб по запросу через DCOM",
        criticality: Criticality::Core,
        disable: Disable::Never,
        because: "на нём держатся rpcss и половина системных служб",
    },
    Note {
        name: "plugplay",
        what: "обнаружение и установка устройств при подключении",
        criticality: Criticality::Core,
        disable: Disable::Never,
        because: "без него не работают ни флешки, ни клавиатура после загрузки",
    },
    Note {
        name: "power",
        what: "управление питанием и политикой электропитания",
        criticality: Criticality::Core,
        disable: Disable::Never,
        because: "отвечает за сон, яркость и реакцию на кнопку выключения",
    },
    Note {
        name: "profsvc",
        what: "загрузка профиля пользователя при входе",
        criticality: Criticality::Core,
        disable: Disable::Never,
        because: "без него вход не завершается: профиля нет",
    },
    Note {
        name: "eventlog",
        what: "журнал событий Windows",
        criticality: Criticality::Core,
        disable: Disable::Never,
        because: "без него не работают диагностика, часть служб и это приложение тоже",
    },
    Note {
        name: "keyiso",
        what: "изоляция ключей шифрования (CNG)",
        criticality: Criticality::Important,
        disable: Disable::Never,
        because: "на нём держатся сертификаты, подписи и проверка входа",
    },
    Note {
        name: "windefend",
        what: "Защитник Windows: антивирус и защита в реальном времени",
        criticality: Criticality::Important,
        disable: Disable::Never,
        because: "выключив его, вы останетесь без защиты; Windows включает его обратно сам",
    },
    Note {
        name: "mpssvc",
        what: "брандмауэр Windows: правила входящего и исходящего трафика",
        criticality: Criticality::Important,
        disable: Disable::Never,
        because: "без него машина открыта сети, а не «просто без фильтра»",
    },
    Note {
        name: "bfe",
        what: "основной фильтрующий движок: на нём работает брандмауэр",
        criticality: Criticality::Important,
        disable: Disable::Never,
        because: "отключение останавливает и брандмауэр, и часть VPN",
    },
    Note {
        name: "winmgmt",
        what: "инструментарий управления Windows (WMI)",
        criticality: Criticality::Important,
        disable: Disable::Never,
        because: "через него читают состояние системы скрипты — включая это приложение",
    },
    Note {
        name: "schedule",
        what: "планировщик заданий: запускает задачи по времени и событиям",
        criticality: Criticality::Important,
        disable: Disable::Never,
        because: "на нём держатся обслуживание, обновления и часть программ",
    },
    Note {
        name: "cryptsvc",
        what: "службы криптографии: подписи драйверов, каталоги, установка",
        criticality: Criticality::Important,
        disable: Disable::Never,
        because: "без него не проверяются подписи и не ставится часть программ",
    },
    Note {
        name: "sppsvc",
        what: "защита лицензий Windows и Office",
        criticality: Criticality::Important,
        disable: Disable::Never,
        because: "без него система считает себя неактивированной",
    },
    Note {
        name: "gpsvc",
        what: "групповые политики: применяет настройки организации или системы",
        criticality: Criticality::Important,
        disable: Disable::WithCare,
        because: "на домашней машине почти пусто, но часть настроек перестанет применяться",
    },
    Note {
        name: "wscsvc",
        what: "Центр безопасности Windows: следит за защитой и обновлениями",
        criticality: Criticality::Important,
        disable: Disable::WithCare,
        because: "без него не видно состояния защиты; Windows возвращает его обратно",
    },
    Note {
        name: "wuauserv",
        what: "Центр обновления Windows: скачивает и ставит обновления",
        criticality: Criticality::Optional,
        disable: Disable::WithCare,
        because: "выключение останавливает обновления, но не ломает работу; Windows включает его по расписанию",
    },
    Note {
        name: "bits",
        what: "фоновая передача: обновления, загрузки, часть установщиков",
        criticality: Criticality::Optional,
        disable: Disable::WithCare,
        because: "без него встают фоновые загрузки, но обычные скачивания работают",
    },
    Note {
        name: "dosvc",
        what: "оптимизация доставки: раздаёт обновления другим машинам в сети",
        criticality: Criticality::Optional,
        disable: Disable::WithCare,
        because: "выключение экономит трафик, но обновления качаются только с серверов",
    },
    Note {
        name: "msiserver",
        what: "установщик Windows (MSI)",
        criticality: Criticality::Optional,
        disable: Disable::WithCare,
        because: "запускается по требованию; выключенный по расписанию — ломает установку",
    },
    Note {
        name: "trustedinstaller",
        what: "обслуживание компонентов: обновления и восстановление системы",
        criticality: Criticality::Optional,
        disable: Disable::Never,
        because: "запускается по требованию; запрет ломает установку обновлений",
    },
    Note {
        name: "dhcp",
        what: "получение адреса от роутера по DHCP",
        criticality: Criticality::Important,
        disable: Disable::Never,
        because: "без него у машины не будет адреса в домашней сети",
    },
    Note {
        name: "dnscache",
        what: "кэш имён DNS",
        criticality: Criticality::Important,
        disable: Disable::Never,
        because: "без кэша сеть работает медленно и с ошибками имён",
    },
    Note {
        name: "nsi",
        what: "служба сетевых интерфейсов: отдаёт список сетей программам",
        criticality: Criticality::Important,
        disable: Disable::Never,
        because: "без неё программы не видят, что сеть вообще есть",
    },
    Note {
        name: "nlasvc",
        what: "определение типа сети: домашняя, рабочая, общедоступная",
        criticality: Criticality::Important,
        disable: Disable::Never,
        because: "от этого зависит строгость брандмауэра",
    },
    Note {
        name: "netprofm",
        what: "учёт сетевых подключений",
        criticality: Criticality::Important,
        disable: Disable::Never,
        because: "без него не работает значок сети и список подключений",
    },
    Note {
        name: "netman",
        what: "подключения сети: создание и разрыв соединений",
        criticality: Criticality::Important,
        disable: Disable::WithCare,
        because: "без него не переподключается Wi-Fi и VPN",
    },
    Note {
        name: "lanmanworkstation",
        what: "клиент сети Microsoft: доступ к общим папкам других машин",
        criticality: Criticality::Important,
        disable: Disable::WithCare,
        because: "нужен для сетевых дисков и общих папок; без них локальные файлы целы",
    },
    Note {
        name: "lanmanserver",
        what: "сервер сети Microsoft: раздача своих общих папок",
        criticality: Criticality::Optional,
        disable: Disable::Yes,
        because: "нужен только если вы делитесь папками с другими",
    },
    Note {
        name: "wcmsvc",
        what: "управление подключениями: выбор сети и вход в неё",
        criticality: Criticality::Important,
        disable: Disable::WithCare,
        because: "без него теряется автоподключение к известным сетям",
    },
    Note {
        name: "iphlpsvc",
        what: "помощник IP: туннели IPv6 и переходные технологии",
        criticality: Criticality::Optional,
        disable: Disable::WithCare,
        because: "обычно не нужен, но часть VPN его использует",
    },
    Note {
        name: "sharedaccess",
        what: "общий доступ к интернету (ICS)",
        criticality: Criticality::Optional,
        disable: Disable::Yes,
        because: "нужен, только если вы раздаёте интернет с этой машины",
    },
    Note {
        name: "fdrespub",
        what: "публикация этой машины в домашней сети",
        criticality: Criticality::Optional,
        disable: Disable::Yes,
        because: "без него вас не видно в «Сети»; на общий доступ это не влияет",
    },
    Note {
        name: "fdphost",
        what: "хост обнаружения: поиск устройств в сети",
        criticality: Criticality::Optional,
        disable: Disable::Yes,
        because: "нужен функции «обнаружение в сети»",
    },
    Note {
        name: "ssdpsrv",
        what: "обнаружение устройств UPnP",
        criticality: Criticality::Optional,
        disable: Disable::Yes,
        because: "заодно открывает лишние порты: кому не нужно — лучше выключить",
    },
    Note {
        name: "upnphost",
        what: "хост UPnP: устройства и программы открывают порты сами",
        criticality: Criticality::Optional,
        disable: Disable::WithCare,
        because: "нужен части устройств; включённый без нужды — лишняя дверь",
    },
    Note {
        name: "remoteregistry",
        what: "удалённый доступ к реестру",
        criticality: Criticality::Optional,
        disable: Disable::Yes,
        because: "нужен редко, а открывает доступ к настройкам машины",
    },
    Note {
        name: "termservice",
        what: "удалённый рабочий стол",
        criticality: Criticality::Optional,
        disable: Disable::WithCare,
        because: "нужен вам, если вы заходите на эту машину издалека; иначе это лишняя дверь",
    },
    Note {
        name: "webclient",
        what: "WebDAV: доступ к файлам по http",
        criticality: Criticality::Optional,
        disable: Disable::WithCare,
        because: "нужен редко; известен как канал для обхода ограничений",
    },
    Note {
        name: "w32time",
        what: "синхронизация часов с сервером времени",
        criticality: Criticality::Optional,
        disable: Disable::WithCare,
        because: "без него часы уходят; часть проверок сертификатов начинает ругаться",
    },
    Note {
        name: "audiosrv",
        what: "служба звука: микширует и отдаёт звук программам",
        criticality: Criticality::Important,
        disable: Disable::WithCare,
        because: "без неё звука нет совсем",
    },
    Note {
        name: "audioendpointbuilder",
        what: "обнаружение звуковых устройств",
        criticality: Criticality::Important,
        disable: Disable::WithCare,
        because: "без неё не видно колонок и наушников",
    },
    Note {
        name: "audiodg",
        what: "процесс обработки звука: применяет эффекты и громкость",
        criticality: Criticality::Important,
        disable: Disable::Never,
        because: "это не служба, а рабочий процесс: останавливать его значит терять звук до перезапуска",
    },
    Note {
        name: "themes",
        what: "оформление окон и панели задач",
        criticality: Criticality::Optional,
        disable: Disable::Yes,
        because: "без него окна выглядят как в старых версиях, но работают",
    },
    Note {
        name: "uxsms",
        what: "менеджер сеанса рабочего стола: связывает окна с сеансом",
        criticality: Criticality::Important,
        disable: Disable::WithCare,
        because: "без него криво работает переключение пользователей",
    },
    Note {
        name: "dwm",
        what: "композитор окон: рисует окна, тени и прозрачность",
        criticality: Criticality::Core,
        disable: Disable::Never,
        because: "остановка гасит экран до перезапуска",
    },
    Note {
        name: "explorer",
        what: "Проводник: рабочий стол, панель задач, окна папок",
        criticality: Criticality::Core,
        disable: Disable::Never,
        because: "это не служба: останавливать значит терять рабочий стол",
    },
    Note {
        name: "ctfmon",
        what: "ввод текста: панель языков, рукописный и голосовой ввод",
        criticality: Criticality::Important,
        disable: Disable::WithCare,
        because: "без него не переключается раскладка и не работает ввод в части программ",
    },
    Note {
        name: "fontdrvhost",
        what: "загрузка шрифтов для программ",
        criticality: Criticality::Important,
        disable: Disable::Never,
        because: "без него текст в интерфейсе ломается",
    },
    Note {
        name: "sihost",
        what: "хост оболочки: связывает панель задач и системные значки",
        criticality: Criticality::Important,
        disable: Disable::Never,
        because: "остановка перезапускает оболочку и теряет значки",
    },
    Note {
        name: "taskhostw",
        what: "хост задач: выполняет фоновые задания Windows",
        criticality: Criticality::Important,
        disable: Disable::Never,
        because: "нужен для уведомлений и обслуживания",
    },
    Note {
        name: "runtimebroker",
        what: "посредник приложений из Store: следит за разрешениями",
        criticality: Criticality::Important,
        disable: Disable::Never,
        because: "без него приложения из Store не получают доступ к файлам и устройствам",
    },
    Note {
        name: "searchhost",
        what: "поиск Windows на панели задач",
        criticality: Criticality::Optional,
        disable: Disable::Yes,
        because: "без него поиск не открывается, но файлы на месте",
    },
    Note {
        name: "searchindexer",
        what: "индексатор: строит индекс файлов для быстрого поиска",
        criticality: Criticality::Optional,
        disable: Disable::Yes,
        because: "отсюда нагрузка на диск; без индекса поиск медленнее",
    },
    Note {
        name: "startmenuexperiencehost",
        what: "меню Пуск",
        criticality: Criticality::Optional,
        disable: Disable::Never,
        because: "остановка просто перезапускает меню",
    },
    Note {
        name: "textinputhost",
        what: "ввод текста и эмодзи в новых приложениях",
        criticality: Criticality::Optional,
        disable: Disable::Never,
        because: "остановка перезапускает панель ввода",
    },
    Note {
        name: "shellexperiencehost",
        what: "всплывающие панели оболочки: громкость, яркость, сеть",
        criticality: Criticality::Optional,
        disable: Disable::Never,
        because: "остановка перезапускает панели",
    },
    Note {
        name: "sysmain",
        what: "предзагрузка часто используемых программ",
        criticality: Criticality::Optional,
        disable: Disable::Yes,
        because: "на SSD польза спорна, отключение безопасно",
    },
    Note {
        name: "wsearch",
        what: "служба поиска Windows: держит индекс файлов и почты",
        criticality: Criticality::Optional,
        disable: Disable::Yes,
        because: "без неё поиск в Пуске и Проводнике медленнее, но файлы целы",
    },
    Note {
        name: "spooler",
        what: "диспетчер печати",
        criticality: Criticality::Important,
        disable: Disable::WithCare,
        because: "без него не печатают принтеры и часть программ не видит их",
    },
    Note {
        name: "shellhwdetection",
        what: "уведомления о подключении устройств",
        criticality: Criticality::Optional,
        disable: Disable::WithCare,
        because: "нужен автозапуску с флешек и части устройств",
    },
    Note {
        name: "devicemanager",
        what: "обслуживание устройств: установка и обновление драйверов",
        criticality: Criticality::Optional,
        disable: Disable::WithCare,
        because: "без него драйверы ставятся вручную",
    },
    Note {
        name: "wudfsvc",
        what: "платформа драйверов в пользовательском режиме",
        criticality: Criticality::Important,
        disable: Disable::WithCare,
        because: "нужна части современных устройств",
    },
    Note {
        name: "deviceassociation",
        what: "сопоставление устройств с учётными записями",
        criticality: Criticality::Optional,
        disable: Disable::WithCare,
        because: "нужен для «мои устройства» и части периферии",
    },
    Note {
        name: "battery",
        what: "служба батареи: заряд и оставшееся время",
        criticality: Criticality::Important,
        disable: Disable::WithCare,
        because: "без неё ноутбук не показывает заряд",
    },
    Note {
        name: "sens",
        what: "уведомления о системных событиях: вход, яркость, питание",
        criticality: Criticality::Optional,
        disable: Disable::WithCare,
        because: "на нём держится часть уведомлений и автозапуск по входу",
    },
    Note {
        name: "camsvc",
        what: "менеджер доступа к возможностям: разрешения на камеру и микрофон",
        criticality: Criticality::Important,
        disable: Disable::WithCare,
        because: "без него приложения считают, что доступа нет",
    },
    Note {
        name: "appinfo",
        what: "сведения о приложениях: запуск программ с повышением прав",
        criticality: Criticality::Important,
        disable: Disable::WithCare,
        because: "без него не работает «Запуск от имени администратора» и часть UAC",
    },
    Note {
        name: "appidsvc",
        what: "проверка подлинности приложений",
        criticality: Criticality::Important,
        disable: Disable::WithCare,
        because: "нужна политике ограничения программ",
    },
    Note {
        name: "seclogon",
        what: "вход вторым пользователем: «Запуск от имени»",
        criticality: Criticality::Optional,
        disable: Disable::WithCare,
        because: "без него runas и часть установщиков не работают",
    },
    Note {
        name: "wlidsvc",
        what: "вход в учётную запись Microsoft",
        criticality: Criticality::Optional,
        disable: Disable::WithCare,
        because: "нужен для синхронизации и Store; локальный вход работает",
    },
    Note {
        name: "pcasvc",
        what: "сбор сведений о совместимости программ",
        criticality: Criticality::Optional,
        disable: Disable::Yes,
        because: "телеметрия совместимости; на работу не влияет",
    },
    Note {
        name: "diagtrack",
        what: "телеметрия: «впечатления пользователей и диагностика»",
        criticality: Criticality::Optional,
        disable: Disable::Yes,
        because: "отключение не ломает ничего, кроме отчётов Microsoft",
    },
    Note {
        name: "dmwappushservice",
        what: "передача телеметрии с устройств",
        criticality: Criticality::Optional,
        disable: Disable::Yes,
        because: "устаревшая служба телеметрии, отключается без вреда",
    },
    Note {
        name: "wisvc",
        what: "программа Windows Insider",
        criticality: Criticality::Optional,
        disable: Disable::Yes,
        because: "нужна только участникам предпросмотра",
    },
    Note {
        name: "mapsbroker",
        what: "карты для приложений",
        criticality: Criticality::Optional,
        disable: Disable::Yes,
        because: "без него часть приложений не показывает карту",
    },
    Note {
        name: "lfsvc",
        what: "определение местоположения",
        criticality: Criticality::Optional,
        disable: Disable::Yes,
        because: "нужно только приложениям с геолокацией",
    },
    Note {
        name: "vss",
        what: "теневое копирование: точки восстановления и предыдущие версии файлов",
        criticality: Criticality::Optional,
        disable: Disable::WithCare,
        because: "выключение оставляет вас без точек восстановления",
    },
    Note {
        name: "swprv",
        what: "программные теневые копии",
        criticality: Criticality::Optional,
        disable: Disable::WithCare,
        because: "работает вместе с vss",
    },
    Note {
        name: "vds",
        what: "управление дисками",
        criticality: Criticality::Optional,
        disable: Disable::WithCare,
        because: "без него не открывается оснастка «Управление дисками»",
    },
    Note {
        name: "storsvc",
        what: "хранилище: настройки томов и дисков",
        criticality: Criticality::Optional,
        disable: Disable::WithCare,
        because: "нужна части операций с дисками",
    },
    Note {
        name: "wpnservice",
        what: "уведомления приложений (WNS)",
        criticality: Criticality::Optional,
        disable: Disable::WithCare,
        because: "без него не приходят уведомления из Store-приложений",
    },
    Note {
        name: "xblauthmanager",
        what: "вход в Xbox Live",
        criticality: Criticality::Optional,
        disable: Disable::Yes,
        because: "нужен только играм с Xbox Live",
    },
    Note {
        name: "xblgamesave",
        what: "сохранения игр в облаке Xbox",
        criticality: Criticality::Optional,
        disable: Disable::Yes,
        because: "нужен только играм с облачными сохранениями",
    },
    Note {
        name: "xboxgip",
        what: "поддержка геймпадов Xbox",
        criticality: Criticality::Optional,
        disable: Disable::Yes,
        because: "без него геймпад работает как обычное устройство",
    },
    Note {
        name: "fax",
        what: "факс",
        criticality: Criticality::Optional,
        disable: Disable::Yes,
        because: "нужен единицам, остальным только занимает место",
    },
    Note {
        name: "antimalware service executable",
        what: "процесс Защитника Windows: проверяет файлы в фоне",
        criticality: Criticality::Important,
        disable: Disable::Never,
        because: "это защита: отсюда нагрузка на диск при проверке",
    },
    Note {
        name: "msmpeng",
        what: "тот же Защитник Windows под настоящим именем процесса",
        criticality: Criticality::Important,
        disable: Disable::Never,
        because: "в диспетчере задач виден как Antimalware Service Executable",
    },
    Note {
        name: "securityhealthservice",
        what: "состояние защиты Windows: значок щита и его отчёты",
        criticality: Criticality::Important,
        disable: Disable::Never,
        because: "остановка перезапускает щит, толку нет",
    },
    Note {
        name: "svchost",
        what: "хост системных служб: один процесс держит группу служб",
        criticality: Criticality::Core,
        disable: Disable::Never,
        because: "сам по себе не вирус: важно, какие службы внутри",
    },
    Note {
        name: "wmiprvse",
        what: "рабочий процесс WMI: отвечает на запросы о состоянии системы",
        criticality: Criticality::Important,
        disable: Disable::Never,
        because: "запускается по запросу и завершается сам",
    },
    Note {
        name: "registry",
        what: "виртуальный процесс реестра: показывает его размер",
        criticality: Criticality::Core,
        disable: Disable::Never,
        because: "останавливать нечего: это отображение реестра",
    },
    Note {
        name: "memory compression",
        what: "сжатие памяти: экономит физическую память",
        criticality: Criticality::Core,
        disable: Disable::Never,
        because: "часть системы управления памятью",
    },
    Note {
        name: "chrome",
        what: "браузер Google Chrome: каждая вкладка и расширение — отдельный процесс",
        criticality: Criticality::Optional,
        disable: Disable::Yes,
        because: "это программа, а не служба: закрывается вместе с окном",
    },
    Note {
        name: "msedge",
        what: "браузер Microsoft Edge",
        criticality: Criticality::Optional,
        disable: Disable::Yes,
        because: "это программа: закрывается вместе с окнами",
    },
    Note {
        name: "firefox",
        what: "браузер Firefox",
        criticality: Criticality::Optional,
        disable: Disable::Yes,
        because: "это программа: закрывается вместе с окнами",
    },
    Note {
        name: "brave",
        what: "браузер Brave",
        criticality: Criticality::Optional,
        disable: Disable::Yes,
        because: "это программа: закрывается вместе с окнами",
    },
    Note {
        name: "opera",
        what: "браузер Opera",
        criticality: Criticality::Optional,
        disable: Disable::Yes,
        because: "это программа: закрывается вместе с окнами",
    },
    Note {
        name: "vivaldi",
        what: "браузер Vivaldi",
        criticality: Criticality::Optional,
        disable: Disable::Yes,
        because: "это программа: закрывается вместе с окнами",
    },
    Note {
        name: "code",
        what: "редактор Visual Studio Code",
        criticality: Criticality::Optional,
        disable: Disable::Yes,
        because: "это программа: расширения живут отдельными процессами",
    },
    Note {
        name: "devenv",
        what: "Visual Studio",
        criticality: Criticality::Optional,
        disable: Disable::Yes,
        because: "это программа: компиляция идёт отдельными процессами",
    },
    Note {
        name: "idea64",
        what: "JetBrains IntelliJ IDEA",
        criticality: Criticality::Optional,
        disable: Disable::Yes,
        because: "это программа: индексация проекта даёт нагрузку на диск",
    },
    Note {
        name: "pycharm64",
        what: "JetBrains PyCharm",
        criticality: Criticality::Optional,
        disable: Disable::Yes,
        because: "это программа: индексация проекта даёт нагрузку на диск",
    },
    Note {
        name: "rider64",
        what: "JetBrains Rider",
        criticality: Criticality::Optional,
        disable: Disable::Yes,
        because: "это программа: сборка идёт отдельными процессами",
    },
    Note {
        name: "ms-teams",
        what: "Microsoft Teams (новый клиент)",
        criticality: Criticality::Optional,
        disable: Disable::Yes,
        because: "это программа: держит много памяти сама по себе",
    },
    Note {
        name: "teams",
        what: "Microsoft Teams (старый клиент)",
        criticality: Criticality::Optional,
        disable: Disable::Yes,
        because: "это программа: закрывается вместе с окном",
    },
    Note {
        name: "discord",
        what: "мессенджер Discord",
        criticality: Criticality::Optional,
        disable: Disable::Yes,
        because: "это программа: работает и в трее",
    },
    Note {
        name: "telegram",
        what: "мессенджер Telegram",
        criticality: Criticality::Optional,
        disable: Disable::Yes,
        because: "это программа: работает и в трее",
    },
    Note {
        name: "slack",
        what: "мессенджер Slack",
        criticality: Criticality::Optional,
        disable: Disable::Yes,
        because: "это программа: держит много памяти на больших командах",
    },
    Note {
        name: "zoom",
        what: "Zoom: звонки и встречи",
        criticality: Criticality::Optional,
        disable: Disable::Yes,
        because: "это программа: обработка видео идёт отдельным процессом",
    },
    Note {
        name: "spotify",
        what: "музыкальный клиент Spotify",
        criticality: Criticality::Optional,
        disable: Disable::Yes,
        because: "это программа: работает и в трее",
    },
    Note {
        name: "steam",
        what: "клиент Steam",
        criticality: Criticality::Optional,
        disable: Disable::Yes,
        because: "это программа: качает обновления игр в фоне",
    },
    Note {
        name: "epicgameslauncher",
        what: "клиент Epic Games",
        criticality: Criticality::Optional,
        disable: Disable::Yes,
        because: "это программа: качает обновления в фоне",
    },
    Note {
        name: "onedrive",
        what: "синхронизация OneDrive",
        criticality: Criticality::Optional,
        disable: Disable::Yes,
        because: "это программа: выключение останавливает синхронизацию, файлы целы",
    },
    Note {
        name: "dropbox",
        what: "синхронизация Dropbox",
        criticality: Criticality::Optional,
        disable: Disable::Yes,
        because: "это программа: выключение останавливает синхронизацию",
    },
    Note {
        name: "googledrivefs",
        what: "диск Google в Проводнике",
        criticality: Criticality::Optional,
        disable: Disable::Yes,
        because: "это программа: без неё диск виден, но не синхронизируется",
    },
    Note {
        name: "7zfm",
        what: "7-Zip: файловый менеджер архиватора",
        criticality: Criticality::Optional,
        disable: Disable::Yes,
        because: "это программа: открывается на время работы",
    },
    Note {
        name: "winrar",
        what: "WinRAR",
        criticality: Criticality::Optional,
        disable: Disable::Yes,
        because: "это программа: открывается на время работы",
    },
    Note {
        name: "obs64",
        what: "OBS Studio: запись и стрим",
        criticality: Criticality::Optional,
        disable: Disable::Yes,
        because: "это программа: кодирование видео даёт нагрузку на процессор",
    },
    Note {
        name: "vlc",
        what: "VLC: проигрыватель видео и звука",
        criticality: Criticality::Optional,
        disable: Disable::Yes,
        because: "это программа: декодирование идёт в этом процессе",
    },
    Note {
        name: "reaper",
        what: "REAPER: работа со звуком",
        criticality: Criticality::Optional,
        disable: Disable::Yes,
        because: "это программа: плагины живут отдельными процессами",
    },
    Note {
        name: "audacity",
        what: "Audacity: запись и правка звука",
        criticality: Criticality::Optional,
        disable: Disable::Yes,
        because: "это программа: обработка идёт в этом процессе",
    },
    Note {
        name: "blender",
        what: "Blender: 3D и рендер",
        criticality: Criticality::Optional,
        disable: Disable::Yes,
        because: "это программа: рендер занимает все ядра",
    },
    Note {
        name: "photoshop",
        what: "Adobe Photoshop",
        criticality: Criticality::Optional,
        disable: Disable::Yes,
        because: "это программа: на больших файлах упирается в память",
    },
    Note {
        name: "premiere pro",
        what: "Adobe Premiere Pro",
        criticality: Criticality::Optional,
        disable: Disable::Yes,
        because: "это программа: обсчёт эффектов идёт в фоне",
    },
    Note {
        name: "resolve",
        what: "DaVinci Resolve",
        criticality: Criticality::Optional,
        disable: Disable::Yes,
        because: "это программа: рендер и кэш занимают диск",
    },
    Note {
        name: "acrord32",
        what: "Adobe Acrobat Reader",
        criticality: Criticality::Optional,
        disable: Disable::Yes,
        because: "это программа: открывается на время чтения",
    },
    Note {
        name: "winword",
        what: "Microsoft Word",
        criticality: Criticality::Optional,
        disable: Disable::Yes,
        because: "это программа: автозамена и правописание работают внутри",
    },
    Note {
        name: "excel",
        what: "Microsoft Excel",
        criticality: Criticality::Optional,
        disable: Disable::Yes,
        because: "это программа: большие таблицы упираются в память",
    },
    Note {
        name: "powerpnt",
        what: "Microsoft PowerPoint",
        criticality: Criticality::Optional,
        disable: Disable::Yes,
        because: "это программа",
    },
    Note {
        name: "outlook",
        what: "Microsoft Outlook",
        criticality: Criticality::Optional,
        disable: Disable::Yes,
        because: "это программа: индексация почты даёт нагрузку на диск",
    },
    Note {
        name: "notepad",
        what: "Блокнот",
        criticality: Criticality::Optional,
        disable: Disable::Yes,
        because: "это программа",
    },
    Note {
        name: "mspaint",
        what: "Paint",
        criticality: Criticality::Optional,
        disable: Disable::Yes,
        because: "это программа",
    },
    Note {
        name: "taskmgr",
        what: "Диспетчер задач",
        criticality: Criticality::Optional,
        disable: Disable::Yes,
        because: "это программа: сам по себе почти ничего не ест",
    },
    Note {
        name: "mmc",
        what: "консоль управления (оснастки)",
        criticality: Criticality::Optional,
        disable: Disable::Yes,
        because: "это программа: в ней открываются службы, диски, события",
    },
    Note {
        name: "powershell",
        what: "PowerShell: командная оболочка",
        criticality: Criticality::Optional,
        disable: Disable::Yes,
        because: "это программа: через неё это приложение и работает",
    },
    Note {
        name: "cmd",
        what: "командная строка",
        criticality: Criticality::Optional,
        disable: Disable::Yes,
        because: "это программа",
    },
    Note {
        name: "conhost",
        what: "окно консоли для старых программ",
        criticality: Criticality::Optional,
        disable: Disable::Never,
        because: "обслуживает окно: останавливать значит ломать консоль",
    },
    Note {
        name: "msiexec",
        what: "установщик MSI в работе",
        criticality: Criticality::Optional,
        disable: Disable::Never,
        because: "запускается на время установки: останавливать значит ломать её",
    },
    Note {
        name: "zshelper",
        what: "это само приложение",
        criticality: Criticality::Optional,
        disable: Disable::Yes,
        because: "его работа — то, что вы видите на экране",
    },
    Note {
        name: "ffmpeg",
        what: "перекодирование видео и звука",
        criticality: Criticality::Optional,
        disable: Disable::Never,
        because: "это процесс работы: остановка прерывает задачу",
    },
    Note {
        name: "python",
        what: "интерпретатор Python",
        criticality: Criticality::Optional,
        disable: Disable::Yes,
        because: "это программа: что именно она делает, видно по командной строке",
    },
    Note {
        name: "node",
        what: "Node.js",
        criticality: Criticality::Optional,
        disable: Disable::Yes,
        because: "это программа: часто это сборка или dev-сервер",
    },
    Note {
        name: "java",
        what: "виртуальная машина Java",
        criticality: Criticality::Optional,
        disable: Disable::Yes,
        because: "это программа: часто это IDE или сервер приложений",
    },
    Note {
        name: "searchapp",
        what: "поиск: старое приложение поиска Windows",
        criticality: Criticality::Optional,
        disable: Disable::Never,
        because: "остановка перезапускает поиск",
    },
];

/// Найти запись по имени: без учёта регистра и без учёта краевых пробелов.
///
/// Только точное имя: «svchost» и «svchostx» — разные вещи, и угадывать по началу имени значит
/// выдавать одно за другое.
pub fn lookup(name: &str) -> Option<&'static Note> {
    let wanted = name.trim();
    if wanted.is_empty() {
        return None;
    }
    NOTES
        .iter()
        .find(|note| note.name.eq_ignore_ascii_case(wanted))
}

/// Сколько записей в базе — это число называется вслух, когда имени в ней нет.
pub fn count() -> usize {
    NOTES.len()
}

#[cfg(test)]
mod tests {
    use super::*;

    /// У каждой записи есть и описание, и причина: пустая причина — это не совет.
    #[test]
    fn every_note_says_what_it_is_and_why() {
        for note in NOTES {
            assert!(!note.name.trim().is_empty(), "запись без имени");
            assert!(
                note.what.chars().count() > 10,
                "«{}»: описание слишком короткое",
                note.name
            );
            assert!(
                note.because.chars().count() > 10,
                "«{}»: причина слишком короткая",
                note.name
            );
        }
    }

    /// Двух записей с одним именем быть не может: искать пришлось бы «какую-то из».
    #[test]
    fn names_are_unique_without_regard_to_case() {
        let mut seen: Vec<String> = Vec::new();
        for note in NOTES {
            let key = note.name.to_lowercase();
            assert!(!seen.contains(&key), "двойник в базе: {}", note.name);
            seen.push(key);
        }
    }

    /// «Ядро» и «можно отключить» вместе — противоречие: такое ловится тестом.
    #[test]
    fn the_core_never_says_it_can_be_turned_off() {
        for note in NOTES
            .iter()
            .filter(|note| note.criticality == Criticality::Core)
        {
            assert_eq!(
                note.disable,
                Disable::Never,
                "«{}» названо ядром, но помечено как отключаемое",
                note.name
            );
        }
    }

    /// Поиск не угадывает: точное имя без учёта регистра, и ничего больше.
    #[test]
    fn lookup_ignores_case_and_does_not_guess() {
        assert!(lookup("SVCHOST").is_some());
        assert!(lookup("  Explorer ").is_some());
        assert!(lookup("svchost").is_some());
        assert!(lookup("svchostx").is_none());
        assert!(lookup("майнкрафт").is_none());
        assert!(lookup("").is_none());
    }

    /// База должна быть достаточно большой, чтобы на неё можно было опереться.
    #[test]
    fn the_base_is_big_enough_to_be_useful() {
        assert!(count() >= 100, "записей в базе: {}", count());
    }

    /// Формулировки не обещают больше, чем значат: «нельзя» говорит «нельзя».
    #[test]
    fn labels_are_short_and_plain() {
        assert_eq!(Criticality::Core.label(), "ядро системы");
        assert_eq!(Criticality::Important.label(), "важно для работы");
        assert_eq!(Criticality::Optional.label(), "по желанию");
        assert_eq!(Disable::Never.label(), "нельзя");
        assert_eq!(Disable::WithCare.label(), "только с оговоркой");
        assert_eq!(Disable::Yes.label(), "можно");
    }
}
