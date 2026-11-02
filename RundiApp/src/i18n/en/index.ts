import common from './common';
import authScreens from './authScreens';
import client from './client';
import settings from './settings';
import driver from './driver';
import shared from './shared';

/**
 * Objeto `translation` del locale `en`. Cada archivo del directorio
 * contiene un namespace de nivel superior del árbol de traducciones.
 */
export const en = {
  common,
  authScreens,
  client,
  settings,
  driver,
  shared,
};

export default en;
