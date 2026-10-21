import { calculateLine, roundHalfUp } from './engine.js';

// Presentation-only derivations from the existing exact result. No input mutation,
// new ranking rules, unit conversion or use of indicative prices in totals.
export function explainComparison(result) {
  const eligible = result.offers.filter(offer => offer.eligible);
  const excluded = result.offers.filter(offer => !offer.eligible).map(offer => offer.id);
  if (result.best === null || eligible.length < 2) {
    return { kind: 'insufficient', eligible: eligible.map(offer => offer.id), excluded };
  }
  const ordered = [...eligible].sort((a, b) => a.total < b.total ? -1 : a.total > b.total ? 1 : 0);
  const reference = ordered[0], competitor = ordered[1];
  const leaders = ordered.filter(offer => offer.total === result.best).map(offer => offer.id);
  const contributions = {
    goods: competitor.goods - reference.goods,
    shipping: competitor.shipping - reference.shipping,
    fees: competitor.fees - reference.fees,
    discount: reference.discount - competitor.discount
  };
  return {
    kind: leaders.length > 1 ? 'tie' : 'lowest',
    leaders, referenceId: reference.id, competitorId: competitor.id,
    referenceTotal: reference.total, competitorTotal: competitor.total,
    contributions, delta: competitor.total - reference.total, excluded
  };
}

export function previewQuote(item, quote) {
  try {
    const line = calculateLine(item, quote);
    return { kind: 'valid', line, indicativeUnitPrice: quote.basis === 'pack' ? roundHalfUp(line.price, line.pack) : null };
  } catch (error) {
    return { kind: 'invalid', reason: error.message === 'unit' ? 'unit' : 'numbers' };
  }
}

// Format scaled integers without a floating-point conversion. Up to four places
// for the original price or the explicitly indicative per-unit display.
export function decimalText(value, places = 4, lang = 'ru') {
  const scale = 10n ** BigInt(places);
  const fraction = String(value % scale).padStart(places, '0').replace(/0+$/, '');
  return new Intl.NumberFormat(lang === 'ru' ? 'ru-RU' : 'en-GB').format(value / scale) +
    (fraction ? (lang === 'ru' ? ',' : '.') + fraction : '');
}
