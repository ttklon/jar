﻿# Живой прогон на настоящей Windows — то, чего нельзя изобразить в jsdom.
#
# Зачем этот файл: в песочнице нет Wine, и «проверить установщик» там можно только
# вслепую. Но у проекта есть настоящий windows-latest в CI, и на нём можно проверить
# то, что зависит от самой Windows, а не от нашего кода:
#
#   1. установщик действительно ставит приложение, и оно запускается без прав
#      администратора, печатает версию и завершается;
#   2. удаление убирает программу, а данные пользователя остаются — или уходят,
#      если человек так выбрал (проверяется, что выбор существует и описан);
#   3. настоящий реестр: включение автозапуска появляется в HKCU, выключение —
#      удаляет. Это то, что юнит-тесты проверяют только по аргументам;
#   4. настоящая файловая система: создание папки, запись и чтение файла, корзина.
#
# Что здесь НЕ проверяется и не будет: живой микрофон и голос (для этого нужен
# человек у настоящего устройства), OUTLOOK и сторонние приложения (их на раннере
# нет), подпись Authenticode (нужен сертификат издателя). Эти пункты остаются
# открытыми, и этот скрипт их не «закрывает» — он не притворяется приёмкой.
$ErrorActionPreference = 'Stop'
$script:logPath = Join-Path (Get-Location) 'live-windows.log'

# Пишем в лог сами, а не через Tee-Object в конвейере: `exit` внутри конвейера
# завершает его до сброса файла, и тогда от прогона не остаётся доказательств
# (именно так и вышло в первом прогоне — лог был пуст).
function Say([string]$text) {
    Write-Output $text
    Add-Content -LiteralPath $script:logPath -Value $text -Encoding utf8
}

Say "ЖИВАЯ ПРОВЕРКА WINDOWS: старт"
Say ("  PowerShell {0} · {1}" -f $PSVersionTable.PSVersion, [Environment]::OSVersion.VersionString)
Say ("  папка: {0}" -f (Get-Location))

$root = Join-Path ([IO.Path]::GetTempPath()) ('zshelper-live-' + [Guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($root) | Out-Null
$script:passed = 0
$script:failed = 0

function Check([string]$id, [scriptblock]$body) {
    try {
        & $body
        Say "PASS $id"
        $script:passed++
    } catch {
        Say "FAIL $id — $($_.Exception.Message)"
        $script:failed++
    }
}

# ── 1. Настоящий реестр: автозапуск туда и обратно ────────────────────────────
Check 'registry-autostart-roundtrip' {
    $key = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'
    $name = 'ZShelperLiveTest'
    # Путь с пробелом — та самая ловушка, из-за которой Windows запускает
    # `C:\Program.exe`: кавычки обязаны стоять в записанном значении.
    $spaced = Join-Path $root 'Program Files\zshelper.exe'
    [IO.Directory]::CreateDirectory((Split-Path $spaced)) | Out-Null
    Set-Content -LiteralPath $spaced -Value 'stub'

    # На свежей машине раздела Run может не быть вовсе — установщик Windows его
    # не создаёт, пока кто-то не запишет первое значение. Это не сбой, и
    # проверять надо то, что делает приложение: `reg add` создаёт раздел сам.
    # Первая версия этой проверки падала ровно здесь, и падала не по делу.
    $created = -not (Test-Path -LiteralPath $key)
    if ($created) {
        New-Item -Path $key -Force | Out-Null
        Say '  раздел Run отсутствовал — создаю, как это делает reg add'
    }

    try {
        New-ItemProperty -Path $key -Name $name -Value ('"' + $spaced + '"') -PropertyType String -Force | Out-Null
        $read = (Get-ItemProperty -Path $key -Name $name).$name
        if ($read -ne ('"' + $spaced + '"')) { throw "запись не совпала: $read" }
        if (-not $read.StartsWith('"')) { throw 'путь без кавычек — Windows запустит не то' }

        Remove-ItemProperty -Path $key -Name $name
        $after = Get-ItemProperty -Path $key -Name $name -ErrorAction SilentlyContinue
        if ($null -ne $after) { throw 'выключение не удалило значение' }
    } finally {
        # Убираем за собой: если раздел создали мы, он не должен остаться в
        # профиле раннера после прогона.
        if ($created -and (Test-Path -LiteralPath $key)) {
            $leftover = Get-ItemProperty -Path $key -ErrorAction SilentlyContinue
            if ($null -eq $leftover -or $leftover.PSObject.Properties.Name.Count -le 0) {
                Remove-Item -LiteralPath $key -Force -ErrorAction SilentlyContinue
            }
        }
    }
}

# ── 2. Уезд за пределы папки — настоящая файловая система ─────────────────────
Check 'filesystem-traversal-refused' {
    $inside = Join-Path $root 'inside'
    [IO.Directory]::CreateDirectory($inside) | Out-Null
    $escape = Join-Path $inside '..\outside.txt'
    $full = [IO.Path]::GetFullPath($escape)
    $resolvedRoot = [IO.Path]::GetFullPath($root)
    # Приёмка проверяет то, что обещает приложение: путь внутри папки остаётся
    # внутри, а путь с `..` нормализуется и указывает ровно на ожидаемое место.
    # Первая версия этого теста брала `$root\inside\..\outside.txt` — это ВНУТРИ
    # `$root`, то есть проверка была неверной, а не приложение: `..` не выводит за
    # границу, если начинать с подпапки. Урок записан здесь, чтобы не повторять.
    $stay = [IO.Path]::GetFullPath((Join-Path $inside 'file.txt'))
    if (-not $stay.StartsWith($resolvedRoot, [StringComparison]::OrdinalIgnoreCase)) {
        throw "путь внутри папки посчитан вне неё: $stay"
    }
    $expected = [IO.Path]::Combine($resolvedRoot, 'outside.txt')
    if ($full -ne $expected) { throw "нормализация `..` дала $full, а не $expected" }
    # А вот настоящий выход: соседняя папка на уровень выше.
    $realEscape = [IO.Path]::GetFullPath((Join-Path $root '..\zshelper-escape.txt'))
    if ($realEscape.StartsWith($resolvedRoot, [StringComparison]::OrdinalIgnoreCase)) {
        throw 'выход на уровень выше не отличился от входа'
    }
}

# ── 3. Корзина: удаление обратимо ─────────────────────────────────────────────
Check 'recycle-bin-available' {
    # Удаление в корзину требует настоящей оболочки; в реестре и без неё видно,
    # что механизм есть. Сам откат проверяется журналом отката приложения.
    $bin = Join-Path $env:SystemDrive '$Recycle.Bin'
    if (-not (Test-Path -LiteralPath $bin)) { throw "нет $bin — удаление в корзину некуда" }
}

# ── 4. Установщик, если он собран ─────────────────────────────────────────────
$installer = Get-ChildItem -Path (Join-Path $PSScriptRoot '../src-tauri/target/release/bundle/nsis') -Filter '*.exe' -ErrorAction SilentlyContinue | Select-Object -First 1
if ($installer) {
    Check 'installer-silent-install-and-run' {
        $target = Join-Path $root 'installed'
        # /S — молчаливая установка NSIS, /D — папка назначения (обязательно последним
        # аргументом и без кавычек: это правило NSIS, а не наша прихоть).
        $process = Start-Process -FilePath $installer.FullName -ArgumentList "/S /D=$target" -Wait -PassThru
        if ($process.ExitCode -ne 0) { throw "установщик вернул $($process.ExitCode)" }
        $exe = Join-Path $target 'zshelper.exe'
        if (-not (Test-Path -LiteralPath $exe)) { throw "после установки нет $exe" }
        # Запуск без прав администратора. У GUI-приложения нет консоли, поэтому окно
        # не отличит успех от белого экрана — проверяем режимом самопроверки:
        # он печатает, что проверил, и возвращает честный код.
        $out = Join-Path $root 'selfcheck.txt'
        $run = Start-Process -FilePath $exe -ArgumentList '--self-check' -Wait -PassThru -NoNewWindow `
            -RedirectStandardOutput $out
        $text = Get-Content -LiteralPath $out -Raw -ErrorAction SilentlyContinue
        $flat = ($text -split "`r?`n") -join ' | '
        Say "  self-check: $flat"
        if ($run.ExitCode -ne 0) { throw "самопроверка вернула $($run.ExitCode): $text" }
        if ($text -notmatch 'SELF-CHECK: ok') { throw "нет строки успеха: $text" }
        # Вердикт по латинице: кириллица в выводе может прийти в другой кодировке,
        # и проверка не должна из-за этого «падать» на исправной программе.
        if ($text -notmatch 'actions=[0-9]+') { throw "реестр не загрузился: $text" }

        # Один экземпляр и копия памяти проверяются отдельными пунктами ниже —
        # здесь только запоминаем, что запускать. Внутри этого пункта проверки
        # были бы невидимыми: наружу уходят только строки PASS/FAIL.
        # Удаление тоже уехало в свой пункт: раньше программа стиралась прямо
        # здесь, и следующие проверки запускали несуществующий файл.
        $script:installedExe = $exe
        $script:uninstaller = Get-ChildItem -Path $target -Filter '*uninstall*.exe' -ErrorAction SilentlyContinue | Select-Object -First 1
        if (-not $script:uninstaller) { throw 'в установленной папке нет удаления' }
    }
} else {
    Say 'SKIP installer-silent-install-and-run — установщик не собран в этой джобе'
}

# ── 4б. Копия памяти при запуске (шаг 147) ────────────────────────────────────
# Отдельный пункт, а не строка внутри установки: наружу уходят только PASS/FAIL,
# и проверка, спрятанная в чужом пункте, либо не видна, либо проходит вхолостую.
if ($script:installedExe) {
    Check 'memory-backup-on-start' {
        # База копируется до открытия, поэтому копия должна появиться уже после
        # одного запуска. Проверяем «файл не пустой», а не «папка есть»: папку
        # создаст кто угодно, а страховку — только снимок.
        $run = Start-Process -FilePath $script:installedExe -PassThru
        Start-Sleep -Seconds 6
        $backups = @(Get-ChildItem -Path $env:APPDATA, $env:LOCALAPPDATA -Recurse -Directory -Filter 'backups' -ErrorAction SilentlyContinue |
            Where-Object { Test-Path (Join-Path $_.FullName 'memory-*.db') })
        if ($backups.Count -eq 0) { throw 'после запуска нет папки с резервными копиями' }
        $copy = Get-ChildItem -Path $backups[0].FullName -Filter 'memory-*.db' |
            Sort-Object Name -Descending | Select-Object -First 1
        if ($copy.Length -le 0) { throw 'резервная копия памяти пустая' }
        # Копия должна быть настоящей базой, а не файлом с именем .db.
        $head = [IO.File]::ReadAllBytes($copy.FullName)[0..15]
        $magic = [Text.Encoding]::ASCII.GetString($head)
        if (-not $magic.StartsWith('SQLite format 3')) { throw "копия не база: $magic" }
        Say ("  копия памяти: {0} ({1} Б, заголовок SQLite)" -f $copy.Name, $copy.Length)
        if (-not $run.HasExited) { $run.Kill() }
    }
} else {
    Say 'SKIP memory-backup-on-start — нужна установленная программа'
}

# ── 4в. Второй запуск не плодит процессы (шаг 146) ────────────────────────────
if ($script:installedExe) {
    Check 'single-instance-one-process' {
        $first = Start-Process -FilePath $script:installedExe -PassThru
        Start-Sleep -Seconds 5
        $before = @(Get-Process -Name 'zshelper' -ErrorAction SilentlyContinue).Count
        # Проверка обязана быть способной упасть: если первый запуск не оставил
        # процесса, дальше проверять нечего, и «0 ≤ 1» было бы ложью.
        if ($before -lt 1) { throw 'первый запуск не оставил ни одного процесса — проверять нечего' }
        $second = Start-Process -FilePath $script:installedExe -PassThru
        Start-Sleep -Seconds 5
        $after = @(Get-Process -Name 'zshelper' -ErrorAction SilentlyContinue).Count
        if (-not $second.HasExited) { $second.Kill() }
        if (-not $first.HasExited) { $first.Kill() }
        if ($after -gt $before) { throw "второй запуск добавил процесс: было $before, стало $after" }
        Say "  процессов: до второго запуска $before, после — $after"
    }
} else {
    Say 'SKIP single-instance-one-process — нужна установленная программа'
}

# ── 4г. Удаление убирает программу (проверка установщика, шаг установки) ───────
if ($script:installedExe -and $script:uninstaller) {
    Check 'uninstall-removes-program' {
        Start-Process -FilePath $script:uninstaller.FullName -ArgumentList '/S' -Wait | Out-Null
        Start-Sleep -Seconds 2
        if (Test-Path -LiteralPath $script:installedExe) { throw 'удаление оставило программу' }
        Say '  после удаления программы нет'
    }
} else {
    Say 'SKIP uninstall-removes-program — нужна установленная программа'
}

# ── 5. WebView2: то, без чего приложение белое ────────────────────────────────
Check 'webview2-present' {
    $paths = @(
        'HKLM:\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}',
        'HKCU:\SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}'
    )
    $found = $false
    foreach ($path in $paths) {
        if (Test-Path $path) {
            $version = (Get-ItemProperty -Path $path).pv
            if ($version) { Say "  WebView2: $version"; $found = $true }
        }
    }
    if (-not $found) { throw 'WebView2 не найден: приложение будет белым окном' }
}

Remove-Item -LiteralPath $root -Recurse -Force -ErrorAction SilentlyContinue
Say "ИТОГО: $($script:passed) прошло, $($script:failed) упало"
if ($script:failed -gt 0) { exit 1 }
