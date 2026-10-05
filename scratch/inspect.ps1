$content = Get-Content 'c:\Users\ACER\Documents\GitHub\DIEM_DANH\supabase\schema.sql' -Raw -Encoding UTF8
$lines = $content -split "`n"
Write-Host "=== raw_user_meta_data occurrences ==="
for ($i = 0; $i -lt $lines.Count; $i++) {
    if ($lines[$i] -match "raw_user_meta_data") {
        Write-Host "Line $($i+1): $($lines[$i].Trim())"
    }
}
Write-Host "=== grant execute occurrences ==="
for ($i = 0; $i -lt $lines.Count; $i++) {
    if ($lines[$i] -match "grant execute on function") {
        Write-Host "Line $($i+1): $($lines[$i].Trim())"
    }
}
Write-Host "=== is_admin() usage ==="
for ($i = 0; $i -lt $lines.Count; $i++) {
    if ($lines[$i] -match "is_admin" -and $lines[$i] -notmatch "create or replace function public.is_admin") {
        Write-Host "Line $($i+1): $($lines[$i].Trim())"
    }
}
