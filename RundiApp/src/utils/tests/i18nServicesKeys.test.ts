import i18n from '../../i18n';

describe('services.* i18n keys', () => {
  it('maxPrice se resuelve e interpola en es', () => {
    i18n.changeLanguage('es');
    expect(i18n.t('services.priceNegotiationService.errors.maxPrice', { value: 5 }))
      .toBe('El precio máximo permitido es C$5.');
  });
  it('también resuelve en en', () => {
    i18n.changeLanguage('en');
    expect(i18n.t('services.priceNegotiationService.errors.maxPrice', { value: 7 }))
      .toBe('The maximum allowed price is C$7.');
  });
});
