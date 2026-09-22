/*
  CJENIK AUTO JABLAN: jedino mjesto gdje se uređuju cijene.
  Iz ovih podataka nastaju tablica na stranici i CSV datoteke (Odluka NN 101/2026).

  NAKON SVAKE PROMJENE CIJENE pokrenite u ovoj mapi:
      node generiraj-cjenik.js
  i objavite (commit + push) prije 8:00 ujutro dana kad promjena vrijedi.

  Cijene se upisuju BEZ PDV-a (kako ih šalje obrt, npr. "45 € + PDV").
  Stranica i CSV automatski prikazuju maloprodajnu cijenu S PDV-om.

  Polja stavke:
    name          naziv usluge
    priceType     "fixed"            = fiksna cijena, obavezni currentPrice i anchorPrice
                  "upon-inspection"  = cijena prema ponudi nakon pregleda (cijene ostaju null)
    currentPrice  trenutna cijena u eurima BEZ PDV-a, broj s točkom (npr. 45.00)
    anchorPrice   sidrena cijena u eurima BEZ PDV-a
    unit          jedinica: "usluga", "sat" ili "kom"
    note          kratka napomena ispod naziva (ili null)
    specialSale   null ako nije akcija, inače naziv posebnog oblika prodaje (npr. "Jesenska akcija")
*/
window.CJENIK = {
  placeholder: false,
  currency: 'EUR',
  vatRate: 25,              // PDV u postocima
  anchorDate: '10.09.2026', // referentni datum sidrene cijene: prikazuje se na stranici i ide u CSV

  // podaci za naziv CSV datoteke (Odluka, točka VI)
  store: {
    type: 'autoservis',
    address: 'VII Retkovec 1/1, 10000 Zagreb',
    code: 'PJ1'
  },

  items: [
    { name: 'Rad na vozilu',                               priceType: 'fixed', currentPrice: 45.00, anchorPrice: 45.00, unit: 'sat', note: null, specialSale: null },
    { name: 'Rad s dijagnostikom',                         priceType: 'fixed', currentPrice: 50.00, anchorPrice: 50.00, unit: 'sat', note: null, specialSale: null },
    { name: 'Montaža, demontaža i balansiranje gume',      priceType: 'fixed', currentPrice: 15.00, anchorPrice: 15.00, unit: 'kom', note: 'Cijena ovisi o veličini felge', specialSale: null },
    { name: 'Špur (geometrija kotača)',                    priceType: 'fixed', currentPrice: 50.00, anchorPrice: 50.00, unit: 'usluga', note: null, specialSale: null },
    { name: 'Punjenje klime',                              priceType: 'fixed', currentPrice: 50.00, anchorPrice: 50.00, unit: 'usluga', note: null, specialSale: null },
    { name: 'Programiranje vozila',                        priceType: 'upon-inspection', currentPrice: null, anchorPrice: null, unit: 'usluga', note: 'Ovisi o vozilu', specialSale: null }
  ]
};

// ── ne mijenjati ispod ──
// maloprodajna cijena s PDV-om, zaokružena na cent (koriste je i stranica i generiraj-cjenik.js)
window.CJENIK.retail = function (net) {
  return Math.round(net * (100 + this.vatRate)) / 100;
};
