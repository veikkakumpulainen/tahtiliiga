-- League-specific "Info" text, written by an admin when creating or editing
-- a league. Previously hardcoded in LeagueIntroContent.tsx. Supports the
-- same WhatsApp-style formatting as before: lines starting with ⭐ are
-- headings, *text* is bold and lines starting with -, * or • are bullets.

alter table public.leagues
  add column if not exists info_text text;

-- Existing leagues keep the text players have seen so far.
update public.leagues
set info_text = $info$Suomen kirkkain padel-liiga eli tähtiliiga starttaa matkansa Jyväskylästä! Liiga on jatkumoa Jyväskylän kesäliiga 2026 by Kuntomaailma:lle

Tähtiliiga on kaiken tasoisille pelaajille suunniteltu kilpailullinen padel-liiga, jossa joukkueet taistelevat kierros kierrokselta sijoituksista, nousuista ja palkinnoista.

Liigan idea on yksinkertainen: aloitat omalta tasoltasi ja kilpailet oman tasoisiasi vastaan. Tähtiliigassa jokainen kierros merkitsee. Lohkot elävät jatkuvasti, joten vastustajat vaihtuvat ja kilpailu säilyy kiinnostavana koko kauden ajan.

Liiga ei ole sidonnainen mihinkään alueen padeltoimijaan tai ei toimi minkään yksittäisen padelyrityksen alla. Tähtiliigaa on oma yrityksensä jota pyörittää oma tiimi. Näin ollen saadaan pelaajille avattua alueen kaikki fasiliteetit, parannettua kaupungin padelyhteisöä sekä yhteistyötä, tarjottua kaikille padeltoimijoille hyötyä liigan olemassa olosta ja neuvoteltua parhaimmat yhteistyöt. 🤩

❕Jokaiselle kesäliigassa mukana olleelle alennus osallistumismaksusta!

⭐️ *Miten liiga toimii?*

- Liiga pelataan 4 joukkueen lohkoissa.
- Jokaisella kierroksella kohtaatte lohkonne muut joukkueet eli kierroksen aikana pelataan 3 ottelua.
- Yksi kierros on aina vakiona 26päivää eli 3 kokonaista viikkoa + 1 arkiviikko.

Kierroksen jälkeen:
- Lohkon voittaja nousee suoraan ylempään lohkoon
- Lohkon toinen pelaa karsintaottelun ylemmän lohkon kolmosta vastaan
- Lohkon viimeinen putoaa alempaan lohkoon

Näin lohkot elävät kierros kierrokselta laajasti ja jatkuvasti pääset pelaamaan uusia mutta oman tasoisiaan vastustajia vastaan.

⭐️ *LIIGA ELÄÄ TULOSTEN MUKANA*

- Ensimmäiset lohkot muodostetaan pelaajien ilmoittaman pelitason perusteella.
- Tämän jälkeen sijoitukset määräytyvät pelkästään tulosten perusteella.
- Jokaisen kierroksen jälkeen joukkue voi nousta, säilyttää paikkansa tai pudota.
- Tämä tekee Tähtiliigan konseptista erittäin mielenkiintoisen

⭐️ *JOUKKUEET*

- Joukkueessa voi olla 2–3 pelaajaa.
- Kokoonpanoa voi vaihtaa ottelukohtaisesti, joten kaikki pelit eivät vaadi samoja pelaajia.
- Jokaisen joukkueen pelaajan tulee kuitenkin osallistua vähintään neljään otteluun liigakauden aikana.
- Kerää siis kaverit kasaan, keksikää joukkueelle nimi ja lähtekää tavoittelemaan Tähtiliigan mestaruutta. Ilmoittautuminen on helppoa kuin heinän teko!

⭐️ *SARJAT*

- Avoin sarja: miesjoukkueet & naisjoukkueet
- Mixty: Mixty joukkueet, kentällä aina mies–nainen -pari.

⭐️ *OTTELUT*

- Jokainen joukkue valitsee kapteenin ilmottautumisen yhteydessä. (Tätä voi muuttaa myöhemmin.
- Ottelut sovitaan oman lohkon joukkueiden kesken, joten pelaaminen on joustavaa.
- Tähtiliigasovellus luo automaattisesti kierroksen alkaessa teidän lohkollenne oman chätin sovelluksen sisälle jossa voitte jutella. Vastustajien nimet ja joukkueet tulevat keskustelussa näkyviin näppärästi.
- Myös kapteenien yhteistiedot on helposti nähtävissä joten whatsapin käyttö pelien sopimiseen on halutessaan mahdollista!

Te päätätte milloin pelaattte ja missä, kunhan kaikki kierroksen ottelut pelataan annetun aikarajan sisällä.

⭐️ *MATSIEN SÄÄNNÖT JA PISTEYTYS*

- 3 erää / ottelu
- Golden Point käytössä

Jokaisesta ottelusta on jaossa yhteensä 6 pistettä.

* Erävoitto = 1 piste
* Otteluvoitto = +2 pistettä
* Häviäjä saa pelatusta ottelusta +1 pisteen

Lisäksi kierroksen sijoituksista saa extrapisteitä:

* Suora nousu = +2 pistettä
* Karsintaottelun voitto = +1 piste

Näin myös tiukasti taistellut tappio voi olla tärkeä pisteiden kannalta.

Otteluiden kenttävuorot maksetaan normaalisti.

⭐️ *KIERROKSET*

Liiga koostuu kolmesta varsinaisesta kierroksesta.

Jokainen kierros sisältää:
- 3 lohko-ottelua
- Kierrosten välissä pelataan tarvittaessa karsintaottelut ylemmän ja alemman lohkon välillä.

⭐️ *FINAALIVIIKONLOPPU*

Tähtiliigan kausi huipentuu aina suureen finaaliviikonloppuun.

Kaikki liigan joukkueet kokoontuvat yhteen ratkaisemaan lopulliset lohkokohtaiset sijoitukset ja mestaruudet.

Finaaliviikonlopun aikana luvassa on:
- Mestaruuksien ratkaisut
- Palkintoja lohkojen menestyjille
- Kauden parhaiden palkitseminen
- Yhteisöllinen päätöstapahtuma

Tarkoituksena on tehdä finaaliviikonlopusta kauden kohokohta ei vain viimeisiä otteluita.

⭐️ *PALKINNOT*

Tähtiliigassa palkitaan menestyjiä läpi kauden. Tavoitteemme on pitää tähtiliigan palkinnot koko suomen mittakaavalla kaikkein runsaimpina.

Rahapalkintojen lisäksi mukana on yhteistyökumppaneiden tarjoamia palkintoja, etuja ja kannustimia.

Palkintoja jaetaan sekä sarjojen kärkeen että kauden aikana eri lohkoissa menestyville joukkueille.

⭐️ *OSALLISTUMISMAKSU*

Osallistumismaksu: 30€/ pelaaja per sarja

Osallistumismaksu sisältää:

✓ Koko liigakauden
✓ Kaikki kolme kierrosta
✓ Mahdollisuuden kaikkiin palkintoihin
✓ Finaaliviikonlopun

Kenttävuorot maksetaan erikseen. (jokaiseen kesäliigapeliin alennus)

Voit siis osallistua myös molempiin sarjoihin, jolloin osallistumismaksu maksetaan molemmista sarjoista.

⭐ *MIKSI TÄHTILIIGA?*

Kilpailun vivahde. Uudet vastustajat. Paikallinen padelyhteisö. Nousut ja putoamiset. Palkinnot.

Tähtiliigan tarkoitus on tehdä lliigasta kilpailu, johon on helppo tulla mukaan pienellä kynnyksellä ja jossa jokaisella ottelulla on merkitystä.

Olit sitten vasta aloittamassa padelmatkaasi tai kokeneempi kilpailija, TÄHTILIIGASSA on teidän joukkueelle paikka.

Kerää joukkue. Luokaa tähtiliiga profiilit. Ilmoittautukaa liigaan!⭐

Talvi ja tähdet odottaa. Lets Go!$info$
where info_text is null;
