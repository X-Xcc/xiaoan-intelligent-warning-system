$ErrorActionPreference = 'Stop'
$path = 'D:\xx\Desktop\烟火哨兵——公共安全智能预警与秒级响应系统_沿用原封面纸张美化版.docx'
$pdf = [IO.Path]::ChangeExtension($path, '.pdf')
$word = $null
$document = $null
try {
    $word = New-Object -ComObject Word.Application
    $word.Visible = $false
    $word.DisplayAlerts = 0
    $document = $word.Documents.Open($path, $false, $false)
    Write-Output "Opened ReadOnly=$($document.ReadOnly)"
    foreach ($toc in $document.TablesOfContents) { $toc.Update() }
    Write-Output 'TOC updated'
    $document.Repaginate()
    foreach ($toc in $document.TablesOfContents) { $toc.UpdatePageNumbers() }
    $document.Fields.Update() | Out-Null
    Write-Output 'Fields updated'
    $document.Repaginate()
    $savedPath = 'D:\CICSIC\work\document_polish_20261001\verified-restored.docx'
    $document.SaveAs2($savedPath, 16)
    Write-Output 'Saved'
    $document.ExportAsFixedFormat($pdf, 17)
    Write-Output "Pages=$($document.ComputeStatistics(2))"
    Write-Output "PDF=$pdf"
} finally {
    if ($document) { $document.Close(0); [void][Runtime.InteropServices.Marshal]::ReleaseComObject($document) }
    if ($word) { $word.Quit(); [void][Runtime.InteropServices.Marshal]::ReleaseComObject($word) }
}
Copy-Item -LiteralPath $savedPath -Destination $path -Force
