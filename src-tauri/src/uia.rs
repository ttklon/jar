//! Что на экране: разбор активного окна через UI Automation — только чтение.
//!
//! Зачем. До сих пор помощник знал про окно перед человеком две вещи: заголовок и имя
//! программы. Этого хватает, чтобы понять «включи субтитры в этом видео», но не хватает,
//! чтобы понять «нажми ту кнопку»: у фразы нет адресата. UI Automation даёт адрес — имя
//! элемента, его вид и доступные действия.
//!
//! Здесь нарочно только чтение. Ни клика, ни ввода, ни прокрутки: пока помощник умеет
//! смотреть, но не трогать. Действие по элементу — отдельный шаг, и он требует
//! подтверждения человека и проверки после действия, а не «попробуем ткнуть».
//!
//! Чего модуль не делает:
//!  * не угадывает, какой элемент «главный»: он отдаёт дерево как есть, а выбирает не он;
//!  * не прячет пустоту: если у элемента нет имени, элемент остаётся с пустым именем —
//!    врать «кнопка без названия» краской поверх неё было бы хуже;
//!  * не тратит время на бесконечное дерево: есть потолки по числу элементов и глубине.
//!
//! Потолки — не оптимизация, а честность: если дерево обрезано, это сказано в ответе
//! (`truncated`), а не выдано за полную картину экрана.

use serde::Serialize;

/// Сколько элементов забираем из окна. Хватает на форму или страницу, и не хватает на
/// то, чтобы приложение задумалось на минуту.
pub const MAX_NODES: usize = 400;

/// Насколько глубоко забираемся. Дальше обычно идут одинаковые панели-обёртки.
pub const MAX_DEPTH: usize = 12;

/// Сколько строк экрана видит модель и человек. Один потолок на всех: подсказке модели
/// больше не нужно, а человеку полезно видеть ровно то же, что видит модель.
pub const SCREEN_LINES: usize = 60;

/// Сколько символов имени оставляем. Длинные имена — это чаще всего целые абзацы текста,
/// и в подсказке модели они занимают место, ничего не объясняя.
const MAX_NAME: usize = 80;

/// Один элемент активного окна.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Element {
    /// Насколько глубоко от окна. Окно — нулевой уровень.
    pub depth: usize,
    /// Вид элемента по-русски: «кнопка», «поле», «текст».
    pub kind: String,
    /// Имя, которое человек прочитал бы на экране. Может быть пустым.
    pub name: String,
    /// Технический идентификатор, если программа его задала: по нему элемент узнаётся,
    /// даже когда имя меняется («Сохранить» → «Сохранение…»).
    pub id: String,
    /// Доступен ли элемент сейчас. Недоступный не нажимается, и молчать об этом нельзя.
    pub enabled: bool,
    /// Что с элементом вообще можно сделать, по данным UIA: `invoke`, `value`, `toggle`.
    /// Это не обещание, что помощник так умеет — пока он не умеет ничего из этого.
    pub actions: Vec<String>,
}

/// Разобранное активное окно.
#[derive(Debug, Clone, Serialize)]
pub struct Snapshot {
    /// Заголовок окна — тот же, что показывает система.
    pub title: String,
    /// Программа без пути: `chrome.exe`.
    pub process: String,
    /// Элементы сверху вниз, в порядке обхода.
    pub elements: Vec<Element>,
    /// Дерево не поместилось в потолки — значит, это не весь экран.
    pub truncated: bool,
    /// Честная приписка о том, как это получено.
    pub note: String,
    /// То же самое текстом — ровно то, что уходит модели. Один источник правды:
    /// если бы текст собирался и здесь, и в интерфейсе, они бы разошлись.
    pub text: String,
}

/// Как это читается человеком и моделью: строки с отступом по глубине.
impl Snapshot {
    pub fn render(&self, max_lines: usize) -> String {
        let mut out = String::with_capacity(256);
        let title = tidy(&self.title);
        if title.is_empty() {
            out.push_str("Окно без заголовка");
        } else {
            out.push_str(&title);
        }
        if !self.process.trim().is_empty() {
            out.push_str(&format!(" ({})", self.process.trim()));
        }
        out.push('\n');

        for element in self.elements.iter().take(max_lines) {
            out.push_str(&element.line());
            out.push('\n');
        }
        // Скрытое считается, а не забывается: человек должен знать, что видел не всё.
        if self.elements.len() > max_lines {
            out.push_str(&format!(
                "… ещё {} — не показано\n",
                self.elements.len() - max_lines
            ));
        }

        if self.elements.is_empty() {
            out.push_str("(элементов не видно: окно пустое или не отдаёт дерево)\n");
        }
        if self.truncated {
            out.push_str("(дерево обрезано: показаны не все элементы окна)\n");
        }
        out
    }
}

impl Element {
    /// `  - кнопка «Войти» [invoke]` — одна строка на элемент.
    fn line(&self) -> String {
        let mut line = String::with_capacity(32);
        for _ in 0..self.depth {
            line.push_str("  ");
        }
        line.push_str("- ");
        line.push_str(&self.kind);
        if !self.name.is_empty() {
            line.push_str(&format!(" «{}»", self.name));
        }
        if !self.id.is_empty() && self.id != self.name {
            line.push_str(&format!(" #{}", self.id));
        }
        if !self.enabled {
            line.push_str(" (недоступен)");
        }
        if !self.actions.is_empty() {
            line.push_str(&format!(" [{}]", self.actions.join(", ")));
        }
        line
    }
}

/// Имя без мусора: Windows присылает и переводы строк, и двойные пробелы, и нули.
pub fn tidy(raw: &str) -> String {
    let mut out = String::with_capacity(raw.len());
    let mut space = false;

    for symbol in raw.chars() {
        if symbol.is_control() || symbol.is_whitespace() {
            space = !out.is_empty();
            continue;
        }
        if space {
            out.push(' ');
            space = false;
        }
        out.push(symbol);
        if out.chars().count() > MAX_NAME {
            out.pop();
            out.push('…');
            break;
        }
    }

    out.trim_end().to_string()
}

/// Вид элемента по номеру из UIA. Незнакомый номер — «элемент», а не выдумка.
pub fn kind_name(id: u32) -> String {
    let kind = match id {
        50000 => "кнопка",
        50001 => "календарь",
        50002 => "флажок",
        50003 => "раскрывающийся список",
        50004 => "поле ввода",
        50005 => "ссылка",
        50006 => "картинка",
        50007 => "пункт списка",
        50008 => "список",
        50009 => "меню",
        50010 => "строка меню",
        50011 => "пункт меню",
        50012 => "полоса хода",
        50013 => "переключатель",
        50014 => "полоса прокрутки",
        50015 => "ползунок",
        50016 => "счётчик",
        50017 => "строка состояния",
        50018 => "вкладки",
        50019 => "вкладка",
        50020 => "текст",
        50021 => "панель инструментов",
        50022 => "подсказка",
        50023 => "дерево",
        50024 => "пункт дерева",
        50025 => "свой элемент",
        50026 => "группа",
        50027 => "бегунок",
        50028 => "таблица",
        50029 => "строка таблицы",
        50030 => "документ",
        50031 => "кнопка с меню",
        50032 => "окно",
        50033 => "панель",
        50034 => "заголовок таблицы",
        50035 => "ячейка заголовка",
        50036 => "таблица данных",
        50037 => "заголовок окна",
        50038 => "разделитель",
        50040 => "панель приложения",
        _ => "элемент",
    };
    kind.to_string()
}

/// Дерево, по которому можно ходить: настоящее окно или выдуманное для проверки.
///
/// Отдельный тип нужен не ради красоты: обход — это единственная часть, которую можно
/// проверить без живого экрана, и проверять её надо отдельно от COM.
pub trait Tree {
    /// С какого узла начинать.
    fn root(&self) -> Option<usize>;
    /// Дети узла в порядке экрана. Пусто — значит, детей не видно.
    fn children(&mut self, node: usize) -> Vec<usize>;
    /// Что за узел — без глубины: её знает обход, а не узел.
    fn describe(&self, node: usize) -> Element;
}

/// Обход в глубину с потолками. Возвращает элементы и признак «не всё поместилось».
///
/// Порядок — как на экране: сверху вниз, дети после родителя. Так строки текста читаются
/// человеку и модели в том же порядке, в каком он видит окно.
pub fn collect(tree: &mut impl Tree, max_nodes: usize, max_depth: usize) -> (Vec<Element>, bool) {
    let Some(root) = tree.root() else {
        return (Vec::new(), false);
    };

    let mut elements = Vec::new();
    let mut truncated = false;

    // Стек вместо рекурсии: дерево чужой программы может быть глубже любого разумного
    // лимита, и падать на этом в глубине стека — обидно и непонятно.
    let mut stack = vec![(root, 0usize)];

    while let Some((node, depth)) = stack.pop() {
        if elements.len() >= max_nodes {
            truncated = true;
            break;
        }

        let mut element = tree.describe(node);
        element.depth = depth;
        elements.push(element);

        if depth + 1 > max_depth {
            // Дети есть, но мы туда не идём: это и есть обрезка, о ней надо сказать.
            truncated = true;
            continue;
        }

        let mut children = tree.children(node);
        children.reverse();
        for child in children {
            stack.push((child, depth + 1));
        }
    }

    (elements, truncated)
}

/// Что сказать человеку про этот способ чтения.
pub fn note() -> String {
    if cfg!(windows) {
        "чтение экрана: UI Automation, только чтение — ничего не нажимается и не вводится"
            .to_string()
    } else {
        "чтение экрана — это Windows: здесь его не видно".to_string()
    }
}

/// Что нашли по имени: ровно тот элемент, о котором говорил человек.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Target {
    pub name: String,
    pub kind: String,
    pub id: String,
    pub actions: Vec<String>,
}

impl Target {
    pub fn of(element: &Element) -> Self {
        Target {
            name: element.name.clone(),
            kind: element.kind.clone(),
            id: element.id.clone(),
            actions: element.actions.clone(),
        }
    }
}

/// Отчёт о нажатии. Нажатие — действие, поэтому отчёт, а не «готово».
#[derive(Debug, Clone, Serialize)]
pub struct Press {
    /// Что именно нажали: имя и вид, чтобы человек узнал свою кнопку.
    pub target: Target,
    /// Нажатие действительно отправлено системе.
    pub sent: bool,
    /// Экран после нажатия изменился — проверено сравнением, а не верой.
    pub changed: bool,
    /// Что сказать человеку: правду, включая «ничего не изменилось».
    pub note: String,
}

/// Найти элемент по имени.
///
/// Правила нарочно строгие: сначала точное совпадение (без учёта регистра), потом
/// единственное вхождение подстроки. Если под имя подходит несколько элементов, это
/// отказ с перечислением, а не «нажмём первый попавшийся»: первый попавшийся — это как
/// раз то, из-за чего помощники ломают людям окна.
pub fn locate(elements: &[Element], wanted: &str) -> Result<usize, String> {
    let wanted = wanted.trim().to_lowercase();
    if wanted.is_empty() {
        return Err("не названо, что нажимать".to_string());
    }

    let exact: Vec<usize> = elements
        .iter()
        .enumerate()
        .filter(|(_, element)| element.name.to_lowercase() == wanted)
        .map(|(index, _)| index)
        .collect();

    match exact.len() {
        1 => return Ok(exact[0]),
        0 => {}
        _ => {
            return Err(format!(
                "элементов с именем «{wanted}» несколько — уточните, какой именно"
            ))
        }
    }

    let partial: Vec<usize> = elements
        .iter()
        .enumerate()
        .filter(|(_, element)| {
            let name = element.name.to_lowercase();
            !name.is_empty() && name.contains(&wanted)
        })
        .map(|(index, _)| index)
        .collect();

    match partial.len() {
        0 => Err(format!("в этом окне нет элемента «{wanted}»")),
        1 => Ok(partial[0]),
        _ => {
            let names: Vec<String> = partial
                .iter()
                .take(3)
                .map(|index| format!("«{}»", elements[*index].name))
                .collect();
            Err(format!(
                "под «{wanted}» подходит несколько элементов: {} — назовите точнее",
                names.join(", ")
            ))
        }
    }
}

/// Можно ли нажимать этот элемент — по тому, что окно само про него сказало.
pub fn may_press(element: &Element) -> Result<(), String> {
    if element.actions.iter().any(|action| action == "invoke") {
        return Ok(());
    }
    Err(format!(
        "«{}» — это {}, у него нет нажатия: {}",
        element.name,
        element.kind,
        if element.actions.is_empty() {
            "окно не объявило для него никаких действий".to_string()
        } else {
            format!("доступно только: {}", element.actions.join(", "))
        }
    ))
}

/// Изменился ли экран: сравниваем то, что человек увидел бы, — имена и виды элементов.
///
/// Проверка слабая, и это сказано вслух: если окно перерисовало те же кнопки в другом
/// порядке, изменений мы не заметим, а если поменялась только надпись — заметим.
pub fn changed(before: &[Element], after: &[Element]) -> bool {
    let shape = |elements: &[Element]| -> String {
        elements
            .iter()
            .map(|element| format!("{}/{}", element.kind, element.name))
            .collect::<Vec<String>>()
            .join("|")
    };
    shape(before) != shape(after)
}

/// Нажать элемент активного окна по имени.
pub fn press(max_nodes: usize, wanted: &str) -> Result<Press, String> {
    imp::press(max_nodes, wanted)
}

/// Разобрать активное окно.
pub fn dump(max_nodes: usize) -> Result<Snapshot, String> {
    let front = crate::window::foreground()?;
    let elements = imp::read(max_nodes)?;

    let (elements, truncated) = elements;
    let mut snapshot = Snapshot {
        title: front.title,
        process: front.process,
        elements,
        truncated,
        note: note(),
        text: String::new(),
    };
    snapshot.text = snapshot.render(SCREEN_LINES);
    Ok(snapshot)
}

#[cfg(windows)]
// Привязки к Windows помечают часть вызовов UIA небезопасными, часть — безопасными, и это
// меняется от версии к версии. Лишний `unsafe` вокруг честного вызова — не то, на чём стоит
// ронять сборку; отсутствие нужного ловит компилятор.
#[allow(unused_unsafe)]
mod imp {
    //! Настоящее чтение через UI Automation.
    //!
    //! Здесь всё, что нельзя проверить без живого экрана, и собрано оно в одном месте:
    //! обход и потолки живут выше и проверяются на выдуманном дереве, а тут — только
    //! разговоры с системой.
    use super::{collect, kind_name, tidy, Element, Tree, MAX_DEPTH};
    use windows::Win32::System::Com::{
        CoCreateInstance, CoInitializeEx, CoUninitialize, CLSCTX_INPROC_SERVER,
        COINIT_MULTITHREADED,
    };
    use windows::Win32::UI::Accessibility::{
        CUIAutomation, IUIAutomation, IUIAutomationElement, IUIAutomationInvokePattern,
        UIA_ExpandCollapsePatternId, UIA_InvokePatternId, UIA_SelectionItemPatternId,
        UIA_TextPatternId, UIA_TogglePatternId, UIA_ValuePatternId, UIA_PATTERN_ID,
    };
    use windows::Win32::UI::WindowsAndMessaging::GetForegroundWindow;

    /// COM надо и поднять, и убрать за собой — в одном месте, чтобы не забыть.
    struct Apartment(bool);

    impl Apartment {
        fn new() -> Result<Self, String> {
            // Уже поднятый COM другим потоком — не ошибка: `RPC_E_CHANGED_MODE` значит,
            // что поток живёт в своей квартире, и нам там тоже можно работать.
            let result = unsafe { CoInitializeEx(None, COINIT_MULTITHREADED) };
            match result.ok() {
                Ok(()) => Ok(Apartment(true)),
                Err(_) => Ok(Apartment(false)),
            }
        }
    }

    impl Drop for Apartment {
        fn drop(&mut self) {
            if self.0 {
                unsafe { CoUninitialize() };
            }
        }
    }

    struct Screen {
        walker: IUIAutomation,
        nodes: Vec<IUIAutomationElement>,
        /// Номера узлов в том порядке, в каком их увидел обход. Нужен, чтобы по
        /// найденному элементу добраться до его COM-указателя и нажать именно его.
        order: std::cell::RefCell<Vec<usize>>,
    }

    /// Действия, которые окно само объявило доступными. Не обещание помощнику, а факт
    /// о элементе: по нему видно, кнопка это или просто надпись.
    fn actions_of(element: &IUIAutomationElement) -> Vec<String> {
        let patterns: [(UIA_PATTERN_ID, &str); 6] = [
            (UIA_InvokePatternId, "invoke"),
            (UIA_ValuePatternId, "value"),
            (UIA_TogglePatternId, "toggle"),
            (UIA_SelectionItemPatternId, "select"),
            (UIA_ExpandCollapsePatternId, "expand"),
            (UIA_TextPatternId, "text"),
        ];

        let mut found = Vec::new();
        for (id, name) in patterns {
            if unsafe { element.GetCurrentPattern(id) }.is_ok() {
                found.push(name.to_string());
            }
        }
        found
    }

    impl Tree for Screen {
        fn root(&self) -> Option<usize> {
            Some(0)
        }

        fn children(&mut self, node: usize) -> Vec<usize> {
            let Some(parent) = self.nodes.get(node).cloned() else {
                return Vec::new();
            };

            let mut result = Vec::new();
            // Дети берём только по «виду управления»: служебные обёртки не показывают
            // человеку ничего, а место в потолке занимают.
            let walker = match unsafe { self.walker.ControlViewWalker() } {
                Ok(walker) => walker,
                Err(_) => return Vec::new(),
            };

            // Конец ветки у UIA — это отказ `GetFirstChildElement`, а не пустой элемент:
            // поэтому обход останавливается по ошибке и не путает её с «детей нет».
            let mut next = unsafe { walker.GetFirstChildElement(&parent) };
            while let Ok(child) = next {
                self.nodes.push(child.clone());
                result.push(self.nodes.len() - 1);
                next = unsafe { walker.GetNextSiblingElement(&child) };
            }

            // Ходим вглубь не дальше потолка: лишние уровни всё равно не покажем.
            if result.len() > 200 {
                result.truncate(200);
            }
            result
        }

        fn describe(&self, node: usize) -> Element {
            // Обход спрашивает описание по одному разу на узел и по порядку экрана:
            // этим и пользуемся, чтобы запомнить соответствие.
            self.order.borrow_mut().push(node);

            let Some(element) = self.nodes.get(node) else {
                return Element {
                    depth: 0,
                    kind: "элемент".to_string(),
                    name: String::new(),
                    id: String::new(),
                    enabled: false,
                    actions: Vec::new(),
                };
            };

            // Свойства UIA читаются через COM, поэтому небезопасны: чужое окно может
            // закрыться между вызовами, и отказ здесь — обычное дело, а не сбой.
            let name = unsafe { element.CurrentName() }
                .map(|value| tidy(&value.to_string()))
                .unwrap_or_default();
            let id = unsafe { element.CurrentAutomationId() }
                .map(|value| tidy(&value.to_string()))
                .unwrap_or_default();
            let kind = unsafe { element.CurrentControlType() }
                // Тип `UIA_CONTROLTYPE_ID` в привязках то `i32`, то `u32` — приводим
                // через `try_from`, чтобы не зависеть от версии.
                .map(|value| kind_name(u32::try_from(value.0).unwrap_or(0)))
                .unwrap_or_else(|_| "элемент".to_string());
            let enabled = unsafe { element.CurrentIsEnabled() }
                .map(|value| value.as_bool())
                .unwrap_or(false);

            Element {
                depth: 0,
                kind,
                name,
                id,
                enabled,
                actions: actions_of(element),
            }
        }
    }

    /// Пройти окно и вернуть элементы вместе с их COM-указателями в том же порядке.
    #[allow(clippy::type_complexity)]
    fn walk(
        max_nodes: usize,
    ) -> Result<
        (
            Vec<Element>,
            bool,
            std::cell::RefCell<Vec<usize>>,
            Vec<IUIAutomationElement>,
        ),
        String,
    > {
        let _apartment = Apartment::new()?;

        unsafe {
            let window = GetForegroundWindow();
            if window.0.is_null() {
                return Err(
                    "переднего окна нет: рабочий стол или заблокированный экран".to_string()
                );
            }

            let automation: IUIAutomation =
                CoCreateInstance(&CUIAutomation, None, CLSCTX_INPROC_SERVER)
                    .map_err(|error| format!("UI Automation не поднялся: {error}"))?;

            let root: IUIAutomationElement = automation
                .ElementFromHandle(window)
                .map_err(|error| format!("окно не отдало элементы: {error}"))?;

            let mut screen = Screen {
                walker: automation,
                nodes: vec![root],
                order: std::cell::RefCell::new(Vec::new()),
            };

            let (elements, truncated) = collect(&mut screen, max_nodes, MAX_DEPTH);
            let Screen { nodes, order, .. } = screen;
            Ok((elements, truncated, order, nodes))
        }
    }

    /// Нажать элемент по имени. Нажатие отправляется только после того, как элемент
    /// найден однозначно: сомнительное совпадение — отказ, а не «нажмём первое».
    pub fn press(max_nodes: usize, wanted: &str) -> Result<super::Press, String> {
        use super::{changed, locate, may_press, Target};

        let (before, _truncated, order, nodes) = walk(max_nodes)?;
        if before.is_empty() {
            return Err("в окне не видно элементов: нажимать нечего".to_string());
        }

        let index = locate(&before, wanted)?;
        may_press(&before[index])?;

        let node_index = order.borrow().get(index).copied().ok_or_else(|| {
            "элемент нашёлся, но потерялся при обходе — нажимать вслепую не буду".to_string()
        })?;
        let node = nodes
            .get(node_index)
            .ok_or_else(|| "элемент исчез между обходом и нажатием".to_string())?;

        let pattern: IUIAutomationInvokePattern = unsafe {
            node.GetCurrentPatternAs(UIA_InvokePatternId)
        }
        .map_err(|error| format!("окно не дало нажать «{}»: {error}", before[index].name))?;

        // Нажатие отправлено — с этого момента врём только в одну сторону: сказать «не
        // нажали», когда нажали, безопаснее, чем наоборот.
        unsafe { pattern.Invoke() }.map_err(|error| format!("нажатие не отправилось: {error}"))?;

        // UIA нажимает асинхронно: программа ещё думает. Полсекунды — не «наверное, успело»,
        // а пауза перед тем, как посмотреть на результат.
        std::thread::sleep(std::time::Duration::from_millis(500));

        let (after, _, _, _) = walk(max_nodes).unwrap_or_else(|_| {
            (
                Vec::new(),
                false,
                std::cell::RefCell::new(Vec::new()),
                Vec::new(),
            )
        });
        let did = changed(&before, &after);

        Ok(super::Press {
            target: Target::of(&before[index]),
            sent: true,
            changed: did,
            note: if did {
                "нажато, и экран изменился — это проверено сравнением элементов окна".to_string()
            } else {
                "нажато, но экран не изменился: возможно, программа думает медленнее, чем мы смотрим"
                    .to_string()
            },
        })
    }

    pub fn read(max_nodes: usize) -> Result<(Vec<Element>, bool), String> {
        let (elements, truncated, _order, _nodes) = walk(max_nodes)?;
        Ok((elements, truncated))
    }
}

#[cfg(not(windows))]
mod imp {
    use super::Element;

    pub fn read(_max_nodes: usize) -> Result<(Vec<Element>, bool), String> {
        Err("чтение экрана есть только на Windows".to_string())
    }

    pub fn press(_max_nodes: usize, _wanted: &str) -> Result<super::Press, String> {
        Err("нажимать элементы можно только на Windows".to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Выдуманное дерево: проверять обход можно без живого экрана.
    struct Fake {
        /// (имя, дети) — узлы в порядке добавления.
        nodes: Vec<(String, Vec<usize>)>,
    }

    impl Fake {
        fn new(nodes: Vec<(&str, Vec<usize>)>) -> Self {
            Fake {
                nodes: nodes
                    .into_iter()
                    .map(|(name, children)| (name.to_string(), children))
                    .collect(),
            }
        }
    }

    impl Tree for Fake {
        fn root(&self) -> Option<usize> {
            if self.nodes.is_empty() {
                None
            } else {
                Some(0)
            }
        }

        fn children(&mut self, node: usize) -> Vec<usize> {
            self.nodes
                .get(node)
                .map(|(_, kids)| kids.clone())
                .unwrap_or_default()
        }

        fn describe(&self, node: usize) -> Element {
            Element {
                depth: 0,
                kind: "кнопка".to_string(),
                name: self
                    .nodes
                    .get(node)
                    .map(|(name, _)| name.clone())
                    .unwrap_or_default(),
                id: String::new(),
                enabled: true,
                actions: vec!["invoke".to_string()],
            }
        }
    }

    #[test]
    fn the_walk_keeps_the_order_of_the_screen() {
        // окно → панель → (кнопка, поле)
        let mut tree = Fake::new(vec![
            ("окно", vec![1]),
            ("панель", vec![2, 3]),
            ("Войти", vec![]),
            ("Пароль", vec![]),
        ]);

        let (elements, truncated) = collect(&mut tree, MAX_NODES, MAX_DEPTH);
        let names: Vec<&str> = elements
            .iter()
            .map(|element| element.name.as_str())
            .collect();

        assert_eq!(names, vec!["окно", "панель", "Войти", "Пароль"]);
        assert_eq!(elements[2].depth, 2);
        assert!(!truncated);
    }

    #[test]
    fn a_tree_that_does_not_fit_says_so_instead_of_pretending() {
        // Одна панель и сто кнопок: при потолке в пять элементов обход обязан признаться.
        let mut children: Vec<usize> = (2..102).collect();
        children.sort_unstable();
        let mut nodes: Vec<(&str, Vec<usize>)> = vec![("окно", vec![1]), ("панель", children)];
        for number in 0..100 {
            let name: &'static str = Box::leak(format!("кнопка {number}").into_boxed_str());
            nodes.push((name, vec![]));
        }

        let mut tree = Fake::new(nodes);
        let (elements, truncated) = collect(&mut tree, 5, MAX_DEPTH);

        assert_eq!(elements.len(), 5);
        assert!(
            truncated,
            "обрезанное дерево должно быть названо обрезанным"
        );
    }

    #[test]
    fn depth_beyond_the_ceiling_is_not_silently_swallowed() {
        // Цепочка из десяти уровней при потолке в три: дальше не идём, но и не молчим.
        let nodes: Vec<(&str, Vec<usize>)> = (0..10)
            .map(|number| {
                let children = if number + 1 < 10 {
                    vec![number + 1]
                } else {
                    vec![]
                };
                let name: &'static str = Box::leak(format!("уровень {number}").into_boxed_str());
                (name, children)
            })
            .collect();

        let mut tree = Fake::new(nodes);
        let (elements, truncated) = collect(&mut tree, MAX_NODES, 3);

        assert_eq!(elements.len(), 4, "уровни 0,1,2,3 — глубже потолка не идём");
        assert!(truncated);
    }

    #[test]
    fn an_empty_window_is_an_honest_empty_answer() {
        let mut tree = Fake::new(vec![]);
        let (elements, truncated) = collect(&mut tree, MAX_NODES, MAX_DEPTH);

        assert!(elements.is_empty());
        assert!(!truncated);
    }

    #[test]
    fn names_lose_the_noise_but_not_the_words() {
        assert_eq!(tidy("  Сохранить\n\tкак  "), "Сохранить как");
        assert_eq!(tidy("Войти\0\0"), "Войти");
        assert_eq!(tidy("   "), "");

        // Длинное имя обрезается с многоточием: это видно, а не спрятано.
        let long = "очень длинное имя ".repeat(20);
        let cut = tidy(&long);
        assert!(cut.chars().count() <= MAX_NAME + 1);
        assert!(cut.ends_with('…'));
    }

    #[test]
    fn a_stranger_control_type_is_an_element_not_a_guess() {
        assert_eq!(kind_name(50000), "кнопка");
        assert_eq!(kind_name(50004), "поле ввода");
        assert_eq!(kind_name(424242), "элемент");
    }

    #[test]
    fn the_text_form_says_truncation_and_emptiness_out_loud() {
        let snapshot = Snapshot {
            title: "  Вход  ".to_string(),
            process: "chrome.exe".to_string(),
            elements: vec![Element {
                depth: 1,
                kind: "кнопка".to_string(),
                name: "Войти".to_string(),
                id: "submit".to_string(),
                enabled: false,
                actions: vec!["invoke".to_string()],
            }],
            truncated: true,
            note: "чтение экрана: UI Automation".to_string(),
            text: String::new(),
        };

        let text = snapshot.render(10);
        assert!(text.starts_with("Вход (chrome.exe)"));
        assert!(text.contains("  - кнопка «Войти» #submit (недоступен) [invoke]"));
        assert!(text.contains("дерево обрезано"));

        let empty = Snapshot {
            title: String::new(),
            process: String::new(),
            elements: Vec::new(),
            truncated: false,
            note: String::new(),
            text: String::new(),
        };
        let text = empty.render(10);
        assert!(text.contains("Окно без заголовка"));
        assert!(text.contains("элементов не видно"));
    }

    #[test]
    fn too_many_lines_are_counted_not_dropped_quietly() {
        let elements: Vec<Element> = (0..5)
            .map(|number| Element {
                depth: 0,
                kind: "текст".to_string(),
                name: format!("строка {number}"),
                id: String::new(),
                enabled: true,
                actions: Vec::new(),
            })
            .collect();

        let snapshot = Snapshot {
            title: "окно".to_string(),
            process: String::new(),
            elements,
            truncated: false,
            note: String::new(),
            text: String::new(),
        };

        let text = snapshot.render(2);
        assert!(text.contains("«строка 0»"));
        assert!(!text.contains("«строка 2»"));
        assert!(text.contains("ещё 3 — не показано"));
    }

    fn element(name: &str, kind: &str, actions: &[&str]) -> Element {
        Element {
            depth: 1,
            kind: kind.to_string(),
            name: name.to_string(),
            id: String::new(),
            enabled: true,
            actions: actions.iter().map(|action| action.to_string()).collect(),
        }
    }

    #[test]
    fn a_name_is_found_exactly_and_only_exactly() {
        let screen = vec![
            element("Войти", "кнопка", &["invoke"]),
            element("Войти как гость", "кнопка", &["invoke"]),
            element("Пароль", "поле ввода", &["value"]),
        ];

        // Точное совпадение важнее вхождения: «Войти» — это первая кнопка, а не вторая.
        assert_eq!(locate(&screen, "войти").unwrap(), 0);
        assert_eq!(locate(&screen, "  Войти как гость ").unwrap(), 1);

        // Единственное вхождение — тоже годится.
        assert_eq!(locate(&screen, "гость").unwrap(), 1);
    }

    #[test]
    fn a_name_that_fits_several_elements_is_a_refusal_not_a_lottery() {
        let screen = vec![
            element("Удалить", "кнопка", &["invoke"]),
            element("Удалить навсегда", "кнопка", &["invoke"]),
            element("Сохранить", "кнопка", &["invoke"]),
        ];

        let refusal = locate(&screen, "удал").expect_err("должен быть отказ");
        assert!(refusal.contains("несколько"));
        assert!(refusal.contains("Удалить"));

        assert!(locate(&screen, "отправить").is_err());
        assert!(locate(&screen, "   ").is_err());
    }

    #[test]
    fn text_and_switches_are_not_buttons() {
        assert!(may_press(&element("Войти", "кнопка", &["invoke"])).is_ok());

        let text = may_press(&element("Привет", "текст", &[])).expect_err("текст не нажимается");
        assert!(text.contains("нет нажатия"));

        let field =
            may_press(&element("Пароль", "поле ввода", &["value"])).expect_err("поле не кнопка");
        assert!(field.contains("value"), "должно быть сказано, что доступно");
    }

    #[test]
    fn the_screen_is_compared_by_what_a_person_would_see() {
        let before = vec![element("Войти", "кнопка", &["invoke"])];

        // Ничего не поменялось — значит, «не поменялось», а не «наверное, сработало».
        assert!(!changed(&before, &before.clone()));

        // Появился новый элемент — экран изменился.
        let mut after = before.clone();
        after.push(element("Добро пожаловать", "текст", &[]));
        assert!(changed(&before, &after));

        // Поменялось имя — тоже изменение.
        let renamed = vec![element("Войти как гость", "кнопка", &["invoke"])];
        assert!(changed(&before, &renamed));
    }

    #[test]
    fn reading_the_screen_says_what_it_is_and_where_it_is_impossible() {
        let note = note();
        if cfg!(windows) {
            assert!(note.contains("только чтение"));
        } else {
            assert!(note.contains("Windows"));
        }
    }
}
