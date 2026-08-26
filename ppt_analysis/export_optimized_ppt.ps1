$ErrorActionPreference = "Stop"

$file = (Get-ChildItem -LiteralPath "D:\xx\Desktop" -Filter "*.pptx" |
    Where-Object { $_.Length -gt 120000000 -and $_.LastWriteTime -gt (Get-Date "2026-08-15T23:35:00") } |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1).FullName
$out = "D:\CICSIC\ppt_analysis\optimized_export"

if (-not $file) {
    throw "Optimized PPT file not found."
}

if (Test-Path -LiteralPath $out) {
    Remove-Item -LiteralPath $out -Recurse -Force
}
New-Item -ItemType Directory -Force -Path $out | Out-Null

$app = New-Object -ComObject PowerPoint.Application
$app.Visible = [Microsoft.Office.Core.MsoTriState]::msoTrue
$pres = $app.Presentations.Open(
    $file,
    [Microsoft.Office.Core.MsoTriState]::msoFalse,
    [Microsoft.Office.Core.MsoTriState]::msoFalse,
    [Microsoft.Office.Core.MsoTriState]::msoFalse
)
$pres.Export($out, "PNG", 1920, 1080)
$count = $pres.Slides.Count
$pres.Close()
$app.Quit()

Write-Output "exported $count slides to $out"
