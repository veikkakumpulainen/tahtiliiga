import { Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useEffect, useState } from "react";
import { router } from "expo-router";
import { colors } from "../../theme";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../hooks/useAuth";
import { unregisterPushToken } from "../../hooks/usePushNotifications";
import ScreenHeader from "../../components/ScreenHeader";

const infoItems = ["Kaikki tähtiliigasta", "Liigakonsepti + säännöt", "Yhteyttä"];

export default function InfoScreen() {
  const { session } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [infoModal, setInfoModal] = useState<string | null>(null);
  const logout = async () => { await unregisterPushToken(); if (supabase) await supabase.auth.signOut(); router.replace(Platform.OS === "web" ? "/" : "/(auth)/login"); };
  useEffect(() => { if (!supabase || !session?.user.id) return; void supabase.rpc("is_admin").then(({ data }) => setIsAdmin(data === true)); }, [session?.user.id]);
  return <View style={styles.page}><ScreenHeader /><ScrollView style={styles.scroll} contentContainerStyle={styles.content}><View style={styles.body}><View style={styles.infoRow}>{infoItems.map((label) => <Pressable key={label} onPress={() => setInfoModal(label)} style={styles.infoButton}><Text style={styles.infoButtonText}>{label}</Text></Pressable>)}</View>{session ? <>
    <Pressable onPress={() => router.push("/profile/edit" as never)} style={styles.profile}><Text style={styles.profileText}>Omat tiedot</Text></Pressable>
    <Pressable onPress={() => router.push("/settings" as never)} style={styles.settings}><Text style={styles.profileText}>Asetukset</Text></Pressable>
    {isAdmin ? <Pressable onPress={() => router.push("/admin" as never)} style={styles.admin}><Text style={styles.adminLink}>Avaa admin-näkymä</Text></Pressable> : null}
    <Pressable onPress={logout} style={styles.logout}><Text style={styles.logoutText}>Kirjaudu ulos</Text></Pressable>
  </> : <>
    <Pressable onPress={() => router.push("/(auth)/login" as never)} style={styles.profile}><Text style={styles.profileText}>Kirjaudu sisään</Text></Pressable>
    <Pressable onPress={() => router.push("/(auth)/register" as never)} style={styles.admin}><Text style={styles.adminLink}>Luo tili</Text></Pressable>
  </>}</View><Modal visible={infoModal !== null} transparent animationType="slide" onRequestClose={() => setInfoModal(null)}><View style={styles.modalBackdrop}><Pressable style={styles.modalBackdropTap} onPress={() => setInfoModal(null)} /><View style={styles.modalBox}><View style={styles.modalHeader}><Text style={styles.modalTitle}>{infoModal}</Text><Pressable onPress={() => setInfoModal(null)} accessibilityRole="button" accessibilityLabel="Sulje"><Text style={styles.modalClose}>×</Text></Pressable></View>{infoModal === "Kaikki tähtiliigasta" ? <ScrollView style={styles.modalContent} contentContainerStyle={styles.modalContentInner} showsVerticalScrollIndicator={false}><AllAboutContent onContactPress={() => setInfoModal("Yhteyttä")} /></ScrollView> : infoModal === "Liigakonsepti + säännöt" ? <ScrollView style={styles.modalContent} contentContainerStyle={styles.modalContentInner} showsVerticalScrollIndicator={false}><LeagueRulesContent /></ScrollView> : infoModal === "Yhteyttä" ? <ScrollView style={styles.modalContent} contentContainerStyle={styles.modalContentInner} showsVerticalScrollIndicator={false}><ContactContent /></ScrollView> : <Text style={styles.modalCopy}>Sisältö tulossa pian.</Text>}</View></View></Modal></ScrollView></View>;
}

function AllAboutContent({ onContactPress }: { onContactPress: () => void }) {
  return <View>
    <View style={styles.modalSection}>
      <Text style={styles.modalHeading}>Mikä on Tähtiliiga?</Text>
      <Text style={styles.modalText}>Tähtiliigan perimmäinen ajatus on yksinkertainen: haluamme mahdollistaa mahdollisimman monelle kaupungin pelaajalle tasaisia, mielekkäitä ja sopivan kilpailullisen vivahteen omaavia matseja arkeen. Meidän tavoite on tehdä mukaan ilmoittautumiseen mahdollisimman pieni kynnys, jos siis epäröit suuresti, olemme epäonnistuneet!</Text>
      <Text style={[styles.modalText, styles.modalParagraphSpacing]}>Sinun ei siis todellakaan tarvitse olla kilpapelaaja osallistuaksesi tähtiliigaan. Riittää, että haluat pelata, kehittyä ja saada tavallisiin padelpeleihin hieman enemmän panosta. Tähtiliigan konsepti on hiottu niin, että jokainen joukkue pelaa omalla tasollaan oman tasoisia vastaan.</Text>
      <Text style={[styles.modalText, styles.modalParagraphSpacing]}>Liiga ei ole sidonnainen mihinkään alueen padeltoimijaan tai ei toimi minkään yksittäisen padelyrityksen alla. Tähtiliigaa on oma yrityksensä jota pyörittää oma tiimi. Näin ollen saadaan käyttöön kaupungin kaikki padelkentät (jotka täyttävät laadultaan vaatimustason), parannettua kaupungin padelyhteisöä sekä yhteistyötä ja tarjottua kaikille padeltoimijoille hyötyä liigan olemassa olosta. 🤩</Text>
      <Text style={[styles.modalText, styles.modalParagraphSpacing]}>Pidämme myös huolen siitä, että meiltä löytyy Suomen parhaat ja runsaimmat palkinnot, kannustimet ja yhteistyöt liigan ympäriltä.</Text>
      <Text style={[styles.modalText, styles.modalParagraphSpacing]}>Tähtiliiga on kaikille, tervetuloa mukaan!</Text>
    </View>
    <View style={styles.modalSection}>
      <Text style={styles.modalHeading}>Oma alusta?</Text>
      <Text style={styles.modalText}>On olemassa Padelutionia, Playtomicia, Thrill:ä ja monen moista muuta alustaa, joissa liigaominaisuuksia löytyy. Missään näistä ei kuitenkaan keskitytä pelkästään liigoihin eikä mikään sovellu täysin tähän meidän konseptiimme.</Text>
      <Text style={[styles.modalText, styles.modalParagraphSpacing]}>Me päätimme, että jos tehdään, niin tehdään kunnolla.</Text>
      <Text style={[styles.modalText, styles.modalParagraphSpacing]}>Siksi Tähtiliigalla on nyt täysin oma alusta, joka on rakennettu alusta asti vastaamaan mahdollisimman hyvin juuri liigan arkea ja pelaajien tarpeita. Mobiilisovellus on aivan tuota pikaa valmis!</Text>
      <Text style={[styles.modalSubheading, styles.modalParagraphSpacing]}>Kaikki yhdessä paikassa.</Text>
      <Text style={styles.modalText}>Tähtiliigan omalla alustalla hoituu käytännössä kaikki:</Text>
      <Text style={[styles.modalBullet, styles.modalParagraphSpacing]}>⭐️ Ilmoittautuminen liigaan</Text>
      <Text style={styles.modalBullet}>⭐️ Osallistumismaksujen maksaminen</Text>
      <Text style={styles.modalBullet}>⭐️ Uudet lohkot päivittyvät automaattisesti ja uuden oman lohkon chätit avautuvat kierrosten vaihtuessa</Text>
      <Text style={styles.modalBullet}>⭐️ Pelien sopiminen</Text>
      <Text style={styles.modalBullet}>⭐️ Pelien vahvistaminen, lukitseminen ja niiden tarkastelu</Text>
      <Text style={styles.modalBullet}>⭐️ Pelitulosten merkitseminen</Text>
      <Text style={styles.modalBullet}>⭐️ Reaaliaikainen tulostaulukko</Text>
      <Text style={styles.modalBullet}>⭐️ Oman lohkon sekä koko sarjan tilanteen seuraaminen</Text>
      <Text style={styles.modalBullet}>⭐️ Ja paljon muuta</Text>
      <Text style={[styles.modalText, styles.modalParagraphSpacing]}>Näin tuodaan kaikki meidän liigan asiat yhteen paikkaan SIMPPELISTI ja tehdään pelaajien arjesta mahdollisimman vaivatonta. Kaikki Tähtiliigaan liittyvä hoituu siis Tähtiliigan omalla alustalla tai mobiilisovelluksessa. Ei montaa eri järjestelmää, sivua, kaaviota jne.</Text>
      <Text style={[styles.modalText, styles.modalParagraphSpacing]}>Ainoa poikkeus tällä hetkellä on vielä pelivuoron varaaminen, joka hoidetaan normaalisti manuaalisesti hallien omista varausjärjestelmistä.</Text>
      <Text style={[styles.modalText, styles.modalParagraphSpacing]}>Yksi liiga. Yksi alusta. Kaikki samassa paikassa.</Text>
      <Text style={[styles.modalText, styles.modalParagraphSpacing]}>Mahtavaa, eikö! ⭐️</Text>
    </View>
    <View style={styles.modalSection}>
      <Text style={styles.modalHeading}>Jokaisella on mahdollisuus voittaa</Text>
      <Text style={styles.modalText}>Tähtiliigan yksi tärkeimmistä tavoitteista on tehdä kilpailusta aidosti tasaväkistä.</Text>
      <Text style={[styles.modalText, styles.modalParagraphSpacing]}>Koska joukkueet kilpailevat kierroksittain oman tasoisissa lohkoissaan, jokainen kerää pisteitä oman tasoisia vastustajia vastaan. Lohkot elävät siis suuresti jokaisella kierroksella, joten vaihtelevaisuus ja uusien pelituttavuuksien haastaminen on taattua.</Text>
      <Text style={[styles.modalText, styles.modalParagraphSpacing]}>Tähtiliigassa menestyäksesi sinun ei siis tarvitse olla paras maailmassa. Sinun tarvitsee olla paras omalla tasollasi.</Text>
    </View>
    <View style={styles.modalSection}>
      <Text style={styles.modalHeading}>Tähtiliigan suurempi tavoite</Text>
      <Text style={styles.modalText}>Tähtiliiga ei ole meille yksittäinen padel-liiga. Haluamme kehittää suomalaista padelkulttuuria ja niin tulemme myös tekemään!</Text>
      <Text style={[styles.modalText, styles.modalParagraphSpacing]}>Haluamme antaa mahdollisimman monelle padelistille mahdollisuuden kokea kilpailullisen pelaamisen parhaat puolet ilman korkeaa kynnystä osallistua. Omat padelkaverit mukaan ja eikun menoksi!</Text>
      <Text style={[styles.modalText, styles.modalParagraphSpacing]}>Samalla haluamme rakentaa mallin, jossa liigatoiminta on pelaajille helppoa, joustavaa ja mielekästä, mutta samalla palkitsee kaikkia kaupungin padeltoimijoita. Jokainen voi nopeasti laskea mitä esimerkiksi 150 peliä/ kierros mylläävä tähtiliiga tuo lisätuloja kaupungin padeltoimijoille joka kuukausi!</Text>
      <Text style={[styles.modalText, styles.modalParagraphSpacing]}>Haluamme nähdä Suomessa enemmän pelaajia, enemmän pelejä, enemmän yhteisöä ja enemmän kilpailullista padelia. Haluamme viedä hommaa omalta osaltamme eteenpäin ja teemmekin kaikki valintamme se edellä.</Text>
      <Text style={[styles.modalText, styles.modalParagraphSpacing]}>Jos luet tätä viestiä niin tähtiliiga on mitä suuremmin todennäköisyyksin tehty juuri sinun kaltaisia padelisteja varten ja teitä ajatellen. Osallistumalla kaupunkisi liigaan tuet ja kannat oman kortesi kekoon myös yllä mainittujen yhteisten isojen tavoitteiden eteen.</Text>
    </View>
    <View style={styles.modalSection}>
      <Text style={styles.modalHeading}>Eetun oma visio liigan takaa</Text>
      <Text style={styles.modalText}>Tavoitteena ei ole tehdä padelista liian vakavaa. Jäin padelkoukkuun heti ensikosketuksesta 3v sitten ja nautin sen pelaamisesta edelleen. Olen saanut rutkasti uusia ystäviä ja päässyt mukaan mitä mahtavimpaan yhteisöön. Minun mielestä siitä urheilussa on kyse.</Text>
      <Text style={[styles.modalText, styles.modalParagraphSpacing]}>Pelasin paljon, usein samoissa porukoissa ja huomasin sen toistuvan useimmilla pelureilla. Vakkarivuorot, valmennukset ja kisat on tosi kiva lisä normi pelien ympärille, mutta uskon että tosi moni kaipaa pientä porkkanaa tai pientä hyvän maun kisailua silloin tällöin niiden lisäksi. Tai ainakin minä kaipaan. Siitä on muodostunut muutaman mutkan kautta TÄHTILIIGA.</Text>
      <Text style={[styles.modalText, styles.modalParagraphSpacing]}>Tavoitteena siis on tuoda pelaajille tavalliseen padelarkeen pieni kilpailullinen vivahde.</Text>
      <Text style={[styles.modalText, styles.modalParagraphSpacing]}>Tervetuloa mukaan! Tähtiliiga on kaikille, olit sitten ensimmäisiä kuukausiasi pelaava harrastaja tai aktiivisesti kilpaileva oman elämän Augustin Tapia!</Text>
    </View>
    <View style={styles.modalSection}>
      <Text style={styles.modalFootnote}>Ps. 10 pistettä ja tähtiä jos jaksoit lukea tänne asti</Text>
      <Text style={[styles.modalFootnote, styles.modalParagraphSpacing]}>Pps. Jos emme ole julkaisseet liigaa kaupunkiisi, mutta tätä juuri kaupunkisi padelyhteisö kaipaisi, <Text onPress={onContactPress} style={styles.footnoteLink}>ota meihin yhteyttä</Text>!</Text>
    </View>
  </View>;
}

function LeagueRulesContent() {
  return <View>
    <View style={styles.modalSection}>
      <Text style={styles.modalHeading}>Näin Tähtiliiga toimii</Text>
    </View>
    <View style={styles.modalSection}>
      <Text style={styles.modalSubheading}>Tähtiliigan ABC</Text>
      <Text style={styles.modalBullet}>• Nappaa pelikaverisi mukaan ja ilmottautukaa liigaan. Joukkuekoko 2-3 pelaajaa</Text>
      <Text style={styles.modalBullet}>• Liigan ensimmäiset lohkot luodaan järjestäjien puolesta ja liiga starttaa ilmoitettuna ajankohtana</Text>
      <Text style={styles.modalBullet}>• Pelaatte jokaisella kierroksella yhden pelin jokaista lohkonne vastustajaa vastaan. Joka kierros tulee siis 3 peliä. Kierros kestää 26pv joten aikaa pitäisi olla hyvin</Text>
      <Text style={styles.modalBullet}>• Sovitte pelien ajankohdat sekä paikat lohkonne ryhmässä. Tähtiliiga sovellus luo teille automaattisesti lohkonne ryhmän missä voitte jutella.</Text>
      <Text style={styles.modalBullet}>• Käytte pelaamassa pelin, merkkaatte tuloksen tähtiliigan alustalle ja <Text style={{ fontWeight: "800" }}>thats it!</Text></Text>
      <Text style={styles.modalBullet}>• Jos olette kierroksen jälkeen lohkonne toinen tai kolmas, osallistutte karsintakierrokselle. (tarkemmat ohjeet alla)</Text>
      <Text style={styles.modalBullet}>• Eikun mukaan Tähtiliigaan! ⭐️</Text>
    </View>
    <View style={styles.modalSection}>
      <Text style={styles.modalHeading}>Tässä koko liigan säännöt avattuna</Text>
      <Text style={styles.modalText}>Tähtiliiga pelataan joukkuepohjaisena lohkosarjana.</Text>
      <Text style={[styles.modalText, styles.modalParagraphSpacing]}>Joukkueet sijoitetaan ensimmäisellä kierroksella mahdollisimman tasaisiin lohkoihin pelitason perusteella. Tämän jälkeen lohkot elävät joukkueiden menestyksen mukaan.</Text>
      <Text style={[styles.modalText, styles.modalParagraphSpacing]}>Jokaisella kierroksella joukkueet pelaavat oman lohkonsa muita joukkueita vastaan.</Text>
    </View>
    <View style={styles.modalSection}>
      <Text style={styles.modalSubheading}>Joukkueet</Text>
      <Text style={styles.modalBullet}>• Joukkueessa on vähintään 2 pelaajaa ja enintään 3 pelaajaa.</Text>
      <Text style={styles.modalBullet}>• Jokaisella joukkueella on yksi kapteeni. (pääsette valitsemaan automaattisesti tähtiliigan sovelluksesta)</Text>
      <Text style={styles.modalBullet}>• Kapteeni vastaa joukkueen yhteydenpidosta ja otteluiden sopimisesta. (tähtiliiga luo automaattisesti lohkon kapteeneille chätit)</Text>
      <Text style={styles.modalBullet}>• Joukkue saa valita kuhunkin otteluun pelaajat vapaasti omien aikataulujensa mukaan. (jos joukkueesa 3 pelaajaa)</Text>
      <Text style={styles.modalBullet}>• Jos joukkueessa on 3 pelaajaa, jokaisen pelaajan tulee pelata vähintään 3 ottelua liigan aikana.</Text>
    </View>
    <View style={styles.modalSection}>
      <Text style={styles.modalSubheading}>Lohkot</Text>
      <Text style={styles.modalText}>Jokaisessa lohkossa on 4 joukkuetta.</Text>
      <Text style={[styles.modalText, styles.modalParagraphSpacing]}>Ensimmäisen kierroksen lohkojaon tekee Tähtiliigan järjestäjä yhdessä raadin kanssa. Tavoitteena on muodostaa mahdollisimman tasaiset lohkot.</Text>
      <Text style={[styles.modalText, styles.modalParagraphSpacing]}>Kierroksen jälkeen</Text>
      <Text style={styles.modalBullet}>1. sija: nousee suoraan ylempään lohkoon</Text>
      <Text style={styles.modalBullet}>4. sija: putoaa suoraan alempaan lohkoon</Text>
      <Text style={styles.modalBullet}>2. sija: pelaa karsintaottelun ylemmän lohkon 3. sijaa vastaan</Text>
      <Text style={[styles.modalText, styles.modalParagraphSpacing]}>Karsintaottelun voittaja pelaa seuraavalla kierroksella ylemmässä lohkossa.</Text>
      <Text style={[styles.modalText, styles.modalParagraphSpacing]}>Näin lohkot elävät jatkuvasti ja joukkueet löytävät pitkällä aikavälillä mahdollisimman hyvin oman pelitasonsa.</Text>
    </View>
    <View style={styles.modalSection}>
      <Text style={styles.modalSubheading}>Karsintaottelut</Text>
      <Text style={styles.modalText}>Karsintaottelut pelataan erillisellä karsintakierroksella normi kierroksen perään. Karsintakierros on aina vakio 7pv jonka aikana peli tulee pelata.</Text>
      <Text style={[styles.modalText, styles.modalParagraphSpacing]}>Kapteenien tulee sopia ottelu ja huolehtia siitä, että se pelataan määräaikaan mennessä.</Text>
      <Text style={[styles.modalText, styles.modalParagraphSpacing]}>Karsintaottelussa ottelua ei tarvitse pelata kolmatta erää, mikäli toinen joukkue voittaa kaksi ensimmäistä erää. Karsintaottelussa ei jaeta siis pisteitä normi kierroksen pelien tapaan. Haetaan vain voittaja.</Text>
      <Text style={[styles.modalText, styles.modalParagraphSpacing]}>Mikäli ottelua ei saada pelattua, Tähtiliigan järjestäjä ja raati ratkaisevat tilanteen tapauskohtaisesti.</Text>
    </View>
    <View style={styles.modalSection}>
      <Text style={styles.modalSubheading}>Ottelusäännöt</Text>
      <Text style={styles.modalText}>Ottelu koostuu kolmesta erästä.</Text>
      <Text style={[styles.modalBullet, styles.modalParagraphSpacing]}>• Käytössä on Golden Point -sääntö.</Text>
      <Text style={styles.modalBullet}>• Kaikki kolme erää pelataan normaalisti, vaikka ottelun voittaja olisi ratkennut jo kahdessa erässä.</Text>
      <Text style={styles.modalBullet}>• Mikäli aikaa on jäljellä alle 25 minuuttia, kolmas erä pelataan lyhyenä eränä tilanteesta 2–2.</Text>
      <Text style={styles.modalBullet}>• Jos kenttävuoro päättyy kesken ottelun, johdossa oleva joukkue voittaa ottelun.</Text>
      <Text style={styles.modalBullet}>• Otteluun varataan vähintään 90 minuutin kenttävarausta. 120 minuuttia on suositeltava.</Text>
      <Text style={[styles.modalSubheading, styles.modalParagraphSpacing]}>Pisteytys</Text>
      <Text style={styles.modalText}>Jokaisesta voitetusta erästä saa 1 pisteen.</Text>
      <Text style={[styles.modalText, styles.modalParagraphSpacing]}>Lisäksi:</Text>
      <Text style={styles.modalBullet}>• Ottelun voittaja: +2 pistettä</Text>
      <Text style={styles.modalBullet}>• Ottelun häviäjä: +1 piste</Text>
      <Text style={[styles.modalText, styles.modalParagraphSpacing]}>Näin jokaisessa ottelussa on jaossa yhteensä 6 pistettä.</Text>
      <Text style={[styles.modalText, styles.modalParagraphSpacing]}>Lisäksi joukkue voi saada kierroksen lopputuloksesta nousuun tai karsintaan liittyviä lisäpisteitä.</Text>
      <Text style={styles.modalBullet}>• Suora nousu +2p</Text>
      <Text style={styles.modalBullet}>• Karsintapelin voitto +1p</Text>
    </View>
    <View style={styles.modalSection}>
      <Text style={styles.modalSubheading}>Varapelaajasääntö</Text>
      <Text style={styles.modalText}>Tähtiliigan perimmäinen ajatus on saada mahdollisimman moneen peliin juuri ne pelaajat, jotka on ilmoitettu joukkueen jäseniksi. Varapelaaja on tarkoitettu ainoastaan poikkeustilanteisiin, esimerkiksi nopean loukkaantumiseen tai muun pakottavan esteen sattuessa.</Text>
      <Text style={[styles.modalText, styles.modalParagraphSpacing]}>Varapelaajaa saa käyttää vain, jos joukkueesta ei saada vähintään kahta omaa jäsentä paikalle.</Text>
      <Text style={[styles.modalText, styles.modalParagraphSpacing]}>Varapelaaja tulee etsiä seuraavassa järjestyksessä:</Text>
      <Text style={styles.modalBullet}>1. Liigan ulkopuolelta</Text>
      <Text style={styles.modalBullet}>2. Mikäli sopivaa pelaajaa ei löydy, Tähtiliigan alemmista lohkoista</Text>
      <Text style={[styles.modalText, styles.modalParagraphSpacing]}>Varapelaajan tulee:</Text>
      <Text style={styles.modalBullet}>• luoda Tähtiliiga-profiili, mikäli profiilia ei vielä ole</Text>
      <Text style={styles.modalBullet}>• maksaa 5 € varapelaajamaksu kyseisestä ottelusta</Text>
      <Text style={styles.modalBullet}>• tulla lisätyksi kyseiseen otteluun Tähtiliigan app:sta tai tähtiliigan verkkosivuilta kapteenin johdosta</Text>
      <Text style={styles.modalBullet}>• olla näkyvissä ottelun kokoonpanossa sekä vastustajalle että liigan ylläpidolle</Text>
      <Text style={[styles.modalText, styles.modalParagraphSpacing]}>Varapelaajan käytöstä tulee ilmoittaa vastustajan kapteenille ennen ottelua chätissä.</Text>
      <Text style={[styles.modalText, styles.modalParagraphSpacing]}>Varapelaajia ei ole tarkoitettu joukkueen vakituisiksi pelaajiksi.</Text>
      <Text style={[styles.modalText, styles.modalParagraphSpacing]}>Mikäli joukkue käyttää varapelaajaa 4 kertaa tai useammin liigan aikana, järjestäjä ja raati voivat tarkastella tilannetta ja tarvittaessa rajoittaa varapelaajien käyttöä.</Text>
      <Text style={[styles.modalText, styles.modalParagraphSpacing]}>Omat pelaajat ensin, varapelaaja vasta oikeasti tarvittaessa. Varapelaajajärjestelmän tarkoitus on mahdollistaa pelien toteutuminen poikkeustilanteissa. Näin taataan liigan tasaisuus ja ennustettavuus pelaajien keskuudessa parhaalla mahdollisella tavalla.</Text>
    </View>
    <View style={styles.modalSection}>
      <Text style={styles.modalSubheading}>Tasapisteet</Text>
      <Text style={styles.modalText}>Mikäli joukkueet ovat kierroksen jälkeen tasapisteissä, sijoitus ratkaistaan seuraavasti:</Text>
      <Text style={styles.modalBullet}>1. Pelattujen otteluiden määrä</Text>
      <Text style={styles.modalBullet}>2. Keskinäisen ottelun voittaja, mikäli kaksi joukkuetta on tasapisteissä</Text>
      <Text style={styles.modalBullet}>3. Keskinäisten otteluiden geimiero, mikäli tasapisteissä on vähintään kolme joukkuetta</Text>
      <Text style={styles.modalBullet}>4. Tarvittaessa raadin päätös</Text>
    </View>
    <View style={styles.modalSection}>
      <Text style={styles.modalSubheading}>Pelaamatta jättäminen</Text>
      <Text style={styles.modalText}>Mikäli joukkue jättää ottelun pelaamatta, tulos voidaan kirjata seuraavasti:</Text>
      <Text style={styles.modalBullet}>3 peliä pelaamatta: 6–0, 6–0, 6–0</Text>
      <Text style={styles.modalBullet}>2 peliä pelaamatta: 6–0, 6–0, 0–6</Text>
      <Text style={styles.modalBullet}>1 peli pelaamatta: tilanne ratkaistaan ottelukohtaisesti.</Text>
      <Text style={[styles.modalText, styles.modalParagraphSpacing]}>Tähtiliigan järjestäjä ja raati käsittelevät epäselvät ja poikkeukselliset tilanteet tapauskohtaisesti.</Text>
    </View>
    <View style={styles.modalSection}>
      <Text style={styles.modalSubheading}>Pelaajien tasorajoitukset</Text>
      <Text style={styles.modalText}>Tähtiliigan tavoitteena on pitää joukkueiden voimasuhteet mahdollisimman tasaisina.</Text>
      <Text style={[styles.modalText, styles.modalParagraphSpacing]}>Joukkueiden kokoonpanoissa voidaan rajoittaa tiettyjen korkeimpien taitotasojen pelaajien yhdistämistä samaan joukkueeseen.</Text>
      <Text style={[styles.modalText, styles.modalParagraphSpacing]}>Järjestäjällä ja raadilla on oikeus arvioida joukkueiden kokoonpanoja ennen liigan alkua, jotta lohkoista saadaan mahdollisimman kilpailulliset.</Text>
    </View>
    <View style={styles.modalSection}>
      <Text style={styles.modalHeading}>Finaaliviikonloppu</Text>
      <Text style={styles.modalText}>Liigakaudet huipentuu usein järjestetään finaaliviikonloppu.</Text>
      <Text style={[styles.modalText, styles.modalParagraphSpacing]}>Finaaliviikonlopun lohkot muodostuvat viimeisen varsinaisen kierroksen ja karsintojen jälkeisen tilanteen perusteella.</Text>
      <Text style={[styles.modalText, styles.modalParagraphSpacing]}>Jokainen lohko pelaa oman lohkonsa sisäisen turnauksen, jonka perusteella ratkaistaan finaaliviikonlopun sijoitukset ja lohkokohtaiset palkinnot. Jos joukkueesta ei pääse vähintään kahta pelaajaa paikalle, joukkue joutuu luovuttamaan ottelunsa.</Text>
    </View>
    <View style={styles.modalSection}>
      <Text style={styles.modalHeading}>Palkinnot</Text>
      <Text style={styles.modalText}>Tähtiliigan tavoitteena on tarjota jokaiselle joukkueelle tasa-arvoinen mahdollisuus taistella palkinnoista.</Text>
      <Text style={[styles.modalText, styles.modalParagraphSpacing]}>Palkintoja jaetaan sekä koko liigan menestyksen että finaaliviikonlopun sijoitusten perusteella.</Text>
      <Text style={[styles.modalText, styles.modalParagraphSpacing]}>Lisäksi liigan aikana voidaan palkita kuukausittain erityisesti ansioituneita joukkueita ja pelaajia.</Text>
      <Text style={[styles.modalText, styles.modalParagraphSpacing]}>Jokaisen liigakauden palkinnot ja yhteistyökumppanit vaihtelevat. Liigakohtaiset palkinnot ja kannustimet löytyvät aina kyseisen liigan omalta sivulta.</Text>
    </View>
    <View style={styles.modalSection}>
      <Text style={styles.modalHeading}>Raati</Text>
      <Text style={styles.modalText}>Tähtiliigan raati muodostuu liigan osallistujista valituista kapteeneista sekä liigan järjestäjän edustajasta.</Text>
      <Text style={[styles.modalText, styles.modalParagraphSpacing]}>Raadin tehtävänä on käsitellä liigan aikana mahdollisesti syntyviä epäselviä tilanteita ja varmistaa sääntöjen mahdollisimman oikeudenmukainen tulkinta.</Text>
      <Text style={[styles.modalText, styles.modalParagraphSpacing]}>Raadin päätös on lopullinen tilanteissa, joita säännöissä ei ole yksiselitteisesti määritelty.</Text>
      <Text style={[styles.modalText, styles.modalParagraphSpacing]}>Tähtiliigan sääntöjen tärkein tavoite on varmistaa, että liiga pysyy reiluna, kilpailullisena ja hauskana kaikille.</Text>
    </View>
  </View>;
}

function ContactContent() {
  return <View>
    <View style={styles.modalSection}>
      <Text style={styles.modalText}>Onko sinulla kysyttävää Tähtiliigasta?</Text>
      <Text style={[styles.modalText, styles.modalParagraphSpacing]}>Haluatko tietää lisää osallistumisesta, joukkueen perustamisesta, säännöistä tai itse liigakonseptista?</Text>
      <Text style={[styles.modalText, styles.modalParagraphSpacing]}>Ota rohkeasti yhteyttä!</Text>
      <Text style={[styles.modalText, styles.modalParagraphSpacing]}>Tähtiliigan tavoitteena on rakentaa mahdollisimman toimiva ja pelaajalähtöinen liigakonsepti, joten otamme mielellämme vastaan myös palautetta, kehitysideoita ja yhteistyöehdotuksia.</Text>
    </View>
    <View style={styles.modalSection}>
      <Text style={styles.modalSubheading}>Yhteyshenkilö</Text>
      <Text style={styles.modalText}>Eetu Rissanen</Text>
      <Pressable onPress={() => void Linking.openURL("tel:+358442081638")}><Text style={[styles.contactLink, styles.modalParagraphSpacing]}>📞 044 208 1638</Text></Pressable>
      <Pressable onPress={() => void Linking.openURL("mailto:eetu@tähtiliiga.fi")}><Text style={styles.contactLink}>✉️ eetu@tähtiliiga.fi</Text></Pressable>
    </View>
    <View style={styles.modalSection}>
      <Text style={styles.modalText}>Olet sitten pelaaja, kapteeni, padeltoimija tai yhteistyöstä kiinnostunut yritys, laita rohkeasti viestiä.</Text>
      <Text style={[styles.modalFootnote, styles.modalParagraphSpacing]}>Tähtiliigaa rakennetaan yhdessä pelaajien kanssa.</Text>
    </View>
  </View>;
}

const styles = StyleSheet.create({ page: { flex: 1, backgroundColor: colors.canvas }, scroll: { flex: 1 }, content: { paddingBottom: 45 }, body: { padding: 22, paddingTop: 27 }, infoRow: { flexDirection: "row", gap: 10 }, infoButton: { flex: 1, minHeight: 92, alignItems: "center", justifyContent: "center", padding: 10, borderRadius: 14, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line }, infoButtonText: { color: colors.ink, fontSize: 13, fontWeight: "800", textAlign: "center" }, profile: { backgroundColor: colors.green, borderRadius: 14, minHeight: 52, paddingHorizontal: 18, paddingVertical: 14, marginTop: 25, alignItems: "center", justifyContent: "center" }, profileText: { color: colors.surface, fontSize: 14, fontWeight: "800", textAlign: "center" }, settings: { backgroundColor: colors.green, borderRadius: 14, minHeight: 52, paddingHorizontal: 18, paddingVertical: 14, marginTop: 12, alignItems: "center", justifyContent: "center" },admin: { backgroundColor: colors.green, borderRadius: 14, minHeight: 52, paddingHorizontal: 18, paddingVertical: 14, marginTop: 12, alignItems: "center", justifyContent: "center" }, adminLink: { color: colors.lime, fontSize: 14, fontWeight: "800", textAlign: "center" }, logout: { marginTop: 30, padding: 14, alignItems: "center" }, logoutText: { color: colors.coral, fontWeight: "800" }, modalBackdrop: { flex: 1, backgroundColor: "rgba(0, 0, 0, 0.6)" }, modalBackdropTap: { flex: 1 }, modalBox: { backgroundColor: colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: "85%" }, modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, paddingHorizontal: 22, paddingTop: 22, paddingBottom: 8 }, modalTitle: { color: colors.ink, fontSize: 18, fontWeight: "800", flex: 1 }, modalClose: { color: colors.muted, fontSize: 24, fontWeight: "600", lineHeight: 24 }, modalCopy: { color: colors.muted, fontSize: 14, lineHeight: 21, paddingHorizontal: 22, paddingBottom: 34 }, modalContent: { flexGrow: 0 }, modalContentInner: { paddingHorizontal: 22, paddingBottom: 34 }, modalSection: { marginBottom: 18 }, modalHeading: { color: colors.green, fontSize: 14, fontWeight: "900", marginBottom: 8 }, modalText: { color: colors.ink, fontSize: 13, lineHeight: 19 }, modalFootnote: { color: colors.muted, fontSize: 12, lineHeight: 18, fontStyle: "italic" }, modalParagraphSpacing: { marginTop: 10 }, modalSubheading: { color: colors.ink, fontSize: 13, fontWeight: "900", marginBottom: 6 }, modalBullet: { color: colors.ink, fontSize: 13, lineHeight: 19, marginTop: 4 }, contactLink: { color: colors.greenBright, fontSize: 14, fontWeight: "800", marginTop: 6 }, footnoteLink: { color: colors.greenBright, fontWeight: "800", textDecorationLine: "underline" } });