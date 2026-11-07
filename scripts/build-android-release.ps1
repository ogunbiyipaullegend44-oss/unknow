$requiredVariables = @(
  'BRINFOLYNK_KEYSTORE_PATH',
  'BRINFOLYNK_KEYSTORE_PASSWORD',
  'BRINFOLYNK_KEY_ALIAS',
  'BRINFOLYNK_KEY_PASSWORD'
)

if (@($requiredVariables | Where-Object {
  [string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($_))
}).Count -gt 0) {
  $credentialsPath = Join-Path $env:USERPROFILE 'Brinfolynk\signing\android-signing.xml'
  if (Test-Path -LiteralPath $credentialsPath -PathType Leaf) {
    $credentials = Import-Clixml -LiteralPath $credentialsPath
    $securePassword = $credentials.Password
    $password = [System.Net.NetworkCredential]::new('', $securePassword).Password
    $env:BRINFOLYNK_KEYSTORE_PATH = $credentials.KeystorePath
    $env:BRINFOLYNK_KEY_ALIAS = $credentials.KeyAlias
    $env:BRINFOLYNK_KEYSTORE_PASSWORD = $password
    $env:BRINFOLYNK_KEY_PASSWORD = $password
  }
}

$missingVariables = @($requiredVariables | Where-Object {
  [string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($_))
})
if ($missingVariables.Count -gt 0) {
  throw "Signing credentials were not found. Run scripts\create-android-keystore.ps1 or set these variables: $($missingVariables -join ', ')."
}

if (-not (Test-Path -LiteralPath $env:BRINFOLYNK_KEYSTORE_PATH -PathType Leaf)) {
  throw "Android signing keystore not found: $env:BRINFOLYNK_KEYSTORE_PATH"
}

$androidDirectory = Join-Path (Split-Path $PSScriptRoot -Parent) 'android'
$microsoftJdks = @(
  (Join-Path $env:ProgramFiles 'Microsoft'),
  (Join-Path $env:LOCALAPPDATA 'Programs\Microsoft')
) | Where-Object { Test-Path -LiteralPath $_ -PathType Container } | ForEach-Object {
  Get-ChildItem -LiteralPath $_ -Directory -Filter 'jdk-21*' -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty FullName
}
$javaCandidates = @(
  $env:JAVA_HOME
  $microsoftJdks
  (Join-Path $env:ProgramFiles 'Android\Android Studio\jbr'),
  (Join-Path $env:LOCALAPPDATA 'Programs\Android Studio\jbr')
)
$javaHome = $null
foreach ($candidate in ($javaCandidates | Where-Object { $_ } | Select-Object -Unique)) {
  $javaExecutable = Join-Path $candidate 'bin\java.exe'
  if (-not (Test-Path -LiteralPath $javaExecutable -PathType Leaf)) {
    continue
  }
  $javaVersion = (& $javaExecutable -version 2>&1 | Out-String)
  if ($javaVersion -match 'version\s+"?(?<major>\d+)' -and [int]$Matches.major -ge 17 -and [int]$Matches.major -le 24) {
    $javaHome = $candidate
    break
  }
}
if (-not $javaHome) {
  throw 'A compatible Java runtime (version 17-24) was not found. Install Microsoft OpenJDK 21 or set JAVA_HOME to a supported JDK.'
}
$env:JAVA_HOME = $javaHome
$env:PATH = (Join-Path $javaHome 'bin') + [IO.Path]::PathSeparator + $env:PATH

$sdkCandidates = @(
  $env:ANDROID_HOME,
  $env:ANDROID_SDK_ROOT,
  (Join-Path $env:LOCALAPPDATA 'Android\Sdk')
) | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }
$sdkRoot = $sdkCandidates | Where-Object {
  Test-Path -LiteralPath (Join-Path $_ 'platforms\android-36\android.jar') -PathType Leaf
} | Select-Object -First 1
if (-not $sdkRoot) {
  throw 'Android SDK Platform 36 is not installed. Open Android Studio, select Tools > SDK Manager, install Android SDK Platform 36 and Android SDK Build-Tools 36.0.0, then retry.'
}
$env:ANDROID_HOME = $sdkRoot
$env:ANDROID_SDK_ROOT = $sdkRoot

Push-Location $androidDirectory
try {
  & .\gradlew.bat assembleRelease bundleRelease
  if ($LASTEXITCODE -ne 0) {
    throw "Android release build failed with exit code $LASTEXITCODE."
  }
} finally {
  Pop-Location
  Remove-Item Env:BRINFOLYNK_KEYSTORE_PASSWORD -ErrorAction SilentlyContinue
  Remove-Item Env:BRINFOLYNK_KEY_PASSWORD -ErrorAction SilentlyContinue
}

Write-Output 'Signed Android artifacts:'
Write-Output '  android\app\build\outputs\apk\release\app-release.apk'
Write-Output '  android\app\build\outputs\bundle\release\app-release.aab'
