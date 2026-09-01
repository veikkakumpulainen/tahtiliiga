import { ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { colors } from "../theme";

const MOBILE_BREAKPOINT = 760;

export default function PrivacyPolicyScreen() {
  const { width } = useWindowDimensions();
  const isMobile = width < MOBILE_BREAKPOINT;

  const content = [
    { title: "Tietosuojaseloste", subtitle: "Voimassa: 1.9.2026" },
    {
      heading: "1. Rekisterinpitäjä",
      text: "Tähtiliiga\nYhteystiedot: [yhteystiedot]\nSähköposti: [sähköposti]"
    },
    {
      heading: "2. Kerättävät henkilötiedot",
      text: "Rekisteröitymisen yhteydessä keräämme:\n• Etunimi ja sukunimi\n• Sähköpostiosoite\n• Puhelinnumero (valinnainen)\n• Salasana (salattu)\n• Taitotaso (valinnainen)\n• Sukupuoli (valinnainen)\n\nPalvelun käytön yhteydessä keräämme:\n• Joukkueiden jäsenyystiedot\n• Ottelutulosten tiedot\n• Viestipalvelun kautta lähettämät viestit\n• Käyttäytymistiedot ja aktiviteetit\n\nMaksut:\n• Maksutietojen käsittely tapahtuu Stripe-palvelun kautta\n• Emme säilytä korttitietoja omassa järjestelmässämme"
    },
    {
      heading: "3. Tietojen käyttötarkoitus",
      text: "Tietoja käytetään:\n• Käyttäjätilin luomiseen ja hallintaan\n• Palvelun tarjoamiseen (liigat, joukkueet, ottelut)\n• Viestintään käyttäjän kanssa\n• Palvelun parantamiseen ja kehittämiseen\n• Markkinointiviestien lähettämiseen (vain suostumuksella)\n• Maksuprosessin käsittelyyn"
    },
    {
      heading: "4. Oikeusperusta",
      text: "Tietojen käsittelyn oikeusperusta:\n• Sopimuksen täytäntöönpano (tilin luominen)\n• Käyttäjän nimenomainen suostumus (markkinointi)\n• Oikeutetut edut (palvelun parantaminen)"
    },
    {
      heading: "5. Tietojen säilytys",
      text: "Tiedot säilytetään:\n• Koko tilin aktiivisen käyttöajan\n• Tilin poistamisen jälkeen lakisääteisen kauden verran\n• Maksutiedot säilytetään Stripe-palvelussa soveltuvien säädösten mukaisesti"
    },
    {
      heading: "6. Kolmannet osapuolet",
      text: "Tietoja jaetaan:\n• Supabase - tietokannan isäntäpalveluna\n• Stripe - maksuprosessin käsittelyyn\n• Muille kolmansille osapuolille ei jaeta ilman suostumusta"
    },
    {
      heading: "7. Käyttäjän oikeudet",
      text: "Sinulla on oikeus:\n• Saada pääsy omiin tietoihisi\n• Korjata virheelliset tiedot\n• Pyytää tietojen poistamista\n• Vastustaa tietojen käsittelyä\n• Peruuttaa suostumus markkinointiviesteihin\n\nOikeuksien käyttämiseksi ota yhteyttä rekisterinpitäjään."
    },
    {
      heading: "8. Tietoturva",
      text: "Tiedot suojataan:\n• Salatulla yhteydellä (HTTPS)\n• Salasanojen salaus\n• Pääsyn hallinnalla\n• Säännöllisillä turvatarkastuksilla"
    },
    {
      heading: "9. Evästeet",
      text: "Palvelu voi käyttää evästeitä:\n• Istunnon hallintaan\n• Käyttäjätietojen muistamiseen\n• Analyytiikkaan (vapaaehtoinen)"
    },
    {
      heading: "10. GDPR",
      text: "Tietojen käsittely noudattaa EU:n GDPR-asetusta. Tarvittaessa voit tehdä valituksen tietosuojaviranomaiselle."
    },
    {
      heading: "11. Yhteydenotto",
      text: "Tietosuojaan liittyvissä kysymyksissä ota yhteyttä: [yhteystiedot]"
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
