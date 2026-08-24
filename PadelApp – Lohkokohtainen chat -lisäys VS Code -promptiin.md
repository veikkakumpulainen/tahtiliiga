# 32. Lohkokohtainen chat

Lisää sovellukseen **lohkojen oma chat**, joka näkyy käyttäjän Koti-välilehdellä sen jälkeen, kun admin on muodostanut sarjan joukkueista lohkot.

Chatin tarkoitus on antaa saman lohkon joukkueiden pelaajille paikka, jossa he voivat sopia keskenään otteluiden peliajat.

## Chatin näkyminen

Chatia ei näytetä käyttäjälle ennen kuin:

1. käyttäjä on ilmoittautunut sarjaan
2. admin on muodostanut sarjan joukkueista lohkot
3. käyttäjän joukkue on sijoitettu johonkin lohkoon

Kun nämä ehdot täyttyvät, Koti-välilehdelle ilmestyy lohkon chat.

Esimerkiksi:

---

### Lohko A

**Lohko A:n chat**

"4 joukkuetta · 12 pelaajaa"

Viimeisin viesti:

> "Sopisiko meille sunnuntaina klo 18?"

[ Avaa chat ]

---

Jos käyttäjä kuuluu useampaan sarjaan tai useampaan lohkoon, näytä jokaisen aktiivisen lohkon chat erillisenä korttina.

---

# 33. Chatin tietokanta

Luo Supabaseen `group_messages`-taulu.

Kentät:

- id UUID PRIMARY KEY
- group_id UUID NOT NULL
- user_id UUID NOT NULL
- message TEXT NOT NULL
- created_at TIMESTAMPTZ DEFAULT NOW()
- updated_at TIMESTAMPTZ DEFAULT NOW()

Foreign keyt:

- `group_id` → `groups.id`
- `user_id` → `profiles.id`

Lisää tarvittavat indeksit esimerkiksi:

- group_id
- created_at

Jotta viestit voidaan hakea tehokkaasti aikajärjestyksessä.

---

# 34. Chatin tietoturva

Chatin tärkein sääntö:

**Käyttäjä saa lukea ja lähettää viestejä vain sellaiseen lohkoon, jossa hänen joukkueensa pelaa.**

Älä luota frontendissä tehtävään tarkistukseen.

Toteuta tämä Supabase RLS:n avulla.

Esimerkiksi käyttäjän pitää kuulua joukkueeseen:

`team_members.user_id = auth.uid()`

ja joukkueen pitää kuulua kyseiseen lohkoon:

`group_teams.team_id = team_members.team_id`

Näin käyttäjä ei voi esimerkiksi suoraan Supabase APIa manipuloimalla lukea jonkin toisen lohkon keskustelua.

Sama tarkistus pitää tehdä viestien lähettämisessä.

---

# 35. Reaaliaikainen chat

Käytä **Supabase Realtimea**.

Kun käyttäjä on chatissa:

- uudet viestit ilmestyvät automaattisesti
- käyttäjän ei tarvitse päivittää näkymää
- viestit tallennetaan Supabaseen
- viestit haetaan vanhimmasta uusimpaan

Käytä esimerkiksi Supabase Realtime channelia kuuntelemaan `group_messages`-taulun uusia INSERT-tapahtumia kyseisen `group_id`:n perusteella.

Muista unsubscribe-kanavasta, kun käyttäjä poistuu chat-screeniltä.

---

# 36. Chat-screen

Kun käyttäjä painaa:

"Avaa chat"

avaa uusi screen:

`/group/[id]/chat`

Näytön yläreunassa:

### Lohko A

"4 joukkuetta"

Sen alla viestit.

Esimerkiksi:

**Matti Meikäläinen · Team Alpha**  
"Meille sopisi torstaina klo 19."

**Ville Virtanen · Team Beta**  
"Torstai ei käy, mutta perjantaina klo 18 onnistuisi."

**Matti Meikäläinen · Team Alpha**  
"Perjantai klo 18 käy meille!"

Viestin yhteydessä näytetään:

- lähettäjän etunimi
- joukkueen nimi
- viesti
- lähetysaika

Älä näytä muiden käyttäjien puhelinnumeroita tai sähköpostiosoitteita chatissa.

---

# 37. Viestin lähettäminen

Chatin alareunassa on tekstikenttä:

"Kirjoita viesti..."

ja lähetyspainike.

Käyttäjä voi lähettää viestin esimerkiksi:

"Sopisiko meille lauantaina klo 16?"

Viestin pitää:

- olla vähintään 1 merkki
- olla järkevän maksimipituinen, esimerkiksi 1000 merkkiä
- trimmautua ennen tallennusta

Kun viesti lähetetään:

1. validoi viesti
2. tarkista että käyttäjä kuuluu kyseiseen lohkoon
3. insert Supabaseen
4. tyhjennä tekstikenttä
5. Realtime näyttää viestin keskustelussa

---

# 38. Chat UI

Tee chatista WhatsApp/moderni messenger -tyylinen.

Omat viestit:

- oikealla
- hieman erilaisella taustalla

Muiden viestit:

- vasemmalla
- lähettäjän nimi näkyviin

Joukkueen nimi näkyy viestin yhteydessä.

Esimerkiksi:

**Ville · Team Beta**

"Sopisiko sunnuntaina klo 15?"

15:42

---

# 39. Joukkueen tunnistaminen

Koska chatissa voi olla useita joukkueita, viestin yhteydessä pitää olla selkeästi näkyvissä lähettäjän joukkue.

Esimerkiksi:

**Matti Meikäläinen**
`Team Alpha`

"Meille sopisi keskiviikko klo 18."

Tämä helpottaa otteluiden sopimista.

---

# 40. Chatin aloitus Koti-välilehdellä

Koti-välilehti muuttuu siten, että käyttäjän sarjakortin yhteydessä näkyy myös hänen lohkonsa.

Esimerkiksi:

--------------------------------

### Jyväskylä Padel – Syksy 2026

**Team Alpha**

Lohko A

4 joukkuetta

[ Avaa lohkon chat ]

--------------------------------

Kun käyttäjä avaa chatin, hän näkee vain oman lohkonsa keskustelun.

---

# 41. Viimeisin viesti kotisivulla

Koti-välilehden lohkokortissa näytetään viimeisin chat-viesti.

Esimerkiksi:

**Lohko A:n chat**

Ville · Team Beta  
"Sopisiko meille sunnuntaina klo 18?"

2 min sitten

[ Avaa chat ]

Jos viestejä ei ole vielä:

"Ei vielä viestejä. Aloita keskustelu!"

---

# 42. Lukemattomat viestit

Toteuta mahdollisuuksien mukaan myös lukemattomien viestien määrä.

Esimerkiksi:

**Lohko A:n chat**  
🔴 3 uutta viestiä

Kun käyttäjä avaa chatin, lukemattomien viestien määrä nollataan.

Tätä varten voidaan tarvittaessa luoda esimerkiksi:

`group_message_reads`

Kentät:

- id
- group_id
- user_id
- last_read_at

Tai vaihtoehtoisesti toteuttaa lukemattomien viestien seuranta käyttäjäkohtaisen viimeisimmän luetun aikaleiman avulla.

Valitse yksinkertaisin ja luotettava ratkaisu.

---

# 43. Chat ja otteluiden sopiminen

Chatin tarkoitus ei ole vielä toimia virallisena ottelunvarausjärjestelmänä.

Käyttäjät sopivat ottelunsa chatissa vapaasti.

Esimerkiksi:

"Team Alpha vs Team Beta – käykö sunnuntai klo 18?"

"Joo käy!"

Myöhemmin sovellukseen voidaan lisätä erillinen otteluiden aikataulutusjärjestelmä.

Älä rakenna varsinaista ajanvarausta vielä.

---

# 44. Adminin oikeudet chattiin

Admin voi nähdä kaikkien lohkojen keskustelut.

Admin voi tarvittaessa poistaa sopimattoman viestin.

Lisää viesteille tarvittaessa:

- deleted_at
- deleted_by

Älä poista viestiä fyysisesti tietokannasta, jos admin poistaa sen.

Sen sijaan näytä:

"Viesti poistettu."

Tavallinen käyttäjä ei voi poistaa muiden viestejä.

---

# 45. Lohkon muodostamisen yhteys chattiin

Kun admin muodostaa lohkot:

1. luodaan `groups`
2. luodaan `group_teams`
3. käyttäjien joukkueet yhdistetään lohkoihin
4. kyseisen lohkon chat tulee automaattisesti näkyviin kaikkien kyseisen lohkon pelaajien Koti-välilehdelle

Adminin ei tarvitse erikseen "luoda chattia".

Chat syntyy automaattisesti lohkon muodostamisen yhteydessä.

Jos lohkoa ei ole muodostettu, chatia ei näytetä.

---

# 46. Realtime-toteutus

Varmista Supabase-projektissa, että `group_messages` kuuluu Realtime-julkaisuihin tarvittaessa.

Frontendissä toteuta esimerkiksi:

- viestien initial fetch
- Realtime subscription
- uusien viestien lisääminen stateen
- subscriptionin cleanup

Huomioi, ettei sama viesti päädy käyttöliittymään kahdesti.

Optimistista päivitystä ei tarvitse käyttää ensimmäisessä versiossa.

---

# 47. Chatin tietokantarajoitukset

Lisää:

- `message` NOT NULL
- järkevä viestin maksimipituus
- `group_id` NOT NULL
- `user_id` NOT NULL
- `created_at` NOT NULL

Lisää tarvittavat foreign keyt ja indexes.

---

# 48. Lopullinen käyttäjäpolku chatin osalta

Käyttäjä:

1. Luo tilin
2. Liittyy sarjaan
3. Muodostaa joukkueen
4. Odottaa ilmoittautumisen päättymistä
5. Admin muodostaa lohkot
6. Käyttäjän Koti-välilehdelle ilmestyy automaattisesti oma lohko
7. Käyttäjä näkee "Avaa lohkon chat"
8. Käyttäjä avaa chatin
9. Kaikki saman lohkon joukkueiden pelaajat näkevät keskustelun
10. Pelaajat sopivat otteluiden ajankohdista
11. Viestit päivittyvät reaaliajassa ilman refreshiä

---

# 49. Päivitä alkuperäinen tietokantamalli

Alkuperäisen tietokantamallin lisäksi tarvitaan vähintään:

profiles
leagues
teams
team_members
groups
group_teams
matches
payments
group_messages

Tarvittaessa:

group_message_reads

Suunnittele foreign keyt ja RLS-politiikat niin, että käyttäjä pääsee chattaamaan vain oman lohkonsa kanssa.

---

# 50. Tärkeä huomio

Chatin pitää olla sidottu **lohkoon**, ei sarjaan.

Jos esimerkiksi:

Sarja:
"Jyväskylä Syksy 2026"

sisältää:

Lohko A
- Team Alpha
- Team Beta
- Team Gamma
- Team Delta

Lohko B
- Team Eagles
- Team Padel Kings
- Team Smash
- Team Padel Bros

Lohko A:n pelaajat näkevät vain Lohko A:n chatin.

Lohko B:n pelaajat näkevät vain Lohko B:n chatin.

He eivät näe toistensa viestejä.

Admin voi nähdä molemmat.

Tämä eristys pitää toteuttaa myös Supabasen RLS-tasolla, ei pelkästään React Nativessa.