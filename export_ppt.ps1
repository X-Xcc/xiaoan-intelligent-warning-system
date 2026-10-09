$srcPath = (Get-ChildItem -Path 'D:\xx\Desktop' -Filter '*.pptx' -Recurse | Where-Object { $_.DirectoryName -like '*PPT*' } | Sort-Object Name | Select-Object -First 1).FullName
$pptPath = 'D:\CICSIC\source.pptx'
Copy-Item -LiteralPath $srcPath -Destination $pptPath -Force
$out = 'D:\CICSIC\ppt_render'
New-Item -ItemType Directory -Force -Path $out | Out-Null
Get-ChildItem $out -File -ErrorAction SilentlyContinue | Remove-Item -Force
$pp = New-Object -ComObject PowerPoint.Application
$pp.Visible = $true
$pres = $pp.Presentations.Open($pptPath, 0, 1, 0)
$count = $pres.Slides.Count
$pres.Export($out, 'PNG', 1600, 900)
$pres.Close()
$pp.Quit()
[System.Runtime.InteropServices.Marshal]::ReleaseComObject($pres) | Out-Null
[System.Runtime.InteropServices.Marshal]::ReleaseComObject($pp) | Out-Null
Write-Output "slides=$count"
