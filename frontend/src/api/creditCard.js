import client from './client';
import * as demo from './demoStore';
import { cachedGet } from './offline/cache';


// GET endpoints read through the offline cache (#204): last-known response is
// returned immediately and refreshed underneath, so a cold-starting or
// unreachable backend doesn't leave the UI on skeletons. Mutations are
// untouched here - they still go straight to the network, and client.js drops
// the cache on every successful write.

const isDemo = () => localStorage.getItem('demo') === 'true';

export const getCreditCardPayments = () =>
  isDemo() ? demo.getCreditCardPayments() : cachedGet('creditCardPayments', () => client.get('/credit-card-payments/'));

// Plain balance, no linked transaction - the Credit Cards "+" panel's own
// create flow. Contrast with createPaymentFromTransaction below, which
// anchors the payment to a real, already-recorded transaction.
export const createCreditCardPayment = (totalAmount, paymentDate, dueDate) =>
  isDemo()
    ? demo.createCreditCardPayment(totalAmount, paymentDate, dueDate)
    : client.post('/credit-card-payments/', { total_amount: totalAmount, payment_date: paymentDate, due_date: dueDate ?? null });

export const createPaymentFromTransaction = (transactionId, dueDate) =>
  isDemo()
    ? demo.createCreditCardPaymentFromTransaction(transactionId, dueDate)
    : client.post(`/credit-card-payments/from-transaction/${transactionId}`, null, { params: dueDate ? { due_date: dueDate } : undefined });

export const getCreditCardPayment = (paymentId) =>
  isDemo() ? demo.getCreditCardPayment(paymentId) : cachedGet(`creditCardPayment:${paymentId}`, () => client.get(`/credit-card-payments/${paymentId}`));

export const allocateCreditCardPayment = (paymentId, data) =>
  isDemo() ? demo.allocateCreditCardPayment(paymentId, data) : client.post(`/credit-card-payments/${paymentId}/allocate`, data);

export const deleteCreditCardPayment = (paymentId) =>
  isDemo() ? demo.deleteCreditCardPayment(paymentId) : client.delete(`/credit-card-payments/${paymentId}`);

// Removes just this payment's allocation toward one charge - the balance
// detail page's own edit mode (#146), distinct from deleting the whole
// payment above.
export const removeChargeFromPayment = (paymentId, chargeId) =>
  isDemo()
    ? demo.removeChargeFromPayment(paymentId, chargeId)
    : client.delete(`/credit-card-payments/${paymentId}/charges/${chargeId}`);
