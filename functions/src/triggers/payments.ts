import * as functions from "firebase-functions";

export const onPaymentCompleted = functions.firestore
  .document("payments/{paymentId}")
  .onUpdate(async (change, context) => {
    const newData = change.after.data();
    if (newData.status === "completed") {
      console.log(`💰 Pago completado: ${context.params.paymentId}`);
    }
  });
