$ErrorActionPreference = 'Stop'
$path = 'D:\xx\Desktop\烟火哨兵——公共安全智能预警与秒级响应系统_去AI味修订版.docx'
$savedPath = 'D:\CICSIC\work\humanizer_plan_20261001\word-final.docx'
$pdf = 'D:\CICSIC\work\humanizer_plan_20261001\qa.pdf'
$word = $null
$document = $null
try {
    $word = New-Object -ComObject Word.Application
    $word.Visible = $false
    $word.DisplayAlerts = 0
    $document = $word.Documents.Open($path, $false, $false)
    foreach ($toc in $document.TablesOfContents) { $toc.Update() }
    $document.Repaginate()
    $document.Fields.Update() | Out-Null
    foreach ($toc in $document.TablesOfContents) { $toc.UpdatePageNumbers() }
    $document.Repaginate()
    $document.SaveAs2($savedPath, 16)
    $document.ExportAsFixedFormat($pdf, 17)
    Write-Output "Pages=$($document.ComputeStatistics(2))"
} finally {
    if ($document) { $document.Close(0); [void][Runtime.InteropServices.Marshal]::ReleaseComObject($document) }
    if ($word) { $word.Quit(); [void][Runtime.InteropServices.Marshal]::ReleaseComObject($word) }
}
Copy-Item -LiteralPath $savedPath -Destination $path -Force
