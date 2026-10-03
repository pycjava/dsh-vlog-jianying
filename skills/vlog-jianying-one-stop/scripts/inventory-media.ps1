[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$SourceDir,

    [Parameter(Mandatory = $true)]
    [string]$OutputCsv,

    [int]$Limit = 0
)

$ErrorActionPreference = 'Stop'
$source = (Resolve-Path -LiteralPath $SourceDir).Path
$outputParent = Split-Path -Parent $OutputCsv
if ($outputParent -and -not (Test-Path -LiteralPath $outputParent)) {
    New-Item -ItemType Directory -Force -Path $outputParent | Out-Null
}

$extensions = @(
    '.mp4', '.mov', '.m4v', '.mkv', '.avi', '.webm',
    '.mp3', '.wav', '.m4a', '.aac', '.flac', '.ogg',
    '.jpg', '.jpeg', '.png', '.heic', '.webp',
    '.srt', '.ass', '.vtt'
)

$files = Get-ChildItem -LiteralPath $source -Recurse -File |
    Where-Object { $extensions -contains $_.Extension.ToLowerInvariant() } |
    Sort-Object FullName

if ($Limit -gt 0) {
    $files = $files | Select-Object -First $Limit
}

$ffprobe = Get-Command ffprobe -ErrorAction SilentlyContinue
$rows = foreach ($file in $files) {
    $duration = $null
    $width = $null
    $height = $null
    $fps = $null
    $videoCodec = $null
    $audioCodec = $null
    $audioStreams = 0
    $channels = $null
    $sampleRate = $null
    $creationTime = $null
    $creationTimeSource = 'none'
    $probeStatus = if ($ffprobe) { 'not-probed' } else { 'ffprobe-unavailable' }

    if ($ffprobe -and $file.Extension.ToLowerInvariant() -notin @('.jpg', '.jpeg', '.png', '.heic', '.webp', '.srt', '.ass', '.vtt')) {
        try {
            $json = & $ffprobe.Source -v error -show_entries 'format=duration:format_tags=creation_time:stream=codec_type,codec_name,width,height,avg_frame_rate,channels,sample_rate' -of json -- $file.FullName 2>$null
            $probe = $json | ConvertFrom-Json
            $duration = if ($probe.format.duration) { [math]::Round([double]$probe.format.duration, 3) } else { $null }
            if ($probe.format.tags.creation_time) {
                $parsedCreationTime = [DateTimeOffset]::MinValue
                if ([DateTimeOffset]::TryParse(
                    [string]$probe.format.tags.creation_time,
                    [Globalization.CultureInfo]::InvariantCulture,
                    [Globalization.DateTimeStyles]::AssumeUniversal,
                    [ref]$parsedCreationTime
                )) {
                    $creationTime = $parsedCreationTime.ToUniversalTime().ToString('o')
                    $creationTimeSource = 'metadata'
                }
            }
            $video = $probe.streams | Where-Object codec_type -eq 'video' | Select-Object -First 1
            $audio = $probe.streams | Where-Object codec_type -eq 'audio'
            if ($video) {
                $width = $video.width
                $height = $video.height
                $videoCodec = $video.codec_name
                if ($video.avg_frame_rate -match '^([0-9.]+)/([0-9.]+)$' -and [double]$Matches[2] -ne 0) {
                    $fps = [math]::Round(([double]$Matches[1] / [double]$Matches[2]), 3)
                }
            }
            $audioStreams = @($audio).Count
            if ($audioStreams -gt 0) {
                $audioCodec = $audio[0].codec_name
                $channels = $audio[0].channels
                $sampleRate = $audio[0].sample_rate
            }
            $probeStatus = 'ok'
        }
        catch {
            $probeStatus = "error: $($_.Exception.Message)"
        }
    }

    [pscustomobject]@{
        FileName       = $file.Name
        RelativePath   = $file.FullName.Substring($source.Length).TrimStart('\')
        Extension      = $file.Extension.ToLowerInvariant()
        SizeMB         = [math]::Round($file.Length / 1MB, 2)
        Modified       = $file.LastWriteTime.ToString('yyyy-MM-dd HH:mm:ss')
        creation_time  = $creationTime
        creation_time_source = $creationTimeSource
        DurationSec    = $duration
        Width          = $width
        Height         = $height
        Orientation    = if ($width -and $height) { if ($width -gt $height) { 'landscape' } elseif ($height -gt $width) { 'portrait' } else { 'square' } } else { $null }
        Fps            = $fps
        VideoCodec     = $videoCodec
        AudioStreams   = $audioStreams
        AudioCodec     = $audioCodec
        AudioChannels  = $channels
        AudioSampleHz  = $sampleRate
        ProbeStatus    = $probeStatus
        OriginalPath   = $file.FullName
    }
}

$rows | Export-Csv -LiteralPath $OutputCsv -NoTypeInformation -Encoding UTF8
Write-Output ([pscustomobject]@{
    SourceDir = $source
    OutputCsv = (Resolve-Path -LiteralPath $OutputCsv).Path
    MediaCount = @($rows).Count
    OriginalsModified = $false
})
