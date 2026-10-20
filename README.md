# Tähtiliiga

Mobiili- ja verkkosovellus padelin harrastesarjojen järjestämiseen. Pelaajat ilmoittautuvat sarjoihin joukkueena, sopivat otteluajat oman lohkonsa chatissa, kirjaavat tulokset ja seuraavat sarjataulukoita. Järjestäjä hallitsee sarjoja, kierroksia ja lohkoja samasta sovelluksesta.

## Ominaisuudet

**Pelaajille**
- Rekisteröityminen, sähköpostivahvistus ja salasanan palautus
- Joukkueen kokoaminen pelaajahaulla ja kutsuilla, kapteenin valinta
- Lohkon otteluparit, ottelun ajan ja paikan sopiminen
- Tulosten kirjaus (erät ja tiebreakit tai luovutusvoitto), ottelukohtaiset kokoonpanot
- Varapelaajat, jotka vastustajajoukkue hyväksyy
- Lohko- ja kokonaistaulukot, jotka päivittyvät automaattisesti
- Reaaliaikaiset chatit (lohko, karsintaottelu, yhteisö) ja lukemattomien viestien merkinnät
- Push-ilmoitukset uusista viesteistä, kierroksen alkamisesta ja sopimattomista otteluista
- Tilin poisto sovelluksen sisältä

**Järjestäjälle**
- Sarjojen, kierrosten, kategorioiden ja pelipaikkojen hallinta
- Automaattinen lohkojako taitotason mukaan
- Karsintakierrokset ja tavalliset kierrokset nousuineen ja putoamisineen
- Joukkueiden ja kokoonpanojen muokkaus poikkeustilanteissa
- Maksujen seuranta (Stripe)

## Tekniikka

| Osa | Teknologia |
| --- | --- |
| Sovellus | React Native, Expo (SDK 57), Expo Router, TypeScript |
| Verkkoversio | React Native Web, julkaisu Vercelissä |
| Backend | Supabase: PostgreSQL, Auth, Realtime |
| Palvelinlogiikka | PostgreSQL-funktiot (RPC) ja Supabase Edge Functions (Deno) |
| Ilmoitukset | Expo Notifications, ajastetut ja triggeröidyt Edge Functionit |
| Maksut | Stripe webhookit |

### Tietoturva ja datamalli

Sovelluksessa ei ole omaa API-palvelinta. Pääsynhallinta on toteutettu tietokannassa PostgreSQL:n Row Level Securityllä ja `security definer` -funktioilla. Esimerkiksi tulosten kirjaus, varapelaajien hyväksyntä ja lohkojako tapahtuvat tietokantafunktioissa, jotka tarkistavat käyttäjän roolin ja sarjan tilan. Asiakas ei siis voi ohittaa sääntöjä.

Tietokannan rakenne on kehittynyt yli 120 migraation kautta ([supabase/migrations/](supabase/migrations/)). Service role -avainta käytetään vain Edge Functioneissa.

## Rakenne

```
src/
  app/          Expo Router -näkymät (auth, välilehdet, sarjat, admin, profiili)
  components/   Jaetut UI-komponentit
  context/      Auth- ja sovellustila
  hooks/        Datahaut ja reaaliaikaiset tilaukset
  lib/          Supabase-asiakas ja apufunktiot
supabase/
  migrations/   Tietokantaskeema, RLS-säännöt ja RPC-funktiot
  functions/    Edge Functionit (ilmoitukset, Stripe-webhook, tilin poisto)
```

## Ajaminen paikallisesti

Tarvitset oman Supabase-projektin. Luo projektin juureen `.env`:

```bash
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

Aja migraatiot ja käynnistä sovellus:

```bash
npm install
npx supabase link --project-ref <oma-projekti>
npx supabase db push
npm start          # tai: npm run web
```

## Lisenssi

Koodi on julkisena portfoliotarkoituksessa. Kaikki oikeudet pidätetään.
