import common from './common';
import authScreens from './authScreens';
import client from './client';
import settings from './settings';
import driver from './driver';
import shared from './shared';

/**
 * Objeto `translation` del locale `es`. Cada archivo del directorio
 * contiene un namespace de nivel superior del árbol de traducciones.
 */
export const es = {
  common,
  // Los servicios llaman i18n.t('services.X') sin prefijo de namespace;
  // el subárbol vive en common.ts. Alias en raíz para que resuelva.
  services: common.services,
  authScreens,
  client,
  settings,
  driver,
  shared,
};

export default es;
