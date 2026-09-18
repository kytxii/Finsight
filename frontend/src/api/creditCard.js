import client from './client';
import * as demo from './demoStore';
import { cachedGet } from './offline/cache';
import { offlineCreate, offlineDelete } from './offline/mutate';


// GET endpoints read through the offline cache (#204): last-known response is
// returned immediately and refreshed underneath, so a cold-starting or
// unreachable backend doesn't leave the UI on skeletons.
//
// Only the two flat writes queue offline: creating a plain balance and
// deleting one are each a single row, which is the only shape the outbox
// models. allocate, from-transaction and remove-charge are compound - one
// call producing or rebalancing several rows across payments, charges and
// allocations - so they stay online-only and surface a normal error when
// unreachable, the same line already drawn for
// convertTransactionToTipDeposit.

const isDemo = () => localStorage.getItem('demo') === 'true';

export const getCreditCardPayments = () =>
  isDemo() ? demo.getCreditCardPayments() : cachedGet('creditCardPayments', () => client.get('/credit-card-payments/'));

// Plain balance, no linked transaction - the Credit Cards "+" panel's own
// create flow. Contrast with createPaymentFromTransaction below, which
// anchors the payment to a real, already-recorded transaction.
export const createCreditCardPayment = (totalAmount, paymentDate, dueDate) =>
  isDemo()
    ? demo.createCreditCardPayment(totalAmount, paymentDate, dueDate)
    : offlineCreate({
        url: '/credit-card-payments/',
        cacheKey: 'creditCardPayments',
        data: { total_amount: totalAmount, payment_date: paymentDate, due_date: dueDate ?? null },
        // The server returns a PaymentDetail, not the row as posted: name is
        // assigned server-side and paid/left/charges are derived. A fresh
        // balance has nothing allocated against it yet, so those are known
        // exactly - no guessing, and the values the server sends back on
        // reconnect will match.
        toListItem: (body) => ({
          ...body,
          name: 'Credit Card Payment',
          paid: '0.00',
          left: body.total_amount,
          charges: [],
        }),
      });

export const createPaymentFromTransaction = (transactionId, dueDate) =>
  isDemo()
    ? demo.createCreditCardPaymentFromTransaction(transactionId, dueDate)
    : client.post(`/credit-card-payments/from-transaction/${transactionId}`, null, { params: dueDate ? { due_date: dueDate } : undefined });

export const getCreditCardPayment = (paymentId) =>
  isDemo() ? demo.getCreditCardPayment(paymentId) : cachedGet(`creditCardPayment:${paymentId}`, () => client.get(`/credit-card-payments/${paymentId}`));

export const allocateCreditCardPayment = (paymentId, data) =>
  isDemo() ? demo.allocateCreditCardPayment(paymentId, data) : client.post(`/credit-card-payments/${paymentId}/allocate`, data);

export const deleteCreditCardPayment = (paymentId) =>
  isDemo()
    ? demo.deleteCreditCardPayment(paymentId)
    : offlineDelete({
        url: `/credit-card-payments/${paymentId}`,
        cacheKey: 'creditCardPayments',
        id: paymentId,
      });

// Removes just this payment's allocation toward one charge - the balance
// detail page's own edit mode (#146), distinct from deleting the whole
// payment above.
export const removeChargeFromPayment = (paymentId, chargeId) =>
  isDemo()
    ? demo.removeChargeFromPayment(paymentId, chargeId)
    : client.delete(`/credit-card-payments/${paymentId}/charges/${chargeId}`);
