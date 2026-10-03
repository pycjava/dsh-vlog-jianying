[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$SourceDir,

    [Parameter(Mandatory = $true)]
    [string]$OutputCsv,

    [ValidateRange(1, 86400)]
    [int]$SceneBreakThreshold = 600
)

$ErrorActionPreference = 'Stop'

function Stop-WithCode([string]$Message) {
    [Console]::Error.WriteLine($Message)
    exit 2
}

try {
    $source = (Resolve-Path -LiteralPath $SourceDir).Path
    $ffprobe = Get-Command ffprobe -ErrorAction Stop
}
catch {
    Stop-WithCode "ffprobe is unavailable or SourceDir does not exist: $($_.Exception.Message)"
}

$outputFull = [IO.Path]::GetFullPath($OutputCsv)
$sourcePrefix = $source.TrimEnd('\') + '\'
if ($outputFull.StartsWith($sourcePrefix, [StringComparison]::OrdinalIgnoreCase)) {
    Stop-WithCode 'OutputCsv must be outside SourceDir; the script never writes into the source-media directory.'
}

$outputParent = Split-Path -Parent $outputFull
if ($outputParent -and -not (Test-Path -LiteralPath $outputParent)) {
    New-Item -ItemType Directory -Force -Path $outputParent | Out-Null
}

$videoExtensions = @('.mp4', '.mov', '.m4v', '.mkv', '.avi', '.webm')
$videos = Get-ChildItem -LiteralPath $source -Recurse -File |
    Where-Object { $videoExtensions -contains $_.Extension.ToLowerInvariant() }

$items = foreach ($video in $videos) {
    $duration = 0.0
    $start = $null
    $sourceName = 'mtime'
    $confidence = 'low'

    try {
        $json = & $ffprobe.Source -v error -show_entries 'format=duration:format_tags=creation_time' -of json -- $video.FullName 2>$null
        if ($LASTEXITCODE -ne 0) { throw "ffprobe exit code $LASTEXITCODE" }
        $probe = $json | ConvertFrom-Json
        if ($probe.format.duration) {
            $duration = [double]::Parse(
                [string]$probe.format.duration,
                [Globalization.CultureInfo]::InvariantCulture
            )
        }

        if ($probe.format.tags.creation_time) {
            $parsed = [DateTimeOffset]::MinValue
            if ([DateTimeOffset]::TryParse(
                [string]$probe.format.tags.creation_time,
                [Globalization.CultureInfo]::InvariantCulture,
                [Globalization.DateTimeStyles]::AssumeUniversal,
                [ref]$parsed
            )) {
                $start = $parsed.ToUniversalTime()
                $sourceName = 'creation_time'
                $confidence = 'high'
            }
        }
    }
    catch {
        Write-Warning "Could not read media time for $($video.Name); using mtime: $($_.Exception.Message)"
    }

    if ($null -eq $start) {
        $start = [DateTimeOffset]$video.LastWriteTimeUtc
    }

    [pscustomobject]@{
        file = $video.FullName.Substring($source.Length).TrimStart('\')
        full_path = $video.FullName
        start_value = $start
        duration_value = [math]::Max(0.0, $duration)
        ts_source = $sourceName
        time_confidence = $confidence
    }
}

$ordered = @($items | Sort-Object start_value, file)
$rows = New-Object System.Collections.Generic.List[object]

for ($index = 0; $index -lt $ordered.Count; $index++) {
    $item = $ordered[$index]
    $gap = $null
    $sceneBreak = 0

    if ($index -gt 0) {
        $previous = $ordered[$index - 1]
        $previousEnd = $previous.start_value.AddSeconds($previous.duration_value)
        $gap = ($item.start_value - $previousEnd).TotalSeconds
        if ($gap -gt $SceneBreakThreshold) { $sceneBreak = 1 }
    }

    $rows.Add([pscustomobject][ordered]@{
        seq = $index + 1
        file = $item.file
        start_ts = $item.start_value.ToString('o')
        duration = [math]::Round($item.duration_value, 3)
        gap_sec = if ($null -eq $gap) { $null } else { [math]::Round($gap, 3) }
        scene_break = $sceneBreak
        ts_source = $item.ts_source
        time_confidence = $item.time_confidence
    })
}

if ($rows.Count -gt 0) {
    $rows | Export-Csv -LiteralPath $outputFull -NoTypeInformation -Encoding UTF8
}
else {
    'seq,file,start_ts,duration,gap_sec,scene_break,ts_source,time_confidence' |
        Set-Content -LiteralPath $outputFull -Encoding UTF8
}

[pscustomobject]@{
    SourceDir = $source
    OutputCsv = $outputFull
    VideoCount = $rows.Count
    SceneBreakCandidates = @($rows | Where-Object scene_break -eq 1).Count
    OriginalsModified = $false
}
