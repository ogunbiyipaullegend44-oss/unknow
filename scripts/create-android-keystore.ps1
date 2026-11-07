$ErrorActionPreference = 'Stop'

$signingDirectory = Join-Path $env:USERPROFILE 'Brinfolynk\signing'
$keystorePath = Join-Path $signingDirectory 'brinfolynk-upload.p12'
$credentialsPath = Join-Path $signingDirectory 'android-signing.xml'
$keyAlias = 'brinfolynk'
$keytoolCandidates = @(
  (Join-Path $env:ProgramFiles 'Android\Android Studio\jbr\bin\keytool.exe'),
  (Join-Path $env:LOCALAPPDATA 'Programs\Android Studio\jbr\bin\keytool.exe')
)
$keytool = $keytoolCandidates | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } | Select-Object -First 1

if (-not $keytool) {
  throw 'Android Studio Java/keytool was not found. Finish installing Android Studio, then run this script again.'
}
if ((Test-Path -LiteralPath $keystorePath) -or (Test-Path -LiteralPath $credentialsPath)) {
  throw "Signing data already exists in $signingDirectory. It will not be overwritten; keep using that keystore for app updates."
}

New-Item -ItemType Directory -Path $signingDirectory -Force | Out-Null
$randomBytes = New-Object byte[] 32
$randomGenerator = [System.Security.Cryptography.RandomNumberGenerator]::Create()
try {
  $randomGenerator.GetBytes($randomBytes)
} finally {
  $randomGenerator.Dispose()
}
$password = [BitConverter]::ToString($randomBytes).Replace('-', '')
[Array]::Clear($randomBytes, 0, $randomBytes.Length)

try {
  $env:BRINFOLYNK_SIGNING_PASSWORD = $password
  & $keytool `
    -genkeypair `
    -v `
    -keystore $keystorePath `
    -storetype PKCS12 `
    -storepass:env BRINFOLYNK_SIGNING_PASSWORD `
    -keypass:env BRINFOLYNK_SIGNING_PASSWORD `
    -alias $keyAlias `
    -keyalg RSA `
    -keysize 3072 `
    -validity 10000 `
    -dname 'CN=Brinfolynk, OU=Mobile, O=Brinfolynk, C=US'
  if ($LASTEXITCODE -ne 0) {
    throw "Android keystore generation failed with exit code $LASTEXITCODE."
  }

  [pscustomobject]@{
    KeystorePath = $keystorePath
    KeyAlias = $keyAlias
    Password = ConvertTo-SecureString -String $password -AsPlainText -Force
  } | Export-Clixml -LiteralPath $credentialsPath
} finally {
  Remove-Item Env:BRINFOLYNK_SIGNING_PASSWORD -ErrorAction SilentlyContinue
  $password = $null
}

Write-Output "Created the Brinfolynk release keystore: $keystorePath"
Write-Output "Windows-protected signing credentials: $credentialsPath"
Write-Warning 'Back up the .p12 keystore and encrypted credentials together in a secure location. Do not lose this signing key.'
