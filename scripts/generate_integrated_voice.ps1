$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech
$root = Split-Path -Parent $PSScriptRoot
$output = Join-Path $root 'apps/dashboard/public/command/voice/yaoyao'
New-Item -ItemType Directory -Path $output -Force | Out-Null
$cues = @(
    @{ id = 'portrait-ready'; text = '画像已生成'; source = '9.5 A1 逐界面详细需求' },
    @{ id = 'training-passed'; text = '全体科目达标'; source = '9.5 A3 逐界面详细需求' }
)
$speaker = New-Object System.Speech.Synthesis.SpeechSynthesizer
try {
    $speaker.SelectVoice('Microsoft Yaoyao')
    $speaker.Rate = 0
    $speaker.Volume = 90
    foreach ($cue in $cues) {
        $speaker.SetOutputToWaveFile((Join-Path $output ($cue.id + '.wav')))
        $speaker.Speak([string]$cue.text)
        $speaker.SetOutputToNull()
    }
} finally {
    $speaker.Dispose()
}
@{ voice = 'Microsoft Yaoyao'; playbackRate = 1.1; cues = $cues } |
    ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $output 'manifest.json') -Encoding UTF8
Get-ChildItem -LiteralPath $output -Filter '*.wav' | Select-Object Name, Length
