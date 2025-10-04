$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$wb = $excel.Workbooks.Open("$PSScriptRoot\data\Region_Pokedex_Info.xlsx")
$ws = $wb.Worksheets.Item(1)

for ($i = 1; $i -le [Math]::Min(150, $ws.UsedRange.Rows.Count); $i++) {
    $row = @()
    for ($j = 1; $j -le $ws.UsedRange.Columns.Count; $j++) {
        $val = $ws.Cells.Item($i, $j).Text
        $row += $val
    }
    Write-Host "$i`: $($row -join '|')"
}

$wb.Close($false)
$excel.Quit()
[System.Runtime.Interopservices.Marshal]::ReleaseComObject($excel) | Out-Null
