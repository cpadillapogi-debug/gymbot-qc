$files = 'dashboard.html','index.html','onboarding.html','owner-dashboard-new.html','pricing.html','widget.html'
foreach ($f in $files) {
    $content = Get-Content $f -Raw
    $content = $content -replace '<script type="module" src="js/main-', "<script src=`"js/api-config.js`"></script>`r`n<script type=`"module`" src=`"js/main-"
    Set-Content $f $content
}