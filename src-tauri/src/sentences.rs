//! Где кончается предложение — и когда уже пора что-то сказать (шаг 41/79).
//!
//! Правило `firstWords` (`src/lib/firstWords.ts`) говорит: в речь идёт только
//! **законченное**. Кусок «я нашёл три файла, но» — не ответ, а обрывок, и
//! произносить его вслух хуже, чем подождать.
//!
//! Раньше ядро решало это по **одной дельте**: если кусок кончается точкой —
//! говорим. Это неверно с двух сторон:
//!
//!  * дельта может содержать несколько предложений, и середина терялась бы —
//!    сказали бы только последнее;
//!  * дельта может кончаться на «т.е.» или на «см.» — точка есть, а фразы нет.
//!
//! Поэтому здесь накопитель, а не проверка хвоста: копим текст и отдаём всё до
//! **последней** границы предложения. Остаток держим до следующего куска.

/// Знак, после которого человек делает паузу.
///
/// Запятая и тире — **не** граница: «папку, пожалуйста» ещё не конец мысли.
fn is_boundary(ch: char) -> bool {
    matches!(ch, '.' | '!' | '?' | '…')
}

/// Накопитель, который отдаёт законченные предложения по мере поступления.
///
/// `None` в `push` — говорить нечего: либо границы ещё нет, либо она есть, но
/// за ней нет пробела, а значит это «т.е.» или «30.5» — не конец фразы.
/// Точка внутри сокращения — не конец фразы.
///
/// «т.е.», «см.», «и т.д.» — одно слово с точками внутри. Смотрим на слово
/// перед точкой: если в нём уже есть точка и все части короче трёх букв, это
/// сокращение. «Да.» так не считается: в слове «Да» точки нет.
fn is_abbreviation(chars: &[char], dot: usize) -> bool {
    let start = chars[..dot]
        .iter()
        .rposition(|ch| ch.is_whitespace())
        .map(|at| at + 1)
        .unwrap_or(0);
    let token: String = chars[start..dot].iter().collect();
    if !token.contains('.') {
        return false;
    }
    let parts: Vec<&str> = token.split('.').filter(|part| !part.is_empty()).collect();
    !parts.is_empty()
        && parts
            .iter()
            .all(|part| part.chars().count() <= 2 && part.chars().all(|ch| ch.is_alphabetic()))
}

#[derive(Debug, Default)]
pub struct Sentences {
    buffer: String,
}

impl Sentences {
    pub fn new() -> Self {
        Self::default()
    }

    /// Добавить кусок. Возвращает законченное — если оно появилось.
    ///
    /// Режем по последней границе, за которой идёт пробел или конец текста:
    /// «готово. Ещё» → «готово.»; «30.5 градуса» → ничего (точка внутри числа).
    pub fn push(&mut self, chunk: &str) -> Option<String> {
        self.buffer.push_str(chunk);
        let chars: Vec<char> = self.buffer.chars().collect();
        let mut cut: Option<usize> = None;
        for index in 0..chars.len() {
            if !is_boundary(chars[index]) {
                continue;
            }
            let next = chars.get(index + 1);
            // Конец текста — тоже граница: модель может отдать точку последним
            // символом, и ждать ещё пробела значит не сказать последнее слово.
            let ends = match next {
                None => true,
                Some(ch) => ch.is_whitespace(),
            };
            // Многоточие из трёх точек: граница — последняя из них. Сокращение
            // («т.е.», «см.») — точка внутри слова, а не конец мысли.
            if ends && !is_abbreviation(&chars, index) {
                cut = Some(index + 1);
            }
        }
        let cut = cut?;
        let head: String = chars[..cut].iter().collect();
        let rest: String = chars[cut..].iter().collect();
        let said = head.trim().to_string();
        self.buffer = rest;
        if said.is_empty() {
            None
        } else {
            Some(said)
        }
    }

    /// Что осталось несказанным. Поток кончился — договариваем остаток.
    pub fn flush(&mut self) -> Option<String> {
        let rest = std::mem::take(&mut self.buffer);
        let said = rest.trim().to_string();
        if said.is_empty() {
            None
        } else {
            Some(said)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_sentence_is_only_spoken_when_it_is_finished() {
        let mut sentences = Sentences::new();
        assert_eq!(sentences.push("я нашёл три файла, но"), None);
        assert_eq!(sentences.push(" не знаю, какие"), None);
        // Только точка делает фразу законченной. Запятая — не граница.
        assert_eq!(
            sentences.push(" удалить."),
            Some("я нашёл три файла, но не знаю, какие удалить.".to_string())
        );
    }

    #[test]
    fn two_sentences_in_one_chunk_are_both_kept() {
        // Настоящий дефект старой проверки: она смотрела только на хвост
        // дельты и первое предложение теряла.
        let mut sentences = Sentences::new();
        assert_eq!(
            sentences.push("Папка пуста. Удалять нечего."),
            Some("Папка пуста. Удалять нечего.".to_string())
        );
    }

    #[test]
    fn a_dot_inside_a_number_or_abbreviation_is_not_an_end() {
        let mut sentences = Sentences::new();
        // «т.е.» и «30.5» — середина фразы, а не две фразы.
        assert_eq!(sentences.push("в среднем 30"), None);
        assert_eq!(sentences.push(".5 градуса т"), None);
        assert_eq!(sentences.push(".е. тепло"), None);
        assert_eq!(
            sentences.push("."),
            Some("в среднем 30.5 градуса т.е. тепло.".to_string())
        );
    }

    #[test]
    fn the_rest_is_spoken_when_the_stream_ends() {
        let mut sentences = Sentences::new();
        assert_eq!(sentences.push("готово"), None);
        assert_eq!(sentences.flush(), Some("готово".to_string()));
        // Второй flush пуст: остаток уже сказан, а не сказан дважды.
        assert_eq!(sentences.flush(), None);
    }

    #[test]
    fn an_abbreviation_with_a_space_after_is_still_mid_sentence() {
        // «т.е.» кончается точкой и пробелом, но фраза продолжается.
        let mut sentences = Sentences::new();
        assert_eq!(sentences.push("в среднем 30.5 градуса т.е. тепло"), None);
        assert_eq!(
            sentences.push("."),
            Some("в среднем 30.5 градуса т.е. тепло.".to_string())
        );
    }

    #[test]
    fn a_long_dash_is_not_a_pause() {
        let mut sentences = Sentences::new();
        assert_eq!(sentences.push("файл — это папка"), None);
        assert_eq!(
            sentences.push(" или нет?"),
            Some("файл — это папка или нет?".to_string())
        );
    }
}
