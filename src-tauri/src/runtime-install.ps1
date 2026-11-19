# Trusted embedded installer, not a script from the downloaded archive.
# Inputs are separate process arguments. No eval, shell interpolation or binary execution.
param(
    [Parameter(Mandatory=$true)][string]$Archive,
    [Parameter(Mandatory=$true)][string]$Stage,
    [Parameter(Mandatory=$true)][string]$ExpectedHash,
    [Parameter(Mandatory=$true)][long]$ExpectedBytes
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$maxBytes = 524288000L
$maxEntries = 2048
$zip = $null
$inputFile = $null
try {
    if (Test-Path -LiteralPath $Stage) { throw 'staging directory already exists' }
    $inputFile = [IO.File]::Open($Archive, 'Open', 'Read', 'Read')
    if ($inputFile.Length -ne $ExpectedBytes) { throw 'archive size mismatch' }
    $hasher = [Security.Cryptography.SHA256]::Create()
    try { $hash = [BitConverter]::ToString($hasher.ComputeHash($inputFile)).Replace('-', '').ToLowerInvariant() }
    finally { $hasher.Dispose() }
    if ($hash -ne $ExpectedHash.ToLowerInvariant()) { throw 'archive SHA256 mismatch' }
    $inputFile.Position = 0
    $zip = [IO.Compression.ZipArchive]::new($inputFile, [IO.Compression.ZipArchiveMode]::Read, $true)
    if ($zip.Entries.Count -eq 0 -or $zip.Entries.Count -gt $maxEntries) { throw 'entry count limit' }
    $names = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
    $total = 0L
    # Validate ALL metadata before creating any destination files.
    foreach ($entry in $zip.Entries) {
        $name = $entry.FullName.Replace('\', '/')
        $parts = $name.TrimEnd('/').Split('/')
        if ($name.Length -gt 180 -or $name.StartsWith('/') -or $parts.Count -eq 0) { throw 'unsafe archive path' }
        foreach ($part in $parts) {
            if ($part -eq '' -or $part -eq '.' -or $part -eq '..' -or
                $part -match '[\x00-\x1f<>:"|?*]' -or $part.EndsWith('.') -or $part.EndsWith(' ') -or
                $part -match '^(?i:CON|PRN|AUX|NUL|CONIN\$|CONOUT\$|CLOCK\$|COM[0-9\u00b9\u00b2\u00b3]|LPT[0-9\u00b9\u00b2\u00b3])(?:\.|$)') { throw 'unsafe Windows path' }
        }
        if ($name -ieq 'installed.json' -or $name -ieq '.zshelper-owner') { throw 'reserved installer marker' }
        if (-not $names.Add($name.TrimEnd('/'))) { throw 'duplicate archive path' }
        $mode = ($entry.ExternalAttributes -shr 16) -band 61440
        if ($mode -ne 0 -and $mode -ne 32768 -and $mode -ne 16384) { throw 'archive link/special file' }
        if (($entry.ExternalAttributes -band 1024) -ne 0) { throw 'archive reparse point' }
        $total += $entry.Length
        if ($entry.Length -lt 0 -or $total -gt $maxBytes -or
            $entry.Length -gt ([Math]::Max([long]1, $entry.CompressedLength) * 200)) { throw 'expanded size/ratio limit' }
    }
    [IO.Directory]::CreateDirectory($Stage) | Out-Null
    $root = [IO.Path]::GetFullPath($Stage) + [IO.Path]::DirectorySeparatorChar
    $written = 0L
    $buffer = [byte[]]::new(65536)
    foreach ($entry in $zip.Entries) {
        $path = [IO.Path]::GetFullPath([IO.Path]::Combine($Stage, $entry.FullName.Replace('\', '/')))
        if (-not $path.StartsWith($root, [StringComparison]::OrdinalIgnoreCase)) { throw 'path escaped stage' }
        if ($entry.FullName.EndsWith('/') -or $entry.FullName.EndsWith('\')) {
            [IO.Directory]::CreateDirectory($path) | Out-Null
            continue
        }
        [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($path)) | Out-Null
        $source = $entry.Open()
        $dest = $null
        try {
            $dest = [IO.File]::Open($path, 'CreateNew', 'Write', 'None')
            $fileBytes = 0L
            while (($n = $source.Read($buffer, 0, $buffer.Length)) -gt 0) {
                $written += $n
                $fileBytes += $n
                if ($written -gt $maxBytes -or $fileBytes -gt $entry.Length) { throw 'stream size limit' }
                $dest.Write($buffer, 0, $n)
            }
            if ($fileBytes -ne $entry.Length) { throw 'truncated entry' }
        } finally {
            if ($dest) { $dest.Dispose() }
            $source.Dispose()
        }
    }
    # Do not assume a flat archive. Exactly one server, with siblings kept together.
    $servers = @(Get-ChildItem -LiteralPath $Stage -Recurse -File -Filter 'llama-server.exe')
    if ($servers.Count -ne 1 -or $servers[0].Length -lt 64) { throw 'missing/ambiguous server' }
    $pe = [IO.File]::OpenRead($servers[0].FullName)
    $reader = [IO.BinaryReader]::new($pe)
    try {
        if ($reader.ReadUInt16() -ne 23117) { throw 'not MZ' }
        $pe.Position = 60
        $offset = $reader.ReadUInt32()
        if ($offset -gt $pe.Length - 6) { throw 'invalid PE offset' }
        $pe.Position = $offset
        if ($reader.ReadUInt32() -ne 17744 -or $reader.ReadUInt16() -ne 34404) { throw 'not Windows x64 PE' }
    } finally { $reader.Dispose(); $pe.Dispose() }
    # Marker is only written after complete extraction, never before.
    $relative = $servers[0].FullName.Substring($root.Length)
    $inventory = @(Get-ChildItem -LiteralPath $Stage -Recurse -File | ForEach-Object {
        @{ path = $_.FullName.Substring($root.Length); sha256 = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant() }
    })
    [IO.File]::WriteAllText((Join-Path $Stage 'installed.json'), (@{
        archive_sha256 = $ExpectedHash; program = $relative; files = $inventory
    } | ConvertTo-Json -Depth 4 -Compress))
} finally {
    if ($zip) { $zip.Dispose() }
    if ($inputFile) { $inputFile.Dispose() }
}
