[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$SourceDir,

    [Parameter(Mandatory = $true)]
    [string]$OutputDir,

    [ValidateRange(3, 30)]
    [int]$FramesPerVideo = 10,

    [int]$MaxVideos = 0
)

$ErrorActionPreference = 'Stop'
$source = (Resolve-Path -LiteralPath $SourceDir).Path
$ffprobe = Get-Command ffprobe -ErrorAction Stop
$ffmpeg = Get-Command ffmpeg -ErrorAction Stop

if (-not (Test-Path -LiteralPath $OutputDir)) {
    New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null
}
$output = (Resolve-Path -LiteralPath $OutputDir).Path

$videoExtensions = @('.mp4', '.mov', '.m4v', '.mkv', '.avi', '.webm')
$videos = Get-ChildItem -LiteralPath $source -Recurse -File |
    Where-Object { $videoExtensions -contains $_.Extension.ToLowerInvariant() } |
    Sort-Object LastWriteTime, FullName

if ($MaxVideos -gt 0) {
    $videos = $videos | Select-Object -First $MaxVideos
}

$manifest = New-Object System.Collections.Generic.List[object]
$videoIndex = 0

foreach ($video in $videos) {
    $videoIndex++
    $mediaId = 'V{0:D4}' -f $videoIndex
    $mediaDir = Join-Path $output $mediaId
    New-Item -ItemType Directory -Force -Path $mediaDir | Out-Null

    $durationText = & $ffprobe.Source -v error -show_entries 'format=duration' -of 'default=noprint_wrappers=1:nokey=1' -- $video.FullName
    $duration = 0.0
    if (-not [double]::TryParse(($durationText | Select-Object -First 1), [Globalization.NumberStyles]::Float, [Globalization.CultureInfo]::InvariantCulture, [ref]$duration)) {
        $manifest.Add([pscustomobject]@{
            MediaId = $mediaId
            RelativePath = $video.FullName.Substring($source.Length).TrimStart('\')
            CaptureTime = $video.LastWriteTime.ToString('yyyy-MM-dd HH:mm:ss')
            DurationSec = $null
            FramePath = $null
            TimestampSec = $null
            FrameZone = $null
            Status = 'duration-unavailable'
        })
        continue
    }

    for ($frameIndex = 1; $frameIndex -le $FramesPerVideo; $frameIndex++) {
        $position = $duration * $frameIndex / ($FramesPerVideo + 1)
        $ratio = $position / $duration
        $frameZone = if ($ratio -le 0.2) { 'start' } elseif ($ratio -ge 0.8) { 'end' } else { 'middle' }
        $positionText = $position.ToString('0.###', [Globalization.CultureInfo]::InvariantCulture)
        $frameName = '{0}_F{1:D2}_{2}s.jpg' -f $mediaId, $frameIndex, $positionText.Replace('.', '_')
        $framePath = Join-Path $mediaDir $frameName

        $arguments = @(
            '-hide_banner', '-loglevel', 'error',
            '-ss', $positionText,
            '-i', $video.FullName,
            '-frames:v', '1',
            '-vf', 'scale=720:-2:force_original_aspect_ratio=decrease',
            '-q:v', '3',
            '-y', $framePath
        )
        & $ffmpeg.Source @arguments

        $manifest.Add([pscustomobject]@{
            MediaId = $mediaId
            RelativePath = $video.FullName.Substring($source.Length).TrimStart('\')
            CaptureTime = $video.LastWriteTime.ToString('yyyy-MM-dd HH:mm:ss')
            DurationSec = [math]::Round($duration, 3)
            FramePath = $framePath
            TimestampSec = [math]::Round($position, 3)
            FrameZone = $frameZone
            Status = if (Test-Path -LiteralPath $framePath) { 'ok' } else { 'frame-failed' }
        })
    }
}

$manifestPath = Join-Path $output 'review-manifest.csv'
$manifest | Export-Csv -LiteralPath $manifestPath -NoTypeInformation -Encoding UTF8

[pscustomobject]@{
    SourceDir = $source
    OutputDir = $output
    Manifest = $manifestPath
    VideoCount = @($videos).Count
    FrameCount = @($manifest | Where-Object Status -eq 'ok').Count
    OriginalsModified = $false
}
