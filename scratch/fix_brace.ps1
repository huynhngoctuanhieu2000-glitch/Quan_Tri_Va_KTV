$f = 'c:\Users\ADMIN\OneDrive\Desktop\Ngan Ha\Quan_Tri_Va_KTV\app\api\ktv\booking\route.ts'
$c = [System.IO.File]::ReadAllText($f)
$old = "    }" + "`r`n" + "/**"
$new = "    }" + "`r`n" + "}" + "`r`n" + "`r`n" + "/**"
$c = $c.Replace($old, $new)
[System.IO.File]::WriteAllText($f, $c)
Write-Output "Done"
