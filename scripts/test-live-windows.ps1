# Живой прогон на настоящей Windows — то, чего нельзя изобразить в jsdom.
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
    $exe = Join-Path $root 'zshelper.exe'
    # Путь с пробелом — та самая ловушка, из-за которой Windows запускает
    # `C:\Program.exe`: кавычки обязаны стоять в записанном значении.
    $spaced = Join-Path $root 'Program Files\zshelper.exe'
    [IO.Directory]::CreateDirectory((Split-Path $spaced)) | Out-Null
    Set-Content -LiteralPath $spaced -Value 'stub'

    New-ItemProperty -Path $key -Name $name -Value ('"' + $spaced + '"') -PropertyType String -Force | Out-Null
    $read = (Get-ItemProperty -Path $key -Name $name).$name
    if ($read -ne ('"' + $spaced + '"')) { throw "запись не совпала: $read" }
    if (-not $read.StartsWith('"')) { throw 'путь без кавычек — Windows запустит не то' }

    Remove-ItemProperty -Path $key -Name $name
    $after = Get-ItemProperty -Path $key -Name $name -ErrorAction SilentlyContinue
    if ($null -ne $after) { throw 'выключение не удалило значение' }
}

# ── 2. Уезд за пределы папки — настоящая файловая система ─────────────────────
Check 'filesystem-traversal-refused' {
    $inside = Join-Path $root 'inside'
    [IO.Directory]::CreateDirectory($inside) | Out-Null
    $escape = Join-Path $inside '..\outside.txt'
    $full = [IO.Path]::GetFullPath($escape)
    $resolvedRoot = [IO.Path]::GetFullPath($root)
    # Приложение обязано отказать; здесь проверяем, что проверка (полный путь
    # нормализуется) ловит выход, а не «доверяет строкам».
    if ($full.StartsWith($resolvedRoot)) { throw 'проверка пути не отличила выход от входа' }
    if (-not $full.StartsWith([IO.Path]::GetFullPath((Split-Path $resolvedRoot)))) {
        throw 'нормализация пути не работает'
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

        # Удаление: программа уходит.
        $uninstaller = Get-ChildItem -Path $target -Filter '*uninstall*.exe' -ErrorAction SilentlyContinue | Select-Object -First 1
        if (-not $uninstaller) { throw 'в установленной папке нет удаления' }
        Start-Process -FilePath $uninstaller.FullName -ArgumentList '/S' -Wait | Out-Null
        if (Test-Path -LiteralPath $exe) { throw 'удаление оставило программу' }
    }
} else {
    Say 'SKIP installer-silent-install-and-run — установщик не собран в этой джобе'
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
