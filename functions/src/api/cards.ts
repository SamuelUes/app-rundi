import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import Stripe from 'stripe';

const stripe = new Stripe(functions.config().stripe?.secret_key || '', {
  apiVersion: '2023-10-16',
});

/**
 * Validar y tokenizar tarjeta
 * Esta función valida los datos de la tarjeta y crea un token seguro
 */
export const validateAndTokenizeCard = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }

  const { cardNumber, expMonth, expYear, cvv, cardholderName, provider = 'stripe' } = data;

  // Validaciones básicas
  if (!cardNumber || !expMonth || !expYear || !cvv || !cardholderName) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Todos los campos de la tarjeta son requeridos'
    );
  }

  try {
    console.log(`💳 Validando tarjeta ${provider}...`);

    if (provider === 'stripe') {
      // Tokenizar con Stripe
      const paymentMethod = await stripe.paymentMethods.create({
        type: 'card',
        card: {
          number: cardNumber.replace(/\s/g, ''), // Remover espacios
          exp_month: parseInt(expMonth),
          exp_year: parseInt(expYear),
          cvc: cvv,
        },
        billing_details: {
          name: cardholderName,
        },
      });

      console.log(`✅ Tarjeta tokenizada exitosamente: ${paymentMethod.id}`);

      return {
        success: true,
        paymentMethodId: paymentMethod.id,
        cardInfo: {
          brand: paymentMethod.card?.brand || 'unknown',
          last4: paymentMethod.card?.last4 || '****',
          expMonth: paymentMethod.card?.exp_month || 0,
          expYear: paymentMethod.card?.exp_year || 0,
          funding: paymentMethod.card?.funding || 'unknown',
          country: paymentMethod.card?.country || 'unknown',
        },
        message: 'Tarjeta validada exitosamente',
      };
    } else if (provider === 'visanet') {
      // Para Visanet, aquí se haría la llamada a su API de tokenización
      // Por ahora, simulamos el proceso
      
      // TODO: Implementar tokenización real de Visanet
      // const visanetResponse = await axios.post('https://api.visanet.com.ni/v1/tokens', {
      //   cardNumber,
      //   expMonth,
      //   expYear,
      //   cvv,
      //   cardholderName
      // });

      // Simulación temporal
      const mockToken = `vis_token_${Date.now()}`;
      
      console.log(`✅ Tarjeta tokenizada con Visanet: ${mockToken}`);

      return {
        success: true,
        paymentMethodId: mockToken,
        cardInfo: {
          brand: detectCardBrand(cardNumber),
          last4: cardNumber.replace(/\s/g, '').slice(-4),
          expMonth: parseInt(expMonth),
          expYear: parseInt(expYear),
          funding: 'unknown',
          country: 'NI',
        },
        message: 'Tarjeta validada exitosamente con Visanet',
      };
    }

    throw new Error('Proveedor no soportado');
  } catch (error: any) {
    console.error('❌ Error validando tarjeta:', error);
    
    // Mensajes de error específicos de Stripe
    if (error.type === 'StripeCardError') {
      throw new functions.https.HttpsError('invalid-argument', error.message);
    }
    
    throw new functions.https.HttpsError('internal', error.message || 'Error al validar la tarjeta');
  }
});

/**
 * Detectar marca de tarjeta por número
 */
function detectCardBrand(cardNumber: string): string {
  const cleaned = cardNumber.replace(/\s/g, '');
  
  if (/^4/.test(cleaned)) return 'visa';
  if (/^5[1-5]/.test(cleaned)) return 'mastercard';
  if (/^3[47]/.test(cleaned)) return 'amex';
  if (/^6(?:011|5)/.test(cleaned)) return 'discover';
  
  return 'unknown';
}

/**
 * Agregar tarjeta a la cuenta del usuario
 * Usa Stripe Payment Methods para tokenizar la tarjeta de forma segura
 */
export const addCard = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }

  const userId = context.auth.uid;
  const { paymentMethodId, provider = 'stripe', setAsDefault = false } = data;

  if (!paymentMethodId) {
    throw new functions.https.HttpsError('invalid-argument', 'paymentMethodId es requerido');
  }

  try {
    console.log(`💳 Agregando tarjeta para usuario ${userId}...`);

    let cardData: any = {};

    if (provider === 'stripe') {
      // Obtener información de la tarjeta desde Stripe
      const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);

      if (paymentMethod.type !== 'card') {
        throw new Error('El método de pago debe ser una tarjeta');
      }

      // Obtener o crear Stripe Customer
      const userDoc = await admin.firestore().collection('users').doc(userId).get();
      const userData = userDoc.data();
      
      let customerId = userData?.stripeCustomerId;
      
      if (!customerId) {
        // Crear nuevo customer en Stripe
        const customer = await stripe.customers.create({
          email: userData?.email || context.auth.token.email,
          metadata: {
            userId: userId,
            name: userData?.name || '',
          },
        });
        
        customerId = customer.id;
        
        // Guardar customerId en Firestore
        await admin.firestore().collection('users').doc(userId).update({
          stripeCustomerId: customerId,
        });
      }

      // Adjuntar payment method al customer
      await stripe.paymentMethods.attach(paymentMethodId, {
        customer: customerId,
      });

      cardData = {
        id: paymentMethodId,
        provider: 'stripe',
        brand: paymentMethod.card?.brand || 'unknown',
        last4: paymentMethod.card?.last4 || '****',
        expMonth: paymentMethod.card?.exp_month || 0,
        expYear: paymentMethod.card?.exp_year || 0,
        funding: paymentMethod.card?.funding || 'unknown', // credit, debit, prepaid
        country: paymentMethod.card?.country || 'unknown',
        fingerprint: paymentMethod.card?.fingerprint || '',
        isDefault: setAsDefault,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      };
    } else if (provider === 'visanet') {
      // Para Visanet, guardar token de tarjeta
      // Visanet proporciona un token después de tokenizar la tarjeta
      cardData = {
        id: paymentMethodId, // Token de Visanet
        provider: 'visanet',
        brand: data.brand || 'unknown',
        last4: data.last4 || '****',
        expMonth: data.expMonth || 0,
        expYear: data.expYear || 0,
        funding: 'unknown',
        country: 'NI',
        isDefault: setAsDefault,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      };
    }

    // Si es la primera tarjeta o se marca como default, actualizar otras tarjetas
    if (setAsDefault) {
      const cardsSnapshot = await admin.firestore()
        .collection('users')
        .doc(userId)
        .collection('cards')
        .where('isDefault', '==', true)
        .get();

      const batch = admin.firestore().batch();
      cardsSnapshot.docs.forEach(doc => {
        batch.update(doc.ref, { isDefault: false });
      });
      await batch.commit();
    }

    // Guardar tarjeta en Firestore
    const cardRef = await admin.firestore()
      .collection('users')
      .doc(userId)
      .collection('cards')
      .add(cardData);

    console.log(`✅ Tarjeta agregada: ${cardRef.id}`);

    return {
      success: true,
      cardId: cardRef.id,
      card: {
        id: cardRef.id,
        ...cardData,
      },
    };
  } catch (error: any) {
    console.error('❌ Error agregando tarjeta:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Obtener tarjetas guardadas del usuario
 */
export const getCards = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }

  const userId = context.auth.uid;

  try {
    const cardsSnapshot = await admin.firestore()
      .collection('users')
      .doc(userId)
      .collection('cards')
      .orderBy('createdAt', 'desc')
      .get();

    const cards = cardsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));

    return {
      success: true,
      cards,
    };
  } catch (error: any) {
    console.error('❌ Error obteniendo tarjetas:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Eliminar tarjeta
 */
export const deleteCard = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }

  const userId = context.auth.uid;
  const { cardId } = data;

  if (!cardId) {
    throw new functions.https.HttpsError('invalid-argument', 'cardId es requerido');
  }

  try {
    console.log(`🗑️ Eliminando tarjeta ${cardId} del usuario ${userId}...`);

    // Obtener tarjeta
    const cardDoc = await admin.firestore()
      .collection('users')
      .doc(userId)
      .collection('cards')
      .doc(cardId)
      .get();

    if (!cardDoc.exists) {
      throw new Error('Tarjeta no encontrada');
    }

    const cardData = cardDoc.data();

    // Si es Stripe, desadjuntar del customer
    if (cardData?.provider === 'stripe') {
      try {
        await stripe.paymentMethods.detach(cardData.id);
      } catch (error) {
        console.warn('⚠️ No se pudo desadjuntar de Stripe:', error);
      }
    }

    // Eliminar de Firestore
    await cardDoc.ref.delete();

    console.log(`✅ Tarjeta eliminada: ${cardId}`);

    return {
      success: true,
      message: 'Tarjeta eliminada exitosamente',
    };
  } catch (error: any) {
    console.error('❌ Error eliminando tarjeta:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Establecer tarjeta como predeterminada
 */
export const setDefaultCard = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }

  const userId = context.auth.uid;
  const { cardId } = data;

  if (!cardId) {
    throw new functions.https.HttpsError('invalid-argument', 'cardId es requerido');
  }

  try {
    console.log(`⭐ Estableciendo tarjeta ${cardId} como predeterminada...`);

    // Desmarcar todas las tarjetas como default
    const cardsSnapshot = await admin.firestore()
      .collection('users')
      .doc(userId)
      .collection('cards')
      .where('isDefault', '==', true)
      .get();

    const batch = admin.firestore().batch();
    cardsSnapshot.docs.forEach(doc => {
      batch.update(doc.ref, { isDefault: false });
    });

    // Marcar la nueva tarjeta como default
    const cardRef = admin.firestore()
      .collection('users')
      .doc(userId)
      .collection('cards')
      .doc(cardId);

    batch.update(cardRef, { isDefault: true });

    await batch.commit();

    console.log(`✅ Tarjeta ${cardId} establecida como predeterminada`);

    return {
      success: true,
      message: 'Tarjeta predeterminada actualizada',
    };
  } catch (error: any) {
    console.error('❌ Error estableciendo tarjeta predeterminada:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Crear Payment Intent usando una tarjeta guardada
 * Nota: Esta función simplemente retorna el paymentMethodId para que el frontend
 * llame a createPaymentIntent con ese paymentMethodId
 */
export const createPaymentIntentWithSavedCard = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }

  const userId = context.auth.uid;
  const { rideId, cardId } = data;

  if (!rideId || !cardId) {
    throw new functions.https.HttpsError('invalid-argument', 'rideId y cardId son requeridos');
  }

  try {
    console.log(`💳 Obteniendo tarjeta guardada ${cardId}...`);

    // Obtener tarjeta
    const cardDoc = await admin.firestore()
      .collection('users')
      .doc(userId)
      .collection('cards')
      .doc(cardId)
      .get();

    if (!cardDoc.exists) {
      throw new Error('Tarjeta no encontrada');
    }

    const cardData = cardDoc.data();
    const paymentMethodId = cardData?.id;
    const provider = cardData?.provider || 'stripe';

    console.log(`✅ Tarjeta encontrada: ${provider} - ${cardData?.brand} **** ${cardData?.last4}`);

    // Retornar información para que el frontend llame a createPaymentIntent
    return {
      success: true,
      paymentMethodId,
      provider,
      cardInfo: {
        brand: cardData?.brand,
        last4: cardData?.last4,
      },
      message: 'Usa estos datos para llamar a createPaymentIntent',
    };
  } catch (error: any) {
    console.error('❌ Error obteniendo tarjeta guardada:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});
