[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$VideoPath,

    [Parameter(Mandatory = $true)]
    [string]$BgmPath,

    [Parameter(Mandatory = $true)]
    [string]$OutputPath,

    [ValidateRange(0, 86400)]
    [double]$StartSeconds = 0,

    [ValidateRange(0.01, 2.0)]
    [double]$BgmVolume = 0.35,

    [string]$SoundIntervalsCsv,

    [ValidateRange(0.0, 2.0)]
    [double]$DuckVolume = 0.10,

    [ValidateRange(0.01, 2.0)]
    [double]$MusicLeadVolume = 0.45,

    [ValidateRange(0.01, 2.0)]
    [double]$TransitionSeconds = 0.18,

    [ValidateRange(0.001, 1.0)]
    [double]$SidechainThreshold = 0.03,

    [ValidateRange(1, 20)]
    [double]$SidechainRatio = 8,

    [ValidateRange(1, 2000)]
    [double]$AttackMs = 200,

    [ValidateRange(1, 5000)]
    [double]$ReleaseMs = 600,

    [ValidateRange(0.1, 10)]
    [double]$FadeOutSeconds = 1.8,

    [string]$IndexCsv,

    [switch]$Force
)

$ErrorActionPreference = 'Stop'
$culture = [Globalization.CultureInfo]::InvariantCulture

function Stop-WithCode([string]$Message) {
    [Console]::Error.WriteLine($Message)
    exit 2
}

try {
    $video = (Resolve-Path -LiteralPath $VideoPath).Path
    $bgm = (Resolve-Path -LiteralPath $BgmPath).Path
    $ffmpeg = Get-Command ffmpeg -ErrorAction Stop
    $ffprobe = Get-Command ffprobe -ErrorAction Stop
}
catch {
    Stop-WithCode "An input file, ffmpeg, or ffprobe is unavailable: $($_.Exception.Message)"
}

$output = [IO.Path]::GetFullPath($OutputPath)
if ($output -eq $video -or $output -eq $bgm) {
    Stop-WithCode 'OutputPath must not overwrite the no-BGM master or the original music file.'
}
if ((Test-Path -LiteralPath $output) -and -not $Force) {
    Stop-WithCode 'OutputPath already exists. Use an incremented version name or pass -Force explicitly.'
}

$outputParent = Split-Path -Parent $output
if ($outputParent -and -not (Test-Path -LiteralPath $outputParent)) {
    New-Item -ItemType Directory -Force -Path $outputParent | Out-Null
}

function Get-MediaProbe([string]$Path) {
    $json = & $ffprobe.Source -v error -show_entries 'format=duration:stream=codec_type' -of json -- $Path
    if ($LASTEXITCODE -ne 0) { throw "ffprobe failed: $Path" }
    return ($json | ConvertFrom-Json)
}

$videoProbe = Get-MediaProbe $video
$bgmProbe = Get-MediaProbe $bgm
$videoDuration = [double]::Parse([string]$videoProbe.format.duration, $culture)
$bgmDuration = [double]::Parse([string]$bgmProbe.format.duration, $culture)
$videoHasAudio = @($videoProbe.streams | Where-Object codec_type -eq 'audio').Count -gt 0
$bgmHasAudio = @($bgmProbe.streams | Where-Object codec_type -eq 'audio').Count -gt 0

if (-not $bgmHasAudio) {
    Stop-WithCode 'The BGM file has no audio stream.'
}
if (($bgmDuration - $StartSeconds) + 0.05 -lt $videoDuration) {
    Stop-WithCode ('The BGM tail is too short: required {0:N3}s, available {1:N3}s.' -f $videoDuration, ($bgmDuration - $StartSeconds))
}
if ($MusicLeadVolume -lt $BgmVolume) {
    Stop-WithCode 'MusicLeadVolume must be greater than or equal to BgmVolume.'
}

$soundIntervals = @()
if ($SoundIntervalsCsv) {
    try {
        $intervalPath = (Resolve-Path -LiteralPath $SoundIntervalsCsv).Path
        $rows = @(Import-Csv -LiteralPath $intervalPath)
        foreach ($row in $rows) {
            $role = [string]$row.sound_role
            if (-not $role) { $role = [string]$row.type }
            $role = $role.Trim().ToLowerInvariant()
            if ($role -notin @('dialogue', 'key_interaction', 'ambience', 'scenery_montage')) {
                throw "Unsupported sound_role '$role'."
            }

            $start = [double]::Parse([string]$row.start, $culture)
            $end = [double]::Parse([string]$row.end, $culture)
            if ($start -lt 0 -or $end -le $start -or $end -gt ($videoDuration + 0.05)) {
                throw "Invalid interval $start-$end for '$role'."
            }

            $soundIntervals += [pscustomobject]@{
                Start = [math]::Max(0, $start)
                End = [math]::Min($videoDuration, $end)
                Role = $role
            }
        }
    }
    catch {
        Stop-WithCode "Sound interval CSV is invalid: $($_.Exception.Message)"
    }
}

function F([double]$Value) {
    return $Value.ToString('0.######', $culture)
}

$trimDuration = F $videoDuration
$startText = F $StartSeconds
$fadeDuration = [math]::Min($FadeOutSeconds, $videoDuration)
$fadeStart = [math]::Max(0, $videoDuration - $fadeDuration)
$volumeText = F $BgmVolume
$thresholdText = F $SidechainThreshold
$ratioText = F $SidechainRatio
$attackText = F $AttackMs
$releaseText = F $ReleaseMs
$fadeStartText = F $fadeStart
$fadeDurationText = F $fadeDuration

function Get-GainEnvelope(
    [double]$Start,
    [double]$End,
    [double]$Base,
    [double]$Target,
    [double]$Ramp,
    [double]$Duration
) {
    $startRamp = [math]::Max([double]0, $Start - $Ramp)
    $endRamp = [math]::Min($Duration, $End + $Ramp)
    $baseText = F $Base
    $targetText = F $Target
    $startTextLocal = F $Start
    $endTextLocal = F $End
    $startRampText = F $startRamp
    $endRampText = F $endRamp

    if ($endRamp -gt $End) {
        $after = "if(lte(t,$endTextLocal),$targetText,if(lt(t,$endRampText),$targetText+($baseText-$targetText)*(t-$endTextLocal)/($endRampText-$endTextLocal),$baseText))"
    }
    else {
        $after = "if(lte(t,$endTextLocal),$targetText,$baseText)"
    }

    if ($Start -gt $startRamp) {
        return "if(lt(t,$startRampText),$baseText,if(lt(t,$startTextLocal),$baseText+($targetText-$baseText)*(t-$startRampText)/($startTextLocal-$startRampText),$after))"
    }
    return $after
}

if ($videoHasAudio) {
    if ($soundIntervals.Count -gt 0) {
        $gainExpression = $volumeText
        foreach ($interval in @($soundIntervals | Where-Object Role -eq 'scenery_montage')) {
            $envelope = Get-GainEnvelope $interval.Start $interval.End $BgmVolume $MusicLeadVolume $TransitionSeconds $videoDuration
            $gainExpression = "max($gainExpression,$envelope)"
        }
        foreach ($interval in @($soundIntervals | Where-Object { $_.Role -in @('dialogue', 'key_interaction') })) {
            # Use the maximum possible non-dialogue gain outside the interval so
            # min() does not suppress scenery_montage gains elsewhere.
            $envelope = Get-GainEnvelope $interval.Start $interval.End $MusicLeadVolume $DuckVolume $TransitionSeconds $videoDuration
            $gainExpression = "min($gainExpression,$envelope)"
        }

        $filter = "[0:a]aformat=sample_rates=48000:channel_layouts=stereo[base];" +
            "[1:a]atrim=start=$startText`:duration=$trimDuration,asetpts=PTS-STARTPTS,aformat=sample_rates=48000:channel_layouts=stereo,volume='$gainExpression'`:eval=frame,afade=t=out:st=$fadeStartText`:d=$fadeDurationText[bgm];" +
            '[base][bgm]amix=inputs=2:duration=first:dropout_transition=0:normalize=0,alimiter=limit=0.95[outa]'
        $mixMode = 'semantic-intervals'
    }
    else {
        $filter = "[0:a]aformat=sample_rates=48000:channel_layouts=stereo,asplit=2[base][side];" +
            "[1:a]atrim=start=$startText`:duration=$trimDuration,asetpts=PTS-STARTPTS,aformat=sample_rates=48000:channel_layouts=stereo,volume=$volumeText,afade=t=out:st=$fadeStartText`:d=$fadeDurationText[bgm];" +
            "[bgm][side]sidechaincompress=threshold=$thresholdText`:ratio=$ratioText`:attack=$attackText`:release=$releaseText[ducked];" +
            '[base][ducked]amix=inputs=2:duration=first:dropout_transition=0:normalize=0,alimiter=limit=0.95[outa]'
        $mixMode = 'sidechain-fallback'
    }
}
else {
    if ($soundIntervals.Count -gt 0) {
        Stop-WithCode 'Sound intervals were supplied, but the no-BGM master has no audio stream.'
    }
    $filter = "[1:a]atrim=start=$startText`:duration=$trimDuration,asetpts=PTS-STARTPTS,aformat=sample_rates=48000:channel_layouts=stereo,volume=$volumeText,afade=t=out:st=$fadeStartText`:d=$fadeDurationText,alimiter=limit=0.95[outa]"
    $mixMode = 'bgm-only'
}

$temporary = Join-Path $outputParent (([IO.Path]::GetFileNameWithoutExtension($output)) + '.tmp.' + [guid]::NewGuid().ToString('N') + '.mp4')
$arguments = @(
    '-hide_banner', '-loglevel', 'error', '-y',
    '-i', $video,
    '-i', $bgm,
    '-filter_complex', $filter,
    '-map', '0:v:0',
    '-map', '[outa]',
    '-c:v', 'copy',
    '-c:a', 'aac',
    '-ar', '48000',
    '-b:a', '192k',
    '-movflags', '+faststart',
    $temporary
)

try {
    & $ffmpeg.Source @arguments
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $temporary) -or (Get-Item -LiteralPath $temporary).Length -le 0) {
        throw "ffmpeg mixing failed with exit code $LASTEXITCODE"
    }

    if ((Test-Path -LiteralPath $output) -and $Force) {
        Remove-Item -LiteralPath $output -Force
    }
    Move-Item -LiteralPath $temporary -Destination $output
}
catch {
    if (Test-Path -LiteralPath $temporary) {
        Remove-Item -LiteralPath $temporary -Force
    }
    Stop-WithCode ([string]$_)
}

if ($IndexCsv -and (Test-Path -LiteralPath $IndexCsv)) {
    $indexPath = (Resolve-Path -LiteralPath $IndexCsv).Path
    $rows = @(Import-Csv -LiteralPath $indexPath)
    $matched = $false
    foreach ($row in $rows) {
        if ($row.file -and ([IO.Path]::GetFullPath($row.file) -eq $bgm)) {
            $count = 0
            [void][int]::TryParse([string]$row.use_count, [ref]$count)
            $row.use_count = [string]($count + 1)
            $row.last_used = [DateTimeOffset]::UtcNow.ToString('o')
            $matched = $true
        }
    }
    if ($matched) {
        $indexTemp = "$indexPath.tmp"
        $rows | Export-Csv -LiteralPath $indexTemp -NoTypeInformation -Encoding UTF8
        Move-Item -LiteralPath $indexTemp -Destination $indexPath -Force
    }
}

[pscustomobject]@{
    OutputPath = $output
    DurationSec = [math]::Round($videoDuration, 3)
    BgmPath = $bgm
    StartSeconds = $StartSeconds
    MixMode = $mixMode
    SoundIntervalCount = $soundIntervals.Count
    SidechainApplied = ($mixMode -eq 'sidechain-fallback')
    OriginalsModified = $false
}
