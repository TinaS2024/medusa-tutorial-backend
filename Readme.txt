https://docs.medusajs.com/

Ändert E-Mail und Passwort von Admin:
npx medusa user -e some@email.com -p somepassword

Datenbank migrieren: npx medusa db:migrate funktioniert nur im backend
Datenbank-Passwort in pgAdmin4: D04M08K19U97B

Admin_Website unter http://localhost:9000/app/settings/regions/reg_01JSKE5XT2JJ08WHQB0Z899SM1
Store_Website unter http://localhost:8000/de/store

CTRL+F5 im Browser verwenden für Frontend-Aktualisierung

Erweiterungen: https://docs.medusajs.com/resources/recipes

BundleProducts ->https://docs.medusajs.com/resources/recipes/bundled-products/examples/standard

Wichtig: 
- Nach Erstellen oder Löschen eines Bundles muss der .next Ordner im Frontend gelöscht werden für das Leeren des Cache
- Das Frontend und Backend kann man nun im Ordner Medusa gemeinsam starten mit npm run dev

