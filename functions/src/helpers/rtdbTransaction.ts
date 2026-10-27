import admin from 'firebase-admin';

// transaction() recibe null como guess inicial cuando el path no está en el
// sync tree (`.once()` no lo puebla) y un abort ahí impide el reintento con
// el valor real del servidor. Mantener un listener 'value' durante la
// transacción puebla el cache: el primer guess ya trae el dato real.
export const transactionOnPath = async (path: string, update: (current: any) => any) => {
  const dbRef = admin.database().ref(path);
  await new Promise<void>((resolve, reject) => {
    const onValue = () => resolve();
    const onError = (err: Error) => {
      dbRef.off('value', onValue);
      reject(err);
    };
    dbRef.on('value', onValue, onError);
  });
  try {
    return await dbRef.transaction(update);
  } finally {
    dbRef.off();
  }
};
