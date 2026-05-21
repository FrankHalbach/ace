# Demo-Deployment auf Azure Container Apps

**Status**: aktiv für Vorstands-Demo
**Datum**: 2026-05-21
**Auslaufdatum Trial-Credits**: 2026-05-27 (~170€ Free-Trial-Guthaben)

Schritt-für-Schritt-Anleitung für ein Demo-Deployment auf Azure Container Apps
im Frankfurt-Datacenter, finanziert aus 30-Tage-Trial-Credits. Ziel: in 2-3
Stunden steht die App unter einer Azure-Subdomain bereit, der Vorstand und
ausgewählte Trainer können sie nutzen, ohne dass eine Vereinsdomain oder ein
produktiver Mail-Provider eingerichtet sein muss.

**Migrations-Pfad zum 27.05.** ist in [§9](#9-was-am-2705-passiert)
beschrieben.

## 0. Voraussetzungen

| Tool | Installiert? | Installation |
|---|---|---|
| Azure CLI (`az`) | für alle Cloud-Befehle | `winget install -e --id Microsoft.AzureCLI` |
| ein Gmail-Account (z. B. `ace.tennis.demo@gmail.com`) mit App-Password | für Magic-Link-Mails | Setup siehe [§2.3](#23-gmail-app-password) |
| Azure-Subscription mit Free-Trial-Credits | für Hosting | `az login` schon erfolgreich? |

**Kein lokales Docker nötig.** Der Image-Build läuft in Azure Container
Registry Tasks (`az acr build`) — das Dockerfile und der Quellcode werden zu
ACR hochgeladen, gebaut, direkt gepusht. Spart Docker-Desktop-Installation auf
dem Entwickler-Rechner (Corp-IT-Probleme entfallen) und nutzt schnellere
Azure-Datacenter-CPUs. Free-Tier-ACR (Basic) enthält 60 Build-Minuten pro
Monat — für die Demo locker ausreichend.

Nach `az login` einmal kontrollieren, dass die richtige Subscription aktiv ist:

```powershell
az account show --query "{name:name, id:id, state:state}" -o table
az account list --query "[].{name:name, isDefault:isDefault}" -o table
# falls falsche aktiv:
# az account set --subscription "<Name oder ID>"
```

## 1. Variablen für die Session

Damit die folgenden Befehle copy-paste-freundlich bleiben, einmal die Namen
und Region setzen. Alles im EU-Frankfurt-Datacenter:

```powershell
$RG = "ace-demo-rg"
$LOC = "germanywestcentral"
$ACR = "acedemoregistry$(Get-Random -Maximum 9999)"   # ACR-Name muss global unique sein
$STG = "acedemostorage$(Get-Random -Maximum 9999)"   # Storage-Account-Name muss global unique sein
$SHARE = "ace-data"
$ENV = "ace-demo-env"
$APP = "ace"
```

ACR- und Storage-Namen müssen global eindeutig sein, daher das `$(Get-Random)`-
Suffix. Ergebnis einmal merken (`$ACR`, `$STG`), wir referenzieren sie überall.

## 2. Resource Group, Storage, Registry

### 2.1 Resource Group

```powershell
az group create --name $RG --location $LOC
```

### 2.2 Storage Account + File Share für SQLite

Die SQLite-Datei lebt auf einem Azure-Files-Share, der ins Container-FS
gemounted wird. So überlebt sie Container-Restart und Image-Updates.

```powershell
az storage account create `
  --name $STG `
  --resource-group $RG `
  --location $LOC `
  --sku Standard_LRS `
  --kind StorageV2

# Share anlegen, 5 GB Quote reicht für die Demo
az storage share-rm create `
  --resource-group $RG `
  --storage-account $STG `
  --name $SHARE `
  --quota 5

# Connection-Key für späteren Container-App-Mount
$STG_KEY = az storage account keys list `
  --account-name $STG `
  --resource-group $RG `
  --query "[0].value" -o tsv
```

### 2.3 Gmail App-Password

(parallel zu Azure-Setup, falls noch nicht erledigt)

1. **Account anlegen** unter https://accounts.google.com/signup
   - vorgeschlagener Name: `ace.tennis.demo@gmail.com`
2. **2-Faktor-Auth aktivieren**: https://myaccount.google.com/signinoptions/twosv
3. **App-Password generieren**: https://myaccount.google.com/apppasswords
   - App-Name: „ace-azure-demo"
   - Google zeigt 16-Zeichen-Passwort, einmalig kopierbar
4. **Display-Name setzen**: Gmail → Einstellungen → „Konten und Import" → „Daten
   senden als" → Anzeigename: „ace · Demo"

Das App-Password später als Azure Container App Secret hinterlegen
(siehe [§5](#5-secrets-setzen)).

### 2.4 Azure Container Registry

```powershell
az acr create `
  --name $ACR `
  --resource-group $RG `
  --sku Basic `
  --admin-enabled true

# Login lokal vorbereiten
az acr login --name $ACR
```

## 3. Image bauen und pushen — über GitHub Actions

ACR Tasks (`az acr build`) sind für viele Free-Trial-Subscriptions standardmäßig
**deaktiviert** (Anti-Abuse-Maßnahme gegen Krypto-Mining). Bei diesem Setup
trifft das zu — daher bauen wir das Image im GitHub-Actions-Runner und pushen
ins ACR. Vorteile: dein Laptop muss kein Docker installiert haben, der Build
läuft auf Linux (kein Windows-MAX_PATH-Problem), und nach dem Setup ist jedes
zukünftige `git push origin master` automatisch ein Deploy.

Workflow-Definition liegt unter
[`.github/workflows/deploy-azure.yml`](../../.github/workflows/deploy-azure.yml).
Setup-Schritte für das einmalige Azure-↔-GitHub-Auth-Pairing in §11.

Nach erfolgreichem Setup wird der erste Build automatisch durch den
Workflow-Trigger beim Push ausgelöst. Du kannst ihn auch manuell starten:
GitHub → Actions → "deploy-azure" → "Run workflow" → Branch `master`.

Beim ersten Lauf existiert die Container App noch nicht — der Workflow baut
das Image, pusht ins ACR und überspringt den Update-Step mit einer Hinweis-
Meldung. Danach in §4.4 die Container App mit dem gerade gepushten Image
anlegen. Ab dem zweiten Push macht der Workflow Build + Push + Update
automatisch in einem Rutsch.

## 4. Container Apps Environment + App

### 4.1 Environment

```powershell
az containerapp env create `
  --name $ENV `
  --resource-group $RG `
  --location $LOC
```

### 4.2 Azure-Files-Storage als Volume registrieren

```powershell
az containerapp env storage set `
  --name $ENV `
  --resource-group $RG `
  --storage-name ace-files `
  --azure-file-account-name $STG `
  --azure-file-account-key $STG_KEY `
  --azure-file-share-name $SHARE `
  --access-mode ReadWrite
```

### 4.3 Container-App-Definition als YAML

Container Apps unterstützen Volume-Mounts nur per YAML, nicht per
CLI-Parameter. Datei `azure-containerapp.yaml` im Repo-Root anlegen:

```yaml
location: germanywestcentral
properties:
  managedEnvironmentId: <wird per CLI ersetzt>
  configuration:
    ingress:
      external: true
      targetPort: 3000
      transport: auto
    secrets:
      # Werte werden via `az containerapp secret set` befüllt (siehe §5)
      - name: session-password
      - name: smtp-pass
    registries:
      - server: <wird per CLI ersetzt>
        username: <wird per CLI ersetzt>
        passwordSecretRef: registry-password
  template:
    containers:
      - image: <wird per CLI ersetzt>
        name: ace
        resources:
          cpu: 0.5
          memory: 1.0Gi
        env:
          - name: NUXT_SESSION_PASSWORD
            secretRef: session-password
          - name: NUXT_PUBLIC_BASE_URL
            value: <FQDN nach erstem Deploy nachpflegen>
          - name: NUXT_AUTH_MAGIC_LINK_LIMIT_PER_HOUR
            value: "10"
          - name: NUXT_SMTP_HOST
            value: smtp.gmail.com
          - name: NUXT_SMTP_PORT
            value: "587"
          - name: NUXT_SMTP_SECURE
            value: "false"
          - name: NUXT_SMTP_USER
            value: ace.tennis.demo@gmail.com
          - name: NUXT_SMTP_PASS
            secretRef: smtp-pass
          - name: NUXT_MAIL_FROM
            value: "ace · Demo <ace.tennis.demo@gmail.com>"
        volumeMounts:
          - volumeName: ace-data
            mountPath: /data
    scale:
      minReplicas: 1
      maxReplicas: 1
    volumes:
      - name: ace-data
        storageType: AzureFile
        storageName: ace-files
```

**Wichtig zu `minReplicas: 1` und `maxReplicas: 1`**: SQLite mag genau einen
Writer. Scale-to-zero (`minReplicas: 0`) ist möglich und spart Geld bei
inaktiver Demo, hat aber Cold-Start (~3 Sekunden). Für eine Live-Demo vor dem
Vorstand `minReplicas: 1` lassen, danach ggf. auf 0 stellen.

### 4.4 Erste App-Erstellung über `az containerapp create`

Statt YAML-Datei manuell editieren ist es einfacher, die App erst per CLI zu
erstellen und dann die Volume-Mount-Felder per `az containerapp update`
nachzuziehen.

```powershell
# Session-Password vorgenerieren
$SESSION_PW = (& openssl rand -base64 32).Trim()

# ACR-Login-Server und -Credentials einsammeln
$ACR_SERVER = "$ACR.azurecr.io"
$ACR_USER = az acr credential show --name $ACR --query username -o tsv
$ACR_PW = az acr credential show --name $ACR --query "passwords[0].value" -o tsv

# App initial erstellen
az containerapp create `
  --name $APP `
  --resource-group $RG `
  --environment $ENV `
  --image $IMAGE `
  --target-port 3000 `
  --ingress external `
  --min-replicas 1 `
  --max-replicas 1 `
  --cpu 0.5 --memory 1.0Gi `
  --registry-server $ACR_SERVER `
  --registry-username $ACR_USER `
  --registry-password $ACR_PW `
  --secrets `
    "session-password=$SESSION_PW" `
    "smtp-pass=<DEIN-16-ZEICHEN-APP-PASSWORD>" `
  --env-vars `
    "NUXT_SESSION_PASSWORD=secretref:session-password" `
    "NUXT_AUTH_MAGIC_LINK_LIMIT_PER_HOUR=10" `
    "NUXT_SMTP_HOST=smtp.gmail.com" `
    "NUXT_SMTP_PORT=587" `
    "NUXT_SMTP_SECURE=false" `
    "NUXT_SMTP_USER=ace.tennis.demo@gmail.com" `
    "NUXT_SMTP_PASS=secretref:smtp-pass" `
    "NUXT_MAIL_FROM=ace · Demo <ace.tennis.demo@gmail.com>"
```

`<DEIN-16-ZEICHEN-APP-PASSWORD>` durch das Gmail-App-Password aus §2.3
ersetzen — direkt im PowerShell-Befehl, nicht in eine Datei.

### 4.5 FQDN ermitteln und als Base-URL nachziehen

Die öffentliche URL kennt Azure erst, nachdem die App existiert. Jetzt:

```powershell
$FQDN = az containerapp show `
  --name $APP `
  --resource-group $RG `
  --query "properties.configuration.ingress.fqdn" -o tsv

$BASE = "https://$FQDN"
Write-Host "Demo-URL: $BASE"

az containerapp update `
  --name $APP `
  --resource-group $RG `
  --set-env-vars "NUXT_PUBLIC_BASE_URL=$BASE"
```

### 4.6 Azure-Files-Volume nachträglich mounten

`az containerapp create` kann Volume-Mounts (Stand Mai 2026) noch nicht direkt
setzen. Daher YAML-Patch:

```powershell
# Aktuelle Config exportieren
az containerapp show `
  --name $APP `
  --resource-group $RG `
  -o yaml > current.yaml

# Manuell in current.yaml unter properties.template:
#
#   containers:
#     - ... (bestehend) ...
#       volumeMounts:
#         - volumeName: ace-data
#           mountPath: /data
#   volumes:
#     - name: ace-data
#       storageType: AzureFile
#       storageName: ace-files
#
# einfügen und speichern.

az containerapp update `
  --name $APP `
  --resource-group $RG `
  --yaml current.yaml
```

## 5. Secrets setzen

Bereits in [§4.4](#44-erste-app-erstellung-über-az-containerapp-create)
geschehen. Falls man später Werte ändern muss:

```powershell
az containerapp secret set `
  --name $APP `
  --resource-group $RG `
  --secrets "smtp-pass=<NEUES-PASSWORD>"

# Anschließend Revision triggern, damit die App neu lädt:
az containerapp revision restart `
  --name $APP `
  --resource-group $RG `
  --revision $(az containerapp show --name $APP --resource-group $RG --query "properties.latestRevisionName" -o tsv)
```

## 6. Initial-Admin anlegen

Migrations laufen beim Server-Start automatisch (siehe
[`server/plugins/db-migrate.ts`](../../server/plugins/db-migrate.ts)). Die DB
ist nach erstem Start leer — Initial-Admin per Container-Exec einspielen:

```powershell
az containerapp exec `
  --name $APP `
  --resource-group $RG `
  --command sh

# Inside container, dann:
node -e "
  const Database = require('better-sqlite3');
  const db = new Database(process.env.NUXT_DB_PATH);
  const id = require('crypto').randomBytes(12).toString('hex');
  db.prepare(\`
    INSERT INTO member (id, email, first_name, last_name, birth_year, gender, dtb_lk, status, roles)
    VALUES (?, ?, 'Frank', 'Halbach', 1980, 'm', 25.0, 'aktiv', json_array('player','admin'))
  \`).run(id, 'frank.halbach@gmail.com');
  console.log('Admin angelegt:', id);
"

exit
```

Email anpassen (deine eigene Login-Adresse). Danach auf
`https://<FQDN>/login` mit dieser Adresse einloggen — der Magic-Link kommt
per Gmail an dich.

## 7. Cost-Alert

Damit eine fehlerhafte Konfiguration nicht Credits in Stunden verbrennt:

```powershell
$SUB_ID = az account show --query id -o tsv

az consumption budget create `
  --budget-name "ace-demo-50eur" `
  --category Cost `
  --amount 50 `
  --time-grain Monthly `
  --start-date $(Get-Date -Format yyyy-MM-01) `
  --end-date $(Get-Date -Date "2027-01-01" -Format yyyy-MM-dd) `
  --notifications-enabled `
  --threshold 80 `
  --contact-emails frank.halbach@gmail.com `
  --resource-group $RG
```

50€-Budget mit Alert bei 80 % = 40€. Bei einer Trial-Subscription mit 170€
Restguthaben heißt das: Mail kommt rechtzeitig, bevor Credits aufgebraucht
sind.

## 8. Verifikation

```powershell
# Logs streamen — Magic-Link-Stubs erscheinen hier, falls SMTP mal nicht klappt
az containerapp logs show `
  --name $APP `
  --resource-group $RG `
  --follow

# Health-Check
curl -s -o /dev/null -w "%{http_code}`n" "https://$FQDN/"
# erwartet: 200 oder 302 (Auth-Redirect)
```

**Smoke-Tests vor Vorstands-Demo:**

- [ ] `/login` öffnet sauber, Editorial-Hero rendert
- [ ] Magic-Link-Mail kommt an `frank.halbach@gmail.com` *nicht im Spam*
- [ ] Klick auf Magic-Link → eingeloggt
- [ ] `/admin/members` zeigt 1 Mitglied (= dich selbst)
- [ ] Eine zweite Test-Email-Adresse einladen, Mail kommt an
- [ ] Test-Login mit der eingeladenen Adresse erfolgreich
- [ ] Challenge zwischen den beiden Accounts anlegen, Notification-Mail kommt an

## 9. Was am 27.05. passiert

Das Free-Trial-Guthaben läuft am 2026-05-27 ab. Drei Optionen, geordnet
nach Aufwand:

### Option A — Subscription auf Pay-As-You-Go upgraden

Im Azure-Portal: `Subscriptions → [Trial] → Upgrade`. Kreditkarte
hinterlegen, gleicher Stack läuft weiter. Erwartet ~10 €/Monat für die
Container-App.

### Option B — Container-Image zu Hetzner ziehen

Das Image ist plattformneutral. Auf einem Hetzner CX22 (~4 €/Monat):

1. **Hetzner-VM** mit Docker + Caddy bereitstellen (Docker läuft auf Linux
   ohne IT-Restriktion, anders als auf dem Entwickler-Laptop)
2. **Image transferieren** — zwei Wege:
   - **Vor Trial-Ende** das fertige Image aus ACR pullen:
     `docker login $ACR.azurecr.io -u $ACR_USER -p $ACR_PW && docker pull $IMAGE`,
     dann via `docker save | ssh hetzner docker load` rüberziehen
   - **Auf Hetzner direkt bauen** mit `git clone` + `docker build` — kein
     Azure mehr nötig, dauert ~5 min auf der CX22
3. **SQLite-File exportieren** von Azure Files:
   `az storage file download --share-name ace-data --path ace.db
   --account-name $STG --dest ace.db`,
   dann via `scp` auf den Hetzner-Server in das Daten-Volume
4. **Caddy als TLS-Reverse-Proxy** vor den Container schalten, Volume auf
   `/var/lib/ace` mounten, Container starten
5. **DNS umlegen** (sobald Domain entschieden)

Diese Migration ist als eigene Operations-Doku
[`docs/operations/hetzner-migration.md`](hetzner-migration.md) zu führen
(folgt separat).

### Option C — Demo abreißen

Wenn die Vorstands-Reaktion „lass uns das in Ruhe diskutieren" war:

```powershell
az group delete --name $RG --yes --no-wait
```

Resource Group löschen entfernt alle Ressourcen. SQLite-Daten gehen weg.
Vorher Backup nach lokal sichern (siehe Option B Schritt 3), falls man später
mit denselben Test-Daten weitermachen möchte.

## 10. Bekannte Stolpersteine

- **Gmail blockt neue Geräte-Logins**: Bei den ersten Sendeversuchen aus
  Azure-Frankfurt-IP kommt evtl. eine „neue Anmeldung blockiert"-Mail. Einmal
  auf https://myaccount.google.com/notifications „Ja, das war ich" bestätigen.
- **Azure Files ist langsam**: SQLite-Schreibvorgänge auf Azure Files sind
  spürbar träger als auf lokaler SSD (~5-10× langsamer). Für Demo-Last
  irrelevant, für produktiv mit 500 Mitgliedern OK, für höhere Last muss man
  zu Premium Files wechseln oder zu Hetzner-mit-lokalem-Volume migrieren.
- **Trial-Subscriptions haben Resource-Limits**: max 4 vCPU pro Region. Die
  Standard-Container-App nutzt 0.5 vCPU — passt. Falls eine zweite App
  parallel laufen soll, vorher Limits prüfen.
- **DNS für Custom Domain**: für die Demo nutzen wir die Azure-Subdomain
  (`*.azurecontainerapps.io`), TLS automatisch. Custom Domain käme erst mit
  Vereinsfreigabe (siehe Launch-Checklist §1).
- **Logs sind verzögert**: Container Apps loggt asynchron, die Anzeige in
  `az containerapp logs show` kann 5-30 s nachlaufen. Für die Vorstandsdemo
  ein zweites Terminal-Fenster mit Live-Log offen halten.

## 11. GitHub-Actions-Setup für Image-Build und Auto-Deploy

Einmalige Verkabelung GitHub ↔ Azure über OIDC-Federated-Credentials — keine
langlebigen Service-Principal-Secrets im Repo, GitHub holt sich pro Workflow-
Run einen kurzlebigen Token direkt bei Microsoft Entra. Nach diesem Setup
löst jeder Push auf `master` der relevante Dateien (Dockerfile, app/,
server/, …) automatisch einen Build + Deploy aus.

### 11.1 Variablen aus der Session

```powershell
$SUB_ID = az account show --query id -o tsv
$TENANT_ID = az account show --query tenantId -o tsv
$APP_REG_NAME = "ace-github-deploy"
$GITHUB_REPO = "FrankHalbach/ace"   # owner/repo, nicht die volle URL
```

### 11.2 Service Principal und Federated Credential anlegen

```powershell
# 1. App Registration in Entra ID
az ad app create --display-name $APP_REG_NAME

# App-ID einsammeln (kann ein paar Sekunden dauern, bis die App propagiert ist)
$APP_ID = az ad app list --display-name $APP_REG_NAME --query "[0].appId" -o tsv
Write-Host "App-ID: $APP_ID"

# 2. Service Principal zur App erstellen
az ad sp create --id $APP_ID

# 3. Federated Credential für GitHub master-Branch
# Wichtig: PowerShell-Single-Quote-String, damit die geschweiften JSON-
# Klammern nicht interpretiert werden.
$fedCred = '{"name":"github-master","issuer":"https://token.actions.githubusercontent.com","subject":"repo:' + $GITHUB_REPO + ':ref:refs/heads/master","audiences":["api://AzureADTokenExchange"]}'
az ad app federated-credential create --id $APP_ID --parameters $fedCred

# 4. Zusätzlich für workflow_dispatch (manueller Lauf aus dem GitHub-UI)
$fedCredDispatch = '{"name":"github-workflow-dispatch","issuer":"https://token.actions.githubusercontent.com","subject":"repo:' + $GITHUB_REPO + ':ref:refs/heads/master","audiences":["api://AzureADTokenExchange"]}'
# (Identisch zum master-Branch — workflow_dispatch nutzt den Branch-Subject auch)
```

### 11.3 Role Assignments

```powershell
# Contributor auf die Resource Group — erlaubt containerapp update
az role assignment create `
  --role "Contributor" `
  --assignee $APP_ID `
  --scope "/subscriptions/$SUB_ID/resourceGroups/$RG"

# AcrPush auf das Registry — erlaubt Image-Push
az role assignment create `
  --role "AcrPush" `
  --assignee $APP_ID `
  --scope "/subscriptions/$SUB_ID/resourceGroups/$RG/providers/Microsoft.ContainerRegistry/registries/$ACR"
```

### 11.4 GitHub Repository Secrets setzen

Drei Werte als Repository-Secrets eintragen — entweder im Browser unter
`https://github.com/FrankHalbach/ace/settings/secrets/actions` → "New
repository secret", oder per `gh` CLI:

```powershell
# Werte ausgeben
Write-Host "AZURE_CLIENT_ID = $APP_ID"
Write-Host "AZURE_TENANT_ID = $TENANT_ID"
Write-Host "AZURE_SUBSCRIPTION_ID = $SUB_ID"
```

Im GitHub-UI als drei separate Secrets anlegen mit exakt diesen Namen:

| Secret-Name | Wert |
|---|---|
| `AZURE_CLIENT_ID` | App-ID aus §11.2 |
| `AZURE_TENANT_ID` | aus `az account show --query tenantId` |
| `AZURE_SUBSCRIPTION_ID` | aus `az account show --query id` |

Per `gh` CLI (falls installiert):

```powershell
gh secret set AZURE_CLIENT_ID --body $APP_ID
gh secret set AZURE_TENANT_ID --body $TENANT_ID
gh secret set AZURE_SUBSCRIPTION_ID --body $SUB_ID
```

### 11.5 Ersten Workflow-Lauf auslösen

Der Workflow triggert automatisch bei Push, wir können ihn aber auch manuell
auslösen:

- Browser: `https://github.com/FrankHalbach/ace/actions/workflows/deploy-azure.yml` →
  "Run workflow" → Branch `master` → "Run workflow"
- Oder `gh` CLI:
  ```powershell
  gh workflow run deploy-azure.yml
  ```

Live-Verfolgung des Runs:

```powershell
gh run watch
```

oder im Browser auf der Actions-Seite. Build dauert ~3-5 min beim ersten Lauf
(Native-Compile für `better-sqlite3`, Nuxt-Build, alle Layers neu). Bei
späteren Pushes greift Docker-Layer-Caching nur teilweise (GitHub-Runner ist
ephemeral), aber pnpm-Install-Layer + Node-Image-Layer werden vom ACR
gecached, daher 1-2 min realistisch.

### 11.6 Was der Workflow tut

Pro Run:

1. `actions/checkout` zieht das Repo
2. `azure/login@v2` macht OIDC-Token-Exchange gegen Entra ID
3. `az acr login` mit dem OIDC-Token holt Docker-Auth-Credentials für ACR
4. `docker build` + `docker push` mit Tags `ci-YYYYMMDD-HHMM-<shortsha>` und
   `latest`
5. Falls die Container App `ace` schon existiert: `az containerapp update`
   mit dem neuen Image-Tag — sonst Skip mit Hinweis, dass §4.4 noch zu laufen
   ist

### 11.7 Was beim ersten Workflow-Lauf passiert

Der Workflow baut + pusht das Image, kann aber die Container App noch nicht
updaten, weil sie ja noch gar nicht existiert. Schritt-Output:

```
Container App 'ace' existiert noch nicht — manuell anlegen via az containerapp create (siehe docs/operations/azure-container-apps.md §4.4) mit Image acedemoregistry5928.azurecr.io/ace:ci-...
```

Den Image-Tag aus der Workflow-Log-Zeile kopieren und im PowerShell als
`$IMAGE` setzen, dann §4.4 weiter ausführen. Nach erfolgreicher Container-App-
Anlage löst der nächste Push einen vollständigen End-to-End-Deploy aus.
