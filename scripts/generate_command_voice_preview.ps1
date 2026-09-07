$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech
$root = Split-Path -Parent $PSScriptRoot
$config = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'command-voice-preview.json') -Encoding UTF8 -Raw | ConvertFrom-Json
$output = Join-Path $root 'apps\dashboard\public\command\voice-preview'
New-Item -ItemType Directory -Path $output -Force | Out-Null
$voices = @(
    @{ Id = 'huihui'; Name = 'Microsoft Huihui Desktop' },
    @{ Id = 'yaoyao'; Name = 'Microsoft Yaoyao' }
)
$records = @()
foreach ($voice in $voices) {
    $speaker = New-Object System.Speech.Synthesis.SpeechSynthesizer
    try {
        $speaker.SelectVoice($voice.Name)
        $speaker.Rate = 0
        $speaker.Volume = 90
        $directory = Join-Path $output $voice.Id
        New-Item -ItemType Directory -Path $directory -Force | Out-Null
        foreach ($cue in $config.cues) {
            $path = Join-Path $directory ($cue.id + '.wav')
            $speaker.SetOutputToWaveFile($path)
            $speaker.Speak([string]$cue.text)
            $speaker.SetOutputToNull()
            $records += @{ voice = $voice.Name; cue = $cue.id; text = $cue.text; file = "$($voice.Id)/$($cue.id).wav" }
        }
        $preview = New-Object System.Speech.Synthesis.PromptBuilder([System.Globalization.CultureInfo]::GetCultureInfo('zh-CN'))
        foreach ($id in $config.previewCueIds) {
            $cue = $config.cues | Where-Object id -eq $id
            $preview.AppendText([string]$cue.text)
            $preview.AppendBreak([TimeSpan]::FromMilliseconds(650))
        }
        $speaker.SetOutputToWaveFile((Join-Path $output ($voice.Id + '-preview.wav')))
        $speaker.Speak($preview)
        $speaker.SetOutputToNull()
    } finally {
        $speaker.Dispose()
    }
}
@{
    generatedAt = (Get-Date).ToString('o')
    source = $config.source
    status = 'preview-only; not wired to workflow'
    rate = 0
    volume = 90
    clips = $records
} | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $output 'manifest.json') -Encoding UTF8
Get-ChildItem -LiteralPath $output -Recurse -Filter '*.wav' | Select-Object FullName, Length
