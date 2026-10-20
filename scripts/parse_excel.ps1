Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::OpenRead((Resolve-Path "Dieta.xlsx"))
$stringsEntry = $zip.GetEntry("xl/sharedStrings.xml")
$reader = New-Object System.IO.StreamReader($stringsEntry.Open())
$xml = [xml]$reader.ReadToEnd()
$reader.Close()

$strings = @()
foreach ($si in $xml.sst.si) {
    $strings += $si.t
}

$sheetEntry = $zip.GetEntry("xl/worksheets/sheet1.xml")
$reader = New-Object System.IO.StreamReader($sheetEntry.Open())
$sheetXml = [xml]$reader.ReadToEnd()
$reader.Close()
$zip.Dispose()

foreach ($row in $sheetXml.worksheet.sheetData.row) {
    $rowVals = @()
    foreach ($c in $row.c) {
        $val = $c.v
        if ($c.t -eq "s") {
            $val = $strings[[int]$val]
        }
        $rowVals += "$($c.r): $val"
    }
    Write-Output ($rowVals -join " | ")
}
