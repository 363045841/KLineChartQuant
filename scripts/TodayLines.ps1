# 统计当天（本地时区 00:00 起）的提交数、新增行与删除行。
$since = 'midnight'

git log --since=$since --pretty=tformat: --numstat | Select-String '^\d' | ForEach-Object {
    $fields = $_.Line -split '\s+'
    $global:add += [int]$fields[0]
    $global:del += [int]$fields[1]
}

$commits = git rev-list --count --since=$since HEAD

Write-Host "Commits: $commits"
Write-Host "Added lines: $add"
Write-Host "Deleted lines: $del"
