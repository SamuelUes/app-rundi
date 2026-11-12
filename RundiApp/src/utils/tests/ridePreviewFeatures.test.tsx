import React from 'react';
import { RidePreviewClientInfo } from '../../components/driver/RidePreview/RidePreviewClientInfo';

jest.mock('../../components/shared/StorageImage', () => () => null);

function textIn(element: any): string[] {
  if (typeof element === 'string') return [element];
  if (!React.isValidElement(element)) return [];
  return React.Children.toArray((element.props as { children?: React.ReactNode }).children).flatMap(textIn);
}

test('preview displays every feature label and omits badges for rides without features', () => {
  const props = {
    resolvedClientName: 'Cliente', estimatedPrice: 100, clientComment: null, clientProfile: null,
    colors: { text: '#000', textSecondary: '#555', primary: '#000' }, isDark: false,
    formatCurrency: () => '100', onMessageClient: () => {}, onCallClient: () => {},
    styles: {}, t: ((key: string) => key) as any,
  };
  const withFeatures = RidePreviewClientInfo({ ...props, featureLabels: ['Adulto mayor', 'Mascotas'] });
  expect(textIn(withFeatures)).toEqual(expect.arrayContaining(['Adulto mayor', 'Mascotas']));
  const withoutFeatures = RidePreviewClientInfo({ ...props, featureLabels: [] });
  expect(textIn(withoutFeatures)).not.toEqual(expect.arrayContaining(['Adulto mayor']));
});
