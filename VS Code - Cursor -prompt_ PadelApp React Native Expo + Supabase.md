# PadelApp – React Native Expo + Supabase

Rakenna tyhjästä toimiva mobiilisovellus nimeltä **PadelApp** käyttäen:

- React Native
- Expo
- TypeScript
- Expo Router
- Supabase backendina
- Supabase Auth käyttäjien tunnistamiseen
- Supabase PostgreSQL tietokantana
- Supabase Row Level Security (RLS)
- React Native Paper tai muu moderni ja selkeä UI-kirjasto tarvittaessa

Tavoitteena on rakentaa ensimmäinen oikeasti toimiva MVP, ei pelkkää staattista käyttöliittymädemoversiota.

Älä käytä omaa Node/Express-backendia, vaan Supabase toimii backendina.

Sovelluksen nimi on **PadelApp**.

---

# 1. Sovelluksen idea

PadelAppissa käyttäjät voivat liittyä padelsarjoihin.

Sarjaan ilmoittaudutaan joukkueena. Joukkueessa voi olla 2–3 pelaajaa.

Sarjan ilmoittautumisen jälkeen admin voi muodostaa osallistuneista joukkueista lohkoja.

Sovelluksessa on neljä päävälilehteä:

1. Koti
2. Tulostaulukko
3. Osallistuminen
4. Info

Ennen kirjautumista käyttäjälle näytetään:

- Kirjautuminen
- Tilin luominen

---

# 2. Tekninen rakenne

Käytä Expo Routeria.

Ehdotettu rakenne:

app/
  _layout.tsx

  (auth)/
    _layout.tsx
    login.tsx
    register.tsx

  (tabs)/
    _layout.tsx
    home.tsx
    standings.tsx
    participation.tsx
    info.tsx

  league/
    [id].tsx
    register.tsx

  admin/
    index.tsx
    create-league.tsx
    league/
      [id].tsx
    create-groups.tsx

components/
  ui/
  league/
  team/
  common/

lib/
  supabase.ts
  auth.ts
  types.ts

hooks/
  useAuth.ts
  useLeagues.ts
  useTeams.ts

constants/

supabase/
  migrations/

---

# 3. Autentikointi

Käytä Supabase Authia.

Käyttäjä voi:

- luoda tilin
- kirjautua sisään
- kirjautua ulos
- pysyä kirjautuneena sovelluksen uudelleenkäynnistyksen jälkeen
- palauttaa salasanan

Tilin luonnissa kysytään:

- Etunimi
- Sukunimi
- Sähköposti
- Puhelinnumero
- Salasana
- Salasanan vahvistus
- Sukupuoli (valinnainen)
  - Mies
  - Nainen
  - Muu
  - En halua kertoa
- Taitotaso
  - A
  - B
  - C
  - D

Salasanaa ei saa tallentaa itse tietokantaan. Supabase Auth hoitaa salasanan.

Käyttäjän muut tiedot tallennetaan `profiles`-tauluun.

---

# 4. Käyttäjäroolit

Järjestelmässä on vähintään kaksi roolia:

- user
- admin

Oletusarvoisesti uusi käyttäjä on `user`.

Admin voi:

- nähdä admin-näkymän
- luoda sarjoja
- hallita sarjoja
- nähdä ilmoittautuneet joukkueet
- muodostaa lohkoja

Tavallinen käyttäjä ei saa päästä admin-toimintoihin edes manipuloimalla sovelluksen frontendia.

Toteuta tämä Supabasen RLS-politiikoilla.

Älä luota pelkästään siihen, että admin-painike piilotetaan käyttöliittymässä.

---

# 5. Tietokanta

Suunnittele ja luo Supabaseen tarvittavat SQL-migraatiot.

Käytä PostgreSQL:ää.

## profiles

Kentät:

- id UUID PRIMARY KEY
- first_name
- last_name
- email
- phone
- gender nullable
- skill_level
- role
- created_at
- updated_at

`id` viittaa Supabase Auth käyttäjään.

---

# 6. Leagues / sarjat

Luo `leagues`-taulu.

Kentät:

- id UUID
- name
- start_date
- registration_deadline nullable
- status
- created_by
- created_at
- updated_at

Status voi olla esimerkiksi:

- registration_open
- registration_closed
- ongoing
- finished

Admin pystyy luomaan sarjan seuraavilla tiedoilla:

- Sarjan nimi
- Aloitusajankohta
- Ilmoittautumisen päättymisaika/päivä

Jos ilmoittautumisen päättymistä ei ole aluksi määritelty käyttöliittymässä, rakenna tietokanta silti tukemaan sitä.

---

# 7. Joukkueet

Luo `teams`-taulu.

Kentät:

- id
- league_id
- name
- skill_level
- skill_description nullable
- captain_id
- created_by
- created_at
- updated_at

Joukkue kuuluu yhteen sarjaan.

Joukkueessa voi olla 2–3 pelaajaa.

---

# 8. Joukkueen pelaajat

Luo erillinen `team_members`-taulu.

Kentät:

- id
- team_id
- user_id
- is_captain
- created_at

Näin sama käyttäjä voidaan tunnistaa oikeaksi käyttäjäksi eikä joukkueeseen tallenneta pelkkää sähköpostiosoitetta.

Kun joukkueen ilmoittautumislomakkeella annetaan pelikavereiden sähköpostiosoitteet:

1. etsi Supabasesta käyttäjä sähköpostin perusteella
2. jos käyttäjä löytyy, lisää hänet joukkueeseen
3. jos käyttäjää ei löydy, näytä käyttäjälle selkeä virheilmoitus:
   "Pelaajaa ei löytynyt. Pelaajan tulee luoda käyttäjätili ennen joukkueeseen lisäämistä."

Älä luo joukkueeseen "haamukäyttäjiä".

Huomioi myös se, että sähköpostien hakeminen suoraan clientilta voi olla tietoturvariski. Toteuta tämä turvallisesti Supabasen kautta esimerkiksi RPC-funktion avulla, joka palauttaa vain tarpeelliset tiedot.

---

# 9. Sarjaan ilmoittautuminen

Osallistuminen-välilehdellä käyttäjä näkee sarjat, joihin ilmoittautuminen on mahdollista.

Listassa näytetään esimerkiksi:

- Sarjan nimi
- Alkamispäivä
- Ilmoittautumisen deadline
- Ilmoittautuneiden joukkueiden määrä
- Sarjan tila
- "Ilmoittaudu" -painike

Kun käyttäjä painaa "Ilmoittaudu", avataan uusi screen.

---

# 10. Joukkueen ilmoittautumislomake

Lomakkeessa kysytään:

## Joukkueen nimi

Tekstikenttä.

## Pelikaverit

Lisää 1–2 pelikaveria sähköpostiosoitteella.

Käyttöliittymän pitää tukea:

- Pelaaja 2
- Pelaaja 3

Pelaajien sähköpostit tarkistetaan Supabasesta.

## Kapteeni

Käyttäjä voi valita joukkueen kapteenin.

Vaihtoehtoina ovat joukkueen kaikki jäsenet.

Oletusarvoisesti ilmoittautuva käyttäjä on kapteeni.

## Joukkueen taitotaso

Vaihtoehdot:

- A
- B
- C
- D

## Lisätietoa taitotasosta

Vapaa tekstikenttä.

Esimerkiksi:

"Kaikki pelaajat ovat pelanneet noin kaksi vuotta. Pelaamme aktiivisesti viikoittain."

Kenttä on vapaaehtoinen.

---

# 11. Maksaminen

Kun joukkueen tiedot on täytetty, käyttäjä voi valita:

### Maksa koko osallistumismaksu itse

TAI

### Jaa osallistumismaksu joukkueen jäsenten kesken

Tietokannassa pitää olla rakenne, joka mahdollistaa molemmat vaihtoehdot.

Luo esimerkiksi:

`payments`

Kentät:

- id
- team_id
- user_id
- amount
- payment_status
- payment_method
- created_at
- paid_at

Payment status:

- pending
- paid
- failed
- refunded

Aluksi varsinaista maksupalvelua ei tarvitse integroida.

Tee maksutoiminnallisuus kuitenkin siten, että myöhemmin esimerkiksi Stripe voidaan integroida helposti.

MVP:ssä voidaan näyttää maksutilanne esimerkiksi:

"Maksettu"

"Odottava maksu"

tai

"Joukkueen maksu jaettu 3 pelaajalle".

---

# 12. Kotivälilehti

Koti näyttää kirjautuneelle käyttäjälle hänen osallistumisensa.

Jos käyttäjä ei kuulu vielä mihinkään sarjaan:

Näytä:

"Et ole vielä ilmoittautunut yhteenkään sarjaan."

ja painike:

"Selaa sarjoja"

joka vie Osallistuminen-välilehdelle.

Jos käyttäjä kuuluu sarjaan, näytä esimerkiksi kortti:

--------------------------------
Padel Jyväskylä – Syksy 2026

Joukkue:
Team Alpha

Sarjan alku:
1.9.2026

Taitotaso:
B

Kapteeni:
Matti Meikäläinen

Pelaajat:
Matti Meikäläinen
Ville Virtanen
Teemu Testinen

Tila:
Ilmoittautuminen hyväksytty
--------------------------------

Jos käyttäjä osallistuu useampaan sarjaan, näytä kaikki.

Koti toimii käyttäjän henkilökohtaisena dashboardina.

---

# 13. Tulostaulukko

Tulostaulukossa käyttäjä voi valita sarjan.

Näytä sarjan joukkueet järjestyksessä.

Esimerkiksi:

| Sija | Joukkue | Ottelut | Voitot | Tappiot | Pisteet |
|---|---|---:|---:|---:|---:|
| 1 | Team Alpha | 5 | 4 | 1 | 12 |
| 2 | Team Beta | 5 | 3 | 2 | 9 |

Tietokantaan kannattaa suunnitella myöhemmin tarvittava rakenne otteluille ja tuloksille.

Luo tätä varten esimerkiksi:

`matches`

Kentät:

- id
- league_id
- group_id nullable
- home_team_id
- away_team_id
- home_score nullable
- away_score nullable
- status
- scheduled_at nullable
- created_at
- updated_at

Tulostaulukko voidaan laskea otteluiden perusteella.

MVP:ssä voidaan näyttää alustava tyhjä tulostaulukko, jos otteluita ei vielä ole.

---

# 14. Lohkot

Admin voi muodostaa sarjan joukkueista lohkoja ilmoittautumisen päätyttyä.

Luo:

`groups`

Kentät:

- id
- league_id
- name
- created_at

Esimerkiksi:

- Lohko A
- Lohko B
- Lohko C

Luo tarvittaessa myös `group_teams`:

- id
- group_id
- team_id

Admin-näkymässä:

1. valitse sarja
2. näe kaikki ilmoittautuneet joukkueet
3. valitse lohkojen määrä
4. muodosta lohkot
5. näe esikatselu
6. vahvista

Ensimmäisessä versiossa voidaan toteuttaa automaattinen jako mahdollisimman tasaisesti.

Esimerkiksi 12 joukkuetta ja 3 lohkoa:

- Lohko A: 4 joukkuetta
- Lohko B: 4 joukkuetta
- Lohko C: 4 joukkuetta

Myöhemmin voidaan kehittää taitotasoon perustuva jako.

---

# 15. Admin-näkymä

Info-välilehdellä näytetään adminille:

"Admin"

-painike.

Painike näkyy vain admin-käyttäjälle.

Admin-näkymässä:

## Sarjat

Lista olemassa olevista sarjoista.

Painike:

"Uusi sarja"

## Luo sarja

Kentät:

- Sarjan nimi
- Aloitusajankohta
- Ilmoittautumisen deadline

Painike:

"Luo sarja"

## Sarjan hallinta

Kun admin avaa sarjan:

Näytä:

- sarjan tiedot
- ilmoittautuneet joukkueet
- joukkueiden pelaajat
- ilmoittautumisen tila
- lohkot

Painikkeet:

"Muodosta lohkot"

"Muokkaa sarjaa"

"Muuta ilmoittautuminen suljetuksi"

---

# 16. Info-välilehti

Info-välilehdellä kerrotaan selkeästi:

## Miten PadelApp toimii?

Esimerkiksi:

1. Luo käyttäjätili
2. Etsi sopiva padelsarja
3. Muodosta joukkue
4. Lisää pelikaverit
5. Ilmoittaudu sarjaan
6. Maksa osallistuminen
7. Seuraa sarjan etenemistä
8. Katso tulokset ja sarjataulukko

Lisäksi kerro:

- mitä taitotasot tarkoittavat
- miten sarjat muodostetaan
- miten lohkot toimivat
- miten maksaminen toimii

Info-sivun alareunassa:

"Kirjaudu ulos"

Jos käyttäjä on admin:

"Admin"

---

# 17. Navigaatio

Bottom tab navigation:

🏠 Koti
📊 Tulokset
👥 Osallistuminen
ℹ️ Info

Käytä Expo Routeria.

Auth-käyttäjää ei saa päästää tabs-näkymään ilman kirjautumista.

Jos käyttäjä ei ole kirjautunut:

/login

Jos käyttäjä on kirjautunut:

/home

Toteuta auth state listener Supabasen `onAuthStateChange` avulla.

---

# 18. UI / design

Tee sovelluksesta moderni, sporttinen ja selkeä.

Tyylin pitäisi sopia padeliin.

Älä tee käyttöliittymästä liian monimutkaista.

Käytä:

- pyöristettyjä kortteja
- selkeitä otsikoita
- hyvää spacingia
- helposti painettavia painikkeita
- selkeitä input-kenttiä
- loading-indikaattoreita
- error messageja
- confirmation dialogeja

Sovelluksen pitää näyttää hyvältä sekä iOS- että Android-laitteilla.

Huomioi safe area.

---

# 19. Lomakkeiden validointi

Käytä esimerkiksi Zodia lomakkeiden validointiin.

Validoi:

- sähköposti
- puhelinnumero
- salasana
- salasanan vahvistus
- pakolliset kentät
- joukkueen nimi
- pelaajien määrä
- taitotaso

Virheilmoitukset pitää näyttää käyttäjälle selkeällä suomenkielisellä tekstillä.

Esimerkiksi:

"Anna sähköpostiosoite."

"Salasanojen tulee olla samat."

"Joukkueessa tulee olla vähintään kaksi pelaajaa."

"Pelaajaa ei löytynyt tällä sähköpostiosoitteella."

---

# 20. Tietoturva

Tämä on tärkeää.

Supabase RLS pitää ottaa käyttöön kaikissa käyttäjädatan sisältävissä tauluissa.

Käyttäjä saa:

- nähdä oman profiilinsa
- muokata omaa profiiliaan
- nähdä sarjat
- liittyä avoimiin sarjoihin
- nähdä omat joukkueensa
- nähdä oman joukkueensa jäsenet

Käyttäjä ei saa:

- muuttaa muiden käyttäjien tietoja
- muuttaa muiden joukkueita
- tehdä itsestään adminia
- luoda admin-oikeuksilla sarjoja
- muuttaa sarjojen tietoja ilman oikeuksia

Admin saa hallita sarjoja ja lohkoja.

Älä koskaan laita Supabase service role keytä mobiilisovellukseen.

Käytä clientissa vain Supabase anon/publishable keytä.

---

# 21. Supabase SQL

Luo projektiin Supabase-migraatiot.

Esimerkiksi:

supabase/migrations/

001_initial_schema.sql
002_rls_policies.sql
003_functions.sql
004_seed_data.sql

Kirjoita kaikki SQL niin, että uusi Supabase-projekti voidaan alustaa migraatioiden avulla.

Lisää tarvittavat:

- foreign keyt
- unique constraintit
- check constraintit
- indexes
- RLS policies
- triggerit

Luo triggeri, joka luo `profiles`-riville uuden käyttäjän Supabase Auth -käyttäjän rekisteröityessä.

---

# 22. TypeScript-tyypit

Generoi/ylläpidä Supabase-tietokantaan perustuvat TypeScript-tyypit.

Käytä tyyppejä kautta sovelluksen.

Älä käytä tarpeettomasti `any`-tyyppiä.

---

# 23. API / data layer

Älä tee Supabase-kutsuja jokaiseen komponenttiin suoraan.

Luo selkeä data layer.

Esimerkiksi:

lib/
  supabase.ts

services/
  authService.ts
  leagueService.ts
  teamService.ts
  profileService.ts
  standingsService.ts
  adminService.ts

Hooks:

hooks/
  useAuth.ts
  useLeagues.ts
  useMyTeams.ts
  useStandings.ts

Näin sovellus pysyy helposti ylläpidettävänä.

---

# 24. Loading ja error states

Jokaisessa Supabase-haussa pitää olla:

- loading state
- error state
- empty state

Älä jätä käyttäjää tyhjälle ruudulle.

Esimerkiksi sarjojen latauksen aikana näytä ActivityIndicator.

Jos sarjoja ei ole:

"Ei avoimia sarjoja tällä hetkellä."

Jos Supabase palauttaa virheen:

"Jotain meni pieleen. Yritä uudelleen."

Tarjoa tarvittaessa "Yritä uudelleen" -painike.

---

# 25. Käyttäjäkokemus

Käyttäjän pitää pystyä:

1. Luomaan tili
2. Kirjautumaan
3. Näkemään avoimet sarjat
4. Valitsemaan sarjan
5. Luomaan joukkueen
6. Lisäämään pelikaverit
7. Valitsemaan kapteenin
8. Valitsemaan taitotason
9. Valitsemaan maksutavan
10. Lähettämään ilmoittautumisen
11. Näkemään ilmoittautumisensa Koti-välilehdellä
12. Näkemään sarjataulukon
13. Lukemaan infoa
14. Kirjautumaan ulos

Adminin pitää pystyä:

1. Kirjautumaan adminina
2. Avaamaan admin-näkymän
3. Luomaan sarjan
4. Näkemään sarjan ilmoittautuneet joukkueet
5. Sulkemaan ilmoittautumisen
6. Muodostamaan lohkot
7. Näkemään muodostetut lohkot

---

# 26. Aloita tästä

Koska projekti on tyhjä, etene vaiheittain.

## Vaihe 1

Luo Expo React Native TypeScript -projekti.

Asenna tarvittavat paketit.

## Vaihe 2

Luo Supabase client.

Luo `.env` / Expo-yhteensopiva ympäristömuuttujarakenne.

Älä koskaan committaa salaisuuksia GitHubiin.

Luo:

EXPO_PUBLIC_SUPABASE_URL

EXPO_PUBLIC_SUPABASE_ANON_KEY

## Vaihe 3

Luo Supabase SQL-migraatiot.

## Vaihe 4

Luo autentikointi.

## Vaihe 5

Luo profiilin luonti.

## Vaihe 6

Luo bottom tab navigation.

## Vaihe 7

Luo sarjojen selaaminen.

## Vaihe 8

Luo joukkueen ilmoittautuminen.

## Vaihe 9

Luo koti ja käyttäjän omat sarjat.

## Vaihe 10

Luo tulostaulukko.

## Vaihe 11

Luo admin-toiminnot.

## Vaihe 12

Luo lohkojen muodostaminen.

---

# 27. Tärkeä toteutustapa

Älä yritä tehdä koko sovellusta yhdellä valtavalla tiedostolla.

Pidä koodi modulaarisena.

Käytä:

- komponentteja
- custom hookeja
- service/data layeria
- TypeScript-tyyppejä
- Supabase migrationeja

Pidä jokainen screen kohtuullisen pienenä.

---

# 28. Suomenkielinen käyttöliittymä

Kaikki käyttöliittymän tekstit ovat suomeksi.

Esimerkiksi:

Login:

"Kirjaudu"

"Unohditko salasanasi?"

"Ei vielä tiliä? Luo tili"

Register:

"Luo tili"

"Etunimi"

"Sukunimi"

"Sähköposti"

"Puhelinnumero"

"Salasana"

"Toista salasana"

"Sukupuoli"

"Taitotaso"

"Rekisteröidy"

Participation:

"Osallistuminen"

"Avoimet sarjat"

"Ilmoittaudu"

Home:

"Koti"

"Omat sarjat"

Standings:

"Tulostaulukko"

Info:

"Info"

"Kirjaudu ulos"

Admin:

"Ylläpito"

"Uusi sarja"

"Muodosta lohkot"

---

# 29. Tietokannan suunnittelun lähtökohta

Vähintään seuraavat taulut:

profiles
leagues
teams
team_members
groups
group_teams
matches
payments

Suunnittele tietokanta niin, että sitä voidaan myöhemmin laajentaa:

- otteluiden tulosten syöttämiseen
- otteluohjelmaan
- pisteiden laskemiseen
- push-ilmoituksiin
- pelaajien tilastoihin
- sarjojen historiaan
- maksujen oikeaan käsittelyyn
- joukkueiden kutsuihin
- pelaajien hyväksymiseen

Älä kuitenkaan rakenna näitä ominaisuuksia vielä, ellei niitä tarvita MVP:n toimintaan.

---

# 30. Tärkeä sääntö kehityksessä

Älä vain kirjoita koodia.

Kun olet tehnyt ensimmäisen version:

1. tarkista TypeScript-virheet
2. tarkista importit
3. tarkista Expo Router -reitit
4. tarkista Supabase-kyselyt
5. tarkista RLS-politiikat
6. tarkista ettei käytössä ole service role keytä clientissa
7. tarkista ettei salasanoja tallenneta profiles-tauluun
8. tarkista ettei admin-oikeuksia voi antaa clientin kautta
9. tarkista loading/error/empty states
10. suorita projekti ja korjaa build/runtime-virheet

Jos jokin kirjasto tai API on muuttunut, käytä sen nykyistä versiota ja sovella nykyisen Expo/Supabase-version mukaista toteutustapaa.

---

# 31. Lopputulos

Lopputuloksena pitää olla käynnistettävä Expo-sovellus, jossa käyttäjä voi oikeasti:

- rekisteröityä
- kirjautua
- nähdä sarjat
- ilmoittautua sarjaan joukkueella
- lisätä käyttäjätilillä olevat pelikaverit
- valita kapteenin
- valita taitotason
- valita maksun jakamisen
- nähdä oman sarjaosallistumisensa
- nähdä tulostaulukon
- kirjautua ulos

Admin voi:

- luoda sarjan
- hallita sarjaa
- nähdä joukkueet
- sulkea ilmoittautumisen
- muodostaa lohkot

Kaiken tulee toimia Supabase-backendin kautta.

Aloita nyt vaiheesta 1 ja rakenna projekti vaiheittain. Älä jätä ydintoiminnallisuuksia mock-dataksi, jos niiden toteuttaminen Supabasella on mahdollista.

Kun yksi vaihe on valmis, tarkista että projekti toimii ennen kuin siirryt seuraavaan vaiheeseen.