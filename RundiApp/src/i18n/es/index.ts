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
  authScreens,
  client,
  settings,
  driver,
  shared,
};

export default es;
