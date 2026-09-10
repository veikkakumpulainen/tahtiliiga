import { ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { colors } from "../theme";

const MOBILE_BREAKPOINT = 760;

export default function TermsScreen() {
  const { width } = useWindowDimensions();
  const isMobile = width < MOBILE_BREAKPOINT;

  const content = [
    { title: "Käyttöehdot", subtitle: "Voimassa: 1.9.2026" },
    {
      heading: "1. Palvelun kuvaus",
      text: "Tähtiliiga on padeliliigapalvelu, joka mahdollistaa:\n• Joukkueiden muodostamisen\n• Liigaan ilmoittautumisen\n• Ottelutulosten tallentamisen\n• Liigakauden hallinnan"
    },
    {
      heading: "2. Käyttäjätilin käyttö",
      text: "Käyttäjä sitoutuu:\n• Antamaan totuudenmukaisia tietoja rekisteröitymisen yhteydessä\n• Pitämään salasanansa salassa\n• Vastaamaan tilinsä käytöstä\n• Noudattamaan soveltuvaa lainsäädäntöä\n• Kunnioittamaan muiden käyttäjien oikeuksia"
    },
    {
      heading: "3. Kiellettävät toiminnot",
      text: "Käyttäjä ei saa:\n• Väärinkäyttää palvelua tai häiritä muita käyttäjiä\n• Lähettää asiatonta sisältöä tai loukkaavia viestejä\n• Yrittää vahingoittaa palvelun turvallisuutta\n• Kopioida tai levittää palvelun sisältöä ilman lupaa\n• Käyttää botteja tai automatisoituja työkaluja\n• Rekisteröitä väärillä tiedoilla"
    },
    {
      heading: "4. Osallistumismaksut",
      text: "• Osallistumismaksut tulee suorittaa Stripe-palvelun kautta\n• Maksut ovat lopullisia eikä niitä palauteta ilman perustavaa syytä\n• Peruutusten yhteydessä sovelletaan palautuskäytäntöä\n• Maksutiedot käsitellään turvallisesti Stripe-palvelussa"
    },
    {
      heading: "5. Omistajuus ja tekijänoikeudet",
      text: "• Käyttäjän lähettämä sisältö (viestit, kuvat) jää käyttäjän omaksi\n• Tähtiliiga saa oikeuden käyttää sisältöä palvelun kehittämiseen\n• Tekijänoikeuksien loukkaavasta sisällöstä voidaan poistaa tileja\n• Käyttäjä vastaa lähettämänsä sisällön tekijänoikeuksista"
    },
    {
      heading: "6. Vastuunrajoitus",
      text: "Tähtiliiga ei vastaa:\n• Palvelun keskeytymisestä tai viivästymisestä\n• Tietojen menetyksestä\n• Välillisistä tai satunnaisista vahingoista\n• Käyttäjien välisten riitaisuuksien selvittelystä\n\nPalvelu tarjotaan \"sellaisenaan\" ilman takuuta."
    },
    {
      heading: "7. Palvelun muuttaminen",
      text: "Tähtiliiga varaa oikeuden:\n• Muuttaa palvelun sisältöä ja toiminnallisuutta\n• Keskeyttää palvelun kokonaan tai osittain\n• Muuttaa maksut\n• Ilmoittaa muutoksista etukäteen kohtuullisen ajan"
    },
    {
      heading: "8. Käyttäjätilien sulkeminen",
      text: "Tähtiliiga voi sulkea tilin:\n• Jos käyttäjä rikkoo näitä ehtoja\n• Jos käyttäjä harjoittaa väärinkäyttöä\n• Jos käyttäjä ei ole aktiivinen pitkään aikaan\n• Ilman erityistä syytä omasta tahdostaan\n\nSulkemisen jälkeen tiedot poistetaan soveltuvien lakien mukaisesti."
    },
    {
      heading: "9. Vastuuvapauslauseke",
      text: "• Palvelu tarjotaan ilman takuuta saavutettavuudesta tai virheetönsyydestä\n• Käyttäjä käyttää palvelua omalla vastuulla\n• Tähtiliiga ei vastaa tietoturvaloukkuksista kolmansien osapuolten toimesta\n• Käyttäjä vastaa omien tietojensa turvaamisesta"
    },
    {
      heading: "10. Maksut ja laskutus",
      text: "• Maksut käsitellään Stripe-palvelun kautta\n• Maksun epäonnistumisesta käyttäjä saa ilmoituksen\n• Maksamattomat maksut voivat johtaa palvelun rajoitukseen\n• Refundit käsitellään tapauskohtaisesti"
    },
    {
      heading: "11. Muutokset ehtoihin",
      text: "Tähtiliiga voi muuttaa näitä ehtoja:\n• Ilmoittamalla muutoksesta käyttäjälle etukäteen\n• Muutokset astuvat voimaan ilmoituspäivän jälkeen\n• Jatkamalla palvelun käyttöä, käyttäjä hyväksyy muutokset"
    },
    {
      heading: "12. Sovellettava laki ja riitojenratkaisu",
      text: "• Näihin ehtoihin sovelletaan Suomen lakia\n• Riitaisuuksista neuvotellaan ensin sovinnollisesti\n• Jos sopimusta ei synny, asiasta voidaan valittaa tuomioistuimeen"
    },
    {
      heading: "13. Yhteydenotto",
      text: "Kysymyksistä käyttöehdoista: ede.rissanen@gmail.com"
    }
  ];

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={[styles.container, isMobile && styles.containerMobile]}>
        <Text style={styles.mainTitle}>{content[0].title}</Text>
        <Text style={styles.subtitle}>{content[0].subtitle}</Text>

        {content.slice(1).map((section, idx) => (
          <View key={idx} style={styles.section}>
            <Text style={styles.heading}>{section.heading}</Text>
            <Text style={styles.text}>{section.text}</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.canvas },
  content: { paddingBottom: 40 },
  container: { maxWidth: 900, width: "100%", alignSelf: "center", paddingHorizontal: 34, paddingTop: 28 },
  containerMobile: { paddingHorizontal: 16, paddingTop: 16 },
  mainTitle: { color: colors.ink, fontSize: 32, fontWeight: "900", marginBottom: 8 },
  subtitle: { color: colors.muted, fontSize: 14, marginBottom: 24 },
  section: { marginBottom: 24 },
  heading: { color: colors.green, fontSize: 16, fontWeight: "900", marginBottom: 10 },
  text: { color: colors.ink, fontSize: 14, lineHeight: 22 },
});
