# API Performance Test Script
$results = @()

Write-Host "`n=== API Performance Test ===`n" -ForegroundColor Cyan

# Test 1: List Products (without skipCount)
Write-Host "1. Testing /api/products (limit=10, no skipCount)..." -ForegroundColor Yellow
$start = Get-Date
try {
    $response = Invoke-RestMethod -Uri "http://localhost:5000/api/products?limit=10" -Method Get
    $duration = (Get-Date) - $start
    $results += [PSCustomObject]@{
        Endpoint = "GET /api/products (limit=10)"
        Duration = "$($duration.TotalMilliseconds)ms"
        Status = "Success"
        Count = $response.data.Count
    }
    Write-Host "   ✓ Completed in $($duration.TotalMilliseconds)ms" -ForegroundColor Green
} catch {
    Write-Host "   ✗ Failed: $_" -ForegroundColor Red
}

# Test 2: List Products (with skipCount)
Write-Host "2. Testing /api/products (limit=10, skipCount=true)..." -ForegroundColor Yellow
$start = Get-Date
try {
    $response = Invoke-RestMethod -Uri "http://localhost:5000/api/products?limit=10&skipCount=true" -Method Get
    $duration = (Get-Date) - $start
    $results += [PSCustomObject]@{
        Endpoint = "GET /api/products (skipCount=true)"
        Duration = "$($duration.TotalMilliseconds)ms"
        Status = "Success"
        Count = $response.data.Count
    }
    Write-Host "   ✓ Completed in $($duration.TotalMilliseconds)ms" -ForegroundColor Green
} catch {
    Write-Host "   ✗ Failed: $_" -ForegroundColor Red
}

# Test 3: Get Single Product
Write-Host "3. Testing /api/products/{handle}..." -ForegroundColor Yellow
$start = Get-Date
try {
    $listResponse = Invoke-RestMethod -Uri "http://localhost:5000/api/products?limit=1" -Method Get
    $handle = $listResponse.data[0].handle
    $response = Invoke-RestMethod -Uri "http://localhost:5000/api/products/$handle" -Method Get
    $duration = (Get-Date) - $start
    $hasMetafields = $response.data.metafields -ne $null
    $hasBundleMetafield = $false
    if ($hasMetafields) {
        $hasBundleMetafield = $response.data.metafields | Where-Object { $_.key -eq 'combo_items' -or $_.key -eq 'bundle_items' }
    }
    $results += [PSCustomObject]@{
        Endpoint = "GET /api/products/$handle"
        Duration = "$($duration.TotalMilliseconds)ms"
        Status = "Success"
        HasMetafields = $hasMetafields
        HasBundleMetafield = ($hasBundleMetafield -ne $null)
    }
    Write-Host "   ✓ Completed in $($duration.TotalMilliseconds)ms" -ForegroundColor Green
    Write-Host "   - Metafields: $hasMetafields, Bundle Metafield: $($hasBundleMetafield -ne $null)" -ForegroundColor Gray
} catch {
    Write-Host "   ✗ Failed: $_" -ForegroundColor Red
}

# Test 4: List Collections
Write-Host "4. Testing /api/collections (limit=5)..." -ForegroundColor Yellow
$start = Get-Date
try {
    $response = Invoke-RestMethod -Uri "http://localhost:5000/api/collections?limit=5" -Method Get
    $duration = (Get-Date) - $start
    $results += [PSCustomObject]@{
        Endpoint = "GET /api/collections (limit=5)"
        Duration = "$($duration.TotalMilliseconds)ms"
        Status = "Success"
        Count = $response.data.Count
    }
    Write-Host "   ✓ Completed in $($duration.TotalMilliseconds)ms" -ForegroundColor Green
} catch {
    Write-Host "   ✗ Failed: $_" -ForegroundColor Red
}

# Test 5: Large Product List
Write-Host "5. Testing /api/products (limit=50)..." -ForegroundColor Yellow
$start = Get-Date
try {
    $response = Invoke-RestMethod -Uri "http://localhost:5000/api/products?limit=50" -Method Get
    $duration = (Get-Date) - $start
    $results += [PSCustomObject]@{
        Endpoint = "GET /api/products (limit=50)"
        Duration = "$($duration.TotalMilliseconds)ms"
        Status = "Success"
        Count = $response.data.Count
    }
    Write-Host "   ✓ Completed in $($duration.TotalMilliseconds)ms" -ForegroundColor Green
} catch {
    Write-Host "   ✗ Failed: $_" -ForegroundColor Red
}

Write-Host "`n=== Performance Summary ===`n" -ForegroundColor Cyan
$results | Format-Table -AutoSize

Write-Host "`n=== Recommendations ===`n" -ForegroundColor Cyan
$slowEndpoints = $results | Where-Object { [double]($_.Duration -replace 'ms','') -gt 500 }
if ($slowEndpoints) {
    Write-Host "⚠ Slow endpoints detected (>500ms):" -ForegroundColor Yellow
    $slowEndpoints | ForEach-Object {
        Write-Host "  - $($_.Endpoint): $($_.Duration)" -ForegroundColor Yellow
    }
} else {
    Write-Host "✓ All endpoints performing well (<500ms)" -ForegroundColor Green
}
