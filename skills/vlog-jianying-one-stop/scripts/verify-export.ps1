[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$VideoPath,

    [double]$TargetSeconds = 0,
    [int]$ExpectedWidth = 0,
    [int]$ExpectedHeight = 0,
    [double]$ExpectedFps = 0,
    [double]$DurationTolerance = 1.0
)

$ErrorActionPreference = 'Stop'
$file = Get-Item -LiteralPath $VideoPath
$ffprobe = Get-Command ffprobe -ErrorAction Stop
$json = & $ffprobe.Source -v error -show_entries 'format=duration,format_name,size:stream=index,codec_type,codec_name,width,height,avg_frame_rate,sample_rate,channels' -of json -- $file.FullName
$probe = $json | ConvertFrom-Json

$video = $probe.streams | Where-Object codec_type -eq 'video' | Select-Object -First 1
$audio = @($probe.streams | Where-Object codec_type -eq 'audio')
$duration = [double]$probe.format.duration
$fps = 0.0
if ($video.avg_frame_rate -match '^([0-9.]+)/([0-9.]+)$' -and [double]$Matches[2] -ne 0) {
    $fps = [double]$Matches[1] / [double]$Matches[2]
}

$checks = [ordered]@{
    FileExists       = $file.Exists
    FileNonEmpty     = $file.Length -gt 0
    HasVideoStream   = $null -ne $video
    HasAudioStream   = $audio.Count -gt 0
    DurationOk       = if ($TargetSeconds -gt 0) { [math]::Abs($duration - $TargetSeconds) -le $DurationTolerance } else { $true }
    WidthOk          = if ($ExpectedWidth -gt 0) { $video.width -eq $ExpectedWidth } else { $true }
    HeightOk         = if ($ExpectedHeight -gt 0) { $video.height -eq $ExpectedHeight } else { $true }
    FpsOk            = if ($ExpectedFps -gt 0) { [math]::Abs($fps - $ExpectedFps) -lt 0.05 } else { $true }
}

$result = [pscustomobject]@{
    Passed           = -not ($checks.Values -contains $false)
    Path             = $file.FullName
    SizeMB           = [math]::Round($file.Length / 1MB, 2)
    DurationSec      = [math]::Round($duration, 3)
    VideoCodec       = $video.codec_name
    Width            = $video.width
    Height           = $video.height
    Fps              = [math]::Round($fps, 3)
    AudioStreams     = $audio.Count
    AudioCodec       = if ($audio.Count) { $audio[0].codec_name } else { $null }
    AudioSampleHz    = if ($audio.Count) { $audio[0].sample_rate } else { $null }
    AudioChannels    = if ($audio.Count) { $audio[0].channels } else { $null }
    Checks           = [pscustomobject]$checks
}

$result | ConvertTo-Json -Depth 4
if (-not $result.Passed) { exit 2 }
