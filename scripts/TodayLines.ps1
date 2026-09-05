git log --since="midnight" --pretty=tformat: --numstat | Select-String '^\d' | ForEach-Object {
    $fields = $_.Line -split '\s+'
    $global:add += [int]$fields[0]
    $global:del += [int]$fields[1]
}
Write-Host "Added lines: $add"
Write-Host "Deleted lines: $del"
