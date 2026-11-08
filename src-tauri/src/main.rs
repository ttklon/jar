// В релизе это GUI-приложение: консольное окно не должно появляться.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    zshelper_lib::run();
}
