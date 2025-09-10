param(
    [Parameter(Mandatory=$true)]
    [string]$Schema,
    [Parameter(Mandatory=$true)]
    [string]$Dir
)

$fail = 0
Get-ChildItem -Path "$Dir\*.json" | ForEach-Object {
    $result = npx ajv validate -c ajv-formats -s $Schema -d $_.FullName --strict=true 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "❌ NEGATIVE passed unexpectedly: $($_.Name)" -ForegroundColor Red
        $fail = 1
    } else {
        Write-Host "✅ Expected failure: $($_.Name)" -ForegroundColor Green
    }
}
exit $fail
