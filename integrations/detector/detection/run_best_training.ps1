$ErrorActionPreference = "Stop"

$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$python = Join-Path $root ".train-venv\Scripts\python.exe"
$runs = Join-Path $root "runs\detect"

Set-Location $root

$actionRun = Join-Path $runs "action_final_300"
New-Item -ItemType Directory -Force -Path $actionRun | Out-Null
& $python detection\train_action.py `
    --data datasets\actions\action_data.yaml `
    --model ..\runs\detect\action300\weights\best.pt `
    --epochs 300 --batch 32 --imgsz 640 --device 0 --workers 4 --amp `
    --patience 80 --cache disk --name action_final_300 `
    > (Join-Path $actionRun "train.stdout.log") `
    2> (Join-Path $actionRun "train.stderr.log")
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$personRun = Join-Path $runs "person_full_100"
New-Item -ItemType Directory -Force -Path $personRun | Out-Null
& $python detection\train_action.py `
    --data datasets\person_full\person_data.yaml `
    --model ..\runs\detect\action_person_full_bg_100\weights\best.pt `
    --epochs 100 --batch 24 --imgsz 640 --device 0 --workers 0 --amp `
    --patience 30 --name person_full_100 `
    > (Join-Path $personRun "train.stdout.log") `
    2> (Join-Path $personRun "train.stderr.log")
exit $LASTEXITCODE
