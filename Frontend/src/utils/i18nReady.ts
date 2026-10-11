import i18n from '../i18n';

// El contenido de una notificación agendada queda congelado al programarla:
// si i18n aún no inicializó, t() devuelve la clave cruda y así se muestra.
export const waitForI18nReady = async (): Promise<void> => {
  if (i18n.isInitialized) return;
  await new Promise<void>((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      try {
        i18n.off('initialized', finish);
      } catch {}
      resolve();
    };
    i18n.on('initialized', finish);
    setTimeout(finish, 4000);
  });
};
