# Execute the REAL embedded extractor against synthetic ZIPs, never run any exe.
# Works with Windows PowerShell 5.1 and pwsh. This is not a live-engine acceptance test.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$installer = Join-Path $PSScriptRoot '../src-tauri/src/runtime-install.ps1'
$root = Join-Path ([IO.Path]::GetTempPath()) ('zshelper-archive-tests-' + [Guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($root) | Out-Null
$pe = [byte[]]::new(128)
$pe[0] = 77; $pe[1] = 90; $pe[60] = 64
$pe[64] = 80; $pe[65] = 69; $pe[68] = 100; $pe[69] = 134
$script:passed = 0
function Check-Archive([string]$id, [array]$entries, [bool]$accept = $false, [bool]$badHash = $false, [bool]$truncate = $false, [string]$program = 'llama-server.exe') {
    $zipPath = Join-Path $root ($id + '.zip')
    $stage = Join-Path $root ($id + '-stage')
    $stream = [IO.File]::Open($zipPath, 'CreateNew')
    $zip = [IO.Compression.ZipArchive]::new($stream, [IO.Compression.ZipArchiveMode]::Create, $true)
    try {
        foreach ($item in $entries) {
            $entry = $zip.CreateEntry($item.name, [IO.Compression.CompressionLevel]::Optimal)
            if ($item.ContainsKey('mode')) { $entry.ExternalAttributes = $item.mode }
            $dest = $entry.Open()
            try { $dest.Write($item.bytes, 0, $item.bytes.Length) } finally { $dest.Dispose() }
        }
    } finally { $zip.Dispose(); $stream.Dispose() }
    if ($truncate) {
        $f = [IO.File]::OpenWrite($zipPath)
        try { $f.SetLength(10) } finally { $f.Dispose() }
    }
    $hash = (Get-FileHash -LiteralPath $zipPath -Algorithm SHA256).Hash
    if ($badHash) { $hash = '0' * 64 }
    $failed = $false
    try {
        & $installer -Archive $zipPath -Stage $stage -ExpectedHash $hash -ExpectedBytes (Get-Item -LiteralPath $zipPath).Length -Program $program
    } catch { $failed = $true }
    if ($failed -eq $accept) { throw "unexpected result: $id failed=$failed accept=$accept" }
    $marker = Join-Path $stage 'installed.json'
    if ($accept) {
        if (-not (Test-Path -LiteralPath $marker)) { throw "missing marker: $id" }
        $meta = Get-Content -LiteralPath $marker -Raw | ConvertFrom-Json
        if ($meta.archive_sha256 -ne $hash) { throw "wrong hash: $id" }
        if (@($meta.files).Count -eq 0) { throw "empty inventory: $id" }
        if (-not (Test-Path -LiteralPath (Join-Path $stage $meta.program))) { throw "missing server: $id" }
    } elseif (Test-Path -LiteralPath $marker) { throw "failed install published marker: $id" }
    $script:passed++
    Write-Host "PASS $id"
}
try {
    Check-Archive 'flat' @(@{name='llama-server.exe'; bytes=$pe}) $true
    Check-Archive 'nested' @(@{name='bin/llama-server.exe'; bytes=$pe}, @{name='bin/ggml.dll'; bytes=[byte[]](1,2,3)}) $true
    # Реальная раскладка архива whisper.cpp: бинарники внутри каталога Release.
    Check-Archive 'whisper-release' @(@{name='Release/whisper-server.exe'; bytes=$pe}, @{name='Release/ggml.dll'; bytes=[byte[]](1,2,3)}) $true $false $false 'whisper-server.exe'
    Check-Archive 'wrong-program' @(@{name='Release/whisper-server.exe'; bytes=$pe}) $false $false $false 'llama-server.exe'
    Check-Archive 'wrong-hash' @(@{name='llama-server.exe'; bytes=$pe}) $false $true
    Check-Archive 'truncated' @(@{name='llama-server.exe'; bytes=$pe}) $false $false $true
    Check-Archive 'owner-collision' @(@{name='.ZSHELPER-OWNER'; bytes=[byte[]](1)})
    Check-Archive 'marker-collision' @(@{name='installed.json'; bytes=[byte[]](1)})
    Check-Archive 'no-server' @(@{name='readme.txt'; bytes=[byte[]](1)})
    Check-Archive 'not-pe' @(@{name='llama-server.exe'; bytes=[byte[]]::new(128)})
    $arm = $pe.Clone(); $arm[68] = 100; $arm[69] = 170
    Check-Archive 'arm64' @(@{name='llama-server.exe'; bytes=$arm})
    Check-Archive 'ambiguous' @(@{name='a/llama-server.exe'; bytes=$pe}, @{name='b/llama-server.exe'; bytes=$pe})
    Check-Archive 'case-collision' @(@{name='llama-server.exe'; bytes=$pe}, @{name='LLAMA-SERVER.EXE'; bytes=$pe})
    Check-Archive 'symlink' @(@{name='llama-server.exe'; bytes=$pe; mode=(-1577058304)})
    Check-Archive 'bomb-ratio' @(@{name='llama-server.exe'; bytes=$pe}, @{name='bomb'; bytes=[byte[]]::new(2097152)})
    $i = 0
    foreach ($path in @('../escape', '..\escape', '/absolute', 'C:/absolute', 'x:ads', 'CON.exe', 'bin/LPT1.dll', 'CONIN$', ('COM' + [char]0x00b9 + '.dll'), 'x.', 'x ', 'a//b', './x')) {
        Check-Archive ('path-' + $i) @(@{name=$path; bytes=$pe})
        $i++
    }
    if (Test-Path -LiteralPath (Join-Path $root 'escape')) { throw 'archive escaped staging' }
    Write-Host "Extractor tests passed: $script:passed. No downloaded binary executed."
} finally {
    # This unique fixture directory was exclusively created by this script.
    Remove-Item -LiteralPath $root -Recurse -Force
}
